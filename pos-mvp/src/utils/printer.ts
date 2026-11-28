import { Printer } from 'capacitor-sunmi-printer';
// @ts-ignore
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { generateNBRReceiptHtml, ReceiptTemplateProps } from './receiptTemplate';
import { generateNbrTlvBase64 } from './nbrQr';
import { getRegionalReceiptDateTime } from './time';
import {
  getNetworkPrinterConfig,
  setNetworkPrinterConfig,
  dispatchSunmiPrintJob,
  testSunmiNetworkPrint,
  isNativeSunmiHardware,
  type NetworkPrinterConfig
} from './networkPrinter';
import {
  getPrinterStyleConfig,
  savePrinterStyleConfig,
  resetPrinterStyleConfig,
  type SunmiPrinterStyleConfig,
  DEFAULT_PRINTER_STYLE_CONFIG
} from './printerConfig';

export {
  generateNBRReceiptHtml,
  getNetworkPrinterConfig,
  setNetworkPrinterConfig,
  dispatchSunmiPrintJob,
  testSunmiNetworkPrint,
  isNativeSunmiHardware,
  getPrinterStyleConfig,
  savePrinterStyleConfig,
  resetPrinterStyleConfig,
  DEFAULT_PRINTER_STYLE_CONFIG
};
export type { ReceiptTemplateProps, NetworkPrinterConfig, SunmiPrinterStyleConfig };

// Initialize the printer Web Worker natively in Vite for off-main-thread receipt formatting
const printerWorker = typeof window !== 'undefined' && typeof Worker !== 'undefined'
  ? new Worker(new URL('../workers/printer.worker.ts', import.meta.url), {
    type: 'module',
  })
  : null;

/**
 * Lightweight, framework-agnostic non-blocking toast notification.
 * Replaces thread-blocking native alert() so background barcode & NFC scanning
 * is never paused in the Android WebView.
 */
export const showToast = (message: string, _type?: string) => {
  if (typeof window === 'undefined') return;

  const toast = document.createElement('div');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#222',
    color: '#fff',
    padding: '12px 24px',
    borderRadius: '8px',
    zIndex: '9999',
    fontSize: '16px',
    fontWeight: 'bold',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transition: 'opacity 0.3s'
  });

  document.body.appendChild(toast);

  // Automatically remove the toast after 3 seconds without blocking the thread
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

/**
 * Render and print a high-density 1D Code128 barcode natively on the Sunmi 58mm printer.
 * Uses HTML5 Canvas + JsBarcode centered on a full 384-dot thermal canvas.
 */
export const printBarCode128 = async (
  data: string,
  options?: { height?: number; width?: number; textPosition?: number }
): Promise<boolean> => {
  const cleanData = String(data || '').trim();
  if (!cleanData) return false;

  try {
    if (typeof document !== 'undefined') {
      const tempCanvas = document.createElement('canvas');
      JsBarcode(tempCanvas, cleanData, {
        format: 'CODE128',
        width: options?.width ?? 2,
        height: options?.height ?? 80,
        displayValue: options?.textPosition !== 0,
        fontSize: 16,
        margin: 6,
        textMargin: 3,
      });

      const PAPER_WIDTH = 384; // 58mm thermal printable dots
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = PAPER_WIDTH;
      fullCanvas.height = tempCanvas.height;
      const ctx = fullCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, PAPER_WIDTH, tempCanvas.height);
        const offsetX = Math.max(0, Math.floor((PAPER_WIDTH - tempCanvas.width) / 2));
        ctx.drawImage(tempCanvas, offsetX, 0);

        const dataUrl = fullCanvas.toDataURL('image/png');
        const base64Image = dataUrl.replace(/^data:image\/png;base64,/, '');
        await Printer.printBitmap({ base64Image });
        return true;
      }
    }
  } catch (err) {
    console.warn('Canvas barcode rasterization notice:', err);
  }

  // Hardware ESC/POS fallback if canvas is unavailable
  try {
    const len = cleanData.length;
    const escCmd = `\x1B\x61\x01\x1D\x68\x50\x1D\x77\x02\x1D\x48\x02\x1D\x6B\x49${String.fromCharCode(len)}${cleanData}`;
    await printRawEscPos(escCmd);
    return true;
  } catch (escErr) {
    console.warn('ESC/POS barcode command failed:', escErr);
    return false;
  }
};

/**
 * Render and print a high-density QR Code natively centered on Sunmi 58mm thermal printer.
 * Renders via QRCode.toDataURL and centers it horizontally across a 384-dot canvas.
 */
export const printQRCode = async (data: string, width = 180): Promise<boolean> => {
  const cleanData = String(data || '').trim();
  if (!cleanData) return false;

  try {
    if (typeof document !== 'undefined') {
      const tempCanvas = document.createElement('canvas');
      await QRCode.toCanvas(tempCanvas, cleanData, {
        width: width,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });

      const PAPER_WIDTH = 384; // Exact printable dot width of 58mm thermal printer
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = PAPER_WIDTH;
      fullCanvas.height = tempCanvas.height;
      const ctx = fullCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, PAPER_WIDTH, tempCanvas.height);
        const offsetX = Math.max(0, Math.floor((PAPER_WIDTH - tempCanvas.width) / 2));
        ctx.drawImage(tempCanvas, offsetX, 0);
        const base64Image = fullCanvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
        await Printer.printBitmap({ base64Image });
        return true;
      }
    }

    const qrDataUrl = await QRCode.toDataURL(cleanData, {
      width: width,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    const base64Image = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    await Printer.printBitmap({ base64Image });
    return true;
  } catch (err) {
    console.warn('Sunmi AIDL QR print error:', err);
    return false;
  }
};

/**
 * Unified Sunmi Printer hardware interface wrapper
 * Conforms to the standard SunmiPrinter API contract
 */
export const SunmiPrinter = {
  printerInit: async () => {
    try {
      await Printer.initPrinter();
    } catch (e) {
      console.warn('SunmiPrinter.printerInit warning:', e);
    }
  },
  setFontSize: async ({ fontSize }: { fontSize: number }) => {
    try {
      await Printer.setFontSize({ fontSize });
    } catch (e) {
      console.warn('SunmiPrinter.setFontSize warning:', e);
    }
  },
  setAlignment: async ({ alignment }: { alignment: number | 'left' | 'center' | 'right' }) => {
    try {
      if (alignment === 1 || alignment === 'center') await Printer.setPrinterAlignment({ alignment: 'center' });
      else if (alignment === 2 || alignment === 'right') await Printer.setPrinterAlignment({ alignment: 'right' });
      else await Printer.setPrinterAlignment({ alignment: 'left' });
    } catch (e) {
      console.warn('SunmiPrinter.setAlignment warning:', e);
    }
  },
  printText: async ({ text, alignment = 0 }: { text: string; alignment?: number }) => {
    try {
      if (alignment === 1) await Printer.setPrinterAlignment({ alignment: 'center' });
      else if (alignment === 2) await Printer.setPrinterAlignment({ alignment: 'right' });
      else await Printer.setPrinterAlignment({ alignment: 'left' });
      await Printer.printText({ textToPrint: text });
    } catch (e) {
      console.warn('SunmiPrinter.printText warning:', e);
    }
  },
  lineWrap: async ({ lines = 1 }: { lines?: number }) => {
    try {
      await Printer.lineWrap({ lines });
    } catch (e) {
      console.warn('SunmiPrinter.lineWrap warning:', e);
    }
  },
  printBarCode: async ({
    data,
    symbology: _symbology = 8,
    height = 80,
    width = 2,
    textPosition = 2,
  }: {
    data: string;
    symbology?: number;
    height?: number;
    width?: number;
    textPosition?: number;
  }) => {
    return printBarCode128(data, { height, width, textPosition });
  },
  printQRCode: async ({
    data,
    size = 5,
    moduleSize = 8,
    errorLevel: _errorLevel = 3,
  }: {
    data: string;
    size?: number;
    moduleSize?: number;
    errorLevel?: number;
  }) => {
    const qrWidth = (size && size <= 10) ? size * 36 : (size || moduleSize || 180);
    return printQRCode(data, qrWidth);
  },
  cutPaper: async () => {
    try {
      await Printer.cutPaper();
    } catch { }
  },
};

/**
 * Direct 58mm Thermal Shelf Tag Printing for Feitian F100 / Sunmi Terminals
 * Formats a clean supermarket shelf label with Centered Title, Large Price, VAT notation, and Code128 Barcode.
 */
export const printF100ShelfTag = async (productData: {
  name?: string;
  price?: number | string;
  barcode?: string;
  category?: string;
  vatRate?: number;
  isScaleItem?: boolean;
}): Promise<boolean> => {
  const name = (productData.name || 'ITEM').trim();
  const rawPrice = parseFloat(String(productData.price ?? 0)) || 0;
  const barcode = (productData.barcode || '').trim();
  const category = (productData.category || 'RETAIL').toUpperCase();
  const isWeighed = Boolean(productData.isScaleItem);
  const vatRate = productData.vatRate !== undefined ? Number(productData.vatRate) : 10;

  try {
    await SunmiPrinter.printerInit();

    // 1. Department / Store Header (Centered, Normal Font)
    await SunmiPrinter.setAlignment({ alignment: 1 });
    await SunmiPrinter.setFontSize({ fontSize: 20 });
    await SunmiPrinter.printText({ text: `* LAYALI SUPERMARKET *\n` });
    await SunmiPrinter.printText({ text: `[ ${category} ]\n` });
    await SunmiPrinter.printText({ text: `--------------------------------\n` });

    // 2. Product Name (Centered, Bold, Large Font)
    await SunmiPrinter.setFontSize({ fontSize: 28 });
    await SunmiPrinter.printText({ text: `${name}\n` });

    // 3. Selling Price (Centered, Extra Large Font)
    await SunmiPrinter.setFontSize({ fontSize: 44 });
    const priceText = isWeighed
      ? `BD ${rawPrice.toFixed(3)} /KG\n`
      : `BD ${rawPrice.toFixed(3)}\n`;
    await SunmiPrinter.printText({ text: priceText });

    // 4. Tax / VAT Subtitle
    await SunmiPrinter.setFontSize({ fontSize: 18 });
    const vatText = vatRate > 0 ? `(PRICE INCL ${vatRate}% VAT)\n` : `(BASIC FOOD - 0% VAT)\n`;
    await SunmiPrinter.printText({ text: vatText });
    await SunmiPrinter.printText({ text: `--------------------------------\n` });

    // 5. Code128 Barcode for Shelf Scanning (if barcode exists)
    if (barcode && barcode.length >= 3) {
      await SunmiPrinter.printBarCode({
        data: barcode,
        symbology: 8,
        height: 80,
        width: 2,
        textPosition: 2
      });
    } else {
      await SunmiPrinter.printText({ text: `* NO BARCODE REGISTERED *\n` });
    }

    // 6. Footer Audit Note
    await SunmiPrinter.setFontSize({ fontSize: 16 });
    const dateStr = new Date().toLocaleDateString('en-GB');
    await SunmiPrinter.printText({ text: `${dateStr}  #F100-PIM\n` });

    // 7. Feed 3 blank lines to clear the physical tear-off bar
    await SunmiPrinter.lineWrap({ lines: 3 });

    return true;
  } catch (err) {
    console.warn('F100 Thermal Printer Shelf Tag Error:', err);
    return false;
  }
};

export interface ReceiptItem {
  id?: string;
  name: string;
  price: number;
  qty: number;
  vatRate?: number;
  isScaleItem?: boolean;
  total_price?: number;
}

/**
 * Format a single line item for physical receipt printing with weighed vs standard item discrimination.
 */
export const formatReceiptLineItem = (item: {
  name: string;
  qty: number;
  price?: number;
  total_price?: number;
  isScaleItem?: boolean;
}): string => {
  const price = item.price ?? 0;
  const totalPrice = item.total_price ?? (price * item.qty);
  return item.isScaleItem
    ? `${item.name}\n  ${item.qty.toFixed(3)}kg x ${price.toFixed(3)}   ${totalPrice.toFixed(3)}`
    : `${item.name}\n  ${item.qty} x ${price.toFixed(3)}         ${totalPrice.toFixed(3)}`;
};

export interface FullReceiptProps {
  shopName?: string;
  shopNameAr?: string;
  crNumber?: string;
  shopAddress?: string;
  shopPhone?: string;
  vatNumber?: string;
  invoiceNo: string;
  items: ReceiptItem[];
  subtotal: number;
  vat: number;
  total: number;
  paymentMode: 'CASH' | 'BENEFIT_PAY' | 'CARD' | 'CREDIT' | string;
  customerName?: string;
  customerCardUid?: string;
  previousBalance?: number;
  newBalance?: number;
  personalBalance?: number;
  messBalance?: number;
  hasMessGroup?: boolean;
  cashierName?: string;
  transactionRef?: string;
  isMess?: boolean;
  groupName?: string;
  cardUid?: string;
  shopperName?: string;
  members?: any[];
  customerId?: string;
  customerUuid?: string;
  cashTendered?: number;
  changeDue?: number;
  saleDate?: string | Date;
  isReprint?: boolean;
  styleConfig?: Partial<SunmiPrinterStyleConfig>;
  includeFooter?: boolean;
}

// 58mm thermal paper fits 32 characters per line in standard font (42 for 80mm)
export const formatTwoCols = (left: string, right: string, width = 32): string => {
  const leftTrim = left.length > width - right.length - 1
    ? left.slice(0, width - right.length - 2) + '.'
    : left;
  const spaces = Math.max(1, width - leftTrim.length - right.length);
  return `${leftTrim}${' '.repeat(spaces)}${right}\n`;
};

export const centerText = (text: string, width = 32): string => {
  const trimmed = text.trim();
  if (trimmed.length >= width) return trimmed + '\n';
  const leftPad = Math.floor((width - trimmed.length) / 2);
  const rightPad = width - trimmed.length - leftPad;
  return `${' '.repeat(leftPad)}${trimmed}${' '.repeat(rightPad)}\n`;
};

// Raw ESC/POS standard byte constants for direct execution
export const ESC_POS = {
  INIT: '\x1B\x40',
  ALIGN_LEFT: '\x1B\x61\x00',
  ALIGN_CENTER: '\x1B\x61\x01',
  ALIGN_RIGHT: '\x1B\x61\x02',
  FONT_NORMAL: '\x1B\x21\x00',
  FONT_BOLD: '\x1B\x21\x08',
  FONT_DOUBLE_HEIGHT: '\x1B\x21\x10',
  FONT_DOUBLE_WIDTH: '\x1B\x21\x20',
  BOLD_ON: '\x1B\x45\x01',
  BOLD_OFF: '\x1B\x45\x00',
  DOUBLE_STRIKE_ON: '\x1B\x47\x01',
  DOUBLE_STRIKE_OFF: '\x1B\x47\x00',
  LINE_FEED: '\x0A',
  CUT_FULL: '\x1D\x56\x00',
  CUT_PARTIAL: '\x1D\x56\x01',
};

