// @ts-nocheck
/* eslint-disable */
const { createClient } = require('@libsql/client');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const TURSO_URL = process.env.TURSO_DATABASE_URL || 'libsql://askar-pos-primary-muhdans1.aws-ap-south-1.turso.io';
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || '';

async function migrate() {
  console.log('🚀 Connecting to Turso Cloud Database: ' + TURSO_URL);
  const turso = createClient({
    url: TURSO_URL,
    authToken: TURSO_TOKEN
  });

  const localDbPath = path.join(__dirname, '../dev.db');
  const localDb = new DatabaseSync(localDbPath);

  // Extract all table schemas from local SQLite dev.db
  const schemaRows = localDb.prepare(`
    SELECT type, name, sql 
    FROM sqlite_master 
    WHERE type IN ('table', 'index') 
      AND name NOT LIKE 'sqlite_%' 
      AND sql IS NOT NULL
    ORDER BY type DESC, name ASC
  `).all();

  console.log(`📋 Found ${schemaRows.length} schema definitions (tables and indexes) in local SQLite database.`);

  for (const row of schemaRows) {
    try {
      console.log(`⏳ Applying ${row.type}: ${row.name}...`);
      await turso.execute(row.sql);
      console.log(`✅ Applied ${row.type}: ${row.name}`);
    } catch (err) {
      if (err.message && (err.message.includes('already exists') || err.message.includes('table already exists'))) {
        console.log(`ℹ️ ${row.type} ${row.name} already exists in Turso.`);
      } else {
        console.error(`⚠️ Error creating ${row.name}:`, err.message);
      }
    }
  }

  // Ensure is_weighed_item column on Product if needed
  try {
    const prodTableInfo = await turso.execute('PRAGMA table_info(Product)');
    const cols = prodTableInfo.rows.map(r => r.name);
    if (!cols.includes('is_weighed_item')) {
      console.log('Adding is_weighed_item column to Turso Product table...');
      await turso.execute('ALTER TABLE Product ADD COLUMN is_weighed_item INTEGER DEFAULT 0');
      console.log('✅ Added is_weighed_item column to Turso Product table.');
    }
  } catch (err) {
    console.warn('Note on table_info:', err.message);
  }

  // Verify migrated tables
  const remoteTables = await turso.execute(`
    SELECT name 
    FROM sqlite_master 
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name ASC
  `);

  console.log('\n🎉 Successfully Migrated Schema to Turso Cloud Cluster:');
  console.log('----------------------------------------------------');
  remoteTables.rows.forEach(r => console.log(`  - 📦 ${r.name}`));
  console.log('----------------------------------------------------');
  console.log(`Total Remote Tables: ${remoteTables.rows.length}`);
}

migrate().catch(console.error);
