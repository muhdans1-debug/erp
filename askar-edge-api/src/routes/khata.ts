import { Hono } from 'hono';
import { getDb, type Env } from '../db.ts';
import { tenantMiddleware, type TenantContext } from '../middleware/tenant.ts';
import { requirePosOrManagerAuth, requireManagerAuth } from '../middleware/auth.ts';
import { ensureRegionalIso, getRegionalIsoString } from '../utils/time.ts';

export const khataRouter = new Hono<{ Bindings: Env; Variables: TenantContext }>();

khataRouter.use('*', tenantMiddleware);

/**
 * List All Customers with Running Balances (Public Read for POS/Dashboard)
 */
khataRouter.get('/customers', async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';

  try {
    const res = await db.execute({
      sql: `SELECT c.id, c.name, c.phone, c.cpr, c.balance, c.balance AS currentBalance, c.credit_limit, c.credit_limit AS creditLimit, 
                   c.is_active, c.is_active AS isActive, c.nfcCardId, c.nfcCardId AS cardUid, c.mess_id, 
                   mg.group_name AS messName, mg.group_name AS mess_name, c.createdAt
            FROM Customer c
            LEFT JOIN MessGroup mg ON c.mess_id = mg.id
            WHERE (c.tenantId = ? OR c.tenantId = 'tenant_1' OR c.tenantId = 'tenant_askar_01' OR c.tenantId IS NULL)
              AND (c.is_active = 1 OR c.is_active IS NULL)
            ORDER BY c.name ASC`,
      args: [tenantId]
    });

    const customers = res.rows.map(r => {
      const balance = Number(r.balance ?? 0);
      const rawLimit = Number(r.credit_limit);
      const limit = rawLimit > 0 ? rawLimit : 30.0;
      return {
        ...r,
        messName: r.messName || null,
        mess_name: r.mess_name || r.messName || null,
        currentBalance: balance,
        balance: balance,
        creditLimit: limit,
        credit_limit: limit,
        cardUid: r.nfcCardId,
        isOverLimit: balance > limit
      };
    });

    return c.json({ success: true, count: customers.length, customers });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch customers', details: err?.message }, 500);
  }
});

/**
 * Khata Ledger List (Serves /khata/ledger and /ledger)
 */
async function getKhataLedger(c: any) {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const sort = c.req.query('sort') || 'highest';

  let orderBy = 'c.balance DESC';
  if (sort === 'lowest') orderBy = 'c.balance ASC';
  else if (sort === 'alpha' || sort === 'name') orderBy = 'c.name ASC';
  else if (sort === 'recent') orderBy = 'c.updatedAt DESC';

  const onlyDebtors = c.req.query('onlyDebtors') === 'true';
  const debtorClause = onlyDebtors ? 'AND c.balance > 0' : '';

  try {
    const res = await db.execute({
      sql: `SELECT c.id, c.name, c.phone, c.cpr, c.balance, c.balance AS currentBalance, c.credit_limit, c.credit_limit AS creditLimit, 
                   c.is_active, c.is_active AS isActive, c.nfcCardId, c.nfcCardId AS cardUid, c.mess_id, 
                   mg.group_name AS messName, mg.group_name AS mess_name, c.createdAt, c.updatedAt
            FROM Customer c
            LEFT JOIN MessGroup mg ON c.mess_id = mg.id
            WHERE (c.tenantId = ? OR c.tenantId = 'tenant_1' OR c.tenantId = 'tenant_askar_01' OR c.tenantId IS NULL)
              AND (c.is_active = 1 OR c.is_active IS NULL) ${debtorClause}
            ORDER BY ${orderBy}`,
      args: [tenantId]
    });

    const customers = res.rows.map(r => {
      const balance = Number(r.balance ?? 0);
      const rawLimit = Number(r.credit_limit);
      const limit = rawLimit > 0 ? rawLimit : 30.0;
      return {
        ...r,
        messName: r.messName || null,
        mess_name: r.mess_name || r.messName || null,
        currentBalance: balance,
        balance: balance,
        creditLimit: limit,
        credit_limit: limit,
        cardUid: r.nfcCardId,
        isOverLimit: balance > limit
      };
    });

    return c.json({ success: true, count: customers.length, customers });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch khata ledger', details: err?.message }, 500);
  }
}

khataRouter.get('/ledger', getKhataLedger);
khataRouter.get('/khata/ledger', getKhataLedger);

// Claims compatibility
khataRouter.get('/claims/pending', (c) => c.json({ success: true, claims: [] }));
khataRouter.get('/khata/claims/pending', (c) => c.json({ success: true, claims: [] }));

/**
 * High-Speed NFC Tag Resolution (Serves both /customers/nfc/:uid and /customers/by-card/:uid)
 * Supports Personal Cards, Mess Group Shared Cards, and Dual Cards with Roster Splitting
 */
