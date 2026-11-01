const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, '..', 'dev.db');
const db = new DatabaseSync(dbPath);

const cols = db.prepare('PRAGMA table_info(Sale)').all();
console.log('Current Sale columns:', cols.map(c => c.name));

if (!cols.some(c => c.name === 'status')) {
  db.exec("ALTER TABLE Sale ADD COLUMN status TEXT DEFAULT 'COMPLETED'");
  console.log("Added status column to Sale table.");
} else {
  console.log("status column already exists on Sale table.");
}

db.exec("UPDATE Sale SET status = 'COMPLETED' WHERE status IS NULL OR status = ''");
console.log("Confirmed all sales status defaulted to COMPLETED.");

const updatedCols = db.prepare('PRAGMA table_info(Sale)').all();
console.log('Updated Sale columns:', updatedCols.map(c => c.name));

const sampleSales = db.prepare("SELECT id, invoiceNo, status, total, totalVat FROM Sale LIMIT 3").all();
console.log('Sample sales:', sampleSales);

db.close();

// Also update prisma/contract.json so that Prisma ORM maps status
const contractPath = path.resolve(__dirname, '..', 'prisma', 'contract.json');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const saleFields = contract.domain.namespaces.__unbound__.models.Sale.fields;

if (!saleFields.status) {
  saleFields.status = {
    nullable: false,
    type: {
      codecId: 'sqlite/text@1',
      kind: 'scalar'
    }
  };
  fs.writeFileSync(contractPath, JSON.stringify(contract, null, 2), 'utf8');
  console.log('Updated prisma/contract.json with Sale.status field!');
} else {
  console.log('Sale.status already in prisma/contract.json');
}
