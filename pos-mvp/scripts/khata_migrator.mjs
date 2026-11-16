import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: 'pos-mvp/.env' });

/**
 * Parses an old layali.db SQLite database file and extracts all parties and their net balances.
 * @param {string} oldDbFilePath - Absolute or relative path to old layali.db
 */
export async function parseOldLayaliDb(oldDbFilePath) {
  const normPath = 'file:' + path.resolve(oldDbFilePath).replace(/\\/g, '/');
  const oldClient = createClient({ url: normPath });

  // 1. Check columns in parties table
  const pColsRes = await oldClient.execute("PRAGMA table_info(parties)");
  const pCols = pColsRes.rows.map(r => r.name);
  const hasIsDeletedParty = pCols.includes('is_deleted');

  // 2. Check columns in transactions table
  const tColsRes = await oldClient.execute("PRAGMA table_info(transactions)");
  const tCols = tColsRes.rows.map(r => r.name);
  const hasIsDeletedTx = tCols.includes('is_deleted');

  // 3. Fetch all parties
  const partySql = `
    SELECT id, name, phone, address, description ${hasIsDeletedParty ? ', is_deleted' : ''}
    FROM parties
    ${hasIsDeletedParty ? 'WHERE is_deleted = 0' : ''}
    ORDER BY id ASC
  `;
  const partiesRes = await oldClient.execute(partySql);

  // 4. Fetch aggregated balances from transactions
  // Old software type: 'sale' (credit charge) vs 'payment_in' (cash payment)
  const txSql = `
    SELECT 
      party_id,
      SUM(CASE WHEN lower(type) IN ('sale', 'give', 'charge', 'debit') THEN amount_fils ELSE 0 END) as total_sales_fils,
      SUM(CASE WHEN lower(type) IN ('payment_in', 'got', 'pay', 'payment', 'credit') THEN amount_fils ELSE 0 END) as total_payments_fils,
      COUNT(id) as tx_count,
      MAX(timestamp) as last_tx_date
    FROM transactions
    ${hasIsDeletedTx ? 'WHERE is_deleted = 0' : ''}
    GROUP BY party_id
  `;
  const txRes = await oldClient.execute(txSql);
  const txMap = new Map();
  for (const r of txRes.rows) {
    txMap.set(r.party_id, r);
  }

  // 5. Combine parties with their balances
  const customers = [];
  let totalOutstandingBhd = 0;

  for (const p of partiesRes.rows) {
    const tx = txMap.get(p.id) || { total_sales_fils: 0, total_payments_fils: 0, tx_count: 0, last_tx_date: null };
    const salesFils = Number(tx.total_sales_fils || 0);
    const paymentsFils = Number(tx.total_payments_fils || 0);
    const netFils = salesFils - paymentsFils;
    const balanceBhd = Math.round(netFils) / 1000; // 1000 fils = 1.000 BHD

    totalOutstandingBhd += balanceBhd;

    // Clean phone number: remove non-digits except '+'
    let cleanPhone = (p.phone || '').trim();
    if (cleanPhone === '+973' || cleanPhone === '+97300000000' || cleanPhone === '0') {
      cleanPhone = '';
    }

    customers.push({
      oldPartyId: p.id,
      name: (p.name || '').trim(),
      phone: cleanPhone || null,
      address: (p.address || '').trim() || null,
      description: (p.description || '').trim() || null,
      totalSalesBhd: salesFils / 1000,
      totalPaymentsBhd: paymentsFils / 1000,
      balanceBhd: balanceBhd,
      txCount: Number(tx.tx_count || 0),
      lastTxDate: tx.last_tx_date
    });
  }

  return {
    totalParties: customers.length,
    totalOutstandingBhd: Math.round(totalOutstandingBhd * 1000) / 1000,
    customersWithBalance: customers.filter(c => Math.abs(c.balanceBhd) > 0.0001),
    customers
  };
}

