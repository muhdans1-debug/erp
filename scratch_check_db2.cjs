const { createClient } = require('./pos-mvp/node_modules/@libsql/client');

async function main() {
  const client = createClient({ url: 'file:pos-mvp/local.db' });
  for (const name of ['Refund', 'RefundItem', 'InvoiceSequence']) {
    const info = await client.execute(`PRAGMA table_info(${name})`);
    console.log(`Schema for ${name}:`, info.rows.map(r => `${r.name} (${r.type})`));
  }
}

main().catch(console.error);