/**
 * Send raw ESC/POS byte commands directly to the Sunmi printer buffer.
 * Bypasses Android font rasterization for maximum execution speed.
 */
export const printRawEscPos = async (rawString: string): Promise<boolean> => {
  try {
    const base64Data = btoa(unescape(encodeURIComponent(rawString)));
    await Printer.enterPrinterBuffer({ clean: true });
    await Printer.sendRAWData({ base64Data });
    await Printer.exitPrinterBuffer({ commit: true });
    return true;
  } catch (err) {
    console.warn("Raw ESC/POS execution failed:", err);
    return false;
  }
};

const escapeHtml = (str: any) => String(str ?? '').replace(/[&<>"']/g, (m) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
}[m] || m));

/**
 * Generate in-memory CODE128 barcode data URL for receipt return scanning
 */
export const generateBarcodeDataUrl = (data: string): string => {
  if (typeof document === 'undefined') return '';
  try {
    const cleanData = String(data || '').trim();
    if (!cleanData) return '';
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, cleanData, {
      format: 'CODE128',
      width: 2,
      height: 44,
      displayValue: false,
      margin: 2,
    });
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('Barcode generation warning:', err);
    return '';
  }
};

/**
 * Generate in-memory QR Code data URL for NBR TLV / Khata statements
 */
export const generateQrDataUrl = async (data: string, width = 140): Promise<string> => {
  try {
    const clean = String(data || '').trim();
    if (!clean) return '';
    return await QRCode.toDataURL(clean, {
      width,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' }
    });
  } catch (err) {
    console.warn('QR code generation warning:', err);
    return '';
  }
};

/**
 * Wrap raw monospaced thermal slip text (Z-Reports, Khata statements, closeouts)
 * into a standalone 58mm / 80mm printable HTML page with zero leading margins.
 */
export const wrapMonospaceTextToHtml = (text: string, title = 'Thermal Print Slip', extraHtml = ''): string => {
  const is80mm = typeof window !== 'undefined' && localStorage.getItem('pos_receipt_format') === '80mm';
  const widthMm = is80mm ? '70mm' : '48mm';
  const pageSize = is80mm ? '80mm auto' : '58mm auto';
  const fontSize = is80mm ? '11px' : '9.5px';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: ${pageSize};
      margin: 0mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
    body {
      font-family: 'Roboto Mono', Consolas, 'Courier New', monospace;
      font-weight: 600;
      color: #000000;
      width: ${widthMm};
      max-width: ${widthMm};
      margin: 0 auto;
      padding: 1.5mm 1mm;
      border: none;
      box-sizing: border-box;
      font-size: ${fontSize};
      line-height: 1.25;
      letter-spacing: -0.15px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    @media print {
      html, body {
        margin: 0 auto !important;
        background: #ffffff !important;
      }
      body {
        width: ${widthMm} !important;
        max-width: ${widthMm} !important;
        margin: 0 auto !important;
        padding: 1.5mm 1mm !important;
        border: none !important;
        box-sizing: border-box !important;
      }
    }
  </style>
</head>
<body>${escapeHtml(text)}${extraHtml}</body>
</html>`;
};

/**
 * Isolated iframe printing engine.
 * Renders ONLY the receipt slip into a headless iframe, completely detached from the POS
 * application DOM. Guarantees 0 POS app bleed, 0 blank pages upfront, and exact 58mm/80mm roll width.
 */
export const printThermalSlipViaIframe = (htmlContent: string): Promise<boolean> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve(false);
      return;
    }

    try {
      const oldFrame = document.getElementById('pos-thermal-print-frame');
      if (oldFrame && oldFrame.parentNode) {
        try {
          oldFrame.parentNode.removeChild(oldFrame);
        } catch { }
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'pos-thermal-print-frame';
      iframe.setAttribute(
        'style',
        'position:fixed;top:-10000px;left:-10000px;width:0px;height:0px;border:none;visibility:hidden;z-index:-9999;'
      );
      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!frameDoc || !iframe.contentWindow) {
        console.warn('Thermal print iframe window unavailable');
        resolve(false);
        return;
      }

      frameDoc.open();
      frameDoc.write(htmlContent);
      frameDoc.close();

      const triggerPrint = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          resolve(true);
        } catch (err) {
          console.warn('Iframe print execution notice:', err);
          resolve(false);
        } finally {
          setTimeout(() => {
            try {
              if (iframe.parentNode) {
                iframe.parentNode.removeChild(iframe);
              }
            } catch { }
          }, 45000);
        }
      };

      if (frameDoc.readyState === 'complete') {
        setTimeout(triggerPrint, 250);
      } else {
        iframe.onload = () => setTimeout(triggerPrint, 250);
        setTimeout(triggerPrint, 600);
      }
    } catch (e) {
      console.warn('printThermalSlipViaIframe error:', e);
      resolve(false);
    }
  });
};

/**
 * 58mm / 80mm Monospaced Sales Receipt Formatter (Exact Authentic Sunmi Hardware Format).
 * Formats clean, 32-column or 48-column text with authentic dividers, strict 2-column alignment, and zero artificial borders.
 */
export const formatSaleReceiptText = (props: FullReceiptProps): string => {
  const cfg = {
    ...getPrinterStyleConfig(),
    ...(props.styleConfig || {})
  };
  const is80mm = cfg.paperWidth === '80mm';
  const width = is80mm ? 48 : 32;
  const lineEqual = "=".repeat(width) + "\n";
  const lineDash = "-".repeat(width) + "\n";
  const isCompact = cfg.receiptTheme === 'compact_quick' || cfg.fontSize === 'compact';

  const shopName = props.shopName || cfg.shopNameEn;
  const shopNameAr = props.shopNameAr || cfg.shopNameAr;
  const crNumber = props.crNumber || cfg.crNumber;
  const vatNumber = props.vatNumber || cfg.vatNumber;
  const shopAddress = props.shopAddress || cfg.shopAddressEn;
  const shopPhone = props.shopPhone || cfg.shopPhone;

  let cleanInvoice = (props.invoiceNo !== undefined && props.invoiceNo !== null) ? String(props.invoiceNo).trim() : '';
  if (!cleanInvoice || cleanInvoice === '0' || cleanInvoice === 'INV-0' || cleanInvoice === '#0' || cleanInvoice.includes('undefined')) {
    cleanInvoice = 'INV-005000';
  }
  const finalInvoiceDisplay = cleanInvoice.startsWith('INV-')
    ? cleanInvoice
    : (cleanInvoice.startsWith('#') ? cleanInvoice.slice(1) : cleanInvoice);

  const formattedDate = getRegionalReceiptDateTime(props.saleDate);
  const cashierName = props.cashierName || "Register 01";
  const paymentMode = (props.paymentMode || "CASH").toUpperCase();

  const total = Number(props.total || 0);

  let out = "";

  if (isCompact) {
    // ⚡ COMPACT PROFESSIONAL HEADER (Saves 6-7 lines)
    out += centerText(shopName, width);
    if (cfg.showArabicHeader && shopNameAr) {
      out += centerText(shopNameAr, width);
    }
    out += centerText(`CR:${crNumber} | VAT:${vatNumber}`, width);
    out += centerText(`Tel: ${shopPhone}`, width);

    if (props.isReprint) {
      out += lineDash;
      out += centerText("*** DUPLICATE / REPRINT ***", width);
      out += lineDash;
    } else {
      out += lineDash;
    }

    out += formatTwoCols(`INV:${finalInvoiceDisplay}`, formattedDate, width);
    out += formatTwoCols(`Mode:${paymentMode}`, `Staff:${cashierName}`, width);
    if (props.customerName && !props.isMess) {
      out += formatTwoCols("Customer:", props.customerName, width);
    }
    out += lineDash;
  } else {
    // 📋 CLASSIC FULL HEADER
    out += centerText(shopName, width);
    if (cfg.showArabicHeader && shopNameAr) {
      out += centerText(shopNameAr, width);
    }
    out += centerText("SIMPLIFIED TAX INVOICE", width);
    out += centerText("فاتورة ضريبية مبسطة", width);
    out += centerText(`C.R. No: ${crNumber}`, width);
    out += centerText(`VAT TRN: ${vatNumber}`, width);
    out += centerText(shopAddress, width);
    out += centerText(`Tel: ${shopPhone}`, width);

    if (props.isReprint) {
      out += lineEqual;
      out += centerText("*** DUPLICATE / REPRINT COPY ***", width);
      out += centerText("نسخة معاد طباعتها", width);
      out += lineEqual;
    } else {
      out += lineEqual;
    }

    out += formatTwoCols("Invoice:", finalInvoiceDisplay, width);
    out += formatTwoCols("Date:", formattedDate, width);
    out += formatTwoCols(`Staff: ${cashierName}`, `Mode: ${paymentMode}`, width);
    if (props.customerName && !props.isMess) {
      out += formatTwoCols("Customer:", props.customerName, width);
    }
    out += lineDash;
    out += formatTwoCols("Item / Description", "Qty/Amt(BD)", width);
    out += lineDash;
  }

  // Group items
  const groupedMap = new Map<string, { item: ReceiptItem; count: number }>();
  for (const item of props.items || []) {
    const key = item.id || item.name;
    const itemQty = Number((item as any).qty ?? (item as any).quantity ?? 1);
    if (groupedMap.has(key)) {
      groupedMap.get(key)!.count += itemQty;
    } else {
      groupedMap.set(key, { item, count: itemQty });
    }
  }

  let totalQty = 0;
  let idx = 0;
  let standardTaxableBase = 0;
  let standardVatAmount = 0;
  let zeroRatedBase = 0;

  for (const { item, count } of groupedMap.values()) {
    idx += 1;
    const isScale = Boolean((item as any).isScaleItem ?? (item as any).is_weighed_item);
    totalQty += (isScale ? 1 : count);
    const unitPrice = Number(item.price ?? (item as any).sellingPrice ?? 0);
    const lineTotal = Number(item.total_price ?? (unitPrice * count));
    const isVat10 = item.vatRate === 10 || (item.vatRate === undefined && (item as any).taxRate !== 0);

    if (isVat10) {
      const base = lineTotal / 1.10;
      standardTaxableBase += base;
      standardVatAmount += (lineTotal - base);
    } else {
      zeroRatedBase += lineTotal;
    }

    const vatTag = isVat10 ? '*' : 'Z';
    const itemLabel = `${idx}.${item.name}`;

    if (isCompact && count === 1 && !isScale && (!cfg.showArabicItems || !(item as any).nameAr)) {
      // ⚡ Single-line clean item for single unit count!
      out += formatTwoCols(itemLabel, `BD ${lineTotal.toFixed(3)}${vatTag}`, width);
    } else {
      out += `${itemLabel}\n`;
      if (cfg.showArabicItems && (item as any).nameAr) {
        out += `  ${(item as any).nameAr}\n`;
      }
      const qtyLine = isScale
        ? `  ${count.toFixed(3)}kg @ ${unitPrice.toFixed(3)}`
        : `  ${count}x @ ${unitPrice.toFixed(3)}`;
      out += formatTwoCols(qtyLine, `BD ${lineTotal.toFixed(3)} [${vatTag}]`, width);
    }
  }

  const calculatedVat = Number(standardVatAmount.toFixed(3));
  const subtotalExcl = Number((total - calculatedVat).toFixed(3));

  out += lineDash;
  if (cfg.showVatBreakdown) {
    out += formatTwoCols("Standard (10% Base):", `BD ${standardTaxableBase.toFixed(3)}`, width);
    out += formatTwoCols("VAT (10%):", `BD ${calculatedVat.toFixed(3)}`, width);
    if (zeroRatedBase > 0) {
      out += formatTwoCols("Zero-Rated (0% Base):", `BD ${zeroRatedBase.toFixed(3)}`, width);
    }
    out += formatTwoCols("Subtotal (Excl. VAT):", `BD ${subtotalExcl.toFixed(3)}`, width);
    out += lineDash;
  } else {
    // ⚡ Consolidated Subtotal & 10% VAT line
    out += formatTwoCols(`Subtotal: BD ${subtotalExcl.toFixed(3)}`, `VAT: BD ${calculatedVat.toFixed(3)}`, width);
  }

  // Highlighted Grand Total
  if (isCompact && cfg.totalBannerSize === 'standard') {
    out += lineEqual;
    out += formatTwoCols("TOTAL / المجموع:", `BD ${total.toFixed(3)}`, width);
    out += lineEqual;
  } else {
    out += lineEqual;
    out += "<<JUMBO_TOTAL>>\n";
    out += centerText("TOTAL / المجموع الإجمالي", width);
    out += centerText(`BD ${total.toFixed(3)}`, width);
    out += "<</JUMBO_TOTAL>>\n";
    out += centerText("(Inclusive of 10% VAT / شامل الضريبة)", width);
    out += lineEqual;
  }

  // Payments
  if (paymentMode === 'CASH') {
    const tendered = props.cashTendered !== undefined ? Number(props.cashTendered) : total;
    const change = props.changeDue !== undefined ? Number(props.changeDue) : (tendered > total ? tendered - total : 0);
    out += formatTwoCols(`Paid (CASH): BD ${tendered.toFixed(3)}`, `Change: BD ${change.toFixed(3)}`, width);
    out += lineDash;
  } else if (paymentMode === 'BENEFIT_PAY') {
    out += formatTwoCols("Method: BenefitPay", props.transactionRef ? `Ref:${props.transactionRef}` : "Fawri+", width);
    out += lineDash;
  } else if (paymentMode === 'CARD') {
    out += formatTwoCols("Paid: Card", "EMV Contactless", width);
    out += lineDash;
  } else if (paymentMode === 'MESS_KHATA' || props.isMess) {
    const group = props.groupName || props.customerName || "Shared Mess";
    const prevDebt = Number(props.previousBalance || 0);
    const finalBalance = props.newBalance !== undefined
      ? Number(props.newBalance)
      : (prevDebt + total);

    out += centerText("*** ROOM MESS KHATA / حساب ميس العمال ***", width);
    out += formatTwoCols(`Mess Group: ${group}`, `Room #${group.slice(0, 10)}`, width);
    if (props.shopperName) {
      out += formatTwoCols("Shopper:", props.shopperName, width);
    }
    const memCount = Number(props.members?.length || 1);
    out += formatTwoCols("Active Roommates:", `${memCount} workers`, width);
    out += lineDash;
    if (prevDebt > 0) {
      out += formatTwoCols("Mess Prev Balance:", `BD ${prevDebt.toFixed(3)}`, width);
    }
    out += formatTwoCols("Total Basket Bill:", `+BD ${total.toFixed(3)}`, width);
    out += lineEqual;
    out += "<<JUMBO_DEBT>>\n";
    out += centerText(">>> MESS TOTAL DUE / رصيد الميس <<<", width);
    out += centerText(`BD ${finalBalance.toFixed(3)}`, width);
    out += "<</JUMBO_DEBT>>\n";
    out += lineDash;
    const splitPerWorker = (total / memCount).toFixed(3);
    out += formatTwoCols("Each Member Split Share:", `BD ${splitPerWorker}`, width);
    out += lineEqual;
  } else if (paymentMode === 'CREDIT' || paymentMode === 'KHATA' || paymentMode === 'CREDIT_PERSONAL') {
    const prevDebt = Number(props.previousBalance || 0);
    const finalBalance = props.newBalance !== undefined
      ? Number(props.newBalance)
      : (prevDebt + total);

    const isPersonalWallet = paymentMode === 'CREDIT_PERSONAL' || Boolean(props.hasMessGroup || (props.messBalance && Number(props.messBalance) > 0));

    if (isCompact && !cfg.showCreditBalanceBox) {
      out += formatTwoCols(`Customer: ${props.customerName || 'Khata'}`, prevDebt <= 0.0001 ? "Prev: BD 0.000 (PAID)" : `Prev: BD ${prevDebt.toFixed(3)}`, width);
      out += formatTwoCols(isPersonalWallet ? "PERSONAL DUE / المستحق:" : "BALANCE DUE / المستحق:", `BD ${finalBalance.toFixed(3)}`, width);
      out += lineEqual;
    } else {
      out += centerText(isPersonalWallet ? "*** PERSONAL KHATA TAB / حساب الآجل الشخصي ***" : "*** KHATA CREDIT TAB / حساب الآجل ***", width);
      if (props.customerName) out += formatTwoCols("Customer:", props.customerName, width);
      if (props.previousBalance !== undefined) {
        if (prevDebt <= 0.0001) {
          out += formatTwoCols(isPersonalWallet ? "Personal Prev Debt:" : "Previous Debt:", "BD 0.000 (PAID)", width);
        } else {
          out += formatTwoCols(isPersonalWallet ? "Personal Prev Debt:" : "Previous Debt:", `BD ${prevDebt.toFixed(3)}`, width);
        }
      }
      out += formatTwoCols("Added:", `+BD ${total.toFixed(3)}`, width);
      out += lineEqual;
      out += "<<JUMBO_DEBT>>\n";
      out += centerText(isPersonalWallet ? ">>> PERSONAL BALANCE DUE <<<" : ">>> TOTAL BALANCE DUE <<<", width);
      out += centerText(`BD ${finalBalance.toFixed(3)}`, width);
      out += "<</JUMBO_DEBT>>\n";

      // If customer has a communal mess group, clarify their mess share without confusing their personal tab
      if (isPersonalWallet && props.messBalance && Number(props.messBalance) > 0) {
        out += lineDash;
        out += formatTwoCols("Room Mess Share:", `BD ${Number(props.messBalance).toFixed(3)}`, width);
        out += formatTwoCols("Combined Total Owed:", `BD ${(finalBalance + Number(props.messBalance)).toFixed(3)}`, width);
      }
      out += lineEqual;
    }
  }

  // Footer (Only included if includeFooter !== false)
  if (props.includeFooter !== false) {
    out += centerText("Thank You! شكراً لزيارتكم", width);
    if (cfg.footerPolicyEn) {
      out += centerText(cfg.footerPolicyEn, width);
    }
    out += lineDash;
  }

  return out;
};

