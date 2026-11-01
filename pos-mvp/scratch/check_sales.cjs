const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./dev.db');

const creditSales = db.prepare("SELECT id, invoiceNo, customerId, total, createdAt FROM Sale WHERE customerId IS NOT NULL AND (paymentType = 'CREDIT' OR paymentType = 'NFC_CREDIT')").all();
console.log('Credit sales in dev.db:', creditSales.length);

for (const s of creditSales) {
  const inLedger = db.prepare('SELECT id, type, amount, reference FROM KhataLedger WHERE reference = ? OR id = ?').get(s.invoiceNo, s.id);
  console.log(s.invoiceNo, 'Customer:', s.customerId, 'Total:', s.total, 'In Ledger:', !!inLedger);
}
