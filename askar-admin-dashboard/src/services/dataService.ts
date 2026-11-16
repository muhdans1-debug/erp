import { createClient } from '@libsql/client/web';
import { getAdminPin } from '../utils/auth.js';

const TURSO_URL = 'libsql://askar-pos-primary-muhdans1.aws-ap-south-1.turso.io';
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTM5MDgyNDAsImlkIjoiMDFhMTg0YjgtMjIwMS03YzJhLThlY2EtZDVkNDcyZjkxZGRlIiwia2lkIjoiQ0cxaFB3c3d5VWgwUlE5dzNZRDZRRmxuYk9rWUNCYklfVWJkSEhXS1hNNCIsInJpZCI6Ijk3MzEwYzA5LTMxYjUtNDNkNi1hY2ViLWNmYWY1MTIzZDRkNSJ9.U5P8GYK31KnUbgtrdvNKwau-ARB17g-Zk3PFBkz_Olu3DV5QQaFFTwbylLPV_LZMDwzwwJr-2lOelcD3IWyjAg';

export const turso = createClient({
  url: TURSO_URL,
  authToken: TURSO_TOKEN,
});

const REGIONAL_TIMEZONE = 'Asia/Bahrain';

export function getBahrainDateParts(d = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: REGIONAL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts: Record<string, string> = {};
  formatter.formatToParts(d).forEach(p => { parts[p.type] = p.value; });
  let hour = parts.hour || '00';
  if (hour === '24') hour = '00';
  return {
    year: parts.year || '2026',
    month: parts.month || '11',
    day: parts.day || '15',
    hour,
    minute: parts.minute || '00',
    second: parts.second || '00',
    dateOnly: `${parts.year || '2026'}-${parts.month || '11'}-${parts.day || '15'}`
  };
}

export function getPeriodIsoRange(period: string, startDate?: string, endDate?: string) {
  const now = new Date();
  const bp = getBahrainDateParts(now);
  const p = (period || 'day').toUpperCase();

  if (p === 'CUSTOM' && startDate && endDate) {
    const sTrim = String(startDate).trim();
    const eTrim = String(endDate).trim();
    return {
      startIso: sTrim.length === 10 ? `${sTrim}T00:00:00.000+03:00` : sTrim,
      endIso: eTrim.length === 10 ? `${eTrim}T23:59:59.999+03:00` : eTrim
    };
  }
  if (p === 'DAY' || p === 'TODAY') {
    return {
      startIso: `${bp.dateOnly}T00:00:00.000+03:00`,
      endIso: `${bp.dateOnly}T23:59:59.999+03:00`
    };
  }
  if (p === 'YESTERDAY') {
    const yDate = new Date(now.getTime() - 24 * 3600 * 1000);
    const yp = getBahrainDateParts(yDate);
    return {
      startIso: `${yp.dateOnly}T00:00:00.000+03:00`,
      endIso: `${yp.dateOnly}T23:59:59.999+03:00`
    };
  }
  if (p === 'WEEK') {
    const wDate = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const wp = getBahrainDateParts(wDate);
    return {
      startIso: `${wp.dateOnly}T00:00:00.000+03:00`,
      endIso: `${bp.dateOnly}T23:59:59.999+03:00`
    };
  }
  if (p === 'MONTH') {
    return {
      startIso: `${bp.year}-${bp.month}-01T00:00:00.000+03:00`,
      endIso: `${bp.dateOnly}T23:59:59.999+03:00`
    };
  }
  if (p === 'YEAR') {
    return {
      startIso: `${bp.year}-01-01T00:00:00.000+03:00`,
      endIso: `${bp.dateOnly}T23:59:59.999+03:00`
    };
  }
  return {
    startIso: '1970-01-01T00:00:00.000+03:00',
    endIso: `${bp.dateOnly}T23:59:59.999+03:00`
  };
}

/**
 * Universal Resilient Data Service for Askar Admin Command
 * Provides instant Turso Cloud Database fallback when Cloudflare Edge API is rate-limited (HTTP 429) or offline.
 */

export async function fetchCatalogProducts(apiBase: string): Promise<any[]> {
  try {
    const res = await fetch(`${apiBase}/api/products`, {
      signal: AbortSignal.timeout(2500)
    });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.data || data?.products || []);
      if (list.length > 0) return list;
    }
  } catch (err) {
    console.warn('API /api/products unreachable or throttled, querying Turso Cloud direct:', err);
  }

  // ⚡ Sovereign Turso Direct Fallback: 100% online direct connection to AWS ap-south-1
  try {
    const rs = await turso.execute(`
      SELECT id, barcode, name, name_ar, plu_code, image_url, sellingPrice, purchasePrice, unitCost, stockQuantity, 
             minThreshold, maxThreshold, distributorId, vatRate, taxRate, category, 
             is_weighed_item, updatedAt 
      FROM Product 
      ORDER BY name ASC
    `);
    return rs.rows.map(r => ({
      ...r,
      sellingPrice: Number(r.sellingPrice || 0),
      purchasePrice: Number(r.purchasePrice || r.unitCost || 0),
      stockQuantity: Number(r.stockQuantity || 0),
      minThreshold: Number(r.minThreshold || 10),
      maxThreshold: Number(r.maxThreshold || 100),
      is_weighed_item: Boolean(r.is_weighed_item)
    }));
  } catch (dbErr) {
    console.error('Turso catalog fetch error:', dbErr);
    return [];
  }
}

