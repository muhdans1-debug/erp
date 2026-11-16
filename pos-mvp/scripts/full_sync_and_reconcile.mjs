import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: 'pos-mvp/.env' });

const local = createClient({ url: 'file:' + path.resolve('pos-mvp', 'local.db').replace(/\\/g, '/') });
const cloud = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

async function syncTable(tableName, pkey = 'id') {
  console.log(`\n--- Synchronizing [${tableName}] ---`);
  const [localRows, cloudRows] = await Promise.all([
    local.execute(`SELECT * FROM "${tableName}"`),
    cloud.execute(`SELECT * FROM "${tableName}"`)
  ]);

  const localMap = new Map(localRows.rows.map(r => [r[pkey], r]));
  const cloudMap = new Map(cloudRows.rows.map(r => [r[pkey], r]));

  console.log(`Initial counts: Local=${localRows.rows.length}, Cloud=${cloudRows.rows.length}`);

  // 1. Sync Local -> Cloud (rows in Local missing from Cloud)
  let toCloud = 0;
  for (const [key, row] of localMap) {
    if (!cloudMap.has(key)) {
      const cols = Object.keys(row).filter(k => row[k] !== undefined);
      const placeholders = cols.map(() => '?').join(', ');
      await cloud.execute({
        sql: `INSERT OR REPLACE INTO "${tableName}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
        args: cols.map(k => row[k])
      });
      toCloud++;
    }
  }

  // 2. Sync Cloud -> Local (rows in Cloud missing from Local)
  let toLocal = 0;
  for (const [key, row] of cloudMap) {
    if (!localMap.has(key)) {
      const cols = Object.keys(row).filter(k => row[k] !== undefined);
      const placeholders = cols.map(() => '?').join(', ');
      await local.execute({
        sql: `INSERT OR REPLACE INTO "${tableName}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
        args: cols.map(k => row[k])
      });
      toLocal++;
    }
  }

  console.log(`Synced: ${toCloud} rows pushed to Cloud, ${toLocal} rows pulled to Local.`);
  
  // Re-verify
  const [locFinal, cldFinal] = await Promise.all([
    local.execute(`SELECT count(*) as cnt FROM "${tableName}"`),
    cloud.execute(`SELECT count(*) as cnt FROM "${tableName}"`)
  ]);
  console.log(`Final counts: Local=${locFinal.rows[0].cnt}, Cloud=${cldFinal.rows[0].cnt}`);
}

async function run() {
  console.log('========================================================');
  console.log('🚀 BIDIRECTIONAL MASTER SYNC & KHATA RECONCILIATION');
  console.log('========================================================');

  // STEP 0: Fix legacy cust_nfc_demo_01 in Local DB if present
  try {
    const MOHAMMED_YASEEN_UUID = '5adccc21-0425-4e9b-8fc4-68b037e88f61';
    await local.execute({
      sql: 'UPDATE KhataLedger SET customerId = ? WHERE customerId = ?',
      args: [MOHAMMED_YASEEN_UUID, 'cust_nfc_demo_01']
    });
    await local.execute({
      sql: 'DELETE FROM Customer WHERE id = ?',
      args: ['cust_nfc_demo_01']
    });
    console.log('✅ Local legacy customer mapped to UUID successfully');
  } catch (e) {
    console.warn('Notice on legacy cleanup:', e.message);
  }

  // STEP 1: Sync MessGroup
  await syncTable('MessGroup', 'id');

  // STEP 2: Sync Customer
  await syncTable('Customer', 'id');

  // STEP 3: Sync KhataLedger
  await syncTable('KhataLedger', 'id');

  // STEP 4: Sync Products
  await syncTable('Product', 'id');

  // STEP 5: Sync Sales
  await syncTable('Sale', 'id');

  // STEP 6: Sync SaleItems
  await syncTable('SaleItem', 'id');

  // STEP 7: Reconcile Customer Balances based on KhataLedger
  console.log('\n--- Reconciling Customer Balances from Raw Ledger ---');
  const reconcileSql = `
    UPDATE Customer 
    SET balance = ROUND(COALESCE((
      SELECT SUM(amount) FROM KhataLedger WHERE customerId = Customer.id
    ), 0.0), 3)
  `;
  await Promise.all([
    local.execute(reconcileSql),
    cloud.execute(reconcileSql)
  ]);
  console.log('✅ Customer balances mathematically reconciled in both Local and Cloud!');

  // STEP 8: Verification & Receivables Audit
  console.log('\n========================================================');
  console.log('📊 RECONCILED KHATA AUDIT & RECEIVABLES SUMMARY');
  console.log('========================================================');
  const [custAuditLocal, custAuditCloud] = await Promise.all([
    local.execute(`
      SELECT COUNT(*) as totalCust,
             ROUND(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 3) as totalReceivables,
             ROUND(SUM(CASE WHEN balance < 0 THEN ABS(balance) ELSE 0 END), 3) as advanceCredit
      FROM Customer
    `),
    cloud.execute(`
      SELECT COUNT(*) as totalCust,
             ROUND(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 3) as totalReceivables,
             ROUND(SUM(CASE WHEN balance < 0 THEN ABS(balance) ELSE 0 END), 3) as advanceCredit
      FROM Customer
    `)
  ]);

  console.log('Local DB:', custAuditLocal.rows[0]);
  console.log('Cloud DB:', custAuditCloud.rows[0]);

  // List all customers with non-zero balances
  const openTabs = await local.execute(`
    SELECT id, name, phone, balance, credit_limit, is_active
    FROM Customer
    WHERE ABS(balance) > 0.0005
    ORDER BY balance DESC
  `);
  console.log(`\nActive Debtors / Accounts with Balance (${openTabs.rows.length}):`);
  for (const c of openTabs.rows) {
    console.log(`• ${c.name} (${c.id}): BHD ${Number(c.balance).toFixed(3)} [Limit: BHD ${c.credit_limit}] (Active: ${c.is_active})`);
  }
}

run().catch(console.error);
