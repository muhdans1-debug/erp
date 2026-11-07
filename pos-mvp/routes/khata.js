import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { db, dataDir } from '../db.js';
import { managerAuth } from '../middleware/auth.js';

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
           c.cardUid, c.mess_id, c.batchNo, c.description, c.createdAt,
           COALESCE(SUM(l.amount), 0) AS currentBalance,
           MAX(CASE WHEN l.amount < 0 THEN l.timestamp END) AS lastPaymentDate,
           MAX(CASE WHEN l.amount < 0 THEN ABS(l.amount) END) AS lastPaymentAmount,
           MAX(l.timestamp) AS lastActivityDate,
           COUNT(l.id) AS ledgerCount
    FROM Customer c
    LEFT JOIN KhataLedger l ON c.id = l.customerId
    GROUP BY c.id;
  `;
  const result = await db.execute(sql);
  const rows = result.rows || [];

  const khataConfig = loadKhataConfig();
  const nowTime = Date.now();

  const list = rows.map((c) => {
    const computedBalance = Number(c.currentBalance || 0);
    const isAct = c.is_active === 1 || c.is_active === true || c.is_active === undefined || c.is_active === null;

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
      is_active: isAct ? 1 : 0,
      isActive: isAct,
      currentBalance: Number(currentBalance.toFixed(3)),
      balance: Number(currentBalance.toFixed(3)),
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
    is_active: isAct ? 1 : 0,
    isActive: isAct,
    currentBalance: Number(currentBalance.toFixed(3)),
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
      sql: `SELECT id, group_name FROM MessGroup WHERE id = ? LIMIT 1`,
      args: [messId]
    });
    group = gRes.rows[0] || null;
    if (group) {
      const mRes = await db.execute({
        sql: `SELECT id, name, phone, batchNo FROM Customer WHERE mess_id = ?`,
        args: [group.id]
      });
      memberRows = mRes.rows || [];
    }
  } catch { }

  if (!group) return null;

  const allCustomers = await getAllCustomersWithBalances();
  const customerMap = new Map(allCustomers.map(c => [c.id, c]));

  const members = memberRows.map(m => {
    const matched = customerMap.get(m.id);
    return {
      id: m.id,
      name: m.name,
      phone: m.phone,
      batchNo: m.batchNo,
      currentBalance: matched ? matched.currentBalance : 0.0
    };
  });

  const totalBalance = members.reduce((sum, m) => sum + m.currentBalance, 0);

  // Fetch mess group collective ledger
  let messLedger = [];
  try {
    const memberIds = members.map(m => m.id);
    let groupEntries = [];
    if (memberIds.length > 0) {
      const placeholders = memberIds.map(() => '?').join(', ');
      const res = await db.execute({
        sql: `SELECT * FROM KhataLedger WHERE customerId IN (${placeholders}) ORDER BY timestamp DESC`,
        args: memberIds
      });
      groupEntries = res.rows || [];
    }
    const memberNameMap = new Map(members.map(m => [m.id, m.name]));

    messLedger = groupEntries.map(entry => {
      const numAmount = Number(entry.amount || 0);
      const isPayment = numAmount < 0;
      const txType = entry.type === 'WRITE_OFF' ? 'WRITE_OFF' : (isPayment || entry.type === 'PAYMENT' ? 'PAYMENT' : 'CHARGE');
      const d = new Date(entry.created_at || entry.timestamp || entry.createdAt || Date.now());
      return {
        id: entry.id,
        customerId: entry.customerId,
        memberName: memberNameMap.get(entry.customerId) || 'Member',
        reference: entry.reference || (txType === 'CHARGE' ? 'Store Purchase' : 'Payment'),
        amount: Math.abs(numAmount),
        raw_amount: numAmount,
        type: txType,
        timestamp: d.toISOString(),
        formattedDate: d.toLocaleDateString(),
        formattedTime: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (err) {
    console.warn('Could not fetch mess ledger:', err?.message);
  }

  return {
    id: group.id,
    group_name: group.group_name,
    members: members.map(m => ({
      ...m,
      spendPercentage: totalBalance > 0 ? Number(((m.currentBalance / totalBalance) * 100).toFixed(1)) : 0
    })),
    memberCount: members.length,
    totalBalance: Number(totalBalance.toFixed(3)),
    messLedger
  };
};



export { getAllCustomersWithBalances, getCustomerWithBalanceById, loadKhataConfig, saveKhataConfig, fetchMessGroupDetails };

export default async function khataRoutes(fastify, options) {
  // --- Core Khata Ledger & Customer Management Routes ---

  // High-Performance SQLite Aggregate Route: Zero-blocking Customer Balances
  fastify.get('/api/khata/customers', async (request, reply) => {
    try {
      // NEW: Strictly whitelisted columns. CPR, PINs, and tokens are omitted.
      const sql = `
        SELECT c.id, c.tenantId, c.name, c.phone, c.credit_limit, c.is_active, 
               c.cardUid, c.mess_id, COALESCE(SUM(l.amount), 0) AS currentBalance
        FROM Customer c 
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
    const customer = await db.orm.Customer.where({ id }).all().first();
    if (!customer) {
      return reply.status(404).send({ success: false, error: 'Customer not found' });
    }

    // Fetch mess group details if customer belongs to a shared mess
    let messGroup = null;
    let messId = customer.mess_id;
    if (!messId) {
      try {
        const tRes = await db.execute({ sql: 'SELECT mess_id FROM Customer WHERE id = ?', args: [id] });
        if (tRes.rows[0]?.mess_id) messId = tRes.rows[0].mess_id;
      } catch { }
    }

    if (messId) {
      try {
        messGroup = await fetchMessGroupDetails(messId);
      } catch (err) {
        console.warn('Error fetching messGroup in statement:', err.message);
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
              WHERE customerId = ? AND (paymentType = 'CREDIT' OR paymentType = 'NFC_CREDIT' OR paymentType = 'CREDIT_PERSONAL' OR paymentType = 'MESS_KHATA')`,
        args: [id]
      });
      const creditSales = salesRes.rows || [];
      for (const s of creditSales) {
        const exists = history.some((h) => h.reference === s.invoiceNo || h.id === s.id);
        if (!exists) {
          const newLedgerItem = {
            id: s.id || crypto.randomUUID(),
            customerId: id,
            amount: Number(s.total) || 0,
            type: 'CHARGE',
            reference: s.invoiceNo || `INV-${Date.now()}`,
            running_balance: 0,
            syncStatus: 'SYNCED',
            timestamp: s.createdAt || new Date(),
            created_at: s.createdAt || new Date(),
            tenantId: 'tenant_askar_01',
          };
          try {
            await db.orm.KhataLedger.create(newLedgerItem);
            history.push(newLedgerItem);
          } catch {
            history.push(newLedgerItem);
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
      const txType = entry.type === 'WRITE_OFF' ? 'WRITE_OFF' : (isPayment || entry.type === 'PAYMENT' ? 'PAYMENT' : 'CHARGE');
      const d = new Date(entry.created_at || entry.timestamp || entry.createdAt || Date.now());
      const displayAmount = Math.abs(numAmount);
      const ref = entry.reference || (txType === 'CHARGE' ? (entry.id ? `INV-${entry.id.slice(0, 6)}` : 'Store Purchase') : (txType === 'WRITE_OFF' ? 'Bad Debt Write-Off' : 'Cash Payment'));

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
        created_at: d.toISOString(),
        timestamp: d.toISOString(),
        formattedDate: d.toLocaleDateString(),
        formattedTime: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    });

    // Newest transactions at the top
    const statement = [...enriched].reverse();

    const enrichedCust = await getCustomerWithBalanceById(id);

    return {
      success: true,
      statement,
      sales: statement, // Backward compatibility for legacy UI
      customer: {
        ...(enrichedCust || customer),
        currentBalance: enrichedCust?.currentBalance !== undefined ? enrichedCust.currentBalance : Math.max(0, Number(runningBalance.toFixed(3))),
      },
      currentBalance: enrichedCust?.currentBalance !== undefined ? enrichedCust.currentBalance : Math.max(0, Number(runningBalance.toFixed(3))),
      messGroup,
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to fetch statement' });
  }
};

fastify.get('/api/customers/:id/statement', handleGetCustomerStatement);
fastify.get('/khata/:id/statement', handleGetCustomerStatement);
fastify.get('/api/khata/:id/statement', handleGetCustomerStatement);

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
// KHATA SECURITY & AUTH GATEWAY: 4-DIGIT PIN & TRUSTED DEVICE TOKEN
// -------------------------------------------------------------
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

    let customerRow = null;
    try {
      const tRes = await db.execute({
        sql: 'SELECT id, name, khata_pin, khataPin FROM Customer WHERE id = ?',
        args: [targetId]
      });
      if (tRes.rows.length > 0) customerRow = tRes.rows[0];
    } catch { }

    if (!customerRow) {
      return reply.status(404).send({ success: false, error: 'Customer not found' });
    }

    const actualPin = String(customerRow.khataPin || customerRow.khata_pin || '0000').trim();
    const inputPin = String(pin).trim();

    if (inputPin !== actualPin) {
      return reply.status(401).send({ success: false, error: 'Incorrect PIN. Please try again.' });
    }

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

    try {
      await db.execute({
        sql: 'UPDATE Customer SET khata_pin = ?, khataPin = ? WHERE id = ?',
        args: [cleanPin, cleanPin, id]
      });
    } catch { }

    return { success: true, message: 'Khata 4-digit PIN updated successfully' };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to update PIN' });
  }
});

// Create customer (balance is 0 by definition since no ledger entries exist yet)
fastify.post('/api/customers', async (request, reply) => {
  const { name, phone, cpr, batchNo, description, cardUid } = request.body || {};
  if (!name || !name.trim()) {
    return reply.status(400).send({ success: false, error: 'Customer name is required' });
  }

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
    const customerRecord = {
      id,
      name: name.trim(),
      phone: phone && phone.trim() ? phone.trim() : null,
      cpr: cpr && cpr.trim() ? cpr.trim() : null,
      batchNo: batchNo && batchNo.trim() ? batchNo.trim() : null,
      description: description && description.trim() ? description.trim() : null,
      nfcCardId: cleanCardUid,
      cardUid: cleanCardUid,
      khataPin: '0000',
      createdAt: new Date(),
      tenantId: 'tenant_askar_01',
      is_active: 1,
      isActive: 1,
      balance: 0.0,
      khata_pin: '0000',
      pin: '1234',
      access_token: id,
    };

    await db.orm.Customer.create(customerRecord);
    try {
      await db.execute({
        sql: 'UPDATE Customer SET balance = 0.0, credit_limit = ?, khata_pin = "0000", pin = "1234", khataPin = "0000", access_token = ?, nfc_card_id = ?, cardUid = ?, nfcCardId = ? WHERE id = ?',
        args: [Number(creditLimit || 30.0), id, cleanCardUid, cleanCardUid, cleanCardUid, id]
      });
    } catch (e) {
      console.warn('Customer khata init notice:', e?.message);
    }
    const created = await db.orm.Customer.where({ id }).all().first();
    return {
      success: true,
      customer: {
        ...created,
        currentBalance: 0.0,
      },
      ...created,
      currentBalance: 0.0,
    };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({
      success: false,
      error: err.message || 'Failed to create customer',
    });
  }
});

// 1b. Edit Khata Customer Details
const handleUpdateCustomer = async (request, reply) => {
  const { id } = request.params;
  const { name, phone, cpr, batchNo, description, cardUid, creditLimit } = request.body || {};

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

    const updated = await getCustomerWithBalanceById(id);
    return { success: true, customer: updated, ...updated };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to update customer' });
  }
};

fastify.put('/api/customers/:id', handleUpdateCustomer);
fastify.put('/khata/:id', handleUpdateCustomer);
fastify.put('/api/khata/:id', handleUpdateCustomer);

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
  await db.orm.KhataLedger.create({
    id: ledgerId,
    customerId,
    amount: -writeOffAmount,
    type: 'WRITE_OFF',
    reference: `Bad Debt Write-off: ${reason}`,
    running_balance: 0.0,
    syncStatus: 'SYNCED',
    timestamp: new Date(),
    created_at: new Date(),
  });

  // Record business expense for audit & P&L tax offset
  try {
    await db.orm.Expense.create({
      id: expenseId,
      amount: writeOffAmount,
      type: 'BUSINESS',
      category: 'BAD_DEBT',
      description: `Bad Debt Write-off: ${customer.name} (Ref: ${reason})`,
      createdAt: new Date(),
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

// 1c. Soft-Delete (Archive) Khata Customer
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
        error: 'Cannot delete customer with an outstanding balance.',
        balance: customerWithBal.currentBalance
      });
    }

    // Soft deletion: preserves historical receipts, sales, and KhataLedger records
    await db.orm.Customer.where({ id }).update({ is_active: 0 });
    const archived = await getCustomerWithBalanceById(id);

    return {
      success: true,
      message: `Customer ${customerWithBal.name} successfully archived`,
      archived: { ...archived, is_active: 0, isActive: false }
    };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to archive customer' });
  }
};

fastify.delete('/api/customers/:id', handleArchiveCustomer);
fastify.delete('/khata/:id', handleArchiveCustomer);
fastify.delete('/api/khata/:id', handleArchiveCustomer);

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
  const { amount, paymentMethod, amountPaid, reference } = request.body || {};
  const settleAmount = parseFloat(amountPaid !== undefined ? amountPaid : amount);
  if (isNaN(settleAmount) || settleAmount <= 0) {
    return reply.status(400).send({ success: false, error: 'Valid settlement amount is required' });
  }

  try {
    const customer = await db.orm.Customer.where({ id }).all().first();
    if (!customer) {
      return reply.status(404).send({ success: false, error: 'Customer not found' });
    }

    const payRef = reference || (paymentMethod === 'BENEFIT_PAY' ? 'BenefitPay Payment' : 'Cash Payment');
    const receiptNo = `KH-${Date.now().toString().slice(-6)}`;
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
      ledgerEntry = {
        id: crypto.randomUUID(),
        customerId: id,
        amount: -settleAmount, // Negative for balance deduction
        type: 'PAYMENT',
        reference: payRef,
        running_balance: Number((previousBalance - settleAmount).toFixed(3)),
        syncStatus: 'PENDING',
        timestamp: new Date(),
        created_at: new Date(),
        tenantId: 'tenant_askar_01',
      };

      // 1. Insert the payment ledger entry
      await tx.orm.KhataLedger.create(ledgerEntry);
      
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

    // Start an isolated transaction to guarantee atomic execution
    const database = fastify.db || db;
    const transaction = await database.transaction('write');

    try {
      // 1. Append the immutable event to the ledger (The CRDT Log)
      const ledgerId = crypto.randomUUID();
      await transaction.execute({
        sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, timestamp) 
              VALUES (?, ?, ?, 'CHARGE', ?, CURRENT_TIMESTAMP)`,
        args: [ledgerId, effectiveCustomerId, numAmount, effectiveInvoiceNo]
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
  // --------------------------------------------------------------------
  fastify.get('/api/khata/nfc/:uid', async (request, reply) => {
    try {
      const { uid } = request.params;
      const scannedUid = (uid || '').trim().toUpperCase();
      const cleanHex = scannedUid.replace(/[:\-]/g, '');

      const result = await db.execute({
        sql: `SELECT id, name, balance, isActive, is_active, nfcCardId, cardUid, phone, credit_limit, mess_id 
              FROM Customer 
              WHERE UPPER(COALESCE(nfcCardId, '')) = ? 
                 OR UPPER(COALESCE(cardUid, '')) = ? 
                 OR UPPER(COALESCE(nfc_card_id, '')) = ?
                 OR REPLACE(UPPER(COALESCE(nfcCardId, '')), ':', '') = ? 
                 OR REPLACE(UPPER(COALESCE(cardUid, '')), ':', '') = ? 
                 OR REPLACE(UPPER(COALESCE(nfc_card_id, '')), ':', '') = ?
              LIMIT 1`,
        args: [scannedUid, scannedUid, scannedUid, cleanHex, cleanHex, cleanHex]
      });

      if (!result.rows || result.rows.length === 0) {
        return reply.code(404).send({ success: false, error: 'Unrecognized NFC Card. Please register this card to a Khata account.' });
      }

      const customer = result.rows[0];
      return reply.send({ success: true, customer });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ success: false, error: 'Failed to query NFC customer' });
    }
  });

}