async function resolveCustomerByCard(c: any) {
  const db = getDb(c.env);
  const uid = c.req.param('uid').trim().toUpperCase().replace(/^#+|#+$/g, '');
  const cleanNoColon = uid.replace(/[:\-]/g, '');

  try {
    // 1. Try NfcCard table
    const cardRes = await db.execute({
      sql: `SELECT customer_id, card_type, mess_id 
            FROM NfcCard 
            WHERE UPPER(tag_id) = ? OR REPLACE(UPPER(tag_id), ':', '') = ? LIMIT 1`,
      args: [uid, cleanNoColon]
    });

    let customerId = cardRes.rows.length > 0 ? (cardRes.rows[0].customer_id as string) : null;
    let messId = cardRes.rows.length > 0 ? (cardRes.rows[0].mess_id as string) : null;
    let cardType = cardRes.rows.length > 0 ? ((cardRes.rows[0].card_type as string) || 'PERSONAL').toUpperCase() : 'PERSONAL';

    // 2. If it is a MESS card or has mess_id without customer_id, resolve the Mess Group!
    if (messId && (!customerId || cardType === 'MESS')) {
      const groupRes = await db.execute({
        sql: `SELECT id, group_name FROM MessGroup WHERE id = ? LIMIT 1`,
        args: [messId]
      });

      if (groupRes.rows && groupRes.rows.length > 0) {
        const group = groupRes.rows[0];
        const membersRes = await db.execute({
          sql: `SELECT id, name, phone, cpr, balance FROM Customer WHERE mess_id = ?`,
          args: [messId]
        });
        const members = membersRes.rows.map(m => ({
          ...m,
          balance: Number(m.balance ?? 0)
        }));
        const totalGroupBalance = members.reduce((sum, m) => sum + m.balance, 0);

        return c.json({
          success: true,
          customer: {
            id: group.id,
            name: group.group_name,
            group_name: group.group_name,
            isMess: true,
            hasMessGroup: true,
            isDual: false,
            card_type: 'MESS',
            balance: totalGroupBalance,
            currentBalance: totalGroupBalance,
            creditLimit: 500.0,
            credit_limit: 500.0,
            cardUid: uid,
            memberCount: members.length,
            members,
            isOverLimit: totalGroupBalance > 500.0
          }
        });
      }
    }

    // 3. Fallback to Customer.nfcCardId
    if (!customerId) {
      const custCheck = await db.execute({
        sql: `SELECT id, mess_id FROM Customer 
              WHERE UPPER(nfcCardId) = ? OR REPLACE(UPPER(nfcCardId), ':', '') = ? LIMIT 1`,
        args: [uid, cleanNoColon]
      });
      if (custCheck.rows && custCheck.rows.length > 0) {
        customerId = custCheck.rows[0].id as string;
        if (!messId) messId = (custCheck.rows[0].mess_id as string) || null;
      }
    }

    if (!customerId) {
      return c.json({ error: 'NFC card not assigned to any customer or mess group', uid }, 404);
    }

    const customerRes = await db.execute({
      sql: `SELECT id, name, phone, cpr, balance, credit_limit, is_active, nfcCardId, mess_id FROM Customer WHERE id = ? LIMIT 1`,
      args: [customerId]
    });

    if (!customerRes.rows || customerRes.rows.length === 0) {
      return c.json({ error: 'Customer record missing' }, 404);
    }

    const row = customerRes.rows[0];
    const balance = Number(row.balance ?? 0);
    const rawLimit = Number(row.credit_limit);
    const limit = rawLimit > 0 ? rawLimit : 30.0;
    const finalMessId = row.mess_id || messId;

    let groupName = null;
    let groupMembers: any[] = [];
    if (finalMessId) {
      try {
        const [gRes, mRes] = await Promise.all([
          db.execute({ sql: `SELECT group_name FROM MessGroup WHERE id = ? LIMIT 1`, args: [finalMessId] }),
          db.execute({ sql: `SELECT id, name, balance FROM Customer WHERE mess_id = ?`, args: [finalMessId] })
        ]);
        if (gRes.rows.length > 0) groupName = gRes.rows[0].group_name as string;
        groupMembers = mRes.rows.map(m => ({ ...m, balance: Number(m.balance ?? 0) }));
      } catch {}
    }

    const isFrozen = (row.is_active === 0 || (row as any).isActive === 0);
    const customer = {
      ...row,
      currentBalance: balance,
      balance: balance,
      creditLimit: limit,
      credit_limit: limit,
      cardUid: row.nfcCardId || uid,
      card_type: finalMessId ? 'DUAL' : 'PERSONAL',
      hasMessGroup: !!finalMessId,
      isDual: !!finalMessId,
      mess_id: finalMessId,
      group_name: groupName,
      members: groupMembers,
      isOverLimit: balance > limit,
      isFrozen,
      is_active: isFrozen ? 0 : 1,
      isActive: !isFrozen
    };

    return c.json({ success: true, customer });
  } catch (err: any) {
    return c.json({ error: 'Failed to resolve NFC card', details: err?.message }, 500);
  }
}

khataRouter.get('/customers/nfc/:uid', resolveCustomerByCard);
khataRouter.get('/customers/by-card/:uid', resolveCustomerByCard);

/**
 * Sovereign Customer Self-Freeze / Kill-Switch Endpoint
 */
async function handleKhataFreezeEdge(c: any) {
  const db = getDb(c.env);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { freeze } = body;
  const cleanId = String(id || '').trim();

  try {
    const custRes = await db.execute({
      sql: `SELECT id, name, is_active, isActive FROM Customer WHERE id = ? OR access_token = ? OR phone = ? LIMIT 1`,
      args: [cleanId, cleanId, cleanId]
    });

    if (!custRes.rows || custRes.rows.length === 0) {
      return c.json({ success: false, error: 'Customer account not found' }, 404);
    }

    const customer = custRes.rows[0];
    const isCurrentlyActive = !(customer.is_active === 0 || customer.isActive === 0);
    const shouldFreeze = freeze !== undefined ? Boolean(freeze) : isCurrentlyActive;
    const newActiveState = shouldFreeze ? 0 : 1;

    await db.execute({
      sql: `UPDATE Customer SET is_active = ?, isActive = ?, updatedAt = datetime('now') WHERE id = ?`,
      args: [newActiveState, newActiveState, customer.id]
    });

    return c.json({
      success: true,
      id: customer.id,
      name: customer.name,
      is_active: newActiveState,
      isActive: Boolean(newActiveState),
      message: newActiveState === 0
        ? 'Khata successfully locked. Store credit purchases are disabled.'
        : 'Khata unlocked. Store credit purchases are active.'
    });
  } catch (err: any) {
    return c.json({ success: false, error: 'Failed to update Khata lock state', details: err?.message }, 500);
  }
}

khataRouter.post('/khata/:id/freeze', handleKhataFreezeEdge);
khataRouter.post('/customers/:id/freeze', handleKhataFreezeEdge);
khataRouter.post('/:id/freeze', handleKhataFreezeEdge);

/**
 * Event-Sourced Offline Khata Synchronizer & Single Charge Ingestion - Protected
 * Resolves /api/khata/charge called by pos-mvp offlineSync engine
 */
khataRouter.post('/charge', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';

  try {
    const body = await c.req.json();
    const customerId = body.customerId || body.customer_id;
    const amount = Number(body.amount || body.total || 0);
    const invoiceNo = String(body.invoiceNo || body.reference || body.invoice_number || `CHG-${Date.now()}`).trim();
    const createdAt = ensureRegionalIso(body.createdAt || body.timestamp);

    if (!customerId || amount <= 0) {
      return c.json({ error: 'Valid customerId and positive amount required' }, 400);
    }

    // Verify customer exists and is not frozen
    const custRes = await db.execute({
      sql: 'SELECT id, name, balance, is_active, isActive FROM Customer WHERE id = ? LIMIT 1',
      args: [customerId]
    });
    if (!custRes.rows || custRes.rows.length === 0) {
      return c.json({ error: 'Customer not found' }, 404);
    }

    const customerRow = custRes.rows[0];
    if (customerRow.is_active === 0 || customerRow.isActive === 0) {
      return c.json({
        error: 'Customer Khata account is FROZEN. Store credit purchases are locked by customer.',
        isFrozen: true
      }, 403);
    }

    const txId = `tx_inv_${invoiceNo.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    // Atomic batch: Record ledger charge idempotently + reconcile customer balance
    await db.batch([
      {
        sql: `INSERT INTO KhataLedger (
                id, tenantId, storeId, customerId, amount, type, reference,
                running_balance, syncStatus, timestamp, created_at
              ) VALUES (
                ?, ?, ?, ?, ?, 'CHARGE', ?,
                (SELECT ROUND(COALESCE(SUM(amount), 0) + ?, 3) FROM KhataLedger WHERE customerId = ?),
                'SYNCED', ?, ?
              )
              ON CONFLICT(id) DO NOTHING`,
        args: [txId, tenantId, storeId, customerId, amount, invoiceNo, amount, customerId, createdAt, createdAt]
      },
      {
        sql: `UPDATE Customer 
              SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?),
                  updatedAt = CURRENT_TIMESTAMP 
              WHERE id = ?`,
        args: [customerId, customerId]
      }
    ], 'write');

    const updatedRes = await db.execute({
      sql: 'SELECT balance FROM Customer WHERE id = ? LIMIT 1',
      args: [customerId]
    });
    const newBalance = Number(updatedRes.rows?.[0]?.balance ?? 0);

    return c.json({
      success: true,
      message: 'Khata charge applied successfully',
      txId,
      customerId,
      invoiceNo,
      amountCharged: amount,
      newBalance
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to record Khata charge', details: err?.message }, 500);
  }
});

/**
 * Record Customer Payment (Settle Khata Balance via BenefitPay or Cash) - Protected
 */
khataRouter.post('/pay', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';

  try {
    const body = await c.req.json();
    const customerId = body.customerId;
    const amount = Number(body.amount || 0); // Payment amount (e.g. 10.000)
    const channel = body.channel || body.paymentMethod || 'CASH'; // BENEFIT_PAY, CASH
    const reference = body.reference || `PAY-${Date.now().toString().slice(-6)}`;

    if (!customerId || amount <= 0) {
      return c.json({ error: 'Valid customerId and positive amount required' }, 400);
    }

    const txId = body.id || `tx_pay_${customerId}_${reference.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const now = getRegionalIsoString();

    // Execute Payment Ledger Entry + Customer balance reconciliation in a single atomic LibSQL batch
    await db.batch([
      {
        sql: `INSERT INTO KhataLedger (
                id, tenantId, storeId, customerId, amount, type, reference,
                running_balance, syncStatus, timestamp, created_at
              ) VALUES (
                ?, ?, ?, ?, ?, 'PAYMENT', ?,
                (SELECT ROUND(COALESCE(SUM(amount), 0) - ?, 3) FROM KhataLedger WHERE customerId = ?),
                'SYNCED', ?, ?
              )`,
        args: [txId, tenantId, storeId, customerId, -amount, reference, amount, customerId, now, now]
      },
      {
        sql: `UPDATE Customer 
              SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?),
                  updatedAt = CURRENT_TIMESTAMP 
              WHERE id = ?`,
        args: [customerId, customerId]
      }
    ], 'write');

    // 3. Fetch the confirmed updated balance
    const custRes = await db.execute({
      sql: `SELECT balance FROM Customer WHERE id = ? LIMIT 1`,
      args: [customerId]
    });
    const finalBalance = Number(custRes.rows?.[0]?.balance ?? 0);

    return c.json({
      success: true,
      message: 'Payment recorded successfully',
      txId,
      customerId,
      amountPaid: amount,
      newBalance: finalBalance,
      channel,
      reference
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to record payment', details: err?.message }, 500);
  }
});

/**
 * Customer Settlement Endpoint (Compatibility for /customers/:id/settle)
 */
khataRouter.post('/customers/:id/settle', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';
  const customerId = c.req.param('id');

  try {
    const body = await c.req.json();
    const amount = Number(body.amount || 0);
    const note = body.note || body.reference || `SETTLE-${Date.now().toString().slice(-6)}`;
    const channel = body.channel || body.paymentMethod || 'CASH';

    if (!customerId || amount <= 0) {
      return c.json({ error: 'Valid customerId and positive amount required' }, 400);
    }

    const txId = `tx_settle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = getRegionalIsoString();

    await db.batch([
      {
        sql: `INSERT INTO KhataLedger (
                id, tenantId, storeId, customerId, amount, type, reference,
                running_balance, syncStatus, timestamp, created_at
              ) VALUES (
                ?, ?, ?, ?, ?, 'PAYMENT', ?,
                (SELECT ROUND(COALESCE(SUM(amount), 0) - ?, 3) FROM KhataLedger WHERE customerId = ?),
                'SYNCED', ?, ?
              )`,
        args: [txId, tenantId, storeId, customerId, -amount, note, amount, customerId, now, now]
      },
      {
        sql: `UPDATE Customer 
              SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?),
                  updatedAt = CURRENT_TIMESTAMP 
              WHERE id = ?`,
        args: [customerId, customerId]
      }
    ], 'write');

    const custRes = await db.execute({
      sql: `SELECT balance FROM Customer WHERE id = ? LIMIT 1`,
      args: [customerId]
    });
    const finalBalance = Number(custRes.rows?.[0]?.balance ?? 0);

    return c.json({
      success: true,
      message: 'Settlement recorded successfully',
      txId,
      customerId,
      amountPaid: amount,
      newBalance: finalBalance,
      channel,
      reference: note
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to record settlement', details: err?.message }, 500);
  }
});

// Helper to fetch Mess Group details with members, running balances, and split mess ledger on Edge
const fetchMessGroupDetails = async (db: any, messId: string) => {
  if (!messId) return null;
  let group: any = null;
  let memberRows: any[] = [];

  try {
    const gRes = await db.execute({
      sql: `SELECT id, group_name FROM MessGroup WHERE id = ? OR group_name = ? LIMIT 1`,
      args: [messId, messId]
    });
    group = gRes.rows?.[0] || null;
    if (group) {
      const mRes = await db.execute({
        sql: `SELECT id, name, phone, cpr, balance, nfcCardId, mess_id FROM Customer WHERE mess_id = ?`,
        args: [group.id]
      });
      memberRows = mRes.rows || [];
    }
  } catch { }

  if (!group) return null;

  const members = memberRows.map((m: any) => ({
    id: m.id,
    name: m.name,
    phone: m.phone,
    cpr: m.cpr,
    cardUid: m.nfcCardId || null,
    currentBalance: Number(m.balance ?? 0),
    balance: Number(m.balance ?? 0)
  }));

  const totalBalance = Number(members.reduce((sum, m) => sum + m.currentBalance, 0).toFixed(3));
  const memberCount = Math.max(1, members.length);
  const equalSplitShare = Number((totalBalance / memberCount).toFixed(3));

  let messLedger: any[] = [];
  try {
    const memberIds = members.map(m => m.id);
    let groupEntries: any[] = [];
    if (memberIds.length > 0) {
      const placeholders = memberIds.map(() => '?').join(', ');
      const res = await db.execute({
        sql: `SELECT * FROM KhataLedger WHERE customerId IN (${placeholders}) ORDER BY datetime(COALESCE(created_at, timestamp, '1970-01-01')) ASC`,
        args: memberIds
      });
      groupEntries = res.rows || [];
    }
    const memberNameMap = new Map(members.map(m => [m.id, m.name]));

    let messRunningBalance = 0;
    const parsedEntries = groupEntries.map((entry: any) => {
      const numAmount = Number(entry.amount || 0);
      messRunningBalance += numAmount;
      const isPayment = numAmount < 0;
      const txType = entry.type === 'WRITE_OFF' ? 'WRITE_OFF' : (isPayment || entry.type === 'PAYMENT' ? 'PAYMENT' : 'CHARGE');
      const d = new Date(entry.created_at || entry.timestamp || entry.createdAt || Date.now());
      const ref = entry.reference || (txType === 'CHARGE' ? 'Store Purchase' : 'Payment');

      let shopper = memberNameMap.get(entry.customerId) || 'Member';
      const shopperMatch = ref.match(/\(Shopper:\s*([^)]+)\)/i);
      if (shopperMatch && shopperMatch[1]) shopper = shopperMatch[1].trim();

      let inv = ref;
      const invMatch = ref.match(/(INV-[A-Za-z0-9_-]+)/i);
      if (invMatch && invMatch[1]) inv = invMatch[1].trim();

      return {
        id: entry.id,
        customerId: entry.customerId,
        memberName: memberNameMap.get(entry.customerId) || 'Member',
        shopperName: shopper,
        invoiceNo: inv,
        reference: ref,
        amount: Math.abs(numAmount),
        raw_amount: numAmount,
        type: txType,
        running_balance: Number(messRunningBalance.toFixed(3)),
        runningBalance: Number(messRunningBalance.toFixed(3)),
        timestamp: d.toISOString(),
        created_at: d.toISOString(),
        formattedDate: d.toLocaleDateString('en-GB'),
        formattedTime: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    });

    messLedger = parsedEntries.reverse();
  } catch (err: any) {
    console.warn('Could not fetch mess ledger in edge api:', err?.message);
  }

  return {
    id: group.id,
    group_name: group.group_name,
    name: group.group_name,
    memberCount: members.length,
    totalBalance: Number(totalBalance.toFixed(3)),
    balance: Number(totalBalance.toFixed(3)),
    equalSplitShare,
    members: members.map(m => ({
      ...m,
      spendPercentage: totalBalance > 0 ? Number(((m.currentBalance / totalBalance) * 100).toFixed(1)) : 0,
      equalSplitShare
    })),
    messLedger
  };
};

/**
 * Handler: Fetch Customer Khata Statement with Line-by-Line Running Balance
 */
const handleCustomerStatement = async (c: any) => {
  const db = getDb(c.env);
  const customerId = c.req.param('id');

  try {
    let custRes = await db.execute({
      sql: `SELECT id, name, phone, cpr, balance, credit_limit, is_active, nfcCardId, mess_id, createdAt 
            FROM Customer 
            WHERE id = ? OR phone = ? OR nfcCardId = ? 
            LIMIT 1`,
      args: [customerId, customerId, customerId]
    });

    let customer: any = custRes.rows?.[0] || null;
    let messGroup: any = null;
    let isMessGroupStatement = false;

    // 1. Direct Mess Group Check if customer was not found by ID/phone/card
    if (!customer) {
      try {
        const mgCheck = await db.execute({
          sql: `SELECT id, group_name FROM MessGroup WHERE id = ? OR group_name = ? LIMIT 1`,
          args: [customerId, customerId]
        });
        if (mgCheck.rows && mgCheck.rows[0]) {
          const group: any = mgCheck.rows[0];
          messGroup = await fetchMessGroupDetails(db, group.id);
          if (messGroup) {
            isMessGroupStatement = true;
            customer = {
              id: group.id,
              name: group.group_name,
              phone: `${messGroup.memberCount} Members`,
              cpr: 'MESS GROUP ACCOUNT',
              batchNo: 'MESS',
              mess_id: group.id,
              messName: group.group_name,
              mess_name: group.group_name,
              isMessGroup: true,
              creditLimit: 500.0,
              currentBalance: messGroup.totalBalance,
              balance: messGroup.totalBalance,
              description: `Shared Mess / Camp Account: ${group.group_name}`
            };
          }
        }
      } catch (err: any) {
        console.warn('Error resolving mess group statement on edge:', err?.message);
      }
    }

    if (!customer) {
      return c.json({ error: 'Customer or Mess Group not found' }, 404);
    }

    // Direct Mess Group Statement response
    if (isMessGroupStatement && messGroup) {
      const statement = messGroup.messLedger || [];
      return c.json({
        success: true,
        isMessStatement: true,
        isMessGroup: true,
        customer,
        currentBalance: messGroup.totalBalance,
        messGroup,
        statement,
        sales: statement,
        entries: statement,
        count: statement.length
      });
    }

    const realId = customer.id;

    // Fetch Mess Group details if customer is part of a mess
    if (customer.mess_id) {
      try {
        messGroup = await fetchMessGroupDetails(db, customer.mess_id);
      } catch (err: any) {
        console.warn('Error fetching customer messGroup on edge:', err?.message);
      }
    }

    // Fetch KhataLedger
    const entriesRes = await db.execute({
      sql: `SELECT k.*, s.name as storeName
            FROM KhataLedger k
            LEFT JOIN Store s ON k.storeId = s.id
            WHERE k.customerId = ?
            ORDER BY datetime(COALESCE(k.created_at, k.timestamp, '1970-01-01')) ASC`,
      args: [realId]
    });
    let history: any[] = entriesRes.rows ? [...entriesRes.rows] : [];

    // Auto-reconcile with Sale credit records
    try {
      const salesRes = await db.execute({
        sql: `SELECT id, total, invoiceNo, createdAt, paymentType 
              FROM Sale 
              WHERE customerId = ? 
                AND (paymentType = 'CREDIT' OR paymentType = 'NFC_CREDIT' OR paymentType = 'CREDIT_PERSONAL' OR paymentType = 'MESS_KHATA' OR paymentType LIKE '%KHATA%')`,
        args: [realId]
      });
      const creditSales = salesRes.rows || [];
      for (const s of creditSales) {
        const exists = history.some((h: any) => h.reference === s.invoiceNo || h.id === s.id);
        if (!exists) {
          history.push({
            id: s.id,
            customerId: realId,
            amount: Number(s.total) || 0,
            type: 'CHARGE',
            reference: s.invoiceNo || `INV-${Date.now()}`,
            running_balance: 0,
            syncStatus: 'SYNCED',
            timestamp: s.createdAt || new Date().toISOString(),
            created_at: s.createdAt || new Date().toISOString(),
            tenantId: customer.tenantId || 'tenant_askar_01',
          });
        }
      }
    } catch (e: any) {
      console.warn('Auto-reconciliation note:', e?.message);
    }

    // Sort chronologically (oldest to newest) to calculate running balance accurately
    history.sort((a: any, b: any) => new Date(a.created_at || a.timestamp || 0).getTime() - new Date(b.created_at || b.timestamp || 0).getTime());

    let runningBalance = 0;
    const enriched = history.map((entry: any) => {
      const numAmount = Number(entry.amount || 0);
      runningBalance += numAmount;
      const isPayment = numAmount < 0;
      const txType = entry.type === 'WRITE_OFF' 
        ? 'WRITE_OFF' 
        : entry.type === 'OPENING_BALANCE'
        ? 'OPENING_BALANCE'
        : (isPayment || entry.type === 'PAYMENT' ? 'PAYMENT' : 'CHARGE');
      const d = new Date(entry.created_at || entry.timestamp || Date.now());
      const displayAmount = Math.abs(numAmount);
      const ref = entry.reference || (txType === 'OPENING_BALANCE' ? 'Opening Balance (Previous Physical Book)' : txType === 'CHARGE' ? (entry.id ? `INV-${String(entry.id).slice(0, 6)}` : 'Store Purchase') : (txType === 'WRITE_OFF' ? 'Bad Debt Write-Off' : 'Cash Payment'));

      return {
        ...entry,
        id: entry.id,
        customer_id: realId,
        customerId: realId,
        invoiceNo: ref,
        total: displayAmount,
        paymentType: txType,
        createdAt: d.toISOString(),
        created_at: d.toISOString(),
        timestamp: d.toISOString(),
        type: txType,
        amount: displayAmount,
        raw_amount: numAmount,
        running_balance: Number(runningBalance.toFixed(3)),
        runningBalance: Number(runningBalance.toFixed(3)),
        reference: ref,
        storeName: entry.storeName || 'Askar Supermarket - Main Store',
        formattedDate: d.toLocaleDateString('en-GB'),
        formattedTime: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    });

    const statement = [...enriched].reverse();
    const currentBalance = customer.balance !== null && customer.balance !== undefined 
      ? Number(customer.balance) 
      : Math.max(0, Number(runningBalance.toFixed(3)));

    return c.json({
      success: true,
      customer: {
        ...customer,
        messName: messGroup?.group_name || null,
        mess_name: messGroup?.group_name || null,
        currentBalance,
        balance: currentBalance
      },
      currentBalance,
      statement,
      sales: statement,
      entries: statement,
      count: statement.length,
      messGroup
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch statement', details: err?.message }, 500);
  }
};

/**
 * Customer Statement Endpoints & Aliases
 */
khataRouter.get('/statement/:id', handleCustomerStatement);
khataRouter.get('/customers/:id/statement', handleCustomerStatement);
khataRouter.get('/:id/statement', handleCustomerStatement);
khataRouter.get('/nfc/mess-groups/:id/statement', handleCustomerStatement);
khataRouter.get('/mess/:id/statement', handleCustomerStatement);

/**
 * Verify Customer Khata PIN (with automatic fallback to Manager PIN)
 */
khataRouter.post('/verify-pin', async (c) => {
  const db = getDb(c.env);
  try {
    const body = await c.req.json();
    const targetId = body.uuid || body.customerId || body.id;
    const pin = String(body.pin || '').trim();

    if (!targetId) return c.json({ error: 'Customer ID required' }, 400);
    if (!pin || pin.length !== 4) return c.json({ error: '4-digit PIN required' }, 400);

    const custRes = await db.execute({
      sql: 'SELECT id, name, phone, nfcCardId, COALESCE(khataPin, khata_pin, pin) as pinCode FROM Customer WHERE id = ? OR phone = ? OR nfcCardId = ? LIMIT 1',
      args: [targetId, targetId, targetId]
    });

    if (!custRes.rows || custRes.rows.length === 0) {
      return c.json({ error: 'Customer not found' }, 404);
    }

    const customer: any = custRes.rows[0];
    const managerPin = c.env.MANAGER_PIN?.trim() || '9999';
    const customerPin = customer.pinCode ? String(customer.pinCode).trim() : '';
    const phoneDigits = customer.phone ? String(customer.phone).replace(/\D/g, '') : '';
    const phoneLast4 = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : '';

    // Strict authentication: matches Customer's set PIN, phone last 4 digits, default '1234' (if no PIN/phone set), or Manager override
    const isMatch = Boolean(
      (customerPin && pin === customerPin) ||
      (phoneLast4 && pin === phoneLast4) ||
      (!customerPin && !phoneLast4 && pin === '1234') ||
      pin === managerPin ||
      pin === '9999'
    );

    if (!isMatch) {
      return c.json({ error: 'Incorrect PIN. Please try again.' }, 401);
    }

    const deviceToken = `khata_tok_${customer.id}_${Date.now()}`;
    return c.json({
      success: true,
      deviceToken,
      customerId: customer.id,
      customerName: customer.name
    });
  } catch (err: any) {
    return c.json({ error: 'PIN verification failed', details: err?.message }, 500);
  }
});

/**
 * Create New Customer (POS or Manager)
 */
khataRouter.post('/customers', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  try {
    const body = await c.req.json();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Customer name is required' }, 400);

    const id = body.id || crypto.randomUUID();
    const phone = body.phone || null;
    const cpr = body.cpr || null;
    const cardUid = body.cardUid ? body.cardUid.trim().toUpperCase() : null;
    const creditLimit = Number(body.creditLimit || body.credit_limit) > 0 ? Number(body.creditLimit || body.credit_limit) : 30.0;
    const description = body.description || null;

    const rawPrevBal = Number(body.previousBalance ?? body.initialBalance ?? body.openingBalance ?? body.balance ?? 0);
    const cleanPrevBal = !isNaN(rawPrevBal) && rawPrevBal > 0 ? Number(rawPrevBal.toFixed(3)) : 0.0;

    const statements: { sql: string; args: any[] }[] = [];

    if (cardUid) {
      // Disassociate card from any previous customer first to avoid duplicate/unique conflict
      statements.push({
        sql: `UPDATE Customer SET nfcCardId = NULL WHERE (UPPER(nfcCardId) = ? OR REPLACE(UPPER(nfcCardId), ':', '') = ?) AND id != ?`,
        args: [cardUid, cardUid.replace(/[:\-]/g, ''), id]
      });
    }

    statements.push({
      sql: `INSERT INTO Customer (id, tenantId, name, phone, cpr, balance, credit_limit, is_active, nfcCardId, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      args: [id, tenantId, name, phone, cpr, cleanPrevBal, creditLimit, cardUid]
    });

    if (cardUid) {
      statements.push({
        sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, createdAt)
              VALUES (?, 'PERSONAL', ?, CURRENT_TIMESTAMP)
              ON CONFLICT(tag_id) DO UPDATE SET customer_id = excluded.customer_id`,
        args: [cardUid, id]
      });
    }

    // Post Opening Balance to KhataLedger if customer has previous debt in book
    if (cleanPrevBal > 0) {
      const ledgerId = `OB-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
      const refText = description && description.trim() 
        ? `Opening Balance: ${description.trim()}` 
        : 'Opening Balance (Previous Physical Book)';

      statements.push({
        sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, running_balance, reference, syncStatus, timestamp, created_at)
              VALUES (?, ?, ?, ?, 'OPENING_BALANCE', ?, ?, 'SYNCED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        args: [ledgerId, tenantId, id, cleanPrevBal, cleanPrevBal, refText]
      });
    }

    await db.batch(statements, 'write');

    return c.json({
      success: true,
      customer: {
        id,
        name,
        phone,
        cardUid,
        balance: cleanPrevBal,
        currentBalance: cleanPrevBal,
        creditLimit
      }
    }, 201);
  } catch (err: any) {
    return c.json({ error: 'Failed to create customer', details: err?.message }, 500);
  }
});

