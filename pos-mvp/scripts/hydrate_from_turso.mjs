import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables if present
const tursoUrl = process.env.TURSO_DATABASE_URL || 'libsql://askar-pos-primary-muhdans1.aws-ap-south-1.turso.io';
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN || '';

const localDbPath = path.resolve(__dirname, '../local.db');

console.log('🔄 [Disaster Recovery Hydration] Starting hydration from Turso Cloud...');
console.log(`🌐 Turso Cloud URL: ${tursoUrl}`);
console.log(`💾 Local Target: ${localDbPath}`);

const cloud = createClient({
  url: tursoUrl,
  authToken: tursoAuthToken
});

const local = createClient({
  url: `file:${localDbPath}`
});

async function hydrate() {
  try {
    // 1. Fetch tables from Turso
    const tablesRes = await cloud.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%'");
    const tableNames = tablesRes.rows.map(r => r.name);
    console.log(`📋 Found ${tableNames.length} tables in Turso Cloud: ${tableNames.join(', ')}`);

    // 2. Fetch schema definitions from schema.sql or Turso
    const schemaSqlPath = path.resolve(__dirname, '../schema.sql');
    if (fs.existsSync(schemaSqlPath)) {
      console.log('📦 Applying base schema from schema.sql...');
      const schemaSql = fs.readFileSync(schemaSqlPath, 'utf8');
      const statements = schemaSql.split(';').map(s => s.trim()).filter(Boolean);
      for (const stmt of statements) {
        await local.execute(stmt).catch(() => {});
      }
    }

    // 3. Hydrate each table
    for (const table of tableNames) {
      console.log(`⏳ Replicating table: ${table}...`);
      const rowsRes = await cloud.execute(`SELECT * FROM "${table}"`);
      if (rowsRes.rows.length === 0) {
        console.log(`ℹ️ ${table} is empty. Skipping.`);
        continue;
      }

      const columns = Object.keys(rowsRes.rows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const insertSql = `INSERT OR REPLACE INTO "${table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;

      let inserted = 0;
      for (const row of rowsRes.rows) {
        const values = columns.map(c => row[c]);
        await local.execute({ sql: insertSql, args: values });
        inserted++;
      }
      console.log(`✅ ${table}: Replicated ${inserted} records.`);
    }

    // 4. Verify InvoiceSequence
    const seqCheck = await local.execute('SELECT * FROM InvoiceSequence LIMIT 1').catch(() => ({ rows: [] }));
    if (seqCheck.rows.length > 0) {
      console.log(`🔢 [NBR Compliance] InvoiceSequence confirmed: current_seq = ${seqCheck.rows[0].current_seq}`);
    }

    console.log('🎉 [Hydration Complete] Local database fully reconstructed from Turso Cloud!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Hydration error:', err);
    process.exit(1);
  }
}

hydrate();

