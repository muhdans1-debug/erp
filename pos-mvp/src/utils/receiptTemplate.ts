/**
 * Enterprise NBR-Compliant Thermal Receipt Generator (Bahrain Retail Standard)
 * Designed for Askar Supermarket with Sunmi D2mini & 80mm thermal hardware support.
 * 
 * Features:
 * 1. Clean bilingual typography (Arabic / English)
 * 2. Official Ministry of Industry and Commerce C.R. No. and NBR VAT TRN registration
 * 3. Accurate item alignment (Unit count vs Scale kg)
 * 4. NBR VAT breakdown (Standard 10% vs Zero-Rated 0%)
 * 5. High-visibility Grand Total banner
 * 6. Tendered & Change breakdown
 * 7. Official Article 53 TLV Base64 QR code & Code128 return barcode
 * 8. Configurable via Sunmi Printer Style Settings
 */

import { getStoredBenefitPayConfig } from './benefitPay';
import { getRegionalReceiptDateTime } from './time';
import { getPrinterStyleConfig, type SunmiPrinterStyleConfig } from './printerConfig';

export interface ReceiptItemTemplate {
  name: string;
  nameAr?: string;
  price: number;
  qty: number;
  taxRate?: number;
  vatRate?: number;
  is_weighed_item?: boolean;
}

export interface ReceiptTemplateProps {
  invoiceNo: string;
  shopName?: string;
  shopNameAr?: string;
  crNumber?: string;
  vatNumber?: string;
  shopAddress?: string;
  shopAddressAr?: string;
  shopPhone?: string;
  staffName?: string;
  dateStr?: string;
  paymentMode?: string;
  items: ReceiptItemTemplate[];
  total: number;
  subtotal?: number;
  vat?: number;
  cashTendered?: number;
  changeDue?: number;
  customerName?: string;
  transactionRef?: string;
  barcodeDataUrl?: string;
  qrCodeDataUrl?: string;
  khataQrDataUrl?: string;
  isReprint?: boolean;
  styleConfig?: Partial<SunmiPrinterStyleConfig>;
}

