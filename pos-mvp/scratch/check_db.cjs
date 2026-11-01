const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('dev.db');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE name='Sale'").all());
const sample = db.prepare("SELECT id, invoiceNo, createdAt FROM Sale ORDER BY createdAt DESC LIMIT 5").all();
console.log('Sample sales:', sample);
const count = db.prepare("SELECT count(*) as count FROM Sale").all();
console.log('Total sales:', count);
