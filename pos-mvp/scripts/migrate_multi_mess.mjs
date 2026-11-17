// pos-mvp/scripts/migrate_multi_mess.mjs
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env from pos-mvp or root
if (fs.existsSync('pos-mvp/.env')) {
  dotenv.config({ path: 'pos-mvp/.env' });
} else {
  dotenv.config();
}

const dbTargets = [
  { name: 'POS MVP Local Replica (pos-mvp/local.db)', url: 'file:pos-mvp/local.db' },
  { name: 'Root Local Replica (local.db)', url: 'file:local.db' }
];

if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
  dbTargets.push({
    name: 'Turso Cloud Replica',
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
}

async function runMigration() {
  console.log('🚀 [Migration] Starting Multi-Mess Junction & Attribution Migration...\n');

  for (const target of dbTargets) {
    console.log(`📡 Connecting to target: ${target.name}...`);
    let client;
    try {
      client = createClient({
        url: target.url,
        authToken: target.authToken
      });
    } catch (err) {
      console.warn(`⚠️ Could not initialize client for ${target.name}:`, err.message);
      continue;
    }

    try {
      // 0. Ensure MessGroup exists
      console.log('  0. Ensuring MessGroup table exists...');
      await client.execute(`
        CREATE TABLE IF NOT EXISTS MessGroup (
          id TEXT PRIMARY KEY,
          tenantId TEXT NOT NULL DEFAULT 'tenant_1',
          group_name TEXT NOT NULL,
          createdAt TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
      `);

      // 1. Create MessMember Junction Table
      console.log('  1. Creating MessMember junction table...');
      await client.execute(`
        CREATE TABLE IF NOT EXISTS MessMember (
          id TEXT PRIMARY KEY,
          tenantId TEXT NOT NULL DEFAULT 'tenant_1',
          mess_id TEXT NOT NULL,
          customer_id TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'MEMBER',
          is_active INTEGER NOT NULL DEFAULT 1,
          joined_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          FOREIGN KEY (mess_id) REFERENCES MessGroup (id) ON DELETE CASCADE,
          FOREIGN KEY (customer_id) REFERENCES Customer (id) ON DELETE CASCADE,
          UNIQUE(mess_id, customer_id)
        );
      `);

      await client.execute(`CREATE INDEX IF NOT EXISTS idx_messmember_cust ON MessMember (customer_id);`);
      await client.execute(`CREATE INDEX IF NOT EXISTS idx_messmember_mess ON MessMember (mess_id);`);

      // 2. Safely add columns to KhataLedger
      console.log('  2. Checking/Adding attribution columns to KhataLedger...');
      const ledgerInfo = await client.execute(`PRAGMA table_info(KhataLedger);`);
      const existingCols = (ledgerInfo.rows || []).map(r => r.name);

      if (!existingCols.includes('mess_id')) {
        await client.execute(`ALTER TABLE KhataLedger ADD COLUMN mess_id TEXT;`);
        console.log('     + Added column mess_id');
      }
      if (!existingCols.includes('sale_id')) {
        await client.execute(`ALTER TABLE KhataLedger ADD COLUMN sale_id TEXT;`);
        console.log('     + Added column sale_id');
      }
      if (!existingCols.includes('group_total')) {
        await client.execute(`ALTER TABLE KhataLedger ADD COLUMN group_total REAL;`);
        console.log('     + Added column group_total');
      }
      if (!existingCols.includes('member_count')) {
        await client.execute(`ALTER TABLE KhataLedger ADD COLUMN member_count INTEGER;`);
        console.log('     + Added column member_count');
      }

      await client.execute(`CREATE INDEX IF NOT EXISTS idx_khataledger_mess ON KhataLedger (mess_id);`);

      // 3. Backfill existing Customer.mess_id into MessMember
      console.log('  3. Backfilling legacy Customer.mess_id into MessMember...');
      const backfillRes = await client.execute(`
        INSERT OR IGNORE INTO MessMember (id, tenantId, mess_id, customer_id, role, is_active, joined_at)
        SELECT 
          'mm_' || lower(hex(randomblob(8))),
          'tenant_1',
          mess_id,
          id,
          'MEMBER',
          1,
          datetime('now')
        FROM Customer
        WHERE mess_id IS NOT NULL AND trim(mess_id) != '';
      `);
      console.log(`     Backfilled ${backfillRes.rowsAffected || 0} legacy memberships.`);

      // 4. Verify counts
      const memberCount = await client.execute(`SELECT COUNT(*) as cnt FROM MessMember;`);
      const groupCount = await client.execute(`SELECT COUNT(*) as cnt FROM MessGroup;`);
      console.log(`  ✅ Done on ${target.name}: ${memberCount.rows[0]?.cnt || 0} MessMember rows across ${groupCount.rows[0]?.cnt || 0} MessGroup(s).\n`);

    } catch (err) {
      console.error(`❌ Migration error on ${target.name}:`, err.message);
    }
  }

  console.log('🏁 [Migration] Multi-Mess Database Migration Completed Successfully!');
}

runMigration().catch(console.error);
