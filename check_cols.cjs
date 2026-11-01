const { createClient } = require('./pos-mvp/node_modules/@libsql/client');

async function checkCols() {
  const client = createClient({ url: 'file:pos-mvp/local.db' });
  const info = await client.execute('PRAGMA table_info(Sale)');
  console.log(info.rows.map(r => ({ name: r.name, type: r.type, notnull: r.notnull, dflt_value: r.dflt_value })));
}

checkCols().catch(console.error);

