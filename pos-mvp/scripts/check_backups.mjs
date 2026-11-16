import { createClient } from '@libsql/client';

async function check(file) {
  try {
    const client = createClient({ url: 'file:' + file.replace(/\\/g, '/') });
    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
    const names = tables.rows.map(r => r.name);
    console.log(file, '->', names.join(', '));
    if (names.includes('parties')) {
      const pCount = await client.execute("SELECT count(*) as c FROM parties");
      const tCount = await client.execute("SELECT count(*) as c FROM transactions");
      console.log(`   [Parties: ${pCount.rows[0].c}, Transactions: ${tCount.rows[0].c}]`);
    } else if (names.includes('Customer') || names.includes('KhataLedger')) {
      const cCount = await client.execute("SELECT count(*) as c FROM Customer");
      console.log(`   [Current ERP Customer count: ${cCount.rows[0].c}]`);
    }
  } catch(e) {
    console.log(file, '-> error:', e.message);
  }
}

async function run() {
  await check('C:/Users/ACER/AppData/Roaming/com.layali.erp/layali.db');
  await check('C:/Users/ACER/Desktop/layali_backup_2026-09-04.db');
  await check('C:/Users/ACER/Downloads/backup_2026-10-30_22-48-09.db');
  await check('C:/Users/ACER/Downloads/backup_2026-10-21.db');
}
run();

