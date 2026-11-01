const { createClient } = require('./pos-mvp/node_modules/@libsql/client');

async function migrateAllShiftsToShiftSession() {
  const devClient = createClient({ url: 'file:pos-mvp/dev.db' });
  const localClient = createClient({ url: 'file:pos-mvp/local.db' });
  const tursoClient = createClient({
    url: 'libsql://askar-pos-primary-muhdans1.aws-ap-south-1.turso.io',
    authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTMyMjgwODAsImlkIjoiMDFhMTg0YjgtMjIwMS03YzJhLThlY2EtZDVkNDcyZjkxZGRlIiwia2lkIjoiQ0cxaFB3c3d5VWgwUlE5dzNZRDZRRmxuYk9rWUNCYklfVWJkSEhXS1hNNCIsInJpZCI6Ijk3MzEwYzA5LTMxYjUtNDNkNi1hY2ViLWNmYWY1MTIzZDRkNSJ9.wBeE8WLExcIW_k8NU4RB4RgFYNpE1a73T8e8JemANcvk4kocFOdZe54CJe3azLsG9h-5MtCMx7ArY0kUSYyMBw'
  });

  const shifts = await devClient.execute("SELECT * FROM Shift");
  console.log(`Found ${shifts.rows.length} shifts in Shift table.`);

  for (const s of shifts.rows) {
    const starting = Number(s.openingCash || 50);
    const actual = s.closingCash !== null && s.closingCash !== undefined ? Number(s.closingCash) : starting;
    const openedAt = s.openedAt ? s.openedAt.replace('T', ' ').replace('Z', '').split('.')[0] : new Date().toISOString().replace('T', ' ').split('.')[0];
    const closedAt = s.closedAt ? s.closedAt.replace('T', ' ').replace('Z', '').split('.')[0] : openedAt;
    const notes = s.notes || null;
    const status = s.status || 'CLOSED';

    console.log(`Syncing shift ${s.id} (opened: ${openedAt}, closed: ${closedAt}, starting: ${starting}, actual: ${actual})...`);

    const sql = `
      INSERT INTO ShiftSession (
        id, tenantId, employee_id, opened_at, closed_at,
        starting_cash, expected_cash, actual_cash, variance,
        denominations, notes, status
      ) VALUES (?, 'tenant_1', 'emp_cashier_1', ?, ?, ?, ?, ?, ?, null, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        opened_at = excluded.opened_at,
        closed_at = excluded.closed_at,
        starting_cash = excluded.starting_cash,
        expected_cash = excluded.expected_cash,
        actual_cash = excluded.actual_cash,
        variance = excluded.variance,
        notes = excluded.notes,
        status = excluded.status
    `;

    const args = [s.id, openedAt, closedAt, starting, actual, actual, 0, notes, status];

    try { await devClient.execute({ sql, args }); } catch (e) { console.warn(`dev.db error on ${s.id}:`, e.message); }
    try { await localClient.execute({ sql, args }); } catch (e) { console.warn(`local.db error on ${s.id}:`, e.message); }
    try { await tursoClient.execute({ sql, args }); } catch (e) { console.warn(`turso error on ${s.id}:`, e.message); }
  }

  console.log('Migration complete! Checking ShiftSession in dev.db and local.db:');
  const devCheck = await devClient.execute("SELECT id, opened_at, closed_at, status FROM ShiftSession ORDER BY closed_at DESC");
  console.log('dev.db ShiftSession rows:', devCheck.rows);

  const localCheck = await localClient.execute("SELECT id, opened_at, closed_at, status FROM ShiftSession ORDER BY closed_at DESC");
  console.log('local.db ShiftSession rows:', localCheck.rows);
}

migrateAllShiftsToShiftSession().catch(console.error);

