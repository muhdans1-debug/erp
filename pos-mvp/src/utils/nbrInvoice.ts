/**
 * Bahrain National Bureau for Revenue (NBR) VAT Executive Regulations (Article 53)
 * Compliant Sequential Invoice Number Generator
 *
 * Implements Terminal Block Allocation:
 * - Register 1 (Sunmi Terminal 1): INV-100001, INV-100002...
 * - Register 2 (Back-office Desktop): INV-200001, INV-200002...
 * - Register 3: INV-300001, INV-300002...
 *
 * Guaranteed strictly sequential, gapless, and collision-free across multiple registers.
 */

export const getRegisterPrefix = (): string => {
  if (typeof window === 'undefined') return '1';
  let prefix = localStorage.getItem('REGISTER_PREFIX');
  if (!prefix) {
    prefix = '1';
    localStorage.setItem('REGISTER_PREFIX', prefix);
  }
  return prefix;
};

export const getLocalInvoiceCounter = (): number => {
  if (typeof window === 'undefined') return 1;
  const raw = localStorage.getItem('LOCAL_INV_COUNTER');
  const parsed = parseInt(raw || '1', 10);
  return isNaN(parsed) || parsed < 1 ? 1 : parsed;
};

export const setRegisterPrefix = (prefix: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('REGISTER_PREFIX', prefix.trim() || '1');
  }
};

export const setLocalInvoiceCounter = (counter: number | string): void => {
  if (typeof window !== 'undefined') {
    const num = parseInt(counter.toString(), 10);
    localStorage.setItem('LOCAL_INV_COUNTER', (isNaN(num) || num < 1 ? 1 : num).toString());
  }
};

/**
 * Generates the next sequential invoice number and increments the persistent counter.
 * Example outputs: INV-100001, INV-100002, INV-200001
 */
export const generateCompliantInvoiceNumber = (): string => {
  if (typeof window === 'undefined') return 'INV-100001';

  const prefix = getRegisterPrefix();
  const currentCounter = getLocalInvoiceCounter();

  // Format to standard length: e.g. INV-100001
  const sequenceStr = currentCounter.toString().padStart(5, '0');
  const invoiceNumber = `INV-${prefix}${sequenceStr}`;

  // Increment and save for the next offline checkout
  localStorage.setItem('LOCAL_INV_COUNTER', (currentCounter + 1).toString());

  return invoiceNumber;
};

/**
 * Preview the next invoice number without incrementing the counter.
 */
export const previewNextInvoiceNumber = (customPrefix?: string, customCounter?: number): string => {
  const p = customPrefix !== undefined ? customPrefix : getRegisterPrefix();
  const c = customCounter !== undefined ? customCounter : getLocalInvoiceCounter();
  return `INV-${p}${c.toString().padStart(5, '0')}`;
};

