import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

const cloud = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function checkCloud() {
  console.log('Querying Turso Cloud directly...');
  const sales = await cloud.execute('SELECT count(*) as cnt FROM Sale');
  console.log('Turso cloud Sale count:', sales.rows);

  const seq = await cloud.execute('SELECT * FROM InvoiceSequence LIMIT 5');
  console.log('Turso cloud InvoiceSequence:', seq.rows);

  const lastSales = await cloud.execute('SELECT id, invoiceNo, createdAt FROM Sale ORDER BY createdAt DESC LIMIT 5');
  console.log('Turso cloud last sales:', lastSales.rows);
}

checkCloud().catch(console.error);

