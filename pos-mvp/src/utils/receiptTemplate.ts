/**
 * Enterprise NBR-Compliant Thermal Receipt Generator (Bahrain Retail Standard)
 * Designed for Layali Supermarket with Sunmi D2mini & 80mm thermal hardware support.
 * 
 * Features:
 * 1. Compact Professional layout: Paper-saving, ultra-clean, sleek typography.
 * 2. Official Ministry of Industry and Commerce C.R. No. and NBR VAT TRN registration.
 * 3. Smart single-line item rendering (with sub-qty only when multiple or weighed).
 * 4. Consolidated Subtotal & 10% VAT line.
 * 5. High-visibility clean Grand Total banner.
 * 6. Compact payment and Khata credit ledger summary.
 * 7. Official Article 53 TLV Base64 QR code (sharp, fast-scanning).
 * 8. Configurable via Sunmi Printer Style Settings.
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
  customerCardUid?: string;
  previousBalance?: number;
  newBalance?: number;
  personalBalance?: number;
  messBalance?: number;
  hasMessGroup?: boolean;
  isMess?: boolean;
  groupName?: string;
  shopperName?: string;
  members?: any[];
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

  const isCompact = cfg.receiptTheme === 'compact_quick' || cfg.fontSize === 'compact';
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
  let baseFontSize = '9px';
  if (cfg.fontSize === 'compact') baseFontSize = is80mm ? '10px' : '8.5px';
  else if (cfg.fontSize === 'large') baseFontSize = is80mm ? '12.5px' : '10.5px';
  else baseFontSize = is80mm ? '11px' : '9px';

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
    const qtyDisplay = isScale ? `${qty.toFixed(3)} kg` : `${qty}x`;
    const hasSubQty = isScale || qty > 1;

    return `
    <div class="item-block">
      <div class="row">
        <span class="item-name">${idx + 1}. ${escapeHtml(item.name)} <span class="tax-badge">[${vatTag}]</span></span>
        <span class="item-total">BD ${lineAmt.toFixed(3)}</span>
      </div>
      ${hasSubQty ? `
      <div class="row text-muted" style="font-size: 8px;">
        <span class="item-rate">&nbsp;&nbsp;${qtyDisplay} @ BD ${unitPrice.toFixed(3)}</span>
      </div>` : ''}
      ${cfg.showArabicItems && item.nameAr ? `<div class="item-arabic">${escapeHtml(item.nameAr)}</div>` : ''}
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
    <div class="row text-muted" style="margin-top: 2px;">
      <span>Paid (CASH): BD ${tendered.toFixed(3)}</span>
      <span>Change: <strong style="color:#000;">BD ${change.toFixed(3)}</strong></span>
    </div>`;
  } else if (paymentMode === 'BENEFIT_PAY') {
    const bCfg = getStoredBenefitPayConfig();
    const payeeIdent = bCfg.accountType === 'MOBILE_FAWRI' ? `Tel: ${bCfg.mobileNumber || ''}` : `MID: ${bCfg.merchantId || ''}`;
    paymentSectionHtml = `
    <div class="row text-muted" style="margin-top: 2px;">
      <span>BenefitPay Fawri+</span>
      <span>${props.transactionRef ? `Ref: ${props.transactionRef}` : payeeIdent}</span>
    </div>`;
  } else if (paymentMode === 'CARD') {
    paymentSectionHtml = `
    <div class="row text-muted" style="margin-top: 2px;">
      <span>Card Terminal</span>
      <span>POS EMV Contactless</span>
    </div>`;
  } else if (paymentMode === 'CREDIT' || paymentMode === 'KHATA' || paymentMode === 'CREDIT_PERSONAL') {
    const prevDebt = Number(props.previousBalance || 0);
    const finalBalance = props.newBalance !== undefined 
      ? Number(props.newBalance) 
      : (prevDebt + total);

    const hasDualBalance = props.personalBalance !== undefined && props.messBalance !== undefined && props.messBalance > 0.001;
    const isPersonalWallet = paymentMode === 'CREDIT_PERSONAL' || Boolean(props.hasMessGroup || (props.messBalance && Number(props.messBalance) > 0));

    if (isCompact && !cfg.showCreditBalanceBox) {
      paymentSectionHtml = `
      <div class="khata-compact-box">
        <div class="row">
          <span>Customer: <strong>${escapeHtml(props.customerName || 'Customer')}</strong></span>
          <span>${prevDebt <= 0.0001 ? 'Prev: BD 0.000 (PAID)' : `Prev: BD ${prevDebt.toFixed(3)}`}</span>
        </div>
        ${hasDualBalance ? `
        <div class="row text-muted" style="font-size: 8px;">
          <span>Personal: BD ${Number(props.personalBalance).toFixed(3)}</span>
          <span>Mess: BD ${Number(props.messBalance).toFixed(3)}</span>
        </div>` : ''}
        <div class="row bold" style="font-size: 10px; margin-top: 1px;">
          <span>${isPersonalWallet ? 'PERSONAL DUE / المستحق:' : 'BALANCE DUE / المستحق:'}</span>
          <span>BD ${finalBalance.toFixed(3)}</span>
        </div>
      </div>`;
    } else {
      paymentSectionHtml = `
      <div class="khata-balance-banner">
        <div class="center bold khata-title">${isPersonalWallet ? '*** PERSONAL KHATA TAB / حساب الآجل الشخصي ***' : '*** KHATA CREDIT ACCOUNT / حساب الآجل ***'}</div>
        ${props.customerName ? `
        <div class="row" style="margin-top: 2px;">
          <span>Customer:</span>
          <span class="bold">${escapeHtml(props.customerName)}</span>
        </div>` : ''}
        ${props.previousBalance !== undefined ? `
        <div class="row">
          <span>${isPersonalWallet ? 'Personal Prev Debt:' : 'Previous Debt:'}</span>
          <span>${prevDebt <= 0.0001 ? 'BD 0.000 (PAID / لا يوجد سابق)' : `BD ${prevDebt.toFixed(3)}`}</span>
        </div>` : ''}
        <div class="row">
          <span>This Bill:</span>
          <span>BD ${total.toFixed(3)}</span>
        </div>
        ${hasDualBalance ? `
        <div class="divider" style="margin: 2px 0;"></div>
        <div class="row text-muted" style="font-size: 8px;">
          <span>Personal Tab / الشخصي:</span>
          <span>BD ${Number(props.personalBalance).toFixed(3)}</span>
        </div>
        <div class="row text-muted" style="font-size: 8px;">
          <span>Mess Share / السكن:</span>
          <span>BD ${Number(props.messBalance).toFixed(3)}</span>
        </div>
        <div class="row text-muted" style="font-size: 8px;">
          <span>Combined Total Owed:</span>
          <span>BD ${(finalBalance + Number(props.messBalance)).toFixed(3)}</span>
        </div>` : ''}
        <div class="row bold" style="margin-top: 2px; font-size: 11px; border-top: 1px dashed #000; padding-top: 2px;">
          <span>${isPersonalWallet ? 'PERSONAL BALANCE DUE / المستحق:' : 'TOTAL DUE / المستحق:'}</span>
          <span>BD ${finalBalance.toFixed(3)}</span>
        </div>
      </div>`;
    }
  } else if (paymentMode === 'MESS_KHATA' || props.isMess) {
    const group = props.groupName || props.customerName || "Shared Mess";
    const prevDebt = Number(props.previousBalance || 0);
    const finalBalance = props.newBalance !== undefined 
      ? Number(props.newBalance) 
      : (prevDebt + total);

    const memCount = props.members?.length || 1;
    const splitPerHead = total / memCount;

    paymentSectionHtml = `
    <div class="khata-compact-box">
      <div class="row">
        <span>Mess: <strong>${escapeHtml(group)}</strong></span>
        <span>Workers: ${memCount}</span>
      </div>
      ${props.shopperName ? `
      <div class="row text-muted" style="font-size: 8px;">
        <span>Shopper: <strong>${escapeHtml(props.shopperName)}</strong></span>
        <span>Split: BD ${splitPerHead.toFixed(3)}/ea</span>
      </div>` : ''}
      <div class="row bold" style="font-size: 10px; margin-top: 1px;">
        <span>MESS TOTAL DUE / المستحق:</span>
        <span>BD ${finalBalance.toFixed(3)}</span>
      </div>
    </div>`;
  } else {
    paymentSectionHtml = `
    <div class="row text-muted" style="margin-top: 2px;">
      <span>Payment Mode:</span>
      <span class="bold">${paymentMode}</span>
    </div>`;
  }

  const barcodeImgHtml = props.barcodeDataUrl
    ? `<img src="${props.barcodeDataUrl}" style="width: 75%; max-height: 34px; display: block; margin: 0 auto;" alt="Barcode" />`
    : `<div style="font-family: monospace; letter-spacing: 2px; font-weight: 700; font-size: 12px;">|||| | ||||| |||| || |||||||</div>`;

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
      padding: ${isCompact ? '0.5mm 0.5mm' : '1.5mm 1mm'};
      font-size: ${baseFontSize};
      line-height: ${isCompact ? '1.18' : '1.25'};
      letter-spacing: -0.15px;
    }

    .center { text-align: center; }
    .bold { font-weight: 800; }
    .title-large {
      font-size: ${isCompact ? '12px' : '13.5px'};
      font-weight: 900;
      letter-spacing: 0.3px;
      margin-bottom: 1px;
    }
    .title-arabic {
      font-size: 11px;
      font-weight: 800;
      direction: rtl;
      margin-bottom: 1px;
    }
    
    /* Strict Left/Right Flex Alignment */
    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      width: 100%;
      margin: 0.5px 0;
    }

    .text-muted {
      color: #222222;
      font-size: 8px;
    }

    .divider {
      border-top: 1px dashed #000000;
      margin: ${isCompact ? '2px 0' : '3px 0'};
      width: 100%;
    }
    .divider-double {
      border-top: 1.5px solid #000000;
      margin: ${isCompact ? '2px 0' : '3.5px 0'};
      width: 100%;
    }

    /* Item Blocks */
    .item-block {
      margin-bottom: ${isCompact ? '1.5px' : '3px'};
      padding-bottom: 0;
    }
    .item-name {
      max-width: 72%;
      word-break: break-word;
      font-size: ${baseFontSize};
      font-weight: 700;
    }
    .item-arabic {
      font-size: 8px;
      direction: rtl;
      text-align: right;
      color: #222222;
    }
    .item-total {
      font-weight: 800;
      font-size: ${baseFontSize};
      white-space: nowrap;
    }
    .tax-badge {
      font-size: 7.5px;
      font-weight: 700;
    }

    /* Compact Total Row */
    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      width: 100%;
      padding: ${isCompact ? '2px 0' : '4px 0'};
      border-top: 1.5px solid #000000;
      border-bottom: 1.5px solid #000000;
      margin: ${isCompact ? '2px 0' : '4px 0'};
    }
    .total-label {
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.3px;
    }
    .total-amount {
      font-size: ${isCompact ? '14px' : '18px'};
      font-weight: 950;
      letter-spacing: 0.3px;
    }

    .khata-compact-box {
      border: 1px solid #000000;
      padding: 3px 4px;
      margin-top: 3px;
      background: #ffffff;
    }
    .khata-balance-banner {
      margin-top: 3px;
      padding: 4px;
      border: 1.5px solid #000000;
      background-color: #ffffff;
    }
    .khata-title {
      font-size: 9px;
      font-weight: 900;
      margin-bottom: 2px;
      text-transform: uppercase;
    }

    .qr-container {
      margin: 3px 0 1px 0;
      text-align: center;
    }
    .barcode-container {
      margin-top: 3px;
      text-align: center;
    }
  </style>
