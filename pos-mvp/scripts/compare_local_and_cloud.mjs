import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localDbPath = path.resolve(__dirname, '../local.db');

const local = createClient({
  url: `file:${localDbPath.replace(/\\/g, '/')}`
});

const cloud = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function compare() {
  const tables = ['Sale', 'SaleItem', 'Product', 'Customer', 'KhataLedger', 'InvoiceSequence'];
  console.log('Comparing local.db vs Turso Cloud:');
  for (const t of tables) {
    try {
      const locRes = await local.execute(`SELECT count(*) as cnt FROM "${t}"`);
      const cldRes = await cloud.execute(`SELECT count(*) as cnt FROM "${t}"`);
      console.log(`Table ${t}: Local = ${locRes.rows[0].cnt}, Cloud = ${cldRes.rows[0].cnt}`);
    } catch (err) {
      console.log(`Table ${t} error:`, err.message);
    }
  }
}

compare().catch(console.error);