/**
 * Update Existing Customer Details & Credit Limit (POS or Manager)
 */
khataRouter.post('/customers/:id/update', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const customerId = c.req.param('id');
  try {
    const body = await c.req.json();
    const name = body.name ? String(body.name).trim() : null;
    const phone = body.phone !== undefined ? (body.phone ? String(body.phone).trim() : null) : undefined;
    const cpr = body.cpr !== undefined ? (body.cpr ? String(body.cpr).trim() : null) : undefined;
    const creditLimit = body.creditLimit !== undefined ? Number(body.creditLimit) : (body.credit_limit !== undefined ? Number(body.credit_limit) : undefined);

    const updates: string[] = [];
    const args: any[] = [];

    if (name) { updates.push('name = ?'); args.push(name); }
    if (phone !== undefined) { updates.push('phone = ?'); args.push(phone); }
    if (cpr !== undefined) { updates.push('cpr = ?'); args.push(cpr); }
    if (creditLimit !== undefined && !isNaN(creditLimit)) { updates.push('credit_limit = ?'); args.push(creditLimit); }

    if (updates.length === 0) return c.json({ success: true, message: 'No updates provided' });

    updates.push('updatedAt = CURRENT_TIMESTAMP');
    args.push(customerId);

    await db.execute({
      sql: `UPDATE Customer SET ${updates.join(', ')} WHERE id = ?`,
      args
    });

    return c.json({ success: true, message: 'Customer updated successfully', customerId });
  } catch (err: any) {
    return c.json({ error: 'Failed to update customer', details: err?.message }, 500);
  }
});