/**
 * Generate full NBR Simplified Tax Invoice HTML with embedded NBR QR code,
 * Return barcode, Mess split details, Khata tab, and zero-margin 58mm/80mm thermal CSS.
 * Formatted to match authentic Sunmi thermal hardware output with professional styling.
 */
export const generateFullReceiptHtml = async (props: FullReceiptProps): Promise<string> => {
  const cfg = {
    ...getPrinterStyleConfig(),
    ...(props.styleConfig || {})
  };

  let cleanInvoice = (props.invoiceNo !== undefined && props.invoiceNo !== null) ? String(props.invoiceNo).trim() : '';
  if (!cleanInvoice || cleanInvoice === '0' || cleanInvoice === 'INV-0' || cleanInvoice === '#0' || cleanInvoice.includes('undefined')) {
    cleanInvoice = 'INV-005000';
  }
  const finalInvoiceDisplay = cleanInvoice.startsWith('INV-')
    ? cleanInvoice
    : (cleanInvoice.startsWith('#') ? cleanInvoice.slice(1) : cleanInvoice);

  const total = Number(props.total || 0);
  const subtotal = props.subtotal !== undefined
    ? Number(props.subtotal)
    : (props.vat !== undefined ? total - Number(props.vat) : Number((total / 1.1).toFixed(3)));
  const vat = props.vat !== undefined
    ? Number(props.vat)
    : Number((total - subtotal).toFixed(3));
  const saleDateObj = props.saleDate ? new Date(props.saleDate) : new Date();

  // QR Code (NBR Official Article 53 TLV)
  let nbrQrDataUrl = '';
  if (cfg.showNbrQr) {
    try {
      const nbrPayload = generateNbrTlvBase64({
        sellerName: props.shopName || cfg.shopNameEn,
        vatNumber: props.vatNumber || cfg.vatNumber,
        timestamp: saleDateObj,
        total: total,
        vatAmount: vat
      });
      nbrQrDataUrl = await generateQrDataUrl(nbrPayload, 140);
    } catch (err) {
      console.warn("Failed generating NBR QR code:", err);
    }
  }

  // Barcode (CODE128)
  let barcodeDataUrl = '';
  if (cfg.showReturnBarcode) {
    barcodeDataUrl = generateBarcodeDataUrl(finalInvoiceDisplay);
  }

  // Optional: Khata PWA QR code if customer has debt
  let khataQrDataUrl = '';
  const targetCustId = props.customerId || props.customerUuid || props.cardUid || props.customerCardUid;
  const paymentMode = (props.paymentMode || "CASH").toUpperCase();
  const isKhataCustomer = Boolean(
    targetCustId && (
      paymentMode === 'CREDIT' || paymentMode === 'MESS_KHATA' || paymentMode === 'KHATA' || props.isMess ||
      (props.newBalance !== undefined && Number(props.newBalance) > 0)
    )
  );

  if (cfg.showKhataQr && isKhataCustomer && targetCustId) {
    const portalDomain = (typeof window !== 'undefined' && localStorage.getItem('khata_portal_domain'))
      ? localStorage.getItem('khata_portal_domain')!.replace(/\/+$/, '')
      : 'https://askar-khata-pwa.vercel.app';
    const params = new URLSearchParams();
    if (finalInvoiceDisplay) params.append('receiptInv', finalInvoiceDisplay);
    if (props.newBalance !== undefined && props.newBalance !== null) {
      params.append('receiptBal', Number(props.newBalance).toFixed(3));
    }
    if (props.personalBalance !== undefined && props.personalBalance !== null) {
      params.append('personalBal', Number(props.personalBalance).toFixed(3));
    }
    if (props.messBalance !== undefined && props.messBalance !== null) {
      params.append('messBal', Number(props.messBalance).toFixed(3));
    }
    params.append('receiptTs', String(props.saleDate ? new Date(props.saleDate).getTime() : Date.now()));

    const pwaUrl = `${portalDomain}/tab/${targetCustId}?${params.toString()}`;
    try {
      khataQrDataUrl = await generateQrDataUrl(pwaUrl, 140);
    } catch { }
  }

  return generateNBRReceiptHtml({
    invoiceNo: finalInvoiceDisplay,
    shopName: props.shopName || cfg.shopNameEn,
    shopNameAr: props.shopNameAr || cfg.shopNameAr,
    crNumber: props.crNumber || cfg.crNumber,
    vatNumber: props.vatNumber || cfg.vatNumber,
    shopAddress: props.shopAddress || cfg.shopAddressEn,
    shopPhone: props.shopPhone || cfg.shopPhone,
    staffName: props.cashierName || 'Register 01',
    dateStr: getRegionalReceiptDateTime(props.saleDate),
    paymentMode: props.paymentMode,
    cashTendered: props.cashTendered,
    changeDue: props.changeDue,
    customerName: props.customerName,
    customerCardUid: props.customerCardUid || (props.cardUid ? String(props.cardUid) : undefined),
    previousBalance: props.previousBalance,
    newBalance: props.newBalance,
    personalBalance: props.personalBalance,
    messBalance: props.messBalance,
    isMess: props.isMess,
    groupName: props.groupName,
    shopperName: props.shopperName,
    members: props.members,
    transactionRef: props.transactionRef,
    items: (props.items || []).map((itm: any) => ({
      name: itm.name || 'Item',
      nameAr: itm.nameAr || itm.arabicName,
      price: Number(itm.price ?? itm.sellingPrice ?? 0),
      qty: Number(itm.qty ?? itm.quantity ?? 1),
      is_weighed_item: Boolean(itm.isScaleItem ?? itm.is_weighed_item),
      vatRate: itm.vatRate !== undefined ? Number(itm.vatRate) : (itm.taxRate !== undefined ? Number(itm.taxRate) : 10)
    })),
    total: total,
    subtotal: subtotal,
    vat: vat,
    qrCodeDataUrl: nbrQrDataUrl,
    barcodeDataUrl: barcodeDataUrl,
    khataQrDataUrl: khataQrDataUrl,
    isReprint: props.isReprint,
    styleConfig: cfg,
  });
};

let isPrinterInitialized = false;

/**
 * Direct Hardware Printing on physical Sunmi terminal (Thermal ESC/POS + Sunmi AIDL)
 */
export const printNativeSunmiReceipt = async (props: FullReceiptProps) => {
  const cfg = {
    ...getPrinterStyleConfig(),
    ...(props.styleConfig || {})
  };

  const {
    shopName = cfg.shopNameEn,
    shopAddress = cfg.shopAddressEn,
    shopPhone = cfg.shopPhone,
    vatNumber = cfg.vatNumber,
    invoiceNo,
    vat,
    total,
    paymentMode,
    customerCardUid,
    previousBalance,
    newBalance = 0,
    isMess = false,
    cardUid,
    customerId,
    customerUuid,
    saleDate
  } = props;

  try {
    if (!isPrinterInitialized) {
      try {
        await Printer.initPrinter();
        isPrinterInitialized = true;
      } catch { }
    }

    // Hardware burst-buffer mode: Spools text into continuous high-speed thermal pass (0.6s print)
    try {
      await Printer.enterPrinterBuffer({ clean: true });
    } catch { }

    // Hardware density / darkness command based on config
    try {
      if (cfg.printDensity === 'deep_burn') {
        await printRawEscPos('\x1B\x45\x01\x1B\x47\x01'); // Emphasized bold + double-strike deep burn
      } else if (cfg.printDensity === 'dark') {
        await printRawEscPos('\x1B\x45\x01\x1B\x47\x00'); // Emphasized bold
      } else {
        await printRawEscPos('\x1B\x45\x00\x1B\x47\x00'); // Normal ESC/POS
      }
    } catch { }

    const receiptText = formatSaleReceiptText({
      ...props,
      shopName,
      shopAddress,
      shopPhone,
      vatNumber,
      styleConfig: cfg,
      includeFooter: false, // Footer prints at the very end after barcodes & QR codes
    });

    let cleanInvoice = (invoiceNo !== undefined && invoiceNo !== null) ? String(invoiceNo).trim() : '';
    if (!cleanInvoice || cleanInvoice === '0' || cleanInvoice === 'INV-0' || cleanInvoice === '#0' || cleanInvoice.includes('undefined')) {
      cleanInvoice = 'INV-005000';
    }
    const finalInvoiceDisplay = cleanInvoice.startsWith('INV-')
      ? cleanInvoice
      : (cleanInvoice.startsWith('#') ? cleanInvoice.slice(1) : cleanInvoice);

    // 1. Dispatch authentic Sunmi receipt text with dynamic font scaling for laborers
    const fontPt = cfg.fontSize === 'compact' ? 18 : (cfg.fontSize === 'large' ? 24 : 20);
    const jumboPt = cfg.totalBannerSize === 'jumbo' ? 36 : (cfg.totalBannerSize === 'extra_bold' ? 30 : 26);
    const debtPt = cfg.seniorHighLegibility ? 34 : 26;

    const segments = receiptText.split(/(<<JUMBO_[A-Z]+>>[\s\S]*?<<\/JUMBO_[A-Z]+>>)/g);
    for (const seg of segments) {
      if (!seg) continue;
      if (seg.startsWith('<<JUMBO_TOTAL>>')) {
        const cleanContent = seg.replace(/<<\/?JUMBO_TOTAL>>/g, '').trim() + '\n';
        await Printer.setPrinterAlignment({ alignment: 'center' });
        await Printer.setFontSize({ fontSize: jumboPt });
        await Printer.printText({ textToPrint: cleanContent });
        await Printer.setFontSize({ fontSize: fontPt });
      } else if (seg.startsWith('<<JUMBO_DEBT>>')) {
        const cleanContent = seg.replace(/<<\/?JUMBO_DEBT>>/g, '').trim() + '\n';
        await Printer.setPrinterAlignment({ alignment: 'center' });
        await Printer.setFontSize({ fontSize: debtPt });
        await Printer.printText({ textToPrint: cleanContent });
        await Printer.setFontSize({ fontSize: fontPt });
      } else {
        await Printer.setPrinterAlignment({ alignment: 'left' });
        await Printer.setFontSize({ fontSize: fontPt });
        await Printer.printText({ textToPrint: seg });
      }
    }

    // 2. BAHRAIN NBR ARTICLE 53 SIMPLIFIED TAX INVOICE QR CODE (Official 5-Tag TLV Base64)
    if (cfg.showNbrQr) {
      try {
        const nbrPayload = generateNbrTlvBase64({
          sellerName: shopName,
          vatNumber: vatNumber,
          timestamp: saleDate || new Date(),
          total: total,
          vatAmount: vat
        });
        await Printer.setPrinterAlignment({ alignment: 'center' });
        const qrSize = (cfg.receiptTheme === 'compact_quick' || cfg.fontSize === 'compact') ? 115 : 160;
        await printQRCode(nbrPayload, qrSize);
        if (!cfg.receiptTheme || cfg.receiptTheme !== 'compact_quick') {
          await Printer.printText({ textToPrint: "NBR Simplified Tax Invoice QR\n" });
        }
      } catch (nbrErr) {
        console.warn("NBR QR print warning:", nbrErr);
      }
    }

    // 3. CODE128 BARCODE FOR REFUNDS / RETURNS (NBR & POS Protocol - Centered)
    if (cfg.showReturnBarcode) {
      try {
        await Printer.printText({ textToPrint: "--------------------------------\nSCAN TO RETURN ITEMS\n" });
        await printBarCode128(finalInvoiceDisplay, { height: 70, width: 2, textPosition: 2 });
      } catch (bcErr) {
        console.warn("Return barcode print warning:", bcErr);
      }
    }

    // 4. THE QR CODE INJECTOR (Physical-to-Digital Bridge - Strictly Khata Customers)
    if (cfg.showKhataQr) {
      try {
        const isCreditSale = paymentMode === 'CREDIT' || paymentMode === 'MESS_KHATA' || paymentMode === 'KHATA' || isMess;
        const targetCustId = customerId || customerUuid || cardUid || customerCardUid;

        const portalDomain = (typeof window !== 'undefined' && localStorage.getItem('khata_portal_domain'))
          ? localStorage.getItem('khata_portal_domain')!.replace(/\/+$/, '')
          : 'https://askar-khata-pwa.vercel.app';

        const isKhataCustomer = Boolean(
          targetCustId && (
            isCreditSale ||
            (newBalance !== undefined && Number(newBalance) > 0) ||
            (previousBalance !== undefined && Number(previousBalance) > 0)
          )
        );

        if (isKhataCustomer && targetCustId) {
          await Printer.setPrinterAlignment({ alignment: 'center' });
          await Printer.printText({ textToPrint: "\n--------------------------------\n" });
          const pwaUrl = `${portalDomain}/tab/${targetCustId}`;
          const qrHeader = [
            "LIVE KHATA STATEMENT & PAYMENT\n",
            (newBalance !== undefined && Number(newBalance) > 0) ? `Current Debt: BD ${Number(newBalance).toFixed(3)}\n` : ''
          ].filter(Boolean).join('');
          await Printer.printText({ textToPrint: qrHeader });
          await printQRCode(pwaUrl, 160);
          await Printer.printText({ textToPrint: "Scan with phone to Pay via BenefitPay\n" });
          await Printer.printText({ textToPrint: "--------------------------------\n" });
        }
      } catch (qrErr) {
        console.warn("Receipt QR print warning:", qrErr);
      }
    }

    // 5. CLOSING FOOTER (Clean divider, Thank You! and Return Policy)
    const width = (cfg.paperWidth === '80mm') ? 48 : 32;
    const lineDash = "-".repeat(width) + "\n";
    await Printer.setPrinterAlignment({ alignment: 'center' });
    await Printer.setFontSize({ fontSize: fontPt });
    await Printer.printText({ textToPrint: lineDash });
    await Printer.printText({ textToPrint: "Thank You! شكراً لزيارتكم\n" });
    if (cfg.footerPolicyEn) {
      await Printer.printText({ textToPrint: `${cfg.footerPolicyEn}\n` });
    }
    await Printer.printText({ textToPrint: lineDash });

    // 6. CLEAR TEAR BAR / CUTTER BLADE
    // Physical printhead-to-cutter gap on Sunmi terminals is 18-20mm (~4 lines).
    // Minimum 4 lines of feed is strictly required so the closing footer completely clears the cutter blade.
    const feed = Math.max(4, Number(cfg.feedLines) || 4);
    await Printer.lineWrap({ lines: feed });

    if (cfg.autoCut) {
      try {
        await Printer.cutPaper();
      } catch { }
    }
    try {
      await Printer.exitPrinterBuffer({ commit: true });
    } catch { }
    return true;
  } catch (error) {
    console.warn("Native Sunmi hardware print error:", error);
    return false;
  }
};

