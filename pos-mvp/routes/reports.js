import crypto from 'crypto';
import { db } from '../db.js';
import { managerAuth } from '../middleware/auth.js';
import { SaleRepository } from '../repositories/SaleRepository.js';
import { 
  getRegionalPeriodRange, 
  getRegionalDayRange, 
  getRegionalIsoString, 
  getRegionalFormattedDate, 
  getRegionalFormattedTime, 
  REGIONAL_TIMEZONE 
} from '../utils/time.js';

export default async function reportRoutes(fastify, options) {

  // --- Financial & Tax Reporting Engine ---
// --- DATE RANGE FINANCIAL REPORTING ENGINE ---
// Resolves the critical "Final Day Midnight" bug by explicitly setting endDate to 23:59:59.999
const getFinancialReportData = async (query = {}) => {
  const { startDate, endDate, period } = query;
  const { startIso, endIso, startDateStr, endDateStr } = getRegionalPeriodRange(period, startDate, endDate);

  // NEW: Optimized SQL Date-Range Fetch
  let allSales = [];
  let allSaleItems = [];

  try {
    const salesResult = await db.execute({
      sql: `SELECT * FROM Sale 
            WHERE ((createdAt BETWEEN ? AND ?) OR (datetime(createdAt) BETWEEN datetime(?) AND datetime(?))) 
              AND (status IS NULL OR status NOT IN ('VOIDED', 'CANCELLED')) 
            ORDER BY createdAt ASC`,
      args: [startIso, endIso, startIso, endIso]
    });
    allSales = salesResult.rows || [];

    // Fetch only the line items that belong to these specific sales
    const itemsResult = await db.execute({
      sql: `SELECT i.* FROM SaleItem i 
            JOIN Sale s ON i.saleId = s.id 
            WHERE ((s.createdAt BETWEEN ? AND ?) OR (datetime(s.createdAt) BETWEEN datetime(?) AND datetime(?))) 
              AND (s.status IS NULL OR s.status NOT IN ('VOIDED', 'CANCELLED'))`,
      args: [startIso, endIso, startIso, endIso]
    });
    allSaleItems = itemsResult.rows || [];
  } catch (err) {
    fastify.log.error('Failed to fetch optimized reports:', err);
  }

  const saleItemMap = new Map();
  allSaleItems.forEach((it) => {
    if (!saleItemMap.has(it.saleId)) saleItemMap.set(it.saleId, []);
    saleItemMap.get(it.saleId).push(it);
  });

  const filteredSales = allSales;

  let totalRevenue = 0;
  let totalVat = 0;
  let totalCost = 0;
  let standardRatedSales = 0;
  let zeroRatedSales = 0;
  const paymentBreakdown = {
    CASH: 0,
    BENEFIT_PAY: 0,
    CARD: 0,
    CREDIT: 0
  };

  filteredSales.forEach((sale) => {
    const saleAmount = Number(sale.total ?? sale.totalAmount ?? 0);
    const saleVat = Number(sale.vatTotal ?? sale.totalVat ?? 0);
    totalRevenue += saleAmount;
    totalVat += saleVat;

    const rawPType = String(sale.paymentType || sale.paymentMethod || 'CASH').toUpperCase();
    let pType = 'CASH';
    if (['CREDIT', 'NFC_CREDIT', 'MESS_KHATA', 'KHATA', 'KHATA_CREDIT', 'CREDIT_PERSONAL', 'CREDIT_MESS'].includes(rawPType)) {
      pType = 'CREDIT';
    } else if (['CARD', 'DEBIT_CARD', 'CREDIT_CARD'].includes(rawPType)) {
      pType = 'CARD';
    } else if (['BENEFIT_PAY', 'BENEFITPAY', 'BENEFIT'].includes(rawPType)) {
      pType = 'BENEFIT_PAY';
    } else if (rawPType === 'CASH') {
      pType = 'CASH';
    }

    if (paymentBreakdown[pType] !== undefined) {
      paymentBreakdown[pType] += saleAmount;
    } else {
      paymentBreakdown.CASH += saleAmount;
    }

    const items = saleItemMap.get(sale.id) || [];
    if (items.length > 0) {
      items.forEach((it) => {
        const itemQty = Number(it.quantity) || 1;
        const itemPrice = Number(it.priceAtSale) || 0;
        const itemCost = Number(it.costAtSale || it.unitCost || 0);
        const itemTax = Number(it.vatAmount || 0);
        totalCost += itemCost * itemQty;
        if (it.vatRateAtSale === 0 || it.vatRate === 0) {
          zeroRatedSales += itemPrice * itemQty;
        } else {
          standardRatedSales += (itemPrice * itemQty) - itemTax;
        }
      });
    } else {
      if (saleVat > 0) {
        standardRatedSales += (saleAmount - saleVat);
      } else {
        zeroRatedSales += saleAmount;
      }
    }
  });

  const totalNet = totalRevenue - totalVat;
  const grossProfit = totalNet - totalCost;

  return {
    success: true,
    dateRange: {
      startDate: startDateStr,
      endDate: endDateStr,
      startBoundary: startIso,
      endBoundary: endIso,
      inclusiveEndDay: true,
    },
    transactionCount: filteredSales.length,
    totalRevenue: Number(totalRevenue.toFixed(3)),
    totalVat: Number(totalVat.toFixed(3)),
    totalNet: Number(totalNet.toFixed(3)),
    cogs: Number(totalCost.toFixed(3)),
    grossProfit: Number(grossProfit.toFixed(3)),
    profitMargin: totalNet > 0 ? `${((grossProfit / totalNet) * 100).toFixed(1)}%` : '0%',
    averageTicket: filteredSales.length > 0 ? Number((totalRevenue / filteredSales.length).toFixed(3)) : 0,
    nbrVatMetrics: {
      standardRatedNet: Number(standardRatedSales.toFixed(3)),
      outputVatCollected: Number(totalVat.toFixed(3)),
      zeroRatedSales: Number(zeroRatedSales.toFixed(3)),
      totalSupplies: Number(totalRevenue.toFixed(3)),
    },
    paymentBreakdown: {
      CASH: Number(paymentBreakdown.CASH.toFixed(3)),
      BENEFIT_PAY: Number(paymentBreakdown.BENEFIT_PAY.toFixed(3)),
      CARD: Number(paymentBreakdown.CARD.toFixed(3)),
      CREDIT: Number(paymentBreakdown.CREDIT.toFixed(3)),
    },
    sales: filteredSales.map((s) => ({
      id: s.id,
      invoiceNo: s.invoiceNo,
      createdAt: s.createdAt,
      total_amount: Number(s.total ?? s.totalAmount ?? 0),
      vat_amount: Number(s.vatTotal ?? s.totalVat ?? 0),
      net_amount: Number((s.total ?? s.totalAmount ?? 0) - (s.vatTotal ?? s.totalVat ?? 0)),
      paymentType: s.paymentType,
      status: s.status,
    }))
  };
};

// Route 1: /reports/financial (Standard Postman & Accounting Route)
fastify.get('/reports/financial', { preHandler: managerAuth }, async (request) => {
  return await getFinancialReportData(request.query);
});

// Route 2: /api/reports/financial (ERP Namespace Alias)
fastify.get('/api/reports/financial', { preHandler: managerAuth }, async (request) => {
  return await getFinancialReportData(request.query);
});

// (Note: /api/reports/sales is now served modularly via routes/sales.js)

// 4. Financial Reporting Route for the Back-Office Manager
fastify.get('/api/reports/financials', { preHandler: managerAuth }, async (request) => {
  const { period, startDate: queryStartDate, endDate: queryEndDate } = request.query || {};
  if (queryStartDate && queryEndDate) {
    return await getFinancialReportData(request.query);
  }

  const { startIso, endIso } = getRegionalPeriodRange(period || 'day', queryStartDate, queryEndDate);
  const sales = await SaleRepository.getSalesByDateRange(startIso, endIso);

  let totalRevenue = 0;
  let totalCost = 0;
  let netProfit = 0;

  sales.forEach((sale) => {
    const saleTot = Number(sale.total ?? sale.totalAmount ?? 0);
    totalRevenue += saleTot;

    let saleCost = 0;
    (sale.items || []).forEach((item) => {
      const qty = Number(item.quantity) || 1;
      const itemCost = Number(item.costAtSale || item.unitCost || 0) * qty;
      const itemRevenue = Number(item.priceAtSale || item.sellingPrice || 0) * qty;
      saleCost += itemCost;
      totalCost += itemCost;
      netProfit += (itemRevenue - itemCost);
    });

    if (saleCost === 0 && saleTot > 0 && (sale.items || []).length === 0) {
      // Fallback for sales where line items were not joined
      const estCost = saleTot * 0.78;
      totalCost += estCost;
      netProfit += (saleTot - estCost);
    }
  });

  // Fetch business expenses for this period to calculate actual net profit
  try {
    const expRes = await db.execute({
      sql: `SELECT amount FROM Expense WHERE createdAt >= ? AND createdAt <= ? AND (type IS NULL OR type != 'PERSONAL')`,
      args: [startIso, endIso]
    });
    (expRes.rows || []).forEach((e) => {
      netProfit = Math.max(0, netProfit - Number(e.amount || 0));
    });
  } catch (expErr) {
    fastify.log.warn('Financials expense fetch notice:', expErr);
  }

  const p = (period || 'day').toLowerCase();
  const marginRatio = totalRevenue > 0 ? (netProfit / totalRevenue) : 0.22;
  let chartData = [];

  if (p === 'day' || p === 'today') {
    const daySlots = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
    const slotMap = {};
    daySlots.forEach(s => { slotMap[s] = 0; });

    sales.forEach((s) => {
      const hStr = new Date(s.createdAt).toLocaleTimeString('en-US', { timeZone: REGIONAL_TIMEZONE, hour: '2-digit', hour12: false });
      const h = parseInt(hStr, 10) || 0;
      let slot = '08:00';
      if (h >= 22) slot = '22:00';
      else if (h >= 20) slot = '20:00';
      else if (h >= 18) slot = '18:00';
      else if (h >= 16) slot = '16:00';
      else if (h >= 14) slot = '14:00';
      else if (h >= 12) slot = '12:00';
      else if (h >= 10) slot = '10:00';
      slotMap[slot] += Number(s.total ?? s.totalAmount ?? 0) * marginRatio;
    });

    chartData = daySlots.map(name => ({
      name,
      profit: Number((slotMap[name] || 0).toFixed(3))
    }));
  } else if (p === 'year') {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthMap = {};
    months.forEach(m => { monthMap[m] = 0; });

    sales.forEach((s) => {
      const m = new Date(s.createdAt).getMonth();
      const mName = months[m] || 'Jan';
      monthMap[mName] += Number(s.total ?? s.totalAmount ?? 0) * marginRatio;
    });

    chartData = months.map(name => ({
      name,
      profit: Number((monthMap[name] || 0).toFixed(3))
    }));
  } else {
    // Default: month -> Week 1 to Week 5
    const weekSlots = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];
    const weekMap = {};
    weekSlots.forEach(w => { weekMap[w] = 0; });

    sales.forEach((s) => {
      const day = new Date(s.createdAt).getDate();
      let slot = 'Week 1';
      if (day > 28) slot = 'Week 5';
      else if (day > 21) slot = 'Week 4';
      else if (day > 14) slot = 'Week 3';
      else if (day > 7) slot = 'Week 2';
      weekMap[slot] += Number(s.total ?? s.totalAmount ?? 0) * marginRatio;
    });

    chartData = weekSlots.map(name => ({
      name,
      profit: Number((weekMap[name] || 0).toFixed(3))
    }));
  }

  return {
    period: p,
    transactions: sales.length,
    metrics: {
      revenue: totalRevenue.toFixed(3),
      cogs: totalCost.toFixed(3),
      netProfit: netProfit.toFixed(3),
      profitMargin: totalRevenue > 0 ? `${((netProfit / totalRevenue) * 100).toFixed(1)}%` : '0%',
    },
    chartData,
  };
});

