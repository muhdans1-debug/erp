import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'askar_offline_clean.db');

async function main() {
  const client = createClient({ url: `file:${dbPath.replace(/\\/g, '/')}` });
  
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('Tables:', tables.rows);

  try {
    const total = await client.execute("SELECT count(*) as cnt FROM offline_sales");
    console.log('Total sales in offline_sales:', total.rows);

    const pending = await client.execute("SELECT id, timestamp, synced, payload FROM offline_sales WHERE synced = 0");
    console.log('Pending count (synced = 0):', pending.rows.length);

    for (const r of pending.rows) {
      console.log('--------------------------------------------------');
      console.log('Row ID:', r.id);
      console.log('Timestamp:', r.timestamp);
      console.log('Synced:', r.synced);
      console.log('Payload:', r.payload);
    }

    const all = await client.execute("SELECT id, timestamp, synced FROM offline_sales");
    console.log('All offline_sales rows:', all.rows);
  } catch (err) {
    console.error('Error querying offline_sales:', err.message);
  }
}

main().catch(console.error);
