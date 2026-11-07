import crypto from 'crypto';
import { db } from '../db.js';
import { managerAuth } from '../middleware/auth.js';

export default async function shiftRoutes(fastify, options) {
  // --- Shift Management, Blind Reconciliation, Cashier Login & Z-Reports ---
// --- SHIFT MANAGEMENT & BLIND RECONCILIATION ENGINE ---

const queryLocalDevDb = async (sql, params = []) => {
  try {
    const res = await db.execute({ sql, args: params });
    return res.rows || [];
  } catch (err) {
    fastify.log.warn(`[queryLocalDevDb] Error executing query: ${err.message}`);
    return [];
  }
};

// 0. Verify Employee 4-digit PIN for Instant Sunmi Login
fastify.post('/api/employees/verify-pin', async (request, reply) => {
  const { pin } = request.body || {};
  if (!pin) {
    return reply.status(400).send({ error: 'PIN code is required' });
  }

  const cleanPin = String(pin).trim();

  try {
    // 1. Try local LibSQL replica first for instant sub-millisecond response
    let rows = [];
    try {
      rows = await queryLocalDevDb(
        'SELECT id, name, pin_code, role, is_active FROM Employee WHERE pin_code = ? AND is_active = 1 LIMIT 1',
        [cleanPin]
      );
    } catch { }

    // 2. Fallback to db if needed
    if ((!rows || rows.length === 0) && db) {
      try {
        const res = await db.execute({
          sql: 'SELECT id, name, pin_code, role, is_active FROM Employee WHERE pin_code = ? AND is_active = 1 LIMIT 1',
          args: [cleanPin]
        });
        rows = res.rows || [];
      } catch { }
    }

    if (!rows || rows.length === 0) {
      return reply.status(401).send({ error: 'Invalid PIN code. Access denied.' });
    }

    const emp = rows[0];
    return {
      success: true,
      employee: {
        id: emp.id,
        name: emp.name,
        role: emp.role
      }
    };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Failed to verify PIN' });
  }
});

// Employee Management: List all employees (Manager Back-Office)
fastify.get('/api/employees', { preHandler: managerAuth }, async (request, reply) => {
  try {
    // pin_code is strictly removed from the SELECT statement to prevent network leakage
    let rows = await queryLocalDevDb(
      'SELECT id, tenantId, name, role, is_active, createdAt FROM Employee ORDER BY name ASC'
    );
    return { success: true, employees: rows };
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Database error' });
  }
});

// Employee Management: Create or update employee
fastify.post('/api/employees', async (request, reply) => {
  const { id, name, pin_code, role, is_active } = request.body || {};
  if (!name || !pin_code || !role) {
    return reply.status(400).send({ error: 'Name, 4-digit PIN, and role are required' });
  }

  const cleanPin = String(pin_code).trim();
  if (cleanPin.length !== 4) {
    return reply.status(400).send({ error: 'PIN must be exactly 4 digits' });
  }

  try {
    const empId = id || `emp_${crypto.randomUUID().slice(0, 8)}`;
    const empName = String(name).trim();
    const empRole = String(role).toUpperCase();
    const activeVal = is_active !== false ? 1 : 0;

    await queryLocalDevDb(`
      INSERT INTO Employee (id, tenantId, name, pin_code, role, is_active)
      VALUES (?, 'tenant_1', ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        pin_code = excluded.pin_code,
        role = excluded.role,
        is_active = excluded.is_active
    `, [empId, empName, cleanPin, empRole, activeVal]);

    // Mirror to db if available
    try {
      await db.execute({
        sql: `INSERT INTO Employee (id, tenantId, name, pin_code, role, is_active)
              VALUES (?, 'tenant_1', ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                pin_code = excluded.pin_code,
                role = excluded.role,
                is_active = excluded.is_active;`,
        args: [empId, empName, cleanPin, empRole, activeVal]
      });
    } catch { }

    return { success: true, message: 'Employee saved successfully', id: empId };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: err.message || 'Failed to save employee' });
  }
});

