import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { getDb, type Env } from '../db.ts';
import { tenantMiddleware, type TenantContext } from '../middleware/tenant.ts';
import {
  requirePosOrManagerAuth,
  requireManagerAuth,
  isManagerAuthorizedEdge,
  generateKhataDeviceTokenEdge,
  verifyKhataDeviceTokenEdge
} from '../middleware/auth.ts';
import { ensureRegionalIso, getRegionalIsoString, getRegionalPeriodRange } from '../utils/time.ts';
import { normalizeNfcUid, stripNfcSeparators, calculateNewBalance, checkCreditLimit } from '../shared/domainRules.ts';

export const khataRouter = new Hono<{ Bindings: Env; Variables: TenantContext }>();

khataRouter.use('*', tenantMiddleware);

/**
 * List All Customers with Running Balances (Public Read for POS/Dashboard)
 */
khataRouter.get('/customers', async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';

  try {
    const [res, mmRes, mTotRes, mShareRes] = await Promise.all([
      db.execute({
        sql: `SELECT c.id, c.name, c.phone, c.cpr, c.balance, c.balance AS currentBalance, c.credit_limit, c.credit_limit AS creditLimit, 
                     c.is_active, c.is_active AS isActive, c.nfcCardId, c.nfcCardId AS cardUid, c.mess_id, 
                     mg.group_name AS messName, mg.group_name AS mess_name, c.createdAt,
                     COALESCE(c.card_deposit_amount, 0.0) AS card_deposit_amount,
                     COALESCE(c.card_deposit_amount, 0.0) AS depositAmount,
                     COALESCE(c.card_deposit_status, 'NONE') AS card_deposit_status,
                     c.card_deposit_receipt_no,
                     c.card_deposit_date,
                     COALESCE(c.card_type, 'PHYSICAL_NFC') AS card_type
              FROM Customer c
              LEFT JOIN MessGroup mg ON c.mess_id = mg.id
              WHERE (c.tenantId = ? OR c.tenantId = 'tenant_1' OR c.tenantId = 'tenant_askar_01' OR c.tenantId IS NULL)
                AND (c.is_active = 1 OR c.is_active IS NULL)
              ORDER BY c.name ASC`,
        args: [tenantId]
      }),
      db.execute({
        sql: `SELECT mm.customer_id, mg.id as mess_id, mg.group_name 
              FROM MessMember mm
              JOIN MessGroup mg ON mm.mess_id = mg.id
              WHERE mm.is_active = 1
              ORDER BY mg.group_name ASC`,
        args: []
      }).catch(() => ({ rows: [] })),
      db.execute({
        sql: `SELECT mess_id, ROUND(COALESCE(SUM(amount), 0), 3) as totalBalance, COUNT(DISTINCT customerId) as memberCount
              FROM KhataLedger
              WHERE mess_id IS NOT NULL AND mess_id != ''
              GROUP BY mess_id`,
        args: []
      }).catch(() => ({ rows: [] })),
      db.execute({
        sql: `SELECT customerId, ROUND(COALESCE(SUM(amount), 0), 3) as messShare
              FROM KhataLedger
              WHERE mess_id IS NOT NULL AND mess_id != ''
              GROUP BY customerId`,
        args: []
      }).catch(() => ({ rows: [] }))
    ]);

    const messGroupStatsMap = new Map<string, { totalBalance: number; memberCount: number }>();
    for (const r of (mTotRes.rows || [])) {
      messGroupStatsMap.set(String(r.mess_id), {
        totalBalance: Number(r.totalBalance || 0),
        memberCount: Number(r.memberCount || 0)
      });
    }

    const customerMessShareMap = new Map<string, number>();
    for (const r of (mShareRes.rows || [])) {
      customerMessShareMap.set(String(r.customerId), Number(r.messShare || 0));
    }

    const messMemberMap = new Map<string, { id: string; group_name: string }[]>();
    for (const r of (mmRes.rows || [])) {
      const cId = String(r.customer_id);
      if (!messMemberMap.has(cId)) messMemberMap.set(cId, []);
      messMemberMap.get(cId)!.push({ id: String(r.mess_id), group_name: String(r.group_name) });
    }

    const customers = res.rows.map(r => {
      const balance = Number(r.balance ?? 0);
      const rawLimit = Number(r.credit_limit);
      const limit = rawLimit > 0 ? rawLimit : 30.0;
      const cId = String(r.id);

      const customerMesses = messMemberMap.get(cId) || [];
      if (customerMesses.length === 0 && r.mess_id && (r.messName || r.mess_name)) {
        customerMesses.push({ id: String(r.mess_id), group_name: String(r.messName || r.mess_name) });
      }
      const messNames = customerMesses.map(m => m.group_name).join(', ');
      const messIds = customerMesses.map(m => m.id);
      const primaryMessId = customerMesses[0]?.id || (r.mess_id ? String(r.mess_id) : null);
      const groupStats = primaryMessId ? messGroupStatsMap.get(primaryMessId) : null;
      const messGroupTotal = groupStats ? groupStats.totalBalance : 0;
      const messMemberCount = groupStats ? groupStats.memberCount : (customerMesses.length || 1);
      const messShare = customerMessShareMap.get(cId) ?? 0;
      const depInCredit = (r.card_deposit_status === 'IN_CREDIT' || r.card_deposit_status === 'DEFERRED_CREDIT' || r.card_deposit_status === 'DEFERRED_PAYDAY')
        ? Number(r.card_deposit_amount || 0)
        : 0;
      const personalBalance = Math.max(0, Number((balance - messShare).toFixed(3)));

      return {
        ...r,
        messes: customerMesses,
        mess_ids: messIds,
        hasMessGroup: customerMesses.length > 0 || !!primaryMessId,
        isDual: customerMesses.length > 0 || !!primaryMessId,
        isMultiMess: customerMesses.length > 1,
        messName: messNames || r.messName || null,
        mess_name: messNames || r.mess_name || r.messName || null,
        mess_id: primaryMessId,
        messGroupTotal,
        mess_group_total: messGroupTotal,
        messTotal: messGroupTotal,
        mess_total: messGroupTotal,
        messMemberCount,
        currentBalance: balance,
        balance: balance,
        personalBalance,
        messShare,
        depositInCredit: depInCredit,
        card_deposit_amount: Number(r.card_deposit_amount || 0),
        depositAmount: Number(r.card_deposit_amount || 0),
        card_deposit_status: r.card_deposit_status || 'NONE',
        depositStatus: r.card_deposit_status || 'NONE',
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
    const [res, mmRes, mTotRes, mShareRes] = await Promise.all([
      db.execute({
        sql: `SELECT c.id, c.name, c.phone, c.cpr, c.balance, c.balance AS currentBalance, c.credit_limit, c.credit_limit AS creditLimit, 
                     c.is_active, c.is_active AS isActive, c.nfcCardId, c.nfcCardId AS cardUid, c.mess_id, 
                     mg.group_name AS messName, mg.group_name AS mess_name, c.createdAt, c.updatedAt,
                     COALESCE(c.card_deposit_amount, 0.0) AS card_deposit_amount,
                     COALESCE(c.card_deposit_amount, 0.0) AS depositAmount,
                     COALESCE(c.card_deposit_status, 'NONE') AS card_deposit_status,
                     c.card_deposit_receipt_no,
                     c.card_deposit_date,
                     COALESCE(c.card_type, 'PHYSICAL_NFC') AS card_type
              FROM Customer c
              LEFT JOIN MessGroup mg ON c.mess_id = mg.id
              WHERE (c.tenantId = ? OR c.tenantId = 'tenant_1' OR c.tenantId = 'tenant_askar_01' OR c.tenantId IS NULL)
                AND (c.is_active = 1 OR c.is_active IS NULL) ${debtorClause}
              ORDER BY ${orderBy}`,
        args: [tenantId]
      }),
      db.execute({
        sql: `SELECT mm.customer_id, mg.id as mess_id, mg.group_name 
              FROM MessMember mm
              JOIN MessGroup mg ON mm.mess_id = mg.id
              WHERE mm.is_active = 1
              ORDER BY mg.group_name ASC`,
        args: []
      }).catch(() => ({ rows: [] })),
      db.execute({
        sql: `SELECT mess_id, ROUND(COALESCE(SUM(amount), 0), 3) as totalBalance, COUNT(DISTINCT customerId) as memberCount
              FROM KhataLedger
              WHERE mess_id IS NOT NULL AND mess_id != ''
              GROUP BY mess_id`,
        args: []
      }).catch(() => ({ rows: [] })),
      db.execute({
        sql: `SELECT customerId, ROUND(COALESCE(SUM(amount), 0), 3) as messShare
              FROM KhataLedger
              WHERE mess_id IS NOT NULL AND mess_id != ''
              GROUP BY customerId`,
        args: []
      }).catch(() => ({ rows: [] }))
    ]);

    const messGroupStatsMap = new Map<string, { totalBalance: number; memberCount: number }>();
    for (const r of (mTotRes.rows || [])) {
      messGroupStatsMap.set(String(r.mess_id), {
        totalBalance: Number(r.totalBalance || 0),
        memberCount: Number(r.memberCount || 0)
      });
    }

    const customerMessShareMap = new Map<string, number>();
    for (const r of (mShareRes.rows || [])) {
      customerMessShareMap.set(String(r.customerId), Number(r.messShare || 0));
    }

    const messMemberMap = new Map<string, { id: string; group_name: string }[]>();
    for (const r of (mmRes.rows || [])) {
      const cId = String(r.customer_id);
      if (!messMemberMap.has(cId)) messMemberMap.set(cId, []);
      messMemberMap.get(cId)!.push({ id: String(r.mess_id), group_name: String(r.group_name) });
    }

    const customers = res.rows.map(r => {
      const balance = Number(r.balance ?? 0);
      const rawLimit = Number(r.credit_limit);
      const limit = rawLimit > 0 ? rawLimit : 30.0;
      const cId = String(r.id);

      const customerMesses = messMemberMap.get(cId) || [];
      if (customerMesses.length === 0 && r.mess_id && (r.messName || r.mess_name)) {
        customerMesses.push({ id: String(r.mess_id), group_name: String(r.messName || r.mess_name) });
      }
      const messNames = customerMesses.map(m => m.group_name).join(', ');
      const messIds = customerMesses.map(m => m.id);
      const primaryMessId = customerMesses[0]?.id || (r.mess_id ? String(r.mess_id) : null);
      const groupStats = primaryMessId ? messGroupStatsMap.get(primaryMessId) : null;
      const messGroupTotal = groupStats ? groupStats.totalBalance : 0;
      const messMemberCount = groupStats ? groupStats.memberCount : (customerMesses.length || 1);
      const messShare = customerMessShareMap.get(cId) ?? 0;
      const depInCredit = (r.card_deposit_status === 'IN_CREDIT' || r.card_deposit_status === 'DEFERRED_CREDIT' || r.card_deposit_status === 'DEFERRED_PAYDAY')
        ? Number(r.card_deposit_amount || 0)
        : 0;
      const personalBalance = Math.max(0, Number((balance - messShare).toFixed(3)));

      return {
        ...r,
        messes: customerMesses,
        mess_ids: messIds,
        hasMessGroup: customerMesses.length > 0 || !!primaryMessId,
        isDual: customerMesses.length > 0 || !!primaryMessId,
        isMultiMess: customerMesses.length > 1,
        messName: messNames || r.messName || null,
        mess_name: messNames || r.mess_name || r.messName || null,
        mess_id: primaryMessId,
        messGroupTotal,
        mess_group_total: messGroupTotal,
        messTotal: messGroupTotal,
        mess_total: messGroupTotal,
        messMemberCount,
        currentBalance: balance,
        balance: balance,
        personalBalance,
        messShare,
        depositInCredit: depInCredit,
        card_deposit_amount: Number(r.card_deposit_amount || 0),
        depositAmount: Number(r.card_deposit_amount || 0),
        card_deposit_status: r.card_deposit_status || 'NONE',
        depositStatus: r.card_deposit_status || 'NONE',
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

/**
 * Master Khata Activity Journal (Credit Sales, Payments In, Settlements, and Net Cashflow)
 */
async function getKhataJournal(c: any) {
  const db = getDb(c.env);
  const type = c.req.query('type') || 'ALL';
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');
  const period = c.req.query('period') || 'day';
  const search = c.req.query('search') || '';
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '100', 10) || 100, 1), 500);
  const offset = Math.max(parseInt(c.req.query('offset') || '0', 10) || 0, 0);

  const { startIso, endIso, startDateStr, endDateStr } = getRegionalPeriodRange(period, startDate, endDate);

  const whereClauses = [
    "((kl.timestamp BETWEEN ? AND ?) OR (datetime(kl.timestamp) BETWEEN datetime(?) AND datetime(?)))",
    "(COALESCE(kl.reference, '') NOT LIKE 'VOID Reversal%' AND COALESCE(kl.reference, '') NOT LIKE 'Mess Equal Split Rebalance%')"
  ];
  const baseArgs = [startIso, endIso, startIso, endIso];

  const upperType = String(type || 'ALL').toUpperCase();
  if (upperType === 'PAYMENT' || upperType === 'PAYMENT_IN') {
    whereClauses.push("(kl.type IN ('PAYMENT', 'PAYMENT_IN') OR kl.amount < 0)");
  } else if (upperType === 'SALE' || upperType === 'CREDIT') {
    whereClauses.push("(kl.type IN ('SALE', 'CHARGE') OR (kl.amount > 0 AND kl.type NOT IN ('CARD_DEPOSIT', 'DEPOSIT', 'OPENING_BALANCE')))");
  } else if (upperType === 'DEPOSIT') {
    whereClauses.push("(kl.type = 'CARD_DEPOSIT' OR kl.reference LIKE '%Deposit%')");
  }

  const searchArgs: any[] = [];
  const cleanSearch = String(search || '').trim();
  if (cleanSearch) {
    whereClauses.push("(c.name LIKE ? OR c.phone LIKE ? OR c.cpr LIKE ? OR kl.reference LIKE ? OR kl.id LIKE ? OR mg.group_name LIKE ?)");
    const pattern = `%${cleanSearch}%`;
    searchArgs.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }

  const fullWhere = whereClauses.join(' AND ');

  try {
    const summarySql = `
      SELECT 
        ROUND(COALESCE(SUM(CASE WHEN (kl.type IN ('SALE', 'CHARGE') OR (kl.amount > 0 AND kl.type NOT IN ('CARD_DEPOSIT', 'DEPOSIT', 'OPENING_BALANCE'))) THEN kl.amount ELSE 0 END), 0), 3) AS totalCreditIssued,
        COUNT(CASE WHEN (kl.type IN ('SALE', 'CHARGE') OR (kl.amount > 0 AND kl.type NOT IN ('CARD_DEPOSIT', 'DEPOSIT', 'OPENING_BALANCE'))) THEN 1 END) AS creditCount,
        ROUND(COALESCE(SUM(CASE WHEN (kl.type IN ('PAYMENT', 'PAYMENT_IN') OR kl.amount < 0) THEN ABS(kl.amount) ELSE 0 END), 0), 3) AS totalPaymentsCollected,
        COUNT(CASE WHEN (kl.type IN ('PAYMENT', 'PAYMENT_IN') OR kl.amount < 0) THEN 1 END) AS paymentCount,
        ROUND(COALESCE(SUM(CASE WHEN kl.type = 'CARD_DEPOSIT' THEN kl.amount ELSE 0 END), 0), 3) AS totalDeposits,
        COUNT(CASE WHEN kl.type = 'CARD_DEPOSIT' THEN 1 END) AS depositCount,
        COUNT(DISTINCT kl.customerId) AS uniquePartiesCount,
        COUNT(kl.id) AS totalEntries
      FROM KhataLedger kl
      LEFT JOIN Customer c ON kl.customerId = c.id
      LEFT JOIN MessGroup mg ON kl.mess_id = mg.id
      WHERE ${fullWhere}
    `;

    const summaryRes = await db.execute({
      sql: summarySql,
      args: [...baseArgs, ...searchArgs]
    });

    const rawSummary: any = summaryRes.rows?.[0] || {};
    const totalCredit = Number(rawSummary.totalCreditIssued || 0);
    const totalPayments = Number(rawSummary.totalPaymentsCollected || 0);
    const netKhataFlow = Number((totalPayments - totalCredit).toFixed(3));
    const recoveryRate = totalCredit > 0 ? Number(((totalPayments / totalCredit) * 100).toFixed(1)) : 100.0;

    const txSql = `
      SELECT 
        kl.id,
        kl.customerId,
        kl.type,
        kl.amount,
        kl.reference,
        kl.running_balance,
        kl.timestamp,
        kl.created_at,
        kl.sale_id,
        kl.mess_id,
        kl.group_total,
        kl.member_count,
        kl.subledger_type,
        c.name AS customerName,
        c.phone AS customerPhone,
        c.cpr AS customerCpr,
        mg.group_name AS messGroupName
      FROM KhataLedger kl
      LEFT JOIN Customer c ON kl.customerId = c.id
      LEFT JOIN MessGroup mg ON kl.mess_id = mg.id
      WHERE ${fullWhere}
      ORDER BY kl.timestamp DESC
      LIMIT ? OFFSET ?
    `;

    const txRes = await db.execute({
      sql: txSql,
      args: [...baseArgs, ...searchArgs, limit, offset]
    });

    const transactions = (txRes.rows || []).map((row: any) => {
      const isPayment = row.type === 'PAYMENT' || row.type === 'PAYMENT_IN' || row.amount < 0;
      const isDeposit = row.type === 'CARD_DEPOSIT' || (row.reference && String(row.reference).includes('Deposit'));
      const direction = isPayment ? 'IN' : 'OUT';
      const displayType = isDeposit ? 'CARD_DEPOSIT' : (isPayment ? 'PAYMENT_IN' : 'CREDIT_SALE');

      return {
        id: row.id,
        customerId: row.customerId,
        customerName: row.customerName || 'Walk-in / Unknown',
        customerPhone: row.customerPhone,
        customerCpr: row.customerCpr,
        messGroupName: row.messGroupName,
        type: displayType,
        rawType: row.type,
        direction,
        amount: Math.abs(Number(row.amount || 0)),
        signedAmount: Number(row.amount || 0),
        reference: row.reference || (isPayment ? 'Cash Settlement' : 'Khata Credit Sale'),
        runningBalance: row.running_balance != null ? Number(row.running_balance) : null,
        saleId: row.sale_id,
        messId: row.mess_id,
        timestamp: row.timestamp || row.created_at,
        subledgerType: row.subledger_type || 'PERSONAL'
      };
    });

    return c.json({
      success: true,
      period: {
        requested: period,
        startIso,
        endIso,
        startDate: startDateStr,
        endDate: endDateStr
      },
      summary: {
        totalCreditIssued: totalCredit,
        creditCount: Number(rawSummary.creditCount || 0),
        totalPaymentsCollected: totalPayments,
        paymentCount: Number(rawSummary.paymentCount || 0),
        totalDeposits: Number(rawSummary.totalDeposits || 0),
        depositCount: Number(rawSummary.depositCount || 0),
        netKhataFlow,
        recoveryRate,
        uniquePartiesCount: Number(rawSummary.uniquePartiesCount || 0),
        totalEntries: Number(rawSummary.totalEntries || 0)
      },
      pagination: {
        limit,
        offset,
        count: transactions.length,
        total: Number(rawSummary.totalEntries || 0)
      },
      transactions
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch khata journal', details: err?.message }, 500);
  }
}

khataRouter.get('/journal', getKhataJournal);
khataRouter.get('/khata/journal', getKhataJournal);

// Claims compatibility
khataRouter.get('/claims/pending', (c) => c.json({ success: true, claims: [] }));
khataRouter.get('/khata/claims/pending', (c) => c.json({ success: true, claims: [] }));

/**
 * High-Speed NFC Tag Resolution (Serves both /customers/nfc/:uid and /customers/by-card/:uid)
 * Supports Personal Cards, Mess Group Shared Cards, and Dual Cards with Roster Splitting
 */
async function resolveCustomerByCard(c: any) {
  const db = getDb(c.env);
  const rawParam = c.req.param('uid') || '';
  let cleanInput = '';
  try {
    cleanInput = decodeURIComponent(rawParam).trim();
  } catch {
    cleanInput = rawParam.trim();
  }

  // Strip URL or KHATA: prefixes if scanned from phone QR code / PWA pass
  if (cleanInput.includes('/tab/')) {
    cleanInput = cleanInput.split('/tab/')[1].split('?')[0].split('/')[0].trim();
  } else if (cleanInput.toUpperCase().startsWith('KHATA:')) {
    cleanInput = cleanInput.slice(6).trim();
  } else if (cleanInput.toUpperCase().startsWith('CUST-')) {
    cleanInput = cleanInput.slice(5).trim();
  }
  cleanInput = cleanInput.replace(/^#+|#+$/g, '');

  const uid = normalizeNfcUid(cleanInput);
  const cleanNoColon = stripNfcSeparators(uid);

  try {
    let customerId: string | null = null;
    let messId: string | null = null;
    let cardType = 'PERSONAL';

    // 0. Direct UUID, ID, CPR, Phone, or Access Token lookup (Digital Khata Pass / PWA QR Code)
    try {
      const directCust = await db.execute({
        sql: `SELECT id, mess_id FROM Customer 
              WHERE id = ? OR LOWER(id) = LOWER(?) OR phone = ? OR access_token = ? OR cpr = ?
              LIMIT 1`,
        args: [cleanInput, cleanInput, cleanInput, cleanInput, cleanInput]
      });
      if (directCust.rows && directCust.rows.length > 0) {
        customerId = directCust.rows[0].id as string;
        messId = (directCust.rows[0].mess_id as string) || null;
      }
    } catch (err: any) {
      console.warn('Direct customer pass lookup note:', err?.message);
    }

    // 0.5 Direct Mess Group lookup (if group ID or Mess QR was scanned)
    if (!customerId) {
      try {
        const directGroup = await db.execute({
          sql: `SELECT id, group_name FROM MessGroup WHERE id = ? OR LOWER(id) = LOWER(?) LIMIT 1`,
          args: [cleanInput, cleanInput]
        });
        if (directGroup.rows && directGroup.rows.length > 0) {
          messId = directGroup.rows[0].id as string;
          cardType = 'MESS';
        }
      } catch { }
    }

    // 1. Try NfcCard table
    if (!customerId && !messId) {
      const cardRes = await db.execute({
        sql: `SELECT customer_id, card_type, mess_id 
              FROM NfcCard 
              WHERE UPPER(tag_id) = ? OR REPLACE(UPPER(tag_id), ':', '') = ? LIMIT 1`,
        args: [uid, cleanNoColon]
      });

      if (cardRes.rows.length > 0) {
        customerId = cardRes.rows[0].customer_id as string;
        messId = cardRes.rows[0].mess_id as string;
        cardType = ((cardRes.rows[0].card_type as string) || 'PERSONAL').toUpperCase();
      }
    }

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
      return c.json({ error: 'NFC card not assigned to any customer or mess group', uid: cleanInput }, 404);
    }

    const customerRes = await db.execute({
      sql: `SELECT id, name, phone, cpr, balance, credit_limit, is_active, nfcCardId, mess_id,
                   COALESCE(card_deposit_amount, 0.0) AS card_deposit_amount,
                   COALESCE(card_deposit_status, 'NONE') AS card_deposit_status,
                   card_deposit_receipt_no, card_deposit_date
            FROM Customer WHERE id = ? LIMIT 1`,
      args: [customerId]
    });

    if (!customerRes.rows || customerRes.rows.length === 0) {
      return c.json({ error: 'Customer record missing' }, 404);
    }

    const row = customerRes.rows[0];
    const balance = Number(row.balance ?? 0);
    const rawLimit = Number(row.credit_limit);
    const limit = rawLimit > 0 ? rawLimit : 30.0;
    // Look up all messes this customer belongs to (from MessMember junction table and legacy mess_id)
    let customerMesses: any[] = [];
    try {
      const mmRes = await db.execute({
        sql: `SELECT DISTINCT g.id, g.group_name 
              FROM MessMember mm
              JOIN MessGroup g ON mm.mess_id = g.id
              WHERE mm.customer_id = ? AND mm.is_active = 1
              UNION
              SELECT g.id, g.group_name
              FROM Customer c
              JOIN MessGroup g ON c.mess_id = g.id
              WHERE c.id = ?`,
        args: [customerId, customerId]
      });
      customerMesses = (mmRes.rows || []).map(r => ({ id: String(r.id), group_name: String(r.group_name) }));
    } catch { }

    const primaryMess = customerMesses[0] || null;
    const finalMessId = primaryMess?.id || row.mess_id || messId;

    let groupName = primaryMess?.group_name || null;
    let groupMembers: any[] = [];
    if (finalMessId) {
      try {
        const [gRes, mRes] = await Promise.all([
          groupName ? { rows: [{ group_name: groupName }] } : db.execute({ sql: `SELECT group_name FROM MessGroup WHERE id = ? LIMIT 1`, args: [finalMessId] }),
          db.execute({
            sql: `SELECT DISTINCT c.id, c.name, c.balance 
                  FROM MessMember mm
                  JOIN Customer c ON mm.customer_id = c.id
                  WHERE mm.mess_id = ? AND mm.is_active = 1
                  UNION
                  SELECT c.id, c.name, c.balance
                  FROM Customer c
                  WHERE c.mess_id = ?`,
            args: [finalMessId, finalMessId]
          })
        ]);
        if (gRes.rows && gRes.rows.length > 0) groupName = gRes.rows[0].group_name as string;
        groupMembers = (mRes.rows || []).map(m => ({ ...m, balance: Number(m.balance ?? 0) }));
      } catch { }
    }

    let groupStats: { totalBalance: number; memberCount: number } | null = null;
    let messShare = 0;
    if (finalMessId) {
      try {
        const [gTot, mTot] = await Promise.all([
          db.execute({
            sql: `SELECT ROUND(COALESCE(SUM(amount), 0), 3) as totalBalance, COUNT(DISTINCT customerId) as memberCount
                  FROM KhataLedger WHERE mess_id = ?`,
            args: [finalMessId]
          }),
          db.execute({
            sql: `SELECT ROUND(COALESCE(SUM(amount), 0), 3) as messShare
                  FROM KhataLedger WHERE customerId = ? AND mess_id = ?`,
            args: [customerId, finalMessId]
          })
        ]);
        if (gTot.rows && gTot.rows.length > 0) {
          groupStats = {
            totalBalance: Number(gTot.rows[0].totalBalance || 0),
            memberCount: Number(gTot.rows[0].memberCount || 1)
          };
        }
        if (mTot.rows && mTot.rows.length > 0) {
          messShare = Number(mTot.rows[0].messShare || 0);
        }
      } catch { }
    }
    const messGroupTotal = groupStats ? groupStats.totalBalance : 0;
    const messMemberCount = groupStats ? groupStats.memberCount : (customerMesses.length || 1);
    const depInCredit = (row.card_deposit_status === 'IN_CREDIT' || row.card_deposit_status === 'DEFERRED_CREDIT' || row.card_deposit_status === 'DEFERRED_PAYDAY')
      ? Number(row.card_deposit_amount || 0)
      : 0;
    const personalBalance = Math.max(0, Number((balance - messShare - depInCredit).toFixed(3)));

    const isFrozen = (row.is_active === 0 || (row as any).isActive === 0);
    const isMultiMess = customerMesses.length > 1;
    const hasMessGroup = customerMesses.length > 0 || !!finalMessId;

    const customer = {
      ...row,
      currentBalance: balance,
      balance: balance,
      personalBalance,
      messShare,
      depositInCredit: depInCredit,
      card_deposit_amount: Number(row.card_deposit_amount || 0),
      depositAmount: Number(row.card_deposit_amount || 0),
      card_deposit_status: row.card_deposit_status || 'NONE',
      depositStatus: row.card_deposit_status || 'NONE',
      card_deposit_receipt_no: row.card_deposit_receipt_no || null,
      card_deposit_date: row.card_deposit_date || null,
      messGroupTotal,
      mess_group_total: messGroupTotal,
      messTotal: messGroupTotal,
      mess_total: messGroupTotal,
      messMemberCount,
      creditLimit: limit,
      credit_limit: limit,
      cardUid: row.nfcCardId || uid,
      card_type: isMultiMess ? 'MULTI_MESS' : (hasMessGroup ? 'DUAL' : 'PERSONAL'),
      hasMessGroup,
      isDual: hasMessGroup,
      isMultiMess,
      messes: customerMesses,
      mess_ids: customerMesses.map(m => m.id),
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
      sql: `SELECT id, name, is_active, isActive, COALESCE(khataPin, khata_pin, pin) as pinCode 
            FROM Customer 
            WHERE id = ? OR access_token = ? OR phone = ? 
            LIMIT 1`,
      args: [cleanId, cleanId, cleanId]
    });

    if (!custRes.rows || custRes.rows.length === 0) {
      return c.json({ success: false, error: 'Customer account not found' }, 404);
    }

    const customer: any = custRes.rows[0];
    const isCurrentlyActive = !(customer.is_active === 0 || customer.isActive === 0);
    const shouldFreeze = freeze !== undefined ? Boolean(freeze) : isCurrentlyActive;
    const newActiveState = shouldFreeze ? 0 : 1;

    // Unfreezing requires Manager authorization, Customer PIN, or valid Customer Device Token
    if (newActiveState === 1) {
      const isMgr = await isManagerAuthorizedEdge(c);
      let isPinVerified = false;

      const pinCandidate = String(body.pin || c.req.header('x-khata-pin') || '').trim();
      const customerPin = String(customer.pinCode || '').trim();

      if (pinCandidate && customerPin) {
        if (customerPin.startsWith('$2a$') || customerPin.startsWith('$2b$')) {
          isPinVerified = await bcrypt.compare(pinCandidate, customerPin);
        } else {
          isPinVerified = (customerPin === pinCandidate);
        }
      }

      const khataToken = c.req.header('x-khata-token') ||
        (c.req.header('authorization')?.startsWith('Bearer ') ? c.req.header('authorization')?.slice(7) : null);
      let isTokenValid = false;
      if (khataToken) {
        const verified = await verifyKhataDeviceTokenEdge(khataToken, customerPin, c.env.DEV_SECRET);
        if (verified && verified.customerId === customer.id) {
          isTokenValid = true;
        }
      }

      if (!isMgr && !isPinVerified && !isTokenValid) {
        return c.json({
          success: false,
          requiresPin: true,
          error: 'Unfreezing Khata credit requires Manager authorization, Customer PIN, or valid device token.'
        }, 401);
      }
    }

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
 * Enforces Invariant: Mess share debt can never become negative!
 * Supports: Personal, Full Mess Room (by one person), Multi-Mess waterfall, and Combined settlements.
 */
khataRouter.post('/customers/:id/settle', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';
  const customerId = c.req.param('id');

  try {
    const body = await c.req.json();
    const amount = Number(body.amountPaid || body.amount || 0);
    const note = body.note || body.reference || (body.paymentMethod === 'BENEFIT_PAY' ? 'BenefitPay Payment' : `SETTLE-${Date.now().toString().slice(-6)}`);
    const channel = body.channel || body.paymentMethod || 'CASH';
    const isExplicitPersonal = body.target === 'PERSONAL' || body.paymentTarget === 'PERSONAL';
    const isExplicitMess = body.target === 'MESS' || body.paymentTarget === 'MESS';
    const isExplicitDeposit = body.target === 'DEPOSIT' || body.paymentTarget === 'DEPOSIT';
    let isMessGroupPayment = body.target === 'MESS_GROUP' || body.paymentTarget === 'MESS_GROUP';
    let targetMessId = (isExplicitPersonal || isExplicitDeposit) ? null : (body.messId || body.mess_id || null);

    if (!customerId || amount <= 0) {
      return c.json({ error: 'Valid customerId and positive amount required' }, 400);
    }

    // Check if target ID is directly a MessGroup ID
    let targetMessGroup: any = null;
    try {
      const mgCheck = await db.execute({
        sql: `SELECT id, group_name FROM MessGroup WHERE (id = ? OR group_name = ?) AND id NOT IN (SELECT id FROM DisbandedMessGroup) LIMIT 1`,
        args: [customerId, customerId]
      });
      if (mgCheck.rows && mgCheck.rows.length > 0) {
        isMessGroupPayment = true;
        targetMessGroup = mgCheck.rows[0];
        targetMessId = targetMessGroup.id;
      }
    } catch { }

    // CASE A: Full Mess Room Settlement by one person / direct group clearance
    if (isMessGroupPayment && (targetMessId || targetMessGroup)) {
      if (!targetMessGroup && targetMessId) {
        try {
          const mgRes = await db.execute({
            sql: `SELECT id, group_name FROM MessGroup WHERE (id = ? OR group_name = ?) AND id NOT IN (SELECT id FROM DisbandedMessGroup) LIMIT 1`,
            args: [targetMessId, targetMessId]
          });
          targetMessGroup = mgRes.rows?.[0] || null;
        } catch { }
      }

      if (targetMessGroup) {
        const mRes = await db.execute({
          sql: `SELECT customerId, ROUND(COALESCE(SUM(amount), 0), 3) AS bal
                FROM KhataLedger
                WHERE mess_id = ?
                GROUP BY customerId
                HAVING bal > 0`,
          args: [targetMessGroup.id]
        });
        const memberDebts = (mRes.rows || []).map((r: any) => ({
          id: r.customerId as string,
          debt: Math.max(0, Number(r.bal || 0))
        }));
        const totalPositiveDebt = Number(memberDebts.reduce((sum: number, m: any) => sum + m.debt, 0).toFixed(3));
        const credits = new Map<string, number>();

        if (totalPositiveDebt > 0) {
          if (amount >= totalPositiveDebt) {
            for (const md of memberDebts) {
              if (md.debt > 0) credits.set(md.id, md.debt);
            }
          } else {
            let allocatedTotal = 0;
            for (const md of memberDebts) {
              if (md.debt > 0) {
                const cVal = Math.min(md.debt, parseFloat(((amount * md.debt) / totalPositiveDebt).toFixed(3)));
                credits.set(md.id, cVal);
                allocatedTotal = Number((allocatedTotal + cVal).toFixed(3));
              }
            }
            let remainder = Number((amount - allocatedTotal).toFixed(3));
            if (remainder > 0) {
              const sorted = [...memberDebts].filter(md => (credits.get(md.id) || 0) < md.debt).sort((a, b) => b.debt - a.debt);
              if (sorted.length > 0) {
                credits.set(sorted[0].id, Number(((credits.get(sorted[0].id) || 0) + remainder).toFixed(3)));
              }
            }
          }
        }

        const batch: any[] = [];
        const now = getRegionalIsoString();
        for (const [mId, cAmt] of credits.entries()) {
          if (cAmt <= 0) continue;
          const txId = `tx_settle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          batch.push({
            sql: `INSERT INTO KhataLedger (id, tenantId, storeId, customerId, amount, type, reference, syncStatus, timestamp, created_at, mess_id, subledger_type)
                  VALUES (?, ?, ?, ?, ?, 'PAYMENT', ?, 'SYNCED', ?, ?, ?, 'MESS_SHARE')`,
            args: [txId, tenantId, storeId, mId, -cAmt, `Mess Settlement: ${targetMessGroup.group_name} (${note})`, now, now, targetMessGroup.id]
          });
          batch.push({
            sql: `UPDATE Customer SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?), updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
            args: [mId, mId]
          });
        }

        // Overpayment beyond communal room debt: credit excess to paying customer's personal tab
        const payingCustId = body.payingCustomerId || (customerId !== targetMessGroup.id ? customerId : null);
        if (amount > totalPositiveDebt && payingCustId) {
          const excess = Number((amount - totalPositiveDebt).toFixed(3));
          if (excess > 0) {
            const advId = `tx_settle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            batch.push({
              sql: `INSERT INTO KhataLedger (id, tenantId, storeId, customerId, amount, type, reference, syncStatus, timestamp, created_at, mess_id, subledger_type)
                    VALUES (?, ?, ?, ?, ?, 'PAYMENT', ?, 'SYNCED', ?, ?, NULL, 'PERSONAL')`,
              args: [advId, tenantId, storeId, payingCustId, -excess, `Advance Payment from Mess Settlement: ${targetMessGroup.group_name} (${note})`, now, now]
            });
            batch.push({
              sql: `UPDATE Customer SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?), updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
              args: [payingCustId, payingCustId]
            });
          }
        }

        if (batch.length > 0) {
          await db.batch(batch, 'write');
        }

        return c.json({
          success: true,
          message: `Mess debt settled: BD ${amount.toFixed(3)} allocated to clear communal room debt`,
          isMess: true,
          messGroupId: targetMessGroup.id,
          amountPaid: amount,
          channel,
          reference: note
        });
      }
    }

    // CASE B: Customer Individual Settlement with Strict Isolation
    let previousBalance = 0;
    try {
      const balRes = await db.execute({
        sql: `SELECT ROUND(COALESCE(SUM(amount), 0), 3) AS bal 
              FROM KhataLedger 
              WHERE customerId = ? 
                AND type NOT IN ('CARD_DEPOSIT', 'CARD_REFUND', 'CARD_DEPOSIT_REFUND') 
                AND COALESCE(subledger_type, '') NOT IN ('DEPOSIT', 'DEPOSIT_DEFERRED', 'CASH_ADVANCE')`,
        args: [customerId]
      });
      previousBalance = Math.max(0, Number(balRes.rows?.[0]?.bal || 0));
    } catch { }

    let pDebt = 0;
    try {
      const pDebtRes = await db.execute({
        sql: `SELECT ROUND(COALESCE(SUM(amount), 0), 3) AS bal 
              FROM KhataLedger 
              WHERE customerId = ? 
                AND (mess_id IS NULL OR mess_id = '') 
                AND type NOT IN ('CARD_DEPOSIT', 'CARD_REFUND', 'CARD_DEPOSIT_REFUND') 
                AND COALESCE(subledger_type, '') NOT IN ('DEPOSIT', 'DEPOSIT_DEFERRED', 'CASH_ADVANCE')`,
        args: [customerId]
      });
      pDebt = Math.max(0, Number(pDebtRes.rows?.[0]?.bal || 0));
    } catch { }

    let activeMesses: { mess_id: string; bal: number }[] = [];
    try {
      const mDebtRes = await db.execute({
        sql: `SELECT mess_id, ROUND(COALESCE(SUM(amount), 0), 3) AS bal 
              FROM KhataLedger 
              WHERE customerId = ? 
                AND mess_id IS NOT NULL 
                AND mess_id != '' 
                AND type NOT IN ('CARD_DEPOSIT', 'CARD_REFUND', 'CARD_DEPOSIT_REFUND') 
                AND COALESCE(subledger_type, '') NOT IN ('DEPOSIT', 'DEPOSIT_DEFERRED', 'CASH_ADVANCE')
              GROUP BY mess_id 
              HAVING bal > 0 
              ORDER BY bal DESC`,
        args: [customerId]
      });
      activeMesses = (mDebtRes.rows || []).map((r: any) => ({
        mess_id: r.mess_id as string,
        bal: Math.max(0, Number(r.bal || 0))
      }));
    } catch { }

    if (!targetMessId && !isExplicitPersonal && !isExplicitMess) {
      if (pDebt <= 0 && activeMesses.length === 1) {
        targetMessId = activeMesses[0].mess_id;
      }
    }

    const batch: any[] = [];
    const now = getRegionalIsoString();

    if (isExplicitDeposit) {
      // 1. Settle Card Security Deposit strictly as its own independent financial entity
      const txId = `tx_settle_dep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      batch.push({
        sql: `INSERT INTO KhataLedger (id, tenantId, storeId, customerId, amount, type, reference, syncStatus, timestamp, created_at, mess_id, subledger_type)
              VALUES (?, ?, ?, ?, ?, 'PAYMENT', ?, 'SYNCED', ?, ?, NULL, 'DEPOSIT')`,
        args: [txId, tenantId, storeId, customerId, -amount, `${note} (Deposit Payment)`, now, now]
      });
      batch.push({
        sql: `UPDATE Customer SET card_deposit_status = 'HELD', card_deposit_date = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [customerId]
      });
      batch.push({
        sql: `INSERT INTO KhataLedger (id, tenantId, storeId, customerId, amount, type, reference, syncStatus, timestamp, created_at, mess_id, subledger_type)
              VALUES (?, ?, ?, ?, 0, 'CARD_DEPOSIT', ?, 'SYNCED', ?, ?, NULL, 'DEPOSIT')`,
        args: [
          `DEP-SETTLE-${Date.now()}`,
          tenantId,
          storeId,
          customerId,
          `Card Security Deposit Cleared with Payment - Held in Custodial Trust: BD ${amount.toFixed(3)}`,
          now,
          now
        ]
      });
    } else if (isExplicitPersonal) {
      // 2. Pure personal settlement - strictly hits personal tab
      const txId = `tx_settle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      batch.push({
        sql: `INSERT INTO KhataLedger (id, tenantId, storeId, customerId, amount, type, reference, syncStatus, timestamp, created_at, mess_id, subledger_type)
              VALUES (?, ?, ?, ?, ?, 'PAYMENT', ?, 'SYNCED', ?, ?, NULL, 'PERSONAL')`,
        args: [txId, tenantId, storeId, customerId, -amount, note, now, now]
      });
    } else if (isExplicitMess || (targetMessId && targetMessId !== 'ALL_MESSES')) {
      // 3. Mess share settlement - single room or multi-mess division
      // INVARIANT: Under NO circumstances should any portion of a mess share payment touch or reduce the Personal Tab or Deposit!
      let remainingToAllocate = amount;

      // If specific room requested, allocate to that room first
      if (targetMessId && targetMessId !== 'ALL_MESSES') {
        const targetMessObj = activeMesses.find(m => m.mess_id === targetMessId);
        const targetMessDebt = targetMessObj ? targetMessObj.bal : 0;
        const payToTargetMess = parseFloat(Math.min(targetMessDebt, remainingToAllocate).toFixed(3));

        if (payToTargetMess > 0) {
          const txId = `tx_settle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          batch.push({
            sql: `INSERT INTO KhataLedger (id, tenantId, storeId, customerId, amount, type, reference, syncStatus, timestamp, created_at, mess_id, subledger_type)
                  VALUES (?, ?, ?, ?, ?, 'PAYMENT', ?, 'SYNCED', ?, ?, ?, 'MESS_SHARE')`,
            args: [txId, tenantId, storeId, customerId, -payToTargetMess, `${note} (Mess Share)`, now, now, targetMessId]
          });
          remainingToAllocate = parseFloat((remainingToAllocate - payToTargetMess).toFixed(3));
        }
      }

      // Multi-Mess Allocation: If payment remains, divide across all other active mess debts
      if (remainingToAllocate > 0 && activeMesses.length > 0) {
        for (const m of activeMesses) {
          if (m.mess_id === targetMessId || remainingToAllocate <= 0) continue;
          const payOther = parseFloat(Math.min(m.bal, remainingToAllocate).toFixed(3));
          if (payOther > 0) {
            const txIdOther = `tx_settle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            batch.push({
              sql: `INSERT INTO KhataLedger (id, tenantId, storeId, customerId, amount, type, reference, syncStatus, timestamp, created_at, mess_id, subledger_type)
                    VALUES (?, ?, ?, ?, ?, 'PAYMENT', ?, 'SYNCED', ?, ?, ?, 'MESS_SHARE')`,
              args: [txIdOther, tenantId, storeId, customerId, -payOther, `${note} (Mess Balance)`, now, now, m.mess_id]
            });
            remainingToAllocate = parseFloat((remainingToAllocate - payOther).toFixed(3));
          }
        }
      }

      // If customer overpaid beyond all their mess debts:
      // Allocate the remaining excess strictly as advance credit for the Mess Room, NEVER to the Personal Tab!
      if (remainingToAllocate > 0) {
        const excessMessId = targetMessId && targetMessId !== 'ALL_MESSES'
          ? targetMessId
          : (activeMesses[0]?.mess_id ?? null);
        const txIdAdv = `tx_settle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        batch.push({
          sql: `INSERT INTO KhataLedger (id, tenantId, storeId, customerId, amount, type, reference, syncStatus, timestamp, created_at, mess_id, subledger_type)
                VALUES (?, ?, ?, ?, ?, 'PAYMENT', ?, 'SYNCED', ?, ?, ?, 'MESS_SHARE')`,
          args: [txIdAdv, tenantId, storeId, customerId, -remainingToAllocate, `${note} (Mess Advance Credit)`, now, now, excessMessId]
        });
      }
    } else {
      // 4. Account waterfall settlement (TOTAL)
      // Clears personal debt first, then mess debts, then card deposit, then excess to personal advance
      const pAmt = parseFloat(Math.min(pDebt, amount).toFixed(3));
      let remainingToAllocate = parseFloat((amount - pAmt).toFixed(3));

      if (pAmt > 0) {
        const txId = `tx_settle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        batch.push({
          sql: `INSERT INTO KhataLedger (id, tenantId, storeId, customerId, amount, type, reference, syncStatus, timestamp, created_at, mess_id, subledger_type)
                VALUES (?, ?, ?, ?, ?, 'PAYMENT', ?, 'SYNCED', ?, ?, NULL, 'PERSONAL')`,
          args: [txId, tenantId, storeId, customerId, -pAmt, note, now, now]
        });
      }

      // Allocate remaining payment sequentially across all active mess debts
      if (remainingToAllocate > 0 && activeMesses.length > 0) {
        for (const m of activeMesses) {
          if (remainingToAllocate <= 0) break;
          const payToThisMess = parseFloat(Math.min(m.bal, remainingToAllocate).toFixed(3));
          if (payToThisMess > 0) {
            const txIdMess = `tx_settle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            batch.push({
              sql: `INSERT INTO KhataLedger (id, tenantId, storeId, customerId, amount, type, reference, syncStatus, timestamp, created_at, mess_id, subledger_type)
                    VALUES (?, ?, ?, ?, ?, 'PAYMENT', ?, 'SYNCED', ?, ?, ?, 'MESS_SHARE')`,
              args: [txIdMess, tenantId, storeId, customerId, -payToThisMess, `${note} (Mess Balance)`, now, now, m.mess_id]
            });
            remainingToAllocate = parseFloat((remainingToAllocate - payToThisMess).toFixed(3));
          }
        }
      }

      // If payment remains after personal and mess, check if customer owes a credit deposit
      if (remainingToAllocate > 0) {
        try {
          const depCheck = await db.execute({
            sql: `SELECT card_deposit_status, card_deposit_amount FROM Customer WHERE id = ? LIMIT 1`,
            args: [customerId]
          });
          const curStatus = depCheck.rows?.[0]?.card_deposit_status;
          const curDepAmt = Number(depCheck.rows?.[0]?.card_deposit_amount || 0);
          if ((curStatus === 'IN_CREDIT' || curStatus === 'DEFERRED_CREDIT' || curStatus === 'DEFERRED_PAYDAY') && curDepAmt > 0 && remainingToAllocate >= curDepAmt) {
            const txIdDep = `tx_settle_dep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            batch.push({
              sql: `INSERT INTO KhataLedger (id, tenantId, storeId, customerId, amount, type, reference, syncStatus, timestamp, created_at, mess_id, subledger_type)
                    VALUES (?, ?, ?, ?, ?, 'PAYMENT', ?, 'SYNCED', ?, ?, NULL, 'DEPOSIT')`,
              args: [txIdDep, tenantId, storeId, customerId, -curDepAmt, `${note} (Deposit Cleared)`, now, now]
            });
            batch.push({
              sql: `UPDATE Customer SET card_deposit_status = 'HELD', card_deposit_date = CURRENT_TIMESTAMP WHERE id = ?`,
              args: [customerId]
            });
            batch.push({
              sql: `INSERT INTO KhataLedger (id, tenantId, storeId, customerId, amount, type, reference, syncStatus, timestamp, created_at, mess_id, subledger_type)
                    VALUES (?, ?, ?, ?, 0, 'CARD_DEPOSIT', ?, 'SYNCED', ?, ?, NULL, 'DEPOSIT')`,
              args: [
                `DEP-SETTLE-${Date.now()}`,
                tenantId,
                storeId,
                customerId,
                `Card Security Deposit Cleared with Credit Payment - Held in Custodial Trust: BD ${curDepAmt.toFixed(3)}`,
                now,
                now
              ]
            });
            remainingToAllocate = parseFloat((remainingToAllocate - curDepAmt).toFixed(3));
          }
        } catch { }
      }

      // If payment exceeds personal, mess, and deposit debts, credit remainder to personal tab as advance credit
      if (remainingToAllocate > 0) {
        const txIdAdv = `tx_settle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        batch.push({
          sql: `INSERT INTO KhataLedger (id, tenantId, storeId, customerId, amount, type, reference, syncStatus, timestamp, created_at, mess_id, subledger_type)
                VALUES (?, ?, ?, ?, ?, 'PAYMENT', ?, 'SYNCED', ?, ?, NULL, 'PERSONAL')`,
          args: [txIdAdv, tenantId, storeId, customerId, -remainingToAllocate, `${note} (Advance Credit)`, now, now]
        });
      }
    }

    // Baqala Goodwill Round-Off: Check if micro-balance forgiveness was requested
    const { forgiveMicroBalance, forgiveGoodwill, goodwillDiscount } = body;
    const currentInterimBalance = Number((previousBalance - amount).toFixed(3));
    let appliedGoodwill = 0;

    if ((forgiveMicroBalance || forgiveGoodwill || (Number(goodwillDiscount) > 0)) && currentInterimBalance > 0 && currentInterimBalance <= 0.500) {
      appliedGoodwill = Math.min(currentInterimBalance, Number(goodwillDiscount) > 0 ? Number(goodwillDiscount) : currentInterimBalance);
      appliedGoodwill = Number(appliedGoodwill.toFixed(3));

      if (appliedGoodwill > 0) {
        const discountTxId = `tx_disc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        batch.push({
          sql: `INSERT INTO KhataLedger (id, tenantId, storeId, customerId, amount, type, reference, syncStatus, timestamp, created_at, mess_id, subledger_type)
                VALUES (?, ?, ?, ?, ?, 'DISCOUNT', 'Store Goodwill Discount (Settlement Round-Off)', 'SYNCED', ?, ?, NULL, 'DISCOUNT')`,
          args: [discountTxId, tenantId, storeId, customerId, -appliedGoodwill, now, now]
        });
      }
    }

    batch.push({
      sql: `UPDATE Customer 
            SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?),
                updatedAt = CURRENT_TIMESTAMP 
            WHERE id = ?`,
      args: [customerId, customerId]
    });

    await db.batch(batch, 'write');

    const custRes = await db.execute({
      sql: `SELECT balance FROM Customer WHERE id = ? LIMIT 1`,
      args: [customerId]
    });
    const finalBalance = Number(custRes.rows?.[0]?.balance ?? 0);

    return c.json({
      success: true,
      message: 'Settlement recorded successfully',
      customerId,
      amountPaid: amount,
      goodwillDiscount: appliedGoodwill,
      isGoodwillForgiven: appliedGoodwill > 0,
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
      sql: `SELECT id, group_name FROM MessGroup WHERE (id = ? OR group_name = ?) AND id NOT IN (SELECT id FROM DisbandedMessGroup) LIMIT 1`,
      args: [messId, messId]
    });
    group = gRes.rows?.[0] || null;
    if (group) {
      const mRes = await db.execute({
        sql: `SELECT DISTINCT c.id, c.name, c.phone, c.cpr, c.balance, c.nfcCardId,
                              COALESCE(mm.role, 'MEMBER') as role,
                              COALESCE(mm.is_active, 1) as is_active
              FROM Customer c
              JOIN MessMember mm ON c.id = mm.customer_id
              WHERE mm.mess_id = ?
              UNION
              SELECT c.id, c.name, c.phone, c.cpr, c.balance, c.nfcCardId,
                     'MEMBER' as role, 1 as is_active
              FROM Customer c
              WHERE c.mess_id = ? AND NOT EXISTS (SELECT 1 FROM MessMember WHERE mess_id = ?)`,
        args: [group.id, group.id, group.id]
      });
      memberRows = mRes.rows || [];
    }
  } catch { }

  if (!group) return null;

  // 1. Fetch group's actual communal mess balance strictly from KhataLedger where mess_id = group.id
  let messTotalBalance = 0.0;
  try {
    const balRes = await db.execute({
      sql: `SELECT ROUND(COALESCE(SUM(amount), 0), 3) as totalBalance FROM KhataLedger WHERE mess_id = ?`,
      args: [group.id]
    });
    messTotalBalance = Number(balRes.rows?.[0]?.totalBalance ?? 0);
  } catch (e: any) {
    console.warn('Error fetching mess total balance on edge:', e?.message);
  }

  // 2. Fetch individual members' shares in this specific mess group
  const memberMessBalances = new Map<string, number>();
  try {
    const memberBalRes = await db.execute({
      sql: `SELECT customerId, ROUND(COALESCE(SUM(amount), 0), 3) as balance 
            FROM KhataLedger 
            WHERE mess_id = ? 
            GROUP BY customerId`,
      args: [group.id]
    });
    for (const row of (memberBalRes.rows || [])) {
      memberMessBalances.set(row.customerId as string, Number(row.balance ?? 0));
    }
  } catch (e: any) {
    console.warn('Error fetching member mess balances on edge:', e?.message);
  }

  const memberCount = Math.max(1, memberRows.length);
  const equalSplitShare = Number((messTotalBalance / memberCount).toFixed(3));

  const members = memberRows.map((m: any) => {
    const messShare = memberMessBalances.get(m.id) ?? 0.0;
    const personalTotal = Number(m.balance ?? 0);
    return {
      id: m.id,
      name: m.name,
      phone: m.phone,
      cpr: m.cpr,
      cardUid: m.nfcCardId || null,
      currentBalance: Number(messShare.toFixed(3)),
      balance: Number(messShare.toFixed(3)),
      messShare: Number(messShare.toFixed(3)),
      personalBalance: Number((personalTotal - messShare).toFixed(3)),
      consolidatedBalance: personalTotal,
      equalSplitShare,
      spendPercentage: messTotalBalance > 0 ? Number(((messShare / messTotalBalance) * 100).toFixed(1)) : 0
    };
  });

  // 3. Fetch mess group collective ledger strictly for this mess_id
  let messLedger: any[] = [];
  try {
    const res = await db.execute({
      sql: `SELECT * FROM KhataLedger WHERE mess_id = ? ORDER BY datetime(COALESCE(created_at, timestamp, '1970-01-01')) ASC`,
      args: [group.id]
    });
    const groupEntries = res.rows || [];
    const memberNameMap = new Map(members.map(m => [m.id, m.name]));

    let messRunningBalance = 0;
    const parsedEntries = groupEntries.map((entry: any) => {
      const numAmount = Number(entry.amount || 0);
      messRunningBalance += numAmount;
      const isPayment = numAmount < 0;
      const txType = entry.type === 'WRITE_OFF' ? 'WRITE_OFF' : (isPayment || entry.type === 'PAYMENT' ? 'PAYMENT' : 'CHARGE');
      const d = new Date(entry.created_at || entry.timestamp || entry.createdAt || Date.now());
      const ref = entry.reference || (txType === 'CHARGE' ? 'Mess Grocery Purchase' : 'Mess Payment');

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
        mess_id: group.id,
        messName: group.group_name,
        walletName: group.group_name,
        group_total: entry.group_total ? Number(entry.group_total) : null,
        member_count: entry.member_count ? Number(entry.member_count) : null,
        sale_id: entry.sale_id || null,
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
    totalBalance: Number(messTotalBalance.toFixed(3)),
    balance: Number(messTotalBalance.toFixed(3)),
    equalSplitShare,
    members,
    messLedger
  };
};

/**
 * Handler: Fetch Customer Khata Statement with Line-by-Line Running Balance
 */
const handleCustomerStatement = async (c: any) => {
  const db = getDb(c.env);
  const rawId = c.req.param('id') || c.req.param('uuid') || '';
  let customerId = rawId.trim();
  if (customerId.toLowerCase().includes('/tab/')) {
    const match = customerId.match(/\/tab\/([^\/\?\#]+)/i);
    customerId = match ? match[1].trim() : customerId.split(/\/tab\//i)[1].split(/[\/?#]/)[0].trim();
  } else if (customerId.toUpperCase().startsWith('KHATA:')) {
    customerId = customerId.slice(6).trim();
  } else if (customerId.toUpperCase().startsWith('CUST-')) {
    customerId = customerId.slice(5).trim();
  }
  customerId = customerId.replace(/^#+|#+$/g, '');

  try {
    let custRes = await db.execute({
      sql: `SELECT id, name, phone, cpr, balance, credit_limit, is_active, nfcCardId, mess_id, createdAt,
                   COALESCE(card_deposit_amount, 0.0) as card_deposit_amount,
                   COALESCE(card_deposit_status, 'NONE') as card_deposit_status,
                   COALESCE(khataPin, khata_pin, pin) as pinCode
            FROM Customer 
            WHERE id = ? OR LOWER(id) = LOWER(?) OR phone = ? OR nfcCardId = ? OR cardUid = ? OR nfc_card_id = ? OR cpr = ? 
            LIMIT 1`,
      args: [customerId, customerId, customerId, customerId, customerId, customerId, customerId]
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

    // IDOR & Privacy Defense: If customer account is PIN-protected, require Manager, POS terminal or valid HMAC device token
    const pinHash = String(customer.pinCode || '').trim();
    if (pinHash) {
      const isMgr = await isManagerAuthorizedEdge(c);
      const posHeader = (c.req.header('x-pos-terminal-id') || c.req.header('x-pos-key') || c.req.header('x-pos-client') || '').trim();
      const posSecret = ((c.env as any).POS_AUTH_SECRET || (c.env as any).DEV_SECRET || '').trim();
      const isPosAuthorized = Boolean(posHeader && posSecret && posHeader === posSecret);
      const deviceTok = (c.req.header('x-khata-token') || c.req.query('token') || '').trim();

      let isAuthorized = Boolean(isMgr || isPosAuthorized);
      if (!isAuthorized && deviceTok) {
        const verified = await verifyKhataDeviceTokenEdge(deviceTok, pinHash, c.env.DEVICE_TOKEN_SECRET);
        if (verified && verified.customerId === realId) {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        return c.json({
          success: false,
          requiresPin: true,
          customerId: realId,
          customerName: customer.name,
          error: 'Khata account is PIN protected. Verification required.'
        }, 401);
      }
    }

    // Fetch all Mess Groups customer belongs to
    let customerMesses: any[] = [];
    try {
      const mmRes = await db.execute({
        sql: `SELECT DISTINCT mg.id, mg.group_name 
              FROM MessMember mm 
              JOIN MessGroup mg ON mm.mess_id = mg.id 
              WHERE mm.customer_id = ?
              UNION
              SELECT mg.id, mg.group_name 
              FROM Customer c 
              JOIN MessGroup mg ON c.mess_id = mg.id 
              WHERE c.id = ?`,
        args: [realId, realId]
      });
      customerMesses = mmRes.rows ? [...mmRes.rows] : [];
    } catch (e: any) {
      console.warn('Error fetching customer messes on edge:', e?.message);
    }

    const detailedMesses: any[] = [];
    for (const m of customerMesses) {
      try {
        const details = await fetchMessGroupDetails(db, m.id);
        if (details) detailedMesses.push(details);
      } catch (err: any) {
        console.warn(`Error fetching mess details on edge for ${m.id}:`, err?.message);
      }
    }

    const targetMessId = c.req.query('mess_id') || c.req.query('messId');
    if (targetMessId) {
      messGroup = detailedMesses.find(dm => dm.id === targetMessId) || null;
      if (!messGroup) {
        try {
          messGroup = await fetchMessGroupDetails(db, targetMessId);
          if (messGroup) detailedMesses.push(messGroup);
        } catch { }
      }
    }
    if (!messGroup) {
      if (detailedMesses.length > 0) {
        messGroup = detailedMesses[0];
      } else if (customer.mess_id) {
        try {
          messGroup = await fetchMessGroupDetails(db, customer.mess_id);
          if (messGroup) detailedMesses.push(messGroup);
        } catch (err: any) {
          console.warn('Error fetching customer fallback messGroup on edge:', err?.message);
        }
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
                AND (paymentType = 'CREDIT' OR paymentType = 'NFC_CREDIT' OR paymentType = 'CREDIT_PERSONAL')`,
        args: [realId]
      });
      const creditSales = salesRes.rows || [];
      for (const s of creditSales) {
        const exists = history.some((h: any) => h.reference === s.invoiceNo || h.id === s.id || h.sale_id === s.id);
        if (!exists) {
          const ledgerId = `tx_inv_${String(s.invoiceNo || s.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          const ts = s.createdAt ? new Date(String(s.createdAt)).toISOString() : new Date().toISOString();
          const newLedgerItem = {
            id: ledgerId,
            customerId: realId,
            amount: Number(s.total) || 0,
            type: 'CHARGE',
            reference: s.invoiceNo || `INV-${Date.now()}`,
            running_balance: 0,
            syncStatus: 'SYNCED',
            timestamp: ts,
            created_at: ts,
            tenantId: customer.tenantId || 'tenant_askar_01',
            sale_id: s.id
          };
          history.push(newLedgerItem);

          // Permanently persist to Cloud KhataLedger
          try {
            await db.execute({
              sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, sale_id)
                    VALUES (?, ?, ?, ?, 'CHARGE', ?, 0, 'SYNCED', ?, ?, ?)
                    ON CONFLICT(id) DO NOTHING`,
              args: [ledgerId, customer.tenantId || 'tenant_askar_01', realId, newLedgerItem.amount, newLedgerItem.reference, ts, ts, s.id]
            });
            await db.execute({
              sql: `UPDATE Customer SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?) WHERE id = ?`,
              args: [realId, realId]
            });
          } catch (pErr: any) {
            console.warn('Auto-persist edge recovery notice:', pErr?.message);
          }
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

      const matchedMess = detailedMesses.find((dm: any) => dm.id === entry.mess_id);
      const messName = matchedMess ? matchedMess.group_name : (entry.mess_id ? 'Room Mess' : null);
      const walletName = messName || 'Personal Tab';

      // Extract Shopper Name from reference if available e.g. "(Shopper: Ali)"
      let shopper: string | null = null;
      if (ref) {
        const sMatch = ref.match(/\(Shopper:\s*([^)]+)\)/i);
        if (sMatch && sMatch[1]) shopper = sMatch[1].trim();
      }

      const isMessSplit = Boolean(
        entry.subledger_type === 'MESS_SHARE' ||
        entry.group_total ||
        entry.mess_id ||
        (ref && ref.toLowerCase().includes('mess split'))
      );
      const billTotal = entry.group_total ? Number(entry.group_total) : displayAmount;
      const splitShare = isMessSplit && entry.group_total ? displayAmount : null;

      return {
        ...entry,
        id: entry.id,
        customer_id: realId,
        customerId: realId,
        invoiceNo: ref,
        total: billTotal,
        paymentType: txType,
        createdAt: d.toISOString(),
        created_at: d.toISOString(),
        timestamp: d.toISOString(),
        type: txType,
        amount: displayAmount,
        bill_total: Number(billTotal.toFixed(3)),
        billTotal: Number(billTotal.toFixed(3)),
        split_share: splitShare !== null ? Number(splitShare.toFixed(3)) : null,
        splitShare: splitShare !== null ? Number(splitShare.toFixed(3)) : null,
        is_mess_split: isMessSplit,
        isMessSplit: isMessSplit,
        shopper_name: shopper,
        shopperName: shopper,
        raw_amount: numAmount,
        running_balance: Number(runningBalance.toFixed(3)),
        runningBalance: Number(runningBalance.toFixed(3)),
        reference: ref,
        mess_id: entry.mess_id || null,
        messName: messName,
        walletName: walletName,
        group_total: entry.group_total ? Number(entry.group_total) : null,
        member_count: entry.member_count ? Number(entry.member_count) : null,
        sale_id: entry.sale_id || null,
        storeName: entry.storeName || 'Askar Supermarket - Main Store',
        formattedDate: d.toLocaleDateString('en-GB'),
        formattedTime: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    });

    // Sub-wallet balances aggregation
    let personalBalance = 0;
    const messBalances: Record<string, number> = {};
    for (const dm of detailedMesses) {
      messBalances[dm.id] = 0;
    }

    const depInCredit = (customer.card_deposit_status === 'IN_CREDIT' || customer.card_deposit_status === 'DEFERRED_CREDIT' || customer.card_deposit_status === 'DEFERRED_PAYDAY')
      ? Number(customer.card_deposit_amount || 0)
      : 0;

    for (const entry of history) {
      const amt = Number(entry.amount || 0);
      const isDepositEntry = entry.type === 'DEPOSIT_DEFERRED' || entry.type === 'CARD_DEPOSIT' || entry.subledger_type === 'DEPOSIT' || (entry.reference && entry.reference.includes('DEP-'));
      if (entry.mess_id && messBalances[entry.mess_id] !== undefined) {
        messBalances[entry.mess_id] += amt;
      } else if (!entry.mess_id && !isDepositEntry) {
        personalBalance += amt;
      }
    }

    const purePersonal = Math.max(0, Number(personalBalance.toFixed(3)));

    // Store Timezone: Asia/Bahrain (UTC+3)
    const nowBahrain = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bahrain' }));
    const curYear = nowBahrain.getFullYear();
    const curMonth = nowBahrain.getMonth();
    const curMonthStart = new Date(curYear, curMonth, 1);

    let priorCycleBalance = 0;
    let currentMonthPurchases = 0;
    let currentMonthPayments = 0;

    for (const entry of history) {
      const amt = Number(entry.amount || 0);
      const entryDate = entry.created_at || entry.timestamp ? new Date(entry.created_at || entry.timestamp) : null;
      if (entryDate && entryDate < curMonthStart) {
        priorCycleBalance += amt;
      } else {
        if (amt > 0) {
          currentMonthPurchases += amt;
        } else {
          currentMonthPayments += amt;
        }
      }
    }

    const currentBalance = customer.balance !== null && customer.balance !== undefined
      ? Number(customer.balance)
      : Math.max(0, Number(runningBalance.toFixed(3)));

    const cycleBreakdown = {
      hasPriorCarryOver: Math.abs(priorCycleBalance) > 0.001,
      priorCycleBalance: Number(priorCycleBalance.toFixed(3)),
      currentMonthPurchases: Number(currentMonthPurchases.toFixed(3)),
      currentMonthPayments: Number(Math.abs(currentMonthPayments).toFixed(3)),
      currentBalance,
      currentMonthLabel: nowBahrain.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      priorMonthLabel: new Date(curYear, curMonth - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
    };

    const wallets = {
      personal: purePersonal,
      deposit: {
        amount: Number(customer.card_deposit_amount || 0),
        status: customer.card_deposit_status || 'NONE',
        inCredit: depInCredit > 0,
        inCreditAmount: depInCredit
      },
      messes: detailedMesses.map((dm: any) => ({
        id: dm.id,
        name: dm.group_name,
        memberShare: Number((messBalances[dm.id] || 0).toFixed(3)),
        groupTotal: Number(dm.totalBalance || 0),
        memberCount: dm.memberCount || dm.members?.length || 1,
        equalSplitShare: Number((dm.equalSplitShare || (dm.totalBalance / Math.max(1, dm.memberCount || 1))).toFixed(3))
      }))
    };

    const statement = [...enriched].reverse();

    const { pinCode: _unusedPin, ...safeCustomer } = customer;

    return c.json({
      success: true,
      customer: {
        ...safeCustomer,
        messName: messGroup?.group_name || null,
        mess_name: messGroup?.group_name || null,
        currentBalance,
        balance: currentBalance,
        personalBalance: purePersonal,
        depositInCredit: depInCredit,
        card_deposit_amount: Number(customer.card_deposit_amount || 0),
        depositAmount: Number(customer.card_deposit_amount || 0),
        card_deposit_status: customer.card_deposit_status || 'NONE',
        depositStatus: customer.card_deposit_status || 'NONE',
        isDual: detailedMesses.length > 0,
        hasMessGroup: detailedMesses.length > 0,
        isMultiMess: detailedMesses.length > 1,
        messes: detailedMesses.map((dm: any) => ({ id: dm.id, name: dm.group_name }))
      },
      currentBalance,
      deposit: {
        amount: Number(customer.card_deposit_amount || 0),
        status: customer.card_deposit_status || 'NONE',
        inCredit: depInCredit > 0,
        inCreditAmount: depInCredit
      },
      statement,
      sales: statement,
      entries: statement,
      count: statement.length,
      messGroup,
      messes: detailedMesses,
      wallets,
      cycleBreakdown,
      isMultiMess: detailedMesses.length > 1
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
khataRouter.get('/tab/:id', handleCustomerStatement);
khataRouter.get('/customers/:id/tab', handleCustomerStatement);
khataRouter.get('/:id/tab', handleCustomerStatement);
khataRouter.get('/khata/:id/tab', handleCustomerStatement);

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
    const customerPin = customer.pinCode ? String(customer.pinCode).trim() : '';

    // Verify PIN against customer's stored PIN (bcrypt hash or plain) or manager authorization
    let isMatch = false;
    if (customerPin) {
      if (customerPin.startsWith('$2a$') || customerPin.startsWith('$2b$')) {
        isMatch = await bcrypt.compare(pin, customerPin);
      } else {
        isMatch = (customerPin === pin);
      }
    }

    if (!isMatch) {
      const isMgr = await isManagerAuthorizedEdge(c);
      if (isMgr) {
        isMatch = true;
      }
    }

    if (!isMatch) {
      return c.json({ error: 'Incorrect PIN. Please try again.' }, 401);
    }

    const deviceToken = await generateKhataDeviceTokenEdge(customer.id, customerPin, c.env.DEVICE_TOKEN_SECRET);
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

    // Card Security Deposit & Mode (Credit Charge vs Upfront Cash)
    const incomingDepAmt = body.card_deposit_amount !== undefined ? body.card_deposit_amount : body.depositAmount;
    const resolvedCardType = String(body.card_type || body.cardType || 'PHYSICAL_NFC').toUpperCase();
    const depositNum = Number(incomingDepAmt !== undefined ? incomingDepAmt : (resolvedCardType === 'PHYSICAL_NFC' ? 3.000 : 0.000));
    const cleanDeposit = !isNaN(depositNum) && depositNum >= 0 ? Number(depositNum.toFixed(3)) : 0.000;

    const resolvedDepositMode = String(body.deposit_payment_mode || body.depositPaymentMode || 'DEFERRED_CREDIT').toUpperCase();
    const isDeferredDeposit = cleanDeposit > 0 && (resolvedDepositMode === 'DEFERRED_CREDIT' || resolvedDepositMode === 'DEFERRED_PAYDAY' || resolvedDepositMode === 'CREDIT');
    const depositStatus = cleanDeposit > 0 ? (isDeferredDeposit ? 'IN_CREDIT' : 'HELD') : 'NONE';
    const depositReceiptNo = cleanDeposit > 0 ? `DEP-${Date.now().toString().slice(-6)}` : null;
    const nowIso = getRegionalIsoString();
    const depositDate = cleanDeposit > 0 ? nowIso : null;

    // Total starting customer balance: book balance + deferred card deposit (if charged to credit tab)
    const totalStartingBalance = Number((cleanPrevBal + (isDeferredDeposit ? cleanDeposit : 0)).toFixed(3));

    // Multi-Mess / Camp Account enrollment
    const incomingMessIds = body.mess_ids !== undefined ? body.mess_ids : (body.messIds !== undefined ? body.messIds : (body.mess_id !== undefined ? body.mess_id : body.messId));
    let messIdsList: string[] = [];
    if (incomingMessIds !== undefined && incomingMessIds !== null) {
      if (Array.isArray(incomingMessIds)) {
        messIdsList = incomingMessIds.map((m: any) => (typeof m === 'object' && m !== null ? m.id : m)).filter(Boolean);
      } else if (typeof incomingMessIds === 'string' && incomingMessIds.trim()) {
        messIdsList = [incomingMessIds.trim()];
      }
    }
    messIdsList = [...new Set(messIdsList.map(s => String(s).trim()).filter(Boolean))];
    const primaryMessId = messIdsList.length > 0 ? messIdsList[0] : null;

    const statements: { sql: string; args: any[] }[] = [];

    if (cardUid) {
      // Disassociate card from any previous customer first to avoid duplicate/unique conflict
      statements.push({
        sql: `UPDATE Customer SET nfcCardId = NULL WHERE (UPPER(nfcCardId) = ? OR REPLACE(UPPER(nfcCardId), ':', '') = ?) AND id != ?`,
        args: [cardUid, cardUid.replace(/[:\-]/g, ''), id]
      });
    }

    statements.push({
      sql: `INSERT INTO Customer (id, tenantId, name, phone, cpr, balance, credit_limit, is_active, nfcCardId, mess_id,
                                  card_deposit_amount, card_deposit_status, card_deposit_receipt_no, card_deposit_date, card_type,
                                  createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      args: [id, tenantId, name, phone, cpr, totalStartingBalance, creditLimit, cardUid, primaryMessId,
        cleanDeposit, depositStatus, depositReceiptNo, depositDate, resolvedCardType]
    });

    // Populate MessMember junction table for each enrolled mess group
    for (const mId of messIdsList) {
      const mmId = `mm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      statements.push({
        sql: `INSERT OR REPLACE INTO MessMember (id, tenantId, mess_id, customer_id, role, is_active, joined_at)
              VALUES (?, ?, ?, ?, 'MEMBER', 1, CURRENT_TIMESTAMP)`,
        args: [mmId, tenantId, mId, id]
      });
    }

    if (cardUid) {
      statements.push({
        sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, mess_id, createdAt)
              VALUES (?, 'PERSONAL', ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(tag_id) DO UPDATE SET customer_id = excluded.customer_id, mess_id = excluded.mess_id`,
        args: [cardUid, id, primaryMessId]
      });
    }

    // Record ledger entry for card security deposit
    if (cleanDeposit > 0) {
      const depLedgerId = `DEP-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
      if (isDeferredDeposit) {
        statements.push({
          sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, running_balance, reference, syncStatus, timestamp, created_at, subledger_type)
                VALUES (?, ?, ?, ?, 'CHARGE', ?, ?, 'SYNCED', ?, ?, 'DEPOSIT_DEFERRED')`,
          args: [depLedgerId, tenantId, id, cleanDeposit, totalStartingBalance, `Physical Card Deposit (${depositReceiptNo}) - Charged to Credit Tab`, nowIso, nowIso]
        });
      } else {
        statements.push({
          sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, running_balance, reference, syncStatus, timestamp, created_at, subledger_type)
                VALUES (?, ?, ?, 0, 'CARD_DEPOSIT', ?, ?, 'SYNCED', ?, ?, 'DEPOSIT')`,
          args: [depLedgerId, tenantId, id, totalStartingBalance, `Card Security Deposit (${depositReceiptNo}) - Paid Cash at Counter (Held in Trust)`, nowIso, nowIso]
        });
      }
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
        balance: totalStartingBalance,
        currentBalance: totalStartingBalance,
        creditLimit,
        card_deposit_amount: cleanDeposit,
        depositAmount: cleanDeposit,
        card_deposit_status: depositStatus,
        card_deposit_receipt_no: depositReceiptNo,
        card_deposit_date: depositDate,
        card_type: resolvedCardType
      }
    }, 201);
  } catch (err: any) {
    return c.json({ error: 'Failed to create customer', details: err?.message }, 500);
  }
});

