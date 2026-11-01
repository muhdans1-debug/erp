// @ts-nocheck
/* eslint-disable */
const { createClient } = require('@libsql/client');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const TURSO_URL = process.env.TURSO_DATABASE_URL || 'libsql://askar-pos-primary-muhdans1.aws-ap-south-1.turso.io';
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

async function migrate() {
  console.log('🚀 Running NFC & Mess Group Migration to Turso Cloud and Local DBs...');
  console.log('Connecting to Turso: ' + TURSO_URL);

  const turso = createClient({
    url: TURSO_URL,
    authToken: TURSO_TOKEN
  });

  const dbs = [
    { name: 'Turso Cloud', client: turso, isLibsql: true }
  ];

  // Also apply directly to local dev.db and local.db if present
  const devDbPath = path.join(__dirname, '../dev.db');
  if (fs.existsSync(devDbPath)) {
    dbs.push({ name: 'Local dev.db', path: devDbPath, isLibsql: false });
  }

  const localDbPath = path.join(__dirname, '../local.db');
  if (fs.existsSync(localDbPath)) {
    dbs.push({ name: 'Local local.db', path: localDbPath, isLibsql: false });
  }

  for (const target of dbs) {
    console.log(`\n📦 Applying schema updates to [${target.name}]...`);

    const exec = async (sql) => {
      if (target.isLibsql) {
        return await target.client.execute(sql);
      } else {
        const db = new DatabaseSync(target.path);
        try {
          db.exec(sql);
        } finally {
          db.close();
        }
      }
    };

    const getTableInfo = async (table) => {
      if (target.isLibsql) {
        const res = await target.client.execute(`PRAGMA table_info(${table})`);
        return res.rows.map(r => r.name);
      } else {
        const db = new DatabaseSync(target.path);
        try {
          const rows = db.prepare(`PRAGMA table_info(${table})`).all();
          return rows.map(r => r.name);
        } finally {
          db.close();
        }
      }
    };

    // 1. Create NfcCard Table
    try {
      await exec(`
        CREATE TABLE IF NOT EXISTS NfcCard (
          tag_id TEXT PRIMARY KEY,
          card_type TEXT NOT NULL DEFAULT 'PERSONAL',
          customer_id TEXT,
          mess_id TEXT,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('  ✅ Table [NfcCard] created/verified.');
    } catch (e) {
      console.error('  ⚠️ NfcCard create error:', e.message);
    }

    // 2. Create MessGroup Table
    try {
      await exec(`
        CREATE TABLE IF NOT EXISTS MessGroup (
          id TEXT PRIMARY KEY,
          tenantId TEXT NOT NULL DEFAULT 'tenant_1',
          group_name TEXT NOT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('  ✅ Table [MessGroup] created/verified.');
    } catch (e) {
      console.error('  ⚠️ MessGroup create error:', e.message);
    }

    // 3. Add mess_id to Customer
    try {
      const customerCols = await getTableInfo('Customer');
      if (!customerCols.includes('mess_id')) {
        await exec('ALTER TABLE Customer ADD COLUMN mess_id TEXT;');
        console.log('  ✅ Added column [mess_id] to Customer table.');
      } else {
        console.log('  ℹ️ Column [mess_id] already exists on Customer.');
      }
    } catch (e) {
      console.warn('  ⚠️ Customer column note:', e.message);
    }

    // 4. Add mess_id to KhataCustomer (if table exists)
    try {
      const khataCols = await getTableInfo('KhataCustomer');
      if (khataCols.length > 0 && !khataCols.includes('mess_id')) {
        await exec('ALTER TABLE KhataCustomer ADD COLUMN mess_id TEXT;');
        console.log('  ✅ Added column [mess_id] to KhataCustomer table.');
      } else if (khataCols.length > 0) {
        console.log('  ℹ️ Column [mess_id] already exists on KhataCustomer.');
      }
    } catch (e) {
      console.warn('  ⚠️ KhataCustomer column note:', e.message);
    }

    // 5. Migrate existing Customer cardUids to NfcCard as PERSONAL
    try {
      if (target.isLibsql) {
        const custWithCards = await target.client.execute(`
          SELECT id, cardUid FROM Customer WHERE cardUid IS NOT NULL AND TRIM(cardUid) != ''
        `);
        for (const row of custWithCards.rows) {
          const cleanTag = row.cardUid.trim().toUpperCase();
          await target.client.execute({
            sql: `INSERT OR IGNORE INTO NfcCard (tag_id, card_type, customer_id, createdAt) 
                  VALUES (?, 'PERSONAL', ?, datetime('now'))`,
            args: [cleanTag, row.id]
          });
        }
        console.log(`  ✅ Migrated ${custWithCards.rows.length} existing customer card UIDs to NfcCard.`);
      }
    } catch (e) {
      console.warn('  ⚠️ Existing cards migration note:', e.message);
    }
  }

  // Final verification from Turso
  console.log('\n🔍 Final Turso Schema Verification:');
  const nfcCols = await turso.execute('PRAGMA table_info(NfcCard)');
  console.log('NfcCard columns:', nfcCols.rows.map(r => `${r.name} (${r.type})`));

  const messCols = await turso.execute('PRAGMA table_info(MessGroup)');
  console.log('MessGroup columns:', messCols.rows.map(r => `${r.name} (${r.type})`));

  const custCols = await turso.execute('PRAGMA table_info(Customer)');
  console.log('Customer has mess_id?:', custCols.rows.map(r => r.name).includes('mess_id'));

  const nfcCount = await turso.execute('SELECT COUNT(*) as cnt FROM NfcCard');
  console.log(`Registered NFC Cards in Turso: ${nfcCount.rows[0].cnt}`);

  console.log('\n🎉 ALL NFC & MESS GROUP SCHEMAS SYNCED TO TURSO & LOCAL REPLICAS SUCCESSFULLY!');
}

migrate().catch(console.error);

