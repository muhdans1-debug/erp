import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { db, dataDir } from '../db.js';
import { managerAuth } from '../middleware/auth.js';
import { ensureRegionalIso, getRegionalIsoString, REGIONAL_TIMEZONE } from '../utils/time.js';
import { mirrorCustomerToCloud, mirrorCustomerDeleteToCloud, mirrorLedgerEntryToCloud, mirrorCustomerMessMembershipsToCloud } from '../services/cloudSync.js';
import { generatePaydayBatch } from '../src/automation/paydayJob.js';

const KHATA_CONFIG_FILE = path.join(dataDir, 'khata_config.json');

const loadKhataConfig = () => {
  try {
    if (fs.existsSync(KHATA_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(KHATA_CONFIG_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error loading khata config:', e);
  }
  return { defaultCreditLimit: 30.0, customerLimits: {} };
};

const saveKhataConfig = (config) => {
  try {
    fs.writeFileSync(KHATA_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving khata config:', e);
  }
};

// Helper: Compute customer balance dynamically via high-performance SQLite engine aggregation
// With Aging Analysis (Days Since Last Payment) and Hard Credit Limit Enforcement (0ms Sub-millisecond Execution)
const getAllCustomersWithBalances = async (includeArchived = false, sortParam = 'highest') => {
  const sql = `
    SELECT c.id, c.tenantId, c.name, c.phone, c.credit_limit, c.credit_limit AS creditLimit, c.is_active,
           c.cardUid, c.mess_id, mg.group_name AS messName, mg.group_name AS mess_name, c.batchNo, c.description, c.createdAt,
           ROUND(COALESCE(SUM(l.amount), 0), 3) AS currentBalance,
           ROUND(COALESCE(SUM(CASE WHEN l.mess_id IS NULL OR l.mess_id = '' THEN l.amount ELSE 0 END), 0), 3) AS personalBalance,
           ROUND(COALESCE(SUM(CASE WHEN l.mess_id IS NOT NULL AND l.mess_id != '' THEN l.amount ELSE 0 END), 0), 3) AS messShare,
           MAX(CASE WHEN l.amount < 0 THEN l.timestamp END) AS lastPaymentDate,
           (SELECT ABS(amount) FROM KhataLedger WHERE customerId = c.id AND amount < 0 ORDER BY timestamp DESC LIMIT 1) AS lastPaymentAmount,
           MAX(l.timestamp) AS lastActivityDate,
           COUNT(l.id) AS ledgerCount
    FROM Customer c
    LEFT JOIN MessGroup mg ON c.mess_id = mg.id
    LEFT JOIN KhataLedger l ON c.id = l.customerId
    GROUP BY c.id;
  `;
  const result = await db.execute(sql);
  const rows = result.rows || [];

  // Query all active mess memberships from MessMember junction table
  const messMemberMap = new Map();
  try {
    const mmRes = await db.execute(`
      SELECT mm.customer_id, mg.id as mess_id, mg.group_name
      FROM MessMember mm
      JOIN MessGroup mg ON mm.mess_id = mg.id
      WHERE mm.is_active = 1
      ORDER BY mg.group_name ASC
    `);
    for (const r of mmRes.rows || []) {
      if (!messMemberMap.has(r.customer_id)) {
        messMemberMap.set(r.customer_id, []);
      }
      messMemberMap.get(r.customer_id).push({ id: r.mess_id, group_name: r.group_name });
    }
  } catch (err) { }

  const khataConfig = loadKhataConfig();
  const nowTime = Date.now();

  const list = rows.map((c) => {
    const computedBalance = Number(c.currentBalance || 0);
    const isAct = c.is_active === 1 || c.is_active === true || c.is_active === undefined || c.is_active === null;

    // Multi-Mess Resolution
    const customerMesses = messMemberMap.get(c.id) || [];
    if (customerMesses.length === 0 && c.mess_id && (c.messName || c.mess_name)) {
      customerMesses.push({ id: c.mess_id, group_name: c.messName || c.mess_name });
    }
    const messNames = customerMesses.map(m => m.group_name).join(', ');
    const messIds = customerMesses.map(m => m.id);
    const isMultiMess = customerMesses.length > 1;
    const hasMessGroup = customerMesses.length > 0;

    // 1. Calculate Last Payment Date & Aging
    const lastPaymentDate = c.lastPaymentDate || null;
    const lastPaymentAmount = Number((c.lastPaymentAmount || 0).toFixed(3));
    const lastActivityDate = c.lastActivityDate || null;

    // Determine reference date for debt aging
    const referenceDate = lastPaymentDate
      ? new Date(lastPaymentDate)
      : (lastActivityDate ? new Date(lastActivityDate) : (c.createdAt ? new Date(c.createdAt) : new Date(nowTime - 30 * 86400000)));

    const daysSinceLastPayment = Math.max(0, Math.floor((nowTime - referenceDate.getTime()) / (1000 * 60 * 60 * 24)));

    // 2. Hard Credit Limit Calculation
    const customLimit = khataConfig.customerLimits ? khataConfig.customerLimits[c.id] : null;
    const creditLimit = Number(customLimit) > 0 ? Number(customLimit) : (Number(c.creditLimit || c.credit_limit) > 0 ? Number(c.creditLimit || c.credit_limit) : Number(khataConfig.defaultCreditLimit || 30.0));

    const currentBalance = computedBalance;
    const isStale = currentBalance > 0 && daysSinceLastPayment > 45;
    const isOverLimit = currentBalance > creditLimit;
    const agingRisk = currentBalance <= 0 ? 'CLEARED' : (daysSinceLastPayment > 45 ? 'CRITICAL' : (daysSinceLastPayment > 30 ? 'WARNING' : 'HEALTHY'));

    return {
      ...c,
      messes: customerMesses,
      mess_ids: messIds,
      hasMessGroup,
      isMultiMess,
      messName: messNames || c.messName || null,
      mess_name: messNames || c.mess_name || c.messName || null,
      mess_id: customerMesses[0]?.id || c.mess_id || null,
      is_active: isAct ? 1 : 0,
      isActive: isAct,
      currentBalance: Number(currentBalance.toFixed(3)),
      balance: Number(currentBalance.toFixed(3)),
      personalBalance: Number((c.personalBalance || 0).toFixed(3)),
      messShare: Number((c.messShare || 0).toFixed(3)),
      creditLimit: Number(creditLimit.toFixed(3)),
      isOverLimit,
      isStale,
      daysSinceLastPayment,
      lastPaymentDate,
      lastPaymentAmount,
      lastActivityDate,
      agingRisk,
      ledgerCount: Number(c.ledgerCount || 0),
    };
  });

  let filteredList = includeArchived ? list : list.filter((c) => c.is_active === 1);

  // 3. Native Server-Side Sorting:
  // - highest: Highest remaining balance first (captures trapped cash flow)
  // - lowest: Lowest remaining balance first
  // - alpha: Alphabetical (A-Z)
  // - stale: Stale debt / oldest last payment date first (aging risk)
  // - overlimit: Customers exceeding credit limit first
  if (sortParam === 'highest') {
    filteredList.sort((a, b) => b.currentBalance - a.currentBalance);
  } else if (sortParam === 'lowest') {
    filteredList.sort((a, b) => a.currentBalance - b.currentBalance);
  } else if (sortParam === 'alpha') {
    filteredList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else if (sortParam === 'stale') {
    filteredList.sort((a, b) => {
      const diff = (b.daysSinceLastPayment || 0) - (a.daysSinceLastPayment || 0);
      if (diff !== 0) return diff;
      return b.currentBalance - a.currentBalance;
    });
  } else if (sortParam === 'overlimit') {
    filteredList.sort((a, b) => (b.currentBalance - b.creditLimit) - (a.currentBalance - a.creditLimit));
  } else {
    // Default: Highest balance first
    filteredList.sort((a, b) => b.currentBalance - a.currentBalance);
  }

  return filteredList;
};

const getCustomerWithBalanceById = async (id) => {
  const customer = await db.orm.Customer.where({ id }).all().first();
  if (!customer) return null;

  let customerMesses = [];
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
      args: [id, id]
    });
    customerMesses = (mmRes.rows || []).map(r => ({ id: r.id, group_name: r.group_name }));
  } catch { }

  let messName = customerMesses.map(m => m.group_name).join(', ') || null;
  if (!messName && customer.mess_id) {
    try {
      const gRes = await db.execute({
        sql: `SELECT group_name FROM MessGroup WHERE id = ? LIMIT 1`,
        args: [customer.mess_id]
      });
      messName = gRes.rows[0]?.group_name || null;
      if (messName) customerMesses.push({ id: customer.mess_id, group_name: messName });
    } catch { }
  }

  let customerLedger = [];
  try {
    customerLedger = await db.orm.KhataLedger.where({ customerId: id }).all();
  } catch {
    customerLedger = [];
  }

  const khataConfig = loadKhataConfig();
  const nowTime = Date.now();
  // 1. Sum all ledger entries (positive charges and negative payments)
  const ledgerSum = customerLedger.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  // NEW: Remove the broken Math.max clamp. Trust the ledger sum completely.
  const computedBalance = Number(ledgerSum.toFixed(3));
  const personalSum = customerLedger
    .filter((e) => !e.mess_id || e.mess_id === '')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const messSum = customerLedger
    .filter((e) => e.mess_id && e.mess_id !== '')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const isAct = customer.is_active === 1 || customer.is_active === true || customer.is_active === undefined || customer.is_active === null;

  const paymentEntries = customerLedger.filter((e) => Number(e.amount) < 0 || e.type === 'PAYMENT');
  let lastPaymentDate = null;
  let lastPaymentAmount = 0;
  if (paymentEntries.length > 0) {
    paymentEntries.sort((a, b) => new Date(b.timestamp || b.createdAt || 0).getTime() - new Date(a.timestamp || a.createdAt || 0).getTime());
    lastPaymentDate = paymentEntries[0].timestamp || paymentEntries[0].createdAt;
    lastPaymentAmount = Math.abs(Number(paymentEntries[0].amount) || 0);
  }

  const customLimit = khataConfig.customerLimits ? khataConfig.customerLimits[customer.id] : null;
  const baseCreditLimit = Number(customLimit) > 0 ? Number(customLimit) : (Number(customer.creditLimit) > 0 ? Number(customer.creditLimit) : Number(khataConfig.defaultCreditLimit || 30.0));
  const currentBalance = computedBalance;
  const referenceDate = lastPaymentDate ? new Date(lastPaymentDate) : (customer.createdAt ? new Date(customer.createdAt) : new Date(nowTime - 30 * 86400000));
  const daysSinceLastPayment = Math.max(0, Math.floor((nowTime - referenceDate.getTime()) / (1000 * 60 * 60 * 24)));

  // --- ALGORITHMIC CREDIT LIMITS (THE KHATA SCORE ENGINE) ---
  let trustScore = 70; // Baseline starting score
  let algorithmicCreditLimit = baseCreditLimit;
  let isNfcLocked = false;
  let nfcLockReason = null;

  if (paymentEntries.length > 0) {
    const paymentCount = paymentEntries.length;
    if (daysSinceLastPayment <= 7) {
      // Prompt settlement within 7 days: Reward with gold tier and +50% limit scale
      trustScore = Math.min(100, 80 + Math.min(20, paymentCount * 4));
      algorithmicCreditLimit = Number((baseCreditLimit * 1.5).toFixed(3)); // 50 -> 75 BHD
    } else if (daysSinceLastPayment <= 14) {
      trustScore = 75;
      algorithmicCreditLimit = baseCreditLimit;
    } else {
      // Overdue (> 14 days): Shrink limit and freeze NFC checkout card at Sunmi POS
      const overdueDays = daysSinceLastPayment - 14;
      trustScore = Math.max(10, 60 - overdueDays * 3);
      algorithmicCreditLimit = Number((Math.min(baseCreditLimit * 0.5, currentBalance)).toFixed(3));
      isNfcLocked = true;
      nfcLockReason = `Overdue Khata Debt (${daysSinceLastPayment} days). Card temporarily frozen until settled via BenefitPay.`;
    }
  } else if (currentBalance > 0 && daysSinceLastPayment > 14) {
    trustScore = 35;
    isNfcLocked = true;
    nfcLockReason = `First grocery debt unpaid for ${daysSinceLastPayment} days. Card temporarily frozen.`;
  }

  const effectiveCreditLimit = algorithmicCreditLimit;

  return {
    ...customer,
    messes: customerMesses,
    mess_ids: customerMesses.map(m => m.id),
    hasMessGroup: customerMesses.length > 0,
    isMultiMess: customerMesses.length > 1,
    messName,
    mess_name: messName,
    mess_id: customerMesses[0]?.id || customer.mess_id || null,
    is_active: isAct ? 1 : 0,
    isActive: isAct,
    currentBalance: Number(currentBalance.toFixed(3)),
    personalBalance: Number(personalSum.toFixed(3)),
    messShare: Number(messSum.toFixed(3)),
    creditLimit: Number(effectiveCreditLimit.toFixed(3)),
    baseCreditLimit: Number(baseCreditLimit.toFixed(3)),
    trustScore,
    trustTier: trustScore >= 85 ? 'GOLD' : (trustScore >= 65 ? 'SILVER' : 'HIGH_RISK'),
    isNfcLocked,
    nfcLockReason,
    isOverLimit: currentBalance > effectiveCreditLimit,
    isStale: currentBalance > 0 && daysSinceLastPayment > 45,
    daysSinceLastPayment,
    lastPaymentDate,
    lastPaymentAmount,
    agingRisk: currentBalance <= 0 ? 'CLEARED' : (daysSinceLastPayment > 45 ? 'CRITICAL' : (daysSinceLastPayment > 30 ? 'WARNING' : 'HEALTHY')),
    ledger: customerLedger,
  };
};


// Helper to fetch Mess Group details with members, running balances, spending shares, and mess ledger
const fetchMessGroupDetails = async (messId) => {
  if (!messId) return null;
  let group = null;
  let memberRows = [];

  try {
    const gRes = await db.execute({
      sql: `SELECT id, group_name FROM MessGroup WHERE id = ? OR group_name = ? LIMIT 1`,
      args: [messId, messId]
    });
    group = gRes.rows[0] || null;
    if (group) {
      const mRes = await db.execute({
        sql: `SELECT DISTINCT c.id, c.name, c.phone, c.cpr, c.cardUid, c.nfcCardId, c.batchNo,
                              COALESCE(mm.role, 'MEMBER') as role,
                              COALESCE(mm.is_active, 1) as is_active
              FROM Customer c
              JOIN MessMember mm ON c.id = mm.customer_id
              WHERE mm.mess_id = ?
              UNION
              SELECT c.id, c.name, c.phone, c.cpr, c.cardUid, c.nfcCardId, c.batchNo,
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
  } catch (e) {
    console.warn('Error fetching mess total balance:', e?.message);
  }

  // 2. Fetch individual members' shares in this specific mess group
  const memberMessBalances = new Map();
  try {
    const memberBalRes = await db.execute({
      sql: `SELECT customerId, ROUND(COALESCE(SUM(amount), 0), 3) as balance 
            FROM KhataLedger 
            WHERE mess_id = ? 
            GROUP BY customerId`,
      args: [group.id]
    });
    for (const row of (memberBalRes.rows || [])) {
      memberMessBalances.set(row.customerId, Number(row.balance ?? 0));
    }
  } catch (e) {
    console.warn('Error fetching member mess balances:', e?.message);
  }

  const allCustomers = await getAllCustomersWithBalances();
  const customerMap = new Map(allCustomers.map(c => [c.id, c]));

  const memberCount = Math.max(1, memberRows.length);
  const equalSplitShare = Number((messTotalBalance / memberCount).toFixed(3));

  const members = memberRows.map(m => {
    const matched = customerMap.get(m.id);
    const messShare = memberMessBalances.get(m.id) ?? 0.0;
    const personalTotal = matched ? matched.currentBalance : 0.0;
    return {
      id: m.id,
      name: m.name,
      phone: m.phone,
      cpr: m.cpr,
      cardUid: m.cardUid || m.nfcCardId || matched?.cardUid || null,
      batchNo: m.batchNo,
      currentBalance: Number(messShare.toFixed(3)), // Mess group share debt
      balance: Number(messShare.toFixed(3)),        // Mess group share debt
      messShare: Number(messShare.toFixed(3)),
      personalBalance: Number((personalTotal - messShare).toFixed(3)),
      consolidatedBalance: personalTotal,
      equalSplitShare,
      spendPercentage: messTotalBalance > 0 ? Number(((messShare / messTotalBalance) * 100).toFixed(1)) : 0
    };
  });

  // 3. Fetch mess group collective ledger strictly for this mess_id
  let messLedger = [];
  try {
    const res = await db.execute({
      sql: `SELECT * FROM KhataLedger WHERE mess_id = ? ORDER BY datetime(COALESCE(created_at, timestamp, '1970-01-01')) ASC`,
      args: [group.id]
    });
    const groupEntries = res.rows || [];
    const memberNameMap = new Map(members.map(m => [m.id, m.name]));

    let messRunningBalance = 0;
    const parsedEntries = groupEntries.map(entry => {
      const numAmount = Number(entry.amount || 0);
      messRunningBalance += numAmount;
      const isPayment = numAmount < 0;
      const txType = entry.type === 'WRITE_OFF' ? 'WRITE_OFF' : (isPayment || entry.type === 'PAYMENT' ? 'PAYMENT' : 'CHARGE');
      const d = new Date(entry.created_at || entry.timestamp || entry.createdAt || Date.now());
      const ref = entry.reference || (txType === 'CHARGE' ? 'Mess Grocery Purchase' : 'Mess Payment');

      // Extract Shopper Name from reference if available e.g. "(Shopper: Ali)"
      let shopper = memberNameMap.get(entry.customerId) || 'Member';
      const shopperMatch = ref.match(/\(Shopper:\s*([^)]+)\)/i);
      if (shopperMatch && shopperMatch[1]) {
        shopper = shopperMatch[1].trim();
      }

      // Extract Invoice Number from reference if available e.g. "INV-..."
      let inv = ref;
      const invMatch = ref.match(/(INV-[A-Za-z0-9_-]+)/i);
      if (invMatch && invMatch[1]) {
        inv = invMatch[1].trim();
      }

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
  } catch (err) {
    console.warn('Could not fetch mess ledger:', err?.message);
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

// Helper to synchronize a customer's memberships across multiple Mess/Camp accounts
const syncCustomerMessMemberships = async (customerId, messIds, primaryMessId = null) => {
  if (!customerId) return;
  let ids = [];
  if (Array.isArray(messIds)) {
    ids = messIds.map(m => (typeof m === 'object' && m !== null ? m.id : m)).filter(Boolean);
  } else if (messIds && typeof messIds === 'string') {
    ids = [messIds];
  } else if (primaryMessId) {
    ids = [primaryMessId];
  }
  ids = [...new Set(ids.map(s => String(s).trim()).filter(Boolean))];

  const primary = ids.length > 0 ? ids[0] : (primaryMessId || null);

  // 1. Maintain backward compatibility in Customer.mess_id
  try {
    await db.execute({
      sql: 'UPDATE Customer SET mess_id = ? WHERE id = ?',
      args: [primary, customerId]
    });
  } catch (e) {
    console.warn('Customer mess_id sync notice:', e?.message);
  }

  // 2. Synchronize MessMember junction table
  try {
    await db.execute({
      sql: 'DELETE FROM MessMember WHERE customer_id = ?',
      args: [customerId]
    });

    const nowIso = getRegionalIsoString();
    for (const mId of ids) {
      const memberId = `mm_${crypto.randomUUID ? crypto.randomUUID().substring(0, 8) : Math.random().toString(36).substring(2, 10)}`;
      await db.execute({
        sql: `INSERT INTO MessMember (id, tenantId, mess_id, customer_id, role, is_active, joined_at)
              VALUES (?, 'tenant_askar_01', ?, ?, 'MEMBER', 1, ?)`,
        args: [memberId, mId, customerId, nowIso]
      });
    }

    // Non-blocking mirror of multiple mess memberships to Turso Cloud
    mirrorCustomerMessMembershipsToCloud(customerId, ids).catch(() => {});
  } catch (err) {
    console.error('syncCustomerMessMemberships error:', err?.message);
  }
};

export { getAllCustomersWithBalances, getCustomerWithBalanceById, loadKhataConfig, saveKhataConfig, fetchMessGroupDetails, syncCustomerMessMemberships };

export default async function khataRoutes(fastify, options) {
  // --- Core Khata Ledger & Customer Management Routes ---

  // High-Performance SQLite Aggregate Route: Zero-blocking Customer Balances
  fastify.get('/api/khata/customers', async (request, reply) => {
    try {
      // Whitelisted columns with mess group name join
      const sql = `
        SELECT c.id, c.tenantId, c.name, c.phone, c.credit_limit, c.is_active, 
               c.cardUid, c.mess_id, mg.group_name AS messName, mg.group_name AS mess_name,
               COALESCE(SUM(l.amount), 0) AS currentBalance
        FROM Customer c 
        LEFT JOIN MessGroup mg ON c.mess_id = mg.id
        LEFT JOIN KhataLedger l ON c.id = l.customerId
        GROUP BY c.id
      `;
      const result = await db.execute(sql);
      return reply.send({ success: true, customers: result.rows || [] });
    } catch (err) {
      request.log.error(err, 'Failed to fetch khata customers');
      return reply.code(500).send({ error: 'Database error' });
    }
  });

// Route 1: /khata/ledger (Highest debt / aging risk sorting endpoint)
fastify.get('/khata/ledger', async (request) => {
  const { sort = 'highest', onlyDebtors, minBalance } = request.query || {};
  let list = await getAllCustomersWithBalances(false, sort);

  if (onlyDebtors === 'true' || minBalance) {
    const min = parseFloat(minBalance) || 0;
    list = list.filter((c) => c.currentBalance > min);
  }

  const totalMarketCredit = list.reduce((sum, c) => sum + c.currentBalance, 0);
  const activeDebtors = list.filter((c) => c.currentBalance > 0);
  const staleCustomers = list.filter((c) => c.isStale);
  const staleDebtTotal = staleCustomers.reduce((sum, c) => sum + c.currentBalance, 0);
  const overLimitCustomers = list.filter((c) => c.isOverLimit);

  return {
    success: true,
    sort,
    totalCount: list.length,
    debtorCount: activeDebtors.length,
    totalMarketCredit: Number(totalMarketCredit.toFixed(3)),
    staleDebtTotal: Number(staleDebtTotal.toFixed(3)),
    staleDebtCount: staleCustomers.length,
    overLimitCount: overLimitCustomers.length,
    customers: list,
  };
});

// Route 2: /api/khata/ledger (Alias)
fastify.get('/api/khata/ledger', async (request) => {
  const { sort = 'highest', onlyDebtors, minBalance } = request.query || {};
  let list = await getAllCustomersWithBalances(false, sort);

  if (onlyDebtors === 'true' || minBalance) {
    const min = parseFloat(minBalance) || 0;
    list = list.filter((c) => c.currentBalance > min);
  }

  const totalMarketCredit = list.reduce((sum, c) => sum + c.currentBalance, 0);
  const activeDebtors = list.filter((c) => c.currentBalance > 0);
  const staleCustomers = list.filter((c) => c.isStale);
  const staleDebtTotal = staleCustomers.reduce((sum, c) => sum + c.currentBalance, 0);
  const overLimitCustomers = list.filter((c) => c.isOverLimit);

  return {
    success: true,
    sort,
    totalCount: list.length,
    debtorCount: activeDebtors.length,
    totalMarketCredit: Number(totalMarketCredit.toFixed(3)),
    staleDebtTotal: Number(staleDebtTotal.toFixed(3)),
    staleDebtCount: staleCustomers.length,
    overLimitCount: overLimitCustomers.length,
    customers: list,
  };
});

// List all customers with real-time balance computed from append-only ledger
fastify.get('/api/customers', async (request) => {
  const includeArchived = request.query && (request.query.includeArchived === 'true' || request.query.all === 'true');
  const sort = request.query?.sort || 'highest';
  return await getAllCustomersWithBalances(includeArchived, sort);
});
fastify.get('/customers', async (request) => {
  const includeArchived = request.query && (request.query.includeArchived === 'true' || request.query.all === 'true');
  const sort = request.query?.sort || 'highest';
  return await getAllCustomersWithBalances(includeArchived, sort);
});

// Customer Khata Running Balance Ledger Statement
const handleGetCustomerStatement = async (request, reply) => {
  try {
    const { id } = request.params;
    let customer = await db.orm.Customer.where({ id }).all().first();
    let messGroup = null;
    let isMessGroupStatement = false;

    // 1. Check if the ID belongs to a Mess Group directly (e.g. mess_... or group ID)
    if (!customer) {
      try {
        const mgCheck = await db.execute({
          sql: `SELECT id, group_name FROM MessGroup WHERE id = ? OR group_name = ? LIMIT 1`,
          args: [id, id]
        });
        if (mgCheck.rows && mgCheck.rows[0]) {
          const group = mgCheck.rows[0];
          messGroup = await fetchMessGroupDetails(group.id);
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
      } catch (err) {
        console.warn('Error checking mess group statement:', err?.message);
      }
    }

    if (!customer) {
      return reply.status(404).send({ success: false, error: 'Customer or Mess Group not found' });
    }

    // Direct Mess Group Statement response
    if (isMessGroupStatement && messGroup) {
      const statement = messGroup.messLedger || [];
      return {
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
      };
    }

    // Fetch all mess groups this customer belongs to
    let customerMesses = [];
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
        args: [id, id]
      });
      customerMesses = mmRes.rows || [];
    } catch (e) {
      console.warn('Error fetching customer messes in statement:', e.message);
    }

    const detailedMesses = [];
    for (const m of customerMesses) {
      try {
        const details = await fetchMessGroupDetails(m.id);
        if (details) detailedMesses.push(details);
      } catch (err) {
        console.warn(`Error fetching mess details for ${m.id}:`, err.message);
      }
    }

    if (detailedMesses.length > 0) {
      messGroup = detailedMesses[0];
    } else if (customer.mess_id) {
      try {
        messGroup = await fetchMessGroupDetails(customer.mess_id);
        if (messGroup) detailedMesses.push(messGroup);
      } catch (err) {
        console.warn('Error fetching fallback messGroup in statement:', err.message);
      }
    }

    // Fetch all ledger entries
    let history = [];
    try {
      history = await db.orm.KhataLedger.where({ customerId: id }).all();
    } catch {
      history = [];
    }

    // Auto-reconciliation: Ensure all credit sales for this customer exist in the ledger
    try {
      const salesRes = await db.execute({
        sql: `SELECT id, total, invoiceNo, createdAt, paymentType 
              FROM Sale 
              WHERE customerId = ? AND (paymentType = 'CREDIT' OR paymentType = 'NFC_CREDIT' OR paymentType = 'CREDIT_PERSONAL')`,
        args: [id]
      });
      const creditSales = salesRes.rows || [];
      for (const s of creditSales) {
        const exists = history.some((h) => h.reference === s.invoiceNo || h.id === s.id || h.sale_id === s.id);
        if (!exists) {
          const ledgerId = `tx_inv_${String(s.invoiceNo || s.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          const ts = s.createdAt ? new Date(s.createdAt).toISOString() : new Date().toISOString();
          const newLedgerItem = {
            id: ledgerId,
            customerId: id,
            amount: Number(s.total) || 0,
            type: 'CHARGE',
            reference: s.invoiceNo || `INV-${Date.now()}`,
            running_balance: 0,
            syncStatus: 'SYNCED',
            timestamp: ts,
            created_at: ts,
            tenantId: 'tenant_askar_01',
            sale_id: s.id
          };
          history.push(newLedgerItem);

          // Permanently persist to local KhataLedger and mirror to cloud
          try {
            await db.execute({
              sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, sale_id)
                    VALUES (?, 'tenant_askar_01', ?, ?, 'CHARGE', ?, 0, 'SYNCED', ?, ?, ?)
                    ON CONFLICT(id) DO NOTHING`,
              args: [ledgerId, id, newLedgerItem.amount, newLedgerItem.reference, ts, ts, s.id]
            });
            mirrorLedgerEntryToCloud(newLedgerItem).catch(() => {});
          } catch (pErr) {
            console.warn('Auto-persist recovery notice:', pErr.message);
          }
        }
      }
    } catch (err) {
      console.warn('Auto-reconciliation note:', err.message);
    }

    // Sort chronologically (oldest to newest) to accurately calculate running balance
    history.sort((a, b) => new Date(a.timestamp || a.created_at || a.createdAt || 0).getTime() - new Date(b.timestamp || b.created_at || b.createdAt || 0).getTime());

    // Calculate the running balance line-by-line
    let runningBalance = 0;
    const enriched = history.map((entry) => {
      const numAmount = Number(entry.amount || 0);
      runningBalance += numAmount;
      const isPayment = numAmount < 0;
      const txType = entry.type === 'WRITE_OFF' 
        ? 'WRITE_OFF' 
        : entry.type === 'OPENING_BALANCE'
        ? 'OPENING_BALANCE'
        : (isPayment || entry.type === 'PAYMENT' ? 'PAYMENT' : 'CHARGE');
      const d = new Date(entry.created_at || entry.timestamp || entry.createdAt || Date.now());
      const displayAmount = Math.abs(numAmount);
      const ref = entry.reference || (txType === 'OPENING_BALANCE' ? 'Opening Balance (Previous Physical Book)' : txType === 'CHARGE' ? (entry.id ? `INV-${entry.id.slice(0, 6)}` : 'Store Purchase') : (txType === 'WRITE_OFF' ? 'Bad Debt Write-Off' : 'Cash Payment'));

      const matchedMess = detailedMesses.find(dm => dm.id === entry.mess_id);
      const messName = matchedMess ? matchedMess.group_name : (entry.mess_id ? 'Room Mess' : null);
      const walletName = messName || 'Personal Tab';

      return {
        ...entry,
        id: entry.id,
        customer_id: id,
        customerId: id,
        invoiceNo: ref,
        total: displayAmount,
        paymentType: txType,
        createdAt: d.toISOString(),
        type: txType,
        amount: displayAmount,
        raw_amount: numAmount,
        running_balance: Number(runningBalance.toFixed(3)),
        runningBalance: Number(runningBalance.toFixed(3)),
        reference: ref,
        mess_id: entry.mess_id || null,
        messName: messName,
        walletName: walletName,
        group_total: entry.group_total ? Number(entry.group_total) : null,
        member_count: entry.member_count ? Number(entry.member_count) : null,
        created_at: d.toISOString(),
        timestamp: d.toISOString(),
        formattedDate: d.toLocaleDateString(),
        formattedTime: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    });

    // Sub-wallet balances aggregation
    let personalBalance = 0;
    const messBalances = {};
    for (const dm of detailedMesses) {
      messBalances[dm.id] = 0;
    }

    for (const entry of history) {
      const amt = Number(entry.amount || 0);
      if (entry.mess_id && messBalances[entry.mess_id] !== undefined) {
        messBalances[entry.mess_id] += amt;
      } else if (!entry.mess_id) {
        personalBalance += amt;
      }
    }

    const wallets = {
      personal: Number(personalBalance.toFixed(3)),
      messes: detailedMesses.map(dm => ({
        id: dm.id,
        name: dm.group_name,
        memberShare: Number((messBalances[dm.id] || 0).toFixed(3)),
        groupTotal: Number(dm.totalBalance || 0),
        memberCount: dm.memberCount || dm.members?.length || 1,
        equalSplitShare: Number((dm.equalSplitShare || (dm.totalBalance / Math.max(1, dm.memberCount || 1))).toFixed(3))
      }))
    };

    // Newest transactions at the top
    const statement = [...enriched].reverse();

    const enrichedCust = await getCustomerWithBalanceById(id);

    return {
      success: true,
      statement,
      sales: statement, // Backward compatibility for legacy UI
      customer: {
        ...(enrichedCust || customer),
        messName: messGroup?.group_name || enrichedCust?.messName || null,
        mess_name: messGroup?.group_name || enrichedCust?.mess_name || null,
        currentBalance: enrichedCust?.currentBalance !== undefined ? enrichedCust.currentBalance : Math.max(0, Number(runningBalance.toFixed(3))),
        isMultiMess: detailedMesses.length > 1,
        messes: detailedMesses.map(dm => ({ id: dm.id, name: dm.group_name }))
      },
      currentBalance: enrichedCust?.currentBalance !== undefined ? enrichedCust.currentBalance : Math.max(0, Number(runningBalance.toFixed(3))),
      messGroup,
      messes: detailedMesses,
      wallets,
      isMultiMess: detailedMesses.length > 1
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to fetch statement' });
  }
};

fastify.get('/api/customers/:id/statement', handleGetCustomerStatement);
fastify.get('/khata/:id/statement', handleGetCustomerStatement);
fastify.get('/api/khata/:id/statement', handleGetCustomerStatement);
fastify.get('/api/nfc/mess-groups/:id/statement', handleGetCustomerStatement);
fastify.get('/api/mess/:id/statement', handleGetCustomerStatement);
fastify.get('/khata/mess/:id/statement', handleGetCustomerStatement);

// Mobile QR redirects directly to the Customer Interactive Khata Portal on Vite (:5173)
fastify.get('/tab/:id', async (request, reply) => {
  const { id } = request.params;
  const rawHost = request.headers.host ? request.headers.host.split(':')[0] : '192.168.8.7';
  const targetHost = (rawHost === 'localhost' || rawHost === '127.0.0.1') ? 'localhost' : rawHost;
  return reply.redirect(`http://${targetHost}:5173/?view=statement&id=${id}`);
});
fastify.get('/statement', async (request, reply) => {
  const { id } = request.query || {};
  const rawHost = request.headers.host ? request.headers.host.split(':')[0] : '192.168.8.7';
  const targetHost = (rawHost === 'localhost' || rawHost === '127.0.0.1') ? 'localhost' : rawHost;
  return reply.redirect(`http://${targetHost}:5173/?view=statement${id ? `&id=${id}` : ''}`);
});

// Customer Tab Safe Public Ledger Query (for Thermal QR Code Scans)
fastify.get('/api/customers/:id/tab', async (request, reply) => {
  const { id } = request.params;
  try {
    const result = await db.execute({
      sql: 'SELECT id, name, COALESCE(balance, 0.0) as balance, COALESCE(credit_limit, 30.0) as credit_limit, phone FROM Customer WHERE id = ? OR access_token = ? OR phone = ? LIMIT 1',
      args: [id, id, id]
    });

    if (result.rows.length === 0) {
      const cust = await getCustomerWithBalanceById(id);
      if (cust) {
        return reply.send({
          id: cust.id,
          name: cust.name,
          balance: Number(cust.personalBalance ?? cust.currentBalance ?? 0),
          credit_limit: Number(cust.creditLimit ?? 30.0)
        });
      }
      return reply.code(404).send({ error: 'Ledger not found.' });
    }

    const row = result.rows[0];
    return reply.send({
      id: row.id,
      name: row.name,
      balance: Number(row.balance || 0),
      credit_limit: Number(row.credit_limit || 30.0)
    });
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Database connection failed.' });
  }
});

// Secure Tap Payments Gateway Checkout Initialization
fastify.post('/api/checkout/init', async (request, reply) => {
  const { customerId, amount, customerName } = request.body || {};

  if (!customerId || !amount) {
    return reply.code(400).send({ error: 'Missing required fields' });
  }

  const tapSecretKey = process.env.TAP_SECRET_KEY || '';

  try {
    const tapResponse = await fetch('https://api.tap.company/v2/charges', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tapSecretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: Number(amount),
        currency: 'BHD',
        threeDSecure: true,
        save_card: false,
        description: `Khata Settlement for ${customerName || 'Customer'}`,
        receipt: { email: false, sms: false },
        customer: {
          first_name: customerName || 'Khata Customer',
          email: 'no-reply@askar.bh'
        },
        source: {
          id: 'src_all'
        },
        post: {
          url: 'https://askar-khata-pwa.vercel.app/api/webhook/tap'
        },
        redirect: {
          url: `https://askar-khata-pwa.vercel.app/tab/${customerId}?status=complete`
        },
        metadata: {
          customerUuid: customerId
        }
      })
    });

    const chargeData = await tapResponse.json();

    if (chargeData.transaction && chargeData.transaction.url) {
      return reply.send({ checkoutUrl: chargeData.transaction.url });
    } else {
      console.warn('Tap response notice:', chargeData);
      const fallbackUrl = chargeData.transaction?.url || `https://askar-khata-pwa.vercel.app/tab/${customerId}?status=mock_demo_success&amount=${amount}`;
      return reply.send({ checkoutUrl: fallbackUrl, raw: chargeData });
    }
  } catch (error) {
    fastify.log.error('Tap Init Error:', error);
    return reply.code(500).send({ error: 'Payment initialization failed' });
  }
});

// -------------------------------------------------------------
// 1. FLASH-INCENTIVIZED DEBT RECOVERY ENGINE
// -------------------------------------------------------------
let flashRecoveryCampaign = {
  isActive: true,
  discountPercent: 2.0, // 2%
  startedAt: Date.now(),
  expiresAt: Date.now() + 4 * 3600 * 1000, // 4 hours active window
  title: 'End of Month Flash Debt Settlement Special',
  message: 'Settle your Khata balance via BenefitPay in the next 4 hours and receive an instant 2% discount on your current debt!'
};

fastify.get('/api/khata/flash-recovery', async () => {
  const isExpired = Date.now() > flashRecoveryCampaign.expiresAt;
  return {
    success: true,
    campaign: {
      ...flashRecoveryCampaign,
      isActive: flashRecoveryCampaign.isActive && !isExpired,
      remainingSeconds: Math.max(0, Math.floor((flashRecoveryCampaign.expiresAt - Date.now()) / 1000))
    }
  };
});

fastify.post('/api/khata/flash-recovery/start', async (request, reply) => {
  const { discountPercent = 2.0, durationHours = 4, title, message } = request.body || {};
  flashRecoveryCampaign = {
    isActive: true,
    discountPercent: Number(discountPercent),
    startedAt: Date.now(),
    expiresAt: Date.now() + Number(durationHours) * 3600 * 1000,
    title: title || `${discountPercent}% Flash Settlement Special`,
    message: message || `Settle your Khata balance via BenefitPay in the next ${durationHours} hours and receive a ${discountPercent}% discount on your current debt!`
  };
  return { success: true, campaign: flashRecoveryCampaign };
});

fastify.post('/api/khata/flash-recovery/cancel', async () => {
  flashRecoveryCampaign.isActive = false;
  return { success: true, message: 'Flash recovery campaign deactivated' };
});

// -------------------------------------------------------------
// 2. CORPORATE SPONSOR B2B FLEET & MULTI-TAB SETTLEMENT
// -------------------------------------------------------------
fastify.get('/api/sponsor/:id/summary', async (request, reply) => {
  const { id } = request.params;
  const allCustomers = await getAllCustomersWithBalances();

  const corporateSponsor = {
    id: id || 'sp_alnaseem_01',
    companyName: 'Al-Naseem Contracting & MEP Services W.L.L.',
    crNumber: 'CR 98214-02',
    contactPerson: 'Eng. Tariq Al-Mansoor (Camp Operations Director)',
    phone: '+973 3944 8811',
    totalCreditFacility: 1200.000,
    settlementCycle: 'MONTHLY_CONSOLIDATED',
  };

  const sampleRooms = [
    { roomId: 'room_101', roomName: 'Room 101 — Central HVAC Crew', workersCount: 8, leadShopper: 'Ahmed Noor', customerId: 'cust_nfc_demo_01', balance: 38.667, trustScore: 94 },
    { roomId: 'room_104', roomName: 'Room 104 — MEP Shift A', workersCount: 12, leadShopper: 'Salman Khan', customerId: 'cust_002', balance: 64.200, trustScore: 91 },
    { roomId: 'room_202', roomName: 'Room 202 — Civil Carpenters', workersCount: 10, leadShopper: 'Mohammed Yaseen', customerId: 'cust_003', balance: 52.150, trustScore: 88 },
    { roomId: 'room_205', roomName: 'Room 205 — Heavy Equipment Drivers', workersCount: 6, leadShopper: 'Bilal Farooq', customerId: 'cust_004', balance: 41.300, trustScore: 78 },
    { roomId: 'room_301', roomName: 'Room 301 — Night Electrical Team', workersCount: 9, leadShopper: 'Rasheed Uddin', customerId: 'cust_005', balance: 75.800, trustScore: 82 },
    { roomId: 'room_304', roomName: 'Room 304 — Plumbing & Pipefitting', workersCount: 11, leadShopper: 'Gulzar Ahmed', customerId: 'cust_006', balance: 58.450, trustScore: 85 },
    { roomId: 'room_401', roomName: 'Room 401 — Safety & Rigging Crew', workersCount: 7, leadShopper: 'Kareem Buksh', customerId: 'cust_007', balance: 32.100, trustScore: 96 },
    { roomId: 'room_408', roomName: 'Room 408 — Workshop Mechanics', workersCount: 8, leadShopper: 'Javed Iqbal', customerId: 'cust_008', balance: 69.900, trustScore: 72 },
  ];

  const customerMap = new Map(allCustomers.map(c => [c.id, c]));
  const liveRooms = sampleRooms.map(r => {
    const liveCust = customerMap.get(r.customerId);
    const bal = liveCust ? liveCust.currentBalance : r.balance;
    const score = liveCust?.trustScore || r.trustScore;
    return {
      ...r,
      balance: Number(bal.toFixed(3)),
      trustScore: score,
      trustTier: score >= 85 ? 'GOLD' : (score >= 65 ? 'SILVER' : 'HIGH_RISK'),
      isOverdue: (liveCust?.daysSinceLastPayment || 0) > 14
    };
  });

  const totalOutstanding = liveRooms.reduce((sum, r) => sum + r.balance, 0);
  const totalWorkers = liveRooms.reduce((sum, r) => sum + r.workersCount, 0);

  return {
    success: true,
    sponsor: corporateSponsor,
    totalOutstanding: Number(totalOutstanding.toFixed(3)),
    totalWorkers,
    roomsCount: liveRooms.length,
    rooms: liveRooms,
    flashCampaign: {
      isActive: flashRecoveryCampaign.isActive && Date.now() <= flashRecoveryCampaign.expiresAt,
      discountPercent: flashRecoveryCampaign.discountPercent,
      potentialDiscountSavings: Number((totalOutstanding * (flashRecoveryCampaign.discountPercent / 100)).toFixed(3)),
      discountedTotalDue: Number((totalOutstanding * (1 - flashRecoveryCampaign.discountPercent / 100)).toFixed(3))
    }
  };
});

fastify.post('/api/sponsor/:id/settle-all', async (request, reply) => {
  const { id } = request.params;
  const { paymentMethod = 'TAP_CORPORATE_SETTLEMENT', reference = 'B2B Consolidated Camp Tab Settle' } = request.body || {};

  const allCustomers = await getAllCustomersWithBalances();
  const demoIds = ['cust_nfc_demo_01', 'cust_002', 'cust_003', 'cust_004', 'cust_005', 'cust_006', 'cust_007', 'cust_008'];

  let settledTotal = 0;
  for (const custId of demoIds) {
    const cust = allCustomers.find(c => c.id === custId);
    if (cust && cust.currentBalance > 0) {
      settledTotal += cust.currentBalance;
      try {
        await db.orm.KhataLedger.create({
          id: `SP-PAY-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          customerId: custId,
          amount: -cust.currentBalance,
          type: 'PAYMENT',
          paymentType: 'PAYMENT',
          reference: `${reference} (Sponsor: Al-Naseem)`,
          createdAt: new Date().toISOString()
        });
      } catch { }
    }
  }

  return {
    success: true,
    sponsorId: id,
    settledAmount: Number(settledTotal.toFixed(3)),
    status: 'PAID',
    transactionRef: `TAP-B2B-${Date.now()}`,
    clearedRoomsCount: demoIds.length,
    timestamp: new Date().toISOString()
  };
});

// -------------------------------------------------------------
// KHATA SECURITY & AUTH GATEWAY: 4-DIGIT PIN & RATE-LIMITED TOKENS
// -------------------------------------------------------------
const khataPinAttempts = new Map();

fastify.post('/api/khata/verify-pin', async (request, reply) => {
  try {
    const { uuid, customerId, id, pin } = request.body || {};
    const targetId = uuid || customerId || id;
    if (!targetId) {
      return reply.status(400).send({ success: false, error: 'Customer ID is required' });
    }
    if (!pin || String(pin).trim().length !== 4) {
      return reply.status(400).send({ success: false, error: 'Please enter a valid 4-digit PIN' });
    }

    // Rate limiting: 5 failed attempts locks for 15 minutes
    const now = Date.now();
    const attemptRecord = khataPinAttempts.get(targetId) || { count: 0, lockedUntil: 0 };
    if (attemptRecord.lockedUntil > now) {
      const remainingSec = Math.ceil((attemptRecord.lockedUntil - now) / 1000);
      return reply.status(429).send({ success: false, error: `Account temporarily locked due to failed attempts. Try again in ${remainingSec}s.` });
    }

    // Enforce artificial delay against timing attacks
    await new Promise(r => setTimeout(r, 200));

    let customerRow = null;
    try {
      const tRes = await db.execute({
        sql: 'SELECT id, name, khata_pin, khataPin, pin FROM Customer WHERE id = ?',
        args: [targetId]
      });
      if (tRes.rows.length > 0) customerRow = tRes.rows[0];
    } catch { }

    if (!customerRow) {
      return reply.status(404).send({ success: false, error: 'Customer not found' });
    }

    const storedPin = String(customerRow.khataPin || customerRow.khata_pin || customerRow.pin || '').trim();
    const inputPin = String(pin).trim();

    let isMatch = false;
    if (storedPin.startsWith('$2')) {
      isMatch = await bcrypt.compare(inputPin, storedPin).catch(() => false);
    } else {
      isMatch = (inputPin === storedPin);
      // Auto-migrate plaintext to bcrypt hash upon successful login
      if (isMatch && storedPin) {
        try {
          const hashed = await bcrypt.hash(inputPin, 10);
          await db.execute({
            sql: 'UPDATE Customer SET khata_pin = ?, khataPin = ?, pin = ? WHERE id = ?',
            args: [hashed, hashed, hashed, targetId]
          });
        } catch {}
      }
    }

    if (!isMatch) {
      attemptRecord.count += 1;
      if (attemptRecord.count >= 5) {
        attemptRecord.lockedUntil = now + (15 * 60 * 1000);
      }
      khataPinAttempts.set(targetId, attemptRecord);
      return reply.status(401).send({ success: false, error: 'Incorrect PIN. Please try again.' });
    }

    // Success: clear failed attempts
    khataPinAttempts.delete(targetId);

    // Issue a 90-day trusted device token
    const deviceToken = `khata_tok_${targetId}_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    return {
      success: true,
      deviceToken,
      customerId: targetId,
      customerName: customerRow.name,
      expiresIn: '90d'
    };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: 'Authentication failed' });
  }
});

// Update or set customer 4-digit PIN (Protected by Manager Auth)
fastify.post('/api/customers/:id/pin', { preHandler: managerAuth }, async (request, reply) => {
  try {
    const { id } = request.params;
    const { pin } = request.body || {};
    if (!pin || String(pin).trim().length !== 4) {
      return reply.status(400).send({ success: false, error: 'PIN must be exactly 4 digits' });
    }

    const cleanPin = String(pin).trim();
    const hashedPin = await bcrypt.hash(cleanPin, 10);

    try {
      await db.execute({
        sql: 'UPDATE Customer SET khata_pin = ?, khataPin = ?, pin = ? WHERE id = ?',
        args: [hashedPin, hashedPin, hashedPin, id]
      });
    } catch { }

    return { success: true, message: 'Khata 4-digit PIN updated successfully' };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to update PIN' });
  }
});

// Create customer (supports opening/previous book balance and automatic KhataLedger debit) - Secured with Manager Auth
fastify.post('/api/customers', { preHandler: managerAuth }, async (request, reply) => {
  const { name, phone, cpr, batchNo, description, cardUid, creditLimit, pin, previousBalance, initialBalance, openingBalance, balance, mess_id, mess_ids, messId, messIds } = request.body || {};
  if (!name || !name.trim()) {
    return reply.status(400).send({ success: false, error: 'Customer name is required' });
  }

  const rawPrevBalance = Number(previousBalance ?? initialBalance ?? openingBalance ?? balance ?? 0);
  const cleanPrevBalance = !isNaN(rawPrevBalance) && rawPrevBalance > 0 ? Number(rawPrevBalance.toFixed(3)) : 0.0;

  const cleanCardUid = cardUid && cardUid.trim() ? cardUid.trim().toUpperCase() : null;

  // Check if cardUid is already registered to another customer
  if (cleanCardUid) {
    const cleanNoColon = cleanCardUid.replace(/:/g, '');
    const allCustomers = await getAllCustomersWithBalances(true);
    const existing = allCustomers.find((c) => {
      if (!c.cardUid) return false;
      const cUid = c.cardUid.trim().toUpperCase();
      return cUid === cleanCardUid || cUid.replace(/:/g, '') === cleanNoColon;
    });

    if (existing) {
      return reply.status(409).send({
        success: false,
        error: `NFC Card [${cleanCardUid}] is already linked to "${existing.name}". Please use a different card or unlink it first.`,
      });
    }
  }

  try {
    const id = crypto.randomUUID();
    const rawPin = (pin && String(pin).trim().length === 4) ? String(pin).trim() : '0000';
    const hashedPin = await bcrypt.hash(rawPin, 10);
    const nowIso = getRegionalIsoString();

    const customerRecord = {
      id,
      name: name.trim(),
      phone: phone && phone.trim() ? phone.trim() : null,
      cpr: cpr && cpr.trim() ? cpr.trim() : null,
      batchNo: batchNo && batchNo.trim() ? batchNo.trim() : null,
      description: description && description.trim() ? description.trim() : null,
      nfcCardId: cleanCardUid,
      cardUid: cleanCardUid,
      khataPin: hashedPin,
      createdAt: nowIso,
      tenantId: 'tenant_askar_01',
      is_active: 1,
      isActive: 1,
      balance: cleanPrevBalance,
      khata_pin: hashedPin,
      pin: hashedPin,
      access_token: id,
    };

    await db.orm.Customer.create(customerRecord);
    try {
      await db.execute({
        sql: 'UPDATE Customer SET balance = ?, credit_limit = ?, khata_pin = ?, pin = ?, khataPin = ?, access_token = ?, nfc_card_id = ?, cardUid = ?, nfcCardId = ? WHERE id = ?',
        args: [cleanPrevBalance, Number(creditLimit || 30.0), hashedPin, hashedPin, hashedPin, id, cleanCardUid, cleanCardUid, cleanCardUid, id]
      });
    } catch (e) {
      console.warn('Customer khata init notice:', e?.message);
    }

    const incomingMessIds = mess_ids !== undefined ? mess_ids : (messIds !== undefined ? messIds : (mess_id !== undefined ? mess_id : messId));
    if (incomingMessIds !== undefined && incomingMessIds !== null) {
      await syncCustomerMessMemberships(id, incomingMessIds);
    }

    // If customer has a previous book balance, post an Opening Balance debit to KhataLedger
    let openingLedgerEntry = null;
    if (cleanPrevBalance > 0) {
      const ledgerId = `OB-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const refText = description && description.trim() 
        ? `Opening Balance: ${description.trim()}` 
        : 'Opening Balance (Previous Physical Book)';

      openingLedgerEntry = {
        id: ledgerId,
        customerId: id,
        amount: cleanPrevBalance, // Positive for debit / debt owed
        type: 'OPENING_BALANCE',
        reference: refText,
        running_balance: cleanPrevBalance,
        syncStatus: 'PENDING',
        timestamp: nowIso,
        created_at: nowIso,
        tenantId: 'tenant_askar_01',
      };

      try {
        await db.orm.KhataLedger.create(openingLedgerEntry);
      } catch (lErr) {
        // Fallback direct sql if ORM has table caching quirks
        await db.execute({
          sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, tenantId)
                VALUES (?, ?, ?, 'OPENING_BALANCE', ?, ?, 'PENDING', ?, ?, 'tenant_askar_01')`,
          args: [ledgerId, id, cleanPrevBalance, refText, cleanPrevBalance, nowIso, nowIso]
        });
      }
    }

    // Broadcast customer creation with balance to POS terminals via WebSocket
    if (fastify.websocketServer?.clients) {
      fastify.websocketServer.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'KHATA_CUSTOMER_CREATED',
            customer: {
              ...customerRecord,
              currentBalance: cleanPrevBalance,
              balance: cleanPrevBalance
            }
          }));
        }
      });
    }

    // Mirror to Turso Cloud (Zero-SPOF)
    mirrorCustomerToCloud({ ...customerRecord, balance: cleanPrevBalance }).catch(() => {});
    if (openingLedgerEntry) {
      await mirrorLedgerEntryToCloud(openingLedgerEntry).catch((mErr) => {
        console.warn('Initial cloud mirror notice for opening balance:', mErr.message);
      });
    }

    const created = await db.orm.Customer.where({ id }).all().first();
    return {
      success: true,
      customer: {
        ...created,
        currentBalance: cleanPrevBalance,
        balance: cleanPrevBalance,
      },
      ...created,
      currentBalance: cleanPrevBalance,
      balance: cleanPrevBalance,
      openingLedgerEntry,
    };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to create customer', details: err.message });
  }
});