</head>
<body>

  <!-- STORE COMPACT HEADER -->
  <div class="center title-large">${escapeHtml(shopName)}</div>
  ${cfg.showArabicHeader && shopNameAr ? `<div class="center title-arabic">${escapeHtml(shopNameAr)}</div>` : ''}
  <div class="center text-muted">
    CR: <strong>${escapeHtml(crNumber)}</strong> | VAT: <strong>${escapeHtml(vatNumber)}</strong>
  </div>
  ${!isCompact && shopAddress ? `<div class="center text-muted" style="font-size: 7.5px;">${escapeHtml(shopAddress)}</div>` : ''}
  <div class="center text-muted">Tel: ${escapeHtml(shopPhone)}</div>

  ${props.isReprint ? `
  <div style="border: 1px solid #000; padding: 1.5px; margin: 3px 0; text-align: center; font-weight: 800; font-size: 9.5px;">
    *** DUPLICATE / REPRINT COPY ***
  </div>` : ''}

  <div class="divider-double"></div>

  <!-- INVOICE METADATA (COMPACT 2-COLUMN) -->
  <div class="row">
    <span>INV: <strong>${escapeHtml(invoiceNo)}</strong></span>
    <span>${escapeHtml(dateStr)}</span>
  </div>
  <div class="row text-muted">
    <span>Mode: <strong>${escapeHtml(paymentMode)}</strong></span>
    <span>Staff: ${escapeHtml(staff)}</span>
  </div>
  ${props.customerName ? `
  <div class="row">
    <span>Customer: <strong>${escapeHtml(props.customerName)}</strong></span>
  </div>` : ''}

  <div class="divider"></div>

  <!-- ITEMS LIST -->
  ${itemsHtml}

  <div class="divider"></div>

  <!-- NBR VAT SUMMARY (COMPACT CONSOLIDATED) -->
  ${cfg.showVatBreakdown ? `
  <div class="row text-muted">
    <span>Standard (10% Base):</span>
    <span>BD ${standardTaxableBase.toFixed(3)}</span>
  </div>
  <div class="row text-muted">
    <span>VAT (10%):</span>
    <span>BD ${calculatedVat.toFixed(3)}</span>
  </div>
  ${zeroRatedBase > 0 ? `
  <div class="row text-muted">
    <span>Zero-Rated (0% Base):</span>
    <span>BD ${zeroRatedBase.toFixed(3)}</span>
  </div>` : ''}
  <div class="row text-muted">
    <span>Subtotal Excl. VAT:</span>
    <span>BD ${calculatedSubtotal.toFixed(3)}</span>
  </div>
  ` : `
  <div class="row text-muted">
    <span>Subtotal: BD ${calculatedSubtotal.toFixed(3)}</span>
    <span>VAT (10%): BD ${calculatedVat.toFixed(3)}</span>
  </div>
  `}

  <!-- GRAND TOTAL -->
  <div class="total-row">
    <span class="total-label">TOTAL / المجموع:</span>
    <span class="total-amount">BD ${total.toFixed(3)}</span>
  </div>

  <!-- PAYMENT SECTION -->
  ${paymentSectionHtml}

  <!-- NBR ARTICLE 53 OFFICIAL QR CODE -->
  ${cfg.showNbrQr && props.qrCodeDataUrl ? `
  <div class="qr-container">
    <img src="${props.qrCodeDataUrl}" style="width: 58px; height: 58px; display: block; margin: 0 auto;" alt="NBR VAT QR" />
  </div>` : ''}

  <!-- KHATA LIVE STATEMENT QR (ONLY IF EXPLICITLY ENABLED) -->
  ${cfg.showKhataQr && props.khataQrDataUrl ? `
  <div class="divider"></div>
  <div class="qr-container">
    <img src="${props.khataQrDataUrl}" style="width: 54px; height: 54px; display: block; margin: 0 auto;" alt="Khata Tab" />
    <div style="font-size: 7px; margin-top: 1px;">BenefitPay Khata Tab</div>
  </div>` : ''}

  <!-- RETURN BARCODE (ONLY IF EXPLICITLY ENABLED) -->
  ${cfg.showReturnBarcode ? `
  <div class="barcode-container">
    <div class="divider"></div>
    ${barcodeImgHtml}
    <div style="font-size: 7.5px; font-weight: 700;">${escapeHtml(invoiceNo)}</div>
  </div>` : ''}

  <!-- COMPACT FOOTER -->
  <div class="divider"></div>
  <div class="center bold" style="font-size: 8px; margin-top: 2px;">Thank You! شكراً لزيارتكم</div>
  ${cfg.footerPolicyEn ? `
  <div class="center text-muted" style="font-size: 7px; margin-top: 1px;">
    ${escapeHtml(cfg.footerPolicyEn)}
  </div>` : ''}

  <div style="height: ${Math.max(1, cfg.feedLines || 1) * 2}mm;"></div>

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
