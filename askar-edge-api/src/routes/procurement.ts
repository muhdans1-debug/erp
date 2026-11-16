import { Hono } from 'hono';
import { getDb, type Env } from '../db.ts';
import { tenantMiddleware, type TenantContext } from '../middleware/tenant.ts';
import { requireManagerAuth } from '../middleware/auth.ts';

export const procurementRouter = new Hono<{ Bindings: Env; Variables: TenantContext }>();

procurementRouter.use('*', tenantMiddleware);

// 1. Fetch pending draft purchase orders
procurementRouter.get('/drafts', async (c) => {
  const db = getDb(c.env);
  try {
    const res = await db.execute({
      sql: `SELECT po.*, d.whatsappNumber as distWhatsApp, d.minimumOrderValue 
            FROM PurchaseOrder po
            LEFT JOIN Distributor d ON po.distributorId = d.id
            WHERE po.status = 'DRAFT'
            ORDER BY po.createdAt DESC`
    });
    return c.json({ success: true, drafts: res.rows });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch draft purchase orders', details: err?.message }, 500);
  }
});

// 2. Fetch in-transit purchase orders (for front-counter receiving)
procurementRouter.get('/transit', async (c) => {
  const db = getDb(c.env);
  try {
    const res = await db.execute({
      sql: `SELECT po.*, d.whatsappNumber as distWhatsApp 
            FROM PurchaseOrder po
            LEFT JOIN Distributor d ON po.distributorId = d.id
            WHERE po.status IN ('IN_TRANSIT', 'SENT', 'APPROVED')
            ORDER BY po.createdAt DESC`
    });
    return c.json({ success: true, orders: res.rows });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch transit orders', details: err?.message }, 500);
  }
});

// 3. Fetch all purchase orders (history)
procurementRouter.get('/', async (c) => {
  const db = getDb(c.env);
  try {
    const res = await db.execute({
      sql: `SELECT * FROM PurchaseOrder ORDER BY createdAt DESC LIMIT 100`
    });
    return c.json({ success: true, orders: res.rows });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch purchase orders', details: err?.message }, 500);
  }
});

// 4. Approve PO
procurementRouter.post('/:id/approve', requireManagerAuth, async (c) => {
  const db = getDb(c.env);
  const id = String(c.req.param('id') || '');
  try {
    const check = await db.execute({
      sql: `SELECT * FROM PurchaseOrder WHERE id = ?`,
      args: [id]
    });
    if (!check.rows || check.rows.length === 0) {
      return c.json({ error: 'Purchase Order not found' }, 404);
    }

    await db.execute({
      sql: `UPDATE PurchaseOrder SET status = 'APPROVED', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [id]
    });

    return c.json({ success: true, message: 'Purchase Order approved for dispatch' });
  } catch (err: any) {
    return c.json({ error: 'Failed to approve PO', details: err?.message }, 500);
  }
});

// 5. Receive PO and update Product stock
procurementRouter.post('/:id/receive', requireManagerAuth, async (c) => {
  const db = getDb(c.env);
  const id = String(c.req.param('id') || '');
  const tenantId = (c.get('tenantId') as string) || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = (c.get('storeId') as string) || c.env.DEFAULT_STORE_ID || 'store_askar_01';

  try {
    let body: any = {};
    try { body = await c.req.json(); } catch {}
    const receivedItems = body?.receivedItems;

    const check = await db.execute({
      sql: `SELECT * FROM PurchaseOrder WHERE id = ?`,
      args: [id]
    });
    if (!check.rows || check.rows.length === 0) {
      return c.json({ error: 'Purchase Order not found' }, 404);
    }

    const po = check.rows[0];
    let itemsToProcess = Array.isArray(receivedItems) && receivedItems.length > 0
      ? receivedItems
      : (typeof po.itemsJson === 'string' ? JSON.parse(po.itemsJson) : (po.itemsJson || []));

    for (const item of itemsToProcess) {
      const qtyToAdd = Number(item.qty ?? item.received_qty ?? item.reorderQuantity ?? 0);
      if (qtyToAdd > 0) {
        let prodId = item.id ? String(item.id) : null;
        if (!prodId && item.barcode) {
          const pRow = await db.execute({
            sql: `SELECT id FROM Product WHERE barcode = ? LIMIT 1`,
            args: [String(item.barcode)]
          });
          if (pRow.rows && pRow.rows.length > 0) {
            prodId = String(pRow.rows[0].id);
          }
        }

        if (prodId) {
          // 1. Update master Product stock
          await db.execute({
            sql: `UPDATE Product SET stockQuantity = stockQuantity + ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
            args: [qtyToAdd, prodId]
          });

          // 2. Synchronize StoreInventory stock for the active store
          await db.execute({
            sql: `INSERT INTO StoreInventory (id, tenantId, storeId, productId, stockQuantity, sellingPrice, unitCost, minThreshold, maxThreshold, updated_at)
                  VALUES (?, ?, ?, ?, ?, COALESCE((SELECT sellingPrice FROM Product WHERE id = ?), 0), COALESCE((SELECT unitCost FROM Product WHERE id = ?), 0), 10, 100, CURRENT_TIMESTAMP)
                  ON CONFLICT(storeId, productId) DO UPDATE SET
                    stockQuantity = StoreInventory.stockQuantity + excluded.stockQuantity,
                    updated_at = CURRENT_TIMESTAMP`,
            args: [`si_${storeId}_${prodId}`, tenantId, storeId, prodId, qtyToAdd, prodId, prodId]
          });
        }
      }
    }

    await db.execute({
      sql: `UPDATE PurchaseOrder SET status = 'RECEIVED', itemsJson = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [JSON.stringify(itemsToProcess), id]
    });

    return c.json({ success: true, message: 'Delivery successfully ingested and stock updated.' });
  } catch (err: any) {
    return c.json({ error: 'Failed to receive delivery', details: err?.message }, 500);
  }
});

// 6. Discard or cancel PO
procurementRouter.post('/:id/discard', requireManagerAuth, async (c) => {
  const db = getDb(c.env);
  const id = String(c.req.param('id') || '');
  try {
    await db.execute({
      sql: `DELETE FROM PurchaseOrder WHERE id = ?`,
      args: [id]
    });
    return c.json({ success: true, message: 'PO discarded' });
  } catch (err: any) {
    return c.json({ error: 'Failed to discard PO', details: err?.message }, 500);
  }
});