// 1. Start Shift (Opening Float & ShiftSession Creation)
fastify.post('/api/shifts/start', async (request, reply) => {
  const { cashierName, openingCash, employeeId } = request.body || {};
  const floatAmount = parseFloat(openingCash);
  if (isNaN(floatAmount) || floatAmount < 0) {
    return reply.status(400).send({ error: 'Valid opening float amount is required' });
  }

  // Check if there is already an open shift
  const existingOpen = await db.orm.Shift.where({ status: 'OPEN' }).all().first();
  if (existingOpen) {
    return {
      success: true,
      message: 'Active shift already exists.',
      shiftId: existingOpen.id,
      shift: existingOpen
    };
  }

  const shiftId = `shift_${crypto.randomUUID().slice(0, 8)}`;
  const empId = employeeId || 'emp_cashier_1';

  const newShift = {
    id: shiftId,
    cashierName: cashierName ? String(cashierName).trim() : 'Cashier 1',
    openingCash: Number(floatAmount.toFixed(3)),
    status: 'OPEN',
    tenantId: 'tenant_1',
    openedAt: new Date(),
    closedAt: null,
    closingCash: null,
    notes: null
  };

  await db.orm.Shift.create(newShift);

  // Persist to local LibSQL ShiftSession table
  try {
    await queryLocalDevDb(`
      INSERT INTO ShiftSession (id, tenantId, employee_id, starting_cash, status, opened_at)
      VALUES (?, 'tenant_1', ?, ?, 'OPEN', datetime('now'))
    `, [shiftId, empId, Number(floatAmount.toFixed(3))]);
  } catch (e) {
    fastify.log.warn(`Local ShiftSession insert error: ${e.message}`);
  }

  // Also mirror to Turso cloud
  try {
    await db.execute({
      sql: `INSERT INTO ShiftSession (id, tenantId, employee_id, starting_cash, status, opened_at)
            VALUES (?, 'tenant_1', ?, ?, 'OPEN', CURRENT_TIMESTAMP)`,
      args: [shiftId, empId, Number(floatAmount.toFixed(3))]
    });
  } catch { }

  fastify.log.info(`Shift started by ${newShift.cashierName} with Opening Float BD ${newShift.openingCash.toFixed(3)} (ID: ${newShift.id})`);
  return { success: true, shiftId: newShift.id, shift: newShift };
});

// 2. Get current active open shift
fastify.get('/api/shifts/current', async () => {
  const openShift = await db.orm.Shift.where({ status: 'OPEN' }).all().first();
  if (!openShift) {
    return { success: true, hasActiveShift: false, shift: null };
  }
  return { success: true, hasActiveShift: true, shift: openShift };
});