// --- EXPENSES & P&L (PROFIT & LOSS) ENGINE ---

// Record Cash-Out / Expense (Shop bills, rent, owner draws) - Protected by Manager Auth
fastify.post('/api/expenses', { preHandler: managerAuth }, async (request, reply) => {
  const { type, category, amount, description, recordedBy } = request.body || {};
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return reply.status(400).send({ error: 'Valid expense amount is required' });
  }

  const newExpense = {
    id: crypto.randomUUID(),
    type: type === 'PERSONAL' ? 'PERSONAL' : 'BUSINESS',
    category: category || 'MISC',
    amount: Number(numAmount.toFixed(3)),
    description: description ? String(description).trim() : null,
    recordedBy: recordedBy || 'Admin',
    createdAt: new Date(),
  };

  try {
    await db.orm.Expense.create(newExpense);
    return reply.send({ success: true, expense: newExpense, message: 'Expense recorded safely.' });
  } catch (error) {
    request.log.error(error, 'Failed to record expense');
    return reply.code(500).send({ error: 'Database error', details: error.message });
  }
});

// List all expenses - Protected by Manager Auth
fastify.get('/api/expenses', { preHandler: managerAuth }, async (request, reply) => {
  try {
    const { type, limit } = request.query || {};
    let all = await db.orm.Expense.all();
    if (type) {
      all = all.filter((e) => e.type === type);
    }
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (limit) {
      all = all.slice(0, parseInt(limit, 10));
    }
    return { success: true, expenses: all };
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to fetch expenses' });
  }
});

