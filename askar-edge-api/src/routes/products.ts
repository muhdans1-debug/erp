import { Hono } from 'hono';
import { getDb, type Env } from '../db.ts';
import { tenantMiddleware, type TenantContext } from '../middleware/tenant.ts';
import { requirePosOrManagerAuth } from '../middleware/auth.ts';

export const productsRouter = new Hono<{ Bindings: Env; Variables: TenantContext }>();

// Ensure tenant middleware runs for all productsRouter endpoints
productsRouter.use('*', tenantMiddleware);

/**
 * Fetch Deleted Products (Tombstones for Terminal Cache Purge)
 * Returns items deleted within the last 30 days (or since a specific timestamp)
 */
productsRouter.get('/deleted', async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const since = c.req.query('since');

  try {
    let sql = `SELECT id, barcode, name, deletedAt FROM DeletedProduct WHERE (tenantId = ? OR tenantId IS NULL)`;
    const args: any[] = [tenantId];
    if (since) {
      sql += ` AND datetime(deletedAt) >= datetime(?)`;
      args.push(since);
    }
    sql += ` ORDER BY datetime(deletedAt) DESC LIMIT 1000`;

    const res = await db.execute({ sql, args });
    return c.json({ success: true, count: res.rows.length, deleted: res.rows });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch deleted products', details: err?.message, deleted: [] }, 500);
  }
});

/**
 * Fetch Multi-Store Catalog (Global Master + Branch Overrides)
 */
productsRouter.get('/', async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = c.req.query('storeId') || c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';

  try {
    const res = await db.execute({
      sql: `
        SELECT 
          p.id,
          p.barcode,
          p.name,
          p.name_ar,
          p.plu_code,
          p.category,
          p.purchasePrice,
          p.image_url,
          p.vatRate,
          p.is_weighed_item,
          COALESCE(si.sellingPrice, p.sellingPrice) as sellingPrice,
          COALESCE(si.sellingPrice, p.sellingPrice) as price,
          COALESCE(si.unitCost, p.unitCost, p.purchasePrice) as unitCost,
          COALESCE(si.stockQuantity, p.stockQuantity, 99999) as stockQuantity,
          COALESCE(si.minThreshold, p.minThreshold) as minThreshold,
          COALESCE(si.maxThreshold, p.maxThreshold) as maxThreshold
        FROM Product p
        LEFT JOIN StoreInventory si ON p.id = si.productId AND si.storeId = ?
        WHERE (p.tenantId = ? OR p.tenantId IS NULL)
        ORDER BY p.name ASC
      `,
      args: [storeId, tenantId]
    });

    return c.json({ success: true, count: res.rows.length, storeId, data: res.rows, products: res.rows });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch products', details: err?.message }, 500);
  }
});

/**
 * Selective Curated Quick Products Grid
 * Returns ONLY products explicitly registered in the QuickProduct table.
 * If empty, returns [] so the user has an empty canvas to add their specific items.
 */
productsRouter.get('/quick-products', async (c) => {
  const db = getDb(c.env);
  const storeId = c.req.query('storeId') || c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';

  try {
    const res = await db.execute({
      sql: `
        SELECT 
          p.id, p.barcode, p.name, p.name_ar, p.plu_code, p.image_url,
          COALESCE(qp.category, p.category, 'ESSENTIALS') as category,
          p.vatRate, p.is_weighed_item,
          COALESCE(si.sellingPrice, p.sellingPrice) as sellingPrice,
          COALESCE(si.sellingPrice, p.sellingPrice) as price,
          COALESCE(si.stockQuantity, p.stockQuantity, 99999) as stockQuantity,
          qp.quickColor, qp.sortOrder,
          1 as isQuickProduct
        FROM QuickProduct qp
        JOIN Product p ON qp.productId = p.id OR (p.barcode IS NOT NULL AND qp.productId = p.barcode)
        LEFT JOIN StoreInventory si ON p.id = si.productId AND si.storeId = ?
        ORDER BY qp.sortOrder ASC, p.name ASC
      `,
      args: [storeId]
    });

    return c.json({ success: true, products: res.rows || [] });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch quick products', details: err?.message }, 500);
  }
});

/**
 * Add / Update Quick Product
 */
productsRouter.post('/quick-products/update', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  try {
    const body = await c.req.json();
    const id = body.id || body.productId || body.barcode;
    const category = (body.category || 'ESSENTIALS').toUpperCase();
    const isQuick = body.isQuickProduct !== false;

    if (!id) return c.json({ error: 'Missing product ID or barcode' }, 400);

    if (isQuick) {
      await db.execute({
        sql: `
          INSERT INTO QuickProduct (id, productId, category, quickColor, updatedAt)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(productId) DO UPDATE SET
            category = excluded.category,
            quickColor = COALESCE(excluded.quickColor, QuickProduct.quickColor),
            updatedAt = CURRENT_TIMESTAMP
        `,
        args: [`qp_${id}`, String(id), category, body.quickColor || null]
      });
      return c.json({ success: true, action: 'added', productId: id, category });
    } else {
      await db.execute({
        sql: `DELETE FROM QuickProduct WHERE productId = ? OR id = ?`,
        args: [String(id), `qp_${id}`]
      });
      return c.json({ success: true, action: 'removed', productId: id });
    }
  } catch (err: any) {
    return c.json({ error: 'Failed to update quick product', details: err?.message }, 500);
  }
});

/**
 * Remove Quick Product
 */
productsRouter.post('/quick-products/remove', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  try {
    const body = await c.req.json();
    const id = body.id || body.productId || body.barcode;
    if (!id) return c.json({ error: 'Missing product ID' }, 400);

    await db.execute({
      sql: `DELETE FROM QuickProduct WHERE productId = ? OR id = ?`,
      args: [String(id), `qp_${id}`]
    });
    return c.json({ success: true, removed: true, productId: id });
  } catch (err: any) {
    return c.json({ error: 'Failed to remove quick product', details: err?.message }, 500);
  }
});

