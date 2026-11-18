import { client, tursoCloudClient } from '../db.js';

async function main() {
  if (!tursoCloudClient) {
    console.error('No tursoCloudClient available!');
    process.exit(1);
  }

  console.log('🔄 Starting Full KhataLedger & Customer Balance Cloud Reconciliation...');

  // 1. Get all KhataLedger rows from local.db
  const localRows = await client.execute('SELECT * FROM KhataLedger');
  // 2. Get all KhataLedger rows from Turso Cloud
  const cloudRows = await tursoCloudClient.execute('SELECT id FROM KhataLedger');
  const cloudIdSet = new Set(cloudRows.rows.map(r => r.id));

  const missing = localRows.rows.filter(r => !cloudIdSet.has(r.id));
  console.log(`Found ${missing.length} missing KhataLedger rows to sync to Turso Cloud.`);

  // Push missing rows in batches of 20
  const batchSize = 20;
  for (let i = 0; i < missing.length; i += batchSize) {
    const chunk = missing.slice(i, i + batchSize);
    const statements = chunk.map(r => ({
      sql: `INSERT INTO KhataLedger (
        id, tenantId, customerId, amount, type, reference,
        running_balance, syncStatus, timestamp, created_at,
        storeId, mess_id, sale_id, group_total, member_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        syncStatus = 'SYNCED',
        running_balance = excluded.running_balance,
        mess_id = excluded.mess_id,
        sale_id = excluded.sale_id`,
      args: [
        r.id,
        r.tenantId || 'tenant_askar_01',
        r.customerId,
        r.amount,
        r.type,
        r.reference || null,
        r.running_balance ?? 0,
        r.timestamp || r.created_at || new Date().toISOString(),
        r.created_at || new Date().toISOString(),
        r.storeId || 'store_askar_01',
        r.mess_id || null,
        r.sale_id || null,
        r.group_total || null,
        r.member_count || null
      ]
    }));

    await tursoCloudClient.batch(statements, 'write');
    console.log(`  ✓ Pushed batch ${Math.floor(i / batchSize) + 1} (${chunk.length} rows)`);
  }

  // 3. Reconcile Customer balances in Turso Cloud from KhataLedger sum
  console.log('🔄 Recalculating and syncing Customer balances in Turso Cloud...');
  const customers = await client.execute('SELECT id, name, balance FROM Customer');
  
  for (const c of customers.rows) {
    // Calculate ledger sum in local
    const lsumRes = await client.execute({
      sql: 'SELECT ROUND(COALESCE(SUM(amount), 0), 3) as s FROM KhataLedger WHERE customerId = ?',
      args: [c.id]
    });
    const trueBal = Number(lsumRes.rows[0].s || 0);

    // Update Customer in Turso Cloud
    await tursoCloudClient.execute({
      sql: `UPDATE Customer SET balance = ?, updatedAt = datetime('now') WHERE id = ?`,
      args: [trueBal, c.id]
    });
    // Also ensure local Customer has trueBal
    await client.execute({
      sql: `UPDATE Customer SET balance = ? WHERE id = ?`,
      args: [trueBal, c.id]
    });
  }

  // 4. Verify Ashraf specifically
  const aLocal = await client.execute({
    sql: 'SELECT id, name, balance FROM Customer WHERE id = ?',
    args: ['9e0649d4-b811-45b2-b2b2-b6bab3a7ed8e']
  });
  const aCloud = await tursoCloudClient.execute({
    sql: 'SELECT id, name, balance FROM Customer WHERE id = ?',
    args: ['9e0649d4-b811-45b2-b2b2-b6bab3a7ed8e']
  });
  const aLocalLedger = await client.execute({
    sql: 'SELECT count(*) as c, ROUND(SUM(amount), 3) as s FROM KhataLedger WHERE customerId = ?',
    args: ['9e0649d4-b811-45b2-b2b2-b6bab3a7ed8e']
  });
  const aCloudLedger = await tursoCloudClient.execute({
    sql: 'SELECT count(*) as c, ROUND(SUM(amount), 3) as s FROM KhataLedger WHERE customerId = ?',
    args: ['9e0649d4-b811-45b2-b2b2-b6bab3a7ed8e']
  });

  console.log('\n=== RECONCILIATION RESULT FOR ASHRAF ===');
  console.log('Local Ashraf Balance:', aLocal.rows[0].balance, 'Ledger sum:', aLocalLedger.rows[0].s, 'Count:', aLocalLedger.rows[0].c);
  console.log('Cloud Ashraf Balance:', aCloud.rows[0].balance, 'Ledger sum:', aCloudLedger.rows[0].s, 'Count:', aCloudLedger.rows[0].c);
  console.log('Balance Difference:', Math.abs(aLocal.rows[0].balance - aCloud.rows[0].balance));
  
  if (Math.abs(aLocal.rows[0].balance - aCloud.rows[0].balance) < 0.0001) {
    console.log('✅ ZERO-DRIFT ATTAINED! Ashraf balances match perfectly at BD ' + Number(aLocal.rows[0].balance).toFixed(3));
  } else {
    console.error('❌ Mismatch remains!');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
