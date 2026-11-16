import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localDbPath = path.resolve(__dirname, '../local.db');

const client = createClient({
  url: `file:${localDbPath.replace(/\\/g, '/')}`,
  syncUrl: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function test() {
  console.log('Testing select on local replica:');
  const r = await client.execute('SELECT count(*) as cnt FROM Sale');
  console.log('Sale count:', r.rows);

  console.log('Testing sync():');
  try {
    const syncRes = await client.sync();
    console.log('Sync result:', syncRes);
  } catch (err) {
    console.error('client.sync() error:', err);
  }

  console.log('Testing write transaction:');
  try {
    const tx = await client.transaction('write');
    console.log('Transaction opened successfully');
    await tx.rollback();
  } catch (err) {
    console.error('client.transaction() error:', err);
  }
}

test().catch(console.error);

