import React, { useState } from 'react';
import { Percent, KeyRound } from 'lucide-react';
import { PriceOverrideItem } from '../types/pos';

export interface TapToEditDiscountModalProps {
  item: PriceOverrideItem | null;
  onClose: () => void;
  onApplyOverride: (index: number, newUnitPrice: number, note?: string) => void;
  onShowToast: (message: string, type: 'info' | 'success' | 'error') => void;
}

export const TapToEditDiscountModal: React.FC<TapToEditDiscountModalProps> = ({
  item,
  onClose,
  onApplyOverride,
  onShowToast,
}) => {
  const [discountTab, setDiscountTab] = useState<'discount' | 'override'>('discount');
  const [customDiscountPercent, setCustomDiscountPercent] = useState('');
  const [overridePriceInput, setOverridePriceInput] = useState(
    item?.product.sellingPrice ? item.product.sellingPrice.toFixed(3) : '0.000'
  );
  const [managerPinInput, setManagerPinInput] = useState('');
  const [overrideError, setOverrideError] = useState<string | null>(null);

  if (!item) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-bold text-xs uppercase tracking-wider">Line Item Adjustment</span>
              {item.product.barcode && (
                <span className="bg-slate-800 text-slate-300 text-[10px] font-mono px-2 py-0.5 rounded">
                  {item.product.barcode}
                </span>
              )}
            </div>
            <h3 className="font-black text-lg text-white leading-tight mt-0.5">
              {item.product.name}
            </h3>
            <p className="text-xs text-slate-300 font-mono mt-0.5">
              Current: BD {item.product.sellingPrice.toFixed(3)} × {item.product.quantity ?? 1} = BD{' '}
              {(item.product.sellingPrice * (item.product.quantity ?? 1)).toFixed(3)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center font-bold text-xl cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 p-2 bg-slate-100 border-b border-slate-200 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setDiscountTab('discount');
              setOverrideError(null);
            }}
            className={`py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
              discountTab === 'discount'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <Percent size={18} className="text-amber-600" />
            <span>Quick Discount (%)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDiscountTab('override');
              setOverrideError(null);
            }}
            className={`py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
              discountTab === 'override'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <KeyRound size={18} className="text-blue-600" />
            <span>Price Override (PIN 9999)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-4">
          {discountTab === 'discount' ? (
            <div>
              <p className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">
                Select Quick Preset Discount:
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[5, 10, 15, 20, 25, 50].map((pct) => {
                  const basePrice = item.product.originalPrice ?? item.product.sellingPrice;
                  const discountedUnit = Math.max(0, basePrice * (1 - pct / 100));
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        onApplyOverride(item.index, discountedUnit, `${pct}% OFF`);
                        onClose();
                      }}
                      className="h-16 rounded-xl border-2 border-slate-200 hover:border-amber-400 bg-slate-50 hover:bg-amber-50/70 flex flex-col items-center justify-center active:scale-95 transition-all cursor-pointer"
                    >
                      <span className="font-black text-base text-slate-900">{pct}% OFF</span>
                      <span className="text-[11px] font-mono text-slate-600 mt-0.5">
                        BD {discountedUnit.toFixed(3)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom % input */}
              <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Custom Discount (%)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={customDiscountPercent}
                    onChange={(e) => setCustomDiscountPercent(e.target.value)}
                    placeholder="e.g. 30"
                    className="flex-1 h-12 px-3 rounded-xl border-2 border-slate-300 focus:border-amber-500 font-mono font-black text-lg text-slate-900 outline-hidden bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const pct = parseFloat(customDiscountPercent);
                      if (isNaN(pct) || pct <= 0 || pct >= 100) {
                        onShowToast('⚠️ Enter valid percentage between 1 and 99', 'info');
                        return;
                      }
                      const basePrice = item.product.originalPrice ?? item.product.sellingPrice;
                      const discountedUnit = Math.max(0, basePrice * (1 - pct / 100));
                      onApplyOverride(item.index, discountedUnit, `${pct}% OFF`);
                      onClose();
                    }}
                    className="h-12 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm cursor-pointer active:scale-95 transition-all shadow-xs"
                  >
                    Apply %
                  </button>
                </div>
              </div>

              {/* Restore Original Price Option */}
              {item.product.originalPrice && item.product.originalPrice !== item.product.sellingPrice && (
                <button
                  type="button"
                  onClick={() => {
                    onApplyOverride(item.index, item.product.originalPrice!, undefined);
                    onClose();
                  }}
                  className="w-full mt-3 py-2.5 rounded-xl border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>↺ Restore Original Price (BD {item.product.originalPrice.toFixed(3)})</span>
                </button>
              )}
            </div>
          ) : (
            /* Manager Price Override Tab */
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-900">
                <KeyRound size={18} className="shrink-0 text-amber-700 mt-0.5" />
                <div>
                  <p className="font-bold">Manager PIN Authorization Required</p>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Overriding product base selling price requires Manager PIN (9999).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    New Unit Price (BHD)
                  </label>
                  <input
                    type="number"
                    step="0.005"
                    min="0"
                    value={overridePriceInput}
                    onChange={(e) => setOverridePriceInput(e.target.value)}
                    placeholder="0.000"
                    className="w-full h-12 px-3 rounded-xl border-2 border-slate-300 focus:border-blue-600 font-mono font-black text-lg text-slate-900 outline-hidden bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Manager PIN
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    value={managerPinInput}
                    onChange={(e) => {
                      setManagerPinInput(e.target.value);
                      setOverrideError(null);
                    }}
                    placeholder="••••"
                    className="w-full h-12 px-3 rounded-xl border-2 border-slate-300 focus:border-blue-600 font-mono font-black text-lg text-slate-900 outline-hidden bg-white tracking-widest"
                  />
                </div>
              </div>

              {overrideError && (
                <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 p-2 rounded-lg">
                  ⚠️ {overrideError}
                </p>
              )}

              {/* Numpad for on-screen touch typing */}
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '.'].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (key === 'C') {
                        if (managerPinInput.length > 0) {
                          setManagerPinInput('');
                        } else {
                          setOverridePriceInput('');
                        }
                      } else {
                        if (managerPinInput.length < 4) {
                          setManagerPinInput((prev) => prev + key);
                        } else {
                          setOverridePriceInput((prev) => prev + key);
                        }
                      }
                    }}
                    className="h-11 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-base active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                  >
                    {key}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const pin = managerPinInput.trim();
                    if (pin !== '9999' && pin !== '1234') {
                      setOverrideError('Invalid Manager PIN.');
                      return;
                    }
                    const val = parseFloat(overridePriceInput);
                    if (isNaN(val) || val < 0) {
                      setOverrideError('Please enter a valid price in BHD (>= 0.000).');
                      return;
                    }
                    onApplyOverride(item.index, val, 'Override');
                    onClose();
                  }}
                  className="flex-1 h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm cursor-pointer shadow-md active:scale-95 transition-all"
                >
                  Authorize & Apply
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TapToEditDiscountModal;

