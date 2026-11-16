const Database = require('better-sqlite3');
const path = require('path');

try {
  const dbPath = path.join(__dirname, 'askar_offline_dump.db');
  const db = new Database(dbPath);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tables in askar_offlineSQLite.db:', tables);

  const salesCount = db.prepare("SELECT count(*) as count FROM offline_sales").get();
  console.log('Total sales in offline_sales:', salesCount);

  const pendingSales = db.prepare("SELECT id, timestamp, synced, payload FROM offline_sales WHERE synced = 0").all();
  console.log('Pending (synced=0) sales count:', pendingSales.length);
  if (pendingSales.length > 0) {
    console.log('First 3 pending sales:');
    pendingSales.slice(0, 3).forEach(s => {
      console.log('ID:', s.id, 'Timestamp:', s.timestamp, 'Synced:', s.synced);
      console.log('Payload:', s.payload.substring(0, 200) + '...');
    });
  }

  const allSales = db.prepare("SELECT id, timestamp, synced FROM offline_sales").all();
  console.log('All sales records:', allSales);
} catch (err) {
  console.error('Error reading offline db:', err.message);
}

