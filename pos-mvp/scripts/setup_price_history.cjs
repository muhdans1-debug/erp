const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./dev.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS ProductPriceHistory (
    id TEXT PRIMARY KEY,
    productId TEXT NOT NULL,
    productName TEXT,
    oldPrice REAL NOT NULL,
    newPrice REAL NOT NULL,
    oldCost REAL,
    newCost REAL,
    changeReason TEXT,
    changedBy TEXT DEFAULT 'Manager',
    createdAt TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    tenantId TEXT DEFAULT 'tenant_askar_01'
  );
  CREATE INDEX IF NOT EXISTS idx_price_history_product ON ProductPriceHistory(productId);
`);

console.log('✅ ProductPriceHistory table initialized successfully.');