/**
 * Swap Quick Products positions
 */
productsRouter.post('/quick-products/swap', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  try {
    const body = await c.req.json();
    const { sourceId, targetId } = body;
    if (!sourceId || !targetId) return c.json({ error: 'sourceId and targetId required' }, 400);

    const sRow = await db.execute({
      sql: `SELECT sortOrder FROM QuickProduct WHERE productId = ? OR id = ? LIMIT 1`,
      args: [String(sourceId), `qp_${sourceId}`]
    });
    const tRow = await db.execute({
      sql: `SELECT sortOrder FROM QuickProduct WHERE productId = ? OR id = ? LIMIT 1`,
      args: [String(targetId), `qp_${targetId}`]
    });

    if (sRow.rows.length > 0 && tRow.rows.length > 0) {
      const sOrder = sRow.rows[0].sortOrder;
      const tOrder = tRow.rows[0].sortOrder;

      await db.execute({
        sql: `UPDATE QuickProduct SET sortOrder = ? WHERE productId = ? OR id = ?`,
        args: [tOrder, String(sourceId), `qp_${sourceId}`]
      });
      await db.execute({
        sql: `UPDATE QuickProduct SET sortOrder = ? WHERE productId = ? OR id = ?`,
        args: [sOrder, String(targetId), `qp_${targetId}`]
      });
      return c.json({ success: true, swapped: true });
    }
    return c.json({ error: 'Items not found in QuickProduct table' }, 404);
  } catch (err: any) {
    return c.json({ error: 'Swap failed', details: err?.message }, 500);
  }
});

/**
 * Quick Categories
 */
productsRouter.get('/quick-categories', async (c) => {
  const db = getDb(c.env);
  try {
    const res = await db.execute(`
      SELECT DISTINCT category FROM QuickProduct WHERE category IS NOT NULL AND category != ''
      UNION SELECT 'ALL'
      ORDER BY category ASC
    `);
    let categories = res.rows.map((r: any) => r.category).filter(Boolean);
    if (!categories.includes('ALL')) categories = ['ALL', ...categories];
    return c.json({ success: true, categories });
  } catch {
    return c.json({ success: true, categories: ['ALL', 'PRODUCE', 'BAKERY', 'DAIRY', 'ESSENTIALS'] });
  }
});

/**
 * Text Search Endpoint (/api/products/search?q=...)
 */
productsRouter.get('/search', async (c) => {
  const db = getDb(c.env);
  const q = (c.req.query('q') || '').trim();
  const storeId = c.req.query('storeId') || c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';

  try {
    const res = await db.execute({
      sql: `
        SELECT 
          p.*,
          COALESCE(si.sellingPrice, p.sellingPrice) as sellingPrice,
          COALESCE(si.sellingPrice, p.sellingPrice) as price,
          COALESCE(si.stockQuantity, p.stockQuantity, 99999) as stockQuantity,
          COALESCE(si.unitCost, p.unitCost) as unitCost
        FROM Product p
        LEFT JOIN StoreInventory si ON p.id = si.productId AND si.storeId = ?
        WHERE p.name LIKE ? OR p.barcode LIKE ? OR p.id LIKE ?
        ORDER BY p.name ASC
        LIMIT 50
      `,
      args: [storeId, `%${q}%`, `%${q}%`, `%${q}%`]
    });

    return c.json({ success: true, products: res.rows, data: res.rows });
  } catch (err: any) {
    return c.json({ error: 'Search failed', details: err?.message }, 500);
  }
});

/**
 * Direct Barcode Lookup Endpoint (/api/products/barcode/:barcode)
 */
productsRouter.get('/barcode/:barcode', async (c) => {
  const db = getDb(c.env);
  const barcode = c.req.param('barcode');
  const storeId = c.req.query('storeId') || c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';

  try {
    const res = await db.execute({
      sql: `
        SELECT 
          p.*,
          COALESCE(si.sellingPrice, p.sellingPrice) as sellingPrice,
          COALESCE(si.sellingPrice, p.sellingPrice) as price,
          COALESCE(si.stockQuantity, p.stockQuantity, 99999) as stockQuantity,
          COALESCE(si.unitCost, p.unitCost) as unitCost
        FROM Product p
        LEFT JOIN StoreInventory si ON p.id = si.productId AND si.storeId = ?
        WHERE p.barcode = ? OR p.id = ?
        LIMIT 1
      `,
      args: [storeId, barcode, barcode]
    });

    if (!res.rows || res.rows.length === 0) {
      return c.json({ error: 'Product not found' }, 404);
    }

    return c.json({ success: true, product: res.rows[0], data: res.rows[0] });
  } catch (err: any) {
    return c.json({ error: 'Failed to find product by barcode', details: err?.message }, 500);
  }
});

/**
 * Dedicated Fresh Produce & Daily Vegetables Endpoint
 * Returns all produce, weighed items, and vegetables with their yesterday's prices & margins
 */