// Calculate Comprehensive Profit & Loss (P&L) Statement
fastify.get('/api/reports/pnl', { preHandler: managerAuth }, async (request, reply) => {
  try {
    const { period } = request.query || {};
    let startOfPeriod = new Date();

    if (period === 'day') {
      startOfPeriod.setHours(0, 0, 0, 0);
    } else if (period === 'year') {
      startOfPeriod = new Date(startOfPeriod.getFullYear(), 0, 1);
    } else if (period === 'all') {
      startOfPeriod = new Date(0);
    } else {
      // Default: current month
      startOfPeriod.setDate(1);
      startOfPeriod.setHours(0, 0, 0, 0);
    }

    // 1. Calculate Total Revenue & COGS from Sales
    const sales = await SaleRepository.getSalesByDateRange(startOfPeriod);

    let totalRevenue = 0;
    let totalCogs = 0; // Cost of Goods Sold

    sales.forEach((sale) => {
      totalRevenue += Number(sale.total) || 0;
      (sale.items || []).forEach((item) => {
        const qty = Number(item.quantity) || 1;
        const unitCost = Number(item.costAtSale ?? item.purchasePriceAtSale ?? 0);
        totalCogs += (qty * unitCost);
      });
    });

    const grossProfit = totalRevenue - totalCogs;

    // 2. Fetch all expenses for the period
    let allExpenses = [];
    try {
      allExpenses = await db.orm.Expense.all();
    } catch (e) {
      allExpenses = [];
    }

    const filteredExpenses = allExpenses.filter((exp) => new Date(exp.createdAt) >= startOfPeriod);

    let businessExpenses = 0;
    let personalWithdrawals = 0;

    filteredExpenses.forEach((exp) => {
      const amt = Number(exp.amount) || 0;
      if (exp.type === 'BUSINESS') businessExpenses += amt;
      if (exp.type === 'PERSONAL') personalWithdrawals += amt;
    });

    // 3. Final Net Profit Calculation
    const operatingProfit = grossProfit - businessExpenses;
    const netRetainedCash = operatingProfit - personalWithdrawals;

    return {
      success: true,
      period: period || 'month',
      data: {
        totalRevenue: Number(totalRevenue.toFixed(3)),
        totalCogs: Number(totalCogs.toFixed(3)),
        grossProfit: Number(grossProfit.toFixed(3)),
        businessExpenses: Number(businessExpenses.toFixed(3)),
        operatingProfit: Number(operatingProfit.toFixed(3)),
        personalWithdrawals: Number(personalWithdrawals.toFixed(3)),
        netRetainedCash: Number(netRetainedCash.toFixed(3)),
        expensesCount: filteredExpenses.length,
        recentExpenses: filteredExpenses
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 20),
      },
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to generate P&L' });
  }
});