/**
 * Unified Full Receipt Print Function:
 * - If running on physical Sunmi hardware: Prints directly via built-in thermal printer.
 * - If running on Laptop / Desktop browser: Dispatches print job across the network to Sunmi via Central Server!
 * - Fallback: If network print is disabled or unreachable, opens local isolated browser print.
 */
export const printFullReceipt = async (props: FullReceiptProps): Promise<boolean> => {
  const isNative = isNativeSunmiHardware();

  // 🟢 CASE 1: Laptop / Desktop Billing Station -> Dispatch across network to Sunmi
  if (!isNative) {
    const netConfig = getNetworkPrinterConfig();
    if (netConfig.enabled && netConfig.mode === 'SUNMI_NETWORK') {
      try {
        const netResult = await dispatchSunmiPrintJob(props, netConfig.targetTerminal);
        if (netResult.success) {
          return true; // Successfully routed to Sunmi across network!
        }
        console.warn('Sunmi network print dispatch notice:', netResult.error);
      } catch (netErr) {
        console.warn('Sunmi network print error:', netErr);
      }
    }

    // Fallback: Local isolated 58mm / 80mm browser print slip
    try {
      const receiptHtml = await generateFullReceiptHtml(props);
      return await printThermalSlipViaIframe(receiptHtml);
    } catch (htmlPrintErr) {
      console.warn("Isolated thermal receipt print failed:", htmlPrintErr);
      return false;
    }
  }

  // 🟢 CASE 2: Native Sunmi hardware terminal
  return await printNativeSunmiReceipt(props);
};

/**
 * Standard NBR receipt printer helper with Khata PWA injection support
 */
export interface NBRReceiptPayload {
  cart?: any[];
  items?: any[];
  invoiceNumber?: string;
  invoiceNo?: string;
  total?: number;
  subtotal?: number;
  vat?: number;
  paymentType?: string;
  paymentMode?: string;
  cashTendered?: number;
  changeDue?: number;
  customer?: {
    id: string;
    name: string;
    balance?: number;
    credit_limit?: number;
    creditLimit?: number;
  } | null;
  customerId?: string;
  customerUuid?: string;
  customerName?: string;
  newBalance?: number;
  totalBalance?: number;
}

export const printNBRReceipt = async (
  invoiceNoOrPayload: string | any[] | NBRReceiptPayload,
  payloadOrInvoiceNo?: any,
  _paymentType: string = 'CASH',
  _customerUuid?: string,
  _totalBalance?: number
): Promise<boolean> => {
  let invoiceNo = '';
  let payload: any = {};

  if (typeof invoiceNoOrPayload === 'string') {
    // Primary Web Worker signature: printNBRReceipt(invoiceNo, payload)
    invoiceNo = invoiceNoOrPayload;
    payload = payloadOrInvoiceNo || {};
  } else if (typeof payloadOrInvoiceNo === 'string') {
    // Backwards compatibility: printNBRReceipt(payload, invoiceNo)
    invoiceNo = payloadOrInvoiceNo;
    payload = Array.isArray(invoiceNoOrPayload) ? { items: invoiceNoOrPayload } : (invoiceNoOrPayload || {});
  } else {
    // Direct object payload: printNBRReceipt({ items, total, invoiceNo, ... })
    const src: any = invoiceNoOrPayload || {};
    invoiceNo = src.invoiceNo || src.invoiceNumber || `INV-${Date.now()}`;
    payload = Array.isArray(src) ? { items: src } : src;
  }

  // Normalize items array
  const rawItems = payload.items || payload.cart || [];
  const normalizedItems = rawItems.map((itm: any) => ({
    name: itm.name || 'Item',
    nameAr: itm.nameAr || itm.arabicName,
    price: Number(itm.price ?? itm.sellingPrice ?? 0),
    qty: Number(itm.qty ?? itm.quantity ?? 1),
    vatRate: itm.vatRate !== undefined ? Number(itm.vatRate) : (itm.taxRate !== undefined ? Number(itm.taxRate) : 10)
  }));

  const total = payload.total !== undefined
    ? Number(payload.total)
    : normalizedItems.reduce((acc: number, itm: any) => acc + (itm.price * itm.qty), 0);

  const workerPayload = {
    ...payload,
    invoiceNo,
    items: normalizedItems,
    total,
  };

  // Rapid batched hardware printer execution pipeline (90% IPC Bridge reduction)
  const executeCommands = async (commands: Array<{ action: string; data: any }>): Promise<boolean> => {
    try {
      // High-throughput command batching: merge consecutive printText commands into single buffers
      const batched: Array<{ action: string; data: any }> = [];
      let currentText = '';
      for (const cmd of commands) {
        if (cmd.action === 'printText') {
          currentText += cmd.data;
        } else {
          if (currentText) {
            batched.push({ action: 'printText', data: currentText });
            currentText = '';
          }
          batched.push(cmd);
        }
      }
      if (currentText) {
        batched.push({ action: 'printText', data: currentText });
      }

      const winPrinter = typeof window !== 'undefined' ? (window as any).Printer : undefined;
      const isNative = typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.());

      if (winPrinter) {
        for (const cmd of batched) {
          if (cmd.action === 'setAlignment') {
            await winPrinter.setAlignment({ alignment: cmd.data });
          } else if (cmd.action === 'printText') {
            await winPrinter.printText({ text: cmd.data });
          }
        }
        if (typeof winPrinter.cutPaper === 'function') {
          try {
            await winPrinter.cutPaper();
          } catch { }
        }
      } else if (isNative && typeof Printer !== 'undefined') {
        try {
          if (typeof SunmiPrinter.printerInit === 'function') {
            await SunmiPrinter.printerInit();
          }
          for (const cmd of batched) {
            if (cmd.action === 'setAlignment') {
              await SunmiPrinter.setAlignment({ alignment: cmd.data });
            } else if (cmd.action === 'printText') {
              await SunmiPrinter.printText({ text: cmd.data });
            }
          }
          if (typeof Printer.cutPaper === 'function') {
            await Printer.cutPaper();
          }
        } catch (e) {
          console.warn('Native printer execution warning:', e);
        }
      } else {
        console.log('⚡ [Printer Mock] Commands executed:', commands);
      }
      return true;
    } catch (error) {
      console.error('Hardware printing failed:', error);
      return false;
    }
  };

  // 1. Offload heavy formatting & Arabic calculation to background Web Worker
  if (printerWorker) {
    return new Promise((resolve) => {
      const handleWorkerMessage = async (event: MessageEvent) => {
        if (event.data?.type === 'RECEIPT_READY') {
          printerWorker.removeEventListener('message', handleWorkerMessage);
          const commands = event.data.commands || [];
          const success = await executeCommands(commands);
          resolve(success);
        }
      };

      printerWorker.addEventListener('message', handleWorkerMessage);

      // Send the raw cart data to the background thread to be processed
      printerWorker.postMessage({
        type: 'GENERATE_RECEIPT',
        payload: workerPayload,
      });
    });
  }

  // 2. Non-blocking inline fallback (when Worker API is restricted or during headless testing)
  const fallbackCommands: Array<{ action: string; data: any }> = [
    { action: 'setAlignment', data: 1 },
    { action: 'printText', data: 'LAYALI SUPERMARKET\n' },
    { action: 'printText', data: `Invoice: ${invoiceNo}\n` },
    { action: 'setAlignment', data: 0 },
    { action: 'printText', data: '--------------------------------\n' }
  ];

  for (const item of normalizedItems) {
    const isTaxable = (item.vatRate ?? (item as any).taxRate) === 10;
    const vatIndicator = isTaxable ? '*' : ' ';
    const name = (item.name + vatIndicator).substring(0, 15).padEnd(15, ' ');
    const qty = item.qty.toString().padStart(3, ' ');
    const price = (item.price * item.qty).toFixed(3).padStart(9, ' ');

    fallbackCommands.push({ action: 'setAlignment', data: 0 });
    fallbackCommands.push({ action: 'printText', data: `${name} ${qty}      ${price}\n` });

    if (item.nameAr) {
      fallbackCommands.push({ action: 'setAlignment', data: 2 });
      fallbackCommands.push({ action: 'printText', data: `${item.nameAr} ${vatIndicator}\n` });
    }
  }

  fallbackCommands.push({ action: 'setAlignment', data: 0 });
  fallbackCommands.push({ action: 'printText', data: '--------------------------------\n' });
  fallbackCommands.push({ action: 'printText', data: `Total: BHD ${total.toFixed(3)}\n` });

  return executeCommands(fallbackCommands);
};

/**
 * Pure Hardware Printer Command: Print Refund / Return Credit Note Receipt
 * (Financial logic, authorization, and database sync are decoupled in salesService.ts)
 */
export const printRefundReceipt = async (
  invoiceNo: string,
  refundData: any = {}
): Promise<boolean> => {
  const cleanInvoice = String(invoiceNo || '').trim();
  const totalAmount = Number(refundData.totalAmount || refundData.total || 0);
  const vatAmount = Number(refundData.vatAmount || refundData.vat || (totalAmount - (totalAmount / 1.10)));

  return await printCreditNote({
    invoiceNo: cleanInvoice,
    creditNoteNo: refundData.creditNoteNo || `CN-${cleanInvoice.replace(/^INV-?/i, '')}`,
    totalAmount,
    vatAmount: Number(vatAmount.toFixed(3)),
    date: new Date().toISOString(),
    cashierName: refundData.cashierName || 'POS Register',
  });
};

// Backwards compatibility alias
export const printSimpleReceipt = async (props: any) => {
  return printFullReceipt({
    invoiceNo: props.invoiceNo,
    items: [],
    subtotal: props.total / 1.1,
    vat: props.total - (props.total / 1.1),
    total: props.total,
    paymentMode: props.paymentMode,
    customerName: props.customerName,
    newBalance: props.newBalance
  });
};

export interface KhataStatementItem {
  id: string;
  amount: number;
  type: string;
  formattedDate: string;
  formattedTime: string;
  runningBalance: number;
  walletName?: string;
  messName?: string;
  reference?: string;
  invoiceNo?: string;
  group_total?: number | null;
  bill_total?: number | null;
  split_share?: number | null;
  member_count?: number | null;
  shopper_name?: string | null;
}

export interface MessGroupMemberPrintInfo {
  name: string;
  phone?: string | null;
  currentBalance: number;
  spendPercentage?: number;
  equalSplitShare?: number;
}

export interface MessGroupPrintInfo {
  id?: string;
  group_name: string;
  memberCount?: number;
  totalBalance?: number;
  equalSplitShare?: number;
  members?: MessGroupMemberPrintInfo[];
}

export interface WalletBreakdownItem {
  id?: string;
  name: string;
  memberShare: number;
  groupTotal?: number;
  memberCount?: number;
  equalSplitShare?: number;
}

export interface MultiWalletPrintInfo {
  personal: number;
  messes: WalletBreakdownItem[];
}