/**
 * Update Existing Customer Details & Credit Limit & Opening Balance (POS or Manager)
 */
async function handleCustomerUpdate(c: any) {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const customerId = c.req.param('id');
  try {
    const body = await c.req.json();
    const name = body.name ? String(body.name).trim() : null;
    const phone = body.phone !== undefined ? (body.phone ? String(body.phone).trim() : null) : undefined;
    const cpr = body.cpr !== undefined ? (body.cpr ? String(body.cpr).trim() : null) : undefined;
    const creditLimit = body.creditLimit !== undefined ? Number(body.creditLimit) : (body.credit_limit !== undefined ? Number(body.credit_limit) : undefined);
    const cardUid = body.cardUid !== undefined ? (body.cardUid ? String(body.cardUid).trim().toUpperCase() : null) : undefined;
    const description = body.description ? String(body.description).trim() : null;

    const updates: string[] = [];
    const args: any[] = [];

    if (name) { updates.push('name = ?'); args.push(name); }
    if (phone !== undefined) { updates.push('phone = ?'); args.push(phone); }
    if (cpr !== undefined) { updates.push('cpr = ?'); args.push(cpr); }
    if (creditLimit !== undefined && !isNaN(creditLimit)) { updates.push('credit_limit = ?'); args.push(creditLimit); }
    if (cardUid !== undefined) { updates.push('nfcCardId = ?'); args.push(cardUid); }

    // Multi-Mess / Camp Account enrollment
    const incomingMessIds = body.mess_ids !== undefined ? body.mess_ids : (body.messIds !== undefined ? body.messIds : (body.mess_id !== undefined ? body.mess_id : body.messId));
    if (incomingMessIds !== undefined && incomingMessIds !== null) {
      let ids: string[] = [];
      if (Array.isArray(incomingMessIds)) {
        ids = incomingMessIds.map((m: any) => (typeof m === 'object' && m !== null ? m.id : m)).filter(Boolean);
      } else if (typeof incomingMessIds === 'string' && incomingMessIds.trim()) {
        ids = [incomingMessIds.trim()];
      }
      ids = [...new Set(ids.map(s => String(s).trim()).filter(Boolean))];
      const primaryMessId = ids.length > 0 ? ids[0] : null;

      updates.push('mess_id = ?');
      args.push(primaryMessId);

      // Synchronize MessMember junction table
      await db.execute({
        sql: `DELETE FROM MessMember WHERE customer_id = ?`,
        args: [customerId]
      });

      for (const mId of ids) {
        const mmId = `mm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await db.execute({
          sql: `INSERT OR REPLACE INTO MessMember (id, tenantId, mess_id, customer_id, role, is_active, joined_at)
                VALUES (?, ?, ?, ?, 'MEMBER', 1, CURRENT_TIMESTAMP)`,
          args: [mmId, tenantId, mId, customerId]
        });
      }
    }

    if (updates.length > 0) {
      updates.push('updatedAt = CURRENT_TIMESTAMP');
      args.push(customerId);

      await db.execute({
        sql: `UPDATE Customer SET ${updates.join(', ')} WHERE id = ?`,
        args
      });
    }

    // Handle NFC card binding
    if (cardUid) {
      await db.execute({
        sql: `UPDATE Customer SET nfcCardId = NULL WHERE (UPPER(nfcCardId) = ? OR REPLACE(UPPER(nfcCardId), ':', '') = ?) AND id != ?`,
        args: [cardUid, cardUid.replace(/[:\-]/g, ''), customerId]
      });
      await db.execute({
        sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, createdAt)
              VALUES (?, 'PERSONAL', ?, CURRENT_TIMESTAMP)
              ON CONFLICT(tag_id) DO UPDATE SET customer_id = excluded.customer_id`,
        args: [cardUid, customerId]
      });
    }

    // Support updating or adding previous book balance
    const rawPrevBal = body.previousBalance ?? body.openingBalance ?? body.initialBalance;
    if (rawPrevBal !== undefined && rawPrevBal !== null && rawPrevBal !== '') {
      const cleanPrev = Number(parseFloat(String(rawPrevBal)).toFixed(3));
      if (!isNaN(cleanPrev) && cleanPrev >= 0) {
        const obCheck = await db.execute({
          sql: `SELECT id FROM KhataLedger WHERE customerId = ? AND type = 'OPENING_BALANCE' LIMIT 1`,
          args: [customerId]
        });

        if (obCheck.rows && obCheck.rows.length > 0) {
          const obId = obCheck.rows[0].id as string;
          await db.execute({
            sql: `UPDATE KhataLedger SET amount = ?, running_balance = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
            args: [cleanPrev, cleanPrev, obId]
          });
        } else if (cleanPrev > 0) {
          const ledgerId = `OB-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
          const refText = description || 'Opening Balance (Previous Physical Book)';
          await db.execute({
            sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, running_balance, reference, syncStatus, timestamp, created_at)
                  VALUES (?, ?, ?, ?, 'OPENING_BALANCE', ?, ?, 'SYNCED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            args: [ledgerId, tenantId, customerId, cleanPrev, cleanPrev, refText]
          });
        }

        // Recalculate customer balance to match ledger sum
        await db.execute({
          sql: `UPDATE Customer SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?) WHERE id = ?`,
          args: [customerId, customerId]
        });
      }
    }

    // Support Deposit Actions: CHARGE_CREDIT, COLLECT_CASH, REFUND
    const depositAction = body.depositAction || body.deposit_action;
    if (depositAction) {
      const depAmt = Number(body.depositAmount !== undefined ? body.depositAmount : (body.card_deposit_amount !== undefined ? body.card_deposit_amount : 3.0));
      const cleanDep = !isNaN(depAmt) && depAmt >= 0 ? Number(depAmt.toFixed(3)) : 3.000;
      const receiptNo = body.receiptNo || `DEP-${Date.now().toString().slice(-6)}`;
      const nowIso = getRegionalIsoString();

      if (depositAction === 'CHARGE_CREDIT') {
        // Charge deposit to credit tab (deferred until credit debt is settled)
        await db.execute({
          sql: `UPDATE Customer SET card_deposit_amount = ?, card_deposit_status = 'IN_CREDIT', card_deposit_receipt_no = ?, card_deposit_date = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
          args: [cleanDep, receiptNo, nowIso, customerId]
        });
        const ledgerId = `DEP-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
        await db.execute({
          sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, syncStatus, timestamp, created_at, subledger_type)
                VALUES (?, ?, ?, ?, 'CHARGE', ?, 'SYNCED', ?, ?, 'DEPOSIT_DEFERRED')`,
          args: [ledgerId, tenantId, customerId, cleanDep, `Physical Card Security Deposit (${receiptNo}) - Charged to Credit Tab`, nowIso, nowIso]
        });
        // Recalculate customer balance
        await db.execute({
          sql: `UPDATE Customer SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?) WHERE id = ?`,
          args: [customerId, customerId]
        });
      } else if (depositAction === 'COLLECT_CASH') {
        // Collect cash at counter right now (held in custodial trust)
        await db.execute({
          sql: `UPDATE Customer SET card_deposit_amount = ?, card_deposit_status = 'HELD', card_deposit_receipt_no = ?, card_deposit_date = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
          args: [cleanDep, receiptNo, nowIso, customerId]
        });
        const ledgerId = `DEP-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
        await db.execute({
          sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, syncStatus, timestamp, created_at, subledger_type)
                VALUES (?, ?, ?, 0, 'CARD_DEPOSIT', ?, 'SYNCED', ?, ?, 'DEPOSIT')`,
          args: [ledgerId, tenantId, customerId, `Card Security Deposit (${receiptNo}) - Held in Custodial Trust: BD ${cleanDep.toFixed(3)} (Paid Cash at Counter)`, nowIso, nowIso]
        });
      } else if (depositAction === 'REFUND') {
        // Refund deposit in cash (must have 0 debt)
        const curCust = await db.execute({ sql: `SELECT balance FROM Customer WHERE id = ? LIMIT 1`, args: [customerId] });
        const curBal = Number(curCust.rows?.[0]?.balance ?? 0);
        if (curBal > 0) {
          return c.json({ error: `Cannot refund deposit: Customer has outstanding debt of BD ${curBal.toFixed(3)}.` }, 400);
        }
        await db.execute({
          sql: `UPDATE Customer SET card_deposit_amount = 0, card_deposit_status = 'REFUNDED', card_deposit_date = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
          args: [nowIso, customerId]
        });
        const ledgerId = `REF-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
        await db.execute({
          sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, syncStatus, timestamp, created_at, subledger_type)
                VALUES (?, ?, ?, 0, 'CARD_DEPOSIT_REFUND', ?, 'SYNCED', ?, ?, 'DEPOSIT')`,
          args: [ledgerId, tenantId, customerId, `Card Security Deposit Refunded (${receiptNo}) - Full: BD ${cleanDep.toFixed(3)}`, nowIso, nowIso]
        });
      }
    }

    const [updatedRes, mmRes] = await Promise.all([
      db.execute({
        sql: `SELECT id, name, phone, cpr, balance, credit_limit, nfcCardId, mess_id, is_active,
                     COALESCE(card_deposit_amount, 0.0) AS card_deposit_amount,
                     COALESCE(card_deposit_amount, 0.0) AS depositAmount,
                     COALESCE(card_deposit_status, 'NONE') AS card_deposit_status,
                     card_deposit_receipt_no, card_deposit_date,
                     COALESCE(card_type, 'PHYSICAL_NFC') AS card_type
              FROM Customer WHERE id = ? LIMIT 1`,
        args: [customerId]
      }),
      db.execute({
        sql: `SELECT mm.mess_id, mg.group_name 
              FROM MessMember mm
              JOIN MessGroup mg ON mm.mess_id = mg.id
              WHERE mm.customer_id = ? AND mm.is_active = 1
              ORDER BY mg.group_name ASC`,
        args: [customerId]
      }).catch(() => ({ rows: [] }))
    ]);

    const updated = updatedRes.rows[0] || null;
    const customerMesses = (mmRes.rows || []).map(r => ({ id: String(r.mess_id), group_name: String(r.group_name) }));
    const messNames = customerMesses.map(m => m.group_name).join(', ');
    const messIds = customerMesses.map(m => m.id);

    return c.json({
      success: true,
      message: 'Customer updated successfully',
      customerId,
      customer: updated ? {
        ...updated,
        balance: Number(updated.balance ?? 0),
        creditLimit: Number(updated.credit_limit ?? 30.0),
        card_deposit_amount: Number(updated.card_deposit_amount || 0),
        depositAmount: Number(updated.card_deposit_amount || 0),
        card_deposit_status: String(updated.card_deposit_status || 'NONE'),
        card_deposit_receipt_no: updated.card_deposit_receipt_no || null,
        card_deposit_date: updated.card_deposit_date || null,
        card_type: String(updated.card_type || 'PHYSICAL_NFC'),
        messes: customerMesses,
        mess_ids: messIds,
        hasMessGroup: customerMesses.length > 0,
        isDual: customerMesses.length > 0,
        isMultiMess: customerMesses.length > 1,
        messName: messNames || null,
        mess_name: messNames || null,
        mess_id: customerMesses[0]?.id || updated.mess_id || null
      } : null
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to update customer', details: err?.message }, 500);
  }
}

khataRouter.post('/customers/:id/update', requirePosOrManagerAuth, handleCustomerUpdate);
khataRouter.post('/:id/update', requirePosOrManagerAuth, handleCustomerUpdate);
khataRouter.post('/khata/:id/update', requirePosOrManagerAuth, handleCustomerUpdate);
khataRouter.post('/api/customers/:id/update', requirePosOrManagerAuth, handleCustomerUpdate);
khataRouter.put('/customers/:id', requirePosOrManagerAuth, handleCustomerUpdate);
khataRouter.put('/:id', requirePosOrManagerAuth, handleCustomerUpdate);
khataRouter.put('/khata/:id', requirePosOrManagerAuth, handleCustomerUpdate);
khataRouter.put('/api/customers/:id', requirePosOrManagerAuth, handleCustomerUpdate);
khataRouter.put('/api/khata/:id', requirePosOrManagerAuth, handleCustomerUpdate);

/**
 * Collect Card Deposit (Cash at Counter or Deferred Credit)
 */
const handleDepositCollect = async (c: any) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const customerId = c.req.param('id');
  try {
    const body = await c.req.json().catch(() => ({}));
    const rawAmt = body.depositAmount !== undefined ? body.depositAmount : (body.card_deposit_amount !== undefined ? body.card_deposit_amount : 3.0);
    const amount = Number(parseFloat(String(rawAmt)).toFixed(3));
    const mode = String(body.deposit_payment_mode || body.depositPaymentMode || body.paymentMode || 'CASH').toUpperCase();
    const isCredit = mode === 'DEFERRED_CREDIT' || mode === 'CREDIT' || mode === 'DEFERRED_PAYDAY';
    const status = isCredit ? 'IN_CREDIT' : 'HELD';
    const receiptNo = `DEP-${Date.now().toString().slice(-6)}`;
    const nowIso = getRegionalIsoString();

    const curCust = await db.execute({
      sql: `SELECT card_deposit_status, card_deposit_amount FROM Customer WHERE id = ? LIMIT 1`,
      args: [customerId]
    });
    const prevStatus = curCust.rows?.[0]?.card_deposit_status;

    const statements: any[] = [];
    statements.push({
      sql: `UPDATE Customer SET card_deposit_amount = ?, card_deposit_status = ?, card_deposit_receipt_no = ?, card_deposit_date = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [amount, status, receiptNo, nowIso, customerId]
    });

    const ledgerId = `DEP-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    if (isCredit) {
      statements.push({
        sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, syncStatus, timestamp, created_at, subledger_type)
              VALUES (?, ?, ?, ?, 'CHARGE', ?, 'SYNCED', ?, ?, 'DEPOSIT_DEFERRED')`,
        args: [ledgerId, tenantId, customerId, amount, `Card Security Deposit (${receiptNo}) - Charged to Credit Tab`, nowIso, nowIso]
      });
      statements.push({
        sql: `UPDATE Customer SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?) WHERE id = ?`,
        args: [customerId, customerId]
      });
    } else {
      // If customer previously owed this deposit in credit, insert reconciliation payment to clear the deferred charge
      if (prevStatus === 'IN_CREDIT' || prevStatus === 'DEFERRED_CREDIT' || prevStatus === 'DEFERRED_PAYDAY') {
        const payTxId = `DEP-PAY-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
        statements.push({
          sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, syncStatus, timestamp, created_at, subledger_type)
                VALUES (?, ?, ?, ?, 'PAYMENT', ?, 'SYNCED', ?, ?, 'DEPOSIT')`,
          args: [payTxId, tenantId, customerId, -amount, `Card Security Deposit (${receiptNo}) Paid at Counter - Cleared to Trust`, nowIso, nowIso]
        });
        statements.push({
          sql: `UPDATE Customer SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?) WHERE id = ?`,
          args: [customerId, customerId]
        });
      }
      statements.push({
        sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, syncStatus, timestamp, created_at, subledger_type)
              VALUES (?, ?, ?, 0, 'CARD_DEPOSIT', ?, 'SYNCED', ?, ?, 'DEPOSIT')`,
        args: [ledgerId, tenantId, customerId, `Card Security Deposit (${receiptNo}) - Held in Custodial Trust: BD ${amount.toFixed(3)} (Paid Cash at Counter)`, nowIso, nowIso]
      });
    }

    await db.batch(statements, 'write');

    return c.json({
      success: true,
      message: `Deposit of BD ${amount.toFixed(3)} ${isCredit ? 'charged to credit tab' : 'collected in cash'}.`,
      receiptNo,
      depositAmount: amount,
      depositStatus: status,
      depositMode: mode
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to record deposit', details: err?.message }, 500);
  }
};

/**
 * Refund Card Deposit (Customer must have 0 grocery debt)
 */
const handleDepositRefund = async (c: any) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const customerId = c.req.param('id');
  try {
    const custRes = await db.execute({
      sql: `SELECT id, name, balance, card_deposit_amount, card_deposit_status FROM Customer WHERE id = ? LIMIT 1`,
      args: [customerId]
    });
    const customer = custRes.rows[0];
    if (!customer) return c.json({ error: 'Customer not found' }, 404);

    const bal = Number(customer.balance || 0);
    if (bal > 0) {
      return c.json({ error: `Cannot refund deposit: Customer has an outstanding debt of BD ${bal.toFixed(3)}. Settle debt first.` }, 400);
    }

    const depAmt = Number(customer.card_deposit_amount || 0);
    if (depAmt <= 0 && customer.card_deposit_status !== 'HELD') {
      return c.json({ error: 'No refundable deposit currently held for this account.' }, 400);
    }

    const receiptNo = `REF-${Date.now().toString().slice(-6)}`;
    const nowIso = getRegionalIsoString();

    await db.batch([
      {
        sql: `UPDATE Customer SET card_deposit_amount = 0, card_deposit_status = 'REFUNDED', card_deposit_date = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [nowIso, customerId]
      },
      {
        sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, syncStatus, timestamp, created_at, subledger_type)
              VALUES (?, ?, ?, 0, 'CARD_DEPOSIT_REFUND', ?, 'SYNCED', ?, ?, 'DEPOSIT')`,
        args: [`REF-${Date.now()}`, tenantId, customerId, `Card Security Deposit Refunded (${receiptNo}) - Full: BD ${depAmt.toFixed(3)}`, nowIso, nowIso]
      }
    ], 'write');

    return c.json({
      success: true,
      message: `Deposit of BD ${depAmt.toFixed(3)} successfully refunded in cash.`,
      receiptNo,
      refundAmount: depAmt
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to process deposit refund', details: err?.message }, 500);
  }
};

khataRouter.post('/customers/:id/deposit/collect', requirePosOrManagerAuth, handleDepositCollect);
khataRouter.post('/api/customers/:id/deposit/collect', requirePosOrManagerAuth, handleDepositCollect);
khataRouter.post('/customers/:id/deposit/refund', requirePosOrManagerAuth, handleDepositRefund);
khataRouter.post('/api/customers/:id/deposit/refund', requirePosOrManagerAuth, handleDepositRefund);

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
        sql: `SELECT id, group_name, createdAt FROM MessGroup WHERE (tenantId = ? OR tenantId = 'tenant_1' OR tenantId = 'tenant_askar_01' OR tenantId IS NULL) AND id NOT IN (SELECT id FROM DisbandedMessGroup)`,
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
    const [groupsRes, custsRes, cardsRes, messBalRes, memberBalRes] = await Promise.all([
      db.execute({
        sql: `SELECT id, group_name, createdAt FROM MessGroup WHERE (tenantId = ? OR tenantId = 'tenant_1' OR tenantId = 'tenant_askar_01' OR tenantId IS NULL) AND id NOT IN (SELECT id FROM DisbandedMessGroup) ORDER BY group_name ASC`,
        args: [tenantId]
      }),
      db.execute({
        sql: `SELECT DISTINCT c.id, c.name, c.phone, c.cpr, c.balance, mm.mess_id
              FROM MessMember mm
              JOIN Customer c ON mm.customer_id = c.id
              WHERE mm.is_active = 1
              UNION
              SELECT c.id, c.name, c.phone, c.cpr, c.balance, c.mess_id
              FROM Customer c
              WHERE c.mess_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM MessMember WHERE customer_id = c.id)`,
        args: []
      }),
      db.execute({
        sql: `SELECT tag_id, mess_id FROM NfcCard WHERE mess_id IS NOT NULL`,
        args: []
      }),
      db.execute({
        sql: `SELECT mess_id, ROUND(COALESCE(SUM(amount), 0), 3) as totalBalance
              FROM KhataLedger
              WHERE mess_id IS NOT NULL AND mess_id != ''
              GROUP BY mess_id`,
        args: []
      }),
      db.execute({
        sql: `SELECT mess_id, customerId, ROUND(COALESCE(SUM(amount), 0), 3) as balance
              FROM KhataLedger
              WHERE mess_id IS NOT NULL AND mess_id != ''
              GROUP BY mess_id, customerId`,
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

    const messBalances = new Map<string, number>();
    for (const row of (messBalRes.rows || [])) {
      if (row.mess_id) messBalances.set(row.mess_id as string, Number(row.totalBalance ?? 0));
    }

    const memberMessBalances = new Map<string, number>();
    for (const row of (memberBalRes.rows || [])) {
      if (row.mess_id && row.customerId) {
        memberMessBalances.set(`${row.mess_id}_${row.customerId}`, Number(row.balance ?? 0));
      }
    }

    const messGroups = (groupsRes.rows || []).map((g: any) => {
      const members = customersByMess.get(g.id) || [];
      const totalBalance = Number((messBalances.get(g.id) ?? 0).toFixed(3));
      const cardTag = cardByMess.get(g.id) || null;
      const memberCount = Math.max(1, members.length);
      const equalSplitShare = Number((totalBalance / memberCount).toFixed(3));

      return {
        id: g.id,
        group_name: g.group_name,
        name: g.group_name,
        createdAt: g.createdAt,
        memberCount: members.length,
        totalBalance,
        balance: totalBalance,
        equalSplitShare,
        cardTag,
        assignedCard: cardTag,
        members: members.map(m => {
          const messShare = memberMessBalances.get(`${g.id}_${m.id}`) ?? 0;
          return {
            id: m.id,
            name: m.name,
            phone: m.phone,
            cpr: m.cpr,
            balance: Number(messShare.toFixed(3)),
            currentBalance: Number(messShare.toFixed(3)),
            messShare: Number(messShare.toFixed(3)),
            personalBalance: Number((Number(m.balance ?? 0) - messShare).toFixed(3)),
            consolidatedBalance: Number(m.balance ?? 0),
            equalSplitShare
          };
        })
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
khataRouter.post('/nfc/mess-groups', requireManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';

  try {
    const body = await c.req.json();
    const groupName = (body.group_name || body.name || '').trim();
    if (!groupName) return c.json({ error: 'group_name is required' }, 400);

    const rawPrev = Number(body.previousBalance ?? body.openingBalance ?? body.initialBalance ?? 0);
    const cleanPrevBalance = (!isNaN(rawPrev) && rawPrev > 0) ? Number(rawPrev.toFixed(3)) : 0;

    const id = body.id || `mess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const memberIds: string[] = Array.isArray(body.member_ids) ? body.member_ids : [];

    if (cleanPrevBalance > 0 && memberIds.length === 0) {
      return c.json({ error: 'Please select at least one room member to allocate the previous book balance.' }, 400);
    }

    const rawTag = body.tag_id;
    const tagId = (rawTag && String(rawTag).trim() && String(rawTag).trim().toLowerCase() !== 'null')
      ? String(rawTag).trim().toUpperCase()
      : null;

    const statements: { sql: string; args: any[] }[] = [
      {
        sql: `DELETE FROM DisbandedMessGroup WHERE id = ?`,
        args: [id]
      },
      {
        sql: `INSERT INTO MessGroup (id, tenantId, group_name, createdAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [id, tenantId, groupName]
      }
    ];

    for (const mId of memberIds) {
      const mmId = `mm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${mId.slice(-4)}`;
      statements.push({
        sql: `INSERT OR REPLACE INTO MessMember (id, tenantId, mess_id, customer_id, role, is_active, joined_at)
              VALUES (?, ?, ?, ?, 'MEMBER', 1, CURRENT_TIMESTAMP)`,
        args: [mmId, tenantId, id, mId]
      });
      statements.push({
        sql: `UPDATE Customer SET mess_id = ? WHERE id = ? AND (mess_id IS NULL OR mess_id = '')`,
        args: [id, mId]
      });
    }

    // Allocate Previous Book Balance with Zero-Fils Drift Odd-Member Split Algorithm
    if (cleanPrevBalance > 0 && memberIds.length > 0) {
      const totalFils = Math.round(cleanPrevBalance * 1000);
      const baseFils = Math.floor(totalFils / memberIds.length);
      const remainderFils = totalFils % memberIds.length;

      const splits = Array(memberIds.length).fill(baseFils);
      for (let i = 0; i < remainderFils; i++) {
        splits[i] += 1;
      }

      const defaultRef = `Mess Opening Balance: ${groupName} (${memberIds.length} members) - Physical Book Migration`;
      const refText = (body.description && String(body.description).trim())
        ? `Opening Balance: ${String(body.description).trim()}`
        : defaultRef;

      for (let i = 0; i < memberIds.length; i++) {
        const mId = memberIds[i];
        const shareAmount = Number((splits[i] / 1000).toFixed(3));
        const ledgerId = `OB-MESS-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}-${i}`;

        statements.push({
          sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, tenantId, mess_id, subledger_type)
                VALUES (?, ?, ?, 'OPENING_BALANCE', ?, ?, 'SYNCED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, 'MESS_SHARE')`,
          args: [ledgerId, mId, shareAmount, refText, shareAmount, tenantId, id]
        });

        statements.push({
          sql: `UPDATE Customer 
                SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?),
                    updatedAt = CURRENT_TIMESTAMP
                WHERE id = ?`,
          args: [mId, mId]
        });
      }
    }

    if (tagId) {
      statements.push({
        sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, mess_id, createdAt) 
              VALUES (?, 'MESS', NULL, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(tag_id) DO UPDATE SET card_type = 'MESS', customer_id = NULL, mess_id = excluded.mess_id`,
        args: [tagId, id]
      });
      statements.push({
        sql: `UPDATE Customer SET cardUid = NULL, nfcCardId = NULL 
              WHERE UPPER(COALESCE(cardUid, '')) = ? 
                 OR REPLACE(UPPER(COALESCE(cardUid, '')), ':', '') = ?
                 OR UPPER(COALESCE(nfcCardId, '')) = ?
                 OR REPLACE(UPPER(COALESCE(nfcCardId, '')), ':', '') = ?`,
        args: [tagId, tagId.replace(/[:\-]/g, ''), tagId, tagId.replace(/[:\-]/g, '')]
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
        cardTag: tagId || null,
        assignedCard: tagId || null
      }
    }, 201);
  } catch (err: any) {
    return c.json({ error: 'Failed to create mess group', details: err?.message }, 500);
  }
});

/**
 * Update an existing Mess Group (/api/nfc/mess-groups/:id)
 */
khataRouter.put('/nfc/mess-groups/:id', requireManagerAuth, async (c) => {
  const db = getDb(c.env);
  const groupId = c.req.param('id');

  try {
    const body = await c.req.json();
    const groupName = body.group_name ? String(body.group_name).trim() : null;
    const memberIds: string[] | undefined = Array.isArray(body.member_ids) ? body.member_ids : undefined;
    const rawTag = body.tag_id;
    const tagId = (rawTag !== undefined && rawTag !== null && String(rawTag).trim() !== '' && String(rawTag).trim().toLowerCase() !== 'null')
      ? String(rawTag).trim().toUpperCase()
      : (rawTag === null || (typeof rawTag === 'string' && rawTag.trim() === '') ? null : undefined);

    const statements: { sql: string; args: any[] }[] = [];

    if (groupName) {
      statements.push({
        sql: `UPDATE MessGroup SET group_name = ? WHERE id = ?`,
        args: [groupName, groupId]
      });
    }

    if (memberIds !== undefined) {
      // Clear previous members from MessMember for this group
      statements.push({
        sql: `DELETE FROM MessMember WHERE mess_id = ?`,
        args: [groupId]
      });
      // Set new members in MessMember
      for (const mId of memberIds) {
        const mmId = `mm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${mId.slice(-4)}`;
        statements.push({
          sql: `INSERT OR REPLACE INTO MessMember (id, tenantId, mess_id, customer_id, role, is_active, joined_at)
                VALUES (?, 'tenant_askar_01', ?, ?, 'MEMBER', 1, CURRENT_TIMESTAMP)`,
          args: [mmId, groupId, mId]
        });
        statements.push({
          sql: `UPDATE Customer SET mess_id = ? WHERE id = ? AND (mess_id IS NULL OR mess_id = '')`,
          args: [groupId, mId]
        });
      }

      // Cleanly unlink members that were removed from this mess group
      if (memberIds.length > 0) {
        const placeholders = memberIds.map(() => '?').join(',');
        statements.push({
          sql: `UPDATE Customer SET mess_id = (SELECT mess_id FROM MessMember WHERE customer_id = Customer.id LIMIT 1) 
                WHERE mess_id = ? AND id NOT IN (${placeholders})`,
          args: [groupId, ...memberIds]
        });
      } else {
        statements.push({
          sql: `UPDATE Customer SET mess_id = (SELECT mess_id FROM MessMember WHERE customer_id = Customer.id LIMIT 1) WHERE mess_id = ?`,
          args: [groupId]
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
        statements.push({
          sql: `UPDATE Customer SET cardUid = NULL, nfcCardId = NULL 
                WHERE UPPER(COALESCE(cardUid, '')) = ? 
                   OR REPLACE(UPPER(COALESCE(cardUid, '')), ':', '') = ?
                   OR UPPER(COALESCE(nfcCardId, '')) = ?
                   OR REPLACE(UPPER(COALESCE(nfcCardId, '')), ':', '') = ?`,
          args: [tagId, tagId.replace(/[:\-]/g, ''), tagId, tagId.replace(/[:\-]/g, '')]
        });
      } else {
        statements.push({
          sql: `DELETE FROM NfcCard WHERE mess_id = ?`,
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
        cardTag: tagId || null,
        assignedCard: tagId || null
      }
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to update mess group', details: err?.message }, 500);
  }
});

/**
 * Add / Post Previous Book Balance to an existing Mess Group (/api/nfc/mess-groups/:id/balance)
 */
khataRouter.post('/nfc/mess-groups/:id/balance', requireManagerAuth, async (c) => {
  const db = getDb(c.env);
  const groupId = String(c.req.param('id') || '');
  const tenantId = (c as any).tenantId || 'tenant_askar_01';

  try {
    const body = await c.req.json().catch(() => ({}));
    const rawPrev = Number(body.previousBalance ?? body.openingBalance ?? body.amount ?? 0);
    const cleanPrevBalance = (!isNaN(rawPrev) && rawPrev > 0) ? Number(rawPrev.toFixed(3)) : 0;

    if (cleanPrevBalance <= 0) {
      return c.json({ error: 'Please enter a valid balance amount greater than BD 0.000.' }, 400);
    }

    const groupRes = await db.execute({
      sql: `SELECT id, group_name FROM MessGroup WHERE id = ? LIMIT 1`,
      args: [groupId]
    });
    if (!groupRes.rows || groupRes.rows.length === 0) {
      return c.json({ error: 'Mess Group not found.' }, 404);
    }
    const cleanName = String(groupRes.rows[0].group_name || 'Mess Group');

    let memberIds: string[] = Array.isArray(body.member_ids) && body.member_ids.length > 0 ? body.member_ids : [];
    if (memberIds.length === 0) {
      const membersRes = await db.execute({
        sql: `SELECT customer_id FROM MessMember WHERE mess_id = ? AND is_active = 1`,
        args: [groupId]
      });
      memberIds = (membersRes.rows || []).map((r: any) => String(r.customer_id)).filter(Boolean);
      if (memberIds.length === 0) {
        const legacyRes = await db.execute({
          sql: `SELECT id FROM Customer WHERE mess_id = ?`,
          args: [groupId]
        });
        memberIds = (legacyRes.rows || []).map((r: any) => String(r.id)).filter(Boolean);
      }
    }

    if (memberIds.length === 0) {
      return c.json({ error: 'Cannot allocate balance: This mess group has 0 enrolled members.' }, 400);
    }

    const totalFils = Math.round(cleanPrevBalance * 1000);
    const baseFils = Math.floor(totalFils / memberIds.length);
    const remainderFils = totalFils % memberIds.length;

    const splits = Array(memberIds.length).fill(baseFils);
    for (let i = 0; i < remainderFils; i++) {
      splits[i] += 1;
    }

    const nowIso = new Date().toISOString();
    const defaultRef = `Mess Previous Balance: ${cleanName} (${memberIds.length} members) - Physical Book Migration`;
    const refText = (body.description && String(body.description).trim())
      ? `Opening Balance: ${String(body.description).trim()}`
      : defaultRef;

    const statements: { sql: string; args: any[] }[] = [];
    for (let i = 0; i < memberIds.length; i++) {
      const mId = memberIds[i];
      const shareAmount = Number((splits[i] / 1000).toFixed(3));
      const ledgerId = `OB-MESS-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}-${i}`;

      statements.push({
        sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, tenantId, mess_id, subledger_type)
              VALUES (?, ?, ?, 'OPENING_BALANCE', ?, ?, 'SYNCED', ?, ?, ?, ?, 'MESS_SHARE')`,
        args: [ledgerId, mId, shareAmount, refText, shareAmount, nowIso, nowIso, tenantId, groupId]
      });

      statements.push({
        sql: `UPDATE Customer 
              SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?),
                  updatedAt = CURRENT_TIMESTAMP
              WHERE id = ?`,
        args: [mId, mId]
      });
    }

    await db.batch(statements);

    return c.json({
      success: true,
      message: `Posted BD ${cleanPrevBalance.toFixed(3)} previous book balance across ${memberIds.length} members with zero drift.`,
      totalAdded: cleanPrevBalance,
      memberCount: memberIds.length
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to post mess balance', details: err?.message }, 500);
  }
});

