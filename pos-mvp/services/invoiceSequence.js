// ====================================================================
// ASKAR SUPERMARKET ERP - GAPLESS MULTI-TERMINAL INVOICE SEQUENCE GENERATOR
// Fully Native LibSQL Implementation (Zero DatabaseSync / No SQLite Locks)
// Compliant with Bahrain NBR VAT Regulations (Article 53)
// Namespaced Sequences: T1 (Main Sunmi), T2 (Handheld F100), M1 (Manager PC), K1 (Kiosk)
// ====================================================================

import { db } from '../db.js';

/**
 * Normalizes terminal identifiers to standardized namespaces.
 * Defaults to 'T1' (Main Sunmi Checkout).
 */
export function normalizeTerminalId(terminalId) {
  if (!terminalId) return 'T1';
  const str = String(terminalId).trim().toUpperCase();
  if (str === 'MAIN' || str === 'R01' || str === 'COUNTER' || str === 'T1') return 'T1';
  if (str === 'F100' || str === 'HANDHELD' || str === 'MOBILE' || str === 'T2') return 'T2';
  if (str === 'MANAGER' || str === 'LAPTOP' || str === 'BACKOFFICE' || str === 'M1') return 'M1';
  if (str === 'KIOSK' || str === 'SELFCHECKOUT' || str === 'K1') return 'K1';
  
  const cleaned = str.replace(/[^A-Z0-9]/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 4) : 'T1';
}

/**
 * Formats a raw integer sequence into a standard Bahrain NBR invoice string.
 * Example: seq 5050 on terminal T1 -> INV-T1-005050
 *
 * @param {number} seq - Sequence integer
 * @param {string} terminalOrPrefix - Terminal ID or prefix string (default: 'T1')
 * @param {number} padLength - Number of digits to pad with leading zeros (default: 6)
 * @returns {string} Formatted invoice string
 */
export function formatInvoiceNumber(seq, terminalOrPrefix = 'T1', padLength = 6) {
  const num = Number(seq) || 1;
  const padded = num.toString().padStart(padLength, '0');

  // Backwards compatibility: if caller passed legacy 'INV' prefix
  if (typeof terminalOrPrefix === 'string') {
    if (terminalOrPrefix.toUpperCase() === 'INV') {
      return `INV-T1-${padded}`;
    }
    if (terminalOrPrefix.toUpperCase().startsWith('INV-')) {
      return `${terminalOrPrefix}-${padded}`;
    }
  }

  const tid = normalizeTerminalId(terminalOrPrefix);
  return `INV-${tid}-${padded}`;
}

/**
 * Atomically generates the next strictly sequential, gapless integer invoice number.
 * Compliant with Bahrain NBR VAT Regulations (Article 53: Simplified Tax Invoices).
 *
 * @param {string} nameOrTerminal - Terminal identifier or sequence key (e.g. 'T1', 'T2', 'Sale_T1')
 * @param {object} executor - LibSQL client or active transaction
 * @returns {Promise<number>} The newly generated sequential integer
 */
