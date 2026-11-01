import { DatabaseSync } from 'node:sqlite';
import path from 'path';

let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    const dbPath = path.resolve(process.cwd(), 'dev.db');
    dbInstance = new DatabaseSync(dbPath);
    dbInstance.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS "InvoiceSequence" (
        "name" TEXT PRIMARY KEY,
        "current_seq" INTEGER NOT NULL
      );
    `);
    const existing = dbInstance.prepare('SELECT current_seq FROM InvoiceSequence WHERE name = ?').get('Sale');
    if (!existing) {
      dbInstance.prepare('INSERT INTO InvoiceSequence (name, current_seq) VALUES (?, ?)').run('Sale', 4999);
    }
  }
  return dbInstance;
}

/**
 * Atomically generates the next strictly sequential, gapless integer invoice number.
 * Compliant with Bahrain NBR VAT Regulations (Article 53: Simplified Tax Invoices).
 *
 * @param {string} name - Sequence counter identifier (default: 'Sale')
 * @returns {number} The newly generated sequential integer
 */
export function getNextInvoiceSequence(name = 'Sale') {
  const db = getDb();
  const row = db.prepare(`
    UPDATE "InvoiceSequence"
    SET "current_seq" = "current_seq" + 1
    WHERE "name" = ?
    RETURNING "current_seq"
  `).get(name);

  return row ? row.current_seq : 5000;
}

/**
 * Formats a raw integer sequence into a standard Bahrain NBR invoice string (e.g., INV-005001).
 *
 * @param {number} seq - Sequence integer
 * @param {string} prefix - Prefix string (default: 'INV')
 * @param {number} padLength - Number of digits to pad with leading zeros (default: 6)
 * @returns {string} Formatted invoice string
 */
export function formatInvoiceNumber(seq, prefix = 'INV', padLength = 6) {
  if (!seq || isNaN(seq)) return `${prefix}-000001`;
  return `${prefix}-${seq.toString().padStart(padLength, '0')}`;
}

/**
 * Retrieves the current counter value without incrementing.
 */
export function getCurrentInvoiceSequence(name = 'Sale') {
  const db = getDb();
  const row = db.prepare('SELECT current_seq FROM InvoiceSequence WHERE name = ?').get(name);
  return row ? row.current_seq : 0;
}

/**
 * Seeds or overrides the starting invoice sequence counter.
 * For instance, to start at #5000, seed counter to 4999.
 *
 * @param {number} startingNumber - The desired next invoice number (e.g. 5000)
 * @param {string} name - Sequence identifier
 */
export function setStartingInvoiceSequence(startingNumber, name = 'Sale') {
  const db = getDb();
  const targetSeq = Math.max(0, startingNumber - 1);
  db.prepare('INSERT OR REPLACE INTO InvoiceSequence (name, current_seq) VALUES (?, ?)').run(name, targetSeq);
  return targetSeq;
}