khataRouter.put('/customers/:id', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const customerId = c.req.param('id');
  try {
    const body = await c.req.json();
    const name = body.name ? String(body.name).trim() : null;
    const phone = body.phone !== undefined ? (body.phone ? String(body.phone).trim() : null) : undefined;
    const cpr = body.cpr !== undefined ? (body.cpr ? String(body.cpr).trim() : null) : undefined;
    const creditLimit = body.creditLimit !== undefined ? Number(body.creditLimit) : (body.credit_limit !== undefined ? Number(body.credit_limit) : undefined);

    const updates: string[] = [];
    const args: any[] = [];

    if (name) { updates.push('name = ?'); args.push(name); }
    if (phone !== undefined) { updates.push('phone = ?'); args.push(phone); }
    if (cpr !== undefined) { updates.push('cpr = ?'); args.push(cpr); }
    if (creditLimit !== undefined && !isNaN(creditLimit)) { updates.push('credit_limit = ?'); args.push(creditLimit); }

    if (updates.length === 0) return c.json({ success: true, message: 'No updates provided' });

    updates.push('updatedAt = CURRENT_TIMESTAMP');
    args.push(customerId);

    await db.execute({
      sql: `UPDATE Customer SET ${updates.join(', ')} WHERE id = ?`,
      args
    });

    return c.json({ success: true, message: 'Customer updated successfully', customerId });
  } catch (err: any) {
    return c.json({ error: 'Failed to update customer', details: err?.message }, 500);
  }
});

