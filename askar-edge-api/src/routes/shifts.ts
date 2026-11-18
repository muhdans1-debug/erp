import { Hono } from 'hono';
import { getDb, type Env } from '../db.ts';
import { tenantMiddleware, type TenantContext } from '../middleware/tenant.ts';
import { requirePosOrManagerAuth, requireManagerAuth } from '../middleware/auth.ts';
import { getRegionalIsoString } from '../utils/time.ts';

export const shiftsRouter = new Hono<{ Bindings: Env; Variables: TenantContext }>();

shiftsRouter.use('*', tenantMiddleware);

/**
 * Get Active / Current Shift for Cashier / Terminal
 */
const getActiveShiftHandler = async (c: any) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';
  const terminalId = c.get('terminalId') || 'R01';

  try {
    const res = await db.execute({
      sql: `SELECT * FROM Shift 
            WHERE (tenantId = ? OR tenantId IS NULL)
              AND (storeId = ? OR storeId IS NULL)
              AND (terminalId = ? OR terminalId IS NULL)
              AND status = 'OPEN' 
            ORDER BY openedAt DESC LIMIT 1`,
      args: [tenantId, storeId, terminalId]
    });

    const shift = res.rows && res.rows.length > 0 ? res.rows[0] : null;
    return c.json({
      success: true,
      active: !!shift,
      hasActiveShift: !!shift,
      shift
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to query active shift', details: err?.message }, 500);
  }
};

shiftsRouter.get('/active', getActiveShiftHandler);
shiftsRouter.get('/current', getActiveShiftHandler);

/**
 * Open a New Till Shift (Protected)
 */
shiftsRouter.post('/start', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';
  const terminalId = c.get('terminalId') || 'R01';

  try {
    const body = await c.req.json();
    const id = body.id || `shift_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const cashierName = body.cashierName || 'Cashier 1';
    const employeeId = body.employeeId || 'emp_cashier_1';
    const openingFloat = Number(body.openingFloat || body.openingCash || 50.0);
    const nowIso = getRegionalIsoString();

    // Audit-safe closure: Flag lingering uncounted shifts as ABANDONED_UNRECONCILED
    await db.execute({
      sql: `UPDATE Shift SET 
              status = 'ABANDONED_UNRECONCILED', 
              notes = COALESCE(notes || ' | ', '') || 'Auto-closed on new shift open', 
              closedAt = ? 
            WHERE storeId = ? AND terminalId = ? AND status = 'OPEN'`,
      args: [nowIso, storeId, terminalId]
    });

    // Create new shift
    await db.execute({
      sql: `INSERT INTO Shift (
              id, tenantId, storeId, terminalId, cashierName, employeeId,
              openingCash, openedAt, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
      args: [id, tenantId, storeId, terminalId, cashierName, employeeId, openingFloat, nowIso]
    });

    return c.json({
      success: true,
      message: 'Shift opened successfully',
      shiftId: id,
      shift: { id, tenantId, storeId, terminalId, cashierName, openingFloat, status: 'OPEN' }
    }, 201);
  } catch (err: any) {
    return c.json({ error: 'Failed to open shift', details: err?.message }, 500);
  }
});

/**
 * End / Reconcile Till Shift (Protected)
 * Supports /api/shifts/close, /api/shifts/:id/close, /api/shifts/end, and /api/shifts/:id/end
 */
