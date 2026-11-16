import { createClient } from '@libsql/client';

const client = createClient({ url: 'file:C:/Users/ACER/Desktop/layali_backup_2026-09-04.db' });

async function main() {
  const pCols = await client.execute("PRAGMA table_info(parties)");
  console.log('Parties columns:', pCols.rows.map(r => `${r.name} (${r.type})`).join(', '));
  const tCols = await client.execute("PRAGMA table_info(transactions)");
  console.log('Transactions columns:', tCols.rows.map(r => `${r.name} (${r.type})`).join(', '));

  const tCount = await client.execute("SELECT count(*) as c FROM transactions");
  console.log('Transaction count:', tCount.rows[0].c);

  const txRes = await client.execute('SELECT t.*, p.name as party_name FROM transactions t LEFT JOIN parties p ON t.party_id = p.id');
  for (const tx of txRes.rows) console.log(JSON.stringify(tx));

  const pCount = await client.execute("SELECT count(*) as c FROM parties");
  console.log('Total parties:', pCount.rows[0].c);
}

main().catch(console.error);