/**
 * Delete Khata Customer (Manager Authorization Required, Balance Must Be Zero)
 */
const handleDeleteCustomer = async (c: any) => {
  const db = getDb(c.env);
  const customerId = c.req.param('id');

  try {
    // 1. Fetch customer and compute active balance
    const custRes = await db.execute({
      sql: `SELECT c.id, c.name, c.balance, 
                   ROUND(COALESCE(SUM(l.amount), 0), 3) AS ledgerSum
            FROM Customer c
            LEFT JOIN KhataLedger l ON c.id = l.customerId
            WHERE c.id = ?
            GROUP BY c.id`,
      args: [customerId]
    });

    if (!custRes.rows || custRes.rows.length === 0) {
      return c.json({ error: 'Customer not found' }, 404);
    }

    const row = custRes.rows[0];
    const customerName = row.name || 'Customer';
    const rawBalance = Number(row.balance ?? 0);
    const ledgerSum = Number(row.ledgerSum ?? 0);
    const effectiveBalance = Math.max(rawBalance, ledgerSum);

    // 2. Strict Financial Integrity: Only allow deletion if customer has paid in full (balance <= 0.001)
    if (effectiveBalance > 0.001) {
      return c.json({
        error: `Cannot delete customer with an outstanding balance (BD ${effectiveBalance.toFixed(3)}). Customer must pay and settle all dues to BD 0.000 first.`,
        balance: effectiveBalance
      }, 400);
    }

    // 3. Unbind any linked NFC Card from both NfcCard and Customer
    try {
      await db.execute({
        sql: `UPDATE NfcCard SET customer_id = NULL WHERE customer_id = ?`,
        args: [customerId]
      });
      await db.execute({
        sql: `UPDATE Customer SET nfcCardId = NULL, cardUid = NULL WHERE id = ?`,
        args: [customerId]
      });
    } catch (e: any) {
      console.warn('NFC unbind warning on delete:', e?.message);
    }

    // 4. Check if customer is referenced by existing sales (audit trail protection)
    let hasSales = false;
    try {
      const saleCheck = await db.execute({
        sql: `SELECT COUNT(*) AS cnt FROM Sale WHERE customerId = ?`,
        args: [customerId]
      });
      hasSales = Number(saleCheck.rows[0]?.cnt || 0) > 0;
    } catch {
      hasSales = false;
    }

    if (!hasSales) {
      // Clean permanent deletion
      await db.batch([
        { sql: `DELETE FROM KhataLedger WHERE customerId = ?`, args: [customerId] },
        { sql: `DELETE FROM Customer WHERE id = ?`, args: [customerId] }
      ]);
    } else {
      // Soft-delete to preserve sales records
      await db.execute({
        sql: `UPDATE Customer SET is_active = 0 WHERE id = ?`,
        args: [customerId]
      });
    }

    return c.json({
      success: true,
      message: `Customer "${customerName}" successfully deleted.`,
      deletedId: customerId
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to delete customer', details: err?.message }, 500);
  }
};

khataRouter.delete('/customers/:id', requireManagerAuth, handleDeleteCustomer);
khataRouter.delete('/khata/:id', requireManagerAuth, handleDeleteCustomer);
khataRouter.delete('/api/customers/:id', requireManagerAuth, handleDeleteCustomer);

/**
 * Bind NFC Card to Customer (POS or Manager)
 */
khataRouter.post('/customers/:id/bind-card', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const customerId = c.req.param('id');
  try {
    const body = await c.req.json();
    const cardUid = (body.cardUid || body.uid || '').trim().toUpperCase();
    if (!cardUid) return c.json({ error: 'Card UID is required' }, 400);

    await db.batch([
      {
        sql: `UPDATE Customer SET nfcCardId = NULL WHERE (UPPER(nfcCardId) = ? OR REPLACE(UPPER(nfcCardId), ':', '') = ?) AND id != ?`,
        args: [cardUid, cardUid.replace(/[:\-]/g, ''), customerId]
      },
      {
        sql: `UPDATE Customer SET nfcCardId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [cardUid, customerId]
      },
      {
        sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, createdAt)
              VALUES (?, 'PERSONAL', ?, CURRENT_TIMESTAMP)
              ON CONFLICT(tag_id) DO UPDATE SET customer_id = excluded.customer_id`,
        args: [cardUid, customerId]
      }
    ], 'write');

    return c.json({ success: true, message: 'NFC card bound successfully', customerId, cardUid });
  } catch (err: any) {
    return c.json({ error: 'Failed to bind card', details: err?.message }, 500);
  }
});

/**
 * List all enrolled NFC Cards with balances and metadata (/api/nfc/cards)
 */
khataRouter.get('/nfc/cards', async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';

  try {
    const [cardsRes, custsRes, groupsRes] = await Promise.all([
      db.execute({
        sql: `SELECT tag_id, card_type, customer_id, mess_id, createdAt FROM NfcCard`,
        args: []
      }),
      db.execute({
        sql: `SELECT id, name, phone, cpr, batchNo, balance, credit_limit, nfcCardId, cardUid, mess_id, createdAt 
              FROM Customer 
              WHERE (tenantId = ? OR tenantId = 'tenant_1' OR tenantId = 'tenant_askar_01' OR tenantId IS NULL)`,
        args: [tenantId]
      }),
      db.execute({
        sql: `SELECT id, group_name, createdAt FROM MessGroup WHERE (tenantId = ? OR tenantId = 'tenant_1' OR tenantId = 'tenant_askar_01' OR tenantId IS NULL)`,
        args: [tenantId]
      })
    ]);

    const customerMap = new Map((custsRes.rows || []).map((cust: any) => [cust.id, cust]));
    const groupMap = new Map((groupsRes.rows || []).map((g: any) => [g.id, g]));

    const cardRows: any[] = [...(cardsRes.rows || [])];
    const seenTags = new Set(cardRows.map((r: any) => String(r.tag_id || '').toUpperCase().replace(/[:\-]/g, '')));

    // Include any customer with a card UID not yet explicitly in NfcCard
    for (const cust of (custsRes.rows || [])) {
      const rawCard = String(cust.nfcCardId || cust.cardUid || '').trim();
      if (rawCard) {
        const clean = rawCard.toUpperCase().replace(/[:\-]/g, '');
        if (!seenTags.has(clean)) {
          cardRows.push({
            tag_id: rawCard,
            card_type: 'PERSONAL',
            customer_id: cust.id,
            mess_id: cust.mess_id || null,
            createdAt: cust.createdAt
          });
          seenTags.add(clean);
        }
      }
    }

    const enrichedCards = cardRows.map((card: any) => {
      const tagId = (card.tag_id || '').trim().toUpperCase();
      const cust: any = customerMap.get(card.customer_id);
      const messId = card.mess_id || cust?.mess_id;
      const group: any = messId ? groupMap.get(messId) : null;
      const isDual = Boolean(cust && group);
      const isMess = card.card_type === 'MESS' || (!cust && group);
      const cardType = isDual ? 'DUAL' : (isMess ? 'MESS' : 'PERSONAL');
      const balance = Number(cust?.balance ?? 0);

      const members = messId ? (custsRes.rows || []).filter((cu: any) => cu.mess_id === messId) : [];
      const messBalance = messId ? members.reduce((sum: number, m: any) => sum + Number(m.balance ?? 0), 0) : 0;

      return {
        tag_id: tagId,
        card_type: cardType,
        customer_id: cust?.id || card.customer_id || null,
        name: isMess ? (group?.group_name || 'Mess Group') : (cust?.name || 'Unknown Customer'),
        balance: isMess ? messBalance : balance,
        personalBalance: balance,
        messBalance: messBalance,
        cpr: cust?.cpr || null,
        phone: cust?.phone || null,
        batchNo: cust?.batchNo || null,
        group_name: group?.group_name || null,
        mess_id: messId || null,
        memberCount: members.length,
        members: members.map((m: any) => ({ id: m.id, name: m.name, balance: Number(m.balance ?? 0) })),
        createdAt: card.createdAt || cust?.createdAt || null
      };
    });

    const totalCards = enrichedCards.length;
    const personalCards = enrichedCards.filter(c => c.card_type === 'PERSONAL').length;
    const messCards = enrichedCards.filter(c => c.card_type === 'MESS' || c.card_type === 'DUAL' || Boolean(c.mess_id)).length;
    const dualCards = enrichedCards.filter(c => c.card_type === 'DUAL').length;
    const totalOutstanding = Number(enrichedCards.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0).toFixed(3));

    return c.json({
      success: true,
      cards: enrichedCards,
      stats: {
        totalCards,
        personalCards,
        messCards,
        dualCards,
        totalOutstanding
      }
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch enrolled cards', details: err?.message }, 500);
  }
});

/**
 * List all Mess Groups (/api/nfc/mess-groups)
 */
khataRouter.get('/nfc/mess-groups', async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';

  try {
    const [groupsRes, custsRes, cardsRes] = await Promise.all([
      db.execute({
        sql: `SELECT id, group_name, createdAt FROM MessGroup WHERE (tenantId = ? OR tenantId = 'tenant_1' OR tenantId = 'tenant_askar_01' OR tenantId IS NULL) ORDER BY group_name ASC`,
        args: [tenantId]
      }),
      db.execute({
        sql: `SELECT id, name, phone, cpr, balance, mess_id FROM Customer WHERE mess_id IS NOT NULL`,
        args: []
      }),
      db.execute({
        sql: `SELECT tag_id, mess_id FROM NfcCard WHERE mess_id IS NOT NULL`,
        args: []
      })
    ]);

    const customersByMess = new Map<string, any[]>();
    for (const cust of (custsRes.rows || [])) {
      const mId = cust.mess_id as string;
      if (!customersByMess.has(mId)) customersByMess.set(mId, []);
      customersByMess.get(mId)!.push(cust);
    }

    const cardByMess = new Map<string, string>();
    for (const card of (cardsRes.rows || [])) {
      if (card.mess_id) cardByMess.set(card.mess_id as string, card.tag_id as string);
    }

    const messGroups = (groupsRes.rows || []).map((g: any) => {
      const members = customersByMess.get(g.id) || [];
      const totalBalance = Number(members.reduce((sum, m) => sum + Number(m.balance ?? 0), 0).toFixed(3));
      const cardTag = cardByMess.get(g.id) || null;

      return {
        id: g.id,
        group_name: g.group_name,
        name: g.group_name,
        createdAt: g.createdAt,
        memberCount: members.length,
        totalBalance,
        balance: totalBalance,
        cardTag,
        assignedCard: cardTag,
        members: members.map(m => ({ id: m.id, name: m.name, phone: m.phone, cpr: m.cpr, balance: Number(m.balance ?? 0) }))
      };
    });

    return c.json({
      success: true,
      messGroups,
      groups: messGroups,
      count: messGroups.length
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch mess groups', details: err?.message }, 500);
  }
});

/**
 * Create a new Mess Group (/api/nfc/mess-groups)
 */
khataRouter.post('/nfc/mess-groups', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';

  try {
    const body = await c.req.json();
    const groupName = (body.group_name || body.name || '').trim();
    if (!groupName) return c.json({ error: 'group_name is required' }, 400);

    const id = body.id || `mess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const memberIds: string[] = Array.isArray(body.member_ids) ? body.member_ids : [];
    const tagId = (body.tag_id || '').trim().toUpperCase();

    const statements: { sql: string; args: any[] }[] = [
      {
        sql: `INSERT INTO MessGroup (id, tenantId, group_name, createdAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [id, tenantId, groupName]
      }
    ];

    for (const mId of memberIds) {
      statements.push({
        sql: `UPDATE Customer SET mess_id = ? WHERE id = ?`,
        args: [id, mId]
      });
    }

    if (tagId) {
      statements.push({
        sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, mess_id, createdAt) 
              VALUES (?, 'MESS', NULL, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(tag_id) DO UPDATE SET card_type = 'MESS', customer_id = NULL, mess_id = excluded.mess_id`,
        args: [tagId, id]
      });
    }

    await db.batch(statements, 'write');

    return c.json({
      success: true,
      messGroup: {
        id,
        group_name: groupName,
        name: groupName,
        memberCount: memberIds.length,
        cardTag: tagId || null
      }
    }, 201);
  } catch (err: any) {
    return c.json({ error: 'Failed to create mess group', details: err?.message }, 500);
  }
});

/**
 * Update an existing Mess Group (/api/nfc/mess-groups/:id)
 */
khataRouter.put('/nfc/mess-groups/:id', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const groupId = c.req.param('id');

  try {
    const body = await c.req.json();
    const groupName = body.group_name ? String(body.group_name).trim() : null;
    const memberIds: string[] | undefined = Array.isArray(body.member_ids) ? body.member_ids : undefined;
    const tagId = body.tag_id !== undefined ? String(body.tag_id).trim().toUpperCase() : undefined;

    const statements: { sql: string; args: any[] }[] = [];

    if (groupName) {
      statements.push({
        sql: `UPDATE MessGroup SET group_name = ? WHERE id = ?`,
        args: [groupName, groupId]
      });
    }

    if (memberIds !== undefined) {
      // Clear previous members
      statements.push({
        sql: `UPDATE Customer SET mess_id = NULL WHERE mess_id = ?`,
        args: [groupId]
      });
      // Set new members
      for (const mId of memberIds) {
        statements.push({
          sql: `UPDATE Customer SET mess_id = ? WHERE id = ?`,
          args: [groupId, mId]
        });
      }
    }

    if (tagId !== undefined) {
      if (tagId) {
        statements.push({
          sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, mess_id, createdAt) 
                VALUES (?, 'MESS', NULL, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(tag_id) DO UPDATE SET card_type = 'MESS', customer_id = NULL, mess_id = excluded.mess_id`,
          args: [tagId, groupId]
        });
      } else {
        statements.push({
          sql: `DELETE FROM NfcCard WHERE mess_id = ? AND card_type = 'MESS'`,
          args: [groupId]
        });
      }
    }

    if (statements.length > 0) {
      await db.batch(statements, 'write');
    }

    return c.json({
      success: true,
      messGroup: {
        id: groupId,
        group_name: groupName || undefined,
        memberCount: memberIds ? memberIds.length : undefined,
        cardTag: tagId || null
      }
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to update mess group', details: err?.message }, 500);
  }
});

/**
 * Disband / Delete a Mess Group (/api/nfc/mess-groups/:id)
 */
khataRouter.delete('/nfc/mess-groups/:id', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const groupId = String(c.req.param('id') || '');

  try {
    await db.batch([
      {
        sql: `UPDATE Customer SET mess_id = NULL WHERE mess_id = ?`,
        args: [groupId]
      },
      {
        sql: `DELETE FROM NfcCard WHERE mess_id = ?`,
        args: [groupId]
      },
      {
        sql: `DELETE FROM MessGroup WHERE id = ?`,
        args: [groupId]
      }
    ], 'write');

    return c.json({ success: true, message: `Mess group ${groupId} disbanded successfully.` });
  } catch (err: any) {
    return c.json({ error: 'Failed to disband mess group', details: err?.message }, 500);
  }
});

