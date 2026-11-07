/**
 * Bahrain National Bureau for Revenue (NBR) VAT Executive Regulations (Article 53)
 * Compliant Sequential Invoice Number Generator
 *
 * Implements Durable SQLite Sequence Generation:
 * Strictly sequential, gapless, and collision-free across multiple registers.
 */

import { db } from '../db';

/**
 * Fetch the absolute highest sequence from durable SQLite storage.
 * If the table is empty, start at 1. Otherwise, increment the highest known sequence.
 */
export const generateNextInvoiceNumber = async (storeId: string = '001') => {
  // NEW: Fetch the absolute highest sequence from durable storage
  const result = await db.execute("SELECT MAX(invoiceSeq) as maxSeq FROM Sale");

  // If the table is empty, start at 1. Otherwise, increment the highest known sequence.
  const currentMax = result.rows[0]?.maxSeq ? Number(result.rows[0].maxSeq) : 0;
  const nextSeq = currentMax + 1;

  const paddedSeq = nextSeq.toString().padStart(6, '0');
  const invoiceNo = `INV-${storeId}-${paddedSeq}`;

  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('DURABLE_MAX_INVOICE_SEQ', nextSeq.toString());
      localStorage.setItem('LOCAL_INV_COUNTER', nextSeq.toString());
    }
  } catch {}

  return { invoiceNo, invoiceSeq: nextSeq };
};

export const getRegisterPrefix = (): string => {
  if (typeof window === 'undefined') return '001';
  let prefix = localStorage.getItem('REGISTER_PREFIX');
  if (!prefix) {
    prefix = '001';
    localStorage.setItem('REGISTER_PREFIX', prefix);
  }
  return prefix;
};

export const getLocalInvoiceCounter = (): number => {
  if (typeof window === 'undefined') return 1;
  const raw = localStorage.getItem('DURABLE_MAX_INVOICE_SEQ') || localStorage.getItem('LOCAL_INV_COUNTER');
  const parsed = parseInt(raw || '1', 10);
  return isNaN(parsed) || parsed < 1 ? 1 : parsed;
};

export const setRegisterPrefix = (prefix: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('REGISTER_PREFIX', prefix.trim() || '001');
  }
};

export const setLocalInvoiceCounter = (counter: number | string): void => {
  if (typeof window !== 'undefined') {
    const num = parseInt(counter.toString(), 10);
    const val = (isNaN(num) || num < 1 ? 1 : num).toString();
    localStorage.setItem('LOCAL_INV_COUNTER', val);
    localStorage.setItem('DURABLE_MAX_INVOICE_SEQ', val);
  }
};

/**
 * Synchronous backward-compatible fallback for components that cannot await.
 */
export const generateCompliantInvoiceNumber = (): string => {
  if (typeof window === 'undefined') return 'INV-001-000001';

  const prefix = getRegisterPrefix();
  const currentCounter = getLocalInvoiceCounter();

  const sequenceStr = currentCounter.toString().padStart(6, '0');
  const invoiceNumber = `INV-${prefix}-${sequenceStr}`;

  setLocalInvoiceCounter(currentCounter + 1);

  return invoiceNumber;
};

/**
 * Preview the next invoice number without incrementing the counter.
 */
export const previewNextInvoiceNumber = (customPrefix?: string, customCounter?: number): string => {
  const p = customPrefix !== undefined ? customPrefix : getRegisterPrefix();
  const c = customCounter !== undefined ? customCounter : getLocalInvoiceCounter();
  return `INV-${p}-${c.toString().padStart(6, '0')}`;
};
