import React, { useState } from 'react';
import { BookOpen, X, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { printKhataPaymentReceipt } from '../utils/printer';

interface AddCustomerBookBalanceModalProps {
  customer: {
    id: string;
    name: string;
    phone?: string | null;
    cardUid?: string | null;
    cpr?: string | null;
    balance?: number;
    currentBalance?: number;
  };
  onClose: () => void;
  apiBase?: string;
  onSuccess?: (updatedCustomer: any) => void;
  showToast?: (message: string, type: 'info' | 'success' | 'error') => void;
}

export const AddCustomerBookBalanceModal: React.FC<AddCustomerBookBalanceModalProps> = ({
  customer,
  onClose,
  apiBase: propApiBase,
  onSuccess,
  showToast
}) => {
  const [amount, setAmount] = useState<string>('');
  const [reference, setReference] = useState<string>('');
  const [managerPin, setManagerPin] = useState<string>('1234');
  const [printSlip, setPrintSlip] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const apiBase = propApiBase || (typeof window !== 'undefined' ? localStorage.getItem('master_server_url') || 'http://localhost:3000' : 'http://localhost:3000');
  const currentBalance = Number(customer.balance ?? customer.currentBalance ?? 0);
  const parsedAmount = parseFloat(amount || '0');
  const validAmount = !isNaN(parsedAmount) && parsedAmount > 0;
  const newBalance = Number((currentBalance + (validAmount ? parsedAmount : 0)).toFixed(3));

  const handleQuickAdd = (inc: number) => {
    const current = parseFloat(amount || '0') || 0;
    setAmount((current + inc).toFixed(3));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validAmount) {
      setErrorMessage('Please enter a valid amount greater than BD 0.000.');
      return;
    }

    if (parsedAmount > 500) {
      setErrorMessage('Book balance amount exceeds safety cap of BD 500.000.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const candidates = [
        apiBase,
        'http://localhost:3000',
        'http://192.168.8.7:3000',
        'https://askar-edge-api.layali-askar-pos.workers.dev'
      ].filter((val, idx, arr) => Boolean(val && val.trim()) && arr.indexOf(val) === idx);

      let success = false;
      let lastErr = 'Failed to connect to server';
      let resultData: any = null;

      for (const base of candidates) {
        const cleanBase = base.trim().replace(/\/$/, '');
        try {
          const res = await fetch(`${cleanBase}/api/khata/customers/${customer.id}/book-balance`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-pos-client': 'store-pos',
              'x-manager-pin': managerPin || '1234'
            },
            body: JSON.stringify({
              amount: parsedAmount,
              reference: reference.trim() || 'Previous Physical Book Balance',
              managerPin: managerPin || '1234'
            }),
            signal: AbortSignal.timeout(4500)
          });

          if (res.ok) {
            resultData = await res.json();
            if (resultData.success) {
              success = true;
              break;
            } else {
              lastErr = resultData.error || lastErr;
            }
          }
        } catch { }
      }

      if (success) {
        // Optional thermal slip printing
        if (printSlip) {
          try {
            await printKhataPaymentReceipt({
              shopName: 'LAYALI SUPERMARKET',
              customerName: `${customer.name} (Book Balance Added)`,
              amountPaid: parsedAmount,
              previousBalance: currentBalance,
              newBalance: newBalance,
              paymentMethod: 'PREVIOUS BOOK ENTRY',
              receiptNo: resultData?.ledgerId || `OB-${Date.now().toString().slice(-6)}`,
              timestamp: new Date().toISOString()
            });
          } catch (pErr) {
            console.warn('Printer notice:', pErr);
          }
        }

        const msg = `✅ Added BD ${parsedAmount.toFixed(3)} previous book balance to ${customer.name}. New balance: BD ${newBalance.toFixed(3)}`;
        showToast?.(msg, 'success');
        onSuccess?.(resultData?.customer || { ...customer, balance: newBalance });
        onClose();
      } else {
        setErrorMessage(lastErr);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Network error occurred while adding book balance.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-900 to-indigo-800 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-indigo-200">
              <BookOpen size={22} />
            </div>
            <div>
              <h3 className="font-black text-lg">Add Book Balance</h3>
              <p className="text-xs text-indigo-200 font-medium">Physical Ledger Migration to Khata</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Customer Identity Banner */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Customer</span>
            <span className="font-black text-slate-900 text-sm">{customer.name}</span>
            {customer.phone && <span className="text-xs text-slate-500 ml-2 font-mono">{customer.phone}</span>}
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Current Balance</span>
            <span className="font-mono font-black text-sm text-slate-800">BD {currentBalance.toFixed(3)}</span>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Amount Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
              Amount to Add (BD) *
            </label>
            <input
              type="number"
              step="0.001"
              min="0.001"
              max="500"
              required
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.000"
              className="w-full text-2xl font-black font-mono px-4 py-3 bg-white border-2 border-slate-300 rounded-2xl focus:border-indigo-600 focus:outline-none transition"
            />
            {/* Quick Increment Chips */}
            <div className="flex gap-2 mt-2">
              {[1, 5, 10, 20].map((inc) => (
                <button
                  type="button"
                  key={inc}
                  onClick={() => handleQuickAdd(inc)}
                  className="flex-1 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  +{inc} BD
                </button>
              ))}
            </div>
          </div>

          {/* Book Reference & Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
              Reference / Notebook Page
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. Page 14 Red Notebook, Carried Forward"
              className="w-full text-xs font-medium px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-indigo-600 focus:outline-none transition"
            />
          </div>

          {/* Manager PIN */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck size={14} className="text-indigo-600" />
              <span>Manager Authorization PIN</span>
            </label>
            <input
              type="password"
              maxLength={6}
              value={managerPin}
              onChange={(e) => setManagerPin(e.target.value)}
              placeholder="1234"
              className="w-full text-xs font-mono font-bold px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-indigo-600 focus:outline-none transition"
            />
          </div>

          {/* Impact Preview Card */}
          <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">New Updated Balance</span>
              <span className="text-xs text-indigo-900 font-medium">BD {currentBalance.toFixed(3)} + BD {(validAmount ? parsedAmount : 0).toFixed(3)}</span>
            </div>
            <span className="text-lg font-black font-mono text-indigo-900">
              BD {newBalance.toFixed(3)}
            </span>
          </div>

          {/* Thermal Slip Checkbox */}
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={printSlip}
              onChange={(e) => setPrintSlip(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
            />
            <span>Print 58mm verification slip for customer signature</span>
          </label>

          {/* Submit Actions */}
          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !validAmount}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black rounded-2xl shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <span>Adding...</span>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>Add to Account</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default AddCustomerBookBalanceModal;
