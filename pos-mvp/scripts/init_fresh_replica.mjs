import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localDbPath = path.resolve(__dirname, '../local.db');

console.log('🔄 Initializing fresh LibSQL replica at:', localDbPath);
const client = createClient({
  url: `file:${localDbPath.replace(/\\/g, '/')}`,
  syncUrl: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function main() {
  console.log('Calling client.sync()...');
  const res = await client.sync();
  console.log('Sync result:', res);

  const count = await client.execute('SELECT count(*) as cnt FROM Sale');
  console.log('Synced Sales count:', count.rows[0].cnt);

  const prodCount = await client.execute('SELECT count(*) as cnt FROM Product');
  console.log('Synced Products count:', prodCount.rows[0].cnt);

  const khataCount = await client.execute('SELECT count(*) as cnt FROM KhataLedger');
  console.log('Synced KhataLedger count:', khataCount.rows[0].cnt);

  const seq = await client.execute('SELECT * FROM InvoiceSequence LIMIT 1');
  console.log('Synced InvoiceSequence:', seq.rows[0]);

  console.log('Testing write transaction on new replica...');
  const tx = await client.transaction('write');
  console.log('Write transaction opened successfully!');
  await tx.rollback();
  console.log('Write transaction rolled back successfully!');

  client.close();
  console.log('✅ FRESH REPLICA INITIALIZED AND VERIFIED PERFECTLY!');
}

main().catch(console.error);