// 3. Blind Close Shift: Cashier declares actual cash (Hiding expected till total from cashier!)
const performShiftClose = async (requestedId, body, fastify, reply) => {
  const { closingCash, actualCash, notes, denominations, shiftId } = body || {};
  const countedCash = actualCash !== undefined ? parseFloat(actualCash) : parseFloat(closingCash || 0);

  const searchId = requestedId || shiftId;
  let shift = null;

  // 1. Try finding by requested ID if specific and not a placeholder
  if (searchId && searchId !== 'current' && searchId !== 'shift_current') {
    shift = await db.orm.Shift.where({ id: searchId }).all().first();
    // If the requested shift is already CLOSED, do not overwrite it!
    // A cashier closing shift again creates a new distinct session!
    if (shift && shift.status === 'CLOSED') {
      shift = null;
    }
  }

  // 2. If not found by ID or already closed, find the currently OPEN shift
  if (!shift) {
    shift = await db.orm.Shift.where({ status: 'OPEN' }).all().first();
  }

  // 3. If still not found, check ShiftSession in local replica for an OPEN shift
  if (!shift) {
    try {
      const openSession = await queryLocalDevDb(`SELECT * FROM ShiftSession WHERE status = 'OPEN' ORDER BY opened_at DESC LIMIT 1`);
      if (openSession && openSession.length > 0) {
        const sRow = openSession[0];
        shift = await db.orm.Shift.where({ id: String(sRow.id) }).all().first();
        if (!shift) {
          shift = await db.orm.Shift.create({
            id: String(sRow.id),
            cashierName: 'Cashier 1',
            status: 'OPEN',
            openingCash: Number(sRow.starting_cash || 50),
            openedAt: new Date(sRow.opened_at || Date.now())
          });
        }
      }
    } catch (e) {
      fastify.log.warn(`Error finding ShiftSession: ${e.message}`);
    }
  }

  // 4. CRITICAL FIX: If NO shift is currently OPEN, create a brand-new shift session!
  // NEVER overwrite an already closed shift from the past!
  if (!shift) {
    const newSessionId = `shift_${crypto.randomUUID().slice(0, 8)}`;
    shift = await db.orm.Shift.create({
      id: newSessionId,
      cashierName: 'Cashier 1',
      status: 'OPEN',
      openingCash: 50.0,
      openedAt: new Date()
    });
  }

  const id = shift.id;

  // Adopt any unlinked or client-side temporary shift sales into this shift
  if (searchId && searchId !== id && searchId !== 'current' && searchId !== 'shift_current') {
    try {
      await queryLocalDevDb(`UPDATE Sale SET shiftId = ? WHERE shiftId = ?`, [id, searchId]);
    } catch { }
  }
  try {
    const shiftOpenIso = shift.openedAt ? new Date(shift.openedAt).toISOString() : new Date().toISOString();
    await queryLocalDevDb(`UPDATE Sale SET shiftId = ? WHERE (shiftId IS NULL OR shiftId = '') AND createdAt >= ?`, [id, shiftOpenIso]);
  } catch { }

  // Calculate Expected Cash: Starting Float + Shift Cash Sales + Khata Cash Payments - Drawer Payouts - Refunds
  const zData = await calculateZReport(id);
  const startingFloat = Number(shift.openingCash || 0);
  const cashSales = Number(zData.cashSales || 0);
  const refundsCash = Number(zData.refunds || 0);
  const paidOuts = Number(zData.supplierPayments || 0);
  const expectedCash = Number((zData.expectedDrawerCash ?? (startingFloat + cashSales - refundsCash - paidOuts)).toFixed(3));
  const declaredCash = Number((isNaN(countedCash) ? 0 : countedCash).toFixed(3));
  const variance = Number((declaredCash - expectedCash).toFixed(3));

  const updateData = {
    status: 'CLOSED',
    closedAt: new Date(),
    closingCash: declaredCash,
    notes: notes ? String(notes).trim() : null
  };

  await db.orm.Shift.where({ id }).update(updateData);

  // Update or Insert ShiftSession in local replica
  try {
    await queryLocalDevDb(`
      INSERT INTO ShiftSession (
        id, tenantId, employee_id, opened_at, closed_at,
        starting_cash, expected_cash, actual_cash, variance,
        denominations, notes, status
      ) VALUES (
        ?, 'tenant_1', ?, ?, CURRENT_TIMESTAMP,
        ?, ?, ?, ?,
        ?, ?, 'CLOSED'
      )
      ON CONFLICT(id) DO UPDATE SET
        closed_at = CURRENT_TIMESTAMP,
        expected_cash = excluded.expected_cash,
        actual_cash = excluded.actual_cash,
        variance = excluded.variance,
        denominations = excluded.denominations,
        notes = excluded.notes,
        status = 'CLOSED'
    `, [
      id,
      shift.employeeId || 'emp_cashier_1',
      shift.openedAt ? new Date(shift.openedAt).toISOString() : new Date().toISOString(),
      startingFloat,
      expectedCash,
      declaredCash,
      variance,
      denominations ? JSON.stringify(denominations) : null,
      notes ? String(notes).trim() : null
    ]);
  } catch (e) {
    fastify.log.warn(`Local ShiftSession save error: ${e.message}`);
  }

  // Also mirror to Turso cloud in background
  try {
    await db.execute({
      sql: `INSERT INTO ShiftSession (
              id, tenantId, employee_id, opened_at, closed_at,
              starting_cash, expected_cash, actual_cash, variance,
              denominations, notes, status
            ) VALUES (?, 'tenant_1', 'emp_cashier_1', ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, 'CLOSED')
            ON CONFLICT(id) DO UPDATE SET
              closed_at = CURRENT_TIMESTAMP,
              expected_cash = excluded.expected_cash,
              actual_cash = excluded.actual_cash,
              variance = excluded.variance,
              denominations = excluded.denominations,
              notes = excluded.notes,
              status = 'CLOSED'`,
      args: [
        id,
        shift.openedAt ? new Date(shift.openedAt).toISOString() : new Date().toISOString(),
        startingFloat,
        expectedCash,
        declaredCash,
        variance,
        denominations ? JSON.stringify(denominations) : null,
        notes ? String(notes).trim() : null
      ]
    });
  } catch { }

  // Broadcast SHIFT_CLOSED across active Fastify WebSocket clients
  if (fastify.websocketServer?.clients) {
    fastify.websocketServer.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({
          type: 'SHIFT_CLOSED',
          payload: {
            shiftId: id,
            actualCash: declaredCash,
            expectedCash,
            variance
          },
          timestamp: new Date().toISOString()
        }));
      }
    });
  }

  const closedShift = await db.orm.Shift.where({ id }).all().first();
  fastify.log.info(`Shift ${id} blind-closed: Expected BHD ${expectedCash}, Actual BHD ${declaredCash}, Variance: ${variance} BHD`);

  return {
    success: true,
    message: 'Shift blind-closed successfully',
    shift: closedShift,
    shiftId: id,
    reconciliation: {
      startingFloat,
      cashSales,
      paidOuts,
      expectedCash,
      actualCash: declaredCash,
      variance,
      verdict: variance === 0 ? 'PERFECT' : (variance < 0 ? 'SHORT' : 'OVER')
    }
  };
};