/**
 * CLI Runner
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'preview';
  let targetFile = args[1];

  if (!targetFile) {
    // Default to local appdata or desktop backup
    const appDataDb = path.resolve(process.env.APPDATA || '', 'com.layali.erp', 'layali.db');
    const desktopBackup = 'C:/Users/ACER/Desktop/layali_backup_2026-09-04.db';

    if (fs.existsSync(appDataDb)) {
      targetFile = appDataDb;
    } else if (fs.existsSync(desktopBackup)) {
      targetFile = desktopBackup;
    } else {
      console.error('Please specify the path to layali.db: node khata_migrator.mjs <preview|import> <path/to/layali.db>');
      process.exit(1);
    }
  }

  console.log(`[Khata Migrator] Target DB: ${targetFile}`);
  console.log(`[Khata Migrator] Mode: ${command.toUpperCase()}`);

  const parsed = await parseOldLayaliDb(targetFile);

  console.log(`\n================ KHATA AUDIT SUMMARY ================`);
  console.log(`Total Customers (Parties) found: ${parsed.totalParties}`);
  console.log(`Customers with Outstanding Balance: ${parsed.customersWithBalance.length}`);
  console.log(`Total Outstanding Khata Debt: ${parsed.totalOutstandingBhd.toFixed(3)} BHD`);
  console.log(`=====================================================\n`);

  if (command === 'preview') {
    console.log(`Top 20 Customers with Highest Balance:`);
    const sorted = [...parsed.customers].sort((a, b) => b.balanceBhd - a.balanceBhd);
    for (const c of sorted.slice(0, 20)) {
      console.log(`- [ID: ${c.oldPartyId}] ${c.name.padEnd(25)} | Phone: ${(c.phone || 'N/A').padEnd(14)} | Balance: ${c.balanceBhd.toFixed(3)} BHD (${c.txCount} txs)`);
    }

    // Export preview JSON for inspection
    const outJson = path.resolve('pos-mvp/scripts/old_khata_preview.json');
    fs.writeFileSync(outJson, JSON.stringify(parsed, null, 2), 'utf8');
    console.log(`\nFull preview exported to: ${outJson}`);
    console.log(`To import this data into the active ERP database, run:`);
    console.log(`node pos-mvp/scripts/khata_migrator.mjs import "${targetFile}"`);
    return;
  }

  if (command === 'import') {
    console.log(`\nStarting sync to Target ERP Database...`);
    const dbUrl = process.env.TURSO_DATABASE_URL || 'file:pos-mvp/local.db';
    const authToken = process.env.TURSO_AUTH_TOKEN;
    const targetClient = createClient({ url: dbUrl, authToken });

    // Fetch existing customers in current ERP
    const existingRes = await targetClient.execute("SELECT id, name, phone, balance FROM Customer");
    const existingByPhone = new Map();
    const existingByName = new Map();
    for (const r of existingRes.rows) {
      if (r.phone) existingByPhone.set(r.phone.replace(/[^0-9]/g, ''), r);
      if (r.name) existingByName.set(r.name.trim().toLowerCase(), r);
    }

    console.log(`Existing ERP customers: ${existingRes.rows.length}`);

    let updatedCount = 0;
    let createdCount = 0;
    let skippedCount = 0;
    const nowIso = new Date().toISOString();

    for (const c of parsed.customers) {
      if (!c.name) {
        skippedCount++;
        continue;
      }

      // Check match by phone, then by exact name
      const phoneDigits = (c.phone || '').replace(/[^0-9]/g, '');
      const existing = (phoneDigits ? existingByPhone.get(phoneDigits) : null) || existingByName.get(c.name.toLowerCase());

      const creditLimit = Math.max(30.0, Math.ceil(c.balanceBhd * 1.5));

      if (existing) {
        // Update existing customer balance
        await targetClient.execute({
          sql: `UPDATE Customer SET balance = ?, credit_limit = MAX(credit_limit, ?), updatedAt = ? WHERE id = ?`,
          args: [c.balanceBhd, creditLimit, nowIso, existing.id]
        });

        // Insert opening adjustment into KhataLedger if non-zero
        if (Math.abs(c.balanceBhd) > 0.0001) {
          const ledgerId = 'mig_' + crypto.randomUUID();
          await targetClient.execute({
            sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, running_balance, reference, syncStatus, timestamp, created_at)
                  VALUES (?, 'tenant_1', ?, ?, 'CHARGE', ?, 'OLD_LAYALI_MIGRATION', 'SYNCED', ?, ?)`,
            args: [ledgerId, existing.id, c.balanceBhd, c.balanceBhd, nowIso, nowIso]
          });
        }
        updatedCount++;
      } else {
        // Create new customer
        const customerId = 'cust_' + crypto.randomUUID();
        await targetClient.execute({
          sql: `INSERT INTO Customer (id, tenantId, name, phone, description, balance, credit_limit, is_active, isActive, createdAt, updatedAt)
                VALUES (?, 'tenant_1', ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
          args: [customerId, c.name, c.phone, c.address || c.description, c.balanceBhd, creditLimit, nowIso, nowIso]
        });

        if (Math.abs(c.balanceBhd) > 0.0001) {
          const ledgerId = 'mig_' + crypto.randomUUID();
          await targetClient.execute({
            sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, running_balance, reference, syncStatus, timestamp, created_at)
                  VALUES (?, 'tenant_1', ?, ?, 'CHARGE', ?, 'OLD_LAYALI_MIGRATION', 'SYNCED', ?, ?)`,
            args: [ledgerId, customerId, c.balanceBhd, c.balanceBhd, nowIso, nowIso]
          });
        }
        createdCount++;
      }
    }

    console.log(`\nImport Completed Successfully!`);
    console.log(`- Created New Customers: ${createdCount}`);
    console.log(`- Updated Existing Customers: ${updatedCount}`);
    console.log(`- Skipped Empty Names: ${skippedCount}`);
    console.log(`All customer credit balances and Khata ledgers are now in sync!`);
  }
}

main().catch(err => {
  console.error('[Khata Migrator Error]:', err);
  process.exit(1);
});

