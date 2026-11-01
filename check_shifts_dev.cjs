const { createClient } = require('./pos-mvp/node_modules/@libsql/client');

async function checkShiftTable() {
  const client = createClient({ url: 'file:pos-mvp/dev.db' });
  const shifts = await client.execute("SELECT * FROM Shift");
  console.log('Shift rows count in dev.db:', shifts.rows.length);
  console.log('Shift rows:', shifts.rows);
}

checkShiftTable().catch(console.error);

