import React from 'react';
import { Printer, CheckCircle2, X } from 'lucide-react';
import type { ReceiptData } from '../utils/escpos';

interface ReceiptModalProps {
  receipt: ReceiptData | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
  if (!receipt) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 text-slate-100 shadow-2xl">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 size={18} />
            <span className="font-bold text-sm text-white">Payment Successful</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Paper Receipt Simulation */}
        <div id="thermal-receipt" className="bg-white text-black p-4 rounded font-mono text-[11px] leading-tight shadow-inner space-y-2 select-text">
          <div className="text-center font-bold text-xs uppercase tracking-wide">
            {receipt.storeName}
          </div>
          <div className="text-center text-[10px] text-gray-600">
            {receipt.storeAddress}<br />
            Tel: {receipt.phone}
          </div>
          <div className="border-b border-dashed border-gray-400 my-1"></div>

          <div className="text-[10px]">
            <div>Order: #{receipt.orderId.slice(0, 8).toUpperCase()}</div>
            <div>Date: {receipt.date}</div>
            <div>Cashier: {receipt.cashierName}</div>
            <div>Method: {receipt.paymentMethod}</div>
          </div>
          <div className="border-b border-dashed border-gray-400 my-1"></div>

          {/* Items */}
          <div className="space-y-1">
            {receipt.items.map((it, idx) => (
              <div key={idx} className="flex justify-between">
                <span>{it.name.slice(0, 16)} × {it.qty}</span>
                <span>${it.lineTotal.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="border-b border-dashed border-gray-400 my-1"></div>

          {/* Calculations */}
          <div className="space-y-0.5 text-right">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>${receipt.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax (5%):</span>
              <span>${receipt.tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-xs pt-1 border-t border-gray-300">
              <span>TOTAL:</span>
              <span>${receipt.grandTotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="border-b border-dashed border-gray-400 my-1"></div>
          <div className="text-center text-[9px] text-gray-500 pt-1">
            Thank you for shopping with us!
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
          >
            Done (New Order)
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5"
          >
            <Printer size={15} /> Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
};