import { db } from '../db.js';
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log('🔄 STARTING COMPREHENSIVE KHATA & BOOK BALANCE RECONCILIATION...');
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (!tursoUrl) {
    console.error('❌ TURSO_DATABASE_URL is missing in environment.');
    return;
  }

  const cloud = createClient({ url: tursoUrl, authToken: tursoToken });

  // 1. Reconcile Local -> Cloud (Push missing local ledger entries to Turso Cloud)
  console.log('\n--- Step 1: Pushing Missing Local KhataLedger Entries to Cloud ---');
  const localLedgerRes = await db.execute("SELECT * FROM KhataLedger");
  const cloudLedgerRes = await cloud.execute("SELECT id FROM KhataLedger");
  const cloudLedgerIds = new Set(cloudLedgerRes.rows.map(r => r.id));

  let pushedToCloud = 0;
  for (const entry of localLedgerRes.rows) {
    if (!cloudLedgerIds.has(entry.id)) {
      console.log(`  ➡️ Pushing to Cloud: ${entry.id} (${entry.type} ${entry.amount} BHD - Ref: ${entry.reference}) for Cust: ${entry.customerId}`);
      const ts = entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString();
      await cloud.execute({
        sql: `INSERT INTO KhataLedger (
          id, tenantId, customerId, amount, type, reference,
          running_balance, syncStatus, timestamp, created_at,
          mess_id, sale_id, group_total, member_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          amount = excluded.amount,
          type = excluded.type,
          reference = excluded.reference`,
        args: [
          entry.id,
          entry.tenantId || 'tenant_askar_01',
          entry.customerId,
          entry.amount,
          entry.type,
          entry.reference || null,
          entry.running_balance ?? 0,
          ts,
          entry.created_at ? new Date(entry.created_at).toISOString() : ts,
          entry.mess_id || null,
          entry.sale_id || null,
          entry.group_total ?? null,
          entry.member_count ?? null
        ]
      });
      pushedToCloud++;
    }
  }
  console.log(`✅ Pushed ${pushedToCloud} missing ledger entries to Turso Cloud.`);

  // 2. Reconcile Cloud -> Local (Pull missing cloud ledger entries to Local SQLite)
  console.log('\n--- Step 2: Pulling Missing Cloud KhataLedger Entries to Local ---');
  const freshCloudLedgerRes = await cloud.execute("SELECT * FROM KhataLedger");
  const freshLocalLedgerRes = await db.execute("SELECT id FROM KhataLedger");
  const localLedgerIds = new Set(freshLocalLedgerRes.rows.map(r => r.id));

  let pulledToLocal = 0;
  for (const entry of freshCloudLedgerRes.rows) {
    if (!localLedgerIds.has(entry.id)) {
      console.log(`  ⬅️ Pulling to Local: ${entry.id} (${entry.type} ${entry.amount} BHD - Ref: ${entry.reference}) for Cust: ${entry.customerId}`);
      
      // Ensure customer exists locally first
      const custExists = await db.execute({
        sql: "SELECT id FROM Customer WHERE id = ? LIMIT 1",
        args: [entry.customerId]
      });
      if (!custExists.rows || custExists.rows.length === 0) {
        const cloudCust = await cloud.execute({
          sql: "SELECT * FROM Customer WHERE id = ? LIMIT 1",
          args: [entry.customerId]
        });
        if (cloudCust.rows && cloudCust.rows.length > 0) {
          const c = cloudCust.rows[0];
          await db.execute({
            sql: `INSERT OR REPLACE INTO Customer (
              id, tenantId, name, phone, cpr, batchNo, description,
              cardUid, balance, credit_limit, is_active, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              c.id, c.tenantId || 'tenant_askar_01', c.name, c.phone || null, c.cpr || null,
              c.batchNo || null, c.description || null, c.cardUid || null, c.balance || 0,
              c.credit_limit || 30.0, c.is_active ?? 1, c.createdAt || new Date().toISOString(),
              c.updatedAt || new Date().toISOString()
            ]
          });
        }
      }

      const ts = entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString();
      await db.execute({
        sql: `INSERT INTO KhataLedger (
          id, tenantId, customerId, amount, type, reference,
          running_balance, syncStatus, timestamp, created_at,
          mess_id, sale_id, group_total, member_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          amount = excluded.amount,
          type = excluded.type,
          reference = excluded.reference`,
        args: [
          entry.id,
          entry.tenantId || 'tenant_askar_01',
          entry.customerId,
          entry.amount,
          entry.type,
          entry.reference || null,
          entry.running_balance ?? 0,
          ts,
          entry.created_at ? new Date(entry.created_at).toISOString() : ts,
          entry.mess_id || null,
          entry.sale_id || null,
          entry.group_total ?? null,
          entry.member_count ?? null
        ]
      });
      pulledToLocal++;
    }
  }
  console.log(`✅ Pulled ${pulledToLocal} missing ledger entries to Local SQLite.`);

  // 3. Reconcile missing credit sales into KhataLedger (in both Local & Cloud)
  console.log('\n--- Step 3: Auto-Recover Missing Credit Sales into KhataLedger ---');
  const creditSales = await db.execute({
    sql: `SELECT s.id, s.invoiceNo, s.total, s.createdAt, s.customerId, c.name as customerName 
          FROM Sale s 
          JOIN Customer c ON s.customerId = c.id
          WHERE (s.paymentType = 'CREDIT' OR s.paymentType = 'NFC_CREDIT' OR s.paymentType = 'CREDIT_PERSONAL' OR s.paymentType = 'MESS_KHATA')`,
    args: []
  });

  for (const s of creditSales.rows) {
    const localMatch = await db.execute({
      sql: `SELECT id FROM KhataLedger WHERE customerId = ? AND (reference = ? OR sale_id = ? OR id = ?)`,
      args: [s.customerId, s.invoiceNo, s.id, s.id]
    });

    if (!localMatch.rows || localMatch.rows.length === 0) {
      const ledgerId = `tx_inv_${s.invoiceNo.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      console.log(`  ➕ Generating missing ledger entry for sale ${s.invoiceNo} (${s.total} BHD for ${s.customerName})`);
      const ts = s.createdAt ? new Date(s.createdAt).toISOString() : new Date().toISOString();
      
      // Insert locally
      await db.execute({
        sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, sale_id)
              VALUES (?, 'tenant_askar_01', ?, ?, 'CHARGE', ?, 0, 'SYNCED', ?, ?, ?)
              ON CONFLICT(id) DO NOTHING`,
        args: [ledgerId, s.customerId, s.total, s.invoiceNo, ts, ts, s.id]
      });

      // Insert in cloud
      await cloud.execute({
        sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, sale_id)
              VALUES (?, 'tenant_askar_01', ?, ?, 'CHARGE', ?, 0, 'SYNCED', ?, ?, ?)
              ON CONFLICT(id) DO NOTHING`,
        args: [ledgerId, s.customerId, s.total, s.invoiceNo, ts, ts, s.id]
      });
    }
  }

  // 4. Recalculate chronological running balances and customer balances in BOTH databases
  console.log('\n--- Step 4: Recomputing Chronological Running Balances & Customer Totals ---');
  const allCustomers = await db.execute("SELECT id, name FROM Customer");

  for (const c of allCustomers.rows) {
    // Recompute locally
    const lRes = await db.execute({
      sql: `SELECT id, amount FROM KhataLedger 
            WHERE customerId = ? 
            ORDER BY datetime(COALESCE(created_at, timestamp, '1970-01-01')) ASC, rowid ASC`,
      args: [c.id]
    });

    let running = 0;
    for (const entry of (lRes.rows || [])) {
      running += Number(entry.amount || 0);
      await db.execute({
        sql: "UPDATE KhataLedger SET running_balance = ? WHERE id = ?",
        args: [Number(running.toFixed(3)), entry.id]
      });
    }

    const finalBal = Number(running.toFixed(3));
    await db.execute({
      sql: "UPDATE Customer SET balance = ? WHERE id = ?",
      args: [finalBal, c.id]
    });

    // Recompute in Cloud
    const cloudLRes = await cloud.execute({
      sql: `SELECT id, amount FROM KhataLedger 
            WHERE customerId = ? 
            ORDER BY datetime(COALESCE(created_at, timestamp, '1970-01-01')) ASC, rowid ASC`,
      args: [c.id]
    });

    let cloudRunning = 0;
    for (const entry of (cloudLRes.rows || [])) {
      cloudRunning += Number(entry.amount || 0);
      await cloud.execute({
        sql: "UPDATE KhataLedger SET running_balance = ? WHERE id = ?",
        args: [Number(cloudRunning.toFixed(3)), entry.id]
      });
    }

    const cloudFinalBal = Number(cloudRunning.toFixed(3));
    await cloud.execute({
      sql: "UPDATE Customer SET balance = ? WHERE id = ?",
      args: [cloudFinalBal, c.id]
    });

    if (lRes.rows && lRes.rows.length > 0) {
      console.log(`  👤 ${c.name} (${c.id}): Reconciled ${lRes.rows.length} entries -> Net Balance: BD ${finalBal.toFixed(3)} (Cloud: BD ${cloudFinalBal.toFixed(3)})`);
    }
  }

  console.log('\n🎉 ALL KHATA LEDGERS, PREVIOUS BOOK BALANCES & CUSTOMER BALANCES 100% RECONCILED!');
}

main().catch(console.error).finally(() => process.exit(0));
