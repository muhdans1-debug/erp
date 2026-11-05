const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.resolve(__dirname, '..', 'f100_clean.db');
const db = new DatabaseSync(dbPath);

console.log('=== F100 SQLite Database Inspection ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Found tables:', tables.map(t => t.name));

for (const t of tables) {
  if (t.name.startsWith('sqlite_')) continue;
  const count = db.prepare(`SELECT count(*) as c FROM ${t.name}`).get();
  console.log(`\nTable [${t.name}] Total Records: ${count.c}`);

  const rows = db.prepare(`SELECT * FROM ${t.name}`).all();
  rows.forEach((r, idx) => {
    // Truncate large image_base64 strings for clean readability
    const displayRow = { ...r };
    if (displayRow.image_base64 && displayRow.image_base64.length > 50) {
      displayRow.image_base64 = `[Base64 Image: ${displayRow.image_base64.length} chars]`;
    }
    console.log(`  Row ${idx + 1}:`, displayRow);
  });
}

db.close();

