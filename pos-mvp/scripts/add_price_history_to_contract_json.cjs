const fs = require('fs');

const contract = JSON.parse(fs.readFileSync('./prisma/contract.json', 'utf8'));

// 1. Add model definition to domain.namespaces.__unbound__.models
const models = contract.domain.namespaces.__unbound__.models;
models.ProductPriceHistory = {
  fields: {
    id: { nullable: false, type: { codecId: 'sqlite/text@1', kind: 'scalar' } },
    productId: { nullable: false, type: { codecId: 'sqlite/text@1', kind: 'scalar' } },
    productName: { nullable: true, type: { codecId: 'sqlite/text@1', kind: 'scalar' } },
    oldPrice: { nullable: false, type: { codecId: 'sqlite/real@1', kind: 'scalar' } },
    newPrice: { nullable: false, type: { codecId: 'sqlite/real@1', kind: 'scalar' } },
    oldCost: { nullable: true, type: { codecId: 'sqlite/real@1', kind: 'scalar' } },
    newCost: { nullable: true, type: { codecId: 'sqlite/real@1', kind: 'scalar' } },
    changeReason: { nullable: true, type: { codecId: 'sqlite/text@1', kind: 'scalar' } },
    changedBy: { nullable: false, type: { codecId: 'sqlite/text@1', kind: 'scalar' } },
    createdAt: { nullable: false, type: { codecId: 'sqlite/datetime@1', kind: 'scalar' } },
    tenantId: { nullable: false, type: { codecId: 'sqlite/text@1', kind: 'scalar' } }
  },
  relations: {},
  storage: {
    fields: {
      id: { column: 'id' },
      productId: { column: 'productId' },
      productName: { column: 'productName' },
      oldPrice: { column: 'oldPrice' },
      newPrice: { column: 'newPrice' },
      oldCost: { column: 'oldCost' },
      newCost: { column: 'newCost' },
      changeReason: { column: 'changeReason' },
      changedBy: { column: 'changedBy' },
      createdAt: { column: 'createdAt' },
      tenantId: { column: 'tenantId' }
    },
    namespaceId: '__unbound__',
    table: 'ProductPriceHistory'
  }
};

// 2. Add storage table definition to storage.namespaces.__unbound__.entries.table
const tables = contract.storage.namespaces.__unbound__.entries.table;
tables.ProductPriceHistory = {
  columns: {
    id: { codecId: 'sqlite/text@1', dataType: 'sqlite/text', nullable: false },
    productId: { codecId: 'sqlite/text@1', dataType: 'sqlite/text', nullable: false },
    productName: { codecId: 'sqlite/text@1', dataType: 'sqlite/text', nullable: true },
    oldPrice: { codecId: 'sqlite/real@1', dataType: 'sqlite/real', nullable: false },
    newPrice: { codecId: 'sqlite/real@1', dataType: 'sqlite/real', nullable: false },
    oldCost: { codecId: 'sqlite/real@1', dataType: 'sqlite/real', nullable: true },
    newCost: { codecId: 'sqlite/real@1', dataType: 'sqlite/real', nullable: true },
    changeReason: { codecId: 'sqlite/text@1', dataType: 'sqlite/text', nullable: true },
    changedBy: { codecId: 'sqlite/text@1', dataType: 'sqlite/text', nullable: false },
    createdAt: { codecId: 'sqlite/datetime@1', dataType: 'sqlite/text', nullable: false },
    tenantId: { codecId: 'sqlite/text@1', dataType: 'sqlite/text', nullable: false }
  },
  foreignKeys: [],
  indexes: [],
  primaryKey: { columns: ['id'] },
  uniques: []
};

fs.writeFileSync('./prisma/contract.json', JSON.stringify(contract, null, 2), 'utf8');
console.log('✅ contract.json updated with ProductPriceHistory model and storage definition');