productsRouter.get('/produce', async (c) => {
  const db = getDb(c.env);
  const storeId = c.req.query('storeId') || c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';

  try {
    const res = await db.execute({
      sql: `
        SELECT 
          p.id,
          p.name,
          p.name_ar,
          p.barcode,
          p.plu_code,
          p.image_url,
          COALESCE(si.sellingPrice, p.sellingPrice, 0.0) as sellingPrice,
          COALESCE(si.unitCost, p.purchasePrice, p.unitCost, 0.0) as purchasePrice,
          COALESCE(si.unitCost, p.unitCost, p.purchasePrice, 0.0) as unitCost,
          COALESCE(si.stockQuantity, p.stockQuantity, 0) as stockQuantity,
          p.is_weighed_item,
          p.category,
          p.updatedAt,
          (
            SELECT h.oldPrice 
            FROM ProductPriceHistory h 
            WHERE h.productId = p.id 
            ORDER BY h.createdAt DESC 
            LIMIT 1
          ) as previousPrice,
          (
            SELECT h.oldCost 
            FROM ProductPriceHistory h 
            WHERE h.productId = p.id 
            ORDER BY h.createdAt DESC 
            LIMIT 1
          ) as previousCost,
          (
            SELECT h.createdAt 
            FROM ProductPriceHistory h 
            WHERE h.productId = p.id 
            ORDER BY h.createdAt DESC 
            LIMIT 1
          ) as lastPriceChangeDate
        FROM Product p
        LEFT JOIN StoreInventory si ON p.id = si.productId AND si.storeId = ?
        WHERE (p.is_weighed_item = 1 OR p.is_weighed_item = true)
        ORDER BY 
          CASE WHEN p.plu_code IS NOT NULL AND p.plu_code != '' THEN 0 ELSE 1 END,
          CAST(p.plu_code AS INTEGER) ASC,
          p.name ASC
      `,
      args: [storeId]
    });

    const items = (res.rows || []).map((row: any) => {
      const sell = Number(row.sellingPrice || 0);
      const cost = Number(row.purchasePrice || row.unitCost || 0);
      const prev = row.previousPrice !== null && row.previousPrice !== undefined ? Number(row.previousPrice) : sell;
      const profitPerKg = Math.round((sell - cost) * 1000) / 1000;
      const margin = sell > 0 ? Math.round(((sell - cost) / sell) * 1000) / 10 : 0;
      const priceDelta = Math.round((sell - prev) * 1000) / 1000;

      return {
        id: String(row.id),
        name: String(row.name),
        name_ar: row.name_ar || null,
        nameAr: row.name_ar || null,
        barcode: row.barcode ? String(row.barcode) : '',
        plu_code: row.plu_code ? String(row.plu_code) : null,
        pluCode: row.plu_code ? String(row.plu_code) : null,
        image_url: row.image_url || null,
        imageUrl: row.image_url || null,
        sellingPrice: sell,
        purchasePrice: cost,
        unitCost: cost,
        stockQuantity: Number(row.stockQuantity || 0),
        is_weighed_item: Boolean(row.is_weighed_item),
        category: row.category || 'PRODUCE',
        previousPrice: prev,
        previousCost: row.previousCost !== null ? Number(row.previousCost) : cost,
        marginPercent: margin,
        profitPerKg,
        priceDelta,
        updatedAt: row.updatedAt,
        lastPriceChangeDate: row.lastPriceChangeDate
      };
    });

    return c.json({ success: true, count: items.length, items });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch produce items', details: err?.message }, 500);
  }
});

/**
 * High-Speed Batch Daily Produce Price & Wastage Update
 */
productsRouter.post('/produce/batch-update', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = c.req.query('storeId') || c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';

  try {
    const body = await c.req.json();
    const updates: any[] = body.updates || [];
    const changeReason = body.reason || 'Daily Morning Produce Market Adjustment';
    const changedBy = body.changedBy || 'Store Manager';

    if (!Array.isArray(updates) || updates.length === 0) {
      return c.json({ error: 'No updates provided' }, 400);
    }

    const batchStatements: { sql: string; args: any[] }[] = [];

    for (const item of updates) {
      const pid = String(item.id).trim();
      const newSell = Number(item.sellingPrice || 0);
      const newCost = Number(item.purchasePrice !== undefined ? item.purchasePrice : item.unitCost || 0);
      const oldSell = Number(item.oldPrice || item.previousPrice || newSell);
      const oldCost = Number(item.oldCost || newCost);
      const wastageKg = Number(item.wastageKg || 0);
      const pluCode = item.plu_code !== undefined ? (item.plu_code ? String(item.plu_code).trim() : null) : undefined;
      const imageUrl = item.image_url !== undefined ? (item.image_url ? String(item.image_url).trim() : null) : undefined;
      const nameAr = item.name_ar !== undefined ? (item.name_ar ? String(item.name_ar).trim() : null) : undefined;

      // 1. Update Product table
      const sets = ['sellingPrice = ?', 'purchasePrice = ?', 'unitCost = ?', 'updatedAt = CURRENT_TIMESTAMP'];
      const args: any[] = [newSell, newCost, newCost];
      if (pluCode !== undefined) { sets.push('plu_code = ?'); args.push(pluCode); }
      if (imageUrl !== undefined) { sets.push('image_url = ?'); args.push(imageUrl); }
      if (nameAr !== undefined) { sets.push('name_ar = ?'); args.push(nameAr); }
      args.push(pid);

      batchStatements.push({
        sql: `UPDATE Product SET ${sets.join(', ')} WHERE id = ?`,
        args
      });

      // 2. Update StoreInventory table
      batchStatements.push({
        sql: `INSERT INTO StoreInventory (id, tenantId, storeId, productId, sellingPrice, unitCost, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(storeId, productId) DO UPDATE SET
                sellingPrice = excluded.sellingPrice,
                unitCost = excluded.unitCost,
                updated_at = CURRENT_TIMESTAMP`,
        args: [`si_${storeId}_${pid}`, tenantId, storeId, pid, newSell, newCost]
      });

      // 3. Record in ProductPriceHistory if price or cost changed
      if (Math.abs(newSell - oldSell) > 0.0001 || Math.abs(newCost - oldCost) > 0.0001) {
        const histId = `pph_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        batchStatements.push({
          sql: `INSERT INTO ProductPriceHistory (id, tenantId, productId, productName, oldPrice, newPrice, oldCost, newCost, changeReason, changedBy, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          args: [histId, tenantId, pid, item.name || pid, oldSell, newSell, oldCost, newCost, changeReason, changedBy]
        });
      }

      // 4. Record Wastage if wastageKg > 0
      if (wastageKg > 0) {
        const wasteId = `wst_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const totalLoss = Math.round(wastageKg * newCost * 1000) / 1000;
        batchStatements.push({
          sql: `INSERT INTO WastageLog (id, tenantId, productId, productName, quantity, reason, unitCost, totalLoss, loggedBy, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          args: [wasteId, tenantId, pid, item.name || pid, wastageKg, 'Perishable Spoilage / Rotten Produce', newCost, totalLoss, changedBy]
        });
      }
    }

    // Execute in atomic batches
    const CHUNK_SIZE = 100;
    for (let i = 0; i < batchStatements.length; i += CHUNK_SIZE) {
      const chunk = batchStatements.slice(i, i + CHUNK_SIZE);
      await db.batch(chunk, 'write');
    }

    return c.json({
      success: true,
      message: `Successfully updated ${updates.length} produce items in central database`,
      updatedCount: updates.length,
      timestamp: Date.now()
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to batch update produce prices', details: err?.message }, 500);
  }
});

