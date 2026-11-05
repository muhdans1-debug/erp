import { Printer } from 'capacitor-sunmi-printer';
// @ts-ignore
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { db } from '../db';

// Initialize the printer Web Worker natively in Vite for off-main-thread receipt formatting
const printerWorker = typeof window !== 'undefined' && typeof Worker !== 'undefined'
  ? new Worker(new URL('../workers/printer.worker.ts', import.meta.url), {
      type: 'module',
    })
  : null;

/**
 * Native Sunmi AIDL Cash Box / Drawer Kick
 * Triggers the RJ11/RJ12 cash drawer solenoid connected to the Sunmi terminal.
 * Combines native AIDL openDrawer() and universal ESC/POS hardware kick pulses
 * (Pin 2 standard 24V, Pin 5 reverse 12V, and DLE DC4 real-time kick).
 */
export const kickCashDrawer = async (): Promise<boolean> => {
  try {
    if (typeof Printer === 'undefined') {
      console.warn('⚠️ [Sunmi Hardware] Printer plugin not available in this environment');
      return false;
    }

    // 1. Mandatory: Ensure Sunmi AIDL printer service is initialized & bound
    if (typeof Printer.initPrinter === 'function') {
      try {
        await Printer.initPrinter();
      } catch (initErr) {
        console.warn('⚠️ [Sunmi Hardware] initPrinter warning:', initErr);
      }
    }

    // Allow brief tick for Android IPC service connection binding
    await new Promise((resolve) => setTimeout(resolve, 80));

    let triggered = false;

    // 2. Primary: Sunmi AIDL Native openDrawer() call
    if (typeof Printer.openCashBox === 'function') {
      try {
        await Printer.openCashBox();
        console.log('⚡ [Sunmi Hardware] Cash box kicked via AIDL openCashBox()');
        triggered = true;
      } catch (boxErr) {
        console.warn('⚠️ [Sunmi Hardware] openCashBox error:', boxErr);
      }
    }

    if (triggered) {
      return true;
    }

    // 3. Universal Fallback: Send ESC/POS hardware kick pulses through printer buffer
    // Pin 2 (Standard Epson 24V): ESC p 0 30 255 -> base64: G3AAHv8=
    // Pin 5 (Star / Reverse 12V): ESC p 1 30 255 -> base64: G3ABHv8=
    // Sunmi real-time drawer pulse: DLE DC4 1 0 5 -> base64: EBQBAAU=
    if (typeof Printer.sendRAWData === 'function') {
      try {
        if (typeof Printer.enterPrinterBuffer === 'function') {
          await Printer.enterPrinterBuffer({ clean: true });
        }
        await Printer.sendRAWData({ base64Data: 'G3AAHv8=' }); // Pin 2 kick
        await Printer.sendRAWData({ base64Data: 'G3ABHv8=' }); // Pin 5 kick
        await Printer.sendRAWData({ base64Data: 'EBQBAAU=' }); // Sunmi DLE DC4 kick
        if (typeof Printer.exitPrinterBuffer === 'function') {
          await Printer.exitPrinterBuffer({ commit: true });
        }
        console.log('⚡ [Sunmi Hardware] Cash box kicked via ESC/POS raw pulse sequences');
        triggered = true;
      } catch (rawErr) {
        console.warn('⚠️ [Sunmi Hardware] sendRAWData drawer kick error:', rawErr);
      }
    }

    return triggered;
  } catch (error) {
    console.error('Cash Drawer Error: ', error);
  }
  return false;
};

