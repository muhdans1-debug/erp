import { createClient } from '@libsql/client';

async function check() {
  const local = createClient({ url: 'file:pos-mvp/local.db' });
  const tables = await local.execute("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('Tables in local.db:', tables.rows.map(r => r.name).join(', '));
}
check();