/**
 * Single Item Fast Update for Short Code (PLU), Picture, Arabic Name & Weighted Status
 */
productsRouter.post('/produce/update-item', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = c.req.query('storeId') || c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';

  try {
    const body = await c.req.json();
    const id = String(body.id || '').trim();
    if (!id) return c.json({ error: 'Product ID required' }, 400);

    const pluCode = body.plu_code !== undefined ? (body.plu_code ? String(body.plu_code).trim() : null) : undefined;
    const imageUrl = body.image_url !== undefined ? (body.image_url ? String(body.image_url).trim() : null) : undefined;
    const name = body.name ? String(body.name).trim() : undefined;
    const nameAr = body.name_ar !== undefined ? (body.name_ar ? String(body.name_ar).trim() : null) : undefined;
    const sellingPrice = body.sellingPrice !== undefined ? Number(body.sellingPrice) : undefined;
    const purchasePrice = body.purchasePrice !== undefined ? Number(body.purchasePrice) : undefined;
    const isWeighed = body.is_weighed_item !== undefined ? (body.is_weighed_item ? 1 : 0) : undefined;

    const sets: string[] = ['updatedAt = CURRENT_TIMESTAMP'];
    const args: any[] = [];
    if (pluCode !== undefined) { sets.push('plu_code = ?'); args.push(pluCode); }
    if (imageUrl !== undefined) { sets.push('image_url = ?'); args.push(imageUrl); }
    if (name !== undefined) { sets.push('name = ?'); args.push(name); }
    if (nameAr !== undefined) { sets.push('name_ar = ?'); args.push(nameAr); }
    if (sellingPrice !== undefined) { sets.push('sellingPrice = ?'); args.push(sellingPrice); }
    if (purchasePrice !== undefined) { sets.push('purchasePrice = ?'); args.push(purchasePrice); sets.push('unitCost = ?'); args.push(purchasePrice); }
    if (isWeighed !== undefined) { sets.push('is_weighed_item = ?'); args.push(isWeighed); }
    args.push(id);

    await db.execute({
      sql: `UPDATE Product SET ${sets.join(', ')} WHERE id = ?`,
      args
    });

    if (isWeighed === 0) {
      await db.execute({
        sql: `DELETE FROM QuickProduct WHERE productId = ? OR id = ?`,
        args: [id, `qp_${id}`]
      }).catch(() => {});
    }

    if (sellingPrice !== undefined) {
      await db.execute({
        sql: `INSERT INTO StoreInventory (id, tenantId, storeId, productId, sellingPrice, unitCost, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(storeId, productId) DO UPDATE SET
                sellingPrice = excluded.sellingPrice,
                unitCost = COALESCE(excluded.unitCost, unitCost),
                updated_at = CURRENT_TIMESTAMP`,
        args: [`si_${storeId}_${id}`, tenantId, storeId, id, sellingPrice, purchasePrice || 0]
      });
    }

    return c.json({
      success: true,
      message: 'Item updated successfully',
      id,
      plu_code: pluCode,
      image_url: imageUrl,
      name_ar: nameAr,
      sellingPrice
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to update produce item', details: err?.message }, 500);
  }
});

/**
 * 1-Click Quick Add Produce Item
 */
productsRouter.post('/produce/add', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = c.req.query('storeId') || c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';

  try {
    const body = await c.req.json();
    const name = String(body.name || '').trim();
    if (!name) return c.json({ error: 'Product name required' }, 400);

    const id = body.id || `veg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const barcode = body.barcode ? String(body.barcode).trim() : id;
    const pluCode = body.plu_code ? String(body.plu_code).trim() : null;
    const imageUrl = body.image_url ? String(body.image_url).trim() : null;
    const nameAr = body.name_ar ? String(body.name_ar).trim() : null;
    const sellingPrice = Number(body.sellingPrice || 0);
    const purchasePrice = Number(body.purchasePrice || 0);
    const unitCost = Number(body.unitCost || purchasePrice);
    const isWeighed = body.is_weighed_item !== undefined ? Boolean(body.is_weighed_item) : true;
    const category = 'PRODUCE';
    const vatRate = 0.0; // Zero VAT on basic food in Bahrain

    await db.execute({
      sql: `INSERT INTO Product (id, tenantId, barcode, name, name_ar, plu_code, image_url, sellingPrice, purchasePrice, unitCost, stockQuantity, minThreshold, maxThreshold, category, vatRate, is_weighed_item, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 9999, 10, 100, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              name_ar = excluded.name_ar,
              plu_code = excluded.plu_code,
              image_url = excluded.image_url,
              barcode = excluded.barcode,
              sellingPrice = excluded.sellingPrice,
              purchasePrice = excluded.purchasePrice,
              unitCost = excluded.unitCost,
              category = excluded.category,
              vatRate = excluded.vatRate,
              is_weighed_item = excluded.is_weighed_item,
              updatedAt = CURRENT_TIMESTAMP`,
      args: [id, tenantId, barcode, name, nameAr, pluCode, imageUrl, sellingPrice, purchasePrice, unitCost, category, vatRate, isWeighed ? 1 : 0]
    });

    if (pluCode && isWeighed) {
      await db.execute({
        sql: `INSERT INTO QuickProduct (id, productId, category, sortOrder, updatedAt)
              VALUES (?, ?, 'PRODUCE', ?, CURRENT_TIMESTAMP)
              ON CONFLICT(productId) DO UPDATE SET
                category = excluded.category,
                sortOrder = excluded.sortOrder,
                updatedAt = CURRENT_TIMESTAMP`,
        args: [
          `qp_${id}`,
          id,
          parseInt(pluCode, 10) || 50
        ]
      }).catch(() => {});
    }

    await db.execute({
      sql: `INSERT INTO StoreInventory (id, tenantId, storeId, productId, sellingPrice, unitCost, stockQuantity, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 9999, CURRENT_TIMESTAMP)
            ON CONFLICT(storeId, productId) DO UPDATE SET
              sellingPrice = excluded.sellingPrice,
              unitCost = excluded.unitCost,
              updated_at = CURRENT_TIMESTAMP`,
      args: [`si_${storeId}_${id}`, tenantId, storeId, id, sellingPrice, unitCost]
    });

    return c.json({
      success: true,
      product: {
        id,
        name,
        barcode,
        sellingPrice,
        purchasePrice,
        unitCost,
        is_weighed_item: isWeighed,
        category
      }
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to add produce item', details: err?.message }, 500);
  }
});

/**
 * Bulk Upsert Products - Protected & High-Speed Batched LibSQL execution
 */
productsRouter.post('/bulk-upsert', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';

  try {
    const body = await c.req.json();
    const products: any[] = body.products || [];
    const batchStatements: { sql: string; args: any[] }[] = [];

    for (const p of products) {
      const id = p.id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const barcode = (p.barcode || id).trim();
      const name = (p.name || '').trim();
      const sellingPrice = Number(p.sellingPrice || p.price || 0);
      const purchasePrice = Number(p.purchasePrice || p.unitCost || 0);
      const unitCost = Number(p.unitCost || purchasePrice);
      const stockQuantity = Number(p.stockQuantity || 0);
      const category = p.category || 'GROCERY';
      const minThreshold = Number(p.minThreshold || 10);
      const maxThreshold = Number(p.maxThreshold || 100);
      const vatRate = p.vatRate !== undefined ? Number(p.vatRate) : 10.0;
      const isWeighed = Boolean(p.is_weighed_item);

      // Remove from tombstone if re-created
      batchStatements.push({
        sql: `DELETE FROM DeletedProduct WHERE id = ? OR (barcode IS NOT NULL AND barcode = ?)`,
        args: [id, barcode]
      });

      batchStatements.push({
        sql: `INSERT INTO Product (id, tenantId, barcode, name, sellingPrice, purchasePrice, unitCost, stockQuantity, minThreshold, maxThreshold, category, vatRate, is_weighed_item, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                barcode = excluded.barcode,
                sellingPrice = excluded.sellingPrice,
                unitCost = excluded.unitCost,
                purchasePrice = excluded.purchasePrice,
                stockQuantity = excluded.stockQuantity,
                minThreshold = excluded.minThreshold,
                maxThreshold = excluded.maxThreshold,
                category = excluded.category,
                vatRate = excluded.vatRate,
                is_weighed_item = excluded.is_weighed_item,
                updatedAt = CURRENT_TIMESTAMP`,
        args: [id, tenantId, barcode, name, sellingPrice, purchasePrice, unitCost, stockQuantity, minThreshold, maxThreshold, category, vatRate, isWeighed ? 1 : 0]
      });

      batchStatements.push({
        sql: `INSERT INTO StoreInventory (id, tenantId, storeId, productId, stockQuantity, sellingPrice, unitCost, minThreshold, maxThreshold, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(storeId, productId) DO UPDATE SET
                stockQuantity = excluded.stockQuantity,
                sellingPrice = excluded.sellingPrice,
                unitCost = excluded.unitCost,
                minThreshold = excluded.minThreshold,
                maxThreshold = excluded.maxThreshold,
                updated_at = CURRENT_TIMESTAMP`,
        args: [`si_${storeId}_${id}`, tenantId, storeId, id, stockQuantity, sellingPrice, unitCost, minThreshold, maxThreshold]
      });
    }

    // Execute in atomic chunks of 100 statements
    const CHUNK_SIZE = 100;
    for (let i = 0; i < batchStatements.length; i += CHUNK_SIZE) {
      const chunk = batchStatements.slice(i, i + CHUNK_SIZE);
      await db.batch(chunk, 'write');
    }

    return c.json({ success: true, count: products.length, batchedStatements: batchStatements.length });
  } catch (err: any) {
    return c.json({ error: 'Bulk upsert failed', details: err?.message, success: false }, 500);
  }
});

/**
 * Bulk Update Products - Protected & High-Speed Batched LibSQL execution
 */
productsRouter.post('/bulk-update', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const storeId = c.req.query('storeId') || c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';

  try {
    const body = await c.req.json();
    const productIds: string[] = body.productIds || [];
    const action = body.action;
    const value = Number(body.value || 0);

    const batchStatements: { sql: string; args: any[] }[] = [];

    for (const pid of productIds) {
      if (action === 'PERCENT_INCREASE_PRICE') {
        batchStatements.push({
          sql: `UPDATE Product SET sellingPrice = ROUND(sellingPrice * (1 + ? / 100.0), 3), updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
          args: [value, pid]
        });
        batchStatements.push({
          sql: `UPDATE StoreInventory SET sellingPrice = ROUND(sellingPrice * (1 + ? / 100.0), 3), updated_at = CURRENT_TIMESTAMP WHERE productId = ? AND storeId = ?`,
          args: [value, pid, storeId]
        });
      } else if (action === 'PERCENT_DECREASE_PRICE') {
        batchStatements.push({
          sql: `UPDATE Product SET sellingPrice = ROUND(sellingPrice * (1 - ? / 100.0), 3), updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
          args: [value, pid]
        });
        batchStatements.push({
          sql: `UPDATE StoreInventory SET sellingPrice = ROUND(sellingPrice * (1 - ? / 100.0), 3), updated_at = CURRENT_TIMESTAMP WHERE productId = ? AND storeId = ?`,
          args: [value, pid, storeId]
        });
      } else if (action === 'SET_MARGIN') {
        batchStatements.push({
          sql: `UPDATE Product SET sellingPrice = ROUND(COALESCE(unitCost, purchasePrice, 0) / (1.0 - (? / 100.0)), 3), updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
          args: [value, pid]
        });
        batchStatements.push({
          sql: `UPDATE StoreInventory SET sellingPrice = ROUND(COALESCE(unitCost, 0) / (1.0 - (? / 100.0)), 3), updated_at = CURRENT_TIMESTAMP WHERE productId = ? AND storeId = ?`,
          args: [value, pid, storeId]
        });
      }
    }

    const CHUNK_SIZE = 100;
    for (let i = 0; i < batchStatements.length; i += CHUNK_SIZE) {
      const chunk = batchStatements.slice(i, i + CHUNK_SIZE);
      await db.batch(chunk, 'write');
    }

    return c.json({ success: true, updatedCount: productIds.length, batchedStatements: batchStatements.length });
  } catch (err: any) {
    return c.json({ error: 'Failed to bulk update', details: err?.message, success: false }, 500);
  }
});

