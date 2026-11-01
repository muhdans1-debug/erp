const { createClient } = require('c:/Users/ACER/Desktop/erp/pos-mvp/node_modules/@libsql/client');
const client = createClient({ url: 'file:c:/Users/ACER/Desktop/erp/pos-mvp/dev.db' });
async function run() {
  const shifts = await client.execute('SELECT id, status, cashierName, openedAt FROM Shift');
  console.log('Shifts in dev.db:', JSON.stringify(shifts.rows, null, 2));
  const sessions = await client.execute('SELECT id, status, employee_id, opened_at FROM ShiftSession');
  console.log('ShiftSessions in dev.db:', JSON.stringify(sessions.rows, null, 2));
}
run();