// Retain alias for full backwards compatibility
export const openCashDrawer = kickCashDrawer;

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
  openDrawer: async () => openCashDrawer(),
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
  sellingPrice?: number | string;
  price?: number | string;
  barcode?: string;
  category?: string;
  vatRate?: number;
  is_weighed_item?: boolean;
}): Promise<boolean> => {
  const name = (productData.name || 'ITEM').trim();
  const rawPrice = parseFloat(String(productData.sellingPrice ?? productData.price ?? 0)) || 0;
  const barcode = (productData.barcode || '').trim();
  const category = (productData.category || 'RETAIL').toUpperCase();
  const isWeighed = Boolean(productData.is_weighed_item);
  const vatRate = productData.vatRate !== undefined ? Number(productData.vatRate) : 10;

  try {
    await SunmiPrinter.printerInit();

    // 1. Department / Store Header (Centered, Normal Font)
    await SunmiPrinter.setAlignment({ alignment: 1 });
    await SunmiPrinter.setFontSize({ fontSize: 20 });
    await SunmiPrinter.printText({ text: `* ASKAR SUPERMARKET *\n` });
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
  sellingPrice: number;
  price?: number;
  quantity?: number;
  vatRate?: number;
  taxRate?: number;
  is_weighed_item?: boolean;
  total_price?: number;
}

/**
 * Format a single line item for physical receipt printing with weighed vs standard item discrimination.
 */
export const formatReceiptLineItem = (item: {
  name: string;
  quantity: number;
  price?: number;
  sellingPrice?: number;
  total_price?: number;
  is_weighed_item?: boolean;
}): string => {
  const price = item.price ?? item.sellingPrice ?? 0;
  const totalPrice = item.total_price ?? (price * item.quantity);
  return item.is_weighed_item
    ? `${item.name}\n  ${item.quantity.toFixed(3)}kg x ${price.toFixed(3)}   ${totalPrice.toFixed(3)}`
    : `${item.name}\n  ${item.quantity} x ${price.toFixed(3)}         ${totalPrice.toFixed(3)}`;
};

export interface FullReceiptProps {
  shopName?: string;
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
}

// 58mm thermal paper fits 32 characters per line in standard font
const formatTwoCols = (left: string, right: string, width = 32): string => {
  const leftTrim = left.length > width - right.length - 1
    ? left.slice(0, width - right.length - 2) + '.'
    : left;
  const spaces = Math.max(1, width - leftTrim.length - right.length);
  return `${leftTrim}${' '.repeat(spaces)}${right}\n`;
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

let isPrinterInitialized = false;

export const printFullReceipt = async ({
  shopName = "ASKAR SUPERMARKET",
  shopAddress = "Askar, Kingdom of Bahrain",
  shopPhone = "Tel: +973 1700 0000",
  vatNumber = "200012345678901",
  invoiceNo,
  items = [],
  subtotal,
  vat,
  total,
  paymentMode,
  customerName,
  customerCardUid,
  previousBalance,
  newBalance = 0,
  cashierName = "Cashier 01",
  transactionRef,
  isMess = false,
  groupName,
  cardUid,
  shopperName,
  members = [],
  customerId,
  customerUuid,
  cashTendered,
  changeDue
}: FullReceiptProps) => {
  try {
    if (!isPrinterInitialized) {
      try {
        await Printer.initPrinter();
        isPrinterInitialized = true;
      } catch { }
    }

    // 1. HEADER (Centered - NBR Simplified Tax Invoice Compliant)
    await Printer.setPrinterAlignment({ alignment: 'center' });
    await Printer.setFontSize({ fontSize: 24 });
    const headerBlock = [
      `${shopName}\n`,
      "Simplified Tax Invoice\n",
      "فاتورة ضريبية مبسطة\n",
      `VAT No: ${vatNumber}\n`,
      `${shopAddress}\n`,
      `${shopPhone}\n`,
      "================================\n"
    ].join('');
    await Printer.printText({ textToPrint: headerBlock });

    // 2. TRANSACTION METADATA (Left-aligned - Strictly formatted to 32 chars)
    await Printer.setPrinterAlignment({ alignment: 'left' });
    await Printer.setFontSize({ fontSize: 20 });

    const now = new Date();
    const formattedDate = `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    // Sanitize invoice number to guarantee non-zero, compliant Bahrain sequential string
    let cleanInvoice = (invoiceNo !== undefined && invoiceNo !== null) ? String(invoiceNo).trim() : '';
    if (!cleanInvoice || cleanInvoice === '0' || cleanInvoice === 'INV-0' || cleanInvoice === '#0' || cleanInvoice.includes('undefined')) {
      cleanInvoice = 'INV-005000';
    }
    const finalInvoiceDisplay = cleanInvoice.startsWith('INV-')
      ? cleanInvoice
      : (cleanInvoice.startsWith('#') ? cleanInvoice.slice(1) : cleanInvoice);

    // Group items
    const groupedMap = new Map<string, { item: ReceiptItem; count: number }>();
    for (const item of items) {
      const key = item.id || item.name;
      if (groupedMap.has(key)) {
        groupedMap.get(key)!.count += (item.quantity ?? 1);
      } else {
        groupedMap.set(key, { item, count: (item.quantity ?? 1) });
      }
    }

    let totalQuantity = 0;
    const bodyLines: string[] = [
      formatTwoCols("Invoice:", finalInvoiceDisplay),
      formatTwoCols("Date:", formattedDate),
      formatTwoCols(`Staff: ${cashierName}`, `Mode: ${paymentMode}`),
      "--------------------------------\n",
      formatTwoCols("Item", "Qty   Amt(BD)"),
      "--------------------------------\n"
    ];

    for (const { item, count } of groupedMap.values()) {
      totalQuantity += (item.is_weighed_item ? 1 : count);
      const unitPrice = item.price ?? item.sellingPrice ?? 0;
      const lineTotal = item.total_price ?? (unitPrice * count);
      const isVat10 = item.vatRate === 10 || (item.vatRate === undefined && item.taxRate !== 0);

      const itemLabel = `${item.name}${isVat10 ? ' *' : ''}`;
      bodyLines.push(`${itemLabel}\n`);

      const qtyLine = item.is_weighed_item
        ? `  ${count.toFixed(3)}kg x ${unitPrice.toFixed(3)}`
        : `  ${count} x BD ${unitPrice.toFixed(3)}`;
      bodyLines.push(formatTwoCols(qtyLine, `BD ${lineTotal.toFixed(3)}`));
    }

    bodyLines.push("--------------------------------\n");
    bodyLines.push(formatTwoCols("Subtotal:", `BD ${subtotal.toFixed(3)}`));
    bodyLines.push(formatTwoCols("VAT (10%):", `BD ${vat.toFixed(3)}`));
    bodyLines.push("--------------------------------\n");
    bodyLines.push(formatTwoCols("TOTAL:", `BD ${total.toFixed(3)}`));
    bodyLines.push("--------------------------------\n");

    // Cash details with Tendered & Change Due
    if (paymentMode === 'CASH') {
      bodyLines.push("*** Paid via CASH ***\n");
      if (cashTendered !== undefined && Number(cashTendered) > 0) {
        bodyLines.push(formatTwoCols("Cash Tendered:", `BD ${Number(cashTendered).toFixed(3)}`));
        const finalChange = changeDue !== undefined ? changeDue : (Number(cashTendered) > total ? Number(cashTendered) - total : 0);
        bodyLines.push(formatTwoCols("Change Returned:", `BD ${Number(finalChange).toFixed(3)}`));
      }
      bodyLines.push("--------------------------------\n");
    }

    // BenefitPay details
    if (paymentMode === 'BENEFIT_PAY') {
      bodyLines.push("*** Paid via BenefitPay ***\n");
      if (transactionRef) bodyLines.push(formatTwoCols("Ref No:", transactionRef));
      bodyLines.push("Method: Fawri+ QR\n");
      bodyLines.push("--------------------------------\n");
    }

    // Khata / Credit details
    if (paymentMode === 'CREDIT' || paymentMode === 'MESS_KHATA' || isMess) {
      if (paymentMode === 'MESS_KHATA' || isMess) {
        bodyLines.push("*** MESS SPLIT-BILL RECEIPT ***\n");
        bodyLines.push(formatTwoCols("MESS GROUP:", groupName || customerName || "Shared Mess"));
        if (shopperName) bodyLines.push(formatTwoCols("Shopper:", shopperName));
        if (cardUid) bodyLines.push(formatTwoCols("Card UID:", String(cardUid)));
        bodyLines.push(formatTwoCols("Total Groceries:", `BD ${total.toFixed(3)}`));
        bodyLines.push(formatTwoCols("Members in Pool:", String(members?.length || 0)));
        bodyLines.push("--------------------------------\n");
        bodyLines.push("EQUAL SPLIT CHARGE PER MEMBER:\n");
        if (Array.isArray(members)) {
          members.forEach((m: any) => {
            const splitVal = Number(m.amount ?? m.splitAmount ?? (total / members.length)).toFixed(3);
            bodyLines.push(formatTwoCols(`- ${m.name || m.customer_name}:`, `BD ${splitVal}`));
          });
        }
        bodyLines.push("--------------------------------\n");
        bodyLines.push("Cashier / Auth: ________________\n");
        bodyLines.push("Shares synced to Khata PWA\n");
        bodyLines.push("--------------------------------\n");
      } else {
        bodyLines.push("*** KHATA CREDIT TAB ***\n");
        if (customerName) bodyLines.push(formatTwoCols("Customer:", customerName));
        if (customerCardUid) bodyLines.push(formatTwoCols("Card UID:", customerCardUid));
        if (previousBalance !== undefined) bodyLines.push(formatTwoCols("Previous Balance:", `BD ${previousBalance.toFixed(3)}`));
        bodyLines.push(formatTwoCols("Added to Tab:", `+BD ${total.toFixed(3)}`));
        bodyLines.push(formatTwoCols("TOTAL BALANCE DUE:", `BD ${newBalance.toFixed(3)}`));
        bodyLines.push("--------------------------------\n");
      }
    }

    // Dispatch body payload in single continuous stream
    await Printer.printText({ textToPrint: bodyLines.join('') });

    // 3. CLOSING & FOOTER (VAT notice)
    await Printer.setPrinterAlignment({ alignment: 'center' });
    await Printer.setFontSize({ fontSize: 18 });
    const footerLines = [
      `Total Items Count: ${totalQuantity}\n`,
      "* Item includes 10% VAT\n",
      `Invoice: ${finalInvoiceDisplay}\n`,
      "THANK YOU FOR SHOPPING!\n",
      "Please retain invoice for returns.\n",
      "================================\n",
      "SCAN TO RETURN ITEMS\n"
    ].join('');
    await Printer.printText({ textToPrint: footerLines });

    // 4. CODE128 BARCODE FOR REFUNDS / RETURNS (NBR & POS Protocol - Centered)
    try {
      await printBarCode128(finalInvoiceDisplay, { height: 70, width: 2, textPosition: 2 });
    } catch (bcErr) {
      console.warn("Return barcode print warning:", bcErr);
    }

    // 5. THE QR CODE INJECTOR (Physical-to-Digital Bridge - Strictly Khata Customers)
    try {
      const isCreditSale = paymentMode === 'CREDIT' || paymentMode === 'MESS_KHATA' || paymentMode === 'KHATA' || isMess;
      const targetCustId = customerId || customerUuid || cardUid || customerCardUid;

      const portalDomain = (typeof window !== 'undefined' && localStorage.getItem('khata_portal_domain'))
        ? localStorage.getItem('khata_portal_domain')!.replace(/\/+$/, '')
        : 'https://askar-khata-pwa.vercel.app';

      // 🟢 UPDATED LOGIC: Only print Khata info if they owe money, have a credit limit, or paid via Khata
      const isKhataCustomer = Boolean(
        targetCustId && (
          isCreditSale ||
          (newBalance !== undefined && Number(newBalance) > 0) ||
          (previousBalance !== undefined && Number(previousBalance) > 0)
        )
      );

      if (isKhataCustomer && targetCustId) {
        await Printer.setPrinterAlignment({ alignment: 'center' });
        await Printer.printText({ textToPrint: "\n================================\n" });
        const pwaUrl = `${portalDomain}/tab/${targetCustId}`;
        const qrHeader = [
          "LIVE KHATA STATEMENT & PAYMENT\n",
          (newBalance !== undefined && Number(newBalance) > 0) ? `Current Debt: BD ${Number(newBalance).toFixed(3)}\n` : ''
        ].filter(Boolean).join('');
        await Printer.printText({ textToPrint: qrHeader });
        await printQRCode(pwaUrl, 190);
        await Printer.printText({ textToPrint: "Scan with phone to Pay via BenefitPay\n" });
        await Printer.printText({ textToPrint: "================================\n" });
      }
    } catch (qrErr) {
      console.warn("Receipt QR print warning:", qrErr);
    }

    // Feed past manual tear bar and commit printer buffer
    await Printer.lineWrap({ lines: 6 });
    try {
      await Printer.commitPrinterBuffer();
    } catch { }
    try {
      await Printer.cutPaper();
    } catch { }
  } catch (error) {
    console.warn("SUNMI printer print error:", error);
  }
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
    taxRate: itm.taxRate !== undefined ? Number(itm.taxRate) : (itm.vatRate !== undefined ? Number(itm.vatRate) : 10)
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

  // Rapid hardware printer execution pipeline
  const executeCommands = async (commands: Array<{ action: string; data: any }>): Promise<boolean> => {
    try {
      const winPrinter = typeof window !== 'undefined' ? (window as any).Printer : undefined;
      const isNative = typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.());

      if (winPrinter) {
        for (const cmd of commands) {
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
          for (const cmd of commands) {
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
    { action: 'printText', data: 'ASKAR SUPERMARKET\n' },
    { action: 'printText', data: `Invoice: ${invoiceNo}\n` },
    { action: 'setAlignment', data: 0 },
    { action: 'printText', data: '--------------------------------\n' }
  ];

  for (const item of normalizedItems) {
    const isTaxable = item.taxRate === 10;
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
 * Automated Barcode Refund Engine
 * Intercepts scanned receipt barcodes, validates against fraud/duplicate refunds,
 * reverses the exact financial tender (Khata credit or Cash drawer payout),
 * logs negative shift drawer transactions, marks sale REFUNDED, and forces cloud sync.
 */
export const processRefund = async (
  scannedInvoiceNumber: string,
  currentShiftId?: string | null
): Promise<{ success: boolean; message?: string; error?: string; sale?: any }> => {
  const cleanInvoice = String(scannedInvoiceNumber || '').trim();
  if (!cleanInvoice) {
    return { success: false, error: 'Empty invoice number provided.' };
  }

  try {
    // 1. Find the exact sale in the local database (checking both Sale and Sales)
    let sale: any = null;
    try {
      const saleResult = await db.execute({
        sql: 'SELECT * FROM Sale WHERE invoiceNo = ? OR id = ? LIMIT 1',
        args: [cleanInvoice, cleanInvoice],
      });
      if (saleResult.rows && saleResult.rows.length > 0) {
        sale = saleResult.rows[0];
      }
    } catch (e) {
      console.warn('Local Sale check notice:', e);
    }

    if (!sale) {
      try {
        const salesResult = await db.execute({
          sql: 'SELECT * FROM Sales WHERE invoice_number = ? OR id = ? LIMIT 1',
          args: [cleanInvoice, cleanInvoice],
        });
        if (salesResult.rows && salesResult.rows.length > 0) {
          sale = salesResult.rows[0];
        }
      } catch (e) {
        console.warn('Sales view check notice:', e);
      }
    }

    if (!sale) {
      const msg = `Invalid Receipt: Sale #${cleanInvoice} not found.`;
      if (typeof window !== 'undefined') alert(msg);
      return { success: false, error: msg };
    }

    // 2. Prevent double refunding
    if (sale.status === 'REFUNDED') {
      const fraudMsg = `FRAUD WARNING: This receipt has already been refunded!`;
      if (typeof window !== 'undefined') alert(fraudMsg);
      return { success: false, error: fraudMsg };
    }

    const saleTotal = Number(sale.total || sale.totalAmount || 0);
    const pType = String(sale.paymentType || sale.payment_type || 'CASH').toUpperCase();
    const khataCustomerId = sale.customerId || sale.khata_id;
    const shift =
      currentShiftId ||
      sale.shiftId ||
      sale.shift_id ||
      (typeof localStorage !== 'undefined'
        ? localStorage.getItem('active_shift_id') || localStorage.getItem('askar_shift_id')
        : null);

    // 3. Reverse the Financials based on Payment Type
    if (pType === 'KHATA' || pType === 'CREDIT' || pType === 'MESS_KHATA') {
      // Revert the customer's debt balance on unified Customer table
      if (khataCustomerId) {
        await db.execute({
          sql: 'UPDATE Customer SET balance = MAX(0, balance - ?) WHERE id = ?',
          args: [saleTotal, khataCustomerId],
        });
      }
      const khataMsg = `Refunded ${saleTotal.toFixed(3)} BHD back to Customer Khata ledger.`;
      if (typeof window !== 'undefined') alert(khataMsg);
    } else if (pType === 'CASH') {
      // Create a negative cash transaction on the CURRENT active shift to balance the drawer
      const refundSaleId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `ref_${Date.now()}`;
      await db.execute({
        sql: `INSERT INTO Sale (id, invoiceNo, total, subtotal, paymentType, status, shiftId, createdAt) 
              VALUES (?, ?, ?, ?, 'CASH', 'REFUNDED', ?, datetime('now'))`,
        args: [refundSaleId, `REF-${cleanInvoice}`, -saleTotal, -saleTotal, shift],
      });

      // Kick the physical cash drawer open so the cashier can return cash
      await kickCashDrawer();
      const cashMsg = `Cash Drawer Opened. Return ${saleTotal.toFixed(3)} BHD to customer.`;
      if (typeof window !== 'undefined') alert(cashMsg);
    } else {
      // Digital BenefitPay / Card
      const digitalMsg = `Refund approved for ${pType} transaction. Return ${saleTotal.toFixed(3)} BHD to customer.`;
      if (typeof window !== 'undefined') alert(digitalMsg);
    }

    // 4. Mark the original sale as REFUNDED in local database
    await db.execute({
      sql: "UPDATE Sale SET status = 'REFUNDED' WHERE invoiceNo = ? OR id = ?",
      args: [cleanInvoice, sale.id],
    });

    // Also update via server API for central audit
    try {
      const host = (typeof window !== 'undefined' && window.location.hostname) || 'localhost';
      const masterBase =
        (typeof window !== 'undefined' && localStorage.getItem('master_server_url')) || `http://${host}:3000`;
      await fetch(`${masterBase}/api/sales/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-manager-pin': '9999'
        },
        body: JSON.stringify({
          invoiceNo: cleanInvoice,
          items: [{ productId: 'REFUND_ALL', quantity: 1, unitPrice: saleTotal }],
          reason: 'CUSTOMER_RETURN',
          destination: pType === 'KHATA' || pType === 'CREDIT' ? 'KHATA_CREDIT' : 'CASH',
          processedBy: 'Sunmi POS Barcode Scanner',
        }),
      }).catch(() => { });
    } catch { }

    // Print Void / Credit Note on Sunmi Printer
    try {
      await printCreditNote({
        invoiceNo: cleanInvoice,
        creditNoteNo: `CN-${cleanInvoice.replace(/^INV-?/i, '')}`,
        totalAmount: saleTotal,
        vatAmount: Number((saleTotal - saleTotal / 1.1).toFixed(3)),
        date: new Date().toISOString(),
        cashierName: 'POS Scanner',
      });
    } catch (prErr) {
      console.warn('Credit note print error:', prErr);
    }

    // 5. Instantly force cloud sync
    await db.sync();

    return {
      success: true,
      message: `Invoice #${cleanInvoice} refunded successfully.`,
      sale,
    };
  } catch (error: any) {
    console.error('Refund failed:', error);
    const errText = `Refund failed: ${error?.message || error}`;
    if (typeof window !== 'undefined') alert(errText);
    return { success: false, error: errText };
  }
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
}

export const printKhataStatement = async ({
  shopName = "ASKAR STORE - KHATA STATEMENT",
  customerName,
  customerPhone,
  customerCpr,
  statement = [],
  currentBalance = 0
}: {
  shopName?: string;
  customerName: string;
  customerPhone?: string | null;
  customerCpr?: string | null;
  statement: KhataStatementItem[];
  currentBalance: number;
}) => {
  try {
    await Printer.initPrinter();
    await Printer.setPrinterAlignment({ alignment: 'center' });
    await Printer.setFontSize({ fontSize: 24 });
    await Printer.printText({ textToPrint: `${shopName}\n` });
    await Printer.setFontSize({ fontSize: 18 });
    await Printer.printText({ textToPrint: `Customer: ${customerName}\n` });
    if (customerPhone) await Printer.printText({ textToPrint: `Phone: ${customerPhone}\n` });
    if (customerCpr) await Printer.printText({ textToPrint: `CPR: ${customerCpr}\n` });
    await Printer.printText({ textToPrint: "================================\n" });

    await Printer.setPrinterAlignment({ alignment: 'left' });
    await Printer.setFontSize({ fontSize: 18 });
    await Printer.printText({ textToPrint: formatTwoCols("DATE / DESC", "BAL (BD)") });
    await Printer.printText({ textToPrint: "--------------------------------\n" });

    // Print history (oldest to newest or top entries)
    const printList = [...statement].reverse();
    for (const item of printList) {
      const typeStr = item.type === 'SALE' ? '+GROCERY' : '-PAYMENT';
      const amtStr = item.amount > 0 ? `+${item.amount.toFixed(3)}` : `${item.amount.toFixed(3)}`;
      await Printer.printText({ textToPrint: `${item.formattedDate} ${item.formattedTime}\n` });
      await Printer.printText({
        textToPrint: formatTwoCols(`${typeStr} (${amtStr})`, `BD ${item.runningBalance.toFixed(3)}`)
      });
    }

    await Printer.printText({ textToPrint: "================================\n" });
    await Printer.setFontSize({ fontSize: 22 });
    await Printer.printText({
      textToPrint: formatTwoCols("OUTSTANDING DUE:", `BD ${currentBalance.toFixed(3)}`)
    });
    await Printer.setFontSize({ fontSize: 16 });
    await Printer.setPrinterAlignment({ alignment: 'center' });
    await Printer.printText({ textToPrint: `Printed: ${new Date().toLocaleString()}\n` });
    await Printer.printText({ textToPrint: "Official Store Account Ledger\n" });
    await Printer.lineWrap({ lines: 3 });
    await Printer.cutPaper();
    console.log("Khata statement printed successfully on thermal printer!");
  } catch (err) {
    console.warn("Thermal hardware print fallback to window.print():", err);
    window.print();
  }
};

export interface KhataPaymentReceiptProps {
  shopName?: string;
  shopAddress?: string;
  shopPhone?: string;
  receiptNo?: string;
  customerName: string;
  customerPhone?: string | null;
  customerCpr?: string | null;
  previousBalance: number;
  amountPaid: number;
  newBalance: number;
  paymentMethod?: string;
  cashierName?: string;
  timestamp?: string | Date;
}

/**
 * 58mm Monospaced Receipt Formatter for Khata Debt Settlement.
 * Generates exact 32-character wide lines for Sunmi 58mm thermal rolls.
 */
export const formatKhataReceipt = ({
  shopName = "ASKAR SUPERMARKET",
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
    "          أسواق عسكر           ",
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

    // 1. Header (Centered)
    await Printer.setPrinterAlignment({ alignment: 'center' });
    await Printer.setFontSize({ fontSize: 26 });
    await Printer.printText({ textToPrint: `${props.shopName || "ASKAR SUPERMARKET"}\n` });
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

    // Feed and cut paper
    await Printer.lineWrap({ lines: 3 });
    await Printer.cutPaper();
    console.log("Khata payment receipt printed successfully on Sunmi 58mm printer!");
    return true;
  } catch (error) {
    console.warn("Sunmi thermal printer dispatch error (or non-Android environment):", error);
    // Non-blocking fallback
    return false;
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
    ASKAR SUPERMARKET
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
    await Printer.printText({ textToPrint: "ASKAR SUPERMARKET\n" });
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
    await Printer.printText({ textToPrint: formatTwoCols("Staff:", props.cashierName || "Manager 9999") });
    await Printer.printText({ textToPrint: "--------------------------------\n" });

    // 4. Line Items if present
    if (props.items && props.items.length > 0) {
      await Printer.printText({ textToPrint: formatTwoCols("Item Reversal", "Qty x Price") });
      for (const item of props.items) {
        const name = item.productName || item.name || "Item";
        const qty = item.quantity || 1;
        const price = Number(item.priceAtSale || item.unitPrice || 0);
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
    console.log("Credit Note printed successfully on Sunmi 58mm printer!");
    return true;
  } catch (err) {
    console.warn("Credit Note printing failed (non-Android / dev environment fallback):", err);
    return false;
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
    "       " + (props.shopName || "ASKAR SUPERMARKET") + "        ",
    "          أسواق عسكر           ",
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
    await Printer.printText({ textToPrint: `${props.shopName || "ASKAR SUPERMARKET"}\n` });
    await Printer.setFontSize({ fontSize: 20 });
    await Printer.printText({ textToPrint: "أسواق عسكر\n" });
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

    // 6. Till Cash Drawer Reconciliation (Crucial Audit)
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
    console.warn("Sunmi thermal printer dispatch error (fallback to window.print):", err);
    window.print();
    return false;
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
  out += "       ASKAR SUPERMARKET        \n";
  out += "          أسواق عسكر           \n";
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

      // 1. Header (Centered)
      await Printer.setPrinterAlignment({ alignment: 'center' });
      await Printer.setFontSize({ fontSize: 26 });
      await Printer.printText({ textToPrint: `${props.shopName || "ASKAR SUPERMARKET"}\n` });
      await Printer.setFontSize({ fontSize: 20 });
      await Printer.printText({ textToPrint: "أسواق عسكر\n" });
      await Printer.setFontSize({ fontSize: 16 });
      await Printer.printText({ textToPrint: `${props.shopAddress || "Askar, Kingdom of Bahrain"}\n` });
      await Printer.printText({ textToPrint: `VAT ID: ${props.vatNumber || "200012345678901"}\n` });
      await Printer.printText({ textToPrint: "================================\n" });

      // 2. Title
      await Printer.setFontSize({ fontSize: 24 });
      await Printer.printText({ textToPrint: "*** SHIFT CLOSEOUT ***\n" });
      await Printer.setFontSize({ fontSize: 18 });
      await Printer.printText({ textToPrint: "BLIND CASH RECONCILIATION\n" });
      await Printer.printText({ textToPrint: "تقرير إغلاق الوردية\n" });
      await Printer.printText({ textToPrint: "================================\n" });

      // 3. Shift Metadata (Left aligned)
      await Printer.setPrinterAlignment({ alignment: 'left' });
      await Printer.setFontSize({ fontSize: 18 });
      await Printer.printText({ textToPrint: formatTwoCols("Shift ID:", props.shiftId ? `#${props.shiftId.slice(0, 14)}` : "CURRENT") });
      await Printer.printText({ textToPrint: formatTwoCols("Cashier:", props.cashierName || "Cashier 1") });
      const now = new Date();
      await Printer.printText({ textToPrint: formatTwoCols("Date:", now.toLocaleDateString('en-GB')) });
      await Printer.printText({ textToPrint: formatTwoCols("Time:", now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) });
      await Printer.printText({ textToPrint: formatTwoCols("Register:", "Reg 01 (Sunmi D2)") });
      await Printer.printText({ textToPrint: formatTwoCols("Status:", "CLOSED & AUDITED") });
      await Printer.printText({ textToPrint: "--------------------------------\n" });

      // 4. Drawer Figures
      await Printer.printText({ textToPrint: "TILL CASH RECONCILIATION:\n" });
      await Printer.printText({ textToPrint: formatTwoCols("Opening Float:", `BD ${Number(props.startingFloat || 0).toFixed(3)}`) });
      await Printer.printText({ textToPrint: formatTwoCols("(+) Cash Sales:", `BD ${Number(props.cashSales || 0).toFixed(3)}`) });
      if (Number(props.refunds || 0) > 0) {
        await Printer.printText({ textToPrint: formatTwoCols("(-) Cash Refunds:", `BD -${Number(props.refunds).toFixed(3)}`) });
      }
      if (Number(props.supplierPayouts || 0) > 0) {
        await Printer.printText({ textToPrint: formatTwoCols("(-) Cash Payouts:", `BD -${Number(props.supplierPayouts).toFixed(3)}`) });
      }
      await Printer.printText({ textToPrint: "--------------------------------\n" });

      await Printer.setFontSize({ fontSize: 20 });
      await Printer.printText({ textToPrint: formatTwoCols("EXPECTED IN TILL:", `BD ${Number(props.expectedCash || 0).toFixed(3)}`) });
      await Printer.printText({ textToPrint: formatTwoCols("ACTUAL COUNTED:", `BD ${Number(props.actualCash || 0).toFixed(3)}`) });
      await Printer.setFontSize({ fontSize: 18 });
      await Printer.printText({ textToPrint: "================================\n" });

      // 5. Verdict
      await Printer.setPrinterAlignment({ alignment: 'center' });
      await Printer.setFontSize({ fontSize: 22 });
      const v = Number(props.variance || 0);
      if (Math.abs(v) < 0.005) {
        await Printer.printText({ textToPrint: "*** PERFECT BALANCE ***\n" });
        await Printer.printText({ textToPrint: "VARIANCE: BD 0.000\n" });
      } else if (v < 0) {
        await Printer.printText({ textToPrint: "*** SHORTAGE DETECTED ***\n" });
        await Printer.printText({ textToPrint: `SHORT BY BD ${Math.abs(v).toFixed(3)}\n` });
      } else {
        await Printer.printText({ textToPrint: "*** OVERAGE DETECTED ***\n" });
        await Printer.printText({ textToPrint: `OVER BY BD ${v.toFixed(3)}\n` });
      }
      await Printer.setFontSize({ fontSize: 18 });
      await Printer.printText({ textToPrint: "================================\n" });

      // 6. Denominations
      if (props.denominations && Object.keys(props.denominations).length > 0) {
        const activeDenoms = Object.entries(props.denominations).filter(([_, count]) => (count || 0) > 0);
        if (activeDenoms.length > 0) {
          await Printer.setPrinterAlignment({ alignment: 'left' });
          await Printer.printText({ textToPrint: "COUNTED DENOMINATIONS:\n" });
          for (const [denom, count] of activeDenoms) {
            const val = (parseFloat(denom) * count).toFixed(3);
            const label = parseFloat(denom) >= 1 ? `${denom} BD` : `${parseInt(String(parseFloat(denom) * 1000))} Fils`;
            await Printer.printText({ textToPrint: formatTwoCols(`${label} x ${count}:`, `BD ${val}`) });
          }
          await Printer.printText({ textToPrint: "--------------------------------\n" });
        }
      }

      // 7. Notes
      if (props.notes && props.notes.trim()) {
        await Printer.setPrinterAlignment({ alignment: 'left' });
        await Printer.printText({ textToPrint: `Notes: ${props.notes.trim()}\n` });
        await Printer.printText({ textToPrint: "--------------------------------\n" });
      }

      // 8. Signatures & Footer
      await Printer.setPrinterAlignment({ alignment: 'left' });
      await Printer.printText({ textToPrint: "Audited & Verified By:\n\n" });
      await Printer.printText({ textToPrint: "Cashier: _______________________\n\n" });
      await Printer.printText({ textToPrint: "Manager: _______________________\n" });
      await Printer.printText({ textToPrint: "================================\n" });

      await Printer.setPrinterAlignment({ alignment: 'center' });
      await Printer.setFontSize({ fontSize: 16 });
      await Printer.printText({ textToPrint: "Official Cashier Shift Slip\n" });
      await Printer.printText({ textToPrint: "Staple to Daily Cash Envelope\n" });
      await Printer.printText({ textToPrint: "================================\n" });

      // 9. Cut Paper
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
      window.print();
    }
  }

  return false;
};

if (typeof window !== 'undefined') {
  (window as any).printFullReceipt = printFullReceipt;
  (window as any).printKhataPaymentReceipt = printKhataPaymentReceipt;
  (window as any).formatKhataReceipt = formatKhataReceipt;
  (window as any).printCreditNote = printCreditNote;
  (window as any).formatCreditNote = formatCreditNote;
  (window as any).printZReport = printZReport;
  (window as any).formatZReport = formatZReport;
  (window as any).printShiftCloseout = printShiftCloseout;
  (window as any).formatShiftCloseout = formatShiftCloseout;
}
