import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: 'pos-mvp/.env' });

const dbUrl = process.env.TURSO_DATABASE_URL || 'file:pos-mvp/local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

console.log('Connecting to:', dbUrl.slice(0, 30) + '...');
const client = createClient({ url: dbUrl, authToken });

async function main() {
  const custCount = await client.execute("SELECT count(*) as c FROM Customer");
  console.log(`Current Customer count: ${custCount.rows[0].c}`);
  
  const sample = await client.execute("SELECT id, name, phone, balance, credit_limit, createdAt FROM Customer LIMIT 15");
  console.log("Sample Customers in current DB:");
  for (const c of sample.rows) {
    console.log(JSON.stringify(c));
  }

  const ledgerCount = await client.execute("SELECT count(*) as c FROM KhataLedger");
  console.log(`Current KhataLedger count: ${ledgerCount.rows[0].c}`);

  const totalBal = await client.execute("SELECT SUM(balance) as total_debt FROM Customer");
  console.log(`Total outstanding Khata debt across customers: ${totalBal.rows[0].total_debt} BHD`);
}

main().catch(console.error);

