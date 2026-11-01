const { createClient } = require('@libsql/client');

async function migrate(dbPath) {
  console.log('Migrating', dbPath);
  const client = createClient({ url: `file:${dbPath}` });

  await client.execute(`
    CREATE TABLE IF NOT EXISTS Employee (
      id TEXT PRIMARY KEY,
      tenantId TEXT DEFAULT 'tenant_1',
      name TEXT NOT NULL,
      pin_code TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'CASHIER',
      is_active INTEGER DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ShiftSession (
      id TEXT PRIMARY KEY,
      tenantId TEXT DEFAULT 'tenant_1',
      employee_id TEXT NOT NULL,
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      starting_cash REAL NOT NULL DEFAULT 50.0,
      expected_cash REAL,
      actual_cash REAL,
      variance REAL,
      denominations TEXT,
      notes TEXT,
      status TEXT DEFAULT 'OPEN',
      FOREIGN KEY (employee_id) REFERENCES Employee(id)
    );
  `);

  try { await client.execute('ALTER TABLE Sale ADD COLUMN employeeId TEXT;'); } catch(e) {}
  try { await client.execute('ALTER TABLE Sale ADD COLUMN shiftId TEXT;'); } catch(e) {}

  const res = await client.execute('SELECT COUNT(*) as count FROM Employee');
  if (res.rows[0].count === 0) {
    await client.execute({
      sql: 'INSERT INTO Employee (id, tenantId, name, pin_code, role, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      args: ['emp_cashier_1', 'tenant_1', 'Cashier 1', '1234', 'CASHIER', 1]
    });
    await client.execute({
      sql: 'INSERT INTO Employee (id, tenantId, name, pin_code, role, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      args: ['emp_manager_1', 'tenant_1', 'Store Manager', '9999', 'MANAGER', 1]
    });
    console.log('Seeded default employees in', dbPath);
  }
  console.log('Finished migrating', dbPath);
}

async function main() {
  await migrate('pos-mvp/dev.db');
  await migrate('pos-mvp/local.db');
}
main().catch(console.error);

