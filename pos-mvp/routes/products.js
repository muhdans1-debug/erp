import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { db, dataDir } from '../db.js';
import { managerAuth } from '../middleware/auth.js';
import { mirrorProductToCloud, mirrorProductTombstoneToCloud } from '../services/cloudSync.js';

export default async function productRoutes(fastify, options) {
  const uploadsStaticDir = path.join(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(uploadsStaticDir)) {
    fs.mkdirSync(uploadsStaticDir, { recursive: true });
  }

  // Persistent Quick Products Configuration
  const QUICK_CONFIG_FILE = path.join(dataDir, 'quick_products_config.json');

  const loadQuickConfig = () => {
    try {
      if (fs.existsSync(QUICK_CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(QUICK_CONFIG_FILE, 'utf-8'));
      }
    } catch (e) {
      // fallback
    }
    return { overrides: {}, removedIds: [] };
  };

  const saveQuickConfig = (config) => {
    try {
      const tmpFile = `${QUICK_CONFIG_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2), 'utf-8');
      fs.renameSync(tmpFile, QUICK_CONFIG_FILE);
    } catch (e) {
      fastify.log.error('Error saving quick config:', e);
    }
  };

  // 1. Zero-Heap Hardware Photo Upload Endpoint (Feitian F100 PIM) - Hardened against Path Traversal & Shells
  const ALLOWED_PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  fastify.post('/api/products/upload-photo', { preHandler: managerAuth }, async (request, reply) => {
    try {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file attached' });
      }

      const rawBarcode = (data.fields?.barcode?.value || request.query?.barcode || '').trim();
      const cleanBarcode = rawBarcode.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);

      const productUploadsDir = path.resolve(uploadsStaticDir, 'products');
      if (!fs.existsSync(productUploadsDir)) {
        fs.mkdirSync(productUploadsDir, { recursive: true });
      }

      const rawExt = (path.extname(data.filename) || '.jpg').toLowerCase();
      if (!ALLOWED_PHOTO_EXTS.has(rawExt)) {
        return reply.status(400).send({ error: 'Invalid file type. Only JPG, PNG, and WEBP images are allowed.' });
      }

      const ext = rawExt === '.jpeg' ? '.jpg' : rawExt;
      const fileName = `prod_${cleanBarcode || 'f100'}_${Date.now()}${ext}`;
      const filePath = path.resolve(productUploadsDir, fileName);

      // Verify safe path containment
      if (!filePath.startsWith(productUploadsDir)) {
        return reply.status(403).send({ error: 'Path traversal detected. Upload rejected.' });
      }

      await pipeline(data.file, fs.createWriteStream(filePath));
      const publicUrl = `/uploads/products/${fileName}`;

      if (cleanBarcode) {
        try {
          await db.execute({
            sql: `UPDATE Product SET image_url = ?, updatedAt = CURRENT_TIMESTAMP WHERE barcode = ? OR id = ?`,
            args: [publicUrl, cleanBarcode, cleanBarcode]
          });
        } catch {}
      }

      return { success: true, url: publicUrl, fileName };
    } catch (err) {
      fastify.log.error('Photo upload error:', err);
      return reply.status(500).send({ error: 'Upload failed', message: err.message });
    }
  });

  // 2. Catalog listing routes
  fastify.get('/products', async () => {
    return await db.orm.Product.all();
  });

  fastify.get('/api/products', async () => {
    const [products, distributors] = await Promise.all([
      db.orm.Product.all(),
      db.orm.Distributor.all()
    ]);
    const distMap = new Map(distributors.map(d => [d.id, d]));
    return products.map(p => ({
      ...p,
      distributor: p.distributorId ? distMap.get(p.distributorId) || null : null
    }));
  });

  // 3. Quick Products Grid
  fastify.get('/api/quick-products', async () => {
    try {
      const allProducts = await db.orm.Product.all();
      const config = loadQuickConfig();
      const removedSet = new Set((config.removedIds || []).map(String));

      // NEW: Offload the 7-day velocity calculation entirely to SQLite
      const salesCountByProduct = {};
      try {
        const velocityRes = await db.execute({
          sql: `SELECT i.productId, SUM(i.quantity) as totalQty
                FROM SaleItem i
                JOIN Sale s ON i.saleId = s.id
                WHERE s.createdAt >= datetime('now', '-7 days')
                  AND (s.status IS NULL OR s.status NOT IN ('VOIDED', 'CANCELLED'))
                GROUP BY i.productId`,
          args: []
        });
        (velocityRes.rows || []).forEach(row => {
          salesCountByProduct[row.productId] = Number(row.totalQty || 0);
        });
      } catch (e) {
        console.warn('Velocity query warning:', e?.message);
      }

      const categorize = (prod) => {
        const name = (prod.name || '').toLowerCase();
        if (name.includes('mutton') || name.includes('beef') || name.includes('meat') || name.includes('chicken')) {
          return 'MEAT';
        }
        if (name.includes('bread') || name.includes('khubz') || name.includes('samoli') || name.includes('croissant') || name.includes('bun')) {
          return 'BAKERY';
        }
        if (name.includes('milk') || name.includes('laban') || name.includes('feta') || name.includes('cheese') || name.includes('butter') || name.includes('dairy') || name.includes('yogurt')) {
          return 'DAIRY';
        }
        if (name.includes('tomato') || name.includes('cucumber') || name.includes('banana') || name.includes('onion') || name.includes('potato') || name.includes('mint') || name.includes('parsley') || name.includes('lemon') || name.includes('orange') || name.includes('apple')) {
          return 'PRODUCE';
        }
        return 'ESSENTIALS';
      };

      const eligibleProducts = allProducts.filter((p) => {
        if (removedSet.has(String(p.id)) || (p.barcode && removedSet.has(String(p.barcode)))) {
          return false;
        }
        const override = config.overrides ? (config.overrides[p.id] || (p.barcode ? config.overrides[p.barcode] : null)) : null;
        if (override?.isQuickProduct === false) {
          return false;
        }
        return true;
      });

      const scored = eligibleProducts.map((p) => {
        const override = config.overrides ? (config.overrides[p.id] || (p.barcode ? config.overrides[p.barcode] : null)) : null;
        const recentQty = salesCountByProduct[p.id] || 0;
        const isNonBarcoded = !p.barcode || p.barcode.trim() === '';
        const isScale = p.isScaleItem || (p.barcode && (p.barcode.startsWith('20') || p.barcode.startsWith('001')));
        const isExplicitQuick = override?.isQuickProduct === true;
        const priorityBonus = (isExplicitQuick ? 5000 : 0) + (isNonBarcoded ? 60 : (isScale ? 30 : 0));
        return {
          ...p,
          category: override?.category || categorize(p),
          quickColor: override?.quickColor || null,
          isQuickProduct: true,
          score: recentQty * 2 + priorityBonus,
        };
      });

      // Explicit pinned items come first, then top velocity products up to 60 slots
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, 60);
    } catch (err) {
      fastify.log.error(err);
      return [];
    }
  });

  fastify.post('/api/quick-products/update', async (request, reply) => {
    const { id, barcode, category, quickColor, isQuickProduct } = request.body || {};
    if (!id && !barcode) {
      return reply.status(400).send({ error: 'Missing product id or barcode' });
    }
    const config = loadQuickConfig();
    const targetId = String(id || barcode);
    config.overrides = config.overrides || {};
    config.removedIds = config.removedIds || [];

    if (isQuickProduct === false) {
      config.overrides[targetId] = { ...config.overrides[targetId], isQuickProduct: false };
      if (!config.removedIds.includes(targetId)) config.removedIds.push(targetId);
      if (id && !config.removedIds.includes(String(id))) config.removedIds.push(String(id));
      if (barcode && !config.removedIds.includes(String(barcode))) config.removedIds.push(String(barcode));
    } else {
      config.removedIds = config.removedIds.filter((item) => item !== targetId && item !== String(id) && (!barcode || item !== String(barcode)));
      config.overrides[targetId] = {
        ...config.overrides[targetId],
        isQuickProduct: true,
        category: category || config.overrides[targetId]?.category || 'ESSENTIALS',
        quickColor: quickColor !== undefined ? quickColor : config.overrides[targetId]?.quickColor
      };
      if (id && barcode) {
        config.overrides[String(barcode)] = { ...config.overrides[targetId] };
      }
    }
    saveQuickConfig(config);

    // Non-blocking mirror to Cloudflare Edge API
    try {
      fetch('https://askar-edge-api.layali-askar-pos.workers.dev/api/quick-products/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, barcode, category, quickColor, isQuickProduct })
      }).catch(() => {});
    } catch {}

    return { success: true, message: 'Quick product updated successfully', config: config.overrides[targetId] };
  });

  fastify.post('/api/quick-products/swap', async (request, reply) => {
    const { oldId, newId, category, quickColor } = request.body || {};
    if (!oldId || !newId) {
      return reply.status(400).send({ error: 'Missing oldId or newId' });
    }
    const config = loadQuickConfig();
    config.overrides = config.overrides || {};
    config.removedIds = config.removedIds || [];

    const oldKey = String(oldId);
    config.overrides[oldKey] = { ...config.overrides[oldKey], isQuickProduct: false };
    if (!config.removedIds.includes(oldKey)) config.removedIds.push(oldKey);

    const newKey = String(newId);
    config.removedIds = config.removedIds.filter((item) => item !== newKey);
    config.overrides[newKey] = {
      isQuickProduct: true,
      category: category || config.overrides[oldKey]?.category || 'ESSENTIALS',
      quickColor: quickColor || config.overrides[oldKey]?.quickColor || null
    };

    saveQuickConfig(config);

    // Non-blocking mirror to Cloudflare Edge API
    try {
      fetch('https://askar-edge-api.layali-askar-pos.workers.dev/api/quick-products/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldId, newId, category, quickColor })
      }).catch(() => {});
    } catch {}

    return { success: true, message: `Swapped ${oldId} with ${newId}` };
  });

  fastify.post('/api/quick-products/remove', async (request, reply) => {
    const { id, barcode } = request.body || {};
    const targetId = String(id || barcode || '');
    if (!targetId) {
      return reply.status(400).send({ error: 'Missing id or barcode' });
    }
    const config = loadQuickConfig();
    config.overrides = config.overrides || {};
    config.removedIds = config.removedIds || [];

    config.overrides[targetId] = { ...config.overrides[targetId], isQuickProduct: false };
    if (!config.removedIds.includes(targetId)) config.removedIds.push(targetId);
    if (id && !config.removedIds.includes(String(id))) config.removedIds.push(String(id));
    if (barcode && !config.removedIds.includes(String(barcode))) config.removedIds.push(String(barcode));

    saveQuickConfig(config);

    // Non-blocking mirror to Cloudflare Edge API
    try {
      fetch('https://askar-edge-api.layali-askar-pos.workers.dev/api/quick-products/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, barcode })
      }).catch(() => {});
    } catch {}

    return { success: true, message: `Removed ${targetId} from quick products` };
  });

  const DEFAULT_QUICK_CATEGORIES = [
    { id: 'ALL', label: 'All Items', color: 'slate' },
    { id: 'PRODUCE', label: 'Produce 🥦', color: 'emerald' },
    { id: 'BAKERY', label: 'Bakery 🥖', color: 'amber' },
    { id: 'DAIRY', label: 'Dairy 🥛', color: 'sky' },
    { id: 'MEAT', label: 'Meat / Deli 🥩', color: 'rose' },
    { id: 'ESSENTIALS', label: 'Essentials ⚡', color: 'slate' }
  ];

  fastify.get('/api/quick-categories', async () => {
    const config = loadQuickConfig();
    return {
      success: true,
      categories: config.categories && Array.isArray(config.categories) && config.categories.length > 0
        ? config.categories
        : DEFAULT_QUICK_CATEGORIES
    };
  });

  fastify.post('/api/quick-categories', async (request, reply) => {
    const { categories } = request.body || {};
    if (!categories || !Array.isArray(categories)) {
      return reply.status(400).send({ error: 'Categories array is required' });
    }
    const config = loadQuickConfig();
    config.categories = categories;
    saveQuickConfig(config);
    return { success: true, message: 'Quick categories updated successfully', categories };
  });

  // 4. Product Search & Barcode Lookup (High-Speed Parameterized SQL with Limit)
  fastify.get('/api/products/search', async (request) => {
    const { distributorId, q = '' } = request.query || {};
    const query = q.toLowerCase().trim();
    const searchPattern = `%${query}%`;

    let sql = `
      SELECT p.*, d.name as distributorName, d.contactEmail as distributorEmail, d.whatsappNumber as distributorPhone
      FROM Product p
      LEFT JOIN Distributor d ON p.distributorId = d.id
    `;
    const args = [];
    const conditions = [];

    if (distributorId) {
      conditions.push(`p.distributorId = ?`);
      args.push(distributorId);
    }

    if (query) {
      conditions.push(`(LOWER(p.name) LIKE ? OR LOWER(p.id) LIKE ? OR LOWER(p.barcode) LIKE ?)`);
      args.push(searchPattern, searchPattern, searchPattern);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` ORDER BY p.name ASC LIMIT 50`;

    const res = await db.execute({ sql, args });

    return (res.rows || []).map((p) => ({
      ...p,
      unitCost: Number(p.purchasePrice || p.unitCost || 1.0),
      distributor: p.distributorId ? {
        id: p.distributorId,
        name: p.distributorName || p.supplierName || 'Distributor',
        contactEmail: p.distributorEmail || p.supplierEmail || null,
        whatsappNumber: p.distributorPhone || null
      } : null
    }));
  });

  fastify.get('/api/products/barcode/:barcode', async (request, reply) => {
    const { barcode } = request.params;
    const clean = String(barcode || '').trim().toLowerCase();
    if (!clean) return reply.status(400).send({ error: 'Barcode is required' });

    const prodRes = await db.execute({
      sql: `SELECT * FROM Product WHERE LOWER(barcode) = ? OR LOWER(id) = ? LIMIT 1`,
      args: [clean, clean]
    });
    const found = prodRes.rows?.[0];
    if (!found) return reply.status(404).send({ error: 'Product not found' });

    let dist = null;
    if (found.distributorId) {
      const distRes = await db.execute({
        sql: `SELECT * FROM Distributor WHERE id = ? LIMIT 1`,
        args: [found.distributorId]
      });
      dist = distRes.rows?.[0] || null;
    }
    return { ...found, distributor: dist };
  });

  // 5. Bulk CSV Upsert (Protected by managerAuth)
  fastify.post('/api/products/bulk-upsert', { preHandler: managerAuth }, async (request, reply) => {
    const { products } = request.body || {};
    if (!Array.isArray(products) || products.length === 0) {
      return reply.status(400).send({ error: 'No products provided' });
    }

    const allDistributors = await db.orm.Distributor.all();
    const distByName = new Map(allDistributors.map(d => [d.name.toLowerCase().trim(), d]));
    const defaultDist = allDistributors[0]?.id || 'dist_local';

    let createdCount = 0;
    let updatedCount = 0;

    await db.transaction(async (tx) => {
      for (const p of products) {
        const pid = String(p.id || p.barcode || crypto.randomUUID()).trim();
        const existing = await tx.orm.Product.where({ id: pid }).all().first();

        let distId = p.distributorId;
        if (!distId && p.supplierName) {
          const matched = distByName.get(String(p.supplierName).toLowerCase().trim());
          if (matched) distId = matched.id;
        }
        if (!distId) distId = defaultDist;

        const cost = Number(p.purchasePrice || p.costPrice || p.unitCost || 0);
        const sell = Number(p.sellingPrice || p.price || 0);
        const finalVat = p.vatRate !== undefined ? Number(p.vatRate) : 10.0;
        const finalTax = p.taxRate !== undefined ? Number(p.taxRate) : finalVat / 100.0;

        const prodRecord = {
          name: p.name || 'Unnamed Product',
          purchasePrice: cost,
          unitCost: cost,
          sellingPrice: sell,
          stockQuantity: Number(p.stockQuantity ?? 0),
          category: p.category ? String(p.category).toUpperCase() : (existing?.category || 'GROCERY'),
          minThreshold: Number(p.minThreshold ?? 20),
          maxThreshold: Number(p.maxThreshold ?? 100),
          distributorId: distId,
          supplierName: p.supplierName || 'Local Distributor',
          supplierEmail: p.supplierEmail || 'supplier@askar.bh',
          barcode: p.barcode ? String(p.barcode).trim() : null,
          vatRate: finalVat,
          taxRate: finalTax,
          is_weighed_item: (p.is_weighed_item === true || p.is_weighed_item === 1 || p.is_weighed_item === 'true') ? 1 : 0,
          tenantId: p.tenantId || 'tenant_askar_01',
          updatedAt: new Date()
        };

        if (existing) {
          await tx.orm.Product.where({ id: pid }).update(prodRecord);
          updatedCount++;
        } else {
          await tx.orm.Product.create({ id: pid, ...prodRecord });
          createdCount++;
        }
      }
    });

    return { success: true, createdCount, updatedCount, total: products.length };
  });

  // 6. Feitian F100 PIM Native Push Sync Endpoint (Secured with Manager Auth & Path Traversal Guards)
  fastify.post('/api/sync/pim-push', { preHandler: managerAuth }, async (request, reply) => {
  const { batch } = request.body || {};
  if (!Array.isArray(batch) || batch.length === 0) {
    return reply.status(400).send({ error: 'No batch items provided' });
  }

  const allDistributors = await db.orm.Distributor.all();
  const distByName = new Map(allDistributors.map(d => [d.name.toLowerCase().trim(), d]));
  const defaultDist = allDistributors[0]?.id || 'dist_local';

  // Ensure public uploads directory exists for photos
  const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads', 'products');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const syncedLocalIds = [];
  let processedCount = 0;

  try {
    await db.transaction(async (tx) => {
      for (const item of batch) {
        const localId = item.local_id || item.id;
        const cleanBarcode = item.barcode ? String(item.barcode).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) : '';
        const data = item.data || item;
        const rawImage = item.image || data.image;

        let imagePath = null;
        if (rawImage && typeof rawImage === 'string') {
          if (rawImage.startsWith('/uploads/') || rawImage.startsWith('http://') || rawImage.startsWith('https://')) {
            imagePath = rawImage;
          } else if (rawImage.startsWith('data:image/')) {
            try {
              const matches = rawImage.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
              if (matches) {
                const rawMime = matches[1].toLowerCase();
                const allowedMimes = ['jpg', 'jpeg', 'png', 'webp'];
                if (allowedMimes.includes(rawMime)) {
                  const ext = rawMime === 'jpeg' ? 'jpg' : rawMime;
                  const fileName = `f100_${cleanBarcode || Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
                  const filePath = path.resolve(uploadsDir, fileName);
                  if (filePath.startsWith(uploadsDir)) {
                    fs.writeFileSync(filePath, Buffer.from(matches[2], 'base64'));
                    imagePath = `/uploads/products/${fileName}`;
                  }
                }
              }
            } catch (imgErr) {
              fastify.log.warn('Could not save F100 product image:', imgErr);
            }
          }
        }

        // Find existing product by barcode first, then by ID
        let existing = null;
        if (cleanBarcode) {
          existing = await tx.orm.Product.where({ barcode: cleanBarcode }).all().first();
        }
        if (!existing && data.id) {
          existing = await tx.orm.Product.where({ id: data.id }).all().first();
        }

        // Resolve distributor
        let distId = data.distributorId;
        if (!distId && data.supplierName) {
          const matched = distByName.get(String(data.supplierName).toLowerCase().trim());
          if (matched) distId = matched.id;
        }
        if (!distId) distId = defaultDist;

        const costVal = Number(data.purchasePrice ?? data.unitCost ?? 0);
        const sellVal = Number(data.sellingPrice ?? data.price ?? (costVal > 0 ? Number((costVal * 1.3).toFixed(3)) : 1.0));
        const intakeQty = Number(data.intakeQty ?? 1);
        const stockMode = data.stockMode || 'ADD'; // ADD = additive, SET = cycle count override

        const finalVatRate = data.vatRate !== undefined ? Number(data.vatRate) : 10.0;
        const finalTaxRate = finalVatRate / 100.0;

        const isWeighedVal = (data.is_weighed_item === true || data.is_weighed_item === 1 || data.is_weighed_item === 'true') ? 1 : 0;

        if (existing) {
          // Calculate updated stock based on intake mode
          const currentStock = Number(existing.stockQuantity) || 0;
          const updatedStock = stockMode === 'ADD' ? currentStock + intakeQty : intakeQty;

          const updateRecord = {
            name: data.name?.trim() || existing.name,
            purchasePrice: costVal > 0 ? costVal : existing.purchasePrice,
            unitCost: costVal > 0 ? costVal : existing.unitCost,
            sellingPrice: sellVal > 0 ? sellVal : existing.sellingPrice,
            stockQuantity: updatedStock,
            category: data.category ? String(data.category).toUpperCase() : (existing.category || 'GROCERY'),
            minThreshold: Number(data.minThreshold ?? existing.minThreshold ?? 20),
            maxThreshold: Number(data.maxThreshold ?? existing.maxThreshold ?? 100),
            distributorId: distId,
            supplierName: data.supplierName || existing.supplierName || 'Local Distributor',
            supplierEmail: data.supplierEmail || existing.supplierEmail || 'supplier@askar.bh',
            vatRate: finalVatRate,
            taxRate: finalTaxRate,
            is_weighed_item: isWeighedVal,
            updatedAt: new Date()
          };
          if (imagePath) updateRecord.image_url = imagePath;

          await db.orm.Product.where({ id: existing.id }).update(updateRecord);

          // Log Stock Intake Audit Movement
          try {
            await db.orm.StockMovement.create({
              id: crypto.randomUUID(),
              productId: existing.id,
              quantityChange: stockMode === 'ADD' ? intakeQty : (intakeQty - currentStock),
              newStockLevel: updatedStock,
              movementType: 'IN_DELIVERY',
              reason: data.reason || 'F100 Handheld Stock Intake',
              changedBy: data.changedBy || 'F100 Warehouse Staff',
              createdAt: new Date(),
              tenantId: 'tenant_askar_01'
            });
          } catch { }

          // Mirror to Turso if active
          try {
            await db.execute({
              sql: `UPDATE Product SET name = ?, purchasePrice = ?, unitCost = ?, sellingPrice = ?, stockQuantity = ?, minThreshold = ?, maxThreshold = ?, supplierName = ?, supplierEmail = ?, distributorId = ?, vatRate = ?, taxRate = ?, is_weighed_item = ?, updatedAt = ? WHERE id = ?`,
              args: [
                updateRecord.name,
                updateRecord.purchasePrice,
                updateRecord.unitCost,
                updateRecord.sellingPrice,
                updateRecord.stockQuantity,
                updateRecord.minThreshold,
                updateRecord.maxThreshold,
                updateRecord.supplierName,
                updateRecord.supplierEmail,
                updateRecord.distributorId,
                updateRecord.vatRate,
                updateRecord.taxRate,
                isWeighedVal,
                updateRecord.updatedAt.toISOString(),
                existing.id
              ]
            });
          } catch { }

        } else {
          // Brand New Product Creation
          const newId = data.id || `f100_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const initialStock = stockMode === 'ADD' ? intakeQty : intakeQty;

          const createRecord = {
            id: newId,
            name: data.name?.trim() || `Item ${cleanBarcode || 'Bulk'}`,
            purchasePrice: costVal,
            unitCost: costVal,
            sellingPrice: sellVal,
            stockQuantity: initialStock,
            category: data.category ? String(data.category).toUpperCase() : 'GROCERY',
            minThreshold: Number(data.minThreshold ?? 20),
            maxThreshold: Number(data.maxThreshold ?? 100),
            distributorId: distId,
            supplierName: data.supplierName || 'Local Distributor',
            supplierEmail: data.supplierEmail || 'supplier@askar.bh',
            barcode: cleanBarcode || null,
            vatRate: finalVatRate,
            taxRate: finalTaxRate,
            is_weighed_item: isWeighedVal,
            tenantId: 'tenant_askar_01',
            updatedAt: new Date()
          };
          if (imagePath) createRecord.image_url = imagePath;

          await db.orm.Product.create(createRecord);

          // Save category if provided
          if (data.category) {
            try {
              const config = loadQuickConfig();
              config.overrides = config.overrides || {};
              config.overrides[newId] = {
                isQuickProduct: true,
                category: String(data.category).toUpperCase()
              };
              saveQuickConfig(config);
            } catch { }
          }

          // Initial Stock Movement
          try {
            await db.orm.StockMovement.create({
              id: crypto.randomUUID(),
              productId: newId,
              quantityChange: initialStock,
              newStockLevel: initialStock,
              movementType: 'IN_DELIVERY',
              reason: data.reason || 'F100 Initial Catalog Intake',
              changedBy: data.changedBy || 'F100 Warehouse Staff',
              createdAt: new Date(),
              tenantId: 'tenant_askar_01'
            });
          } catch { }

          // Initial Price History
          try {
            await db.orm.ProductPriceHistory.create({
              id: crypto.randomUUID(),
              productId: newId,
              productName: createRecord.name,
              oldPrice: sellVal,
              newPrice: sellVal,
              oldCost: costVal,
              newCost: costVal,
              changeReason: 'F100 Handheld Onboarding',
              changedBy: data.changedBy || 'F100 Warehouse Staff',
              createdAt: new Date(),
              tenantId: 'tenant_askar_01'
            });
          } catch { }

          // Mirror to Turso if active
          try {
            await db.execute({
              sql: `INSERT OR REPLACE INTO Product (id, tenantId, name, purchasePrice, unitCost, sellingPrice, stockQuantity, minThreshold, maxThreshold, supplierName, supplierEmail, distributorId, vatRate, taxRate, barcode, is_weighed_item, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [
                createRecord.id,
                createRecord.tenantId,
                createRecord.name,
                createRecord.purchasePrice,
                createRecord.unitCost,
                createRecord.sellingPrice,
                createRecord.stockQuantity,
                createRecord.minThreshold,
                createRecord.maxThreshold,
                createRecord.supplierName,
                createRecord.supplierEmail,
                createRecord.distributorId,
                createRecord.vatRate,
                createRecord.taxRate,
                createRecord.barcode,
                isWeighedVal,
                createRecord.updatedAt.toISOString()
              ]
            });
          } catch { }
        }

        if (localId !== undefined && localId !== null) {
          syncedLocalIds.push(localId);
        }
        processedCount++;
      }
    });

    fastify.log.info(`[F100 PIM Sync] Successfully ingested ${processedCount} products from F100 terminal.`);
    return {
      success: true,
      processedCount,
      syncedIds: syncedLocalIds
    };
  } catch (error) {
    fastify.log.error('F100 PIM Sync Batch Failed:', error);
    return reply.status(500).send({
      success: false,
      error: 'Sync transaction failed',
      details: error.message
    });
  }
});

  // 7. Thresholds and Supplier Details (Secured with Manager Auth)
  fastify.put('/api/products/:id/thresholds', { preHandler: managerAuth }, async (request, reply) => {
    const { id } = request.params;
    const {
      name,
      sellingPrice,
      purchasePrice,
      unitCost,
      stockQuantity,
      minThreshold,
      maxThreshold,
      barcode,
      supplierName,
      supplierEmail,
      distributorId,
      category,
      vatRate,
      is_weighed_item,
      reason,
      changedBy = 'Manager'
    } = request.body || {};

    const existing = await db.orm.Product.where({ id }).all().first();
    if (!existing) {
      return reply.status(404).send({ error: 'Product not found' });
    }

    const updateData = { updatedAt: new Date() };

    if (name !== undefined) updateData.name = name.trim();
    if (minThreshold !== undefined) updateData.minThreshold = Number(minThreshold);
    if (maxThreshold !== undefined) updateData.maxThreshold = Number(maxThreshold);
    if (supplierName !== undefined) updateData.supplierName = supplierName;
    if (supplierEmail !== undefined) updateData.supplierEmail = supplierEmail;
    if (distributorId !== undefined) {
      updateData.distributorId = distributorId;
      if (distributorId) {
        const dist = await db.orm.Distributor.where({ id: distributorId }).all().first();
        if (dist) {
          updateData.supplierName = dist.name;
          updateData.supplierEmail = dist.contactEmail;
        }
      }
    }
    if (barcode !== undefined) updateData.barcode = barcode ? String(barcode).trim() : null;
    if (category !== undefined) updateData.category = String(category).toUpperCase();
    if (vatRate !== undefined) updateData.vatRate = Number(vatRate);
    if (is_weighed_item !== undefined) updateData.is_weighed_item = (is_weighed_item === true || is_weighed_item === 1 || is_weighed_item === 'true') ? 1 : 0;
    if (stockQuantity !== undefined) updateData.stockQuantity = Number(stockQuantity);

    const oldPrice = Number(existing.sellingPrice);
    const oldCost = Number(existing.purchasePrice ?? existing.unitCost ?? 0);
    const newPrice = sellingPrice !== undefined ? Number(sellingPrice) : oldPrice;
    const newCost = purchasePrice !== undefined ? Number(purchasePrice) : (unitCost !== undefined ? Number(unitCost) : oldCost);

    if (sellingPrice !== undefined) updateData.sellingPrice = newPrice;
    if (purchasePrice !== undefined || unitCost !== undefined) {
      updateData.purchasePrice = newCost;
      updateData.unitCost = newCost;
    }

    if (Math.abs(oldPrice - newPrice) > 0.0001 || Math.abs(oldCost - newCost) > 0.0001) {
      try {
        await db.orm.ProductPriceHistory.create({
          id: crypto.randomUUID(),
          productId: id,
          productName: updateData.name || existing.name,
          oldPrice,
          newPrice,
          oldCost,
          newCost,
          changeReason: reason || 'Inventory threshold / product configuration adjusted',
          changedBy,
          createdAt: new Date(),
          tenantId: 'tenant_askar_01'
        });
      } catch (err) {
        fastify.log.warn('Could not save price history:', err.message);
      }
    }

    await db.orm.Product.where({ id }).update(updateData);
    const updated = await db.orm.Product.where({ id }).all().first();
    return { success: true, product: updated };
  });

  // 8. Create Product Handler
  const handleCreateProduct = async (request, reply) => {
    try {
      const {
        id,
        name,
        unitCost,
        purchasePrice,
        sellingPrice,
        stockQuantity,
        minThreshold,
        maxThreshold,
        distributorId,
        barcode,
        supplierName,
        supplierEmail,
        vatRate,
        is_weighed_item,
        category
      } = request.body || {};

      if (!name || !name.trim()) {
        return reply.status(400).send({ success: false, error: 'Product name is required' });
      }

      const prodId = (id || barcode || crypto.randomUUID()).trim();
      const cleanBarcode = (barcode || id || prodId).trim();

      let existing = await db.orm.Product.where({ id: prodId }).all().first();
      if (!existing && cleanBarcode) {
        existing = await db.orm.Product.where({ barcode: cleanBarcode }).all().first();
      }
      if (!existing && name && name.trim()) {
        const allProds = await db.orm.Product.all();
        existing = allProds.find(p => (p.name || '').trim().toLowerCase() === name.trim().toLowerCase());
      }
      if (existing) {
        request.params = { id: existing.id };
        return handleUpdateProduct(request, reply);
      }

      let sName = supplierName || 'Local Supplier';
      let sEmail = supplierEmail || 'supplier@askar.bh';
      let validDistId = distributorId || null;

      if (distributorId) {
        const dist = await db.orm.Distributor.where({ id: distributorId }).all().first();
        if (dist) {
          sName = dist.name;
          sEmail = dist.contactEmail;
          validDistId = dist.id;
        }
      }

      const cost = Number(unitCost ?? purchasePrice ?? 0);
      const price = Number(sellingPrice ?? (cost > 0 ? Number((cost * 1.3).toFixed(3)) : 1.0));
      const finalVatRate = vatRate !== undefined ? Number(vatRate) : 10.0;
      const finalTaxRate = finalVatRate / 100.0;

      const newProd = {
        id: prodId,
        name: name.trim(),
        purchasePrice: cost,
        unitCost: cost,
        sellingPrice: price,
        stockQuantity: Number(stockQuantity ?? 1),
        minThreshold: Number(minThreshold ?? 10),
        maxThreshold: Number(maxThreshold ?? 50),
        distributorId: validDistId,
        supplierName: sName,
        supplierEmail: sEmail,
        barcode: cleanBarcode,
        category: category ? String(category).toUpperCase() : 'GROCERY',
        is_weighed_item: (is_weighed_item === true || is_weighed_item === 1 || is_weighed_item === 'true') ? 1 : 0,
        plu_code: body.plu_code ? String(body.plu_code).trim() : null,
        name_ar: body.name_ar ? String(body.name_ar).trim() : null,
        image_url: body.image_url ? String(body.image_url).trim() : null,
        vatRate: finalVatRate,
        taxRate: finalTaxRate,
        tenantId: 'tenant_askar_01',
        updatedAt: new Date()
      };

      await db.orm.Product.create(newProd);

      if (category) {
        try {
          const config = loadQuickConfig();
          config.overrides = config.overrides || {};
          config.overrides[prodId] = {
            isQuickProduct: true,
            category: String(category).toUpperCase()
          };
          saveQuickConfig(config);
        } catch (err) {
          fastify.log.warn('Could not save quick category override:', err);
        }
      }

      // Broadcast catalog update to all active POS terminals
      if (fastify.websocketServer?.clients) {
        fastify.websocketServer.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'CATALOG_UPDATED',
              payload: newProd,
              timestamp: new Date().toISOString()
            }));
          }
        });
      }

      // Asynchronous non-blocking mirror to Turso Cloud (Zero-SPOF)
      mirrorProductToCloud(newProd).catch(() => {});

      try {
        await db.orm.ProductPriceHistory.create({
          id: crypto.randomUUID(),
          productId: prodId,
          productName: name.trim(),
          oldPrice: price,
          newPrice: price,
          oldCost: cost,
          newCost: cost,
          changeReason: 'Initial Catalog Onboarding (Quick Add / PIM)',
          changedBy: 'Cashier / Manager',
          createdAt: new Date(),
          tenantId: 'tenant_askar_01'
        });
      } catch (e) {}

      return {
        success: true,
        message: 'Product added to catalog and inventory!',
        product: {
          ...newProd,
          category: category || 'ESSENTIALS'
        },
        ...newProd,
        category: category || 'ESSENTIALS'
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Failed to create product', details: error.message });
    }
  };

  fastify.post('/api/products', { preHandler: managerAuth }, handleCreateProduct);
  fastify.post('/products', { preHandler: managerAuth }, handleCreateProduct);

  // 9. Barcode Binding (Secured with Manager Auth)
  fastify.post('/api/products/:id/bind-barcode', { preHandler: managerAuth }, async (request, reply) => {
    const { id } = request.params;
    const { barcode } = request.body || {};

    const cleanBarcode = (barcode !== undefined && barcode !== null) ? String(barcode).trim() : '';
    if (!cleanBarcode) {
      await db.orm.Product.where({ id }).update({
        barcode: null,
        updatedAt: new Date()
      });
      const updated = await db.orm.Product.where({ id }).all().first();
      return { success: true, product: updated, unassigned: true };
    }

    const allProds = await db.orm.Product.all();
    const conflict = allProds.find(
      (p) => p.id !== id && (
        (p.barcode || '').trim().toLowerCase() === cleanBarcode.toLowerCase() ||
        p.id.trim().toLowerCase() === cleanBarcode.toLowerCase()
      )
    );

    if (conflict) {
      return reply.status(400).send({
        error: `Barcode [${cleanBarcode}] is already assigned to "${conflict.name}"`
      });
    }

    const target = allProds.find((p) => p.id === id);
    if (!target) {
      return reply.status(404).send({ error: 'Product not found' });
    }

    await db.orm.Product.where({ id }).update({
      barcode: cleanBarcode,
      updatedAt: new Date()
    });

    const updated = await db.orm.Product.where({ id }).all().first();
    return { success: true, product: updated };
  });

  // 10. Update Product Handler
  const handleUpdateProduct = async (request, reply) => {
    const { id } = request.params;
    const {
      name,
      sellingPrice,
      purchasePrice,
      unitCost,
      stockQuantity,
      minThreshold,
      maxThreshold,
      barcode,
      distributorId,
      supplierName,
      supplierEmail,
      vatRate,
      category,
      is_weighed_item,
      plu_code,
      name_ar,
      image_url,
      reason,
      changedBy = 'Manager'
    } = request.body || {};

    try {
      const existing = await db.orm.Product.where({ id }).all().first();
      if (!existing) {
        return reply.status(404).send({ success: false, error: 'Product not found' });
      }

      const updateData = { updatedAt: new Date() };

      if (name !== undefined) updateData.name = String(name).trim();
      if (stockQuantity !== undefined) updateData.stockQuantity = Number(stockQuantity);
      if (minThreshold !== undefined) updateData.minThreshold = Number(minThreshold);
      if (maxThreshold !== undefined) updateData.maxThreshold = Number(maxThreshold);
      if (barcode !== undefined) updateData.barcode = barcode ? String(barcode).trim() : null;
      if (distributorId !== undefined) {
        updateData.distributorId = distributorId || null;
        if (distributorId) {
          const dist = await db.orm.Distributor.where({ id: distributorId }).all().first();
          if (dist) {
            updateData.supplierName = dist.name;
            updateData.supplierEmail = dist.contactEmail;
          }
        }
      } else if (supplierName !== undefined) {
        updateData.supplierName = supplierName || null;
      }
      if (supplierEmail !== undefined) updateData.supplierEmail = supplierEmail || null;
      if (category !== undefined) updateData.category = String(category).toUpperCase();
      if (is_weighed_item !== undefined) updateData.is_weighed_item = (is_weighed_item === true || is_weighed_item === 1 || is_weighed_item === 'true') ? 1 : 0;
      if (plu_code !== undefined) updateData.plu_code = plu_code ? String(plu_code).trim() : null;
      if (name_ar !== undefined) updateData.name_ar = name_ar ? String(name_ar).trim() : null;
      if (image_url !== undefined) updateData.image_url = image_url ? String(image_url).trim() : null;
      if (vatRate !== undefined) updateData.vatRate = Number(vatRate);

      const oldPrice = Number(existing.sellingPrice);
      const oldCost = Number(existing.purchasePrice ?? existing.unitCost ?? 0);
      const newPrice = sellingPrice !== undefined ? Number(sellingPrice) : oldPrice;
      const newCost = purchasePrice !== undefined ? Number(purchasePrice) : (unitCost !== undefined ? Number(unitCost) : oldCost);

      if (sellingPrice !== undefined) updateData.sellingPrice = newPrice;
      if (purchasePrice !== undefined || unitCost !== undefined) {
        updateData.purchasePrice = newCost;
        updateData.unitCost = newCost;
      }

      const priceChanged = Math.abs(oldPrice - newPrice) > 0.0001;
      const costChanged = Math.abs(oldCost - newCost) > 0.0001;

      if (priceChanged || costChanged) {
        const historyEntry = {
          id: crypto.randomUUID(),
          productId: id,
          productName: updateData.name || existing.name,
          oldPrice,
          newPrice,
          oldCost,
          newCost,
          changeReason: reason || (priceChanged && costChanged ? 'Price & Cost Adjusted' : (priceChanged ? 'Retail Price Adjusted' : 'Supplier Cost Updated')),
          changedBy,
          createdAt: new Date(),
          tenantId: 'tenant_askar_01'
        };
        try {
          await db.orm.ProductPriceHistory.create(historyEntry);
        } catch (err) {
          console.warn('Failed to record price history:', err.message);
        }
      }

      await db.orm.Product.where({ id }).update(updateData);
      const updated = await db.orm.Product.where({ id }).all().first();

      // Broadcast catalog update to all active POS terminals
      if (fastify.websocketServer?.clients) {
        fastify.websocketServer.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'CATALOG_UPDATED',
              action: 'UPDATE',
              payload: updated,
              timestamp: new Date().toISOString()
            }));
          }
        });
      }

      // Asynchronous non-blocking mirror to Turso Cloud (Zero-SPOF)
      if (updated) {
        mirrorProductToCloud(updated).catch(() => {});
      }

      const marginPct = updated.sellingPrice > 0
        ? Number((((updated.sellingPrice - updated.purchasePrice) / updated.sellingPrice) * 100).toFixed(1))
        : 0;

      return {
        success: true,
        message: 'Product updated successfully',
        product: {
          ...updated,
          marginPercent: marginPct,
          profitAmount: Number((updated.sellingPrice - updated.purchasePrice).toFixed(3)),
          isNegativeMargin: marginPct < 0,
          isLowMargin: marginPct >= 0 && marginPct < 5.0
        }
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Failed to update product', details: error.message });
    }
  };

  fastify.put('/api/products/:id', { preHandler: managerAuth }, handleUpdateProduct);
  fastify.patch('/api/products/:id', { preHandler: managerAuth }, handleUpdateProduct);
  fastify.post('/api/products/:id', { preHandler: managerAuth }, handleUpdateProduct);
  fastify.post('/api/products/:id/update', { preHandler: managerAuth }, handleUpdateProduct);
  fastify.put('/products/:id', { preHandler: managerAuth }, handleUpdateProduct);
  fastify.post('/products/:id', { preHandler: managerAuth }, handleUpdateProduct);

  // 10b. Delete Product Handler (Guaranteed 100% Deletable with Tombstone Sync)
  const handleDeleteProduct = async (request, reply) => {
    const { id } = request.params;
    try {
      const existing = await db.orm.Product.where({ id }).all().first() ||
        (await db.execute({ sql: `SELECT * FROM Product WHERE id = ? OR barcode = ? LIMIT 1`, args: [id, id] })).rows[0];

      if (!existing) {
        // Record tombstone anyway for clean state convergence
        await db.execute({
          sql: `INSERT INTO DeletedProduct (id, barcode, tenantId, name, deletedAt)
                VALUES (?, ?, 'tenant_askar_01', 'Deleted Item', CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET deletedAt = CURRENT_TIMESTAMP`,
          args: [id, id]
        }).catch(() => {});
        return reply.status(200).send({ success: true, message: 'Product already deleted', deletedId: id });
      }

      const realId = String(existing.id);
      const barcode = existing.barcode ? String(existing.barcode) : null;
      const name = existing.name ? String(existing.name) : 'Deleted Item';
      const tenantId = existing.tenantId || 'tenant_askar_01';

      // 1. Record Tombstone in DeletedProduct for fleet-wide sync
      await db.execute({
        sql: `INSERT INTO DeletedProduct (id, barcode, tenantId, name, deletedAt)
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO UPDATE SET deletedAt = CURRENT_TIMESTAMP`,
        args: [realId, barcode, tenantId, name]
      }).catch(() => {});

      // 2. Cascade delete dependent child records
      await db.execute({ sql: `DELETE FROM QuickProduct WHERE productId = ? OR productId = ? OR id = ?`, args: [realId, barcode || realId, `qp_${realId}`] }).catch(() => {});
      await db.execute({ sql: `DELETE FROM StoreInventory WHERE productId = ? OR productId = ?`, args: [realId, barcode || realId] }).catch(() => {});
      await db.execute({ sql: `DELETE FROM ProductPriceHistory WHERE productId = ?`, args: [realId] }).catch(() => {});

      // 3. Delete from Product table
      await db.execute({
        sql: `DELETE FROM Product WHERE id = ? OR barcode = ?`,
        args: [realId, realId]
      });
      await db.orm.Product.where({ id: realId }).delete().catch(() => {});

      // 4. Cleanup quick config and mark removed
      try {
        const config = loadQuickConfig();
        if (config.overrides && config.overrides[realId]) {
          delete config.overrides[realId];
        }
        if (barcode && config.overrides && config.overrides[barcode]) {
          delete config.overrides[barcode];
        }
        if (!config.removedIds) config.removedIds = [];
        if (!config.removedIds.includes(realId)) {
          config.removedIds.push(realId);
        }
        if (barcode && !config.removedIds.includes(barcode)) {
          config.removedIds.push(barcode);
        }
        saveQuickConfig(config);
      } catch (e) {
        fastify.log.warn('Could not update quick config on delete:', e.message);
      }

      // 5. Broadcast deletion to all active POS terminals
      if (fastify.websocketServer?.clients) {
        fastify.websocketServer.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'CATALOG_UPDATED',
              action: 'DELETE',
              deletedId: realId,
              productId: realId,
              barcode: barcode,
              name: name,
              timestamp: new Date().toISOString()
            }));
          }
        });
      }

      // Asynchronous non-blocking mirror of tombstone to Turso Cloud
      mirrorProductTombstoneToCloud(realId, barcode, name).catch(() => {});

      fastify.log.info(`[Catalog] Deleted product ${realId} (${name})`);
      return {
        success: true,
        message: `Product "${name}" deleted successfully`,
        deletedId: realId,
        barcode
      };
    } catch (error) {
      fastify.log.error('Delete product failed:', error);
      return reply.status(500).send({ success: false, error: 'Failed to delete product', details: error.message });
    }
  };

  const handleBulkDeleteProducts = async (request, reply) => {
    const { productIds = [] } = request.body || {};
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return reply.status(400).send({ success: false, error: 'No products selected for deletion.' });
    }

    try {
      let deletedCount = 0;
      const config = loadQuickConfig();
      if (!config.removedIds) config.removedIds = [];
      config.overrides = config.overrides || {};

      for (const id of productIds) {
        try {
          const existing = await db.orm.Product.where({ id }).all().first() ||
            (await db.execute({ sql: `SELECT * FROM Product WHERE id = ? OR barcode = ? LIMIT 1`, args: [id, id] })).rows[0];

          const realId = existing?.id ? String(existing.id) : String(id);
          const barcode = existing?.barcode ? String(existing.barcode) : null;
          const name = existing?.name ? String(existing.name) : 'Deleted Item';
          const tenantId = existing?.tenantId || 'tenant_askar_01';

          // 1. Tombstone
          await db.execute({
            sql: `INSERT INTO DeletedProduct (id, barcode, tenantId, name, deletedAt)
                  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                  ON CONFLICT(id) DO UPDATE SET deletedAt = CURRENT_TIMESTAMP`,
            args: [realId, barcode, tenantId, name]
          }).catch(() => {});

          mirrorProductTombstoneToCloud(realId, barcode, name).catch(() => {});

          // 2. Cascade delete dependent child records
          await db.execute({ sql: `DELETE FROM QuickProduct WHERE productId = ? OR productId = ? OR id = ?`, args: [realId, barcode || realId, `qp_${realId}`] }).catch(() => {});
          await db.execute({ sql: `DELETE FROM StoreInventory WHERE productId = ? OR productId = ?`, args: [realId, barcode || realId] }).catch(() => {});
          await db.execute({ sql: `DELETE FROM ProductPriceHistory WHERE productId = ?`, args: [realId] }).catch(() => {});

          // 3. Delete from Product
          await db.execute({
            sql: `DELETE FROM Product WHERE id = ? OR barcode = ?`,
            args: [realId, realId]
          });
          await db.orm.Product.where({ id: realId }).delete().catch(() => {});

          // 4. Update Quick Config
          delete config.overrides[realId];
          if (barcode) {
            delete config.overrides[barcode];
            if (!config.removedIds.includes(barcode)) {
              config.removedIds.push(barcode);
            }
          }
          if (!config.removedIds.includes(realId)) {
            config.removedIds.push(realId);
          }
          deletedCount++;
        } catch (e) {
          fastify.log.warn(`Failed to delete product ${id}:`, e.message);
        }
      }

      saveQuickConfig(config);

      // Broadcast bulk deletion to all active POS terminals
      if (fastify.websocketServer?.clients) {
        fastify.websocketServer.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'CATALOG_UPDATED',
              action: 'BULK_DELETE',
              deletedIds: productIds,
              timestamp: new Date().toISOString()
            }));
          }
        });
      }

      return {
        success: true,
        message: `Successfully deleted ${deletedCount} products.`,
        deletedCount,
        deletedIds: productIds
      };
    } catch (error) {
      fastify.log.error('Bulk delete failed:', error);
      return reply.status(500).send({ success: false, error: 'Bulk delete failed', details: error.message });
    }
  };

  fastify.delete('/api/products/:id', { preHandler: managerAuth }, handleDeleteProduct);
  fastify.delete('/products/:id', { preHandler: managerAuth }, handleDeleteProduct);
  fastify.post('/api/products/:id/delete', { preHandler: managerAuth }, handleDeleteProduct);
  fastify.post('/products/:id/delete', { preHandler: managerAuth }, handleDeleteProduct);
  fastify.post('/api/products/bulk-delete', { preHandler: managerAuth }, handleBulkDeleteProducts);
  fastify.post('/products/bulk-delete', { preHandler: managerAuth }, handleBulkDeleteProducts);

  // 11. Bulk Update & Price Hike (Protected by managerAuth)
  fastify.post('/api/products/bulk-update', { preHandler: managerAuth }, async (request, reply) => {
    const {
      productIds = [],
      action,
      value,
      roundToFils,
      reason,
      changedBy = 'Manager'
    } = request.body || {};

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return reply.status(400).send({ success: false, error: 'No products selected for bulk update.' });
    }

    try {
      const numVal = parseFloat(value);
      const updatedList = [];

      const applyRounding = (price) => {
        if (!roundToFils || roundToFils <= 0) return Number(price.toFixed(3));
        const step = roundToFils / 1000;
        return Number((Math.ceil(price / step) * step).toFixed(3));
      };

      for (const pid of productIds) {
        const existing = await db.orm.Product.where({ id: pid }).all().first();
        if (!existing) continue;

        const oldPrice = Number(existing.sellingPrice);
        const oldCost = Number(existing.purchasePrice ?? existing.unitCost ?? 0);
        let newPrice = oldPrice;
        let newCost = oldCost;
        const updateData = { updatedAt: new Date() };
        let defaultReason = reason || 'Bulk Price Adjustment';

        if (action === 'PERCENT_INCREASE' && !isNaN(numVal)) {
          newPrice = applyRounding(oldPrice * (1 + numVal / 100));
          updateData.sellingPrice = newPrice;
          defaultReason = reason || `Bulk Price Hike (+${numVal}%)`;
        } else if (action === 'PERCENT_DECREASE' && !isNaN(numVal)) {
          newPrice = applyRounding(Math.max(0.005, oldPrice * (1 - numVal / 100)));
          updateData.sellingPrice = newPrice;
          defaultReason = reason || `Bulk Price Discount (-${numVal}%)`;
        } else if (action === 'FIXED_MARKUP' && !isNaN(numVal)) {
          newPrice = applyRounding(Math.max(0.005, oldPrice + numVal));
          updateData.sellingPrice = newPrice;
          defaultReason = reason || `Bulk Fixed Markup (+BD ${numVal.toFixed(3)})`;
        } else if (action === 'SET_VAT_RATE' && !isNaN(numVal)) {
          updateData.vatRate = numVal;
          updateData.taxRate = numVal / 100;
          defaultReason = reason || `Set VAT Rate to ${numVal}%`;
        } else if (action === 'SET_STOCK' && !isNaN(numVal)) {
          updateData.stockQuantity = Math.max(0, Math.floor(numVal));
          defaultReason = reason || `Bulk Stock Adjustment to ${numVal}`;
        } else if (action === 'ASSIGN_DISTRIBUTOR' && value) {
          updateData.distributorId = String(value);
          defaultReason = reason || `Assigned to Distributor ${value}`;
        }

        if (Math.abs(oldPrice - newPrice) > 0.0001 || Math.abs(oldCost - newCost) > 0.0001) {
          try {
            await db.orm.ProductPriceHistory.create({
              id: crypto.randomUUID(),
              productId: pid,
              productName: existing.name,
              oldPrice,
              newPrice,
              oldCost,
              newCost,
              changeReason: defaultReason,
              changedBy,
              createdAt: new Date(),
              tenantId: 'tenant_askar_01'
            });
          } catch (e) {
            console.warn('Failed to log bulk price history:', e.message);
          }
        }

        await db.orm.Product.where({ id: pid }).update(updateData);
        const updated = await db.orm.Product.where({ id: pid }).all().first();
        updatedList.push(updated);
      }

      return {
        success: true,
        message: `Successfully executed ${action} on ${updatedList.length} products.`,
        updatedCount: updatedList.length,
        products: updatedList
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Bulk update failed', details: error.message });
    }
  });

  // 12. Price History Audit
  fastify.get('/api/products/:id/price-history', async (request, reply) => {
    const { id } = request.params;
    try {
      const history = await db.orm.ProductPriceHistory.where({ productId: id }).all();
      history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return {
        success: true,
        productId: id,
        count: history.length,
        history
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Failed to fetch price history' });
    }
  });

  // 13. Shelf Tags
  fastify.post('/api/products/shelf-tags', async (request, reply) => {
    const { productIds = [] } = request.body || {};
    try {
      const all = await db.orm.Product.all();
      const distributors = await db.orm.Distributor.all();
      const distMap = new Map(distributors.map(d => [d.id, d.name]));

      const targetProducts = productIds.length > 0
        ? all.filter(p => productIds.includes(p.id))
        : all;

      const tags = targetProducts.map(p => {
        const margin = p.sellingPrice > 0
          ? Number((((p.sellingPrice - p.purchasePrice) / p.sellingPrice) * 100).toFixed(1))
          : 0;
        return {
          id: p.id,
          name: p.name,
          barcode: p.barcode || p.id,
          sellingPrice: Number(p.sellingPrice || 0).toFixed(3),
          purchasePrice: Number(p.purchasePrice || 0).toFixed(3),
          marginPercent: margin,
          vatRate: p.vatRate ?? 10.0,
          supplierName: p.distributorId ? distMap.get(p.distributorId) || p.supplierName || 'General' : p.supplierName || 'General',
          printedAt: new Date().toLocaleDateString()
        };
      });

      return { success: true, count: tags.length, tags };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Failed to prepare shelf tags' });
    }
  });

  // 14. Delta Sync for Products (Pull-based delta changes)
  fastify.get('/api/sync/products', async (request, reply) => {
    const { lastSyncDate } = request.query || {};

    // NEW: Optimized Delta Sync Query
    try {
      let updatedProducts = [];

      if (!lastSyncDate) {
        // Initial sync: fetch all (Only happens once per terminal install)
        const result = await db.execute('SELECT * FROM Product');
        updatedProducts = result.rows || [];
      } else {
        // Delta sync: fetch strictly what changed since the last poll
        const result = await db.execute({
          sql: 'SELECT * FROM Product WHERE updatedAt > ?',
          args: [new Date(lastSyncDate).toISOString()]
        });
        updatedProducts = result.rows || [];
      }

      return { success: true, products: updatedProducts };
    } catch (err) {
      fastify.log.error('Delta sync products failed:', err);
      return reply.code(500).send({ error: 'Failed to sync products' });
    }
  });

  // 15. Daily Fresh Produce & Veggies (Strictly Weighted Scale Items Only)
  fastify.get('/api/products/produce', async (request, reply) => {
    try {
      const res = await db.execute(`
        SELECT 
          p.id, p.name, p.name_ar, p.barcode, p.plu_code, p.image_url,
          COALESCE(p.sellingPrice, 0.0) as sellingPrice,
          COALESCE(p.purchasePrice, p.unitCost, 0.0) as purchasePrice,
          COALESCE(p.unitCost, p.purchasePrice, 0.0) as unitCost,
          COALESCE(p.stockQuantity, 0) as stockQuantity,
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
        WHERE (p.is_weighed_item = 1 OR p.is_weighed_item = true)
        ORDER BY 
          CASE WHEN p.plu_code IS NOT NULL AND p.plu_code != '' THEN 0 ELSE 1 END,
          CAST(p.plu_code AS INTEGER) ASC,
          p.name ASC;
      `);

      const items = (res.rows || []).map((row) => {
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

      return { success: true, count: items.length, items };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch produce items', details: err?.message });
    }
  });

  // 16. Fast Batch Produce Price & Omni-Pad Updates
  fastify.post('/api/products/produce/batch-update', { preHandler: managerAuth }, async (request, reply) => {
    try {
      const { updates = [], reason = 'Daily Morning Produce Market Adjustment', changedBy = 'Store Manager' } = request.body || {};
      if (!Array.isArray(updates) || updates.length === 0) {
        return reply.code(400).send({ error: 'No updates provided' });
      }

      for (const item of updates) {
        const pid = String(item.id).trim();
        const newSell = Number(item.sellingPrice || 0);
        const newCost = Number(item.purchasePrice !== undefined ? item.purchasePrice : (item.unitCost || 0));
        const oldSell = Number(item.oldPrice || item.previousPrice || newSell);
        const oldCost = Number(item.oldCost || newCost);
        const wastageKg = Number(item.wastageKg || 0);
        const pluCode = item.plu_code !== undefined ? (item.plu_code ? String(item.plu_code).trim() : null) : undefined;
        const imageUrl = item.image_url !== undefined ? (item.image_url ? String(item.image_url).trim() : null) : undefined;
        const nameAr = item.name_ar !== undefined ? (item.name_ar ? String(item.name_ar).trim() : null) : undefined;

        const sets = ['sellingPrice = ?', 'purchasePrice = ?', 'unitCost = ?', 'updatedAt = CURRENT_TIMESTAMP'];
        const args = [newSell, newCost, newCost];
        if (pluCode !== undefined) { sets.push('plu_code = ?'); args.push(pluCode); }
        if (imageUrl !== undefined) { sets.push('image_url = ?'); args.push(imageUrl); }
        if (nameAr !== undefined) { sets.push('name_ar = ?'); args.push(nameAr); }
        args.push(pid);

        await db.execute({
          sql: `UPDATE Product SET ${sets.join(', ')} WHERE id = ?`,
          args
        });

        // Record history
        if (Math.abs(newSell - oldSell) > 0.0001 || Math.abs(newCost - oldCost) > 0.0001) {
          try {
            await db.orm.ProductPriceHistory.create({
              id: crypto.randomUUID(),
              productId: pid,
              productName: item.name || pid,
              oldPrice: oldSell,
              newPrice: newSell,
              oldCost: oldCost,
              newCost: newCost,
              changeReason: reason,
              changedBy,
              createdAt: new Date(),
              tenantId: 'tenant_askar_01'
            });
          } catch {}
        }
      }

      // Broadcast instant live update to all POS terminals and Omni-Pads
      if (fastify.websocketServer?.clients) {
        const broadcastPayload = JSON.stringify({
          type: 'PRODUCE_PRICES_UPDATED',
          updates,
          timestamp: Date.now()
        });
        fastify.websocketServer.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(broadcastPayload);
          }
        });
      }

      return {
        success: true,
        message: `Successfully updated ${updates.length} produce items`,
        updatedCount: updates.length,
        timestamp: Date.now()
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to batch update produce', details: err?.message });
    }
  });

  // 17. Single Item Produce / Omni-Pad Quick Update
  fastify.post('/api/products/produce/update-item', { preHandler: managerAuth }, async (request, reply) => {
    try {
      const body = request.body || {};
      const id = String(body.id || '').trim();
      if (!id) return reply.code(400).send({ error: 'Product ID required' });

      const pluCode = body.plu_code !== undefined ? (body.plu_code ? String(body.plu_code).trim() : null) : undefined;
      const imageUrl = body.image_url !== undefined ? (body.image_url ? String(body.image_url).trim() : null) : undefined;
      const name = body.name ? String(body.name).trim() : undefined;
      const nameAr = body.name_ar !== undefined ? (body.name_ar ? String(body.name_ar).trim() : null) : undefined;
      const sellingPrice = body.sellingPrice !== undefined ? Number(body.sellingPrice) : undefined;
      const purchasePrice = body.purchasePrice !== undefined ? Number(body.purchasePrice) : undefined;
      const isWeighed = body.is_weighed_item !== undefined ? (body.is_weighed_item ? 1 : 0) : undefined;

      const sets = ['updatedAt = CURRENT_TIMESTAMP'];
      const args = [];
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

      // Broadcast update
      if (fastify.websocketServer?.clients) {
        fastify.websocketServer.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'PRODUCE_PRICES_UPDATED',
              itemId: id,
              updates: [{
                id,
                plu_code: pluCode,
                image_url: imageUrl,
                name_ar: nameAr,
                sellingPrice,
                is_weighed_item: isWeighed
              }],
              timestamp: Date.now()
            }));
          }
        });
      }

      return {
        success: true,
        message: 'Produce item updated successfully',
        id,
        plu_code: pluCode,
        image_url: imageUrl,
        name_ar: nameAr,
        sellingPrice
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to update produce item', details: err?.message });
    }
  });

  // 18. Quick Add Weighed Produce Item
  fastify.post('/api/products/produce/add', { preHandler: managerAuth }, async (request, reply) => {
    try {
      const body = request.body || {};
      const name = String(body.name || '').trim();
      if (!name) return reply.code(400).send({ error: 'Product name required' });

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
      const vatRate = 0.0;

      await client.execute({
        sql: `INSERT INTO Product (id, barcode, name, name_ar, plu_code, image_url, sellingPrice, purchasePrice, unitCost, stockQuantity, minThreshold, maxThreshold, category, vatRate, is_weighed_item, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 9999, 10, 100, ?, ?, ?, CURRENT_TIMESTAMP)
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
        args: [id, barcode, name, nameAr, pluCode, imageUrl, sellingPrice, purchasePrice, unitCost, category, vatRate, isWeighed ? 1 : 0]
      });

      if (pluCode && isWeighed) {
        await client.execute({
          sql: `INSERT INTO QuickProduct (id, productId, category, sortOrder, updatedAt)
                VALUES (?, ?, 'PRODUCE', ?, CURRENT_TIMESTAMP)
                ON CONFLICT(productId) DO UPDATE SET
                  category = excluded.category,
                  sortOrder = excluded.sortOrder,
                  updatedAt = CURRENT_TIMESTAMP`,
          args: [`qp_${id}`, id, parseInt(pluCode, 10) || 50]
        }).catch(() => {});
      }

      await client.execute({
        sql: `INSERT INTO StoreInventory (id, storeId, productId, sellingPrice, unitCost, stockQuantity, updated_at)
              VALUES (?, ?, ?, ?, ?, 9999, CURRENT_TIMESTAMP)
              ON CONFLICT(storeId, productId) DO UPDATE SET
                sellingPrice = excluded.sellingPrice,
                unitCost = excluded.unitCost,
                updated_at = CURRENT_TIMESTAMP`,
        args: [`si_store_askar_01_${id}`, 'store_askar_01', id, sellingPrice, unitCost]
      });

      // Broadcast produce addition to connected hardware terminals
      if (fastify.websocketServer) {
        fastify.websocketServer.clients.forEach((c) => {
          if (c.readyState === 1) {
            c.send(JSON.stringify({
              type: 'PRODUCE_PRICES_UPDATED',
              itemId: id,
              plu_code: pluCode,
              is_weighed_item: isWeighed,
              name,
              sellingPrice
            }));
          }
        });
      }

      return {
        success: true,
        product: {
          id,
          name,
          barcode,
          plu_code: pluCode,
          image_url: imageUrl,
          name_ar: nameAr,
          sellingPrice,
          purchasePrice,
          unitCost,
          is_weighed_item: isWeighed,
          category
        }
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to add produce item', details: err?.message });
    }
  });
}
