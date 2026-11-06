/**
 * NBR-Compliant Heavy Monospaced Receipt Generator (Nesto / NBB Professional Retail Style)
 * Enforces:
 * 1. Heavy sans-serif monospaced font ('Roboto Mono', Consolas, monospace)
 * 2. Strict Left / Right justification via Flexbox (space-between)
 * 3. Prominent 1.5x larger TOTAL amount (font-size: 16px, font-weight: 700)
 * 4. Pure black ink (#000000) with font-weight: 600/700
 * 5. Clean dashed single dividers (border-top: 1px dashed #000)
 */

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
  vatNumber?: string;
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
}

export function generateNBRReceiptHtml(props: ReceiptTemplateProps): string {
  const invoiceNo = props.invoiceNo || 'INV-000000';
  const shopName = props.shopName || 'ASKAR SUPERMARKET';
  const shopNameAr = props.shopNameAr || 'أسكار سوبر ماركت';
  const vatNumber = props.vatNumber || '200012345678901';
  const shopPhone = props.shopPhone || '+973 1700 0000';
  const staff = props.staffName || 'Register 01';
  const paymentMode = (props.paymentMode || 'CASH').toUpperCase();
  const dateStr = props.dateStr || new Date().toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });

  const total = Number(props.total || 0);
  const subtotal = props.subtotal !== undefined
    ? Number(props.subtotal)
    : (props.vat !== undefined ? total - props.vat : Number((total / 1.1).toFixed(3)));
  const vat = props.vat !== undefined
    ? Number(props.vat)
    : Number((total - subtotal).toFixed(3));

  const itemsHtml = (props.items || []).map(item => {
    const qty = Number(item.qty || 1);
    const unitPrice = Number(item.price || 0);
    const lineAmt = (unitPrice * qty).toFixed(3);
    const isTaxable = item.vatRate === 10 || (item.vatRate === undefined && item.taxRate !== 0);
    const vatIndicator = isTaxable ? ' *' : '';
    const qtyDisplay = item.is_weighed_item ? `${qty.toFixed(3)}kg` : String(qty);

    return `  <div class="item-row">
    <div class="item-name">${item.name}${vatIndicator}</div>
    <div class="item-qty">${qtyDisplay}</div>
    <div class="item-amt">${lineAmt}</div>
  </div>`;
  }).join('\n');

  let paymentSectionHtml = '';
  if (paymentMode === 'CASH') {
    const tendered = props.cashTendered !== undefined ? Number(props.cashTendered) : total;
    const change = props.changeDue !== undefined ? Number(props.changeDue) : (tendered > total ? tendered - total : 0);
    paymentSectionHtml = `  <div class="center bold" style="margin-top: 10px;">
    *** PAID VIA CASH ***
  </div>
  
  <div class="row" style="margin-top: 5px;">
    <span>Cash Tendered:</span> <span>BD ${tendered.toFixed(3)}</span>
  </div>
  <div class="row">
    <span>Change:</span> <span>BD ${change.toFixed(3)}</span>
  </div>`;
  } else if (paymentMode === 'BENEFIT_PAY') {
    paymentSectionHtml = `  <div class="center bold" style="margin-top: 10px;">
    *** PAID VIA BENEFITPAY ***
  </div>
  
  <div class="row" style="margin-top: 5px;">
    <span>Method:</span> <span>Fawri+ QR</span>
  </div>${props.transactionRef ? `\n  <div class="row"><span>Ref No:</span> <span>${props.transactionRef}</span></div>` : ''}`;
  } else if (paymentMode === 'CARD') {
    paymentSectionHtml = `  <div class="center bold" style="margin-top: 10px;">
    *** PAID VIA CARD ***
  </div>
  
  <div class="row" style="margin-top: 5px;">
    <span>Terminal:</span> <span>POS Contactless EMV</span>
  </div>`;
  } else {
    paymentSectionHtml = `  <div class="center bold" style="margin-top: 10px;">
    *** ${paymentMode} ***
  </div>${props.customerName ? `\n  <div class="row" style="margin-top: 5px;"><span>Customer:</span> <span>${props.customerName}</span></div>` : ''}`;
  }

  const barcodeImgHtml = props.barcodeDataUrl
    ? `<img src="${props.barcodeDataUrl}" style="width: 80%; max-height: 40px; display: block; margin: 0 auto;" alt="Barcode" />`
    : `<div style="font-family: monospace; letter-spacing: 2px; font-weight: 700; font-size: 13px;">|||| | ||||| |||| || |||||||</div>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    /* Import a thick, professional POS font */
    @import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@600;700&display=swap');

    body {
      font-family: 'Roboto Mono', Consolas, "Courier New", monospace;
      font-weight: 600; /* Makes it thick and readable like Nesto */
      color: #000000;
      width: 58mm; /* Standard Sunmi thermal width */
      margin: 0 auto;
      padding: 0;
      font-size: 12px;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .center { text-align: center; }
    .bold { font-weight: 700; }
    .large { font-size: 16px; }
    
    /* Strict Left/Right Alignment */
    .row {
      display: flex;
      justify-content: space-between;
      width: 100%;
    }

    .divider {
      border-top: 1px dashed #000;
      margin: 8px 0;
    }

    /* Item Grid: Name (Left), Qty (Center), Amt (Right) */
    .item-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .item-name { width: 50%; text-align: left; word-break: break-word; }
    .item-qty { width: 20%; text-align: center; }
    .item-amt { width: 30%; text-align: right; }

    .barcode-container {
      margin-top: 15px;
      text-align: center;
    }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="center bold large">${shopName}</div>
  <div class="center bold">${shopNameAr}</div>
  <div class="center">Simplified Tax Invoice</div>
  <div class="center">VAT No: ${vatNumber}</div>
  <div class="center">Tel: ${shopPhone}</div>
  
  <div class="divider"></div>

  <!-- META INFO (Strict Alignment) -->
  <div class="row"><span>Inv:</span> <span>${invoiceNo}</span></div>
  <div class="row"><span>Date:</span> <span>${dateStr}</span></div>
  <div class="row"><span>Staff:</span> <span>${staff}</span></div>
  <div class="row"><span>Mode:</span> <span>${paymentMode}</span></div>

  <div class="divider"></div>

  <!-- ITEMS HEADER -->
  <div class="item-row bold">
    <div class="item-name">Item</div>
    <div class="item-qty">Qty</div>
    <div class="item-amt">Amt(BD)</div>
  </div>
  
  <div class="divider"></div>

  <!-- ITEMS LIST -->
${itemsHtml}

  <div class="divider"></div>

  <!-- TOTALS -->
  <div class="row"><span>Subtotal:</span> <span>BD ${subtotal.toFixed(3)}</span></div>
  <div class="row"><span>VAT (10%):</span> <span>BD ${vat.toFixed(3)}</span></div>
  
  <!-- Highlighted Total -->
  <div class="divider"></div>
  <div class="row bold large">
    <span>TOTAL:</span> 
    <span>BD ${total.toFixed(3)}</span>
  </div>
  <div class="divider"></div>

${paymentSectionHtml}

  <!-- FOOTER & BARCODE -->
  <div class="barcode-container">
    ${barcodeImgHtml}
    <div style="font-size: 10px; margin-top: 4px; font-weight: 700;">${invoiceNo}</div>
  </div>

  <div class="center" style="margin-top: 10px; font-size: 10px;">
    * Item includes 10% VAT<br>
    Thank You For Shopping!<br>
    Please retain invoice for returns.
  </div>

</body>
</html>`;
}