const endShiftHandler = async (c: any) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';
  const terminalId = c.get('terminalId') || 'R01';

  try {
    const body = await c.req.json().catch(() => ({}));
    let shiftId = c.req.param('id') || body.shiftId || body.id;
    const actualCash = Number(body.actualCash || body.closingCash || 0);
    const notes = body.notes || '';

    // If no shiftId or generic placeholder, resolve active shift from DB scoped to this terminal
    if (!shiftId || shiftId === 'shift_current' || shiftId === 'current') {
      const activeRes = await db.execute({
        sql: `SELECT id FROM Shift 
              WHERE (tenantId = ? OR tenantId IS NULL)
                AND (storeId = ? OR storeId IS NULL)
                AND (terminalId = ? OR terminalId IS NULL)
                AND status = 'OPEN' 
              ORDER BY openedAt DESC LIMIT 1`,
        args: [tenantId, storeId, terminalId]
      });
      if (activeRes.rows && activeRes.rows.length > 0) {
        shiftId = activeRes.rows[0].id as string;
      } else {
        shiftId = `shift_${Date.now().toString(36)}`;
      }
    }

    // 1. Calculate total cash sales in this shift
    let cashSales = 0;
    try {
      const salesRes = await db.execute({
        sql: `SELECT 
                COALESCE(SUM(CASE WHEN paymentType = 'CASH' THEN total ELSE 0 END), 0) as cashTotal,
                COALESCE(SUM(CASE WHEN paymentType LIKE '%BENEFIT%' THEN total ELSE 0 END), 0) as benefitTotal,
                COALESCE(SUM(CASE WHEN paymentType = 'CARD' THEN total ELSE 0 END), 0) as cardTotal
              FROM Sale WHERE shiftId = ?`,
        args: [shiftId]
      });
      cashSales = Number((salesRes.rows[0] && salesRes.rows[0].cashTotal) || 0);
    } catch {}

    let openingFloat = 50.0;
    try {
      const shiftData = await db.execute({
        sql: `SELECT openingCash FROM Shift WHERE id = ? LIMIT 1`,
        args: [shiftId]
      });
      if (shiftData.rows && shiftData.rows.length > 0) {
        openingFloat = Number(shiftData.rows[0].openingCash || 50.0);
      }
    } catch {}

    const expectedDrawer = openingFloat + cashSales;
    const variance = Number((actualCash - expectedDrawer).toFixed(3));
    const nowIso = getRegionalIsoString();

    // Upsert shift closure so missing/offline shift records are cleanly reconciled
    await db.execute({
      sql: `INSERT INTO Shift (
              id, tenantId, storeId, terminalId, cashierName, employeeId,
              openingCash, closingCash, notes, status, openedAt, closedAt
            ) VALUES (?, ?, ?, ?, 'Cashier', 'emp_cashier_1', ?, ?, ?, 'CLOSED', ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              closingCash = excluded.closingCash,
              notes = excluded.notes,
              status = 'CLOSED',
              closedAt = ?`,
      args: [shiftId, tenantId, storeId, terminalId, openingFloat, actualCash, notes, nowIso, nowIso, nowIso]
    });

    return c.json({
      success: true,
      message: 'Shift reconciled and closed',
      reconciliation: {
        shiftId,
        openingFloat,
        cashSales,
        expectedDrawer,
        actualCash,
        variance,
        status: variance === 0 ? 'BALANCED' : (variance < 0 ? 'SHORT' : 'OVER')
      }
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to close shift', details: err?.message }, 500);
  }
};

shiftsRouter.post('/close', requirePosOrManagerAuth, endShiftHandler);
shiftsRouter.post('/:id/close', requirePosOrManagerAuth, endShiftHandler);
shiftsRouter.post('/end', requirePosOrManagerAuth, endShiftHandler);
shiftsRouter.post('/:id/end', requirePosOrManagerAuth, endShiftHandler);

/**
 * Shift & Cashier Auditor: Full Reconciliation Statement for Manager Back-Office & Audits
 */
const getShiftReconciliationHandler = async (c: any) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';

  try {
    const query = `
      SELECT 
        s.id, 
        s.openedAt as opened_at, 
        s.closedAt as closed_at, 
        COALESCE(s.openingCash, 50.0) as starting_cash, 
        s.closingCash as actual_cash, 
        s.status, 
        s.notes, 
        COALESCE(s.cashierName, 'Cashier 1') as cashier_name, 
        COALESCE(s.employeeId, 'emp_cashier_1') as employee_id, 
        COALESCE(SUM(CASE WHEN UPPER(sa.paymentType) = 'CASH' AND sa.total > 0 THEN sa.total ELSE 0 END), 0) as cash_sales, 
        COALESCE(SUM(CASE WHEN (UPPER(sa.paymentType) LIKE '%BENEFIT%' OR UPPER(sa.paymentType) = 'CARD') AND sa.total > 0 THEN sa.total ELSE 0 END), 0) as digital_sales, 
        COALESCE(SUM(CASE WHEN (UPPER(sa.paymentType) LIKE '%KHATA%' OR UPPER(sa.paymentType) LIKE '%CREDIT%') AND sa.total > 0 THEN sa.total ELSE 0 END), 0) as khata_sales,
        COALESCE(SUM(CASE WHEN sa.total < 0 THEN ABS(sa.total) ELSE 0 END), 0) as refunds
      FROM Shift s 
      LEFT JOIN Sale sa ON sa.shiftId = s.id 
      WHERE (s.tenantId = ? OR s.tenantId IS NULL)
        AND (s.storeId = ? OR s.storeId IS NULL)
      GROUP BY s.id 
      ORDER BY s.openedAt DESC 
      LIMIT 100;
    `;

    const res = await db.execute({
      sql: query,
      args: [tenantId, storeId]
    });

    const sessions = (res.rows || []).map((r: any) => {
      const starting = Number(r.starting_cash || 50.0);
      const cashSales = Number(r.cash_sales || 0);
      const digitalSales = Number(r.digital_sales || 0);
      const khataSales = Number(r.khata_sales || 0);
      const refunds = Number(r.refunds || 0);
      const expected = Number((starting + cashSales - refunds).toFixed(3));
      const actual = r.status === 'CLOSED' && r.actual_cash !== null && r.actual_cash !== undefined
        ? Number(r.actual_cash)
        : null;
      const variance = actual !== null ? Number((actual - expected).toFixed(3)) : null;

      return {
        id: r.id,
        shift_id: r.id,
        cashier_name: r.cashier_name || 'Cashier 1',
        cashier_role: 'CASHIER',
        employee_name: r.cashier_name || 'Cashier 1',
        employee_role: 'CASHIER',
        employee_id: r.employee_id || 'emp_cashier_1',
        opened_at: r.opened_at,
        closed_at: r.closed_at,
        starting_cash: starting,
        expected_cash: expected,
        actual_cash: actual,
        variance: variance,
        cash_sales: cashSales,
        digital_sales: digitalSales,
        khata_sales: khataSales,
        refunds: refunds,
        status: r.status || 'CLOSED',
        notes: r.notes || null,
        denominations: null
      };
    });

    return c.json({
      success: true,
      count: sessions.length,
      sessions
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch shift reconciliation', details: err?.message }, 500);
  }
};

shiftsRouter.get('/reconciliation', requireManagerAuth, getShiftReconciliationHandler);
shiftsRouter.get('/audits', requireManagerAuth, getShiftReconciliationHandler);
