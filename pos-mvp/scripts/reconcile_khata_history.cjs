const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

const db = new DatabaseSync('./dev.db');

console.log('=== STARTING KHATA LEDGER RECONCILIATION ===');

// 1. Find credit sales that were not logged in KhataLedger
const missingSales = db.prepare(`
  SELECT s.id, s.invoiceNo, s.customerId, s.total, s.createdAt 
  FROM Sale s 
  WHERE s.customerId IS NOT NULL 
    AND (s.paymentType = 'CREDIT' OR s.paymentType = 'NFC_CREDIT')
    AND NOT EXISTS (
      SELECT 1 FROM KhataLedger k WHERE k.reference = s.invoiceNo OR k.id = s.id
    )
`).all();

console.log(`Found ${missingSales.length} legacy credit sales missing from KhataLedger.`);

const insertStmt = db.prepare(`
  INSERT INTO KhataLedger (id, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, tenantId)
  VALUES (?, ?, ?, 'CHARGE', ?, 0, 'SYNCED', ?, ?, 'tenant_askar_01')
`);

for (const s of missingSales) {
  insertStmt.run(
    crypto.randomUUID(),
    s.customerId,
    Number(s.total) || 0,
    s.invoiceNo,
    s.createdAt,
    s.createdAt
  );
  console.log(`  -> Backfilled credit sale ${s.invoiceNo} (${s.total} BHD) for customer ${s.customerId}`);
}

// 2. Normalize types and references for all existing records
db.prepare(`
  UPDATE KhataLedger 
  SET type = 'CHARGE', 
      reference = COALESCE(reference, 'INV-' || substr(id, 1, 8))
  WHERE type = 'SALE' OR type = 'CHARGE'
`).run();

db.prepare(`
  UPDATE KhataLedger 
  SET type = 'PAYMENT', 
      reference = COALESCE(reference, 'Cash Payment')
  WHERE type = 'PAYMENT_IN' OR type = 'PAYMENT'
`).run();

db.prepare(`
  UPDATE KhataLedger 
  SET reference = COALESCE(reference, 'Bad Debt Write-Off')
  WHERE type = 'WRITE_OFF'
`).run();

// 3. Recalculate and update running_balance for every customer line-by-line chronologically
const customers = db.prepare(`SELECT id, name FROM Customer`).all();

const updateBalStmt = db.prepare(`
  UPDATE KhataLedger SET running_balance = ? WHERE id = ?
`);

for (const cust of customers) {
  const entries = db.prepare(`
    SELECT id, amount, timestamp, created_at 
    FROM KhataLedger 
    WHERE customerId = ?
    ORDER BY datetime(COALESCE(created_at, timestamp, '1970-01-01')) ASC, rowid ASC
  `).all(cust.id);

  let running = 0;
  for (const entry of entries) {
    running += Number(entry.amount || 0);
    updateBalStmt.run(Number(running.toFixed(3)), entry.id);
  }

  if (entries.length > 0) {
    console.log(`Customer ${cust.name} (${cust.id}): ${entries.length} entries, final running balance = BHD ${running.toFixed(3)}`);
  }
}

console.log('=== KHATA RECONCILIATION COMPLETED SUCCESSFULLY ===');