export async function fetchDistributorsList(apiBase: string): Promise<any[]> {
  try {
    const res = await fetch(`${apiBase}/api/distributors`, {
      signal: AbortSignal.timeout(2500)
    });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.distributors || data?.data || []);
      if (list.length > 0) return list;
    }
  } catch (err) {
    console.warn('API /api/distributors notice:', err);
  }

  try {
    const rs = await turso.execute('SELECT id, name, contactPhone, contactEmail, minimumOrderValue FROM Distributor ORDER BY name ASC');
    return rs.rows.map(r => ({ ...r }));
  } catch (dbErr) {
    console.error('Turso distributor fetch error:', dbErr);
    return [];
  }
}

export async function fetchSalesReport(apiBase: string): Promise<any[]> {
  try {
    const res = await fetch(`${apiBase}/api/reports/sales`, {
      headers: { 'x-manager-pin': getAdminPin() },
      signal: AbortSignal.timeout(2500)
    });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.sales || data?.data || []);
      if (list.length > 0) return list;
    }
  } catch (err) {
    console.warn('API /api/reports/sales notice, querying Turso Cloud direct:', err);
  }

  try {
    const rs = await turso.execute(`
      SELECT s.id, s.invoiceNo, s.employeeId, s.total, s.totalAmount, s.subtotal, 
             COALESCE(s.totalVat, s.vatTotal, 0) as vatAmount, 
             COALESCE(s.paymentType, 'CASH') as paymentMethod, 
             s.status, s.createdAt, s.storeId, s.terminalId,
             c.name as customerName
      FROM Sale s
      LEFT JOIN Customer c ON s.customerId = c.id
      ORDER BY s.createdAt DESC 
      LIMIT 300
    `);
    return rs.rows.map(r => ({
      ...r,
      id: String(r.id),
      invoiceNo: String(r.invoiceNo || r.id),
      customerName: r.customerName || (r.employeeId ? `Employee (${r.employeeId})` : 'Walk-in Customer'),
      total: Number(r.total ?? r.totalAmount ?? 0),
      subtotal: Number(r.subtotal ?? r.total ?? 0),
      vatAmount: Number(r.vatAmount ?? 0),
      paymentMethod: String(r.paymentMethod || 'CASH').toUpperCase(),
      status: String(r.status || 'COMPLETED').toUpperCase(),
      createdAt: String(r.createdAt || '')
    }));
  } catch (dbErr) {
    console.error('Turso sales report error:', dbErr);
    return [];
  }
}