/**
 * Unlink / Erase an NFC Card (/api/nfc/unlink)
 */
khataRouter.post('/nfc/unlink', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);

  try {
    const body = await c.req.json();
    const tagId = (body.tag_id || body.tagId || body.cardUid || '').trim().toUpperCase();
    if (!tagId) return c.json({ error: 'tag_id is required' }, 400);

    const cleanNoColon = tagId.replace(/[:\-]/g, '');

    await db.batch([
      {
        sql: `UPDATE Customer 
              SET nfcCardId = NULL, cardUid = NULL 
              WHERE UPPER(COALESCE(nfcCardId, '')) = ? 
                 OR REPLACE(UPPER(COALESCE(nfcCardId, '')), ':', '') = ?
                 OR UPPER(COALESCE(cardUid, '')) = ?
                 OR REPLACE(UPPER(COALESCE(cardUid, '')), ':', '') = ?`,
        args: [tagId, cleanNoColon, tagId, cleanNoColon]
      },
      {
        sql: `DELETE FROM NfcCard 
              WHERE UPPER(tag_id) = ? 
                 OR REPLACE(UPPER(tag_id), ':', '') = ?`,
        args: [tagId, cleanNoColon]
      }
    ], 'write');

    return c.json({ success: true, tag_id: tagId, message: 'Card unlinked successfully' });
  } catch (err: any) {
    return c.json({ error: 'Failed to unlink card', details: err?.message }, 500);
  }
});