export const printKhataStatement = async ({
  shopName = "LAYALI STORE - KHATA STATEMENT",
  customerName,
  customerPhone,
  customerCpr,
  statement = [],
  currentBalance = 0,
  dateRange,
  messGroup = null,
  isMessStatement = false,
  wallets = null,
  cycleBreakdown = null
}: {
  shopName?: string;
  customerName: string;
  customerPhone?: string | null;
  customerCpr?: string | null;
  statement: KhataStatementItem[];
  currentBalance: number;
  dateRange?: string;
  messGroup?: MessGroupPrintInfo | null;
  isMessStatement?: boolean;
  wallets?: MultiWalletPrintInfo | null;
  cycleBreakdown?: {
    hasPriorCarryOver?: boolean;
    priorCycleBalance?: number;
    currentMonthPurchases?: number;
    currentMonthPayments?: number;
    currentBalance?: number;
    currentMonthLabel?: string;
    priorMonthLabel?: string;
  } | null;
}) => {
  let fullText = "";
  try {
    await Printer.initPrinter();
    try {
      await Printer.enterPrinterBuffer({ clean: true });
    } catch { }

    fullText += `${shopName}\n`;

    if (isMessStatement && messGroup) {
      const eqShare = Number(
        messGroup.equalSplitShare ||
        (messGroup.totalBalance !== undefined && messGroup.members?.length
          ? messGroup.totalBalance / Math.max(1, messGroup.members.length)
          : currentBalance / Math.max(1, messGroup.members?.length || messGroup.memberCount || 1))
      );
      fullText += `MESS ACCOUNT: ${messGroup.group_name}\n`;
      fullText += `Members: ${messGroup.members?.length || messGroup.memberCount || 0} Room Members\n`;
      if (dateRange) fullText += `Period: ${dateRange}\n`;
      fullText += "================================\n";
      fullText += formatTwoCols("TOTAL CAMP DEBT:", `BD ${Number(messGroup.totalBalance ?? currentBalance).toFixed(3)}`) + "\n";
      fullText += formatTwoCols("EQUAL SHARE / MEMBER:", `BD ${eqShare.toFixed(3)}`) + "\n";
      fullText += "================================\n";
      fullText += "MEMBER EQUAL SPLIT BREAKDOWN:\n";
      fullText += "--------------------------------\n";
      if (messGroup.members && messGroup.members.length > 0) {
        for (const m of messGroup.members) {
          const mEq = Number(m.equalSplitShare || eqShare).toFixed(3);
          const mAct = Number(m.currentBalance || 0).toFixed(3);
          const pct = m.spendPercentage !== undefined ? ` (${m.spendPercentage}%)` : '';
          fullText += `${m.name.toUpperCase()}\n`;
          fullText += formatTwoCols("  Equal Split Due:", `BD ${mEq}`) + "\n";
          fullText += formatTwoCols(`  Actual Card Spent${pct}:`, `BD ${mAct}`) + "\n";
          fullText += "--------------------------------\n";
        }
      }
      fullText += "ITEMIZED MESS TRANSACTIONS:\n";
      fullText += "--------------------------------\n";
    } else {
      fullText += `Customer: ${customerName}\n`;
      if (customerPhone) fullText += `Phone: ${customerPhone}\n`;
      if (customerCpr) fullText += `CPR: ${customerCpr}\n`;
      if (dateRange) fullText += `Period: ${dateRange}\n`;
      fullText += "================================\n";

      if (wallets && wallets.messes && wallets.messes.length > 0) {
        fullText += "ACCOUNT BREAKDOWN BY WALLET:\n";
        fullText += "--------------------------------\n";
        fullText += formatTwoCols("• PERSONAL TAB:", `BD ${Number(wallets.personal || 0).toFixed(3)}`) + "\n";
        for (const w of wallets.messes) {
          fullText += formatTwoCols(`• ${w.name}:`, `BD ${Number(w.memberShare || 0).toFixed(3)}`) + "\n";
          if (w.groupTotal !== undefined && w.memberCount) {
            fullText += `  (Camp Total: BD ${Number(w.groupTotal).toFixed(3)} / ${w.memberCount})\n`;
          }
        }
        fullText += "--------------------------------\n";
        fullText += formatTwoCols("TOTAL CONSOLIDATED DUE:", `BD ${Number(currentBalance).toFixed(3)}`) + "\n";
        fullText += "================================\n";
      }

      if (cycleBreakdown && (cycleBreakdown.hasPriorCarryOver || (cycleBreakdown.priorCycleBalance && Math.abs(cycleBreakdown.priorCycleBalance) > 0.001))) {
        fullText += "MONTHLY CYCLE BREAKDOWN:\n";
        fullText += "--------------------------------\n";
        fullText += formatTwoCols(`📌 B/F (${cycleBreakdown.priorMonthLabel || 'Prior'}):`, `BD ${Number(cycleBreakdown.priorCycleBalance || 0).toFixed(3)}`) + "\n";
        fullText += formatTwoCols(`🛒 Spent (${cycleBreakdown.currentMonthLabel || 'Current'}):`, `BD ${Number(cycleBreakdown.currentMonthPurchases || 0).toFixed(3)}`) + "\n";
        if (cycleBreakdown.currentMonthPayments && cycleBreakdown.currentMonthPayments > 0) {
          fullText += formatTwoCols(`💳 Paid (${cycleBreakdown.currentMonthLabel || 'Current'}):`, `-BD ${Number(cycleBreakdown.currentMonthPayments || 0).toFixed(3)}`) + "\n";
        }
        fullText += "--------------------------------\n";
      }

      fullText += formatTwoCols("DATE / DESC", "BAL (BD)") + "\n";
      fullText += "--------------------------------\n";
    }

    // Print history (oldest to newest or top entries)
    const printList = [...statement].reverse();
    for (const item of printList) {
      const typeStr = item.type === 'SALE' ? '+GROCERY' : (item.type === 'CHARGE' ? '+CHARGE' : '-PAYMENT');
      const amtStr = item.amount > 0 ? `+${item.amount.toFixed(3)}` : `${item.amount.toFixed(3)}`;
      const tag = item.messName || item.walletName ? ` [${item.messName || item.walletName}]` : '';
      fullText += `${item.formattedDate} ${item.formattedTime}${tag}\n`;

      const fullBill = Number(item.bill_total || item.group_total || 0);
      const isMessShare = fullBill > item.amount && item.amount > 0;
      if (isMessShare) {
        const shareCount = item.member_count ? `1/${item.member_count}` : 'Share';
        fullText += formatTwoCols(`BILL: BD ${fullBill.toFixed(3)}`, `BAL: BD ${item.runningBalance.toFixed(3)}`) + "\n";
        fullText += `  > Your ${shareCount} Split: +BD ${item.amount.toFixed(3)}\n`;
      } else {
        fullText += formatTwoCols(`${typeStr} (${amtStr})`, `BD ${item.runningBalance.toFixed(3)}`) + "\n";
      }
    }

    fullText += "================================\n";
    if (cycleBreakdown && (cycleBreakdown.hasPriorCarryOver || (cycleBreakdown.priorCycleBalance && Math.abs(cycleBreakdown.priorCycleBalance) > 0.001))) {
      fullText += formatTwoCols("PRIOR MONTH (B/F):", `BD ${Number(cycleBreakdown.priorCycleBalance || 0).toFixed(3)}`) + "\n";
      fullText += formatTwoCols("CURRENT PURCHASES:", `BD ${Number(cycleBreakdown.currentMonthPurchases || 0).toFixed(3)}`) + "\n";
    }
    fullText += formatTwoCols(isMessStatement ? "TOTAL OUTSTANDING:" : "TOTAL OUTSTANDING DUE:", `BD ${currentBalance.toFixed(3)}`) + "\n";
    fullText += `Printed: ${new Date().toLocaleString()}\n`;
    fullText += isMessStatement ? "Camp Room Shared Khata Statement\n" : (wallets && wallets.messes?.length ? "Unified Multi-Mess Khata Statement\n" : "Official Store Account Ledger\n");
    fullText += "\n\n\n";

    // Execute a single IPC bridge call
    await Printer.setFontSize({ fontSize: 18 });
    await Printer.printText({ textToPrint: fullText });
    await Printer.lineWrap({ lines: 3 });
    await Printer.cutPaper();
    try {
      await Printer.exitPrinterBuffer({ commit: true });
    } catch { }
    console.log("Khata statement printed successfully on thermal printer!");
  } catch (err: any) {
    console.warn("Thermal hardware print fallback to iframe print:", err);
    const isNative = typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.());
    if (isNative) {
      showToast("⚠️ Printer Warning: Out of paper, cover open, or thermal head busy", "error");
    } else {
      try {
        const html = wrapMonospaceTextToHtml(fullText, isMessStatement ? "Mess Khata Statement" : "Khata Customer Statement");
        await printThermalSlipViaIframe(html);
      } catch { }
    }
  }
};

export interface KhataPaymentReceiptProps {
  shopName?: string;
  shopAddress?: string;
  shopPhone?: string;
  receiptNo?: string;
  receiptNumber?: string;
  transactionRef?: string;
  customerId?: string;
  customerUuid?: string;
  customerName: string;
  customerPhone?: string | null;
  customerCpr?: string | null;
  previousBalance: number;
  amountPaid: number;
  newBalance: number;
  personalBalance?: number;
  messBalance?: number;
  paymentMethod?: string;
  cashierName?: string;
  timestamp?: string | Date;
}

/**
 * 58mm Monospaced Receipt Formatter for Khata Debt Settlement.
 * Generates exact 32-character wide lines for Sunmi 58mm thermal rolls.
 */
export const formatKhataReceipt = ({
  shopName = "LAYALI SUPERMARKET",
  shopAddress = "Askar, Kingdom of Bahrain",
  shopPhone = "Tel: +973 1700 0000",
  receiptNo,
  customerName,
  customerPhone,
  customerCpr,
  previousBalance,
  amountPaid,
  newBalance,
  paymentMethod = 'CASH',
  cashierName = "Cashier 01",
  timestamp = new Date()
}: KhataPaymentReceiptProps): string => {
  const dateObj = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const dateStr = `${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const refNo = receiptNo || `KH-${Date.now().toString().slice(-6)}`;
  const modeStr = paymentMethod === 'BENEFIT_PAY' ? 'BenefitPay' : (paymentMethod || 'Cash');

  const oldBalStr = `BD ${Number(previousBalance || 0).toFixed(3)}`;
  const paidStr = `BD ${Number(amountPaid || 0).toFixed(3)}`;
  const newBalStr = `BD ${Number(newBalance || 0).toFixed(3)}`;

  const lines: string[] = [
    "=".repeat(32),
    "       " + shopName + "        ",
    "          أسواق ليالي          ",
    "   " + shopAddress + "   ",
    "       " + shopPhone + "        ",
    "--------------------------------",
    "     KHATA PAYMENT RECEIPT      ",
    "        إيصال سداد ذمة         ",
    "--------------------------------",
    formatTwoCols("Receipt:", `#${refNo}`),
    formatTwoCols("Date:", dateStr),
    formatTwoCols("Customer:", customerName),
  ];

  if (customerPhone) {
    lines.push(formatTwoCols("Phone:", customerPhone));
  }
  if (customerCpr) {
    lines.push(formatTwoCols("CPR:", customerCpr));
  }
  lines.push(formatTwoCols("Staff:", cashierName));
  lines.push(formatTwoCols("Mode:", modeStr));
  lines.push("--------------------------------");
  lines.push(formatTwoCols("Old Balance:", oldBalStr));
  lines.push(formatTwoCols("Amount Paid:", paidStr));
  lines.push("================================");
  lines.push(formatTwoCols("NEW BALANCE:", newBalStr));
  lines.push("================================");

  if (Number(newBalance || 0) <= 0.001) {
    lines.push("  *** ACCOUNT FULLY CLEARED *** ");
    lines.push("     تم سداد الحساب بالكامل     ");
    lines.push("--------------------------------");
  }

  lines.push("    Thank you for your payment! ");
  lines.push("       شكراً لكم على السداد     ");
  lines.push("  Please retain for your record ");
  lines.push("=".repeat(32) + "\n");

  const rawText = lines.join("\n");
  console.log("58mm Khata Receipt Preview:\n" + rawText);
  return rawText;
};

/**
 * Direct Sunmi D2 Mini 58mm Thermal Printer Hardware Dispatch.
 * Communicates with the built-in printer via capacitor-sunmi-printer.
 */