export async function fetchUnifiedReportData(apiBase: string, dateRange: string, startDate?: string, endDate?: string): Promise<any> {
  try {
    const url = (dateRange === 'CUSTOM' && startDate && endDate)
      ? `${apiBase}/api/reports/unified?range=CUSTOM&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      : `${apiBase}/api/reports/unified?range=${dateRange}`;
    const res = await fetch(url, {
      headers: { 'x-manager-pin': getAdminPin() },
      signal: AbortSignal.timeout(2500)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.kpis && Array.isArray(data.transactions)) {
        return data;
      }
    }
  } catch (err) {
    console.warn('API unified report notice, querying Turso direct:', err);
  }

  // ⚡ Sovereign Turso Direct Calculation with Regional Bahrain Filter
  try {
    const { startIso, endIso } = getPeriodIsoRange(dateRange, startDate, endDate);

    const [salesRs, expRs, khataRs, wastageRs] = await Promise.all([
      turso.execute({
        sql: `SELECT id, invoiceNo, total, totalAmount, paymentType, status, createdAt FROM Sale 
              WHERE createdAt >= ? AND createdAt <= ?
                AND (status IS NULL OR status NOT IN ('VOIDED', 'CANCELLED'))
              ORDER BY createdAt DESC`,
        args: [startIso, endIso]
      }),
      turso.execute({
        sql: `SELECT id, category, description, amount, type, createdAt FROM Expense 
              WHERE createdAt >= ? AND createdAt <= ?
              ORDER BY createdAt DESC`,
        args: [startIso, endIso]
      }),
      turso.execute({
        sql: `SELECT k.id, k.customerId, k.amount, k.type, k.timestamp, c.name as customerName 
              FROM KhataLedger k 
              LEFT JOIN Customer c ON k.customerId = c.id
              WHERE k.timestamp >= ? AND k.timestamp <= ?
                AND (k.type IN ('PAYMENT', 'PAYMENT_IN', 'SETTLEMENT') OR k.amount < 0)
              ORDER BY k.timestamp DESC`,
        args: [startIso, endIso]
      }),
      turso.execute({
        sql: `SELECT id, productName, quantity, reason, totalLoss, createdAt FROM WastageLog 
              WHERE createdAt >= ? AND createdAt <= ?
              ORDER BY createdAt DESC`,
        args: [startIso, endIso]
      })
    ]);

    const unifiedList: any[] = [];
    let totalSales = 0;
    let totalImmediateCashIn = 0;
    let totalExpenses = 0;
    let totalKhataCollected = 0;
    let totalWastageLoss = 0;

    // Process Sales
    (salesRs.rows || []).forEach((sale: any) => {
      const amt = Number(sale.total ?? sale.totalAmount ?? 0);
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
      const saleDate = new Date(sale.createdAt);
      unifiedList.push({
        id: `sale-${sale.id}`,
        rawDate: sale.createdAt,
        time: isNaN(saleDate.getTime()) ? '12:00 PM' : saleDate.toLocaleTimeString('en-US', { timeZone: REGIONAL_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: true }),
        dateStr: isNaN(saleDate.getTime()) ? String(sale.createdAt || '').slice(0, 10) : saleDate.toLocaleDateString('en-GB', { timeZone: REGIONAL_TIMEZONE }),
        type: isNegative ? 'REFUND' : 'SALE',
        desc: `Invoice #${sale.invoiceNo || sale.id}${pType}`,
        amount: Math.abs(amt),
        direction: isNegative ? 'OUT' : 'IN',
      });
    });

    // Process Expenses & Owner Draws
    (expRs.rows || []).forEach((exp: any) => {
      const amt = Number(exp.amount || 0);
      totalExpenses += amt;
      const typeLabel = exp.type === 'PERSONAL' ? ' [Personal Draw]' : '';
      const expDate = new Date(exp.createdAt);
      unifiedList.push({
        id: `exp-${exp.id}`,
        rawDate: exp.createdAt,
        time: isNaN(expDate.getTime()) ? '12:00 PM' : expDate.toLocaleTimeString('en-US', { timeZone: REGIONAL_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: true }),
        dateStr: isNaN(expDate.getTime()) ? String(exp.createdAt || '').slice(0, 10) : expDate.toLocaleDateString('en-GB', { timeZone: REGIONAL_TIMEZONE }),
        type: 'EXPENSE',
        desc: `${exp.category || 'Expense'}${exp.description ? ` - ${exp.description}` : ''}${typeLabel}`,
        amount: amt,
        direction: 'OUT',
      });
    });

    // Process Khata Payments
    (khataRs.rows || []).forEach((entry: any) => {
      const amt = Math.abs(Number(entry.amount || 0));
      totalKhataCollected += amt;
      const custName = entry.customerName || 'Credit Customer';
      const kDate = new Date(entry.timestamp);
      unifiedList.push({
        id: `khata-${entry.id}`,
        rawDate: entry.timestamp,
        time: isNaN(kDate.getTime()) ? '12:00 PM' : kDate.toLocaleTimeString('en-US', { timeZone: REGIONAL_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: true }),
        dateStr: isNaN(kDate.getTime()) ? String(entry.timestamp || '').slice(0, 10) : kDate.toLocaleDateString('en-GB', { timeZone: REGIONAL_TIMEZONE }),
        type: 'KHATA_PAYMENT',
        desc: `${custName} - Debt Settle`,
        amount: amt,
        direction: 'IN',
      });
    });

    // Process Wastage
    (wastageRs.rows || []).forEach((w: any) => {
      const loss = Number(w.totalLoss || 0);
      totalWastageLoss += loss;
      const wDate = new Date(w.createdAt);
      unifiedList.push({
        id: `wastage-${w.id}`,
        rawDate: w.createdAt,
        time: isNaN(wDate.getTime()) ? '12:00 PM' : wDate.toLocaleTimeString('en-US', { timeZone: REGIONAL_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: true }),
        dateStr: isNaN(wDate.getTime()) ? String(w.createdAt || '').slice(0, 10) : wDate.toLocaleDateString('en-GB', { timeZone: REGIONAL_TIMEZONE }),
        type: 'WASTAGE',
        desc: `Write-Off: ${w.quantity || 1}x ${w.productName || 'Item'} [${w.reason || 'Damage'}]`,
        amount: loss,
        direction: 'OUT',
      });
    });

    // Sort chronologically descending
    unifiedList.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());

    const grossProfit = Math.max(0, totalSales - totalWastageLoss);
    const netCash = (totalImmediateCashIn + totalKhataCollected) - totalExpenses;

    return {
      success: true,
      range: dateRange,
      kpis: {
        sales: Number(totalSales.toFixed(3)),
        expenses: Number(totalExpenses.toFixed(3)),
        khataCollected: Number(totalKhataCollected.toFixed(3)),
        wastageLoss: Number(totalWastageLoss.toFixed(3)),
        grossProfit: Number(grossProfit.toFixed(3)),
        netCash: Number(netCash.toFixed(3)),
      },
      transactions: unifiedList
    };
  } catch (dbErr) {
    console.error('Turso unified report error:', dbErr);
    return null;
  }
}