/**
 * Bulk Delete Products - Protected & High-Speed Batched LibSQL execution
 */
productsRouter.post('/bulk-delete', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  try {
    const body = await c.req.json();
    const productIds: string[] = body.productIds || [];
    if (productIds.length === 0) {
      return c.json({ success: true, deletedCount: 0 });
    }

    const batchStatements: { sql: string; args: any[] }[] = [];

    for (const pid of productIds) {
      // Record tombstone
      batchStatements.push({
        sql: `INSERT INTO DeletedProduct (id, barcode, tenantId, name, deletedAt)
              VALUES (?, (SELECT barcode FROM Product WHERE id = ? OR barcode = ? LIMIT 1), ?, (SELECT name FROM Product WHERE id = ? OR barcode = ? LIMIT 1), CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO UPDATE SET deletedAt = CURRENT_TIMESTAMP`,
        args: [pid, pid, pid, tenantId, pid, pid]
      });
      batchStatements.push({ sql: `DELETE FROM QuickProduct WHERE productId = ? OR id = ?`, args: [pid, `qp_${pid}`] });
      batchStatements.push({ sql: `DELETE FROM StoreInventory WHERE productId = ?`, args: [pid] });
      batchStatements.push({ sql: `DELETE FROM ProductPriceHistory WHERE productId = ?`, args: [pid] });
      batchStatements.push({ sql: `DELETE FROM Product WHERE id = ? OR barcode = ?`, args: [pid, pid] });
    }

    const CHUNK_SIZE = 100;
    for (let i = 0; i < batchStatements.length; i += CHUNK_SIZE) {
      const chunk = batchStatements.slice(i, i + CHUNK_SIZE);
      await db.batch(chunk, 'write');
    }

    return c.json({ success: true, deletedCount: productIds.length, batchedStatements: batchStatements.length });
  } catch (err: any) {
    return c.json({ error: 'Bulk delete failed', details: err?.message, success: false }, 500);
  }
});