fastify.post('/api/shifts/:id/close', async (request, reply) => {
  return performShiftClose(request.params.id, request.body, fastify, reply);
});

fastify.post('/api/shifts/close', async (request, reply) => {
  return performShiftClose(null, request.body, fastify, reply);
});

// 4. List all Shift Sessions with full Reconciliation Statement for Manager Back-Office
fastify.get('/api/shifts/reconciliation', async (request, reply) => {
  try {
    let rows = [];
    try {
      const baseSessions = await queryLocalDevDb(`
        SELECT 
          s.id,
          s.id as shift_id,
          COALESCE(e.name, 'Cashier 1') as cashier_name,
          COALESCE(e.role, 'CASHIER') as cashier_role,
          COALESCE(e.id, 'emp_cashier_1') as employee_id,
          s.opened_at,
          s.closed_at,
          s.starting_cash,
          s.actual_cash,
          s.expected_cash,
          s.variance,
          s.denominations,
          s.notes,
          s.status
        FROM ShiftSession s
        LEFT JOIN Employee e ON s.employee_id = e.id
        ORDER BY COALESCE(s.closed_at, s.opened_at) DESC
        LIMIT 50;
      `);

      for (const s of baseSessions) {
        // Query direct sales for this specific shift ID
        const saleStats = await queryLocalDevDb(`
          SELECT 
            COALESCE(SUM(CASE WHEN UPPER(paymentType) = 'CASH' AND total > 0 THEN total ELSE 0 END), 0) as cash_sales,
            COALESCE(SUM(CASE WHEN (UPPER(paymentType) = 'BENEFIT_PAY' OR UPPER(paymentType) = 'BENEFIT' OR UPPER(paymentType) = 'CARD') AND total > 0 THEN total ELSE 0 END), 0) as digital_sales,
            COALESCE(SUM(CASE WHEN (UPPER(paymentType) = 'KHATA' OR UPPER(paymentType) = 'CREDIT' OR UPPER(paymentType) = 'MESS_KHATA') AND total > 0 THEN total ELSE 0 END), 0) as khata_sales,
            COALESCE(SUM(CASE WHEN total < 0 THEN ABS(total) ELSE 0 END), 0) as refunds,
            COUNT(*) as sale_count
          FROM Sale
          WHERE shiftId = ?
        `, [s.id]);

        const stats = saleStats && saleStats.length > 0 ? saleStats[0] : {};
        let cashSales = Number(stats.cash_sales || 0);
        let digitalSales = Number(stats.digital_sales || 0);
        let khataSales = Number(stats.khata_sales || 0);
        let refunds = Number(stats.refunds || 0);

        // If no sales tagged with shiftId, derive cash sales from expected_cash - starting_cash
        if (Number(stats.sale_count || 0) === 0) {
          if (s.expected_cash !== null && s.starting_cash !== null && Number(s.expected_cash) >= Number(s.starting_cash)) {
            cashSales = Number((Number(s.expected_cash) - Number(s.starting_cash)).toFixed(3));
          }
        }

        const startingCash = Number(s.starting_cash || 0);
        const expectedCash = s.expected_cash !== null && s.expected_cash !== undefined
          ? Number(s.expected_cash)
          : Number((startingCash + cashSales - refunds).toFixed(3));
        const actualCash = s.status === 'CLOSED' && s.actual_cash !== null && s.actual_cash !== undefined
          ? Number(s.actual_cash)
          : null;
        const variance = actualCash !== null ? Number((actualCash - expectedCash).toFixed(3)) : null;

        rows.push({
          ...s,
          starting_cash: startingCash,
          expected_cash: expectedCash,
          actual_cash: actualCash,
          variance: variance,
          cash_sales: cashSales,
          digital_sales: digitalSales,
          khata_sales: khataSales,
          refunds: refunds
        });
      }
    } catch (err) {
      fastify.log.warn(`Shift reconciliation dev.db error: ${err.message}`);
    }

    const sessionIds = new Set(rows.map(r => r.id));

    // Also merge any historical shifts from Shift table that are not yet in ShiftSession
    try {
      const allShifts = await db.orm.Shift.all();
      for (const shift of allShifts) {
        if (!sessionIds.has(shift.id)) {
          const starting = Number(shift.openingCash || 0);
          const actual = shift.closingCash !== null && shift.closingCash !== undefined ? Number(shift.closingCash) : null;
          let cashSales = 0;
          let digitalSales = 0;
          let khataSales = 0;

          try {
            const zData = await calculateZReport(shift.id);
            cashSales = Number(zData.cashSales || 0);
            digitalSales = Number(zData.benefitSales || 0) + Number(zData.cardSales || 0);
          } catch { }

          const expected = starting + cashSales;
          const variance = actual !== null ? Number((actual - expected).toFixed(3)) : null;

          rows.push({
            id: shift.id,
            shift_id: shift.id,
            opened_at: shift.openedAt ? new Date(shift.openedAt).toISOString() : new Date().toISOString(),
            closed_at: shift.closedAt ? new Date(shift.closedAt).toISOString() : null,
            starting_cash: starting,
            expected_cash: expected,
            actual_cash: actual,
            variance: variance,
            cash_sales: cashSales,
            digital_sales: digitalSales,
            khata_sales: khataSales,
            denominations: null,
            notes: shift.notes || null,
            status: shift.status || 'CLOSED',
            cashier_name: shift.cashierName || 'Cashier 1',
            cashier_role: 'CASHIER',
            employee_name: shift.cashierName || 'Cashier 1',
            employee_role: 'CASHIER',
            employee_id: 'emp_cashier_1'
          });
        }
      }
    } catch { }

    const parseTime = (dateStr) => {
      if (!dateStr) return 0;
      const clean = String(dateStr).includes('T') ? String(dateStr) : String(dateStr).replace(' ', 'T') + (String(dateStr).endsWith('Z') ? '' : 'Z');
      const d = new Date(clean);
      return isNaN(d.getTime()) ? (new Date(dateStr).getTime() || 0) : d.getTime();
    };

    // Sort order:
    // 1. OPEN shifts always at the top (currently in progress)
    // 2. CLOSED shifts ordered by closed_at DESC (the most recently closed shift is IMMEDIATELY at the top of history!)
    // 3. Fallback to opened_at DESC
    rows.sort((a, b) => {
      if (a.status === 'OPEN' && b.status !== 'OPEN') return -1;
      if (b.status === 'OPEN' && a.status !== 'OPEN') return 1;
      const closedDiff = parseTime(b.closed_at) - parseTime(a.closed_at);
      if (closedDiff !== 0) return closedDiff;
      return parseTime(b.opened_at) - parseTime(a.opened_at);
    });

    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    return { success: true, sessions: rows };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Failed to fetch shift reconciliation' });
  }
});