export async function getNextInvoiceSequence(nameOrTerminal = 'T1', executor = db) {
  try {
    const clientToUse = executor || db;

    // Ensure InvoiceSequence table exists
    await clientToUse.execute(`
      CREATE TABLE IF NOT EXISTS InvoiceSequence (
        name TEXT PRIMARY KEY,
        current_seq INTEGER NOT NULL DEFAULT 5000
      )
    `).catch(() => {});

    // Resolve sequence key
    let seqKey = 'Sale_T1';
    let defaultStart = 5000;

    if (typeof nameOrTerminal === 'string') {
      if (nameOrTerminal.startsWith('Sale_')) {
        seqKey = nameOrTerminal;
      } else if (nameOrTerminal === 'Sale') {
        seqKey = 'Sale_T1';
      } else {
        const tid = normalizeTerminalId(nameOrTerminal);
        seqKey = `Sale_${tid}`;
      }
    }

    // Continuity safeguard: If Sale_T1 is accessed for the first time, check if legacy 'Sale' exists
    if (seqKey === 'Sale_T1') {
      const existingT1 = await clientToUse.execute({
        sql: `SELECT current_seq FROM InvoiceSequence WHERE name = 'Sale_T1' LIMIT 1`,
        args: []
      }).catch(() => null);

      if (!existingT1 || !existingT1.rows || existingT1.rows.length === 0) {
        const legacy = await clientToUse.execute({
          sql: `SELECT current_seq FROM InvoiceSequence WHERE name = 'Sale' LIMIT 1`,
          args: []
        }).catch(() => null);

        if (legacy?.rows?.length > 0) {
          defaultStart = Number(legacy.rows[0].current_seq) || 5000;
        }
      }
    } else {
      // Secondary terminals (T2, M1, K1) start from 0 if not previously configured
      defaultStart = 0;
    }

    // Atomic increment or initialization
    const result = await clientToUse.execute({
      sql: `
        INSERT INTO InvoiceSequence (name, current_seq) 
        VALUES (?, ?) 
        ON CONFLICT(name) DO UPDATE SET current_seq = current_seq + 1 
        RETURNING current_seq
      `,
      args: [seqKey, defaultStart + 1]
    });

    if (result.rows && result.rows.length > 0) {
      return Number(result.rows[0].current_seq);
    }
    
    throw new Error("Sequence query returned empty.");
  } catch (err) {
    console.error("🔴 Critical Invoice Sequence Error:", err);
    throw new Error("VAT Error: Failed to generate a unique sequential invoice number.");
  }
}

/**
 * Generates the next strictly sequential invoice number from durable SQLite records.
 * Compliant with Bahrain NBR VAT Regulations (Article 53).
 */
export async function generateNextInvoiceNumber(terminalId = 'T1', storeId = 'store_askar_01', executor = db) {
  const normTerminal = normalizeTerminalId(terminalId);
  const nextSeq = await getNextInvoiceSequence(normTerminal, executor);
  
  return { 
    invoiceNo: formatInvoiceNumber(nextSeq, normTerminal), 
    invoiceSeq: nextSeq,
    terminalId: normTerminal,
    storeId 
  };
}

/**
 * Retrieves the current counter value without incrementing.
 */
export async function getCurrentInvoiceSequence(nameOrTerminal = 'T1') {
  try {
    let seqKey = 'Sale_T1';
    if (typeof nameOrTerminal === 'string') {
      if (nameOrTerminal.startsWith('Sale_')) {
        seqKey = nameOrTerminal;
      } else if (nameOrTerminal === 'Sale') {
        seqKey = 'Sale_T1';
      } else {
        seqKey = `Sale_${normalizeTerminalId(nameOrTerminal)}`;
      }
    }

    if (seqKey === 'Sale_T1') {
      const result = await db.execute({
        sql: 'SELECT current_seq FROM InvoiceSequence WHERE name = ? OR name = ? ORDER BY CASE WHEN name = ? THEN 1 ELSE 2 END LIMIT 1',
        args: ['Sale_T1', 'Sale', 'Sale_T1']
      });
      if (result.rows && result.rows.length > 0) {
        return Number(result.rows[0].current_seq);
      }
    } else {
      const result = await db.execute({
        sql: 'SELECT current_seq FROM InvoiceSequence WHERE name = ? LIMIT 1',
        args: [seqKey]
      });
      if (result.rows && result.rows.length > 0) {
        return Number(result.rows[0].current_seq);
      }
    }
  } catch { }
  return 0;
}

/**
 * Seeds or overrides the starting invoice sequence counter for a specific terminal.
 *
 * @param {number} startingNumber - The desired next invoice number (e.g. 5000)
 * @param {string} nameOrTerminal - Terminal identifier or sequence key
 */
export async function setStartingInvoiceSequence(startingNumber, nameOrTerminal = 'T1') {
  let seqKey = 'Sale_T1';
  if (typeof nameOrTerminal === 'string') {
    if (nameOrTerminal.startsWith('Sale_')) {
      seqKey = nameOrTerminal;
    } else if (nameOrTerminal === 'Sale') {
      seqKey = 'Sale_T1';
    } else {
      seqKey = `Sale_${normalizeTerminalId(nameOrTerminal)}`;
    }
  }

  const targetSeq = Math.max(0, startingNumber - 1);
  await db.execute({
    sql: 'INSERT OR REPLACE INTO InvoiceSequence (name, current_seq) VALUES (?, ?)',
    args: [seqKey, targetSeq]
  });
  return targetSeq;
}