/**
 * Add / Post Previous Book Balance to an existing individual customer (/api/khata/customers/:id/book-balance)
 */
khataRouter.post('/customers/:id/book-balance', async (c) => {
  const db = getDb(c.env);
  const id = String(c.req.param('id') || '');
  const tenantId = (c as any).tenantId || 'tenant_askar_01';

  try {
    const body = await c.req.json().catch(() => ({}));
    const rawPrev = Number(body.amount ?? body.previousBalance ?? body.openingBalance ?? 0);
    const cleanPrevBalance = (!isNaN(rawPrev) && rawPrev > 0) ? Number(rawPrev.toFixed(3)) : 0;

    if (cleanPrevBalance <= 0) {
      return c.json({ error: 'Please enter a valid balance amount greater than BD 0.000.' }, 400);
    }

    if (cleanPrevBalance > 500) {
      return c.json({ error: 'Book balance amount exceeds maximum safety threshold (500 BD).' }, 400);
    }

    const custCheck = await db.execute({
      sql: `SELECT id, name, phone, balance, tenantId FROM Customer WHERE id = ? OR cardUid = ? OR phone = ? LIMIT 1`,
      args: [id, id, id]
    });

    if (!custCheck.rows || custCheck.rows.length === 0) {
      return c.json({ error: 'Customer not found.' }, 404);
    }

    const customer = custCheck.rows[0];
    const customerId = String(customer.id);
    const nowIso = new Date().toISOString();
    const rawRef = body.reference || body.description || body.notes;
    const refText = rawRef && String(rawRef).trim()
      ? `Book Balance: ${String(rawRef).trim()}`
      : 'Previous Book Balance Added';
    const ledgerId = `OB-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    const newBal = Number(((Number(customer.balance || 0)) + cleanPrevBalance).toFixed(3));

    await db.batch([
      {
        sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, tenantId, subledger_type)
              VALUES (?, ?, ?, 'OPENING_BALANCE', ?, ?, 'SYNCED', ?, ?, ?, 'PERSONAL')`,
        args: [ledgerId, customerId, cleanPrevBalance, refText, newBal, nowIso, nowIso, tenantId]
      },
      {
        sql: `UPDATE Customer 
              SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?),
                  updatedAt = CURRENT_TIMESTAMP
              WHERE id = ?`,
        args: [customerId, customerId]
      }
    ]);

    const updatedRes = await db.execute({
      sql: `SELECT id, name, phone, balance FROM Customer WHERE id = ?`,
      args: [customerId]
    });

    return c.json({
      success: true,
      message: `Posted BD ${cleanPrevBalance.toFixed(3)} previous book balance to ${customer.name}.`,
      ledgerId,
      customer: updatedRes.rows[0]
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to post customer book balance', details: err?.message }, 500);
  }
});

