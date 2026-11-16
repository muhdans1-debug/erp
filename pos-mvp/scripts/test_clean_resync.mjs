import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDbPath = path.resolve(__dirname, 'test_replica.db');

// Clean up previous test if exists
['', '-wal', '-shm', '-info'].forEach(ext => {
  const f = testDbPath + ext;
  if (fs.existsSync(f)) fs.unlinkSync(f);
});

console.log('Creating fresh embedded replica at:', testDbPath);
const testClient = createClient({
  url: `file:${testDbPath.replace(/\\/g, '/')}`,
  syncUrl: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function run() {
  console.log('1. Calling testClient.sync()...');
  const syncRes = await testClient.sync();
  console.log('Sync result:', syncRes);

  console.log('2. Querying Sale count from fresh replica...');
  const res = await testClient.execute('SELECT count(*) as cnt FROM Sale');
  console.log('Sale count:', res.rows[0].cnt);

  console.log('3. Testing write transaction...');
  const tx = await testClient.transaction('write');
  console.log('Write transaction opened successfully on embedded replica!');
  await tx.rollback();
  console.log('Write transaction rolled back cleanly.');

  // Clean up
  testClient.close();
  ['', '-wal', '-shm', '-info'].forEach(ext => {
    const f = testDbPath + ext;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
  console.log('✅ Test PASSED flawlessly!');
}

run().catch(console.error);