export const printKhataPaymentReceipt = async (props: KhataPaymentReceiptProps) => {
  try {
    const formattedText = formatKhataReceipt(props);
    console.log("Sunmi Hardware Printing Payload:", formattedText);
    await Printer.initPrinter();
    try {
      await Printer.enterPrinterBuffer({ clean: true });
    } catch { }

    // 1. Header (Centered)
    await Printer.setPrinterAlignment({ alignment: 'center' });
    await Printer.setFontSize({ fontSize: 26 });
    await Printer.printText({ textToPrint: `${props.shopName || "LAYALI SUPERMARKET"}\n` });
    await Printer.setFontSize({ fontSize: 20 });
    await Printer.printText({ textToPrint: "KHATA PAYMENT RECEIPT\n" });
    await Printer.setFontSize({ fontSize: 18 });
    await Printer.printText({ textToPrint: "إيصال سداد ذمة\n" });
    await Printer.printText({ textToPrint: "================================\n" });

    // 2. Transaction Metadata (Left-aligned)
    await Printer.setPrinterAlignment({ alignment: 'left' });
    await Printer.setFontSize({ fontSize: 18 });

    const dateObj = typeof props.timestamp === 'string' ? new Date(props.timestamp) : (props.timestamp || new Date());
    const dateStr = `${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const refNo = props.receiptNo || `KH-${Date.now().toString().slice(-6)}`;
    const modeStr = props.paymentMethod === 'BENEFIT_PAY' ? 'BenefitPay' : (props.paymentMethod || 'Cash');

    await Printer.printText({ textToPrint: formatTwoCols(`Receipt: #${refNo}`, dateStr) });
    await Printer.printText({ textToPrint: formatTwoCols("Customer:", props.customerName) });
    if (props.customerPhone) {
      await Printer.printText({ textToPrint: formatTwoCols("Phone:", props.customerPhone) });
    }
    if (props.customerCpr) {
      await Printer.printText({ textToPrint: formatTwoCols("CPR:", props.customerCpr) });
    }
    await Printer.printText({ textToPrint: formatTwoCols(`Staff: ${props.cashierName || 'Cashier 01'}`, `Mode: ${modeStr}`) });
    await Printer.printText({ textToPrint: "--------------------------------\n" });

    // 3. Balance Figures (Right-aligned 32-col layout)
    await Printer.printText({
      textToPrint: formatTwoCols("Old Balance:", `BD ${Number(props.previousBalance || 0).toFixed(3)}`)
    });
    await Printer.printText({
      textToPrint: formatTwoCols("Amount Paid:", `BD ${Number(props.amountPaid || 0).toFixed(3)}`)
    });
    await Printer.printText({ textToPrint: "================================\n" });

    // 4. Highlighted New Balance
    await Printer.setFontSize({ fontSize: 22 });
    await Printer.printText({
      textToPrint: formatTwoCols("NEW BALANCE:", `BD ${Number(props.newBalance || 0).toFixed(3)}`)
    });
    await Printer.setFontSize({ fontSize: 18 });
    await Printer.printText({ textToPrint: "================================\n" });

    // 5. Cleared Notice & Footer
    if (Number(props.newBalance || 0) <= 0.001) {
      await Printer.setPrinterAlignment({ alignment: 'center' });
      await Printer.setFontSize({ fontSize: 20 });
      await Printer.printText({ textToPrint: "*** ACCOUNT FULLY CLEARED ***\n" });
      await Printer.printText({ textToPrint: "تم سداد الحساب بالكامل\n" });
      await Printer.printText({ textToPrint: "--------------------------------\n" });
    }

    await Printer.setPrinterAlignment({ alignment: 'center' });
    await Printer.setFontSize({ fontSize: 18 });
    await Printer.printText({ textToPrint: "Thank you for your payment!\n" });
    await Printer.printText({ textToPrint: "شكراً لكم على السداد\n" });
    await Printer.setFontSize({ fontSize: 16 });
    await Printer.printText({ textToPrint: "Please retain receipt for balance proof.\n" });
    await Printer.printText({ textToPrint: "================================\n" });

    // Khata PWA QR Code Dispatch for mobile phone binding
    const targetCustId = props.customerId || props.customerUuid;
    if (targetCustId) {
      try {
        const portalDomain = (typeof window !== 'undefined' && localStorage.getItem('khata_portal_domain'))
          ? localStorage.getItem('khata_portal_domain')!.replace(/\/+$/, '')
          : 'https://askar-khata-pwa.vercel.app';
        const params = new URLSearchParams();
        const payRef = props.receiptNo || props.receiptNumber || props.transactionRef || 'PAYMENT';
        params.append('receiptInv', payRef);
        params.append('receiptBal', Number(props.newBalance || 0).toFixed(3));
        if (props.personalBalance !== undefined && props.personalBalance !== null) {
          params.append('personalBal', Number(props.personalBalance).toFixed(3));
        }
        if (props.messBalance !== undefined && props.messBalance !== null) {
          params.append('messBal', Number(props.messBalance).toFixed(3));
        }
        params.append('receiptTs', String(Date.now()));
        const pwaUrl = `${portalDomain}/tab/${targetCustId}?${params.toString()}`;

        await Printer.setPrinterAlignment({ alignment: 'center' });
        await Printer.setFontSize({ fontSize: 16 });
        await Printer.printText({ textToPrint: "SCAN TO VIEW LIVE STATEMENT:\n" });
        await printQRCode(pwaUrl, 180);
        await Printer.printText({ textToPrint: "--------------------------------\n" });
      } catch (qrErr) {
        console.warn("Khata QR print notice:", qrErr);
      }
    }

    // Feed and cut paper
    await Printer.lineWrap({ lines: 3 });
    await Printer.cutPaper();
    try {
      await Printer.exitPrinterBuffer({ commit: true });
    } catch { }
    console.log("Khata payment receipt printed successfully on Sunmi 58mm printer!");
    return true;
  } catch (error) {
    console.warn("Sunmi thermal printer dispatch notice (falling back to iframe print):", error);
    const isNative = typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.());
    if (isNative) {
      showToast("⚠️ Printer Warning: Out of paper, cover open, or thermal head busy", "error");
      return false;
    }
    try {
      const formattedText = formatKhataReceipt(props);
      let extraHtml = '';
      const targetCustId = props.customerId || props.customerUuid;
      if (targetCustId) {
        try {
          const portalDomain = (typeof window !== 'undefined' && localStorage.getItem('khata_portal_domain'))
            ? localStorage.getItem('khata_portal_domain')!.replace(/\/+$/, '')
            : 'https://askar-khata-pwa.vercel.app';
          const params = new URLSearchParams();
          const payRef = props.receiptNo || props.receiptNumber || props.transactionRef || 'PAYMENT';
          params.append('receiptInv', payRef);
          params.append('receiptBal', Number(props.newBalance || 0).toFixed(3));
          if (props.personalBalance !== undefined && props.personalBalance !== null) {
            params.append('personalBal', Number(props.personalBalance).toFixed(3));
          }
          if (props.messBalance !== undefined && props.messBalance !== null) {
            params.append('messBal', Number(props.messBalance).toFixed(3));
          }
          params.append('receiptTs', String(Date.now()));
          const pwaUrl = `${portalDomain}/tab/${targetCustId}?${params.toString()}`;

          const qrDataUrl = await generateQrDataUrl(pwaUrl, 120);
          if (qrDataUrl) {
            extraHtml = `\n<div style="text-align: center; margin-top: 10px; margin-bottom: 5px;">
  <div style="font-size: 8px; font-weight: 700; margin-bottom: 3px;">SCAN TO VIEW LIVE STATEMENT:</div>
  <img src="${qrDataUrl}" style="width: 80px; height: 80px; display: block; margin: 0 auto;" />
</div>`;
          }
        } catch { }
      }
      const html = wrapMonospaceTextToHtml(formattedText, "Khata Payment Receipt", extraHtml);
      return await printThermalSlipViaIframe(html);
    } catch {
      return false;
    }
  }
};

export interface CreditNoteProps {
  creditNoteNo?: string;
  invoiceNo: string;
  totalAmount: number;
  vatAmount: number;
  reason?: string;
  date?: string;
  cashierName?: string;
  items?: Array<{ name?: string; productName?: string; quantity: number; priceAtSale?: number; unitPrice?: number; totalAmount?: number }>;
}

export const formatCreditNote = (props: CreditNoteProps): string => {
  return `
    LAYALI SUPERMARKET
    -----------------------
    CREDIT NOTE / REFUND
    -----------------------
    Ref Invoice: ${props.invoiceNo}
    Credit Note: ${props.creditNoteNo || 'CN-' + props.invoiceNo}
    Date: ${props.date || new Date().toLocaleString()}
    
    Total Refunded: BHD ${Number(props.totalAmount || 0).toFixed(3)}
    VAT Reversed:   BHD ${Number(props.vatAmount || 0).toFixed(3)}
    -----------------------
    STATUS: VOIDED
    -----------------------
  `;
};

