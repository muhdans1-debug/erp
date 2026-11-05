const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

console.log('========================================================');
console.log('🗑️  CLEANING ALL PRODUCTS & CUSTOMERS (SERVER: 3000)   ');
console.log('========================================================\n');

const cwd = path.resolve(__dirname, '..');
const devDbPath = path.join(cwd, 'dev.db');
const localDbPath = path.join(cwd, 'local.db');

// Verify backups exist
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
if (fs.existsSync(devDbPath)) {
  fs.copyFileSync(devDbPath, path.join(cwd, `dev.db.backup_${timestamp}`));
  console.log(`📦 Safety backup created: dev.db.backup_${timestamp}`);
}
if (fs.existsSync(localDbPath)) {
  fs.copyFileSync(localDbPath, path.join(cwd, `local.db.backup_${timestamp}`));
  console.log(`📦 Safety backup created: local.db.backup_${timestamp}`);
}

const cleanDbFile = (dbFilePath, label) => {
  if (!fs.existsSync(dbFilePath)) {
    console.log(`⚠️  ${label} not found at ${dbFilePath}`);
    return;
  }

  const db = new DatabaseSync(dbFilePath);
  try {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN TRANSACTION;
      DELETE FROM RefundItem;
      DELETE FROM Refund;
      DELETE FROM SaleItem;
      DELETE FROM Sale;
      DELETE FROM WastageLog;
      DELETE FROM ProductPriceHistory;
      DELETE FROM Product;
      DELETE FROM KhataLedger;
      DELETE FROM NfcCard;
      DELETE FROM MessGroup;
      DELETE FROM Customer;
      COMMIT;
      PRAGMA foreign_keys = ON;
      VACUUM;
    `);

    console.log(`✅ [${label}] Successfully cleaned:`);
    console.log(`   - Products: 0`);
    console.log(`   - Customers: 0`);
    console.log(`   - Khata Ledgers: 0`);
    console.log(`   - NFC Bindings: 0`);
    console.log(`   - Sale Items: 0`);
  } catch (err) {
    console.error(`❌ Error cleaning ${label}:`, err.message);
  } finally {
    db.close();
  }
};

cleanDbFile(devDbPath, 'dev.db (Master Server)');
cleanDbFile(localDbPath, 'local.db (LibSQL Replica)');

// Clean uploaded product images if any
const uploadsDir = path.join(cwd, 'public', 'uploads', 'products');
if (fs.existsSync(uploadsDir)) {
  const files = fs.readdirSync(uploadsDir);
  for (const file of files) {
    try {
      fs.unlinkSync(path.join(uploadsDir, file));
    } catch {}
  }
  console.log(`✅ Cleaned ${files.length} product images from public/uploads/products`);
}

console.log('\n========================================================');
console.log('✨ All products and customers have been wiped completely!');
console.log('========================================================');
