const { createClient } = require('./pos-mvp/node_modules/@libsql/client');

async function main() {
  const client = createClient({ url: 'file:pos-mvp/local.db' });
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('Tables:', tables.rows.map(r => r.name));

  for (const name of ['Sale', 'Sales', 'ShiftSession', 'KhataCustomer']) {
    try {
      const info = await client.execute(`PRAGMA table_info(${name})`);
      console.log(`Schema for ${name}:`, info.rows.map(r => `${r.name} (${r.type})`));
    } catch (e) {
      console.log(`Error checking ${name}:`, e.message);
    }
  }
}

main().catch(console.error);