export function generateNBRReceiptHtml(props: ReceiptTemplateProps): string {
  const cfg = {
    ...getPrinterStyleConfig(),
    ...(props.styleConfig || {}),
  };

  const invoiceNo = props.invoiceNo || 'INV-000000';
  const shopName = props.shopName || cfg.shopNameEn;
  const shopNameAr = props.shopNameAr || cfg.shopNameAr;
  const crNumber = props.crNumber || cfg.crNumber;
  const vatNumber = props.vatNumber || cfg.vatNumber;
  const shopAddress = props.shopAddress || cfg.shopAddressEn;
  const shopPhone = props.shopPhone || cfg.shopPhone;
  const staff = props.staffName || 'Register 01';
  const paymentMode = (props.paymentMode || 'CASH').toUpperCase();
  const dateStr = props.dateStr || getRegionalReceiptDateTime();

  const is80mm = cfg.paperWidth === '80mm';
  const widthMm = is80mm ? '72mm' : '48mm';
  const pageSize = is80mm ? '80mm auto' : '58mm auto';

  // Base font size scaling
  let baseFontSize = '9.5px';
  if (cfg.fontSize === 'compact') baseFontSize = is80mm ? '10px' : '8.5px';
  else if (cfg.fontSize === 'large') baseFontSize = is80mm ? '12.5px' : '10.5px';
  else baseFontSize = is80mm ? '11.5px' : '9.5px';

  // Ink density weight
  const inkWeight = cfg.printDensity === 'deep_burn' ? 700 : (cfg.printDensity === 'dark' ? 600 : 500);

  // Compute item lines & VAT categorization
  let standardTaxableBase = 0;
  let standardVatAmount = 0;
  let zeroRatedBase = 0;
  let totalItemCount = 0;

  const itemsHtml = (props.items || []).map((item, idx) => {
    const qty = Number(item.qty || 1);
    const unitPrice = Number(item.price || 0);
    const lineAmt = Number((unitPrice * qty).toFixed(3));
    const isScale = Boolean(item.is_weighed_item);
    totalItemCount += isScale ? 1 : qty;

    // Bahrain VAT rule: item is 10% unless explicitly 0%
    const isTaxable = item.vatRate === 10 || (item.vatRate === undefined && item.taxRate !== 0);
    if (isTaxable) {
      const itemBase = lineAmt / 1.10;
      const itemVat = lineAmt - itemBase;
      standardTaxableBase += itemBase;
      standardVatAmount += itemVat;
    } else {
      zeroRatedBase += lineAmt;
    }

    const vatTag = isTaxable ? '*' : 'Z';
    const qtyDisplay = isScale ? `${qty.toFixed(3)} kg` : `${qty} pcs`;

    return `
    <div class="item-block">
      <div class="row bold">
        <span class="item-name">${idx + 1}. ${escapeHtml(item.name)} <span class="tax-badge">[${vatTag}]</span></span>
        <span class="item-total">BD ${lineAmt.toFixed(3)}</span>
      </div>
      ${cfg.showArabicItems && item.nameAr ? `<div class="item-arabic">${escapeHtml(item.nameAr)}</div>` : ''}
      <div class="row text-muted">
        <span class="item-rate">&nbsp;&nbsp;${qtyDisplay} @ BD ${unitPrice.toFixed(3)}</span>
        <span class="tax-desc">${isTaxable ? '10% VAT' : '0% Zero-Rated'}</span>
      </div>
    </div>`;
  }).join('\n');

  const total = Number(props.total || 0);
  const calculatedVat = Number(standardVatAmount.toFixed(3));
  const calculatedSubtotal = Number((total - calculatedVat).toFixed(3));

  // Payment Breakdown
  let paymentSectionHtml = '';
  if (paymentMode === 'CASH') {
    const tendered = props.cashTendered !== undefined ? Number(props.cashTendered) : total;
    const change = props.changeDue !== undefined ? Number(props.changeDue) : (tendered > total ? tendered - total : 0);
    paymentSectionHtml = `
    <div class="payment-box">
      <div class="center bold payment-title">*** PAID VIA CASH / نقداً ***</div>
      <div class="row" style="margin-top: 3px;">
        <span>Cash Tendered / المدفوع:</span>
        <span class="bold">BD ${tendered.toFixed(3)}</span>
      </div>
      <div class="row">
        <span>Change Returned / الباقي:</span>
        <span class="bold">BD ${change.toFixed(3)}</span>
      </div>
    </div>`;
  } else if (paymentMode === 'BENEFIT_PAY') {
    const bCfg = getStoredBenefitPayConfig();
    const payeeIdent = bCfg.accountType === 'MOBILE_FAWRI' ? `Tel: ${bCfg.mobileNumber || ''}` : `MID: ${bCfg.merchantId || ''}`;
    paymentSectionHtml = `
    <div class="payment-box">
      <div class="center bold payment-title">*** PAID VIA BENEFITPAY / فوري+ ***</div>
      <div class="row" style="margin-top: 3px;">
        <span>Payment Method:</span>
        <span>BenefitPay Fawri+</span>
      </div>
      <div class="row">
        <span>Settlement Account:</span>
        <span class="bold">${payeeIdent}</span>
      </div>
      ${props.transactionRef ? `<div class="row"><span>Reference No:</span> <span class="bold font-mono">${props.transactionRef}</span></div>` : ''}
    </div>`;
  } else if (paymentMode === 'CARD') {
    paymentSectionHtml = `
    <div class="payment-box">
      <div class="center bold payment-title">*** PAID VIA CARD / بطاقة مصرفية ***</div>
      <div class="row" style="margin-top: 3px;">
        <span>Terminal:</span>
        <span>POS Contactless EMV / NFC</span>
      </div>
    </div>`;
  } else {
    paymentSectionHtml = `
    <div class="payment-box">
      <div class="center bold payment-title">*** ${paymentMode} ***</div>
      ${props.customerName ? `<div class="row" style="margin-top: 3px;"><span>Account:</span> <span class="bold">${props.customerName}</span></div>` : ''}
    </div>`;
  }

  const barcodeImgHtml = props.barcodeDataUrl
    ? `<img src="${props.barcodeDataUrl}" style="width: 82%; max-height: 40px; display: block; margin: 0 auto;" alt="Barcode" />`
    : `<div style="font-family: monospace; letter-spacing: 2px; font-weight: 700; font-size: 13px;">|||| | ||||| |||| || |||||||</div>`;

  return `<!DOCTYPE html>
<html lang="ar" dir="ltr">
<head>
  <meta charset="UTF-8">
  <title>Receipt ${invoiceNo}</title>
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
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      width: 100% !important;
    }
    body {
      font-family: 'Roboto Mono', 'SF Mono', Consolas, 'Courier New', monospace, 'Segoe UI', Tahoma, sans-serif;
      font-weight: ${inkWeight};
      color: #000000;
      width: ${widthMm};
      max-width: ${widthMm};
      margin: 0 auto;
      padding: 1.5mm 1mm;
      font-size: ${baseFontSize};
      line-height: 1.25;
      letter-spacing: -0.15px;
    }

    .center { text-align: center; }
    .bold { font-weight: 800; }
    .title-large {
      font-size: 13.5px;
      font-weight: 900;
      letter-spacing: 0.5px;
      margin-bottom: 1px;
    }
    .title-arabic {
      font-size: 13px;
      font-weight: 800;
      direction: rtl;
      margin-bottom: 2px;
    }
    .subtitle-tax {
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-top: 1px;
    }
    
    /* Strict Left/Right Flex Alignment */
    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      width: 100%;
      margin: 1px 0;
    }

    .text-muted {
      color: #333333;
      font-size: 8.5px;
    }

    .divider {
      border-top: 1px dashed #000000;
      margin: 3.5px 0;
      width: 100%;
    }
    .divider-double {
      border-top: 2px solid #000000;
      margin: 4px 0;
      width: 100%;
    }

    /* Item Blocks */
    .item-block {
      margin-bottom: 3.5px;
      padding-bottom: 1.5px;
    }
    .item-name {
      max-width: 72%;
      word-break: break-word;
    }
    .item-arabic {
      font-size: 8.5px;
      direction: rtl;
      text-align: right;
      color: #222222;
      padding-right: 4px;
    }
    .item-total {
      font-weight: 800;
      white-space: nowrap;
    }
    .tax-badge {
      font-size: 8px;
      font-weight: 800;
    }

    /* Grand Total Banner */
    .total-banner {
      border: 2px solid #000000;
      padding: 4px 6px;
      margin: 5px 0;
      background-color: #ffffff;
    }
    .total-label {
      font-size: 13px;
      font-weight: 900;
    }
    .total-amount {
      font-size: 15px;
      font-weight: 900;
    }

    /* Payment & Breakdown Boxes */
    .payment-box {
      margin-top: 4px;
      padding-top: 3px;
      border-top: 1px dashed #000000;
    }
    .payment-title {
      font-size: 9px;
      letter-spacing: 0.2px;
      margin-bottom: 2px;
    }

    .qr-container {
      margin: 6px 0 3px 0;
      text-align: center;
    }
    .barcode-container {
      margin-top: 6px;
      text-align: center;
    }
  </style>
</head>
<body>

  <!-- STORE BILINGUAL HEADER -->
  <div class="center title-large">${escapeHtml(shopName)}</div>
  ${cfg.showArabicHeader && shopNameAr ? `<div class="center title-arabic">${escapeHtml(shopNameAr)}</div>` : ''}
  <div class="center subtitle-tax">SIMPLIFIED TAX INVOICE / فاتورة ضريبية مبسطة</div>
  <div class="center" style="font-size: 8.5px; margin-top: 1px;">
    C.R. No: <strong>${escapeHtml(crNumber)}</strong> | س.ت: <strong>${escapeHtml(crNumber)}</strong>
  </div>
  <div class="center" style="font-size: 8.5px;">
    VAT TRN: <strong>${escapeHtml(vatNumber)}</strong>
  </div>
  <div class="center" style="font-size: 8px;">${escapeHtml(shopAddress)}</div>
  <div class="center" style="font-size: 8.5px; font-weight: 700;">Tel / WhatsApp: ${escapeHtml(shopPhone)}</div>

  ${props.isReprint ? `
  <div style="border: 1.5px solid #000; padding: 3px; margin: 5px 0; text-align: center; font-weight: 800; font-size: 11px;">
    *** DUPLICATE / REPRINT COPY ***<br/>
    <span style="font-size: 9.5px;">نسخة معاد طباعتها</span>
  </div>` : ''}

  <div class="divider-double"></div>

  <!-- INVOICE METADATA -->
  <div class="row">
    <span>Invoice / الفاتورة:</span>
    <span class="bold">${escapeHtml(invoiceNo)}</span>
  </div>
  <div class="row">
    <span>Date & Time / التاريخ:</span>
    <span>${escapeHtml(dateStr)}</span>
  </div>
  <div class="row">
    <span>Staff / الكاشير:</span>
    <span>${escapeHtml(staff)}</span>
  </div>
  <div class="row">
    <span>Payment / طريقة الدفع:</span>
    <span class="bold">${escapeHtml(paymentMode)}</span>
  </div>
  ${props.customerName ? `
  <div class="row">
    <span>Customer / العميل:</span>
    <span class="bold">${escapeHtml(props.customerName)}</span>
  </div>` : ''}

  <div class="divider"></div>

  <!-- ITEMS LIST -->
  <div class="row bold" style="font-size: 8.5px; letter-spacing: 0.2px; text-transform: uppercase;">
    <span>Item / الوصف</span>
    <span>Total (BD)</span>
  </div>
  <div class="divider"></div>

  ${itemsHtml}

  <div class="divider"></div>

  <!-- NBR VAT BREAKDOWN (ARTICLE 53 COMPLIANT) -->
  ${cfg.showVatBreakdown ? `
  <div class="row text-muted">
    <span>Standard Rated (10% Base):</span>
    <span>BD ${standardTaxableBase.toFixed(3)}</span>
  </div>
  <div class="row text-muted">
    <span>VAT Amount (10%):</span>
    <span>BD ${calculatedVat.toFixed(3)}</span>
  </div>
  ${zeroRatedBase > 0 ? `
  <div class="row text-muted">
    <span>Zero Rated (0% Base):</span>
    <span>BD ${zeroRatedBase.toFixed(3)}</span>
  </div>` : ''}
  <div class="row text-muted">
    <span>Subtotal Excl. VAT:</span>
    <span>BD ${calculatedSubtotal.toFixed(3)}</span>
  </div>
  <div class="divider"></div>
  ` : ''}

  <!-- PROMINENT GRAND TOTAL BANNER -->
  <div class="total-banner">
    <div class="row">
      <span class="total-label">TOTAL / المجموع:</span>
      <span class="total-amount">BD ${total.toFixed(3)}</span>
    </div>
    <div class="center text-muted" style="font-size: 7.5px; margin-top: 1px;">
      Inclusive of 10% VAT / شامل ضريبة القيمة المضافة
    </div>
  </div>

  <!-- PAYMENT SECTION -->
  ${paymentSectionHtml}

  <!-- TOTAL ITEMS COUNT -->
  <div class="center text-muted" style="margin-top: 5px; font-size: 8px;">
    Total Items: <strong>${totalItemCount}</strong> | Lines: <strong>${props.items?.length || 0}</strong>
  </div>

  <!-- NBR ARTICLE 53 OFFICIAL QR CODE -->
  ${cfg.showNbrQr && props.qrCodeDataUrl ? `
  <div class="qr-container">
    <img src="${props.qrCodeDataUrl}" style="width: 80px; height: 80px; display: block; margin: 0 auto;" alt="NBR VAT QR" />
    <div style="font-size: 7.5px; margin-top: 2px; font-weight: 800; letter-spacing: 0.3px;">
      BAHRAIN NBR SIMPLIFIED TAX INVOICE
    </div>
  </div>` : ''}

  <!-- KHATA LIVE STATEMENT & BENEFITPAY QR -->
  ${cfg.showKhataQr && props.khataQrDataUrl ? `
  <div class="divider"></div>
  <div class="center bold" style="margin-top: 3px; font-size: 8px;">LIVE KHATA STATEMENT & PAYMENT</div>
  <div class="qr-container" style="margin-top: 2px;">
    <img src="${props.khataQrDataUrl}" style="width: 72px; height: 72px; display: block; margin: 0 auto;" alt="Khata Tab" />
    <div style="font-size: 7.5px; margin-top: 2px;">Scan with phone to Pay via BenefitPay</div>
  </div>` : ''}

  <!-- RETURN BARCODE -->
  ${cfg.showReturnBarcode ? `
  <div class="barcode-container">
    <div class="divider"></div>
    <div style="font-size: 8px; font-weight: 700; margin-bottom: 2px;">SCAN TO RETURN ITEMS / باركود الإرجاع</div>
    ${barcodeImgHtml}
    <div style="font-size: 8.5px; margin-top: 1px; font-weight: 800;">${escapeHtml(invoiceNo)}</div>
  </div>` : ''}

  <!-- RETURN POLICY & FOOTER -->
  <div class="divider"></div>
  <div class="center bold" style="font-size: 9px; margin-top: 4px;">THANK YOU FOR SHOPPING!</div>
  <div class="center" style="font-size: 9px; font-weight: 700; direction: rtl;">شكراً لتسوقكم معنا!</div>
  <div class="center text-muted" style="margin-top: 3px; font-size: 7.5px; line-height: 1.2;">
    ${escapeHtml(cfg.footerPolicyEn)}<br/>
    <span style="direction: rtl;">${escapeHtml(cfg.footerPolicyAr)}</span>
  </div>

  <div style="height: ${cfg.feedLines * 3}mm;"></div>

</body>
</html>`;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
