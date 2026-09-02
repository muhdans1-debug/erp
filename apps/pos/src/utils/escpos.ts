// Standard ESC/POS Command Constants
const ESC = '\x1B';
const GS = '\x1D';

export const ESCPOS = {
  RESET: `${ESC}@`,
  ALIGN_LEFT: `${ESC}a\x00`,
  ALIGN_CENTER: `${ESC}a\x01`,
  ALIGN_RIGHT: `${ESC}a\x02`,
  BOLD_ON: `${ESC}E\x01`,
  BOLD_OFF: `${ESC}E\x00`,
  DOUBLE_HEIGHT: `${ESC}!\x10`,
  NORMAL_TEXT: `${ESC}!\x00`,
  FEED_CUT: `${GS}V\x41\x03`, // Feed and full cut
  SEPARATOR_58MM: '--------------------------------\n', // 32 chars width
  SEPARATOR_80MM: '------------------------------------------------\n', // 48 chars width
};

export interface ReceiptItem {
  name: string;
  sku: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ReceiptData {
  storeName: string;
  storeAddress: string;
  phone: string;
  orderId: string;
  cashierName: string;
  date: string;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  grandTotal: number;
  paymentMethod: string;
}

// Format 2-column key/value line with fixed character width
function formatLine(left: string, right: string, width = 32): string {
  const spaceLength = width - left.length - right.length;
  if (spaceLength <= 0) return `${left.slice(0, width - right.length - 1)} ${right}\n`;
  return `${left}${' '.repeat(spaceLength)}${right}\n`;
}

export function generateReceiptText(data: ReceiptData, width = 32): string {
  const sep = width === 32 ? ESCPOS.SEPARATOR_58MM : ESCPOS.SEPARATOR_80MM;
  let receipt = '';

  // Header
  receipt += ESCPOS.ALIGN_CENTER;
  receipt += ESCPOS.BOLD_ON + ESCPOS.DOUBLE_HEIGHT + `${data.storeName}\n` + ESCPOS.NORMAL_TEXT + ESCPOS.BOLD_OFF;
  receipt += `${data.storeAddress}\n`;
  receipt += `Tel: ${data.phone}\n`;
  receipt += sep;

  // Metadata
  receipt += ESCPOS.ALIGN_LEFT;
  receipt += `Order: #${data.orderId.slice(0, 8).toUpperCase()}\n`;
  receipt += `Date: ${data.date}\n`;
  receipt += `Cashier: ${data.cashierName}\n`;
  receipt += sep;

  // Line Items
  receipt += formatLine('Item [Qty]', 'Total', width);
  receipt += sep;

  for (const item of data.items) {
    const itemHeader = `${item.name.slice(0, 18)} x${item.qty}`;
    const priceStr = `$${item.lineTotal.toFixed(2)}`;
    receipt += formatLine(itemHeader, priceStr, width);
  }
  receipt += sep;

  // Totals
  receipt += formatLine('Subtotal:', `$${data.subtotal.toFixed(2)}`, width);
  receipt += formatLine('Tax (5%):', `$${data.tax.toFixed(2)}`, width);
  receipt += ESCPOS.BOLD_ON;
  receipt += formatLine('GRAND TOTAL:', `$${data.grandTotal.toFixed(2)}`, width);
  receipt += ESCPOS.BOLD_OFF;
  receipt += formatLine('Payment Method:', data.paymentMethod, width);
  receipt += sep;

  // Footer
  receipt += ESCPOS.ALIGN_CENTER;
  receipt += 'Thank you for your business!\n';
  receipt += 'Goods once sold are non-refundable.\n';
  receipt += ESCPOS.FEED_CUT;

  return receipt;
}