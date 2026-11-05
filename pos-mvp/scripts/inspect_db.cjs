const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('pos-mvp/dev.db');
const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table'").all();
console.log('TABLES IN dev.db:');
tables.forEach(t => console.log('---', t.name, '---', t.sql));

const sampleProduct = db.prepare('SELECT * FROM Product LIMIT 3').all();
console.log('\nSAMPLE PRODUCTS IN dev.db:');
console.log(JSON.stringify(sampleProduct, null, 2));