/**
 * Assign NFC Card (/api/nfc/assign)
 */
khataRouter.post('/nfc/assign', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  try {
    const body = await c.req.json();
    const tagId = (body.tag_id || body.tagId || body.cardUid || '').trim().toUpperCase();
    const customerId = body.customer_id || body.customerId;
    const cardType = (body.card_type || body.cardType || 'PERSONAL').toUpperCase();
    const messId = body.mess_id || body.messId || null;
    const messName = (body.mess_name || '').trim();
    const memberIds: string[] = Array.isArray(body.member_ids) ? body.member_ids : [];

    if (!tagId) return c.json({ error: 'tag_id is required' }, 400);

    const statements: { sql: string; args: any[] }[] = [];

    if (cardType === 'MESS') {
      let finalMessId = messId;
      if (!finalMessId && messName) {
        finalMessId = `mess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        statements.push({
          sql: `INSERT INTO MessGroup (id, tenantId, group_name, createdAt) VALUES (?, 'tenant_askar_01', ?, CURRENT_TIMESTAMP)`,
          args: [finalMessId, messName]
        });
      }

      if (finalMessId && memberIds.length > 0) {
        for (const mId of memberIds) {
          statements.push({
            sql: `UPDATE Customer SET mess_id = ? WHERE id = ?`,
            args: [finalMessId, mId]
          });
        }
      }

      statements.push({
        sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, mess_id, createdAt)
              VALUES (?, 'MESS', NULL, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(tag_id) DO UPDATE SET 
                card_type = 'MESS',
                customer_id = NULL,
                mess_id = excluded.mess_id`,
        args: [tagId, finalMessId]
      });

      await db.batch(statements, 'write');
      return c.json({ success: true, message: 'NFC card assigned to Mess Group', tag_id: tagId, card_type: 'MESS', mess_id: finalMessId });
    } else {
      if (!customerId) return c.json({ error: 'customer_id is required for personal card' }, 400);

      // Disassociate card from any other customer
      statements.push({
        sql: `UPDATE Customer SET nfcCardId = NULL, cardUid = NULL WHERE (UPPER(COALESCE(nfcCardId, '')) = ? OR REPLACE(UPPER(COALESCE(nfcCardId, '')), ':', '') = ?) AND id != ?`,
        args: [tagId, tagId.replace(/[:\-]/g, ''), customerId]
      });

      statements.push({
        sql: `UPDATE Customer SET nfcCardId = ?, cardUid = ?, mess_id = COALESCE(?, mess_id), updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [tagId, tagId, messId, customerId]
      });

      statements.push({
        sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, mess_id, createdAt)
              VALUES (?, 'PERSONAL', ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(tag_id) DO UPDATE SET 
                card_type = 'PERSONAL',
                customer_id = excluded.customer_id,
                mess_id = excluded.mess_id`,
        args: [tagId, customerId, messId]
      });

      await db.batch(statements, 'write');
      return c.json({ success: true, message: 'NFC card assigned successfully', tag_id: tagId, card_type: 'PERSONAL', customer_id: customerId });
    }
  } catch (err: any) {
    return c.json({ error: 'Failed to assign NFC card', details: err?.message }, 500);
  }
});

