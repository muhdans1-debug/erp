import React, { useState } from 'react';
import { ShieldAlert, KeyRound } from 'lucide-react';
import { CreditLimitBlockedInfo } from '../types/pos';

export interface HardCreditLimitModalProps {
  info: CreditLimitBlockedInfo | null;
  onClose: () => void;
  onAuthorizeOverride: (pin: string) => boolean | Promise<boolean>;
  onOpenKhataHub: () => void;
}

export const HardCreditLimitModal: React.FC<HardCreditLimitModalProps> = ({
  info,
  onClose,
  onAuthorizeOverride,
  onOpenKhataHub,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!info) return null;

  const handleOverride = async () => {
    if (!pin.trim()) {
      setError('Manager PIN is required');
      return;
    }
    const success = await onAuthorizeOverride(pin.trim());
    if (!success) {
      setError('Invalid Manager PIN');
    } else {
      setPin('');
      setError(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border-2 border-red-500 w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-red-600 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              <ShieldAlert size={28} className="text-white animate-bounce" />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight leading-none text-white">
                Credit Limit Exceeded
              </h3>
              <p className="text-xs text-red-100 font-medium mt-1">
                POS Frozen: Customer tab exceeds authorized store credit limit
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-red-700 hover:bg-red-800 text-white flex items-center justify-center font-bold text-lg cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Customer & Debt Overview */}
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-black text-slate-800">
                {info.customer.name}
              </h4>
              {info.customer.phone && (
                <span className="text-xs font-mono text-slate-500">
                  📞 {info.customer.phone}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 mt-3">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Current Debt</span>
                <span className="text-base font-black font-mono text-slate-700">
                  BD {info.currentBalance.toFixed(3)}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">This Ring-Up</span>
                <span className="text-base font-black font-mono text-amber-600">
                  + BD {info.saleAmount.toFixed(3)}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Hard Limit</span>
                <span className="text-base font-black font-mono text-slate-800">
                  BD {info.creditLimit.toFixed(3)}
                </span>
              </div>
              <div className="bg-red-50 p-2.5 rounded-xl border border-red-200">
                <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider block">Projected Total</span>
                <span className="text-base font-black font-mono text-red-700">
                  BD {info.projectedBalance.toFixed(3)}
                </span>
              </div>
            </div>

            <div className="mt-3 py-2 px-3 bg-red-100/70 border border-red-300 rounded-xl flex items-center justify-between text-xs text-red-900 font-bold">
              <span>Exceeded Limit By:</span>
              <span className="font-mono text-sm font-black text-red-700">
                BD {info.exceededBy.toFixed(3)}
              </span>
            </div>
          </div>

          {/* Policy Callout */}
          <div className="text-xs text-slate-600 leading-relaxed bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
            <span className="text-base">⚠️</span>
            <span>
              <strong>Store Policy:</strong> Ask the customer to make a partial payment via BenefitPay/Cash to lower their balance before releasing groceries, or enter Manager PIN to override.
            </span>
          </div>

          {/* Manager PIN Input Form */}
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>Enter Manager PIN to Override</span>
              <span className="text-[10px] font-normal text-slate-400">Default PIN: 9999</span>
            </label>
            <div className="relative">
              <input
                type="password"
                inputMode="numeric"
                autoFocus
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleOverride();
                  }
                }}
                placeholder="Enter 4-digit PIN..."
                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-300 rounded-xl font-mono text-center text-xl tracking-widest outline-none focus:border-red-500 focus:bg-white transition-all"
              />
            </div>
            {error && (
              <p className="text-xs font-bold text-red-600 animate-shake">
                ❌ {error}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={handleOverride}
              className="py-3.5 px-4 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black rounded-xl text-sm transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
            >
              <KeyRound size={16} />
              <span>Authorize Override</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenKhataHub();
              }}
              className="py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black rounded-xl text-sm transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>Collect Payment 💳</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 text-slate-500 hover:text-slate-800 text-xs font-bold hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            Cancel / Switch Payment Method
          </button>
        </div>
      </div>
    </div>
  );
};

export default HardCreditLimitModal;

