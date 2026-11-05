const { DatabaseSync } = require('node:sqlite');
const path = require('path');

['pos-mvp/dev.db', 'pos-mvp/local.db'].forEach(p => {
  try {
    const db = new DatabaseSync(p);
    const cols = db.prepare('PRAGMA table_info(Product)').all().map(c => c.name);
    console.log(p, 'Columns:', cols);
    if (!cols.includes('category')) {
      db.exec("ALTER TABLE Product ADD COLUMN category TEXT DEFAULT 'GROCERY'");
      console.log('Added category column to', p);
    } else {
      console.log('category column already exists in', p);
    }
  } catch (e) {
    console.warn('Error on', p, e.message);
  }
});