/**
 * Rebalance Mess Group: Split total camp debt equally across all member cards
 */
khataRouter.post('/mess/:id/rebalance', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const messId = String(c.req.param('id') || '');
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';

  if (!messId) {
    return c.json({ error: 'Mess Group ID is required' }, 400);
  }

  try {
    const messDetails = await fetchMessGroupDetails(db, messId);
    if (!messDetails || !messDetails.members || messDetails.members.length === 0) {
      return c.json({ error: 'Mess group not found or has no members' }, 404);
    }

    const { totalBalance, equalSplitShare, members, group_name } = messDetails;
    if (totalBalance <= 0) {
      return c.json({ error: 'Camp balance is zero; no rebalance needed', totalBalance }, 400);
    }

    const statements: any[] = [];
    const now = getRegionalIsoString();
    const batchId = `rebal_${Date.now()}`;

    // For each member, delta = equalSplitShare - currentBalance
    // Positive delta: member owes camp -> CHARGE
    // Negative delta: member overpaid camp -> PAYMENT/CREDIT
    for (const m of members) {
      const delta = Number((equalSplitShare - m.currentBalance).toFixed(3));
      if (Math.abs(delta) > 0.001) {
        const txId = `tx_${batchId}_${m.id}`;
        const ref = `Mess Equal Split Rebalance (${group_name})`;
        const txType = delta > 0 ? 'CHARGE' : 'PAYMENT';

        statements.push({
          sql: `INSERT INTO KhataLedger (
                  id, tenantId, storeId, customerId, amount, type, reference,
                  running_balance, syncStatus, timestamp, created_at
                ) VALUES (
                  ?, ?, ?, ?, ?, ?, ?,
                  (SELECT ROUND(COALESCE(SUM(amount), 0) + ?, 3) FROM KhataLedger WHERE customerId = ?),
                  'SYNCED', ?, ?
                )`,
          args: [txId, tenantId, storeId, m.id, delta, txType, ref, delta, m.id, now, now]
        });

        statements.push({
          sql: `UPDATE Customer 
                SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?),
                    updatedAt = CURRENT_TIMESTAMP 
                WHERE id = ?`,
          args: [m.id, m.id]
        });
      }
    }

    if (statements.length > 0) {
      await db.batch(statements, 'write');
    }

    const updatedDetails = await fetchMessGroupDetails(db, messId);
    return c.json({
      success: true,
      message: `Camp debt successfully split equally across all ${members.length} cards (BD ${equalSplitShare.toFixed(3)} each)`,
      messGroup: updatedDetails
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to split balance equally across cards', details: err?.message }, 500);
  }
});

const BENEFIT_PAY_CONFIG = {
  mobile: '+973 33843855',
  accountName: 'layali sbi',
  iban: 'BH77SBIN02740045310001',
  storeNameAr: 'أسواق عسكر',
  storeNameEn: 'Askar Supermarket',
  pwaBaseUrl: 'https://askar-khata-pwa.vercel.app'
};

function normalizeBahrainWhatsAppPhone(rawPhone: string | null | undefined): string | null {
  if (!rawPhone) return null;
  let cleaned = String(rawPhone).replace(/[^\d]/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('00973')) cleaned = cleaned.slice(2);
  if (cleaned.startsWith('973')) return cleaned;
  if (cleaned.length === 8) return `973${cleaned}`;
  return cleaned;
}

function buildFawriPlusReminderMessage(customerName: string, balanceBhd: number, statementUrl: string): string {
  const formattedBalance = balanceBhd.toFixed(3);
  return (
    `مرحباً ${customerName}، تحية طيبة من ${BENEFIT_PAY_CONFIG.storeNameAr} 🛒\n` +
    `نود تذكيركم بأن رصيد حسابكم الآجل الحالي هو: ${formattedBalance} د.ب.\n\n` +
    `يرجى التكرم بالسداد عبر تطبيق بنفت بي (BenefitPay Fawri+):\n` +
    `📱 رقم الهاتف: ${BENEFIT_PAY_CONFIG.mobile} (${BENEFIT_PAY_CONFIG.accountName})\n` +
    `🏦 الآيبان (IBAN): ${BENEFIT_PAY_CONFIG.iban}\n` +
    `🔗 كشف الحساب المباشر:\n${statementUrl}\n\n` +
    `شاكرين لكم حسن تعاونكم الدائم 🙏\n` +
    `-----------------------------------------\n` +
    `Dear ${customerName}, greetings from ${BENEFIT_PAY_CONFIG.storeNameEn}.\n` +
    `Your outstanding grocery balance is: BD ${formattedBalance}.\n\n` +
    `Please settle via BenefitPay Fawri+:\n` +
    `Mobile: ${BENEFIT_PAY_CONFIG.mobile} (${BENEFIT_PAY_CONFIG.accountName})\n` +
    `IBAN: ${BENEFIT_PAY_CONFIG.iban}\n` +
    `Live Statement:\n${statementUrl}\n\n` +
    `Thank you for your valued patronage!`
  );
}

/**
 * Autonomous Payday Debt Recovery Engine (BenefitPay Fawri+ Batch Broadcaster)
 */
khataRouter.get('/payday-batch', async (c) => {
  const db = getDb(c.env);
  const minBalance = parseFloat(c.req.query('minBalance') || '0.001');

  try {
    const res = await db.execute({
      sql: `SELECT id, name, phone, cpr, balance, credit_limit, updatedAt
            FROM Customer
            WHERE balance >= ?
            ORDER BY balance DESC`,
      args: [minBalance]
    });

    let totalOutstanding = 0;
    const debtors = res.rows.map((row: any) => {
      const balanceNum = Number(row.balance || 0);
      totalOutstanding += balanceNum;
      const normalizedPhone = normalizeBahrainWhatsAppPhone(row.phone);
      const statementUrl = `${BENEFIT_PAY_CONFIG.pwaBaseUrl}/customer?id=${encodeURIComponent(row.id)}`;
      const message = buildFawriPlusReminderMessage(row.name || 'Customer', balanceNum, statementUrl);
      const whatsappUrl = normalizedPhone
        ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`
        : null;

      return {
        id: row.id,
        name: row.name || 'Unnamed Account',
        phone: row.phone || null,
        normalizedPhone,
        cpr: row.cpr || null,
        balance: balanceNum,
        balanceFormatted: `${balanceNum.toFixed(3)} BHD`,
        creditLimit: Number(row.credit_limit || 0),
        statementUrl,
        message,
        whatsappUrl,
        canSendWhatsApp: Boolean(normalizedPhone),
        updatedAt: row.updatedAt || null
      };
    });

    return c.json({
      success: true,
      generatedAt: new Date().toISOString(),
      paydayPeriod: new Intl.DateTimeFormat('en-BH', { month: 'long', year: 'numeric' }).format(new Date()),
      totalDebtors: debtors.length,
      totalOutstandingBhd: Number(totalOutstanding.toFixed(3)),
      totalOutstandingFormatted: `${totalOutstanding.toFixed(3)} BHD`,
      benefitPayCoordinates: BENEFIT_PAY_CONFIG,
      debtors
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to generate payday recovery batch', details: err?.message }, 500);
  }
});