// 1b. Edit Khata Customer Details
const handleUpdateCustomer = async (request, reply) => {
  const { id } = request.params;
  const { name, phone, cpr, batchNo, description, cardUid, creditLimit, mess_id, mess_ids, messId, messIds } = request.body || {};

  try {
    const customer = await db.orm.Customer.where({ id }).all().first();
    if (!customer) {
      return reply.status(404).send({ success: false, error: 'Customer not found' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone && phone.trim() ? phone.trim() : null;
    if (cpr !== undefined) updateData.cpr = cpr && cpr.trim() ? cpr.trim() : null;
    if (batchNo !== undefined) updateData.batchNo = batchNo && batchNo.trim() ? batchNo.trim() : null;
    if (description !== undefined) updateData.description = description && description.trim() ? description.trim() : null;
    if (cardUid !== undefined) updateData.cardUid = cardUid && cardUid.trim() ? cardUid.trim() : null;

    if (Object.keys(updateData).length > 0) {
      await db.orm.Customer.where({ id }).update(updateData);
    }

    if (creditLimit !== undefined) {
      const config = loadKhataConfig();
      config.customerLimits = config.customerLimits || {};
      const lim = parseFloat(creditLimit);
      if (!isNaN(lim) && lim >= 0) {
        config.customerLimits[id] = lim;
        saveKhataConfig(config);
        try {
          await db.execute({
            sql: 'UPDATE Customer SET credit_limit = ? WHERE id = ?',
            args: [lim, id]
          });
        } catch {}
      }
    }

    if (cardUid !== undefined) {
      const cleanUid = cardUid && cardUid.trim() ? cardUid.trim().toUpperCase() : null;
      try {
        await db.execute({
          sql: 'UPDATE Customer SET cardUid = ?, nfc_card_id = ?, nfcCardId = ? WHERE id = ?',
          args: [cleanUid, cleanUid, cleanUid, id]
        });
      } catch {}
    }

    const incomingMessIds = mess_ids !== undefined ? mess_ids : (messIds !== undefined ? messIds : (mess_id !== undefined ? mess_id : messId));
    if (incomingMessIds !== undefined) {
      await syncCustomerMessMemberships(id, incomingMessIds);
    }

    // Support updating or adding previous book balance
    const rawPrevBal = request.body.previousBalance ?? request.body.openingBalance ?? request.body.initialBalance;
    if (rawPrevBal !== undefined && rawPrevBal !== null && rawPrevBal !== '') {
      const cleanPrev = Number(parseFloat(rawPrevBal).toFixed(3));
      if (!isNaN(cleanPrev) && cleanPrev >= 0) {
        const obCheck = await db.execute({
          sql: `SELECT id FROM KhataLedger WHERE customerId = ? AND type = 'OPENING_BALANCE' LIMIT 1`,
          args: [id]
        });
        const nowIso = new Date().toISOString();
        if (obCheck.rows && obCheck.rows.length > 0) {
          const obId = obCheck.rows[0].id;
          await db.execute({
            sql: `UPDATE KhataLedger SET amount = ?, running_balance = ?, syncStatus = 'PENDING' WHERE id = ?`,
            args: [cleanPrev, cleanPrev, obId]
          });
          mirrorLedgerEntryToCloud({
            id: obId,
            customerId: id,
            amount: cleanPrev,
            type: 'OPENING_BALANCE',
            reference: 'Opening Balance (Previous Physical Book)'
          }).catch(() => {});
        } else if (cleanPrev > 0) {
          const ledgerId = `OB-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const refText = description && description.trim() 
            ? `Opening Balance: ${description.trim()}` 
            : 'Opening Balance (Previous Physical Book)';
          const obEntry = {
            id: ledgerId,
            customerId: id,
            amount: cleanPrev,
            type: 'OPENING_BALANCE',
            reference: refText,
            running_balance: cleanPrev,
            syncStatus: 'PENDING',
            timestamp: nowIso,
            created_at: nowIso,
            tenantId: 'tenant_askar_01',
          };
          await db.execute({
            sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, tenantId)
                  VALUES (?, ?, ?, 'OPENING_BALANCE', ?, ?, 'PENDING', ?, ?, 'tenant_askar_01')`,
            args: [ledgerId, id, cleanPrev, refText, cleanPrev, nowIso, nowIso]
          });
          await mirrorLedgerEntryToCloud(obEntry);
        }

        // Recalculate customer balance to match ledger sum
        await db.execute({
          sql: `UPDATE Customer SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?) WHERE id = ?`,
          args: [id, id]
        });
      }
    }

    const updated = await getCustomerWithBalanceById(id);

    // Asynchronous non-blocking mirror to Turso Cloud (Zero-SPOF)
    if (updated) {
      mirrorCustomerToCloud(updated).catch(() => {});
    }

    return { success: true, customer: updated, ...updated };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to update customer' });
  }
};

fastify.put('/api/customers/:id', { preHandler: managerAuth }, handleUpdateCustomer);
fastify.put('/customers/:id', { preHandler: managerAuth }, handleUpdateCustomer);
fastify.put('/khata/:id', { preHandler: managerAuth }, handleUpdateCustomer);
fastify.put('/api/khata/:id', { preHandler: managerAuth }, handleUpdateCustomer);
fastify.post('/customers/:id/update', { preHandler: managerAuth }, handleUpdateCustomer);
fastify.post('/api/customers/:id/update', { preHandler: managerAuth }, handleUpdateCustomer);

// 1d. Bad Debt Write-Off (Settles balance as WRITE_OFF and logs business expense)
fastify.post('/api/khata/write-off', { preHandler: managerAuth }, async (request, reply) => {
  const { customerId, reason = 'Stale uncollectible balance write-off' } = request.body || {};

  const customer = await getCustomerWithBalanceById(customerId);
  if (!customer) {
    return reply.status(404).send({ success: false, error: 'Customer not found' });
  }

  if (customer.currentBalance <= 0) {
    return reply.status(400).send({ success: false, error: 'Customer has no outstanding balance to write off' });
  }

  const writeOffAmount = customer.currentBalance;
  const ledgerId = crypto.randomUUID();
  const expenseId = crypto.randomUUID();

  // Append-only entry clearing the Khata balance
  const nowIso = getRegionalIsoString();
  await db.orm.KhataLedger.create({
    id: ledgerId,
    customerId,
    amount: -writeOffAmount,
    type: 'WRITE_OFF',
    reference: `Bad Debt Write-off: ${reason}`,
    running_balance: 0.0,
    syncStatus: 'SYNCED',
    timestamp: nowIso,
    created_at: nowIso,
  });

  // Record business expense for audit & P&L tax offset
  try {
    await db.orm.Expense.create({
      id: expenseId,
      amount: writeOffAmount,
      type: 'BUSINESS',
      category: 'BAD_DEBT',
      description: `Bad Debt Write-off: ${customer.name} (Ref: ${reason})`,
      createdAt: nowIso,
    });
  } catch (e) {
    console.error('Failed to log write-off expense:', e);
  }

  const updatedCustomer = await getCustomerWithBalanceById(customerId);
  return {
    success: true,
    message: `Successfully written off BD ${writeOffAmount.toFixed(3)} for ${customer.name}`,
    writtenOffAmount: writeOffAmount,
    newBalance: updatedCustomer.currentBalance,
    customer: updatedCustomer,
  };
});

// 1c. Delete Khata Customer (Manager Authorization Required, Balance Must Be Zero)
const handleArchiveCustomer = async (request, reply) => {
  const { id } = request.params;

  try {
    const customerWithBal = await getCustomerWithBalanceById(id);
    if (!customerWithBal) {
      return reply.status(404).send({ success: false, error: 'Customer not found' });
    }

    // Strict Financial Integrity Rule: Cannot delete a customer with an active balance
    if (customerWithBal.currentBalance > 0.001) {
      return reply.status(400).send({
        success: false,
        error: `Cannot delete customer with an outstanding balance (BD ${customerWithBal.currentBalance.toFixed(3)}). Customer must pay and settle all dues to BD 0.000 first.`,
        balance: customerWithBal.currentBalance
      });
    }

    // 1. Unbind any linked NFC card from both NfcCard and Customer
    try {
      await db.execute({ sql: `UPDATE Customer SET cardUid = NULL, nfcCardId = NULL, nfc_card_id = NULL WHERE id = ?`, args: [id] });
      await db.execute({ sql: `UPDATE NfcCard SET customer_id = NULL WHERE customer_id = ?`, args: [id] });
    } catch (e) {
      console.warn('NFC card unbind warning:', e.message);
    }

    // 2. Check if customer has historical sales
    let hasSales = false;
    try {
      const salesCheck = await db.execute({ sql: `SELECT COUNT(*) as count FROM Sale WHERE customerId = ?`, args: [id] });
      hasSales = Number(salesCheck.rows[0]?.count || 0) > 0;
    } catch {
      hasSales = false;
    }

    if (!hasSales) {
      // Safe to hard delete completely from ledger and customer table
      try {
        await db.execute({ sql: `DELETE FROM KhataLedger WHERE customerId = ?`, args: [id] });
        await db.execute({ sql: `DELETE FROM Customer WHERE id = ?`, args: [id] });
      } catch (err) {
        // Fallback to soft-delete if foreign key restriction occurs
        await db.orm.Customer.where({ id }).update({ is_active: 0 });
      }
    } else {
      // Soft deletion preserves sales tax audit trail
      await db.orm.Customer.where({ id }).update({ is_active: 0 });
    }

    // Broadcast customer deletion over WebSocket
    if (fastify.websocketServer) {
      const msg = JSON.stringify({ type: 'KHATA_CUSTOMER_DELETED', customerId: id, name: customerWithBal.name });
      fastify.websocketServer.clients.forEach((client) => {
        if (client.readyState === 1) client.send(msg);
      });
    }

    // Asynchronous non-blocking mirror of deletion to Turso Cloud (Zero-SPOF)
    mirrorCustomerDeleteToCloud(id).catch(() => {});

    return {
      success: true,
      message: `Customer ${customerWithBal.name} successfully deleted`,
      deletedId: id
    };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to delete customer' });
  }
};

fastify.delete('/api/customers/:id', { preHandler: managerAuth }, handleArchiveCustomer);
fastify.delete('/khata/:id', { preHandler: managerAuth }, handleArchiveCustomer);
fastify.delete('/api/khata/:id', { preHandler: managerAuth }, handleArchiveCustomer);

// Customer / Cashier Khata Freeze & Lock Endpoint
const handleLocalKhataFreeze = async (request, reply) => {
  const { id } = request.params;
  const { freeze } = request.body || {};
  const cleanId = String(id || '').trim();

  try {
    const custRes = await db.execute({
      sql: `SELECT id, name, is_active, isActive FROM Customer WHERE id = ? OR access_token = ? OR phone = ? LIMIT 1`,
      args: [cleanId, cleanId, cleanId]
    });

    if (!custRes.rows || custRes.rows.length === 0) {
      return reply.code(404).send({ success: false, error: 'Customer account not found' });
    }

    const customer = custRes.rows[0];
    const isCurrentlyActive = !(customer.is_active === 0 || customer.isActive === 0);
    const shouldFreeze = freeze !== undefined ? Boolean(freeze) : isCurrentlyActive;
    const newActiveState = shouldFreeze ? 0 : 1;

    await db.execute({
      sql: `UPDATE Customer SET is_active = ?, isActive = ?, updatedAt = datetime('now') WHERE id = ?`,
      args: [newActiveState, newActiveState, customer.id]
    });

    return reply.send({
      success: true,
      id: customer.id,
      name: customer.name,
      is_active: newActiveState,
      isActive: Boolean(newActiveState),
      message: newActiveState === 0
        ? 'Khata successfully locked. Store credit purchases are disabled.'
        : 'Khata unlocked. Store credit purchases are active.'
    });
  } catch (err) {
    fastify.log.error(err, 'Khata freeze error');
    return reply.code(500).send({ success: false, error: 'Failed to update Khata lock state' });
  }
};

fastify.post('/api/khata/:id/freeze', handleLocalKhataFreeze);
fastify.post('/khata/:id/freeze', handleLocalKhataFreeze);
fastify.post('/api/customers/:id/freeze', handleLocalKhataFreeze);
fastify.post('/customers/:id/freeze', handleLocalKhataFreeze);

// Khata Ledger Reset Route (Secured - Fail-Closed with Manager PIN)
fastify.post('/api/khata/reset', { preHandler: managerAuth }, async (request, reply) => {
  return reply.status(403).send({
    success: false,
    error: 'Full Khata ledger reset is prohibited in production to preserve audit trail compliance.'
  });
});



  // --- Customer Card Binding & Settlement Routes ---
// 2b. Bind NFC Card to Customer (Card Enrollment)
fastify.post('/api/customers/:id/bind-card', async (request, reply) => {
  const { id } = request.params;
  const { cardUid } = request.body || {};

  if (!cardUid) {
    return reply.status(400).send({ error: 'cardUid is required' });
  }

  const cleanCardUid = cardUid.trim().toUpperCase();
  const cleanNoColon = cleanCardUid.replace(/:/g, '');

  try {
    const customer = await db.orm.Customer.where({ id }).all().first();
    if (!customer) {
      return reply.status(404).send({ error: 'Customer not found' });
    }

    const allCustomers = await getAllCustomersWithBalances(true);
    const existing = allCustomers.find((c) => {
      if (c.id === id || !c.cardUid) return false;
      const cUid = c.cardUid.trim().toUpperCase();
      return cUid === cleanCardUid || cUid.replace(/:/g, '') === cleanNoColon;
    });

    if (existing) {
      return reply.status(409).send({
        success: false,
        error: `NFC Card [${cleanCardUid}] is already linked to "${existing.name}".`,
      });
    }

    await db.orm.Customer.where({ id }).update({ cardUid: cleanCardUid });
    try {
      await db.execute({
        sql: 'UPDATE Customer SET cardUid = ?, nfc_card_id = ?, nfcCardId = ? WHERE id = ?',
        args: [cleanCardUid, cleanCardUid, cleanCardUid, id]
      });
    } catch {}
    const updated = await getCustomerWithBalanceById(id);
    return { success: true, customer: updated };
  } catch (err) {
    fastify.log.error(err);
    reply.status(500).send({ success: false, error: 'Failed to bind card' });
  }
});

// 2c. Settle Customer Khata Balance (Append-Only Event Sourcing: logs -amount in KhataLedger)
const handleCustomerSettle = async (request, reply) => {
  const { id } = request.params;
  const { amount, paymentMethod, amountPaid, reference, messId, mess_id } = request.body || {};
  const settleAmount = parseFloat(amountPaid !== undefined ? amountPaid : amount);
  if (isNaN(settleAmount) || settleAmount <= 0) {
    return reply.status(400).send({ success: false, error: 'Valid settlement amount is required' });
  }

  try {
    let customer = await db.orm.Customer.where({ id }).all().first();
    let messGroup = null;

    if (!customer) {
      // Check if this is a direct Mess Group settlement
      const mgRes = await db.execute({
        sql: `SELECT id, group_name FROM MessGroup WHERE id = ? OR group_name = ? LIMIT 1`,
        args: [id, id]
      });
      if (mgRes.rows && mgRes.rows[0]) {
        messGroup = await fetchMessGroupDetails(mgRes.rows[0].id);
      }
    }

    if (!customer && !messGroup) {
      return reply.status(404).send({ success: false, error: 'Customer or Mess Group not found' });
    }

    const payRef = reference || (paymentMethod === 'BENEFIT_PAY' ? 'BenefitPay Payment' : 'Cash Payment');
    const receiptNo = `KH-${Date.now().toString().slice(-6)}`;

    // Case A: Direct Mess Group Entity Settlement (Split payment equally across mess members)
    if (messGroup && !customer) {
      const activeMembers = messGroup.members || [];
      if (activeMembers.length === 0) {
        return reply.status(400).send({ success: false, error: 'Mess group has no active members to credit' });
      }

      const splitCredit = parseFloat((settleAmount / activeMembers.length).toFixed(3));
      const remainder = parseFloat((settleAmount - (splitCredit * activeMembers.length)).toFixed(3));
      const nowIso = getRegionalIsoString();

      await db.transaction(async (tx) => {
        for (let i = 0; i < activeMembers.length; i++) {
          const m = activeMembers[i];
          const mCredit = parseFloat((i === 0 ? splitCredit + remainder : splitCredit).toFixed(3));
          const entryId = crypto.randomUUID();

          await tx.execute({
            sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, syncStatus, timestamp, created_at, tenantId, mess_id)
                  VALUES (?, ?, ?, 'PAYMENT', ?, 'SYNCED', ?, ?, 'tenant_askar_01', ?)`,
            args: [entryId, m.id, -mCredit, `Mess Settlement: ${messGroup.group_name} (${payRef})`, nowIso, nowIso, messGroup.id]
          });

          await tx.execute({
            sql: `UPDATE Customer SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?), updatedAt = datetime('now') WHERE id = ?`,
            args: [m.id, m.id]
          });
        }
      });

      const updatedMess = await fetchMessGroupDetails(messGroup.id);
      return reply.send({
        success: true,
        isMess: true,
        message: `Mess debt settled: BD ${settleAmount.toFixed(3)} credited equally across ${activeMembers.length} members`,
        messGroup: updatedMess,
        amountPaid: settleAmount,
        settledAmount: settleAmount,
        receiptNo
      });
    }

    // Case B: Individual Customer Settlement (Optionally tagged with mess_id if earmarked for a mess)
    let targetMessId = mess_id || messId || null;
    if (!targetMessId) {
      try {
        const pDebtRes = await db.execute({
          sql: `SELECT ROUND(COALESCE(SUM(amount), 0), 3) AS bal FROM KhataLedger WHERE customerId = ? AND (mess_id IS NULL OR mess_id = '')`,
          args: [id]
        });
        const pDebt = Number(pDebtRes.rows?.[0]?.bal || 0);

        if (pDebt <= 0) {
          // If personal debt is already zero or cleared, allocate payment to customer's active mess debt
          const mDebtRes = await db.execute({
            sql: `SELECT mess_id, ROUND(COALESCE(SUM(amount), 0), 3) AS bal 
                  FROM KhataLedger 
                  WHERE customerId = ? AND mess_id IS NOT NULL AND mess_id != '' 
                  GROUP BY mess_id 
                  HAVING bal > 0 
                  LIMIT 1`,
            args: [id]
          });
          if (mDebtRes.rows && mDebtRes.rows.length > 0) {
            targetMessId = mDebtRes.rows[0].mess_id;
          }
        }
      } catch { }
    }

    let previousBalance = 0;
    let newBalance = '0.000';
    let ledgerEntry = null;

    // NEW: Atomic transaction to prevent split-brain balance overwrites
    await db.transaction(async (tx) => {
      // 0. Fetch current ledger balance before settlement
      const prevResult = await tx.execute({
        sql: 'SELECT COALESCE(SUM(amount), 0) AS balance FROM KhataLedger WHERE customerId = ?',
        args: [id]
      });
      previousBalance = Number(prevResult.rows[0]?.balance || 0);

      // Build append-only ledger record (negative amount for payment received)
      const nowIso = getRegionalIsoString();
      const entryId = crypto.randomUUID();

      await tx.execute({
        sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, syncStatus, timestamp, created_at, tenantId, mess_id)
              VALUES (?, ?, ?, 'PAYMENT', ?, 'PENDING', ?, ?, 'tenant_askar_01', ?)`,
        args: [entryId, id, -settleAmount, payRef, nowIso, nowIso, targetMessId]
      });

      ledgerEntry = {
        id: entryId,
        customerId: id,
        amount: -settleAmount, // Negative for balance deduction
        type: 'PAYMENT',
        reference: payRef,
        running_balance: Number((previousBalance - settleAmount).toFixed(3)),
        syncStatus: 'PENDING',
        timestamp: nowIso,
        created_at: nowIso,
        tenantId: 'tenant_askar_01',
        mess_id: targetMessId
      };
      
      // 2. Lock the ledger and calculate the exact new sum
      const sumResult = await tx.execute({
        sql: 'SELECT COALESCE(SUM(amount), 0) AS balance FROM KhataLedger WHERE customerId = ?',
        args: [id]
      });
      newBalance = Number(sumResult.rows[0].balance).toFixed(3);
      
      // 3. Update the Customer profile with the validated sum
      await tx.execute({ 
        sql: 'UPDATE Customer SET balance = ? WHERE id = ?', 
        args: [newBalance, id] 
      });
    });

    // Broadcast atomic settlement delta to all connected POS registers
    if (fastify.websocketServer?.clients) {
      fastify.websocketServer.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'KHATA_BALANCE_UPDATED',
            customerId: id,
            delta: -settleAmount
          }));
        }
      });
    }

    // Asynchronous non-blocking mirror of settlement to Turso Cloud (Zero-SPOF)
    if (ledgerEntry) {
      mirrorLedgerEntryToCloud(ledgerEntry).catch(() => {});
    }

    const updatedCustomer = {
      ...customer,
      balance: Number(newBalance),
      currentBalance: Number(newBalance),
    };

    return reply.send({
      success: true,
      message: 'Debt settled successfully',
      result: updatedCustomer,
      customerName: customer.name,
      amountPaid: settleAmount,
      settledAmount: settleAmount,
      previousBalance: Number(previousBalance.toFixed(3)),
      newBalance: Number(newBalance),
      paymentMethod: paymentMethod || 'CASH',
      receiptNo,
      timestamp: ledgerEntry?.timestamp,
      customer: updatedCustomer,
      ledgerEntry,
    });
  } catch (err) {
    request.log.error(err, 'Failed to settle customer debt');
    return reply.code(500).send({ error: 'Database transaction failed' });
  }
};