/**
 * Create New Product (Global Master + Branch Inventory Allocation)
 */
productsRouter.post('/', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';

  try {
    const body = await c.req.json();
    const id = body.id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const barcode = (body.barcode || id).trim();
    const name = (body.name || '').trim();
    const sellingPrice = Number(body.sellingPrice || body.price || 0);
    const purchasePrice = Number(body.purchasePrice || body.unitCost || 0);
    const unitCost = Number(body.unitCost || purchasePrice);
    const stockQuantity = Number(body.stockQuantity ?? 99999);
    const category = body.category || 'GROCERY';
    const vatRate = body.vatRate !== undefined ? Number(body.vatRate) : 10.0;
    const isWeighed = Boolean(body.is_weighed_item);

    // 0. Remove from DeletedProduct if previously tombstoned
    await db.execute({
      sql: `DELETE FROM DeletedProduct WHERE id = ? OR (barcode IS NOT NULL AND barcode = ?)`,
      args: [id, barcode]
    });

    // 1. Insert into Master Product Catalog
    await db.execute({
      sql: `INSERT INTO Product (
              id, tenantId, barcode, name, sellingPrice, purchasePrice,
              unitCost, stockQuantity, category, vatRate, is_weighed_item, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              barcode = excluded.barcode,
              sellingPrice = excluded.sellingPrice,
              unitCost = excluded.unitCost,
              purchasePrice = excluded.purchasePrice,
              stockQuantity = excluded.stockQuantity,
              category = excluded.category,
              vatRate = excluded.vatRate,
              is_weighed_item = excluded.is_weighed_item,
              updatedAt = CURRENT_TIMESTAMP`,
      args: [id, tenantId, barcode, name, sellingPrice, purchasePrice, unitCost, stockQuantity, category, vatRate, isWeighed ? 1 : 0]
    });

    // 2. Insert into StoreInventory for active store
    await db.execute({
      sql: `INSERT INTO StoreInventory (
              id, tenantId, storeId, productId, stockQuantity, sellingPrice, unitCost, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(storeId, productId) DO UPDATE SET
              stockQuantity = excluded.stockQuantity,
              sellingPrice = excluded.sellingPrice,
              unitCost = excluded.unitCost,
              updated_at = CURRENT_TIMESTAMP`,
      args: [`si_${storeId}_${id}`, tenantId, storeId, id, stockQuantity, sellingPrice, unitCost]
    });

    return c.json({ success: true, product: { id, barcode, name, sellingPrice, stockQuantity, storeId } }, 201);
  } catch (err: any) {
    return c.json({ error: 'Failed to create product', details: err?.message }, 500);
  }
});