// 4. Bahrain NBR Quarterly VAT Return Report (Output VAT vs Input VAT)
fastify.get('/api/reports/vat-return', { preHandler: managerAuth }, async (request, reply) => {
  const { startDate, endDate } = request.query || {};

  try {
    const { startIso, endIso } = getRegionalPeriodRange('quarter', startDate, endDate);
    const start = new Date(startIso);
    const end = new Date(endIso);

    // 1. Calculate Output VAT (Tax collected from customers - strictly excluding VOIDED sales)
    const salesRes = await db.execute({
      sql: `SELECT * FROM Sale 
            WHERE ((createdAt BETWEEN ? AND ?) OR (datetime(createdAt) BETWEEN datetime(?) AND datetime(?))) 
              AND (status IS NULL OR status NOT IN ('VOIDED', 'CANCELLED')) 
            ORDER BY createdAt ASC`,
      args: [startIso, endIso, startIso, endIso]
    });
    const salesInPeriod = salesRes.rows || [];

    const itemsRes = await db.execute({
      sql: `SELECT i.* FROM SaleItem i 
            JOIN Sale s ON i.saleId = s.id 
            WHERE ((s.createdAt BETWEEN ? AND ?) OR (datetime(s.createdAt) BETWEEN datetime(?) AND datetime(?))) 
              AND (s.status IS NULL OR s.status NOT IN ('VOIDED', 'CANCELLED'))`,
      args: [startIso, endIso, startIso, endIso]
    });
    const saleItemMap = new Map();
    (itemsRes.rows || []).forEach((it) => {
      if (!saleItemMap.has(it.saleId)) saleItemMap.set(it.saleId, []);
      saleItemMap.get(it.saleId).push(it);
    });

    let outputVat = 0;
    let standardRatedSales = 0;
    let zeroRatedSales = 0;

    salesInPeriod.forEach((s) => {
      const items = saleItemMap.get(s.id) || [];
      if (items.length > 0) {
        items.forEach((it) => {
          const itemTax = Number(it.vatAmount || 0);
          const itemTotal = (Number(it.priceAtSale) || 0) * (Number(it.quantity) || 1);
          outputVat += itemTax;
          if (it.vatRateAtSale === 0) {
            zeroRatedSales += itemTotal;
          } else {
            standardRatedSales += (itemTotal - itemTax);
          }
        });
      } else {
        const vatVal = Number(s.totalVat ?? s.vatTotal ?? 0);
        outputVat += vatVal;
        standardRatedSales += (Number(s.subtotal ?? (s.total - vatVal)) || 0);
      }
    });

    // 2. Calculate Input VAT (Tax paid on Business Expenses & Purchase Orders)
    let allExpenses = [];
    try {
      allExpenses = await db.orm.Expense.all();
    } catch {
      allExpenses = [];
    }

    const businessExpenses = allExpenses.filter((e) => {
      const d = new Date(e.createdAt);
      return d >= start && d <= end && e.type === 'BUSINESS';
    });

    const inputVatExpenses = businessExpenses.reduce((sum, e) => sum + (Number(e.vatPaid || 0)), 0);

    let allPOs = [];
    try {
      allPOs = await db.orm.PurchaseOrder.all();
    } catch {
      allPOs = [];
    }

    const validPOs = allPOs.filter((po) => {
      const d = new Date(po.createdAt);
      return d >= start && d <= end && (po.status === 'RECEIVED' || po.status === 'APPROVED');
    });

    const inputVatPOs = validPOs.reduce((sum, po) => sum + (Number(po.vatPaid || 0)), 0);

    const inputVatTotal = Number((inputVatExpenses + inputVatPOs).toFixed(3));
    const outputVatTotal = Number(outputVat.toFixed(3));
    const netVatPayable = Number((outputVatTotal - inputVatTotal).toFixed(3));

    return {
      success: true,
      vatAccountNumber: '200012345678901', // Client's Bahrain NBR VAT Account Number
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
      totalTaxableSales: Number((standardRatedSales + zeroRatedSales).toFixed(3)),
      standardRatedSales: Number(standardRatedSales.toFixed(3)),
      zeroRatedSales: Number(zeroRatedSales.toFixed(3)),
      outputVatCollected: outputVatTotal,
      inputVatPaid: inputVatTotal,
      netVatDueToNBR: netVatPayable,
      breakdown: {
        salesCount: salesInPeriod.length,
        businessExpensesCount: businessExpenses.length,
        purchaseOrdersCount: validPOs.length,
        inputVatFromExpenses: Number(inputVatExpenses.toFixed(3)),
        inputVatFromPurchaseOrders: Number(inputVatPOs.toFixed(3)),
      }
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to generate VAT return', details: error.message });
  }
});


  // --- Unified General Ledger Command Center ---
// --- UNIFIED GENERAL LEDGER (COMMAND CENTER) ---
fastify.get('/api/reports/unified', { preHandler: managerAuth }, async (request, reply) => {
  const { range, customDate, startDate: qStartDate, endDate: qEndDate } = request.query || {};
  const selectedRange = String(range || 'TODAY').toUpperCase();

  const startParam = qStartDate || (selectedRange === 'CUSTOM' ? customDate : undefined);
  const endParam = qEndDate || (selectedRange === 'CUSTOM' ? customDate : undefined);
  const { startIso, endIso } = getRegionalPeriodRange(selectedRange, startParam, endParam);

  try {
    // 🟢 High-Performance Parameterized SQL Queries (Zero full-table in-memory leaks)
    const salesRes = await db.execute({
      sql: `SELECT id, invoiceNo, total, paymentType, createdAt FROM Sale 
            WHERE ((createdAt BETWEEN ? AND ?) OR (datetime(createdAt) BETWEEN datetime(?) AND datetime(?)))
              AND (status IS NULL OR status NOT IN ('VOIDED', 'CANCELLED'))`,
      args: [startIso, endIso, startIso, endIso]
    });
    const allSales = salesRes.rows || [];

    const expensesRes = await db.execute({
      sql: `SELECT id, category, description, amount, type, createdAt FROM Expense 
            WHERE (createdAt BETWEEN ? AND ?) OR (datetime(createdAt) BETWEEN datetime(?) AND datetime(?))`,
      args: [startIso, endIso, startIso, endIso]
    });
    const allExpenses = expensesRes.rows || [];

    const khataRes = await db.execute({
      sql: `SELECT k.id, k.customerId, k.amount, k.type, k.timestamp, c.name as customerName 
            FROM KhataLedger k 
            LEFT JOIN Customer c ON k.customerId = c.id
            WHERE ((k.timestamp BETWEEN ? AND ?) OR (datetime(k.timestamp) BETWEEN datetime(?) AND datetime(?)))
              AND (k.type IN ('PAYMENT', 'PAYMENT_IN') OR k.amount < 0)
              AND (COALESCE(k.reference, '') NOT LIKE 'VOID Reversal%' AND COALESCE(k.reference, '') NOT LIKE 'Refund Credit Note%' AND COALESCE(k.reference, '') NOT LIKE 'Mess Equal Split Rebalance%')`,
      args: [startIso, endIso, startIso, endIso]
    });
    const allKhata = khataRes.rows || [];

    const wastageRes = await db.execute({
      sql: `SELECT id, productName, quantity, reason, totalLoss, createdAt FROM WastageLog 
            WHERE (createdAt BETWEEN ? AND ?) OR (datetime(createdAt) BETWEEN datetime(?) AND datetime(?))`,
      args: [startIso, endIso, startIso, endIso]
    });
    const allWastage = wastageRes.rows || [];

    const unifiedList = [];
    let totalSales = 0;
    let totalImmediateCashIn = 0;
    let totalExpenses = 0;
    let totalKhataCollected = 0;
    let totalWastageLoss = 0;

    // Process Sales
    allSales.forEach((sale) => {
      const amt = Number(sale.total) || 0;
      const isNegative = amt < 0;
      if (isNegative) {
        totalExpenses += Math.abs(amt);
      } else {
        totalSales += amt;
        const rawPt = String(sale.paymentType || '').toUpperCase();
        const isCreditSale = ['CREDIT', 'NFC_CREDIT', 'MESS_KHATA', 'KHATA', 'KHATA_CREDIT'].includes(rawPt);
        if (!isCreditSale) {
          totalImmediateCashIn += amt;
        }
      }

      const pType = sale.paymentType ? ` (${sale.paymentType})` : '';
      unifiedList.push({
        id: `sale-${sale.id}`,
        rawDate: sale.createdAt,
        time: new Date(sale.createdAt).toLocaleTimeString('en-US', { timeZone: REGIONAL_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: true }),
        dateStr: new Date(sale.createdAt).toLocaleDateString('en-GB', { timeZone: REGIONAL_TIMEZONE }),
        type: isNegative ? 'REFUND' : 'SALE',
        desc: `Invoice #${sale.invoiceNo}${pType}`,
        amount: Math.abs(amt),
        direction: isNegative ? 'OUT' : 'IN',
      });
    });

    // Process Expenses & Owner Draws
    allExpenses.forEach((exp) => {
      const amt = Number(exp.amount) || 0;
      totalExpenses += amt;

      const typeLabel = exp.type === 'PERSONAL' ? ' [Personal Draw]' : '';
      unifiedList.push({
        id: `exp-${exp.id}`,
        rawDate: exp.createdAt,
        time: new Date(exp.createdAt).toLocaleTimeString('en-US', { timeZone: REGIONAL_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: true }),
        dateStr: new Date(exp.createdAt).toLocaleDateString('en-GB', { timeZone: REGIONAL_TIMEZONE }),
        type: 'EXPENSE',
        desc: `${exp.category}${exp.description ? ` - ${exp.description}` : ''}${typeLabel}`,
        amount: amt,
        direction: 'OUT',
      });
    });

    // Process Khata Payments (Debt Collections)
    allKhata.forEach((entry) => {
      const amt = Math.abs(Number(entry.amount) || 0);
      totalKhataCollected += amt;
      const custName = entry.customerName || 'Credit Customer';

      unifiedList.push({
        id: `khata-${entry.id}`,
        rawDate: entry.timestamp,
        time: new Date(entry.timestamp).toLocaleTimeString('en-US', { timeZone: REGIONAL_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: true }),
        dateStr: new Date(entry.timestamp).toLocaleDateString('en-GB', { timeZone: REGIONAL_TIMEZONE }),
        type: 'KHATA_PAYMENT',
        desc: `${custName} - Debt Settle`,
        amount: amt,
        direction: 'IN',
      });
    });

    // Process Wastage & Write-offs (Loss of dead/expired goods)
    allWastage.forEach((w) => {
      const loss = Number(w.totalLoss) || 0;
      totalWastageLoss += loss;

      unifiedList.push({
        id: `wastage-${w.id}`,
        rawDate: w.createdAt,
        time: new Date(w.createdAt).toLocaleTimeString('en-US', { timeZone: REGIONAL_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: true }),
        dateStr: new Date(w.createdAt).toLocaleDateString('en-GB', { timeZone: REGIONAL_TIMEZONE }),
        type: 'WASTAGE',
        desc: `Write-Off: ${w.quantity}x ${w.productName} [${w.reason}]`,
        amount: loss,
        direction: 'OUT',
      });
    });

    // Sort chronologically descending (newest first)
    unifiedList.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());

    const grossProfit = Math.max(0, totalSales - totalWastageLoss);
    const netCash = (totalImmediateCashIn + totalKhataCollected) - totalExpenses;

    return {
      success: true,
      range: selectedRange,
      kpis: {
        sales: Number(totalSales.toFixed(3)),
        expenses: Number(totalExpenses.toFixed(3)),
        khataCollected: Number(totalKhataCollected.toFixed(3)),
        wastageLoss: Number(totalWastageLoss.toFixed(3)),
        grossProfit: Number(grossProfit.toFixed(3)),
        netCash: Number(netCash.toFixed(3)),
      },
      transactions: unifiedList,
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Failed to generate unified ledger report', details: error.message });
  }
});

// 5. High-Performance Unified Cash Flow Endpoint (Single Database Engine UNION ALL) - Protected by Manager Auth
fastify.get('/api/reports/unified-cashflow', { preHandler: managerAuth }, async (request, reply) => {
  try {
    const start = request.query.startDate || new Date(0).toISOString();
    const end = request.query.endDate || new Date().toISOString();

    // Execute a single, highly optimized UNION ALL directly on the database engine
    const unifiedRes = await db.execute({
      sql: `SELECT 'SALE' as type, id, total as amount, paymentType, createdAt FROM Sale 
            WHERE createdAt BETWEEN ? AND ? AND (status IS NULL OR status NOT IN ('VOIDED', 'CANCELLED'))
            UNION ALL
            SELECT 'EXPENSE' as type, id, -amount as amount, category as paymentType, createdAt FROM Expense 
            WHERE createdAt BETWEEN ? AND ?
            UNION ALL
            SELECT 'KHATA_PAYMENT' as type, id, ABS(amount) as amount, 'KHATA' as paymentType, timestamp as createdAt FROM KhataLedger 
            WHERE timestamp BETWEEN ? AND ? 
              AND (type IN ('PAYMENT', 'PAYMENT_IN') OR amount < 0)
              AND (COALESCE(reference, '') NOT LIKE 'VOID Reversal%' AND COALESCE(reference, '') NOT LIKE 'Refund Credit Note%' AND COALESCE(reference, '') NOT LIKE 'Mess Equal Split Rebalance%')
            ORDER BY createdAt DESC`,
      args: [start, end, start, end, start, end]
    });

    return { success: true, ledger: unifiedRes.rows || [] };
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to generate unified ledger' });
  }
});

}
