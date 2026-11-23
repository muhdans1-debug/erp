import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Printer, Share2, Store, CheckCircle2, ShieldCheck, Calendar, Clock, User, Hash } from 'lucide-react';
import { generateNbrTlvBase64 } from '../utils/nbrQr';

export default function ReceiptModal({ isOpen, onClose, invoice, lang = 'en' }) {
  if (!isOpen || !invoice) return null;

  const isRtl = lang === 'ar';
  const invoiceNo = invoice.invoiceNo || invoice.id || 'INV-000000';
  const total = Number(invoice.total || invoice.totalAmount || 0);
  const subtotal = Number(invoice.subtotal || (total > 0 ? (total / 1.10).toFixed(3) : 0));
  const vat = Number(invoice.totalVat || invoice.vatTotal || (total - subtotal).toFixed(3));
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const cashierName = invoice.cashierName || invoice.employeeId || 'Register 01';
  const terminalId = invoice.terminalId || 'T1';
  const customerName = invoice.customerName || invoice.name || 'Valued Customer';
  const paymentType = invoice.paymentType || invoice.paymentMode || 'STORE CREDIT (KHATA)';
  const dateStr = invoice.createdAt || invoice.timestamp || new Date().toISOString();

  let formattedDate = '';
  let formattedTime = '';
  try {
    const d = new Date(dateStr);
    formattedDate = d.toLocaleDateString(lang === 'ar' ? 'ar-BH' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    formattedTime = d.toLocaleTimeString(lang === 'ar' ? 'ar-BH' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    formattedDate = dateStr;
  }

  // Generate compliant Bahrain NBR Article 53 TLV Base64 payload for simplified tax invoices
  const qrPayload = generateNbrTlvBase64({
    sellerName: 'Layali Supermarket W.L.L.',
    vatNumber: '200000000000002',
    timestamp: dateStr,
    total,
    vatAmount: vat
  });

  const handlePrint = () => {
    window.print();
  };

  const handleShareWhatsApp = () => {
    let itemsList = items.map((it, idx) => 
      `${idx + 1}. ${it.name || 'Item'} (x${it.quantity ?? it.qty ?? 1}) - BHD ${Number(it.total ?? (Number(it.price || 0) * Number(it.quantity || 1))).toFixed(3)}`
    ).join('\n');

    const message = 
      `🧾 *LAYALI SUPERMARKET - TAX RECEIPT*\n` +
      `فاتورة ضريبية مبسطة\n` +
      `--------------------------------\n` +
      `*Invoice #:* ${invoiceNo}\n` +
      `*Date:* ${formattedDate} ${formattedTime}\n` +
      `*Customer:* ${customerName}\n` +
      `*Payment:* ${paymentType}\n` +
      `--------------------------------\n` +
      `*Purchased Items:*\n${itemsList || '1. Grocery Purchase - BHD ' + total.toFixed(3)}\n` +
      `--------------------------------\n` +
      `*Subtotal (Excl. VAT):* BHD ${subtotal.toFixed(3)}\n` +
      `*VAT (10%):* BHD ${vat.toFixed(3)}\n` +
      `*Grand Total:* BHD ${total.toFixed(3)}\n` +
      `--------------------------------\n` +
      `CR: 12345-1 | VAT: 200000000000002\n` +
      `Thank you for shopping with us! شكراً لتسوقكم معنا`;

    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 text-left" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative my-auto animate-in zoom-in-95 duration-200">
        {/* Modal Top Actions */}
        <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              {isRtl ? 'فاتورة ضريبية مبسطة' : 'Simplified Tax Invoice'}
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrint}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition cursor-pointer"
              title="Print Receipt"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="p-2 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 transition cursor-pointer"
              title="Share on WhatsApp"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Paper Container */}
        <div id="printable-tax-receipt" className="p-5 sm:p-6 text-slate-200 text-xs font-sans space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Supermarket Header */}
          <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-700">
            <h2 className="text-base font-black text-white tracking-wider">LAYALI SUPERMARKET</h2>
            <h3 className="text-sm font-bold text-emerald-400 font-sans">أسواق ليالي المركزية</h3>
            <p className="text-[10px] text-slate-400">Block 951, Askar, Kingdom of Bahrain</p>
            <p className="text-[10px] text-slate-400 font-mono">Tel: +973 17700000 • CR: 12345-1</p>
            <div className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-400">
              VAT ID: 200000000000002
            </div>
          </div>

          {/* Invoice Metadata */}
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
            <div>
              <span className="text-slate-500 block text-[9px] uppercase">Invoice No</span>
              <span className="font-bold text-white break-all">{invoiceNo}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-500 block text-[9px] uppercase">Payment Mode</span>
              <span className="font-bold text-emerald-400">{paymentType}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[9px] uppercase">Date & Time</span>
              <span className="text-slate-300">{formattedDate} {formattedTime}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-500 block text-[9px] uppercase">Terminal / Cashier</span>
              <span className="text-slate-300">{terminalId} • {cashierName}</span>
            </div>
            <div className="col-span-2 pt-1 border-t border-slate-800">
              <span className="text-slate-500 block text-[9px] uppercase">Customer / الحساب</span>
              <span className="font-bold text-white">{customerName}</span>
            </div>
          </div>

          {/* Itemized Table */}
          <div>
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-1.5 border-b border-slate-800">
              <span>Item Description / الصنف</span>
              <div className="flex items-center gap-4">
                <span>Qty</span>
                <span>Total</span>
              </div>
            </div>

            <div className="divide-y divide-slate-800/60">
              {items.map((item, idx) => {
                const qty = Number(item.quantity ?? item.qty ?? 1);
                const price = Number(item.price ?? item.priceAtSale ?? item.sellingPrice ?? 0);
                const lineTotal = Number(item.total ?? item.total_price ?? (qty * price));
                const isWeighed = Boolean(item.is_weighed_item);

                return (
                  <div key={item.id || idx} className="py-2 flex items-start justify-between gap-2">
                    <div className="min-w-0 pr-2">
                      <p className="font-bold text-slate-100 text-xs">
                        {item.name || 'Store Item'}
                      </p>
                      {item.nameAr && (
                        <p className="text-[10px] text-slate-400 font-sans">{item.nameAr}</p>
                      )}
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {isWeighed ? `${qty.toFixed(3)} kg` : `${qty} pc`} @ BHD {price.toFixed(3)} (10% VAT)
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-xs text-white">
                        BHD {lineTotal.toFixed(3)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Totals & Tax Breakdown */}
          <div className="pt-2 border-t-2 border-slate-800 space-y-1.5 font-mono text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span>Subtotal (Excl. VAT)</span>
              <span>BHD {subtotal.toFixed(3)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Standard VAT (10%)</span>
              <span>BHD {vat.toFixed(3)}</span>
            </div>
            <div className="flex items-center justify-between text-base font-black text-emerald-400 pt-2 border-t border-slate-800">
              <span className="font-sans">Grand Total (شامل الضريبة)</span>
              <span>BHD {total.toFixed(3)}</span>
            </div>
          </div>

          {/* QR Code & Footer */}
          <div className="pt-3 border-t border-dashed border-slate-700 flex flex-col items-center justify-center text-center space-y-2">
            <div className="p-2.5 bg-white rounded-2xl shadow-md inline-block">
              <QRCodeSVG
                value={qrPayload}
                size={110}
                level="M"
                includeMargin={false}
              />
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              Simplified Tax Invoice • National Bureau for Revenue (NBR) Compliant
            </p>
            <p className="text-[9px] text-slate-500 font-mono">
              Thank you for choosing Layali Supermarket!
            </p>
          </div>
        </div>

        {/* Modal Bottom Bar */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center gap-2 no-print">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-2xl transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/50"
          >
            <Printer className="w-4 h-4" />
            <span>Print Thermal Slip</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs rounded-2xl transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