/**
 * Product Thresholds
 */
productsRouter.put('/:identifier/thresholds', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const storeId = String(c.req.query('storeId') || c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01');
  const id = String(c.req.param('identifier') || '');
  try {
    const body = await c.req.json();
    const minThreshold = Number(body.minThreshold || 0);
    const maxThreshold = Number(body.maxThreshold || 0);

    await db.execute({
      sql: `UPDATE Product SET minThreshold = ?, maxThreshold = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? OR barcode = ?`,
      args: [minThreshold, maxThreshold, id, id]
    });
    await db.execute({
      sql: `UPDATE StoreInventory SET minThreshold = ?, maxThreshold = ?, updated_at = CURRENT_TIMESTAMP WHERE (productId = ? OR productId IN (SELECT id FROM Product WHERE barcode = ?)) AND storeId = ?`,
      args: [minThreshold, maxThreshold, id, id, storeId]
    });

    return c.json({ success: true, minThreshold, maxThreshold });
  } catch (err: any) {
    return c.json({ error: 'Failed to update thresholds', details: err?.message }, 500);
  }
});

/**
 * Price History
 */
productsRouter.get('/:identifier/price-history', async (c) => {
  return c.json({ success: true, history: [] });
});

/**
 * Update Product Handler
 */
const handleUpdateProduct = async (c: any) => {
  const db = getDb(c.env);
  const storeId = c.req.query('storeId') || c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';
  const id = c.req.param('identifier');

  try {
    const body = await c.req.json();
    const updates: string[] = [];
    const args: any[] = [];

    // Check master product exists
    const existingRes = await db.execute({
      sql: `SELECT * FROM Product WHERE id = ? OR barcode = ? LIMIT 1`,
      args: [id, id]
    });
    if (!existingRes.rows || existingRes.rows.length === 0) {
      return c.json({ error: 'Product not found', success: false }, 404);
    }
    const realId = String(existingRes.rows[0].id);

    // Update Product table fields if present
    if (body.name !== undefined) { updates.push('name = ?'); args.push(body.name); }
    if (body.barcode !== undefined) { updates.push('barcode = ?'); args.push(body.barcode); }
    if (body.category !== undefined) { updates.push('category = ?'); args.push(body.category); }
    if (body.vatRate !== undefined) { updates.push('vatRate = ?'); args.push(Number(body.vatRate)); }
    if (body.sellingPrice !== undefined) { updates.push('sellingPrice = ?'); args.push(Number(body.sellingPrice)); }
    if (body.price !== undefined) { updates.push('sellingPrice = ?'); args.push(Number(body.price)); }
    if (body.purchasePrice !== undefined) { updates.push('purchasePrice = ?'); args.push(Number(body.purchasePrice)); }
    if (body.unitCost !== undefined) { updates.push('unitCost = ?'); args.push(Number(body.unitCost)); }
    if (body.stockQuantity !== undefined) { updates.push('stockQuantity = ?'); args.push(Number(body.stockQuantity)); }
    if (body.minThreshold !== undefined) { updates.push('minThreshold = ?'); args.push(Number(body.minThreshold)); }
    if (body.maxThreshold !== undefined) { updates.push('maxThreshold = ?'); args.push(Number(body.maxThreshold)); }
    if (body.is_weighed_item !== undefined) { updates.push('is_weighed_item = ?'); args.push(body.is_weighed_item ? 1 : 0); }

    if (updates.length > 0) {
      updates.push("updatedAt = CURRENT_TIMESTAMP");
      args.push(realId);
      await db.execute({
        sql: `UPDATE Product SET ${updates.join(', ')} WHERE id = ?`,
        args
      });
    }

    // Update StoreInventory table
    const invUpdates: string[] = [];
    const invArgs: any[] = [];
    if (body.sellingPrice !== undefined || body.price !== undefined) {
      invUpdates.push('sellingPrice = ?');
      invArgs.push(Number(body.sellingPrice !== undefined ? body.sellingPrice : body.price));
    }
    if (body.unitCost !== undefined || body.purchasePrice !== undefined) {
      invUpdates.push('unitCost = ?');
      invArgs.push(Number(body.unitCost !== undefined ? body.unitCost : body.purchasePrice));
    }
    if (body.stockQuantity !== undefined) {
      invUpdates.push('stockQuantity = ?');
      invArgs.push(Number(body.stockQuantity));
    }
    if (body.minThreshold !== undefined) {
      invUpdates.push('minThreshold = ?');
      invArgs.push(Number(body.minThreshold));
    }
    if (body.maxThreshold !== undefined) {
      invUpdates.push('maxThreshold = ?');
      invArgs.push(Number(body.maxThreshold));
    }

    if (invUpdates.length > 0) {
      invUpdates.push("updated_at = CURRENT_TIMESTAMP");
      invArgs.push(storeId, realId);
      await db.execute({
        sql: `UPDATE StoreInventory SET ${invUpdates.join(', ')} WHERE storeId = ? AND productId = ?`,
        args: invArgs
      });
    }

    // Return the updated product
    const updatedRes = await db.execute({
      sql: `
        SELECT 
          p.*,
          COALESCE(si.sellingPrice, p.sellingPrice) as sellingPrice,
          COALESCE(si.sellingPrice, p.sellingPrice) as price,
          COALESCE(si.stockQuantity, p.stockQuantity, 99999) as stockQuantity,
          COALESCE(si.unitCost, p.unitCost) as unitCost,
          COALESCE(si.minThreshold, p.minThreshold) as minThreshold,
          COALESCE(si.maxThreshold, p.maxThreshold) as maxThreshold
        FROM Product p
        LEFT JOIN StoreInventory si ON p.id = si.productId AND si.storeId = ?
        WHERE p.id = ?
        LIMIT 1
      `,
      args: [storeId, realId]
    });

    return c.json({ success: true, product: updatedRes.rows[0], data: updatedRes.rows[0] });
  } catch (err: any) {
    return c.json({ error: 'Failed to update product', details: err?.message, success: false }, 500);
  }
};