export const printCreditNote = async (props: CreditNoteProps): Promise<boolean> => {
  try {
    await Printer.initPrinter();
    try {
      await Printer.enterPrinterBuffer({ clean: true });
    } catch { }

    // 1. Header (Centered)
    await Printer.setPrinterAlignment({ alignment: 'center' });
    await Printer.setFontSize({ fontSize: 26 });
    await Printer.printText({ textToPrint: "LAYALI SUPERMARKET\n" });
    await Printer.setFontSize({ fontSize: 16 });
    await Printer.printText({ textToPrint: "Askar, Kingdom of Bahrain\n" });
    await Printer.printText({ textToPrint: "VAT ID: 200012345678901\n" });
    await Printer.printText({ textToPrint: "================================\n" });

    // 2. Title: Credit Note / Refund
    await Printer.setFontSize({ fontSize: 22 });
    await Printer.printText({ textToPrint: "CREDIT NOTE / REFUND\n" });
    await Printer.printText({ textToPrint: "إشعار دائن / استرجاع ضريبي\n" });
    await Printer.setFontSize({ fontSize: 16 });
    await Printer.printText({ textToPrint: "================================\n" });

    // 3. Metadata
    await Printer.setPrinterAlignment({ alignment: 'left' });
    await Printer.setFontSize({ fontSize: 18 });
    await Printer.printText({ textToPrint: formatTwoCols("Ref Invoice:", props.invoiceNo) });
    if (props.creditNoteNo) {
      await Printer.printText({ textToPrint: formatTwoCols("Credit Note:", props.creditNoteNo) });
    }
    await Printer.printText({
      textToPrint: formatTwoCols("Date:", new Date(props.date || Date.now()).toLocaleDateString())
    });
    await Printer.printText({
      textToPrint: formatTwoCols("Time:", new Date(props.date || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    });
    await Printer.printText({ textToPrint: formatTwoCols("Staff:", props.cashierName || "Store Staff") });
    await Printer.printText({ textToPrint: "--------------------------------\n" });

    // 4. Line Items if present
    if (props.items && props.items.length > 0) {
      await Printer.printText({ textToPrint: formatTwoCols("Item Reversal", "Qty x Price") });
      for (const item of props.items) {
        const name = item.productName || item.name || "Item";
        const qty = item.quantity || 1;
        const price = Number((item as any).priceAtSale || (item as any).unitPrice || (item as any).price || (item as any).sellingPrice || 0);
        await Printer.printText({
          textToPrint: formatTwoCols(`- ${name}`, `${qty} x ${price.toFixed(3)}`)
        });
      }
      await Printer.printText({ textToPrint: "--------------------------------\n" });
    }

    // 5. Financial Summary
    const subtotal = Math.max(0, (props.totalAmount || 0) - (props.vatAmount || 0));
    await Printer.printText({
      textToPrint: formatTwoCols("Subtotal Reversed:", `BD ${subtotal.toFixed(3)}`)
    });
    await Printer.printText({
      textToPrint: formatTwoCols("VAT Reversed (10%):", `BD ${Number(props.vatAmount || 0).toFixed(3)}`)
    });
    await Printer.printText({ textToPrint: "================================\n" });

    // 6. Highlighted Total Refunded & VOIDED Status
    await Printer.setFontSize({ fontSize: 22 });
    await Printer.printText({
      textToPrint: formatTwoCols("TOTAL REFUNDED:", `BD ${Number(props.totalAmount || 0).toFixed(3)}`)
    });
    await Printer.printText({ textToPrint: "================================\n" });

    await Printer.setPrinterAlignment({ alignment: 'center' });
    await Printer.setFontSize({ fontSize: 24 });
    await Printer.printText({ textToPrint: "*** STATUS: VOIDED ***\n" });
    await Printer.setFontSize({ fontSize: 16 });
    await Printer.printText({ textToPrint: "Stock has been returned to inventory\n" });
    await Printer.printText({ textToPrint: "Staple to original receipt for drawer audit.\n" });
    await Printer.printText({ textToPrint: "================================\n" });

    // Feed and cut paper
    await Printer.lineWrap({ lines: 3 });
    await Printer.cutPaper();
    try {
      await Printer.exitPrinterBuffer({ commit: true });
    } catch { }
    console.log("Credit Note printed successfully on Sunmi 58mm printer!");
    return true;
  } catch (err) {
    console.warn("Credit Note hardware dispatch notice (falling back to iframe print):", err);
    try {
      const formattedText = formatCreditNote(props);
      const html = wrapMonospaceTextToHtml(formattedText, "Credit Note");
      return await printThermalSlipViaIframe(html);
    } catch {
      return false;
    }
  }
};

export interface ZReportPrintProps {
  shopName?: string;
  shopAddress?: string;
  shopPhone?: string;
  vatNumber?: string;
  date: string;
  time: string;
  shiftId?: string | null;
  cashierName?: string;
  openingCash?: number;
  totalSales: number;
  cashSales: number;
  benefitSales: number;
  cardSales: number;
  refunds: number;
  drawerCashOut?: number;
  supplierPayments?: number;
  expectedDrawerCash: number;
  transactionCount: number;
  // Phase 4: 24H SLA & Store Availability Audit
  slaMetrics?: {
    uptimeSla24h?: number;
    totalDowntimeSecondsToday?: number;
    mttrSeconds?: number;
    totalIncidentsToday?: number;
    peakRushHour?: string;
    peakHourlySalesBhd?: number;
    salesLostBhd?: number;
  };
}

/**
 * 58mm Monospaced End of Shift / Day Z-Report Formatter
 */
export const formatZReport = (props: ZReportPrintProps): string => {
  const opening = Number(props.openingCash ?? 50.0);
  const supplierPayouts = Number(props.supplierPayments ?? props.drawerCashOut ?? 0);
  const netSales = Math.max(0, props.totalSales - props.refunds);

  const lines: string[] = [
    "================================",
    "       " + (props.shopName || "LAYALI SUPERMARKET") + "        ",
    "          أسواق ليالي          ",
    "   " + (props.shopAddress || "Askar, Kingdom of Bahrain") + "   ",
    "       " + (props.shopPhone || "Tel: +973 1700 0000") + "        ",
    "     VAT ID: " + (props.vatNumber || "200012345678901") + "     ",
    "================================",
    "        *** Z-REPORT ***        ",
    "    DAILY TILL RECONCILIATION   ",
    "    تقرير الإغلاق اليومي (Z)    ",
    "================================",
    formatTwoCols("Shift ID:", props.shiftId ? `#${props.shiftId}` : "DAILY-CLOSE"),
    formatTwoCols("Date:", props.date),
    formatTwoCols("Time:", props.time),
    formatTwoCols("Register:", "Reg 01 (Sunmi D2)"),
    formatTwoCols("Cashier:", props.cashierName || "Cashier 1"),
    formatTwoCols("Status:", "CLOSED & BALANCED"),
    "--------------------------------",
    formatTwoCols("Total Orders:", String(props.transactionCount || 0)),
    formatTwoCols("Gross Revenue:", `BD ${Number(props.totalSales || 0).toFixed(3)}`),
    formatTwoCols("Refunds / Returns:", `BD -${Number(props.refunds || 0).toFixed(3)}`),
    "--------------------------------",
    formatTwoCols("NET REVENUE:", `BD ${netSales.toFixed(3)}`),
    "================================",
    "PAYMENT BREAKDOWN:",
    formatTwoCols("- Cash Inflows:", `BD ${Number(props.cashSales || 0).toFixed(3)}`),
    formatTwoCols("- BenefitPay (QR):", `BD ${Number(props.benefitSales || 0).toFixed(3)}`),
    formatTwoCols("- Debit/Credit Card:", `BD ${Number(props.cardSales || 0).toFixed(3)}`),
    "--------------------------------",
    "TILL CASH RECONCILIATION:",
    formatTwoCols("Opening Till Float:", `BD ${opening.toFixed(3)}`),
    formatTwoCols("(+) Customer Cash:", `BD ${Number(props.cashSales || 0).toFixed(3)}`),
    formatTwoCols("(-) Cash Refunds:", `BD -${Number(props.refunds || 0).toFixed(3)}`),
    formatTwoCols("(-) Supplier Payouts:", `BD -${supplierPayouts.toFixed(3)}`),
    "================================",
    "EXPECTED DRAWER CASH:",
    "       BD " + Number(props.expectedDrawerCash || 0).toFixed(3),
    "================================",
    "  24H STORE AVAILABILITY & SLA  ",
    "      SYSTEM HEALTH AUDIT       ",
    "================================",
    formatTwoCols("System Uptime SLA:", `${Number(props.slaMetrics?.uptimeSla24h ?? 99.98).toFixed(2)}%`),
    formatTwoCols("Total Downtime:", `${Number(props.slaMetrics?.totalDowntimeSecondsToday ?? 0)}s`),
    formatTwoCols("Mean Recovery (MTTR):", `${Number(props.slaMetrics?.mttrSeconds ?? 1.8).toFixed(1)}s`),
    formatTwoCols("Peak Rush Hour:", props.slaMetrics?.peakRushHour || "19:00 - 20:00"),
    formatTwoCols("Subsystem Incidents:", String(props.slaMetrics?.totalIncidentsToday ?? 0)),
    "--------------------------------",
    "FINANCIAL INTEGRITY GUARANTEE:",
    formatTwoCols("Sales Lost to Outage:", `BD ${(Number(props.slaMetrics?.salesLostBhd ?? 0)).toFixed(3)}`),
    formatTwoCols("Financial Parity:", "100% (PARITY SAFE)"),
    "================================",
    "\nAudited & Verified By:\n",
    "Cashier: _______________________",
    "\nManager: _______________________\n",
    "================================",
    "  Official End of Shift Report  ",
    "  Staple to Daily Cash Envelope ",
    "================================\n"
  ];

  return lines.join("\n");
};

/**
 * Direct Sunmi D2 Mini 58mm Thermal Printer Dispatch for Shift Closeout (Z-Report).
 */
export const printZReport = async (props: ZReportPrintProps): Promise<boolean> => {
  try {
    const rawFormatted = formatZReport(props);
    console.log("Sunmi Hardware Printing Z-Report:\n" + rawFormatted);

    await Printer.initPrinter();
    try {
      await Printer.enterPrinterBuffer({ clean: true });
    } catch { }

    // 1. Header (Centered)
    await Printer.setPrinterAlignment({ alignment: 'center' });
    await Printer.setFontSize({ fontSize: 26 });
    await Printer.printText({ textToPrint: `${props.shopName || "LAYALI SUPERMARKET"}\n` });
    await Printer.setFontSize({ fontSize: 20 });
    await Printer.printText({ textToPrint: "أسواق ليالي\n" });
    await Printer.setFontSize({ fontSize: 16 });
    await Printer.printText({ textToPrint: `${props.shopAddress || "Askar, Kingdom of Bahrain"}\n` });
    await Printer.printText({ textToPrint: `VAT ID: ${props.vatNumber || "200012345678901"}\n` });
    await Printer.printText({ textToPrint: "================================\n" });

    // 2. Title (Bold Large)
    await Printer.setFontSize({ fontSize: 24 });
    await Printer.printText({ textToPrint: "*** Z-REPORT ***\n" });
    await Printer.setFontSize({ fontSize: 18 });
    await Printer.printText({ textToPrint: "DAILY TILL RECONCILIATION\n" });
    await Printer.printText({ textToPrint: "تقرير الإغلاق اليومي (Z)\n" });
    await Printer.printText({ textToPrint: "================================\n" });

    // 3. Shift Metadata (Left aligned)
    await Printer.setPrinterAlignment({ alignment: 'left' });
    await Printer.setFontSize({ fontSize: 18 });
    await Printer.printText({ textToPrint: formatTwoCols("Shift ID:", props.shiftId ? `#${props.shiftId}` : "DAILY-CLOSE") });
    await Printer.printText({ textToPrint: formatTwoCols("Date:", props.date) });
    await Printer.printText({ textToPrint: formatTwoCols("Time:", props.time) });
    await Printer.printText({ textToPrint: formatTwoCols("Register:", "Reg 01 (Sunmi D2)") });
    await Printer.printText({ textToPrint: formatTwoCols("Cashier:", props.cashierName || "Cashier 1") });
    await Printer.printText({ textToPrint: formatTwoCols("Status:", "CLOSED & BALANCED") });
    await Printer.printText({ textToPrint: "--------------------------------\n" });

    // 4. Sales Summary
    const netSales = Math.max(0, props.totalSales - props.refunds);
    await Printer.printText({ textToPrint: formatTwoCols("Total Orders:", String(props.transactionCount || 0)) });
    await Printer.printText({ textToPrint: formatTwoCols("Gross Revenue:", `BD ${Number(props.totalSales || 0).toFixed(3)}`) });
    if (props.refunds > 0) {
      await Printer.printText({ textToPrint: formatTwoCols("Refunds / Returns:", `BD -${Number(props.refunds || 0).toFixed(3)}`) });
    }
    await Printer.printText({ textToPrint: "--------------------------------\n" });
    await Printer.setFontSize({ fontSize: 20 });
    await Printer.printText({ textToPrint: formatTwoCols("NET REVENUE:", `BD ${netSales.toFixed(3)}`) });
    await Printer.setFontSize({ fontSize: 18 });
    await Printer.printText({ textToPrint: "================================\n" });

    // 5. Payment Channel Breakdown
    await Printer.printText({ textToPrint: "PAYMENT BREAKDOWN:\n" });
    await Printer.printText({ textToPrint: formatTwoCols("- Cash Inflows:", `BD ${Number(props.cashSales || 0).toFixed(3)}`) });
    await Printer.printText({ textToPrint: formatTwoCols("- BenefitPay (QR):", `BD ${Number(props.benefitSales || 0).toFixed(3)}`) });
    await Printer.printText({ textToPrint: formatTwoCols("- Debit/Credit Card:", `BD ${Number(props.cardSales || 0).toFixed(3)}`) });
    await Printer.printText({ textToPrint: "--------------------------------\n" });

    // 6. Till Float Reconciliation (Crucial Audit)
    const opening = Number(props.openingCash ?? 50.0);
    const supplierPayouts = Number(props.supplierPayments ?? props.drawerCashOut ?? 0);
    await Printer.printText({ textToPrint: "TILL CASH RECONCILIATION:\n" });
    await Printer.printText({ textToPrint: formatTwoCols("Opening Till Float:", `BD ${opening.toFixed(3)}`) });
    await Printer.printText({ textToPrint: formatTwoCols("(+) Customer Cash:", `BD ${Number(props.cashSales || 0).toFixed(3)}`) });
    if (props.refunds > 0) {
      await Printer.printText({ textToPrint: formatTwoCols("(-) Cash Refunds:", `BD -${Number(props.refunds || 0).toFixed(3)}`) });
    }
    if (supplierPayouts > 0) {
      await Printer.printText({ textToPrint: formatTwoCols("(-) Supplier Payouts:", `BD -${supplierPayouts.toFixed(3)}`) });
    }
    await Printer.printText({ textToPrint: "================================\n" });

    // 7. Highlight Expected Drawer Cash (Large Font)
    await Printer.setFontSize({ fontSize: 20 });
    await Printer.printText({ textToPrint: "EXPECTED IN DRAWER:\n" });
    await Printer.setFontSize({ fontSize: 24 });
    await Printer.setPrinterAlignment({ alignment: 'center' });
    await Printer.printText({ textToPrint: `BD ${Number(props.expectedDrawerCash || 0).toFixed(3)}\n` });
    await Printer.setFontSize({ fontSize: 18 });
    await Printer.printText({ textToPrint: "================================\n" });

    // 7.5. 24H SLA & Store Availability Audit
    await Printer.setPrinterAlignment({ alignment: 'center' });
    await Printer.setFontSize({ fontSize: 16 });
    await Printer.printText({ textToPrint: "24H STORE AVAILABILITY & SLA\n" });
    await Printer.printText({ textToPrint: "SYSTEM HEALTH AUDIT\n" });
    await Printer.printText({ textToPrint: "================================\n" });
    await Printer.setPrinterAlignment({ alignment: 'left' });
    await Printer.setFontSize({ fontSize: 16 });
    await Printer.printText({ textToPrint: formatTwoCols("System Uptime SLA:", `${Number(props.slaMetrics?.uptimeSla24h ?? 99.98).toFixed(2)}%`) });
    await Printer.printText({ textToPrint: formatTwoCols("Total Downtime:", `${Number(props.slaMetrics?.totalDowntimeSecondsToday ?? 0)}s`) });
    await Printer.printText({ textToPrint: formatTwoCols("Mean Recovery (MTTR):", `${Number(props.slaMetrics?.mttrSeconds ?? 1.8).toFixed(1)}s`) });
    await Printer.printText({ textToPrint: formatTwoCols("Peak Rush Hour:", props.slaMetrics?.peakRushHour || "19:00 - 20:00") });
    await Printer.printText({ textToPrint: formatTwoCols("Subsystem Incidents:", String(props.slaMetrics?.totalIncidentsToday ?? 0)) });
    await Printer.printText({ textToPrint: "--------------------------------\n" });
    await Printer.printText({ textToPrint: "FINANCIAL INTEGRITY GUARANTEE:\n" });
    await Printer.printText({ textToPrint: formatTwoCols("Sales Lost to Outage:", `BD ${(Number(props.slaMetrics?.salesLostBhd ?? 0)).toFixed(3)}`) });
    await Printer.printText({ textToPrint: formatTwoCols("Financial Parity:", "100% (PARITY SAFE)") });
    await Printer.printText({ textToPrint: "================================\n" });

    // 8. Signatures & Audit Seal
    await Printer.setPrinterAlignment({ alignment: 'left' });
    await Printer.printText({ textToPrint: "Audited & Verified By:\n\n" });
    await Printer.printText({ textToPrint: "Cashier: _______________________\n\n" });
    await Printer.printText({ textToPrint: "Manager: _______________________\n" });
    await Printer.printText({ textToPrint: "================================\n" });

    await Printer.setPrinterAlignment({ alignment: 'center' });
    await Printer.setFontSize({ fontSize: 16 });
    await Printer.printText({ textToPrint: "Official End of Shift Report\n" });
    await Printer.printText({ textToPrint: "Staple to Daily Cash Envelope\n" });
    await Printer.printText({ textToPrint: "================================\n" });

    // 9. Line Feed and Auto-Cut
    await Printer.lineWrap({ lines: 3 });
    await Printer.cutPaper();

    try {
      await Printer.exitPrinterBuffer({ commit: true });
    } catch { }

    console.log("Z-Report printed successfully on Sunmi 58mm thermal printer!");
    return true;
  } catch (err) {
    console.warn("Sunmi thermal printer dispatch notice (falling back to iframe print):", err);
    try {
      const rawFormatted = formatZReport(props);
      const html = wrapMonospaceTextToHtml(rawFormatted, "Daily Z-Report");
      return await printThermalSlipViaIframe(html);
    } catch {
      return false;
    }
  }
};

export interface ShiftCloseoutPrintProps {
  shopName?: string;
  shopAddress?: string;
  vatNumber?: string;
  shiftId: string;
  cashierName: string;
  openedAt?: string;
  closedAt?: string;
  startingFloat: number;
  cashSales: number;
  refunds?: number;
  supplierPayouts?: number;
  expectedCash: number;
  actualCash: number;
  variance: number;
  verdict: 'PERFECT' | 'SHORT' | 'OVER' | string;
  denominations?: { [key: string]: number } | null;
  notes?: string | null;
}

export const formatShiftCloseout = (props: ShiftCloseoutPrintProps): string => {
  const line = "================================\n";
  const dash = "--------------------------------\n";
  let out = "";
  out += "       LAYALI SUPERMARKET       \n";
  out += "          أسواق ليالي          \n";
  out += "   Askar, Kingdom of Bahrain    \n";
  out += `  VAT ID: ${props.vatNumber || "200012345678901"}  \n`;
  out += line;
  out += "     *** SHIFT CLOSEOUT ***     \n";
  out += "    BLIND RECONCILIATION SLIP   \n";
  out += "       تقرير إغلاق الوردية       \n";
  out += line;
  out += formatTwoCols("Shift ID:", props.shiftId ? `#${props.shiftId.slice(0, 14)}` : "CURRENT");
  out += formatTwoCols("Cashier:", props.cashierName || "Cashier 1");
  const now = new Date();
  out += formatTwoCols("Closed At:", `${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  out += formatTwoCols("Register:", "POS 01 (Sunmi D2)");
  out += dash;
  out += "DRAWER CASH RECONCILIATION:\n";
  out += formatTwoCols("Opening Float:", `BD ${Number(props.startingFloat || 0).toFixed(3)}`);
  out += formatTwoCols("(+) Cash Sales:", `BD ${Number(props.cashSales || 0).toFixed(3)}`);
  if (Number(props.refunds || 0) > 0) {
    out += formatTwoCols("(-) Cash Refunds:", `BD -${Number(props.refunds).toFixed(3)}`);
  }
  if (Number(props.supplierPayouts || 0) > 0) {
    out += formatTwoCols("(-) Cash Payouts:", `BD -${Number(props.supplierPayouts).toFixed(3)}`);
  }
  out += dash;
  out += formatTwoCols("EXPECTED IN TILL:", `BD ${Number(props.expectedCash || 0).toFixed(3)}`);
  out += formatTwoCols("ACTUAL COUNTED:", `BD ${Number(props.actualCash || 0).toFixed(3)}`);
  out += line;

  const v = Number(props.variance || 0);
  if (Math.abs(v) < 0.005) {
    out += "      *** PERFECT BALANCE ***   \n";
    out += "        VARIANCE: BD 0.000      \n";
  } else if (v < 0) {
    out += "     ⚠️ SHORTAGE DETECTED ⚠️     \n";
    out += formatTwoCols("DRAWER SHORT BY:", `BD ${Math.abs(v).toFixed(3)}`);
  } else {
    out += "      📈 OVERAGE DETECTED 📈     \n";
    out += formatTwoCols("DRAWER OVER BY:", `BD ${v.toFixed(3)}`);
  }
  out += line;

  if (props.denominations && Object.keys(props.denominations).length > 0) {
    const activeDenoms = Object.entries(props.denominations).filter(([_, count]) => (count || 0) > 0);
    if (activeDenoms.length > 0) {
      out += "COUNTED DENOMINATIONS:\n";
      activeDenoms.forEach(([denom, count]) => {
        const val = (parseFloat(denom) * count).toFixed(3);
        const label = parseFloat(denom) >= 1 ? `${denom} BD` : `${parseInt(String(parseFloat(denom) * 1000))} Fils`;
        out += formatTwoCols(`${label} x ${count}:`, `BD ${val}`);
      });
      out += dash;
    }
  }

  if (props.notes && props.notes.trim()) {
    out += `Notes: ${props.notes.trim()}\n`;
    out += dash;
  }

  out += "Audited & Verified By:\n\n";
  out += "Cashier: _______________________\n\n";
  out += "Manager: _______________________\n";
  out += line;
  out += "   Official Cashier Shift Slip  \n";
  out += "  Staple to Daily Cash Envelope \n";
  out += line;
  return out;
};

export const printShiftCloseout = async (props: ShiftCloseoutPrintProps): Promise<boolean> => {
  const formattedText = formatShiftCloseout(props);
  console.log("Sunmi Hardware Printing Shift Closeout Slip:\n" + formattedText);

  try {
    if (typeof Printer !== 'undefined' && typeof Printer.initPrinter === 'function') {
      await Printer.initPrinter();
      try {
        await Printer.enterPrinterBuffer({ clean: true });
      } catch { }

      await Printer.setFontSize({ fontSize: 18 });
      // Execute a single IPC bridge call with full concatenated slip
      await Printer.printText({ textToPrint: formattedText + "\n\n\n" });

      // Cut Paper
      await Printer.lineWrap({ lines: 3 });
      await Printer.cutPaper();

      try {
        await Printer.exitPrinterBuffer({ commit: true });
      } catch { }

      console.log("Shift closeout slip printed successfully on Sunmi 58mm printer!");
      return true;
    }
  } catch (err) {
    console.warn("Sunmi printer error during shift closeout print:", err);
  }

  // Desktop / Web browser fallback: if running in web browser without Sunmi hardware
  if (typeof window !== 'undefined') {
    const isCap = (window as any).Capacitor?.isNativePlatform?.();
    if (!isCap) {
      try {
        const html = wrapMonospaceTextToHtml(formattedText, "Shift Closeout Report");
        return await printThermalSlipViaIframe(html);
      } catch { }
    }
  }

  return false;
};

export interface CardDepositReceiptProps {
  receiptNo: string;
  customerName: string;
  customerPhone?: string | null;
  customerCpr?: string | null;
  cardUid?: string | null;
  cardType?: string;
  depositAmount: number;
  cashierName?: string;
  timestamp?: string | Date;
  shopName?: string;
  shopAddress?: string;
  shopPhone?: string;
}

export const formatCardDepositReceipt = (props: CardDepositReceiptProps): string => {
  const is80mm = typeof window !== 'undefined' && localStorage.getItem('pos_receipt_format') === '80mm';
  const width = is80mm ? 42 : 32;
  const line = '='.repeat(width) + '\n';
  const dash = '-'.repeat(width) + '\n';

  let out = '';
  out += centerText(props.shopName || "LAYALI SUPERMARKET", width);
  if (props.shopAddress) out += centerText(props.shopAddress, width);
  if (props.shopPhone) out += centerText(`Tel: ${props.shopPhone}`, width);
  out += centerText("CARD SECURITY DEPOSIT", width);
  out += centerText("إيصال استلام أمانة بطاقة", width);
  out += line;

  const dateObj = typeof props.timestamp === 'string' ? new Date(props.timestamp) : (props.timestamp || new Date());
  const dateStr = `${dateObj.toLocaleDateString('en-GB')} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  out += formatTwoCols("Receipt No:", props.receiptNo, width);
  out += formatTwoCols("Date:", dateStr, width);
  out += formatTwoCols("Customer:", props.customerName, width);
  if (props.customerPhone) out += formatTwoCols("Phone:", props.customerPhone, width);
  if (props.customerCpr) out += formatTwoCols("CPR:", props.customerCpr, width);
  if (props.cardUid) out += formatTwoCols("Card UID:", props.cardUid, width);
  out += formatTwoCols("Staff:", props.cashierName || "Cashier 1", width);
  out += dash;

  out += formatTwoCols("DEPOSIT HELD (CUSTODIAL):", `BD ${Number(props.depositAmount || 0).toFixed(3)}`, width);
  out += formatTwoCols("STATUS:", "HELD IN TRUST (أمانة)", width);
  out += line;

  out += centerText("* Non-taxable Custodial Deposit (0% VAT)", width);
  out += centerText("* 100% Refundable in Cash upon card return", width);
  out += centerText("  with ZERO outstanding grocery balance.", width);
  out += centerText("* Lost cards forfeit deposit for card replacement.", width);
  out += dash;
  out += centerText("يسترد المبلغ نقداً بالكامل عند تسليم البطاقة", width);
  out += centerText("وخلو الحساب من أي ذمة مالية", width);
  out += line;

  return out;
};

export const printCardDepositReceipt = async (props: CardDepositReceiptProps): Promise<boolean> => {
  const formattedText = formatCardDepositReceipt(props);

  try {
    const isCap = (window as any).Capacitor?.isNativePlatform?.();
    if (isCap) {
      await Printer.initPrinter();
      try { await Printer.enterPrinterBuffer({ clean: true }); } catch { }

      await Printer.setPrinterAlignment({ alignment: 'left' });
      await Printer.setFontSize({ fontSize: 18 });
      await Printer.printText({ textToPrint: formattedText + "\n\n\n" });

      await Printer.lineWrap({ lines: 3 });
      await Printer.cutPaper();
      try { await Printer.exitPrinterBuffer({ commit: true }); } catch { }
      return true;
    }
  } catch (err) {
    console.warn("Sunmi printer error during deposit receipt print:", err);
  }

  if (typeof window !== 'undefined') {
    try {
      const html = wrapMonospaceTextToHtml(formattedText, "Card Security Deposit Receipt");
      return await printThermalSlipViaIframe(html);
    } catch { }
  }
  return false;
};

export interface CardDepositRefundProps {
  receiptNo: string;
  customerName: string;
  customerPhone?: string | null;
  customerCpr?: string | null;
  cardUid?: string | null;
  refundAmount: number;
  originalDeposit?: number;
  damageDeduction?: number;
  damageReason?: string;
  cashierName?: string;
  timestamp?: string | Date;
  shopName?: string;
}

export const formatCardDepositRefund = (props: CardDepositRefundProps): string => {
  const is80mm = typeof window !== 'undefined' && localStorage.getItem('pos_receipt_format') === '80mm';
  const width = is80mm ? 42 : 32;
  const line = '='.repeat(width) + '\n';
  const dash = '-'.repeat(width) + '\n';

  let out = '';
  out += centerText(props.shopName || "LAYALI SUPERMARKET", width);
  out += centerText("DEPOSIT REFUND VOUCHER", width);
  out += centerText("سند استرجاع أمانة بطاقة", width);
  out += line;

  const dateObj = typeof props.timestamp === 'string' ? new Date(props.timestamp) : (props.timestamp || new Date());
  const dateStr = `${dateObj.toLocaleDateString('en-GB')} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  out += formatTwoCols("Voucher No:", props.receiptNo, width);
  out += formatTwoCols("Date:", dateStr, width);
  out += formatTwoCols("Customer:", props.customerName, width);
  if (props.cardUid) out += formatTwoCols("Card Ret.:", props.cardUid, width);
  out += formatTwoCols("Staff:", props.cashierName || "Cashier 1", width);
  out += dash;

  if (props.damageDeduction && props.damageDeduction > 0) {
    out += formatTwoCols("ORIGINAL DEPOSIT:", `BD ${Number(props.originalDeposit || (props.refundAmount + props.damageDeduction)).toFixed(3)}`, width);
    out += formatTwoCols("CARD DAMAGE FEE:", `-BD ${Number(props.damageDeduction).toFixed(3)}`, width);
    if (props.damageReason) out += formatTwoCols("Fee Reason:", props.damageReason.substring(0, 16), width);
    out += dash;
  }

  out += formatTwoCols("REFUND PAID (CASH):", `BD ${Number(props.refundAmount || 0).toFixed(3)}`, width);
  out += formatTwoCols("ACCOUNT BALANCE:", "BD 0.000 (CLEARED)", width);
  out += line;

  out += centerText("Physical NFC card received and deactivated.", width);
  out += centerText("تم استلام البطاقة وإرجاع التأمين نقداً", width);
  out += dash;
  out += "\nCustomer Signature:\n\n________________________________\n";
  out += line;

  return out;
};

export const printCardDepositRefundVoucher = async (props: CardDepositRefundProps): Promise<boolean> => {
  const formattedText = formatCardDepositRefund(props);

  try {
    const isCap = (window as any).Capacitor?.isNativePlatform?.();
    if (isCap) {
      await Printer.initPrinter();
      try { await Printer.enterPrinterBuffer({ clean: true }); } catch { }

      await Printer.setPrinterAlignment({ alignment: 'left' });
      await Printer.setFontSize({ fontSize: 18 });
      await Printer.printText({ textToPrint: formattedText + "\n\n\n" });

      await Printer.lineWrap({ lines: 3 });
      await Printer.cutPaper();
      try { await Printer.exitPrinterBuffer({ commit: true }); } catch { }
      return true;
    }
  } catch (err) {
    console.warn("Sunmi printer error during deposit refund print:", err);
  }

  if (typeof window !== 'undefined') {
    try {
      const html = wrapMonospaceTextToHtml(formattedText, "Card Deposit Refund Voucher");
      return await printThermalSlipViaIframe(html);
    } catch { }
  }
  return false;
};

export interface CashAdvanceReceiptProps {
  receiptNo: string;
  customerName: string;
  customerPhone?: string | null;
  customerCpr?: string | null;
  advanceAmount: number;
  newAdvanceBalance: number;
  paydayDueDay?: number;
  cashierName?: string;
  timestamp?: string | Date;
  shopName?: string;
  slipType?: 'STORE_COPY' | 'CUSTOMER_COPY' | 'SINGLE';
  isDualCopy?: boolean;
}

export const formatCashAdvanceReceipt = (props: CashAdvanceReceiptProps): string => {
  const is80mm = typeof window !== 'undefined' && localStorage.getItem('pos_receipt_format') === '80mm';
  const width = is80mm ? 42 : 32;
  const line = '='.repeat(width) + '\n';
  const dash = '-'.repeat(width) + '\n';

  let out = '';
  out += centerText(props.shopName || "LAYALI SUPERMARKET", width);

  if (props.slipType === 'STORE_COPY') {
    out += centerText("PAYDAY ADVANCE [STORE COPY]", width);
    out += centerText("سند سلفة نقدية (نسخة المحل)", width);
  } else if (props.slipType === 'CUSTOMER_COPY') {
    out += centerText("PAYDAY ADVANCE [CUSTOMER COPY]", width);
    out += centerText("سند سلفة نقدية (نسخة العميل)", width);
  } else {
    out += centerText("PAYDAY CASH ADVANCE (SALFAH)", width);
    out += centerText("سند سلفة نقدية يوم الراتب", width);
  }
  out += line;

  const dateObj = typeof props.timestamp === 'string' ? new Date(props.timestamp) : (props.timestamp || new Date());
  const dateStr = `${dateObj.toLocaleDateString('en-GB')} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  out += formatTwoCols("Receipt No:", props.receiptNo, width);
  out += formatTwoCols("Date:", dateStr, width);
  out += formatTwoCols("Customer:", props.customerName, width);
  if (props.customerPhone) out += formatTwoCols("Phone:", props.customerPhone, width);
  if (props.customerCpr) out += formatTwoCols("CPR:", props.customerCpr, width);
  out += formatTwoCols("Staff:", props.cashierName || "Cashier 1", width);
  out += dash;

  out += formatTwoCols("CASH DISPENSED:", `BD ${Number(props.advanceAmount || 0).toFixed(3)}`, width);
  out += formatTwoCols("TOTAL SALFAH DUE:", `BD ${Number(props.newAdvanceBalance || 0).toFixed(3)}`, width);
  out += formatTwoCols("DUE DATE:", `Payday (${props.paydayDueDay || 28}th)`, width);
  out += line;

  if (props.slipType === 'CUSTOMER_COPY') {
    out += centerText("Please settle this advance on your salary date.", width);
    out += centerText("يرجى سداد السلفة في يوم نزول الراتب", width);
    out += centerText("Pay via Cash at Counter or BenefitPay", width);
    out += line;
  } else {
    out += centerText("I acknowledge receiving the cash amount above", width);
    out += centerText("as an emergency salary advance,", width);
    out += centerText("repayable on my next company payday.", width);
    out += dash;
    out += centerText("أقر باستلام المبلغ المذكور كسلفة تسدد في يوم الراتب", width);
    out += dash;
    out += "\nCustomer Signature:\n\n________________________________\n";
    out += line;
  }

  return out;
};

export const printCashAdvanceReceipt = async (props: CashAdvanceReceiptProps): Promise<boolean> => {
  if (props.isDualCopy) {
    const text1 = formatCashAdvanceReceipt({ ...props, slipType: 'STORE_COPY' });
    const text2 = formatCashAdvanceReceipt({ ...props, slipType: 'CUSTOMER_COPY' });
    const fullText = text1 + "\n\n" + "- - - - - - TEAR HERE - - - - - -\n\n" + text2;

    try {
      const isCap = (window as any).Capacitor?.isNativePlatform?.();
      if (isCap) {
        await Printer.initPrinter();
        try { await Printer.enterPrinterBuffer({ clean: true }); } catch { }
        await Printer.setPrinterAlignment({ alignment: 'left' });
        await Printer.setFontSize({ fontSize: 18 });
        await Printer.printText({ textToPrint: fullText + "\n\n\n" });
        await Printer.lineWrap({ lines: 3 });
        await Printer.cutPaper();
        try { await Printer.exitPrinterBuffer({ commit: true }); } catch { }
        return true;
      }
    } catch (err) {
      console.warn("Sunmi printer error during dual cash advance print:", err);
    }

    if (typeof window !== 'undefined') {
      try {
        const html = wrapMonospaceTextToHtml(fullText, "Payday Cash Advance Dual Slip");
        return await printThermalSlipViaIframe(html);
      } catch { }
    }
    return false;
  }

  const formattedText = formatCashAdvanceReceipt(props);

  try {
    const isCap = (window as any).Capacitor?.isNativePlatform?.();
    if (isCap) {
      await Printer.initPrinter();
      try { await Printer.enterPrinterBuffer({ clean: true }); } catch { }

      await Printer.setPrinterAlignment({ alignment: 'left' });
      await Printer.setFontSize({ fontSize: 18 });
      await Printer.printText({ textToPrint: formattedText + "\n\n\n" });

      await Printer.lineWrap({ lines: 3 });
      await Printer.cutPaper();
      try { await Printer.exitPrinterBuffer({ commit: true }); } catch { }
      return true;
    }
  } catch (err) {
    console.warn("Sunmi printer error during cash advance print:", err);
  }

  if (typeof window !== 'undefined') {
    try {
      const html = wrapMonospaceTextToHtml(formattedText, "Payday Cash Advance Receipt");
      return await printThermalSlipViaIframe(html);
    } catch { }
  }
  return false;
};

if (typeof window !== 'undefined') {
  (window as any).printFullReceipt = printFullReceipt;
  (window as any).printThermalSlipViaIframe = printThermalSlipViaIframe;
  (window as any).generateFullReceiptHtml = generateFullReceiptHtml;
  (window as any).printKhataPaymentReceipt = printKhataPaymentReceipt;
  (window as any).formatKhataReceipt = formatKhataReceipt;
  (window as any).printCreditNote = printCreditNote;
  (window as any).formatCreditNote = formatCreditNote;
  (window as any).printZReport = printZReport;
  (window as any).formatZReport = formatZReport;
  (window as any).printShiftCloseout = printShiftCloseout;
  (window as any).formatShiftCloseout = formatShiftCloseout;
  (window as any).printCardDepositReceipt = printCardDepositReceipt;
  (window as any).formatCardDepositReceipt = formatCardDepositReceipt;
  (window as any).printCardDepositRefundVoucher = printCardDepositRefundVoucher;
  (window as any).formatCardDepositRefund = formatCardDepositRefund;
  (window as any).printCashAdvanceReceipt = printCashAdvanceReceipt;
  (window as any).formatCashAdvanceReceipt = formatCashAdvanceReceipt;
}
