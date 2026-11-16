import { Hono } from 'hono';
import { getDb, type Env } from '../db.ts';
import { tenantMiddleware, type TenantContext } from '../middleware/tenant.ts';
import { requireManagerAuth } from '../middleware/auth.ts';

export const storesRouter = new Hono<{ Bindings: Env; Variables: TenantContext }>();

storesRouter.use('*', tenantMiddleware);

/**
 * List All Stores under Tenant
 */
storesRouter.get('/', async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';

  try {
    const res = await db.execute({
      sql: `SELECT s.*, count(t.id) as activeTerminals
            FROM Store s
            LEFT JOIN TerminalLicense t ON s.id = t.storeId AND t.status = 'ACTIVE'
            WHERE s.tenantId = ?
            GROUP BY s.id
            ORDER BY s.code ASC`,
      args: [tenantId]
    });

    return c.json({ success: true, count: res.rows.length, stores: res.rows });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch stores', details: err?.message }, 500);
  }
});

/**
 * Create a New Store / Branch (Manager Protected)
 */
storesRouter.post('/', requireManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';

  try {
    const body = await c.req.json();
    const id = body.id || `store_${Date.now().toString().slice(-6)}`;
    const code = (body.code || `S0${Date.now().toString().slice(-2)}`).toUpperCase().trim();
    const name = (body.name || 'New Branch').trim();
    const address = body.address || 'Kingdom of Bahrain';
    const phone = body.phone || null;

    await db.execute({
      sql: `INSERT INTO Store (id, tenantId, code, name, address, phone, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
      args: [id, tenantId, code, name, address, phone]
    });

    return c.json({ success: true, store: { id, tenantId, code, name, address, phone } }, 201);
  } catch (err: any) {
    return c.json({ error: 'Failed to create store', details: err?.message }, 500);
  }
});

/**
 * Pair or Authenticate a Sunmi POS Hardware Terminal
 */
storesRouter.post('/terminals/pair', async (c) => {
  const db = getDb(c.env);

  try {
    const body = await c.req.json();
    const serialNumber = (body.serialNumber || body.serial || '').trim();
    const pairingCode = (body.pairingCode || '').trim();
    const deviceModel = body.deviceModel || 'Sunmi D2mini';

    if (!serialNumber) {
      return c.json({ error: 'Device serial number required' }, 400);
    }

    // 1. Check if terminal is already registered & active
    const existing = await db.execute({
      sql: `SELECT t.*, s.name as storeName, s.code as storeCode, tn.name as tenantName
            FROM TerminalLicense t
            JOIN Store s ON t.storeId = s.id
            JOIN Tenant tn ON t.tenantId = tn.id
            WHERE t.serialNumber = ? AND t.status = 'ACTIVE' LIMIT 1`,
      args: [serialNumber]
    });

    if (existing.rows && existing.rows.length > 0) {
      const term = existing.rows[0];
      // Update heartbeat
      await db.execute({
        sql: `UPDATE TerminalLicense SET lastHeartbeat = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [term.id]
      });

      return c.json({
        success: true,
        paired: true,
        tenantId: term.tenantId,
        storeId: term.storeId,
        terminalCode: term.terminalCode,
        storeName: term.storeName,
        tenantName: term.tenantName,
        message: 'Terminal hardware license validated successfully'
      });
    }

    // 2. If not registered, check pairing code
    if (pairingCode) {
      const pairMatch = await db.execute({
        sql: `SELECT t.*, s.name as storeName, s.code as storeCode
              FROM TerminalLicense t
              JOIN Store s ON t.storeId = s.id
              WHERE t.pairingCode = ? AND (t.status = 'PENDING' OR t.serialNumber IS NULL) LIMIT 1`,
        args: [pairingCode]
      });

      if (pairMatch.rows && pairMatch.rows.length > 0) {
        const license = pairMatch.rows[0];
        await db.execute({
          sql: `UPDATE TerminalLicense 
                SET serialNumber = ?, deviceModel = ?, status = 'ACTIVE', pairingCode = NULL, lastHeartbeat = CURRENT_TIMESTAMP
                WHERE id = ?`,
          args: [serialNumber, deviceModel, license.id]
        });

        return c.json({
          success: true,
          paired: true,
          tenantId: license.tenantId,
          storeId: license.storeId,
          terminalCode: license.terminalCode,
          storeName: license.storeName,
          message: 'Hardware terminal paired and activated successfully'
        });
      }
    }

    return c.json({
      error: 'Terminal hardware not licensed. Please pair from the Back-Office Admin Portal.',
      serialNumber,
      requiresPairing: true
    }, 403);
  } catch (err: any) {
    return c.json({ error: 'Pairing failed', details: err?.message }, 500);
  }
});

/**
 * Terminal Heartbeat (Telemetry & Online Status)
 */
storesRouter.post('/terminals/heartbeat', async (c) => {
  const db = getDb(c.env);
  try {
    const body = await c.req.json();
    const serial = body.serialNumber || body.serial;
    if (serial) {
      await db.execute({
        sql: `UPDATE TerminalLicense SET lastHeartbeat = CURRENT_TIMESTAMP WHERE serialNumber = ?`,
        args: [serial]
      });
    }
    return c.json({ status: 'ok', time: new Date().toISOString() });
  } catch {
    return c.json({ status: 'ok' });
  }
});
