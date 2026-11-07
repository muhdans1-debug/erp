// ====================================================================
// ASKAR SUPERMARKET ERP - GAPLESS INVOICE SEQUENCE GENERATOR
// Fully Native LibSQL Implementation (Zero DatabaseSync / No SQLite Locks)
// Compliant with Bahrain NBR VAT Regulations (Article 53)
// ====================================================================

import { db } from '../db.js';

/**
 * Generates the next strictly sequential invoice number from durable SQLite Sale records.
 * Compliant with Bahrain NBR VAT Regulations (Article 53).
 */
export async function generateNextInvoiceNumber(storeId = '001', executor = db) {
  try {
    const clientToUse = executor || db;
    const result = await clientToUse.execute("SELECT MAX(invoiceSeq) as maxSeq FROM Sale");
    const currentMax = result.rows[0]?.maxSeq ? Number(result.rows[0].maxSeq) : 0;
    const nextSeq = currentMax + 1;
    const paddedSeq = nextSeq.toString().padStart(6, '0');
    const invoiceNo = `INV-${storeId}-${paddedSeq}`;
    return { invoiceNo, invoiceSeq: nextSeq };
  } catch (err) {
    console.error("🔴 generateNextInvoiceNumber Error:", err);
    const seq = await getNextInvoiceSequence('Sale', executor);
    return { invoiceNo: formatInvoiceNumber(seq, `INV-${storeId}`), invoiceSeq: seq };
  }
}

/**
 * Atomically generates the next strictly sequential, gapless integer invoice number.
 * Compliant with Bahrain NBR VAT Regulations (Article 53: Simplified Tax Invoices).
 *
 * @param {string} name - Sequence counter identifier (default: 'Sale')
 * @returns {Promise<number>} The newly generated sequential integer
 */
export async function getNextInvoiceSequence(name = 'Sale', executor = db) {
  try {
    const clientToUse = executor || db;
    // 🟢 SAFE UPSERT: Creates at 5000 if missing, increments if existing
    const result = await clientToUse.execute({
      sql: `
        INSERT INTO InvoiceSequence (name, current_seq) 
        VALUES (?, 5000) 
        ON CONFLICT(name) DO UPDATE SET current_seq = current_seq + 1 
        RETURNING current_seq
      `,
      args: [name]
    });

    if (result.rows && result.rows.length > 0) {
      return Number(result.rows[0].current_seq);
    }
    
    throw new Error("Sequence query returned empty.");
  } catch (err) {
    console.error("🔴 Critical Invoice Sequence Error:", err);
    // Never fail silently on tax documents. 
    // Throwing an error forces the POS to halt the sale rather than issue a duplicate.
    throw new Error("VAT Error: Failed to generate a unique sequential invoice number.");
  }
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
export async function getCurrentInvoiceSequence(name = 'Sale') {
  try {
    const result = await db.execute({
      sql: 'SELECT "current_seq" FROM "InvoiceSequence" WHERE "name" = ? LIMIT 1',
      args: [name]
    });
    if (result.rows && result.rows.length > 0) {
      return Number(result.rows[0].current_seq);
    }
  } catch { }
  return 0;
}

/**
 * Seeds or overrides the starting invoice sequence counter.
 * For instance, to start at #5000, seed counter to 4999.
 *
 * @param {number} startingNumber - The desired next invoice number (e.g. 5000)
 * @param {string} name - Sequence identifier
 */
export async function setStartingInvoiceSequence(startingNumber, name = 'Sale') {
  const targetSeq = Math.max(0, startingNumber - 1);
  await db.execute({
    sql: 'INSERT OR REPLACE INTO "InvoiceSequence" ("name", "current_seq") VALUES (?, ?)',
    args: [name, targetSeq]
  });
  return targetSeq;
}