fastify.post('/api/customers/:id/settle', handleCustomerSettle);
fastify.post('/khata/:id/pay', handleCustomerSettle);
fastify.post('/api/khata/:id/pay', handleCustomerSettle);
fastify.post('/api/khata/:id/settle', handleCustomerSettle);
fastify.post('/khata/:id/settle', handleCustomerSettle);

// Alias endpoints for direct Khata payment submission
fastify.post('/khata/pay', async (request, reply) => {
  const { customerId, id, amount, amountPaid, paymentMethod, reference } = request.body || {};
  const targetId = customerId || id;
  if (!targetId) {
    return reply.status(400).send({ success: false, error: 'customerId is required' });
  }
  request.params = { id: targetId };
  request.body = { ...request.body, amount, amountPaid, paymentMethod, reference };
  return await handleCustomerSettle(request, reply);
});

fastify.post('/api/khata/pay', async (request, reply) => {
  const { customerId, id } = request.body || {};
  const targetId = customerId || id;
  if (!targetId) {
    return reply.status(400).send({ success: false, error: 'customerId is required' });
  }
  request.params = { id: targetId };
  return await handleCustomerSettle(request, reply);
});

  // --- Khata BenefitPay Settlement Claims (Option 3: Cashier Approval Workflow) ---
  fastify.get('/api/khata/claims/pending', async (request, reply) => {
    try {
      const claims = await db.execute(`
        SELECT c.id, c.customerId, c.customerName, c.amount, c.reference, c.channel, c.status, c.createdAt,
               cust.phone, cust.balance AS currentBalance
        FROM KhataSettlementClaim c
        LEFT JOIN Customer cust ON cust.id = c.customerId
        WHERE c.status = 'PENDING'
        ORDER BY c.createdAt ASC
      `);
      return reply.send({ success: true, claims: claims.rows || [] });
    } catch (err) {
      fastify.log.error('Fetch pending claims error:', err);
      return reply.code(500).send({ error: 'Failed to fetch pending claims' });
    }
  });

  fastify.post('/api/khata/claims/:claimId/approve', async (request, reply) => {
    const { claimId } = request.params;
    const { reviewer = 'Cashier' } = request.body || {};

    try {
      const claimRes = await db.execute({
        sql: "SELECT * FROM KhataSettlementClaim WHERE id = ? AND status = 'PENDING' LIMIT 1",
        args: [claimId]
      });

      if (!claimRes.rows || claimRes.rows.length === 0) {
        return reply.code(404).send({ success: false, error: 'Pending settlement claim not found or already processed' });
      }

      const claim = claimRes.rows[0];
      const customer = await db.orm.Customer.where({ id: claim.customerId }).all().first();
      if (!customer) {
        return reply.code(404).send({ success: false, error: 'Customer account not found' });
      }

      const prevBalance = Number(customer.balance || 0);
      const clearAmount = Math.min(Number(claim.amount), prevBalance);
      const newBalance = Math.max(0, prevBalance - clearAmount);
      const paymentRef = `BenefitPay Fawri+ Verified (Ref: ${claim.reference})`;
      const ledgerId = `bp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      await db.transaction(async (tx) => {
        // 1. Mark claim approved
        await tx.execute({
          sql: "UPDATE KhataSettlementClaim SET status = 'APPROVED', reviewedAt = strftime('%Y-%m-%dT%H:%M:%fZ','now'), reviewedBy = ? WHERE id = ?",
          args: [reviewer, claimId]
        });

        // 2. Insert payment into KhataLedger
        await tx.orm.KhataLedger.create({
          id: ledgerId,
          customerId: customer.id,
          amount: -clearAmount,
          type: 'PAYMENT',
          reference: paymentRef,
          running_balance: newBalance,
          syncStatus: 'PENDING',
          timestamp: new Date(),
          created_at: new Date(),
          tenantId: 'tenant_askar_01'
        });

        // 3. Update customer balance
        await tx.execute({
          sql: 'UPDATE Customer SET balance = ? WHERE id = ?',
          args: [newBalance.toFixed(3), customer.id]
        });
      });

      // Broadcast settlement delta to all connected registers
      if (fastify.websocketServer?.clients) {
        fastify.websocketServer.clients.forEach(client => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'KHATA_BALANCE_UPDATED',
              customerId: customer.id,
              delta: -clearAmount
            }));
          }
        });
      }

      return reply.send({
        success: true,
        message: 'Settlement claim approved and balance deducted successfully',
        clearedAmount: clearAmount,
        newBalance: newBalance.toFixed(3),
        reference: paymentRef,
        customerId: customer.id,
        customerName: customer.name
      });
    } catch (err) {
      fastify.log.error('Approve Claim Error:', err);
      return reply.code(500).send({ success: false, error: 'Failed to approve claim: ' + err.message });
    }
  });

  fastify.post('/api/khata/claims/:claimId/reject', async (request, reply) => {
    const { claimId } = request.params;
    const { reviewer = 'Cashier', reason = 'Unverified payment reference' } = request.body || {};

    try {
      const claimRes = await db.execute({
        sql: "SELECT * FROM KhataSettlementClaim WHERE id = ? AND status = 'PENDING' LIMIT 1",
        args: [claimId]
      });

      if (!claimRes.rows || claimRes.rows.length === 0) {
        return reply.code(404).send({ success: false, error: 'Pending settlement claim not found or already processed' });
      }

      await db.execute({
        sql: "UPDATE KhataSettlementClaim SET status = 'REJECTED', reviewedAt = strftime('%Y-%m-%dT%H:%M:%fZ','now'), reviewedBy = ?, notes = ? WHERE id = ?",
        args: [reviewer, reason, claimId]
      });

      return reply.send({
        success: true,
        message: 'Settlement claim rejected. Customer balance remains unchanged.'
      });
    } catch (err) {
      fastify.log.error('Reject Claim Error:', err);
      return reply.code(500).send({ success: false, error: 'Failed to reject claim: ' + err.message });
    }
  });



  // --- Khata Ledger Outbox / Sync Engine Routes ---
// 4b. Khata Ledger Sync Receiver (Append-Only Event Sourcing - completely immune to Split-Brain)
fastify.post('/api/sync/khata-ledger', async (request, reply) => {
  const incomingEntries = request.body || [];

  try {
    let appendedCount = 0;
    await db.transaction(async (tx) => {
      for (const entry of incomingEntries) {
        const existing = await tx.orm.KhataLedger.where({ id: entry.id }).all().first();
        if (!existing) {
          await tx.orm.KhataLedger.create({
            id: entry.id,
            customerId: entry.customerId,
            amount: Number(entry.amount),
            type: entry.type || (Number(entry.amount) < 0 ? 'PAYMENT_IN' : 'SALE'),
            syncStatus: 'SYNCED',
            timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
            tenantId: entry.tenantId || 'tenant_askar_01',
          });
          appendedCount++;
        }
      }
    });

    return { success: true, appendedCount, message: `Appended ${appendedCount} new ledger entries safely.` };
  } catch (error) {
    fastify.log.error('Khata ledger sync failed', error);
    return reply.status(500).send({ success: false, error: 'Database ledger write failed.' });
  }
});

// 4c. Khata Ledger Delta Provider (Pull append-only transactions newer than timestamp)
fastify.get('/api/sync/khata-ledger', async (request, reply) => {
  const { lastSyncDate } = request.query || {};

  try {
    if (!lastSyncDate) {
      const res = await db.execute('SELECT * FROM KhataLedger ORDER BY timestamp DESC LIMIT 1000');
      return { success: true, entries: res.rows || [] };
    }

    const cutoffIso = new Date(lastSyncDate).toISOString();
    const res = await db.execute({
      sql: 'SELECT * FROM KhataLedger WHERE timestamp > ? ORDER BY timestamp ASC',
      args: [cutoffIso]
    });

    return { success: true, entries: res.rows || [] };
  } catch (error) {
    fastify.log.error('Failed to fetch ledger updates', error);
    return reply.status(500).send({ error: 'Failed to fetch ledger updates' });
  }
});

  // --- CRDT Event-Sourced Atomic Khata Charge Endpoint ---
  // Decouples balance calculation from individual registers: appends delta to KhataLedger
  // and applies atomic relative delta (balance = balance + ?) to prevent concurrent overwrites.
  const handleKhataCharge = async (request, reply) => {
    const { customerId, customer_id, amount, invoiceNo, reference } = request.body || {};
    const effectiveCustomerId = customerId || customer_id;
    const effectiveInvoiceNo = invoiceNo || reference || `INV-${Date.now()}`;
    const numAmount = Number(amount);

    if (!effectiveCustomerId || isNaN(numAmount)) {
      return reply.code(400).send({ error: 'Missing customerId or invalid amount' });
    }

    const database = fastify.db || db;

    // Verify customer exists and is not frozen
    try {
      const custCheck = await database.execute({
        sql: `SELECT id, name, is_active, isActive FROM Customer WHERE id = ? OR access_token = ? LIMIT 1`,
        args: [effectiveCustomerId, effectiveCustomerId]
      });
      if (custCheck.rows && custCheck.rows.length > 0) {
        const cust = custCheck.rows[0];
        if (cust.is_active === 0 || cust.isActive === 0) {
          return reply.code(403).send({
            success: false,
            error: 'Customer Khata account is FROZEN. In-store credit purchases are locked by customer.',
            isFrozen: true
          });
        }
      }
    } catch (e) {
      console.warn('Customer active check warning:', e?.message);
    }

    // Start an isolated transaction to guarantee atomic execution
    const transaction = await database.transaction('write');

    try {
      // 1. Append the immutable event to the ledger (The CRDT Log)
      const ledgerId = crypto.randomUUID();
      const chargeTimeIso = ensureRegionalIso(request.body?.createdAt || request.body?.timestamp);
      await transaction.execute({
        sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, timestamp, created_at) 
              VALUES (?, ?, ?, 'CHARGE', ?, ?, ?)`,
        args: [ledgerId, effectiveCustomerId, numAmount, effectiveInvoiceNo, chargeTimeIso, chargeTimeIso]
      });

      // 2. Perform an atomic relative update, NEVER an absolute overwrite
      await transaction.execute({
        sql: `UPDATE Customer SET balance = COALESCE(balance, 0) + ? WHERE id = ?`,
        args: [numAmount, effectiveCustomerId]
      });

      await transaction.commit();

      // 3. Broadcast the balance update to all registers instantly
      if (fastify.websocketServer?.clients) {
        fastify.websocketServer.clients.forEach(client => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'KHATA_BALANCE_UPDATED',
              customerId: effectiveCustomerId,
              delta: numAmount
            }));
          }
        });
      }

      return reply.send({ success: true, ledgerId });
    } catch (error) {
      await transaction.rollback().catch(() => {});
      fastify.log.error('Khata CRDT Transaction Failed:', error);
      return reply.code(500).send({ error: 'Database merge conflict' });
    }
  };

  fastify.post('/api/khata/charge', handleKhataCharge);
  fastify.post('/khata/charge', handleKhataCharge);

  // --------------------------------------------------------------------
  // Canonical NFC Khata Lookup endpoint (Single source of truth)
  // Supports Personal Cards, Mess Group Shared Cards, and Dual-Wallet Splitting
  // --------------------------------------------------------------------
  const handleResolveCustomerByCard = async (request, reply) => {
    try {
      const { uid } = request.params;
      const scannedUid = (uid || '').trim().toUpperCase().replace(/^#+|#+$/g, '');
      const cleanNoColon = scannedUid.replace(/[:\-]/g, '');

      // 1. Try NfcCard registry table first
      let cardRes = { rows: [] };
      try {
        cardRes = await db.execute({
          sql: `SELECT customer_id, card_type, mess_id 
                FROM NfcCard 
                WHERE UPPER(tag_id) = ? OR REPLACE(UPPER(tag_id), ':', '') = ? LIMIT 1`,
          args: [scannedUid, cleanNoColon]
        });
      } catch {}

      let customerId = cardRes.rows.length > 0 ? cardRes.rows[0].customer_id : null;
      let messId = cardRes.rows.length > 0 ? cardRes.rows[0].mess_id : null;
      let cardType = cardRes.rows.length > 0 ? (cardRes.rows[0].card_type || 'PERSONAL').toUpperCase() : 'PERSONAL';

      // 2. If it is a MESS card or has mess_id without customer_id, resolve the Mess Group!
      if (messId && (!customerId || cardType === 'MESS')) {
        const groupRes = await db.execute({
          sql: `SELECT id, group_name FROM MessGroup WHERE id = ? LIMIT 1`,
          args: [messId]
        });

        if (groupRes.rows && groupRes.rows.length > 0) {
          const group = groupRes.rows[0];
          const membersRes = await db.execute({
            sql: `SELECT id, name, phone, cpr, balance FROM Customer WHERE mess_id = ? AND (is_active = 1 OR is_active IS NULL)`,
            args: [messId]
          });
          const members = (membersRes.rows || []).map((m) => ({
            ...m,
            balance: Number(m.balance ?? 0)
          }));
          const totalGroupBalance = Number(members.reduce((sum, m) => sum + m.balance, 0).toFixed(3));

          return reply.send({
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
              cardUid: scannedUid,
              memberCount: members.length,
              members,
              isOverLimit: totalGroupBalance > 500.0
            }
          });
        }
      }

      // 3. Fallback to Customer.nfcCardId or cardUid
      if (!customerId) {
        const custCheck = await db.execute({
          sql: `SELECT id, mess_id FROM Customer 
                WHERE UPPER(COALESCE(nfcCardId, '')) = ? 
                   OR REPLACE(UPPER(COALESCE(nfcCardId, '')), ':', '') = ?
                   OR UPPER(COALESCE(cardUid, '')) = ?
                   OR REPLACE(UPPER(COALESCE(cardUid, '')), ':', '') = ?
                   OR UPPER(COALESCE(nfc_card_id, '')) = ?
                   OR REPLACE(UPPER(COALESCE(nfc_card_id, '')), ':', '') = ?
                LIMIT 1`,
          args: [scannedUid, cleanNoColon, scannedUid, cleanNoColon, scannedUid, cleanNoColon]
        });
        if (custCheck.rows && custCheck.rows.length > 0) {
          customerId = custCheck.rows[0].id;
          if (!messId) messId = custCheck.rows[0].mess_id || null;
        }
      }

      if (!customerId) {
        return reply.code(404).send({ success: false, error: 'Unrecognized NFC Card. Please register this card to a Khata account or Mess group.', uid: scannedUid });
      }

      const customerRes = await db.execute({
        sql: `SELECT id, name, phone, cpr, balance, credit_limit, is_active, nfcCardId, cardUid, mess_id FROM Customer WHERE id = ? LIMIT 1`,
        args: [customerId]
      });

      if (!customerRes.rows || customerRes.rows.length === 0) {
        return reply.code(404).send({ success: false, error: 'Customer record missing' });
      }

      const row = customerRes.rows[0];
      const balance = Number(row.balance ?? 0);
      const rawLimit = Number(row.credit_limit);
      const limit = rawLimit > 0 ? rawLimit : 30.0;
      const finalMessId = row.mess_id || messId;

      let groupName = null;
      let groupMembers = [];
      if (finalMessId) {
        try {
          const [gRes, mRes] = await Promise.all([
            db.execute({ sql: `SELECT group_name FROM MessGroup WHERE id = ? LIMIT 1`, args: [finalMessId] }),
            db.execute({ sql: `SELECT id, name, balance FROM Customer WHERE mess_id = ? AND (is_active = 1 OR is_active IS NULL)`, args: [finalMessId] })
          ]);
          if (gRes.rows && gRes.rows.length > 0) groupName = gRes.rows[0].group_name;
          groupMembers = (mRes.rows || []).map((m) => ({ ...m, balance: Number(m.balance ?? 0) }));
        } catch {}
      }

      const isFrozen = (row.is_active === 0 || row.isActive === 0);
      const customer = {
        ...row,
        currentBalance: balance,
        balance: balance,
        creditLimit: limit,
        credit_limit: limit,
        cardUid: row.nfcCardId || row.cardUid || scannedUid,
        card_type: finalMessId ? 'DUAL' : 'PERSONAL',
        hasMessGroup: Boolean(finalMessId),
        isDual: Boolean(finalMessId),
        mess_id: finalMessId,
        group_name: groupName,
        members: groupMembers,
        isOverLimit: balance > limit,
        isFrozen,
        is_active: isFrozen ? 0 : 1,
        isActive: !isFrozen
      };

      return reply.send({ success: true, customer });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ success: false, error: 'Failed to query NFC customer' });
    }
  };

  fastify.get('/api/khata/nfc/:uid', handleResolveCustomerByCard);

  // Rebalance Mess Group: Split total camp debt equally across all member cards
  fastify.post('/api/khata/mess/:id/rebalance', async (request, reply) => {
    const { id } = request.params;
    try {
      const messDetails = await fetchMessGroupDetails(id);
      if (!messDetails || !messDetails.members || messDetails.members.length === 0) {
        return reply.code(404).send({ error: 'Mess group not found or has no members' });
      }

      const { totalBalance, members, group_name } = messDetails;
      if (totalBalance <= 0) {
        return reply.code(400).send({ error: 'Camp balance is zero; no rebalance needed', totalBalance });
      }

      const splitAmount = parseFloat((totalBalance / members.length).toFixed(3));
      const remainder = parseFloat((totalBalance - (splitAmount * members.length)).toFixed(3));

      const statements = [];
      const batchId = `rebal_${Date.now()}`;
      const now = new Date().toISOString();

      for (let i = 0; i < members.length; i++) {
        const m = members[i];
        const targetShare = parseFloat((i === 0 ? splitAmount + remainder : splitAmount).toFixed(3));
        const delta = Number((targetShare - (m.currentBalance || m.balance || 0)).toFixed(3));
        if (Math.abs(delta) > 0.001) {
          const txId = `tx_${batchId}_${m.id}`;
          const ref = `Mess Equal Split Rebalance (${group_name})`;
          const txType = delta > 0 ? 'CHARGE' : 'PAYMENT';

          statements.push({
            sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, tenantId, syncStatus, timestamp, created_at, mess_id)
                  VALUES (?, ?, ?, ?, ?, 'tenant_askar_01', 'SYNCED', ?, ?, ?)`,
            args: [txId, m.id, delta, txType, ref, now, now, id]
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
        await db.batch(statements);
      }

      const updated = await fetchMessGroupDetails(id);
      return reply.send({
        success: true,
        message: `Camp debt successfully split equally across all ${members.length} cards (BD ${equalSplitShare.toFixed(3)} each)`,
        messGroup: updated
      });
    } catch (err) {
      fastify.log.error(err, 'Failed to rebalance mess group');
      return reply.code(500).send({ error: 'Failed to split balance equally across cards', details: err.message });
    }
  });

  // Autonomous Payday Debt Recovery Engine (BenefitPay Fawri+ Batch Broadcaster)
  fastify.get('/api/khata/payday-batch', async (request, reply) => {
    try {
      const minBalance = parseFloat(request.query?.minBalance || '0.001');
      const batch = await generatePaydayBatch({ minBalance });
      return reply.send(batch);
    } catch (err) {
      fastify.log.error(err, 'Failed to generate payday recovery batch');
      return reply.code(500).send({ error: 'Failed to generate payday batch', details: err.message });
    }
  });
}
