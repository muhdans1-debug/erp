const { createClient } = require('@libsql/client');
const client = createClient({ url: 'file:pos-mvp/dev.db' });

async function run() {
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

  try {
    await client.execute(`ALTER TABLE Sale ADD COLUMN employeeId TEXT;`);
    console.log('Added employeeId column to Sale');
  } catch (e) {
    console.log('employeeId column already present');
  }

  try {
    await client.execute(`ALTER TABLE Sale ADD COLUMN shiftId TEXT;`);
    console.log('Added shiftId column to Sale');
  } catch (e) {
    console.log('shiftId column already present');
  }

  // Seed default employees if none exist
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
    console.log('✅ Seeded Cashier 1 (PIN 1234) and Store Manager (PIN 9999)');
  }

  const empRows = await client.execute('SELECT * FROM Employee');
  console.log('Employees:', empRows.rows);
  console.log('✅ Database tables successfully created and verified!');
}

run().catch(console.error);