export async function fetchFinancialMetrics(apiBase: string, period: 'day' | 'month' | 'year' = 'day'): Promise<any> {
  try {
    const res = await fetch(`${apiBase}/api/reports/financials?period=${period}`, {
      headers: { 'x-manager-pin': getAdminPin() },
      signal: AbortSignal.timeout(2500)
    });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err) {
    console.warn('API /api/reports/financials notice, calculating from Turso Cloud direct:', err);
  }

  // ⚡ Sovereign Turso Direct Calculation with Exact Date Filtering & Real COGS
  try {
    const { startIso, endIso } = getPeriodIsoRange(period);

    const [salesRs, itemsRs, expRs] = await Promise.all([
      turso.execute({
        sql: `SELECT s.id, s.total, s.totalAmount, s.subtotal, s.paymentType, s.createdAt FROM Sale s
              WHERE s.createdAt >= ? AND s.createdAt <= ?
                AND (s.status IS NULL OR s.status NOT IN ('VOIDED', 'CANCELLED'))
              ORDER BY s.createdAt ASC`,
        args: [startIso, endIso]
      }),
      turso.execute({
        sql: `SELECT si.quantity, si.costAtSale, si.priceAtSale, p.purchasePrice, p.unitCost
              FROM SaleItem si
              JOIN Sale s ON si.saleId = s.id
              LEFT JOIN Product p ON si.productId = p.id OR si.productId = p.barcode
              WHERE s.createdAt >= ? AND s.createdAt <= ?
                AND (s.status IS NULL OR s.status NOT IN ('VOIDED', 'CANCELLED'))`,
        args: [startIso, endIso]
      }),
      turso.execute({
        sql: `SELECT amount FROM Expense WHERE createdAt >= ? AND createdAt <= ? AND (type IS NULL OR type != 'PERSONAL')`,
        args: [startIso, endIso]
      })
    ]);

    const sales = salesRs.rows || [];
    let grossRev = 0;
    sales.forEach((s: any) => {
      grossRev += Number(s.total ?? s.totalAmount ?? 0);
    });

    let cogs = 0;
    (itemsRs.rows || []).forEach((it: any) => {
      const qty = Number(it.quantity) || 1;
      const unitCost = Number(it.costAtSale || it.purchasePrice || it.unitCost || 0);
      cogs += (qty * unitCost);
    });

    // If sales exist but line items had zero purchase price recorded, use conservative 78% default
    if (cogs === 0 && grossRev > 0) {
      cogs = Number((grossRev * 0.78).toFixed(3));
    }

    let expenses = 0;
    (expRs.rows || []).forEach((e: any) => {
      expenses += Number(e.amount || 0);
    });

    const profit = Math.max(0, grossRev - cogs - expenses);
    const marginRatio = grossRev > 0 ? (profit / grossRev) : 0.22;

    // Real dynamic chart data based on selected period
    let chartData: Array<{ name: string; profit: number }> = [];

    if (period === 'day') {
      const daySlots = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
      const slotMap: Record<string, number> = {};
      daySlots.forEach(s => { slotMap[s] = 0; });

      sales.forEach((s: any) => {
        const h = parseInt(new Date(s.createdAt).toLocaleTimeString('en-US', { timeZone: REGIONAL_TIMEZONE, hour: '2-digit', hour12: false }), 10) || 0;
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
    } else if (period === 'year') {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthMap: Record<string, number> = {};
      months.forEach(m => { monthMap[m] = 0; });

      sales.forEach((s: any) => {
        const m = new Date(s.createdAt).getMonth();
        const mName = months[m] || 'Jan';
        monthMap[mName] += Number(s.total ?? s.totalAmount ?? 0) * marginRatio;
      });

      chartData = months.map(name => ({
        name,
        profit: Number((monthMap[name] || 0).toFixed(3))
      }));
    } else {
      // Month -> Week 1 to Week 5
      const weekSlots = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];
      const weekMap: Record<string, number> = {};
      weekSlots.forEach(w => { weekMap[w] = 0; });

      sales.forEach((s: any) => {
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
      period,
      financials: {
        grossRevenue: Number(grossRev.toFixed(3)),
        cogs: Number(cogs.toFixed(3)),
        netProfit: Number(profit.toFixed(3))
      },
      metrics: {
        revenue: grossRev.toFixed(3),
        cogs: cogs.toFixed(3),
        netProfit: profit.toFixed(3),
        profitMargin: grossRev > 0 ? `${((profit / grossRev) * 100).toFixed(1)}%` : '0%'
      },
      chartData
    };
  } catch (dbErr) {
    console.error('Turso financials calculation error:', dbErr);
    return null;
  }
}

export async function fetchPnlStatement(apiBase: string, period: string = 'month'): Promise<any> {
  try {
    const res = await fetch(`${apiBase}/api/reports/pnl?period=${period}`, {
      headers: { 'x-manager-pin': getAdminPin() },
      signal: AbortSignal.timeout(2500)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.data) return data.data;
    }
  } catch (err) {
    console.warn('API PnL report notice, calculating via Turso direct:', err);
  }

  try {
    const { startIso, endIso } = getPeriodIsoRange(period);

    const [salesRs, expRs] = await Promise.all([
      turso.execute({
        sql: 'SELECT SUM(COALESCE(total, totalAmount, 0)) as grossRev FROM Sale WHERE createdAt >= ? AND createdAt <= ? AND (status IS NULL OR status NOT IN (\'VOIDED\', \'CANCELLED\'))',
        args: [startIso, endIso]
      }),
      turso.execute({
        sql: 'SELECT SUM(amount) as expTotal, COUNT(*) as expCnt FROM Expense WHERE createdAt >= ? AND createdAt <= ?',
        args: [startIso, endIso]
      })
    ]);
    const grossRev = Number(salesRs.rows[0]?.grossRev || 0);
    const cogs = Number((grossRev * 0.78).toFixed(3));
    const grossProfit = Number((grossRev - cogs).toFixed(3));
    const expTotal = Number(expRs.rows[0]?.expTotal || 0);
    const expCnt = Number(expRs.rows[0]?.expCnt || 0);
    const opProfit = Number((grossProfit - expTotal).toFixed(3));

    return {
      totalRevenue: grossRev,
      totalCogs: cogs,
      grossProfit,
      businessExpenses: expTotal,
      operatingProfit: opProfit,
      personalWithdrawals: 0,
      netRetainedCash: opProfit,
      expensesCount: expCnt,
      recentExpenses: []
    };
  } catch (dbErr) {
    console.error('Turso PnL statement error:', dbErr);
    return null;
  }
}

export async function fetchVatStatement(apiBase: string, startDate?: string, endDate?: string): Promise<any> {
  try {
    const query = (startDate && endDate) ? `?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}` : '';
    const res = await fetch(`${apiBase}/api/reports/vat-return${query}`, {
      headers: { 'x-manager-pin': getAdminPin() },
      signal: AbortSignal.timeout(2500)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) return data;
    }
  } catch (err) {
    console.warn('API VAT report notice, calculating via Turso direct:', err);
  }

  try {
    const { startIso, endIso } = getPeriodIsoRange(startDate && endDate ? 'CUSTOM' : 'quarter', startDate, endDate);

    const [salesRs, poRs] = await Promise.all([
      turso.execute({
        sql: "SELECT SUM(COALESCE(total, totalAmount, 0)) as totalSales, SUM(COALESCE(totalVat, vatTotal, 0)) as outputVat FROM Sale WHERE createdAt >= ? AND createdAt <= ? AND (status IS NULL OR status NOT IN ('VOIDED', 'CANCELLED'))",
        args: [startIso, endIso]
      }),
      turso.execute({
        sql: "SELECT SUM(vatPaid) as inputVat FROM PurchaseOrder WHERE createdAt >= ? AND createdAt <= ? AND status = 'RECEIVED'",
        args: [startIso, endIso]
      })
    ]);
    const totalSales = Number(salesRs.rows[0]?.totalSales || 0);
    const outputVatCollected = Number(salesRs.rows[0]?.outputVat || 0);
    const inputVatPaid = Number(poRs.rows[0]?.inputVat || 0);
    const netVatDueToNBR = outputVatCollected - inputVatPaid;
    const standardRatedSales = outputVatCollected * 10;
    const zeroRatedSales = Math.max(0, totalSales - standardRatedSales);

    return {
      success: true,
      outputVatCollected,
      inputVatPaid,
      netVatDueToNBR,
      standardRatedSales,
      zeroRatedSales,
      totalTaxableSales: totalSales,
      effectiveVatRate: '10%'
    };
  } catch (dbErr) {
    console.error('Turso VAT calculation error:', dbErr);
    return null;
  }
}

export async function saveProductToCatalog(apiBase: string, payload: any): Promise<boolean> {
  let apiSucceeded = false;
  try {
    const res = await fetch(`${apiBase}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-pin': getAdminPin(),
        'x-pos-client': 'pim-admin'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      apiSucceeded = true;
    }
  } catch (err) {
    console.warn('API save product notice, falling back to Turso direct:', err);
  }

  if (apiSucceeded) return true;

  try {
    const cleanId = payload.id || payload.barcode || crypto.randomUUID();
    const cleanBarcode = payload.barcode || cleanId;
    const sPrice = Number(payload.sellingPrice || 0);
    const cPrice = Number(payload.purchasePrice || payload.unitCost || 0);
    const stock = Number(payload.stockQuantity || 0);
    const minT = Number(payload.minThreshold || 10);
    const maxT = Number(payload.maxThreshold || 50);
    const vat = Number(payload.vatRate ?? 10);
    const isWeighed = payload.is_weighed_item ? 1 : 0;
    const cat = payload.category || 'ESSENTIALS';
    const distId = payload.distributorId || null;
    const pluCode = payload.plu_code || null;
    const imageUrl = payload.image_url || null;
    const nameAr = payload.name_ar || null;

    await turso.execute({
      sql: `INSERT INTO Product (id, barcode, name, name_ar, plu_code, image_url, sellingPrice, unitCost, purchasePrice, stockQuantity, minThreshold, maxThreshold, distributorId, vatRate, taxRate, is_weighed_item, category)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              barcode = excluded.barcode,
              name = excluded.name,
              name_ar = excluded.name_ar,
              plu_code = excluded.plu_code,
              image_url = excluded.image_url,
              sellingPrice = excluded.sellingPrice,
              unitCost = excluded.unitCost,
              purchasePrice = excluded.purchasePrice,
              stockQuantity = excluded.stockQuantity,
              minThreshold = excluded.minThreshold,
              maxThreshold = excluded.maxThreshold,
              distributorId = excluded.distributorId,
              vatRate = excluded.vatRate,
              taxRate = excluded.taxRate,
              is_weighed_item = excluded.is_weighed_item,
              category = excluded.category`,
      args: [cleanId, cleanBarcode, payload.name, nameAr, pluCode, imageUrl, sPrice, cPrice, cPrice, stock, minT, maxT, distId, vat, vat / 100, isWeighed, cat]
    });
    return true;
  } catch (dbErr) {
    console.error('Turso save product error:', dbErr);
    return false;
  }
}

export async function deleteProductFromCatalog(apiBase: string, id: string): Promise<boolean> {
  let apiSucceeded = false;
  try {
    const res = await fetch(`${apiBase}/api/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        'x-manager-pin': getAdminPin(),
        'x-pos-client': 'pim-admin'
      },
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) apiSucceeded = true;
  } catch (err) {
    console.warn('API delete product notice, falling back to Turso direct:', err);
  }

  if (apiSucceeded) return true;

  try {
    const existing = await turso.execute({
      sql: 'SELECT id, barcode, name, tenantId FROM Product WHERE id = ? OR barcode = ? LIMIT 1',
      args: [id, id]
    });
    const realId = existing.rows.length > 0 ? String(existing.rows[0].id) : String(id);
    const barcode = existing.rows.length > 0 ? String(existing.rows[0].barcode || '') : '';
    const name = existing.rows.length > 0 ? String(existing.rows[0].name || '') : '';
    const tenant = existing.rows.length > 0 ? String(existing.rows[0].tenantId || 'tenant_askar_01') : 'tenant_askar_01';

    await turso.batch([
      {
        sql: `INSERT INTO DeletedProduct (id, barcode, tenantId, name, deletedAt)
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO UPDATE SET deletedAt = CURRENT_TIMESTAMP`,
        args: [realId, barcode || null, tenant, name]
      },
      { sql: 'DELETE FROM QuickProduct WHERE productId = ? OR id = ?', args: [realId, `qp_${realId}`] },
      { sql: 'DELETE FROM StoreInventory WHERE productId = ? OR productId = ?', args: [realId, barcode || realId] },
      { sql: 'DELETE FROM ProductPriceHistory WHERE productId = ?', args: [realId] },
      { sql: 'DELETE FROM Product WHERE id = ? OR barcode = ?', args: [realId, realId] }
    ], 'write');
    return true;
  } catch (dbErr) {
    console.error('Turso delete product error:', dbErr);
    return false;
  }
}

// ==========================================
// ⚡ KHATA & CUSTOMER LEDGER SERVICES
// ==========================================

export async function fetchCustomersList(apiBase: string, sortParam: string = 'alpha', onlyDebtors: boolean = false): Promise<any[]> {
  try {
    const query = new URLSearchParams({
      sort: sortParam,
      ...(onlyDebtors ? { onlyDebtors: 'true' } : {}),
    });
    const res = await fetch(`${apiBase}/khata/ledger?${query.toString()}`, {
      headers: { 'x-manager-pin': getAdminPin() },
      signal: AbortSignal.timeout(2500)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.customers) && data.customers.length > 0) {
        return data.customers;
      }
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (err) {
    console.warn('API khata/ledger notice, querying Turso direct:', err);
  }

  try {
    let sql = `
      SELECT id, name, phone, cpr, cardUid, balance, credit_limit, is_active, mess_id, updatedAt, createdAt
      FROM Customer
    `;
    if (onlyDebtors) {
      sql += ' WHERE balance > 0';
    }
    if (sortParam === 'debt') {
      sql += ' ORDER BY balance DESC, name ASC';
    } else {
      sql += ' ORDER BY name ASC';
    }

    const rs = await turso.execute(sql);
    return rs.rows.map(r => ({
      ...r,
      balance: Number(r.balance || 0),
      credit_limit: Number(r.credit_limit || 30),
      is_active: r.is_active !== 0
    }));
  } catch (dbErr) {
    console.error('Turso customer list error:', dbErr);
    return [];
  }
}

export async function fetchCustomerStatement(apiBase: string, targetId: string): Promise<any> {
  try {
    const res = await fetch(`${apiBase}/api/customers/${encodeURIComponent(targetId)}/statement`, {
      headers: { 'x-manager-pin': getAdminPin() },
      signal: AbortSignal.timeout(2500)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && (data.customer || data.transactions)) return data;
    }
  } catch (err) {
    console.warn('API customer statement notice, querying Turso direct:', err);
  }

  try {
    const custRs = await turso.execute({
      sql: 'SELECT * FROM Customer WHERE id = ? OR cardUid = ? LIMIT 1',
      args: [targetId, targetId]
    });
    const customer = custRs.rows[0];
    if (!customer) return null;

    const resolvedId = String(customer.id);
    const txRs = await turso.execute({
      sql: 'SELECT * FROM KhataLedger WHERE customerId = ? ORDER BY timestamp DESC, created_at DESC LIMIT 100',
      args: [resolvedId]
    });

    const transactions = txRs.rows.map(r => ({
      id: String(r.id),
      timestamp: r.timestamp || r.created_at || new Date().toISOString(),
      type: String(r.type || 'CHARGE'),
      amount: Number(r.amount || 0),
      reference: String(r.reference || 'Khata Transaction'),
      running_balance: r.running_balance !== null ? Number(r.running_balance) : undefined
    }));

    return {
      success: true,
      customer: {
        ...customer,
        balance: Number(customer.balance || 0),
        credit_limit: Number(customer.credit_limit || 30)
      },
      transactions
    };
  } catch (dbErr) {
    console.error('Turso statement fetch error:', dbErr);
    return null;
  }
}

export async function recordCustomerSettlement(apiBase: string, customerId: string, amount: number, paymentMethod: string = 'CASH', notes: string = 'Manual Payment Settlement'): Promise<boolean> {
  let apiSucceeded = false;
  try {
    const res = await fetch(`${apiBase}/api/customers/${encodeURIComponent(customerId)}/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-pin': getAdminPin(),
        'x-pos-client': 'admin-dashboard'
      },
      body: JSON.stringify({ amount, paymentMethod, notes }),
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) apiSucceeded = true;
  } catch (err) {
    console.warn('API settle customer notice, falling back to Turso direct:', err);
  }

  if (apiSucceeded) return true;

  try {
    const txId = `settle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    await turso.batch([
      {
        sql: 'UPDATE Customer SET balance = MAX(0, balance - ?), updatedAt = ? WHERE id = ?',
        args: [amount, nowIso, customerId]
      },
      {
        sql: `INSERT INTO KhataLedger (id, customerId, tenantId, storeId, amount, type, reference, timestamp, created_at, syncStatus)
              VALUES (?, ?, 'tenant_askar_01', 'store_askar_01', ?, 'PAYMENT', ?, ?, ?, 'SYNCED')`,
        args: [txId, customerId, -amount, `Payment (${paymentMethod}) - ${notes}`, nowIso, nowIso]
      }
    ]);
    return true;
  } catch (dbErr) {
    console.error('Turso settlement error:', dbErr);
    return false;
  }
}

// ==========================================
// ⚡ PRODUCE PRICE COMMANDER SERVICES
// ==========================================

export async function fetchProduceItemsList(apiBase: string): Promise<any[]> {
  try {
    const res = await fetch(`${apiBase}/api/products/produce?t=${Date.now()}`, {
      headers: { 'x-manager-pin': getAdminPin() },
      signal: AbortSignal.timeout(2500)
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.items) && data.items.length > 0) return data.items;
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (err) {
    console.warn('API produce notice, querying Turso direct:', err);
  }

  try {
    const rs = await turso.execute(`
      SELECT id, barcode, name, name_ar, plu_code, image_url, sellingPrice, purchasePrice, unitCost, stockQuantity,
             minThreshold, maxThreshold, is_weighed_item, category, updatedAt
      FROM Product
      WHERE is_weighed_item = 1
      ORDER BY 
        CASE WHEN plu_code IS NOT NULL AND plu_code != '' THEN 0 ELSE 1 END,
        CAST(plu_code AS INTEGER) ASC,
        name ASC
    `);
    return rs.rows.map(r => ({
      ...r,
      plu_code: r.plu_code || null,
      pluCode: r.plu_code || null,
      name_ar: r.name_ar || null,
      nameAr: r.name_ar || null,
      image_url: r.image_url || null,
      imageUrl: r.image_url || null,
      sellingPrice: Number(r.sellingPrice || 0),
      purchasePrice: Number(r.purchasePrice || r.unitCost || 0),
      is_weighed_item: Boolean(r.is_weighed_item)
    }));
  } catch (dbErr) {
    console.error('Turso produce items error:', dbErr);
    return [];
  }
}

export async function batchUpdateProducePricesDirect(apiBase: string, updates: any[], reason: string = 'Daily Morning Produce Price Update'): Promise<boolean> {
  let apiSucceeded = false;
  try {
    const res = await fetch(`${apiBase}/api/products/produce/batch-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-pin': getAdminPin(),
        'x-pos-client': 'store-pos'
      },
      body: JSON.stringify({ updates, reason, changedBy: 'Store Manager' }),
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) apiSucceeded = true;
  } catch (err) {
    console.warn('API produce batch-update notice, falling back to Turso direct:', err);
  }

  if (apiSucceeded) return true;

  try {
    const statements: any[] = [];
    const nowIso = new Date().toISOString();

    for (const item of updates) {
      const sets = ['sellingPrice = ?', 'purchasePrice = ?', 'unitCost = ?', 'updatedAt = ?'];
      const args: any[] = [item.sellingPrice, item.purchasePrice, item.purchasePrice, nowIso];
      if (item.plu_code !== undefined) {
        sets.push('plu_code = ?');
        args.push(item.plu_code || null);
      }
      if (item.image_url !== undefined) {
        sets.push('image_url = ?');
        args.push(item.image_url || null);
      }
      if (item.name_ar !== undefined) {
        sets.push('name_ar = ?');
        args.push(item.name_ar || null);
      }
      args.push(item.id);

      statements.push({
        sql: `UPDATE Product SET ${sets.join(', ')} WHERE id = ?`,
        args
      });

      if (item.wastageKg && item.wastageKg > 0) {
        statements.push({
          sql: `INSERT INTO WastageLog (id, productId, productName, quantity, cost, reason, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `waste_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            item.id,
            item.name,
            item.wastageKg,
            item.purchasePrice * item.wastageKg,
            'Morning Produce Sorting Wastage',
            nowIso
          ]
        });
      }
    }

    if (statements.length > 0) {
      await turso.batch(statements);
    }
    return true;
  } catch (dbErr) {
    console.error('Turso batch produce update error:', dbErr);
    return false;
  }
}

export async function updateProduceItemDirect(apiBase: string, payload: {
  id: string;
  plu_code?: string | null;
  image_url?: string | null;
  name?: string;
  name_ar?: string | null;
  sellingPrice?: number;
  purchasePrice?: number;
  is_weighed_item?: boolean;
}): Promise<boolean> {
  let apiSucceeded = false;
  try {
    const res = await fetch(`${apiBase}/api/products/produce/update-item`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-pin': getAdminPin(),
        'x-pos-client': 'pim-admin'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) apiSucceeded = true;
  } catch (err) {
    console.warn('API update-item notice, falling back to Turso direct:', err);
  }

  if (apiSucceeded) return true;

  try {
    const sets: string[] = ['updatedAt = CURRENT_TIMESTAMP'];
    const args: any[] = [];
    if (payload.plu_code !== undefined) { sets.push('plu_code = ?'); args.push(payload.plu_code || null); }
    if (payload.image_url !== undefined) { sets.push('image_url = ?'); args.push(payload.image_url || null); }
    if (payload.name !== undefined) { sets.push('name = ?'); args.push(payload.name); }
    if (payload.name_ar !== undefined) { sets.push('name_ar = ?'); args.push(payload.name_ar || null); }
    if (payload.sellingPrice !== undefined) { sets.push('sellingPrice = ?'); args.push(payload.sellingPrice); }
    if (payload.purchasePrice !== undefined) {
      sets.push('purchasePrice = ?'); args.push(payload.purchasePrice);
      sets.push('unitCost = ?'); args.push(payload.purchasePrice);
    }
    if (payload.is_weighed_item !== undefined) { sets.push('is_weighed_item = ?'); args.push(payload.is_weighed_item ? 1 : 0); }
    args.push(payload.id);

    await turso.execute({
      sql: `UPDATE Product SET ${sets.join(', ')} WHERE id = ?`,
      args
    });

    if (payload.is_weighed_item === false) {
      await turso.execute({
        sql: `DELETE FROM QuickProduct WHERE productId = ? OR id = ?`,
        args: [payload.id, `qp_${payload.id}`]
      }).catch(() => {});
    }
    return true;
  } catch (err) {
    console.error('Turso update produce item error:', err);
    return false;
  }
}

// ==========================================
// ⚡ STOCK & PROCUREMENT SERVICES
// ==========================================

export async function fetchStockDashboardData(apiBase: string): Promise<{
  lowStockItems: any[];
  draftOrders: any[];
  transitOrders: any[];
  distributors: any[];
}> {
  try {
    const [productsRes, draftsRes, transitRes, distRes] = await Promise.all([
      fetch(`${apiBase}/api/products`, { signal: AbortSignal.timeout(2000) }),
      fetch(`${apiBase}/api/purchase-orders/drafts`, { signal: AbortSignal.timeout(2000) }),
      fetch(`${apiBase}/api/purchase-orders/transit`, { signal: AbortSignal.timeout(2000) }),
      fetch(`${apiBase}/api/distributors`, { signal: AbortSignal.timeout(2000) })
    ]);

    if (productsRes.ok && draftsRes.ok) {
      const prods = await productsRes.json();
      const drafts = await draftsRes.json();
      const transit = transitRes.ok ? await transitRes.json() : { orders: [] };
      const dists = distRes.ok ? await distRes.json() : { distributors: [] };

      const prodList = Array.isArray(prods) ? prods : (prods?.data || prods?.products || []);
      return {
        lowStockItems: prodList.filter((p: any) => (p.stockQuantity ?? 0) <= (p.minThreshold ?? 20)),
        draftOrders: drafts.drafts || drafts.orders || [],
        transitOrders: transit.orders || [],
        distributors: dists.distributors || []
      };
    }
  } catch (err) {
    console.warn('API stock dashboard notice, querying Turso direct:', err);
  }

  // ⚡ Sovereign Turso Direct
  try {
    const [prodRs, poRs, distRs] = await Promise.all([
      turso.execute('SELECT * FROM Product ORDER BY name ASC'),
      turso.execute('SELECT * FROM PurchaseOrder ORDER BY createdAt DESC'),
      turso.execute('SELECT * FROM Distributor ORDER BY name ASC')
    ]);

    const lowStockItems = prodRs.rows.filter(p => Number(p.stockQuantity || 0) <= Number(p.minThreshold || 20));
    const draftOrders = poRs.rows.filter(po => String(po.status).toUpperCase() === 'DRAFT');
    const transitOrders = poRs.rows.filter(po => ['TRANSIT', 'APPROVED', 'ORDERED'].includes(String(po.status).toUpperCase()));

    return {
      lowStockItems: lowStockItems.map(p => ({
        ...p,
        stockQuantity: Number(p.stockQuantity || 0),
        minThreshold: Number(p.minThreshold || 20),
        sellingPrice: Number(p.sellingPrice || 0),
        purchasePrice: Number(p.purchasePrice || p.unitCost || 0)
      })),
      draftOrders: draftOrders.map(d => ({
        ...d,
        items: typeof d.itemsJson === 'string' ? JSON.parse(d.itemsJson || '[]') : []
      })),
      transitOrders: transitOrders.map(t => ({
        ...t,
        items: typeof t.itemsJson === 'string' ? JSON.parse(t.itemsJson || '[]') : []
      })),
      distributors: distRs.rows.map(d => ({ ...d }))
    };
  } catch (dbErr) {
    console.error('Turso stock dashboard error:', dbErr);
    return { lowStockItems: [], draftOrders: [], transitOrders: [], distributors: [] };
  }
}

export async function fetchPurchaseOrdersList(apiBase: string, viewFilter: 'DRAFT' | 'ALL' = 'DRAFT'): Promise<any[]> {
  try {
    const endpoint = viewFilter === 'DRAFT' ? `${apiBase}/api/purchase-orders/drafts` : `${apiBase}/api/purchase-orders`;
    const res = await fetch(endpoint, {
      headers: { 'x-manager-pin': getAdminPin() },
      signal: AbortSignal.timeout(2000)
    });
    if (res.ok) {
      const data = await res.json();
      const list = data.drafts || data.orders || [];
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch (err) {
    console.warn('API purchase orders notice, querying Turso direct:', err);
  }

  try {
    const sql = viewFilter === 'DRAFT'
      ? "SELECT * FROM PurchaseOrder WHERE UPPER(status) = 'DRAFT' ORDER BY createdAt DESC"
      : "SELECT * FROM PurchaseOrder ORDER BY createdAt DESC";
    const rs = await turso.execute(sql);
    return rs.rows.map(r => ({
      ...r,
      items: typeof r.itemsJson === 'string' ? JSON.parse(r.itemsJson || '[]') : []
    }));
  } catch (dbErr) {
    console.error('Turso PO fetch error:', dbErr);
    return [];
  }
}

// ==========================================
// ⚡ SHIFTS & EMPLOYEES SERVICES
// ==========================================

export async function fetchShiftsAndEmployees(apiBase: string): Promise<{ shifts: any[]; employees: any[] }> {
  try {
    const [shiftsRes, empRes] = await Promise.all([
      fetch(`${apiBase}/api/shifts/reconciliation?t=${Date.now()}`, { signal: AbortSignal.timeout(2000) }),
      fetch(`${apiBase}/api/employees?t=${Date.now()}`, { signal: AbortSignal.timeout(2000) })
    ]);
    if (shiftsRes.ok && empRes.ok) {
      const sData = await shiftsRes.json();
      const eData = await empRes.json();
      return {
        shifts: sData.shifts || sData || [],
        employees: eData.employees || eData || []
      };
    }
  } catch (err) {
    console.warn('API shifts notice, querying Turso direct:', err);
  }

  try {
    const [sRs, eRs] = await Promise.all([
      turso.execute('SELECT * FROM Shift ORDER BY createdAt DESC LIMIT 50'),
      turso.execute('SELECT id, name, role, pin, isActive FROM Employee ORDER BY name ASC')
    ]);
    return {
      shifts: sRs.rows.map(s => ({
        ...s,
        totalSales: Number(s.totalSales || 0),
        cashSales: Number(s.cashSales || 0),
        benefitSales: Number(s.benefitSales || 0),
        cashInDrawer: Number(s.cashInDrawer || 0)
      })),
      employees: eRs.rows.map(e => ({ ...e, isActive: Boolean(e.isActive) }))
    };
  } catch (dbErr) {
    console.error('Turso shifts error:', dbErr);
    return { shifts: [], employees: [] };
  }
}
