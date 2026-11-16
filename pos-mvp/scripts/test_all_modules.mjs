import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: 'pos-mvp/.env' });

const LOCAL_URL = 'http://127.0.0.1:3000';
const EDGE_URL = 'https://askar-edge-api.layali-askar-pos.workers.dev';
const PWA_URL = 'https://askar-khata-pwa.vercel.app';

// The verified Manager PIN from pos-mvp/.env is 9999
const MANAGER_PIN = process.env.VITE_MANAGER_PIN || '9999';
const headersWithPin = {
  'Content-Type': 'application/json',
  'x-manager-pin': MANAGER_PIN,
  'authorization': `Bearer ${MANAGER_PIN}`
};

const results = [];

function record(moduleName, testName, passed, details) {
  results.push({ module: moduleName, test: testName, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} [${moduleName}] - ${testName}: ${details}`);
}

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 FULL SYSTEM MODULE & DASHBOARD VERIFICATION SUITE');
  console.log('===============================================================');

  // MODULE 1: Local Server Health & Time
  try {
    const timeRes = await fetch(`${LOCAL_URL}/api/time`);
    const timeData = await timeRes.json();
    record('System Health', 'Local Fastify Time & Health', timeRes.ok && Boolean(timeData.iso), `Status ${timeRes.status}, Server Time: ${timeData.iso}`);
  } catch (err) {
    record('System Health', 'Local Fastify Time & Health', false, err.message);
  }

  // MODULE 2: Khata Customer Overview & Ledger
  let sampleCustomer = null;
  try {
    const khataRes = await fetch(`${LOCAL_URL}/khata/ledger`, { headers: headersWithPin });
    const khataData = await khataRes.json();
    const count = Array.isArray(khataData) ? khataData.length : (khataData.customers?.length || 0);
    const list = Array.isArray(khataData) ? khataData : (khataData.customers || []);
    sampleCustomer = list.find(c => c.name === 'Anas' || c.name === 'Ashraf') || list[0];
    record('Khata Module', 'Customer List & Balances (/khata/ledger)', khataRes.ok && count >= 20, `Loaded ${count} customers. Sample: ${sampleCustomer?.name} (BHD ${sampleCustomer?.balance || sampleCustomer?.currentBalance})`);
  } catch (err) {
    record('Khata Module', 'Customer List & Balances (/khata/ledger)', false, err.message);
  }

  // MODULE 3: Khata Customer Statement
  if (sampleCustomer) {
    try {
      const stmtRes = await fetch(`${LOCAL_URL}/api/customers/${sampleCustomer.id}/statement`, { headers: headersWithPin });
      const stmtData = await stmtRes.json();
      const entries = Array.isArray(stmtData.statement) ? stmtData.statement.length : 0;
      record('Khata Module', 'Customer Statement (/api/customers/:id/statement)', stmtRes.ok, `Customer: ${sampleCustomer.name}, Ledger Entries: ${entries}, Bal: BHD ${stmtData.currentBalance ?? sampleCustomer.balance}`);
    } catch (err) {
      record('Khata Module', 'Customer Statement (/api/customers/:id/statement)', false, err.message);
    }
  }

  // MODULE 4: Sovereign Freeze & Privacy Kill-Switch
  if (sampleCustomer) {
    try {
      const freezeRes = await fetch(`${LOCAL_URL}/api/khata/${sampleCustomer.id}/freeze`, {
        method: 'POST',
        headers: headersWithPin,
        body: JSON.stringify({ freeze: false }) // ensure active
      });
      const freezeData = await freezeRes.json();
      record('Khata Privacy', 'Self-Freeze & Unlock Endpoint (/api/khata/:id/freeze)', freezeRes.ok && freezeData.success === true, `is_active: ${freezeData.is_active}, message: ${freezeData.message}`);
    } catch (err) {
      record('Khata Privacy', 'Self-Freeze & Unlock Endpoint (/api/khata/:id/freeze)', false, err.message);
    }
  }

  // MODULE 5: Mess Groups (Shared Labor Camp Accounts)
  try {
    const messRes = await fetch(`${LOCAL_URL}/api/nfc/mess-groups`, { headers: headersWithPin });
    const messData = await messRes.json();
    const count = Array.isArray(messData) ? messData.length : (messData.groups?.length || 0);
    record('Khata Module', 'Mess Groups Management (/api/nfc/mess-groups)', messRes.ok, `Found ${count} mess group(s)`);
  } catch (err) {
    record('Khata Module', 'Mess Groups Management (/api/nfc/mess-groups)', false, err.message);
  }

  // MODULE 6: Products & Catalog
  try {
    const prodRes = await fetch(`${LOCAL_URL}/api/products`);
    const prodData = await prodRes.json();
    const prods = Array.isArray(prodData) ? prodData : (prodData.products || []);
    record('Product Catalog', 'Products Fetch & Stock (/api/products)', prodRes.ok && prods.length >= 350, `Catalog Count: ${prods.length} items verified`);
  } catch (err) {
    record('Product Catalog', 'Products Fetch & Stock (/api/products)', false, err.message);
  }

  // MODULE 7: Product Barcode & Search
  try {
    const searchRes = await fetch(`${LOCAL_URL}/api/products/search?q=milk`);
    const searchData = await searchRes.json();
    const resultsCount = Array.isArray(searchData) ? searchData.length : (searchData.products?.length || 0);
    record('Product Catalog', 'Product Omnisearch (/api/products/search?q=milk)', searchRes.ok, `Found ${resultsCount} matching items for query "milk"`);
  } catch (err) {
    record('Product Catalog', 'Product Omnisearch (/api/products/search?q=milk)', false, err.message);
  }

  // MODULE 8: Dashboard Financials & Executive Overview
  try {
    const finRes = await fetch(`${LOCAL_URL}/reports/financial?startDate=2026-01-01&endDate=2026-11-15`, { headers: headersWithPin });
    const finData = await finRes.json();
    const revenue = finData.totalRevenue ?? 0;
    const grossProfit = finData.grossProfit ?? 0;
    const txCount = finData.transactionCount ?? 0;
    record('Dashboard Overview', 'Financials & P&L (/reports/financial)', finRes.ok && txCount > 0, `Revenue: BHD ${Number(revenue).toFixed(3)}, Profit: BHD ${Number(grossProfit).toFixed(3)}, Transactions: ${txCount}`);
  } catch (err) {
    record('Dashboard Overview', 'Financials & P&L (/reports/financial)', false, err.message);
  }

  // MODULE 9: Unified Report / Cashflow
  try {
    const uniRes = await fetch(`${LOCAL_URL}/api/reports/unified?range=all`, { headers: headersWithPin });
    const uniData = await uniRes.json();
    const salesAmt = uniData.kpis?.sales ?? 0;
    const txCount = Array.isArray(uniData.transactions) ? uniData.transactions.length : 0;
    record('Dashboard Overview', 'Unified Executive Report (/api/reports/unified)', uniRes.ok && uniData.success === true, `Unified Status: 200, Sales: BHD ${salesAmt.toFixed(3)}, Transactions: ${txCount}`);
  } catch (err) {
    record('Dashboard Overview', 'Unified Executive Report (/api/reports/unified)', false, err.message);
  }

  // MODULE 10: VAT Return & NBR Audit Report
  try {
    const vatRes = await fetch(`${LOCAL_URL}/api/reports/vat-return?startDate=2026-01-01`, { headers: headersWithPin });
    const vatData = await vatRes.json();
    const taxable = vatData.totalTaxableSales ?? vatData.standardRatedSales ?? 0;
    const outputTax = vatData.outputVatCollected ?? 0;
    const netDue = vatData.netVatDueToNBR ?? 0;
    record('Dashboard Overview', 'NBR VAT Return Summary (/api/reports/vat-return)', vatRes.ok && vatData.success === true, `Taxable Supplies: BHD ${Number(taxable).toFixed(3)}, Output VAT: BHD ${Number(outputTax).toFixed(3)}, Net Due NBR: BHD ${Number(netDue).toFixed(3)}`);
  } catch (err) {
    record('Dashboard Overview', 'NBR VAT Return Summary (/api/reports/vat-return)', false, err.message);
  }

  // MODULE 11: Shift Management & Cashier Reconciliation
  try {
    const shiftRes = await fetch(`${LOCAL_URL}/api/shifts/reconciliation?t=${Date.now()}`, { headers: headersWithPin });
    const shiftData = await shiftRes.json();
    record('Shifts & Till', 'Shift Reconciliation (/api/shifts/reconciliation)', shiftRes.ok, `Status: ${shiftRes.status}, Shifts Count: ${Array.isArray(shiftData) ? shiftData.length : 0}`);
  } catch (err) {
    record('Shifts & Till', 'Shift Reconciliation (/api/shifts/reconciliation)', false, err.message);
  }

  // MODULE 12: Register Live Spy & LAN Sync Bridge
  try {
    const spyRes = await fetch(`${LOCAL_URL}/api/register/cart/live?t=${Date.now()}`);
    const spyData = await spyRes.json();
    record('Register Spy', 'Live Cart Spy Widget (/api/register/cart/live)', spyRes.ok, `Active Register Sessions: ${Object.keys(spyData || {}).length}`);
  } catch (err) {
    record('Register Spy', 'Live Cart Spy Widget (/api/register/cart/live)', false, err.message);
  }

  // MODULE 13: BenefitPay Configuration
  try {
    const bpRes = await fetch(`${LOCAL_URL}/api/config/benefit-account`);
    const bpData = await bpRes.json();
    record('Payments Module', 'BenefitPay Merchant Config (/api/config/benefit-account)', bpRes.ok, `Type: ${bpData.accountType || bpData.mode}, Merchant/Tel: ${bpData.mobileNumber || bpData.merchantId || 'Active'}`);
  } catch (err) {
    record('Payments Module', 'BenefitPay Merchant Config (/api/config/benefit-account)', false, err.message);
  }

  // MODULE 14: Customer Khata PWA (Cloudflare / Vercel Production)
  if (sampleCustomer) {
    try {
      const pwaRes = await fetch(`${PWA_URL}/api/khata/${sampleCustomer.id}/tab`);
      const pwaData = await pwaRes.json();
      record('Customer PWA', 'Public Khata Tab Gateway (Vercel Serverless)', pwaRes.ok && pwaData.success === true, `Customer: ${pwaData.name}, Balance: BHD ${pwaData.balance}, Active: ${pwaData.is_active}`);
    } catch (err) {
      record('Customer PWA', 'Public Khata Tab Gateway (Vercel Serverless)', false, err.message);
    }
  }

  // MODULE 15: Cloudflare Edge API
  try {
    const edgeRes = await fetch(`${EDGE_URL}/api/time`);
    const edgeData = await edgeRes.json();
    record('Edge Cloud API', 'Cloudflare Workers Gateway (/api/time)', edgeRes.ok, `Status ${edgeRes.status}, Edge Time: ${edgeData.iso || edgeData.serverTime || 'Active'}`);
  } catch (err) {
    record('Edge Cloud API', 'Cloudflare Workers Gateway (/api/time)', false, err.message);
  }

  // Print Final Summary
  console.log('\n===============================================================');
  console.log('📋 VERIFICATION RESULTS BREAKDOWN:');
  console.log('===============================================================');
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  console.log(`Total Checks: ${results.length} | Passed: ${passedCount} | Failed: ${failedCount}`);

  if (failedCount > 0) {
    console.log('\n⚠️ FAILURES DETECTED:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`❌ [${r.module}] ${r.test}: ${r.details}`);
    }
  } else {
    console.log('🎉 ALL SYSTEM MODULES ARE 100% OPERATIONAL!');
  }
}

runTests().catch(console.error);
