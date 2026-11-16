import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localDbPath = path.resolve(__dirname, '../local.db');

const local = createClient({
  url: `file:${localDbPath.replace(/\\/g, '/')}`
});

async function checkLocal() {
  const sales = await local.execute('SELECT count(*) as cnt FROM Sale');
  console.log('Local Sale count:', sales.rows);

  const lastSales = await local.execute('SELECT id, invoiceNo, createdAt FROM Sale ORDER BY createdAt DESC LIMIT 5');
  console.log('Local last sales:', lastSales.rows);

  const checkPending = await local.execute("SELECT id, invoiceNo FROM Sale WHERE id IN ('3efa0806-53ac-4056-b291-72ae56642109', '8b89ca1a-0160-405a-a03d-14a80dd193f9', '0abe4c91-71f2-4980-ac95-c3b27e81b1e8')");
  console.log('Are pending sales in local.db?', checkPending.rows);
}

checkLocal().catch(console.error);

