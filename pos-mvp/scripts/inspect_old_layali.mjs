import { createClient } from '@libsql/client';
import path from 'path';

const dbPath = 'file:' + path.resolve(process.env.APPDATA, 'com.layali.erp', 'layali.db').replace(/\\/g, '/');
const client = createClient({ url: dbPath });

async function main() {
  console.log('--- PARTIES ---');
  const partiesRes = await client.execute('SELECT * FROM parties');
  for (const p of partiesRes.rows) {
    console.log(JSON.stringify(p));
  }

  console.log('\n--- TRANSACTION TYPES & COUNTS ---');
  const typesRes = await client.execute('SELECT type, count(*) as count, sum(amount_fils) as total_fils FROM transactions GROUP BY type');
  for (const t of typesRes.rows) {
    console.log(JSON.stringify(t));
  }

  console.log('\n--- TRANSACTIONS (SAMPLE) ---');
  const txRes = await client.execute('SELECT t.*, p.name as party_name FROM transactions t LEFT JOIN parties p ON t.party_id = p.id ORDER BY t.id ASC LIMIT 20');
  for (const tx of txRes.rows) {
    console.log(JSON.stringify(tx));
  }

  console.log('\n--- ALL DISTINCT TYPES IN TRANSACTIONS ---');
  const distinctTypes = await client.execute('SELECT DISTINCT type FROM transactions');
  console.log(distinctTypes.rows.map(r => r.type));

  console.log('\n--- SUMMARY STATS ---');
  const summary = await client.execute(`
    SELECT 
      p.id,
      p.name,
      p.phone,
      t.type,
      SUM(t.amount_fils) as sum_fils,
      COUNT(t.id) as count
    FROM parties p
    JOIN transactions t ON p.id = t.party_id
    GROUP BY p.id, t.type
  `);
  for (const s of summary.rows) {
    console.log(JSON.stringify(s));
  }
}

main().catch(console.error);