/**
 * Disband / Delete a Mess Group (/api/nfc/mess-groups/:id)
 */
khataRouter.delete('/nfc/mess-groups/:id', requireManagerAuth, async (c) => {
  const db = getDb(c.env);
  const groupId = String(c.req.param('id') || '');

  try {
    await db.batch([
      {
        sql: `DELETE FROM MessMember WHERE mess_id = ?`,
        args: [groupId]
      },
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
      },
      {
        sql: `INSERT INTO DisbandedMessGroup (id, group_name, tenantId, disbandedAt) VALUES (?, 'Disbanded Group', 'tenant_askar_01', CURRENT_TIMESTAMP) ON CONFLICT(id) DO NOTHING`,
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
khataRouter.post('/nfc/unlink', requireManagerAuth, async (c) => {
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
khataRouter.post('/nfc/assign', requireManagerAuth, async (c) => {
  const db = getDb(c.env);
  try {
    const body = await c.req.json();
    const tagId = (body.tag_id || body.tagId || body.cardUid || '').trim().toUpperCase();
    const customerId = body.customer_id || body.customerId;
    const cardType = (body.card_type || body.cardType || 'PERSONAL').toUpperCase();
    const messId = body.mess_id || body.messId || null;
    const messIds: string[] = Array.isArray(body.mess_ids || body.messIds)
      ? (body.mess_ids || body.messIds)
      : (messId ? [messId] : []);
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
          const mmId = `mm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          statements.push({
            sql: `INSERT OR IGNORE INTO MessMember (id, tenantId, mess_id, customer_id, role, is_active, joined_at)
                  VALUES (?, 'tenant_askar_01', ?, ?, 'MEMBER', 1, CURRENT_TIMESTAMP)`,
            args: [mmId, finalMessId, mId]
          });
          statements.push({
            sql: `UPDATE Customer SET mess_id = COALESCE(mess_id, ?) WHERE id = ?`,
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

      const primaryMessId = messIds.length > 0 ? messIds[0] : (messId || null);

      statements.push({
        sql: `UPDATE Customer SET nfcCardId = ?, cardUid = ?, mess_id = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [tagId, tagId, primaryMessId, customerId]
      });

      // Synchronize multiple mess memberships
      if (body.mess_ids !== undefined || body.messIds !== undefined || body.mess_id !== undefined || body.messId !== undefined) {
        statements.push({
          sql: `DELETE FROM MessMember WHERE customer_id = ?`,
          args: [customerId]
        });
        for (const mId of messIds) {
          const mmId = `mm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          statements.push({
            sql: `INSERT INTO MessMember (id, tenantId, mess_id, customer_id, role, is_active, joined_at)
                  VALUES (?, 'tenant_askar_01', ?, ?, 'MEMBER', 1, CURRENT_TIMESTAMP)`,
            args: [mmId, mId, customerId]
          });
        }
      }

      statements.push({
        sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, mess_id, createdAt)
              VALUES (?, 'PERSONAL', ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(tag_id) DO UPDATE SET 
                card_type = 'PERSONAL',
                customer_id = excluded.customer_id,
                mess_id = excluded.mess_id`,
        args: [tagId, customerId, primaryMessId]
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

/**
 * Handle Mid-Month Mess Member Departure & Debt Reallocation
 */
const handleEdgeMessMemberDeparture = async (c: any) => {
  const db = getDb(c.env);
  const messId = String(c.req.param('id') || '');
  const memberId = String(c.req.param('memberId') || '');
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';

  const body = await c.req.json().catch(() => ({}));
  const strategy = body.strategy || 'ABSORB_BY_ROOMMATES'; // 'ABSORB_BY_ROOMMATES' | 'CONVERT_TO_PERSONAL' | 'SETTLE_ON_DEPARTURE'
  const settleMethod = body.settleMethod || 'CASH';

  if (!messId || !memberId) {
    return c.json({ error: 'Mess ID and Member ID are required' }, 400);
  }

  try {
    const messGroup = await fetchMessGroupDetails(db, messId);
    if (!messGroup) {
      return c.json({ error: 'Mess group not found' }, 404);
    }

    const custRes = await db.execute({
      sql: `SELECT id, name, phone, cpr, balance FROM Customer WHERE id = ?`,
      args: [memberId]
    });
    const departingCust: any = custRes.rows?.[0];
    if (!departingCust) {
      return c.json({ error: 'Departing customer not found' }, 404);
    }

    const shareRes = await db.execute({
      sql: `SELECT ROUND(COALESCE(SUM(amount), 0), 3) as messShare
            FROM KhataLedger
            WHERE customerId = ? AND mess_id = ?`,
      args: [memberId, messId]
    });
    const rawShare = Number((shareRes.rows?.[0] as any)?.messShare || 0);
    const unpaidShare = Math.max(0, Number(rawShare.toFixed(3)));

    const remRes = await db.execute({
      sql: `SELECT DISTINCT c.id, c.name, c.phone, c.cpr
            FROM Customer c
            JOIN MessMember mm ON c.id = mm.customer_id
            WHERE mm.mess_id = ? AND mm.is_active = 1 AND c.id != ?`,
      args: [messId, memberId]
    });
    const remainingMembers = remRes.rows || [];

    const nowIso = new Date().toISOString();
    const statements: any[] = [];
    let allocations: { member: any; amount: number }[] = [];

    if (strategy === 'ABSORB_BY_ROOMMATES') {
      if (unpaidShare > 0) {
        if (remainingMembers.length === 0) {
          return c.json({
            error: 'Cannot absorb debt by roommates: No other active members remain in this mess group. Choose Settle on Departure or Convert to Personal Tab.',
            unpaidShare
          }, 400);
        }

        const totalFils = Math.round(unpaidShare * 1000);
        const baseFils = Math.floor(totalFils / remainingMembers.length);
        const remainderFils = totalFils % remainingMembers.length;

        allocations = remainingMembers.map((m: any, idx: number) => {
          const memberFils = baseFils + (idx < remainderFils ? 1 : 0);
          return {
            member: m,
            amount: Number((memberFils / 1000).toFixed(3))
          };
        });

        const offsetTxId = `dep_off_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const offsetRef = `Mess Departure Clearance: Absorbed by ${remainingMembers.length} roommates (${messGroup.group_name})`;
        statements.push({
          sql: `INSERT INTO KhataLedger (
            id, tenantId, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, mess_id, subledger_type
          ) VALUES (?, ?, ?, ?, 'MESS_DEPARTURE_OFFSET', ?, 
            (SELECT ROUND(COALESCE(SUM(amount), 0) - ?, 3) FROM KhataLedger WHERE customerId = ?), 
            'SYNCED', ?, ?, ?, 'MESS_SHARE')`,
          args: [offsetTxId, tenantId, memberId, -unpaidShare, offsetRef, unpaidShare, memberId, nowIso, nowIso, messId]
        });

        for (const alloc of allocations) {
          const allocTxId = `dep_abs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const allocRef = `Roommate Departure Share: Absorbed 1/${remainingMembers.length} of ${departingCust.name} (${alloc.amount.toFixed(3)} BD) from ${messGroup.group_name}`;
          statements.push({
            sql: `INSERT INTO KhataLedger (
              id, tenantId, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, mess_id, subledger_type
            ) VALUES (?, ?, ?, ?, 'MESS_REALLOCATION', ?, 
              (SELECT ROUND(COALESCE(SUM(amount), 0) + ?, 3) FROM KhataLedger WHERE customerId = ?), 
              'SYNCED', ?, ?, ?, 'MESS_SHARE')`,
            args: [allocTxId, tenantId, alloc.member.id, alloc.amount, allocRef, alloc.amount, alloc.member.id, nowIso, nowIso, messId]
          });
        }
      }
    } else if (strategy === 'CONVERT_TO_PERSONAL') {
      if (unpaidShare > 0) {
        const offsetTxId = `dep_off_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const offsetRef = `Mess Departure: Transferred to Personal Tab (${messGroup.group_name})`;
        statements.push({
          sql: `INSERT INTO KhataLedger (
            id, tenantId, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, mess_id, subledger_type
          ) VALUES (?, ?, ?, ?, 'MESS_DEPARTURE_OFFSET', ?, 
            (SELECT ROUND(COALESCE(SUM(amount), 0) - ?, 3) FROM KhataLedger WHERE customerId = ?), 
            'SYNCED', ?, ?, ?, 'MESS_SHARE')`,
          args: [offsetTxId, tenantId, memberId, -unpaidShare, offsetRef, unpaidShare, memberId, nowIso, nowIso, messId]
        });

        const persTxId = `dep_per_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const persRef = `Transferred Mess Debt from ${messGroup.group_name} on Departure`;
        statements.push({
          sql: `INSERT INTO KhataLedger (
            id, tenantId, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, mess_id, subledger_type
          ) VALUES (?, ?, ?, ?, 'ADJUSTMENT', ?, 
            (SELECT ROUND(COALESCE(SUM(amount), 0) + ?, 3) FROM KhataLedger WHERE customerId = ?), 
            'SYNCED', ?, ?, NULL, 'PERSONAL')`,
          args: [persTxId, tenantId, memberId, unpaidShare, persRef, unpaidShare, memberId, nowIso, nowIso]
        });
      }
    } else if (strategy === 'SETTLE_ON_DEPARTURE') {
      if (unpaidShare > 0) {
        const payTxId = `dep_pay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const payRef = `Mess Departure Settlement (${settleMethod}): ${messGroup.group_name}`;
        statements.push({
          sql: `INSERT INTO KhataLedger (
            id, tenantId, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, mess_id, subledger_type
          ) VALUES (?, ?, ?, ?, 'PAYMENT', ?, 
            (SELECT ROUND(COALESCE(SUM(amount), 0) - ?, 3) FROM KhataLedger WHERE customerId = ?), 
            'SYNCED', ?, ?, ?, 'MESS_SHARE')`,
          args: [payTxId, tenantId, memberId, -unpaidShare, payRef, unpaidShare, memberId, nowIso, nowIso, messId]
        });
      }
    }

    statements.push({
      sql: `UPDATE MessMember SET is_active = 0 WHERE mess_id = ? AND customer_id = ?`,
      args: [messId, memberId]
    });

    statements.push({
      sql: `UPDATE Customer 
            SET mess_id = (SELECT mess_id FROM MessMember WHERE customer_id = ? AND is_active = 1 LIMIT 1),
                updatedAt = datetime('now')
            WHERE id = ? AND mess_id = ?`,
      args: [memberId, memberId, messId]
    });

    statements.push({
      sql: `UPDATE Customer 
            SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?),
                updatedAt = datetime('now')
            WHERE id = ?`,
      args: [memberId, memberId]
    });

    for (const alloc of allocations) {
      statements.push({
        sql: `UPDATE Customer 
              SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?),
                  updatedAt = datetime('now')
              WHERE id = ?`,
        args: [alloc.member.id, alloc.member.id]
      });
    }

    if (statements.length > 0) {
      await db.batch(statements, 'write');
    }

    const updatedMessGroup = await fetchMessGroupDetails(db, messId);

    return c.json({
      success: true,
      strategy,
      departingMember: {
        id: departingCust.id,
        name: departingCust.name,
        clearedMessShare: unpaidShare
      },
      remainingMembersCount: remainingMembers.length,
      allocations: allocations.map(a => ({
        customerId: a.member.id,
        name: a.member.name,
        absorbedAmount: a.amount
      })),
      messGroup: updatedMessGroup,
      message: strategy === 'ABSORB_BY_ROOMMATES'
        ? `✅ ${departingCust.name} departed ${messGroup.group_name}. Unpaid share of BD ${unpaidShare.toFixed(3)} absorbed equally across ${remainingMembers.length} active roommates.`
        : (strategy === 'CONVERT_TO_PERSONAL'
          ? `✅ ${departingCust.name} departed ${messGroup.group_name}. Unpaid share of BD ${unpaidShare.toFixed(3)} converted to personal tab.`
          : `✅ ${departingCust.name} departed ${messGroup.group_name} after settling BD ${unpaidShare.toFixed(3)} in full.`)
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to process member departure', details: err?.message }, 500);
  }
};

khataRouter.post('/mess/:id/members/:memberId/depart', requirePosOrManagerAuth, handleEdgeMessMemberDeparture);
khataRouter.post('/mess-groups/:id/members/:memberId/depart', requirePosOrManagerAuth, handleEdgeMessMemberDeparture);
khataRouter.post('/nfc/mess-groups/:id/members/:memberId/depart', requirePosOrManagerAuth, handleEdgeMessMemberDeparture);

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
khataRouter.get('/payday-batch', requireManagerAuth, async (c) => {
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

// =========================================================================
// 🟢 1-TAP CUSTOMER AT COUNTER BEACON RELAY (Global Cellular 4G/5G + Wi-Fi)
// Enables customer PWA anywhere on mobile data to announce presence to POS
// =========================================================================

let latestCounterBeaconCache: {
  customerId: string;
  terminalId: string;
  customer: any;
  timestamp: number;
  acknowledged: boolean;
} | null = null;

// POST: Customer taps "I AM AT THE COUNTER" in PWA
async function handlePresentAtCounter(c: any) {
  let body: any = {};
  try { body = await c.req.json(); } catch { }
  const rawCustId = body.customerId || body.customer_id || body.id || c.req.query('customerId') || '';
  const terminalId = body.terminalId || body.terminal_id || c.req.query('terminalId') || 'T1';

  if (!rawCustId) {
    return c.json({ success: false, error: 'customerId is required' }, 400);
  }

  const cleanId = String(rawCustId).trim();
  const db = getDb(c.env);

  try {
    const custRes = await db.execute({
      sql: `SELECT c.id, c.name, c.phone, c.cpr, c.balance, c.credit_limit, c.mess_id, mg.group_name
            FROM Customer c
            LEFT JOIN MessGroup mg ON c.mess_id = mg.id
            WHERE c.id = ? OR c.access_token = ? OR c.phone = ? OR c.cpr = ?
            LIMIT 1`,
      args: [cleanId, cleanId, cleanId, cleanId]
    });

    if (!custRes.rows || custRes.rows.length === 0) {
      return c.json({ success: false, error: 'Customer not found' }, 404);
    }

    const row: any = custRes.rows[0];
    const customer = {
      id: row.id,
      name: row.name,
      phone: row.phone || null,
      balance: Number(row.balance || 0),
      currentBalance: Number(row.balance || 0),
      personalBalance: Number(row.balance || 0),
      creditLimit: Number(row.credit_limit || 0),
      mess_id: row.mess_id || null,
      group_name: row.group_name || null
    };

    const now = Date.now();

    // Lazy bootstrap schema if not created
    try {
      await db.execute({
        sql: `CREATE TABLE IF NOT EXISTS CounterBeaconRelay (
                id TEXT PRIMARY KEY,
                customer_id TEXT,
                terminal_id TEXT,
                customer_json TEXT,
                timestamp INTEGER,
                acknowledged_at INTEGER DEFAULT 0
              )`,
        args: []
      });
    } catch { }

    // Upsert active beacon into Turso database
    await db.execute({
      sql: `INSERT INTO CounterBeaconRelay (id, customer_id, terminal_id, customer_json, timestamp, acknowledged_at)
            VALUES ('active_beacon', ?, ?, ?, ?, 0)
            ON CONFLICT(id) DO UPDATE SET
              customer_id = excluded.customer_id,
              terminal_id = excluded.terminal_id,
              customer_json = excluded.customer_json,
              timestamp = excluded.timestamp,
              acknowledged_at = 0`,
      args: [customer.id, terminalId, JSON.stringify(customer), now]
    });

    // Update in-memory edge cache
    latestCounterBeaconCache = {
      customerId: customer.id,
      terminalId,
      customer,
      timestamp: now,
      acknowledged: false
    };

    return c.json({
      success: true,
      message: `${customer.name} announced at counter`,
      customer,
      terminalId,
      timestamp: now
    });
  } catch (err: any) {
    return c.json({ success: false, error: 'Beacon dispatch failed', details: err?.message }, 500);
  }
}

// GET: Sunmi POS terminal and Laptops poll for active customer arrival
async function handleGetLatestCounterBeacon(c: any) {
  const now = Date.now();
  const db = getDb(c.env);

  try {
    // 1. Fast path: check in-memory cache
    if (latestCounterBeaconCache && !latestCounterBeaconCache.acknowledged) {
      if (now - latestCounterBeaconCache.timestamp <= 45000) {
        return c.json({
          success: true,
          beacon: {
            customer: latestCounterBeaconCache.customer,
            terminalId: latestCounterBeaconCache.terminalId,
            timestamp: latestCounterBeaconCache.timestamp
          }
        });
      }
    }

    // 2. Query Turso database
    const res = await db.execute({
      sql: `SELECT customer_id, terminal_id, customer_json, timestamp, acknowledged_at 
            FROM CounterBeaconRelay 
            WHERE id = 'active_beacon' LIMIT 1`,
      args: []
    });

    if (res.rows && res.rows.length > 0) {
      const row: any = res.rows[0];
      const ts = Number(row.timestamp || 0);
      const ack = Number(row.acknowledged_at || 0);

      if (ack === 0 && (now - ts <= 45000)) {
        let cust = null;
        if (row.customer_json) {
          try { cust = JSON.parse(row.customer_json); } catch { }
        }
        return c.json({
          success: true,
          beacon: {
            customer: cust,
            terminalId: row.terminal_id || 'T1',
            timestamp: ts
          }
        });
      }
    }

    return c.json({ success: true, beacon: null });
  } catch (err: any) {
    return c.json({ success: false, beacon: null, error: err?.message });
  }
}

// POST: Acknowledge beacon once shown on POS screen
async function handleAckCounterBeacon(c: any) {
  const db = getDb(c.env);
  const now = Date.now();
  if (latestCounterBeaconCache) {
    latestCounterBeaconCache.acknowledged = true;
  }
  try {
    await db.execute({
      sql: `UPDATE CounterBeaconRelay SET acknowledged_at = ? WHERE id = 'active_beacon'`,
      args: [now]
    });
  } catch { }

  return c.json({ success: true, acknowledged: true, timestamp: now });
}

khataRouter.post('/present-at-counter', handlePresentAtCounter);
khataRouter.post('/api/khata/present-at-counter', handlePresentAtCounter);

khataRouter.get('/present-at-counter/latest', handleGetLatestCounterBeacon);
khataRouter.get('/api/khata/present-at-counter/latest', handleGetLatestCounterBeacon);

khataRouter.post('/present-at-counter/ack', handleAckCounterBeacon);
khataRouter.post('/api/khata/present-at-counter/ack', handleAckCounterBeacon);

/**
 * Manager Balance Adjustment & Khata Reconciliation (Edge Master)
 */
const handleAdjustCustomerBalanceEdge = async (c: any) => {
  const isAuth = await isManagerAuthorizedEdge(c);
  if (!isAuth) {
    return c.json({ error: 'Manager authorization required. Access Denied.' }, 403);
  }

  const db = getDb(c.env);
  const id = c.req.param('id');
  const cleanId = String(id || '').trim();

  let body: any = {};
  try { body = await c.req.json(); } catch { }
  const reason = String(body.reason || 'Manager Balance Adjustment').trim();
  const note = String(body.note || body.notes || reason).trim();
  const mode = body.mode || (body.newBalance !== undefined ? 'SET_BALANCE' : 'DELTA');

  try {
    const custRes = await db.execute({
      sql: `SELECT id, name, balance, tenantId FROM Customer WHERE id = ? LIMIT 1`,
      args: [cleanId]
    });

    if (!custRes.rows || custRes.rows.length === 0) {
      return c.json({ error: `Customer #${cleanId} not found` }, 404);
    }

    const customer = custRes.rows[0];
    const currentBal = Number(customer.balance || 0);

    let targetBal: number;
    let deltaBal: number;

    if (mode === 'SET_BALANCE' || body.newBalance !== undefined || body.targetBalance !== undefined) {
      const parsed = parseFloat(body.newBalance !== undefined ? body.newBalance : body.targetBalance);
      if (isNaN(parsed)) {
        return c.json({ error: 'Invalid target balance supplied' }, 400);
      }
      targetBal = Number(parsed.toFixed(3));
      deltaBal = Number((targetBal - currentBal).toFixed(3));
    } else {
      const parsedDelta = parseFloat(body.delta);
      if (isNaN(parsedDelta) || parsedDelta === 0) {
        return c.json({ error: 'Invalid delta supplied' }, 400);
      }
      deltaBal = Number(parsedDelta.toFixed(3));
      targetBal = Number((currentBal + deltaBal).toFixed(3));
    }

    if (deltaBal === 0) {
      return c.json({
        success: true,
        message: 'Balance unchanged (delta = 0)',
        customerId: customer.id,
        balance: currentBal,
        delta: 0
      });
    }

    const adjId = `tx_adj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const statements: { sql: string; args: any[] }[] = [];

    statements.push({
      sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, running_balance, timestamp, created_at, tenantId, syncStatus, subledger_type, notes)
            VALUES (?, ?, ?, 'BALANCE_ADJUSTMENT', 'ADJ-MANUAL', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, 'SYNCED', 'PERSONAL', ?)`,
      args: [adjId, customer.id, deltaBal, targetBal, customer.tenantId || 'tenant_askar_01', note]
    });

    statements.push({
      sql: `UPDATE Customer SET balance = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [targetBal, customer.id]
    });

    await db.batch(statements, 'write');

    return c.json({
      success: true,
      message: `Balance for ${customer.name} adjusted from ${currentBal.toFixed(3)} to ${targetBal.toFixed(3)} BHD.`,
      customerId: customer.id,
      customerName: customer.name,
      oldBalance: currentBal,
      newBalance: targetBal,
      balance: targetBal,
      delta: deltaBal,
      ledgerId: adjId
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to adjust customer balance', details: err?.message }, 500);
  }
};

/**
 * Void Khata Ledger Entry (Edge Master)
 */
const handleVoidLedgerEntryEdge = async (c: any) => {
  const isAuth = await isManagerAuthorizedEdge(c);
  if (!isAuth) {
    return c.json({ error: 'Manager authorization required. Access Denied.' }, 403);
  }

  const db = getDb(c.env);
  const id = c.req.param('id');
  const cleanId = String(id || '').trim();

  let body: any = {};
  try { body = await c.req.json(); } catch { }
  const reason = String(body.reason || 'Manager Voided Ledger Entry').trim();

  try {
    const entryRes = await db.execute({
      sql: `SELECT * FROM KhataLedger WHERE id = ? LIMIT 1`,
      args: [cleanId]
    });

    if (!entryRes.rows || entryRes.rows.length === 0) {
      return c.json({ error: `Ledger entry #${cleanId} not found` }, 404);
    }

    const entry = entryRes.rows[0];

    if (entry.type === 'VOIDED' || entry.type === 'VOID_REVERSAL') {
      return c.json({
        success: true,
        alreadyVoided: true,
        message: `Ledger entry #${entry.id} is already voided.`,
        ledgerId: entry.id
      });
    }

    const rawAmt = Number(entry.amount || 0);
    const reversalDelta = Number((-rawAmt).toFixed(3));
    const customerId = String(entry.customerId || '');

    const statements: { sql: string; args: any[] }[] = [];

    statements.push({
      sql: `UPDATE KhataLedger SET type = 'VOIDED', reference = 'VOIDED-' || reference, syncStatus = 'SYNCED' WHERE id = ?`,
      args: [entry.id]
    });

    const revId = `tx_rev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    statements.push({
      sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, running_balance, timestamp, created_at, tenantId, syncStatus, subledger_type, notes)
            VALUES (?, ?, ?, 'VOID_REVERSAL', ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, 'SYNCED', ?, ?)`,
      args: [
        revId,
        customerId,
        reversalDelta,
        `REV-${String(entry.id || '').slice(-8)}`,
        entry.tenantId || 'tenant_askar_01',
        entry.subledger_type || 'PERSONAL',
        `Reversal for voided ledger entry ${entry.id}: ${reason}`
      ]
    });

    if (customerId) {
      statements.push({
        sql: `UPDATE Customer SET balance = MAX(0, balance + ?), updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [reversalDelta, customerId]
      });
    }

    await db.batch(statements, 'write');

    return c.json({
      success: true,
      message: `Ledger entry #${entry.id} voided successfully. Balance adjusted by ${reversalDelta.toFixed(3)} BHD.`,
      ledgerId: entry.id,
      reversalId: revId,
      customerId,
      reversalDelta
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to void ledger entry', details: err?.message }, 500);
  }
};

khataRouter.post('/customers/:id/adjust-balance', handleAdjustCustomerBalanceEdge);
khataRouter.post('/:id/adjust-balance', handleAdjustCustomerBalanceEdge);
khataRouter.post('/api/customers/:id/adjust-balance', handleAdjustCustomerBalanceEdge);
khataRouter.post('/khata/:id/adjust-balance', handleAdjustCustomerBalanceEdge);
khataRouter.post('/ledger/:id/void', handleVoidLedgerEntryEdge);
khataRouter.post('/khata/ledger/:id/void', handleVoidLedgerEntryEdge);
khataRouter.post('/api/khata/ledger/:id/void', handleVoidLedgerEntryEdge);
khataRouter.post('/api/ledger/:id/void', handleVoidLedgerEntryEdge);