// 5. List recent shifts for legacy audit
fastify.get('/api/shifts', async () => {
  const allShifts = await db.orm.Shift.all();
  allShifts.sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
  return { success: true, shifts: allShifts };
});

// Helper: Calculate Comprehensive Z-Report with Opening Float & Supplier Payments
const calculateZReport = async (shiftId = null) => {
  let shift = null;
  if (shiftId) {
    shift = await db.orm.Shift.where({ id: shiftId }).all().first();
  }
  if (!shift) {
    shift = await db.orm.Shift.where({ status: 'OPEN' }).all().first();
    if (!shift) {
      const allShifts = await db.orm.Shift.all();
      allShifts.sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
      shift = allShifts[0] || null;
    }
  }

  const openingCash = shift ? Number(shift.openingCash || 0) : 50.0;
  const startTime = shift ? new Date(shift.openedAt) : (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const endTime = shift && shift.closedAt ? new Date(shift.closedAt) : new Date();

  // 1. Fetch sales for the shift period
  let allSales = [];
  try {
    allSales = await db.orm.Sale.all();
  } catch {
    allSales = [];
  }

  // Prefer sales strictly assigned to this shift ID
  let shiftSales = shift ? allSales.filter((sale) => sale.shiftId === shift.id) : [];
  if (shiftSales.length === 0) {
    shiftSales = allSales.filter((sale) => {
      const d = new Date(sale.createdAt);
      return d >= startTime && d <= endTime;
    });
  }

  let cashSales = 0;
  let benefitSales = 0;
  let cardSales = 0;
  let khataSales = 0;
  let refunds = 0;

  shiftSales.forEach((sale) => {
    const total = Number(sale.total) || 0;
    const pType = String(sale.paymentType || '').toUpperCase().trim();
    if (total < 0) {
      refunds += Math.abs(total);
    } else if (pType === 'CASH') {
      cashSales += total;
    } else if (pType === 'BENEFIT_PAY' || pType === 'BENEFIT') {
      benefitSales += total;
    } else if (pType === 'CARD') {
      cardSales += total;
    } else if (pType === 'KHATA' || pType === 'CREDIT' || pType === 'MESS_KHATA') {
      khataSales += total;
    } else {
      cashSales += total;
    }
  });

  // 2. Fetch cash drawer payouts during shift (e.g., Almarai/Coca-Cola supplier invoices, petty cash)
  let allExpenses = [];
  try {
    allExpenses = await db.orm.Expense.all();
  } catch {
    allExpenses = [];
  }

  const shiftExpenses = allExpenses.filter((exp) => {
    const d = new Date(exp.createdAt);
    return d >= startTime && d <= endTime;
  });

  let supplierPayments = 0;
  shiftExpenses.forEach((exp) => {
    supplierPayments += Number(exp.amount) || 0;
  });

  // 2b. Fetch Khata customer cash collections deposited into till drawer during this shift
  let allLedger = [];
  try {
    allLedger = await db.orm.KhataLedger.all();
  } catch {
    allLedger = [];
  }

  const shiftKhataCash = (allLedger || []).filter((entry) => {
    const d = new Date(entry.timestamp || entry.createdAt || entry.created_at);
    const isWithinShift = d >= startTime && d <= endTime;
    const isPayment = entry.type === 'PAYMENT' || Number(entry.amount) < 0;
    const isCash = !entry.reference || !String(entry.reference).toLowerCase().includes('benefit');
    return isWithinShift && isPayment && isCash;
  }).reduce((sum, entry) => sum + Math.abs(Number(entry.amount) || 0), 0);

  // 3. THE MASTER FORMULA:
  // expectedDrawerCash = openingCash + cashSales + shiftKhataCash - refunds - supplierPayments
  const rawExpected = openingCash + cashSales + shiftKhataCash - refunds - supplierPayments;
  const expectedDrawerCash = Number(Math.max(0, rawExpected).toFixed(3));

  return {
    date: new Date().toLocaleDateString('en-GB'),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    shiftId: shift ? shift.id : null,
    cashierName: shift ? shift.cashierName : 'Cashier 1',
    shiftStatus: shift ? shift.status : 'OPEN',
    openedAt: shift ? shift.openedAt : startTime.toISOString(),
    closedAt: shift ? shift.closedAt : null,
    openingCash: Number(openingCash.toFixed(3)),
    totalSales: Number((cashSales + benefitSales + cardSales + khataSales).toFixed(3)),
    cashSales: Number(cashSales.toFixed(3)),
    benefitSales: Number(benefitSales.toFixed(3)),
    cardSales: Number(cardSales.toFixed(3)),
    digitalSales: Number((benefitSales + cardSales).toFixed(3)),
    khataSales: Number(khataSales.toFixed(3)),
    khataCashCollected: Number(shiftKhataCash.toFixed(3)),
    refunds: Number(refunds.toFixed(3)),
    drawerCashOut: Number(supplierPayments.toFixed(3)),
    supplierPayments: Number(supplierPayments.toFixed(3)),
    expectedDrawerCash,
    transactionCount: shiftSales.length,
    shiftExpensesCount: shiftExpenses.length,
  };
};

// Generate End of Day Z-Report by specific Shift ID
fastify.get('/api/reports/z-report/:shiftId', async (request, reply) => {
  const { shiftId } = request.params;
  try {
    const report = await calculateZReport(shiftId);
    return { success: true, report };
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to generate Z-Report for shift' });
  }
});

// Generate End of Day Z-Report (Current Shift or Active Day)
fastify.get('/api/reports/z-report', async (request, reply) => {
  try {
    const report = await calculateZReport(null);
    return { success: true, report };
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to generate Z-Report' });
  }
});

}
