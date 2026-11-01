const { createClient } = require('c:/Users/ACER/Desktop/erp/pos-mvp/node_modules/@libsql/client');
const turso = createClient({
  url: 'libsql://askar-pos-primary-muhdans1.aws-ap-south-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTMyMjgwODAsImlkIjoiMDFhMTg0YjgtMjIwMS03YzJhLThlY2EtZDVkNDcyZjkxZGRlIiwia2lkIjoiQ0cxaFB3c3d5VWgwUlE5dzNZRDZRRmxuYk9rWUNCYklfVWJkSEhXS1hNNCIsInJpZCI6Ijk3MzEwYzA5LTMxYjUtNDNkNi1hY2ViLWNmYWY1MTIzZDRkNSJ9.wBeE8WLExcIW_k8NU4RB4RgFYNpE1a73T8e8JemANcvk4kocFOdZe54CJe3azLsG9h-5MtCMx7ArY0kUSYyMBw'
});
async function run() {
  try {
    await turso.execute(`
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
    console.log('Employee table created on Turso cloud!');
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS ShiftSession (
        id TEXT PRIMARY KEY,
        tenantId TEXT DEFAULT 'tenant_1',
        employee_id TEXT NOT NULL,
        opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        closed_at DATETIME,
        starting_cash REAL NOT NULL DEFAULT 0.0,
        expected_cash REAL,
        actual_cash REAL,
        variance REAL,
        denominations TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'OPEN'
      );
    `);
    console.log('ShiftSession table created on Turso cloud!');
    await turso.execute(`
      INSERT OR REPLACE INTO Employee (id, tenantId, name, pin_code, role, is_active)
      VALUES 
        ('emp_cashier_1', 'tenant_1', 'Cashier 1', '1234', 'CASHIER', 1),
        ('emp_manager_1', 'tenant_1', 'Store Manager', '9999', 'MANAGER', 1);
    `);
    console.log('Default employees seeded on Turso cloud!');
  } catch (err) {
    console.error('Turso cloud migration error:', err);
  }
}
run();