/**
 * Delete Product Handler
 */
const handleDeleteProduct = async (c: any) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const id = c.req.param('identifier');

  try {
    // 1. Fetch existing product to obtain its real ID, barcode, and name
    const existing = await db.execute({
      sql: `SELECT id, barcode, name, tenantId FROM Product WHERE id = ? OR barcode = ? LIMIT 1`,
      args: [id, id]
    });

    const realId = existing.rows.length > 0 ? String(existing.rows[0].id) : String(id);
    const barcode = existing.rows.length > 0 ? String(existing.rows[0].barcode || '') : '';
    const name = existing.rows.length > 0 ? String(existing.rows[0].name || '') : '';
    const prodTenant = existing.rows.length > 0 ? String(existing.rows[0].tenantId || tenantId) : tenantId;

    // 2. Insert into DeletedProduct tombstone table
    await db.execute({
      sql: `INSERT INTO DeletedProduct (id, barcode, tenantId, name, deletedAt)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET deletedAt = CURRENT_TIMESTAMP`,
      args: [realId, barcode || null, prodTenant, name]
    });

    // 3. Delete from QuickProduct, StoreInventory, ProductPriceHistory
    await db.execute({
      sql: `DELETE FROM QuickProduct WHERE productId = ? OR productId = ? OR id = ?`,
      args: [realId, barcode || realId, `qp_${realId}`]
    }).catch(() => {});

    await db.execute({
      sql: `DELETE FROM StoreInventory WHERE productId = ? OR productId = ?`,
      args: [realId, barcode || realId]
    }).catch(() => {});

    await db.execute({
      sql: `DELETE FROM ProductPriceHistory WHERE productId = ?`,
      args: [realId]
    }).catch(() => {});

    // 4. Delete from Product
    await db.execute({
      sql: `DELETE FROM Product WHERE id = ? OR barcode = ?`,
      args: [realId, realId]
    });

    return c.json({ success: true, message: `Product ${realId} deleted successfully`, id: realId, barcode });
  } catch (err: any) {
    return c.json({ error: 'Failed to delete product', details: err?.message, success: false }, 500);
  }
};

/**
 * Bind Barcode to Existing Product
 */
const handleBindBarcode = async (c: any) => {
  const db = getDb(c.env);
  const productId = c.req.param('identifier');
  try {
    const body = await c.req.json();
    const barcode = (body.barcode || '').trim();
    if (!barcode) {
      return c.json({ error: 'Barcode is required' }, 400);
    }

    // Check if barcode is already taken by another product
    const conflict = await db.execute({
      sql: `SELECT id, name FROM Product WHERE barcode = ? AND id != ? LIMIT 1`,
      args: [barcode, productId]
    });
    if (conflict.rows && conflict.rows.length > 0) {
      return c.json({ error: `Barcode already assigned to ${conflict.rows[0].name}` }, 409);
    }

    await db.execute({
      sql: `UPDATE Product SET barcode = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [barcode, productId]
    });

    return c.json({ success: true, message: 'Barcode bound successfully', productId, barcode });
  } catch (err: any) {
    return c.json({ error: 'Failed to bind barcode', details: err?.message, success: false }, 500);
  }
};

productsRouter.post('/:identifier/bind-barcode', requirePosOrManagerAuth, handleBindBarcode);
productsRouter.put('/:identifier', requirePosOrManagerAuth, handleUpdateProduct);
productsRouter.post('/:identifier', requirePosOrManagerAuth, handleUpdateProduct);
productsRouter.post('/:identifier/update', requirePosOrManagerAuth, handleUpdateProduct);
productsRouter.delete('/:identifier', requirePosOrManagerAuth, handleDeleteProduct);
productsRouter.post('/:identifier/delete', requirePosOrManagerAuth, handleDeleteProduct);

/**
 * Fetch Single Product by Barcode or ID
 */
productsRouter.get('/:identifier', async (c) => {
  const db = getDb(c.env);
  const identifier = c.req.param('identifier');
  const storeId = c.req.query('storeId') || c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';

  try {
    const res = await db.execute({
      sql: `
        SELECT 
          p.*,
          COALESCE(si.sellingPrice, p.sellingPrice) as sellingPrice,
          COALESCE(si.sellingPrice, p.sellingPrice) as price,
          COALESCE(si.stockQuantity, p.stockQuantity, 99999) as stockQuantity,
          COALESCE(si.unitCost, p.unitCost) as unitCost
        FROM Product p
        LEFT JOIN StoreInventory si ON p.id = si.productId AND si.storeId = ?
        WHERE p.id = ? OR p.barcode = ?
        LIMIT 1
      `,
      args: [storeId, identifier, identifier]
    });

    if (!res.rows || res.rows.length === 0) {
      return c.json({ error: 'Product not found' }, 404);
    }

    return c.json({ success: true, product: res.rows[0] });
  } catch (err: any) {
    return c.json({ error: 'Failed to find product', details: err?.message }, 500);
  }
});
