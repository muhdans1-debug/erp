const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

console.log('🔄 Upgrading contract.json and dev.db for Weighed Produce Items...');

// 1. Update contract.json
const contractPath = path.join(__dirname, '../prisma/contract.json');
if (fs.existsSync(contractPath)) {
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

  // Product.is_weighed_item
  const productModels = contract.domain.namespaces.__unbound__.models.Product;
  productModels.fields.is_weighed_item = {
    nullable: false,
    type: { codecId: 'sqlite/integer@1', kind: 'scalar' }
  };
  productModels.storage.fields.is_weighed_item = {
    column: 'is_weighed_item'
  };

  const productTable = contract.storage.namespaces.__unbound__.entries.table.Product;
  productTable.columns.is_weighed_item = {
    codecId: 'sqlite/integer@1',
    dataType: 'sqlite/integer',
    nullable: false,
    defaultValue: 0
  };

  // SaleItem.quantity to REAL (Float)
  const saleItemModels = contract.domain.namespaces.__unbound__.models.SaleItem;
  saleItemModels.fields.quantity = {
    nullable: false,
    type: { codecId: 'sqlite/real@1', kind: 'scalar' }
  };

  const saleItemTable = contract.storage.namespaces.__unbound__.entries.table.SaleItem;
  saleItemTable.columns.quantity = {
    codecId: 'sqlite/real@1',
    dataType: 'sqlite/real',
    nullable: false
  };

  fs.writeFileSync(contractPath, JSON.stringify(contract, null, 2), 'utf8');
  console.log('✅ pos-mvp/prisma/contract.json successfully updated.');
}

// 2. Update dev.db
const dbPath = path.join(__dirname, '../dev.db');
const db = new DatabaseSync(dbPath);

// Check if is_weighed_item column exists in Product
const productCols = db.prepare('PRAGMA table_info(Product)').all();
const hasWeighedCol = productCols.some(c => c.name === 'is_weighed_item');
if (!hasWeighedCol) {
  console.log('Adding "is_weighed_item" column to Product table...');
  db.exec('ALTER TABLE Product ADD COLUMN is_weighed_item INTEGER DEFAULT 0;');
  console.log('✅ Column is_weighed_item added to Product table.');
} else {
  console.log('ℹ️ Column is_weighed_item already exists in Product table.');
}

// 3. Flag vegetables and produce (Tomatoes, Onions, Potatoes, Cucumber, Bananas)
const produceKeywords = ['tomato', 'onion', 'potato', 'cucumber', 'banana'];
const allProducts = db.prepare('SELECT id, name, is_weighed_item FROM Product').all();
let flaggedCount = 0;

for (const prod of allProducts) {
  const lowerName = prod.name.toLowerCase();
  const isProduce = produceKeywords.some(keyword => lowerName.includes(keyword));
  if (isProduce) {
    db.prepare('UPDATE Product SET is_weighed_item = 1 WHERE id = ?').run(prod.id);
    console.log(`🥬 Flagged produce item as weighed: [${prod.id}] ${prod.name}`);
    flaggedCount++;
  }
}

console.log(`✅ Total produce items flagged: ${flaggedCount}`);
