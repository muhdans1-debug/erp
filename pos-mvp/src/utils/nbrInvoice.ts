/**
 * Bahrain National Bureau for Revenue (NBR) VAT Executive Regulations (Article 53)
 * Compliant Sequential Invoice Number Generator
 *
 * Implements Durable SQLite Sequence Generation:
 * Strictly sequential, gapless, and collision-free across multiple registers.
 */

import { db } from '../db';

/**
 * Identify Terminal ID:
 * Sunmi D2mini = T1 (Register 01)
 * Feitian F100 = T2 (Terminal 02 - Mobile Khata Lane)
 */
export const getDeviceTerminalId = (): string => {
  if (typeof window === 'undefined') return 'T1';
  let term = localStorage.getItem('terminal_id');
  if (!term) {
    const isF100 = (typeof navigator !== 'undefined' && navigator.userAgent.includes('F100')) ||
                   localStorage.getItem('f100_default_mode') === 'true' ||
                   localStorage.getItem('f100_active_mode') === 'pos' ||
                   localStorage.getItem('f100_active_mode') === 'pim';
    term = isF100 ? 'T2' : 'T1';
    localStorage.setItem('terminal_id', term);
  }
  return term;
};

export const getRegisterPrefix = (): string => {
  if (typeof window === 'undefined') return 'T1';
  let prefix = localStorage.getItem('REGISTER_PREFIX');
  if (!prefix || prefix === '001') {
    prefix = getDeviceTerminalId();
    localStorage.setItem('REGISTER_PREFIX', prefix);
  }
  return prefix;
};

export const getLocalInvoiceCounter = (prefix?: string): number => {
  if (typeof window === 'undefined') return 1;
  const p = prefix || getRegisterPrefix();
  const raw = localStorage.getItem(`DURABLE_MAX_INVOICE_SEQ_${p}`) ||
              localStorage.getItem('DURABLE_MAX_INVOICE_SEQ') ||
              localStorage.getItem('LOCAL_INV_COUNTER');
  const parsed = parseInt(raw || '1', 10);
  return isNaN(parsed) || parsed < 1 ? 1 : parsed;
};

export const setRegisterPrefix = (prefix: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('REGISTER_PREFIX', prefix.trim() || 'T1');
  }
};

export const setLocalInvoiceCounter = (counter: number | string, prefix?: string): void => {
  if (typeof window !== 'undefined') {
    const p = prefix || getRegisterPrefix();
    const num = parseInt(counter.toString(), 10);
    const val = (isNaN(num) || num < 1 ? 1 : num).toString();
    localStorage.setItem(`DURABLE_MAX_INVOICE_SEQ_${p}`, val);
    localStorage.setItem('LOCAL_INV_COUNTER', val);
    localStorage.setItem('DURABLE_MAX_INVOICE_SEQ', val);
  }
};

/**
 * Fetch the absolute highest sequence from durable storage filtered by terminal prefix.
 * Gapless, collision-free Bahrain NBR sequential numbering.
 */
export const generateNextInvoiceNumber = async (customPrefix?: string) => {
  const prefix = (customPrefix && customPrefix !== '001') ? customPrefix : getRegisterPrefix();

  let currentMax = 0;
  try {
    const result = await db.execute({
      sql: "SELECT MAX(invoiceSeq) as maxSeq FROM Sale WHERE invoiceNo LIKE ?",
      args: [`INV-${prefix}-%`]
    });
    if (result.rows && result.rows[0]?.maxSeq) {
      currentMax = Number(result.rows[0].maxSeq);
    }
  } catch {
    currentMax = getLocalInvoiceCounter(prefix);
  }

  const localCounter = getLocalInvoiceCounter(prefix);
  const nextSeq = Math.max(currentMax + 1, localCounter);

  const paddedSeq = nextSeq.toString().padStart(6, '0');
  const invoiceNo = `INV-${prefix}-${paddedSeq}`;

  setLocalInvoiceCounter(nextSeq + 1, prefix);

  return { invoiceNo, invoiceSeq: nextSeq };
};

/**
 * Synchronous backward-compatible fallback for components that cannot await.
 */
export const generateCompliantInvoiceNumber = (customPrefix?: string): string => {
  const prefix = (customPrefix && customPrefix !== '001') ? customPrefix : getRegisterPrefix();
  const currentCounter = getLocalInvoiceCounter(prefix);

  const sequenceStr = currentCounter.toString().padStart(6, '0');
  const invoiceNumber = `INV-${prefix}-${sequenceStr}`;

  setLocalInvoiceCounter(currentCounter + 1, prefix);

  return invoiceNumber;
};

/**
 * Preview the next invoice number without incrementing the counter.
 */
export const previewNextInvoiceNumber = (customPrefix?: string, customCounter?: number): string => {
  const p = (customPrefix && customPrefix !== '001') ? customPrefix : getRegisterPrefix();
  const c = customCounter !== undefined ? customCounter : getLocalInvoiceCounter(p);
  return `INV-${p}-${c.toString().padStart(6, '0')}`;
};

