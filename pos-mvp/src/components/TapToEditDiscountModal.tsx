// pos-mvp/src/components/TapToEditDiscountModal.tsx
import React, { useState, useEffect } from 'react';
import { Percent, KeyRound, Tag, RotateCcw, Check, Delete, Trash2 } from 'lucide-react';
import { PriceOverrideItem } from '../types/pos';

export interface TapToEditDiscountModalProps {
  item: PriceOverrideItem | null;
  onClose: () => void;
  onApplyOverride: (indexOrId: number | string, newUnitPrice: number, note?: string) => void;
  onShowToast: (message: string, type: 'info' | 'success' | 'error') => void;
  onRemoveItem?: (indexOrId: number | string) => void;
}

export const TapToEditDiscountModal: React.FC<TapToEditDiscountModalProps> = ({
  item,
  onClose,
  onApplyOverride,
  onShowToast,
  onRemoveItem,
}) => {
  const [activeTab, setActiveTab] = useState<'percent' | 'amount' | 'override'>('percent');
  const [percentInput, setPercentInput] = useState<string>('10');
  const [amountInput, setAmountInput] = useState<string>('');
  const [overridePriceInput, setOverridePriceInput] = useState<string>('');
  const [managerPinInput, setManagerPinInput] = useState<string>('');
  const [overrideTargetField, setOverrideTargetField] = useState<'pin' | 'price'>('pin');
  const [overrideError, setOverrideError] = useState<string | null>(null);

  // Synchronize initial values whenever target item changes
  useEffect(() => {
    if (item?.product) {
      const curPrice = Number(item.product.price ?? (item.product as any).sellingPrice ?? 0);
      const origPrice = Number(item.product.originalPrice ?? curPrice);
      setOverridePriceInput(curPrice.toFixed(3));
      setManagerPinInput('');
      setOverrideError(null);
      setOverrideTargetField('pin');

      // If already discounted, extract existing percentage or amount if possible
      if (origPrice > curPrice && origPrice > 0) {
        const diff = origPrice - curPrice;
        const pct = Math.round((diff / origPrice) * 100);
        setPercentInput(String(pct));
        setAmountInput(diff.toFixed(3));
      } else {
        setPercentInput('10');
        setAmountInput('');
      }
    }
  }, [item]);

  if (!item) return null;

  const product = item.product;
  const qty = Number((product as any).qty ?? (product as any).quantity ?? 1);
  const currentPrice = Number(product.price ?? (product as any).sellingPrice ?? 0);
  const originalPrice = Number(product.originalPrice ?? currentPrice);
  const basePrice = originalPrice > 0 ? originalPrice : currentPrice;
  const isAlreadyDiscounted = originalPrice > currentPrice || Boolean(product.discountNote);

  // ─── Real-time Preview Calculations ───
  let previewUnitPrice = currentPrice;
  let previewDiscountNote = '';
  let previewSavings = 0;

  if (activeTab === 'percent') {
    const pct = parseFloat(percentInput);
    if (!isNaN(pct) && pct > 0 && pct < 100) {
      const discount = Number((basePrice * (pct / 100)).toFixed(3));
      previewUnitPrice = Math.max(0, Number((basePrice - discount).toFixed(3)));
      previewDiscountNote = `${pct}% OFF`;
      previewSavings = Number(((basePrice - previewUnitPrice) * qty).toFixed(3));
    } else {
      previewUnitPrice = basePrice;
    }
  } else if (activeTab === 'amount') {
    const amt = parseFloat(amountInput);
    if (!isNaN(amt) && amt > 0) {
      previewUnitPrice = Math.max(0, Number((basePrice - amt).toFixed(3)));
      previewDiscountNote = `BD ${amt.toFixed(3)} OFF`;
      previewSavings = Number(((basePrice - previewUnitPrice) * qty).toFixed(3));
    } else {
      previewUnitPrice = basePrice;
    }
  } else if (activeTab === 'override') {
    const ov = parseFloat(overridePriceInput);
    if (!isNaN(ov) && ov >= 0) {
      previewUnitPrice = Number(ov.toFixed(3));
      previewDiscountNote = 'Override';
      previewSavings = Number(((basePrice - previewUnitPrice) * qty).toFixed(3));
    }
  }

  const previewLineTotal = Number((previewUnitPrice * qty).toFixed(3));

  // ─── On-Screen Numpad Key Press Handler ───
  const handleKeypadPress = (key: string) => {
    if (activeTab === 'percent') {
      if (key === 'C') {
        setPercentInput('');
      } else if (key === 'BACK') {
        setPercentInput((prev) => prev.slice(0, -1));
      } else if (key === '.') {
        // Percentages usually whole numbers, ignore decimal or allow once
        if (!percentInput.includes('.')) setPercentInput((prev) => prev + '.');
      } else {
        if (percentInput.length < 2) {
          setPercentInput((prev) => prev + key);
        }
      }
    } else if (activeTab === 'amount') {
      if (key === 'C') {
        setAmountInput('');
      } else if (key === 'BACK') {
        setAmountInput((prev) => prev.slice(0, -1));
      } else if (key === '.') {
        if (!amountInput.includes('.')) setAmountInput((prev) => (prev || '0') + '.');
      } else {
        const parts = amountInput.split('.');
        if (parts.length === 2 && parts[1].length >= 3) return; // Max 3 decimals for BHD
        setAmountInput((prev) => prev + key);
      }
    } else if (activeTab === 'override') {
      if (overrideTargetField === 'pin') {
        if (key === 'C') {
          setManagerPinInput('');
        } else if (key === 'BACK') {
          setManagerPinInput((prev) => prev.slice(0, -1));
        } else if (key !== '.') {
          const next = managerPinInput + key;
          if (next.length <= 4) {
            setManagerPinInput(next);
            if (next.length === 4) {
              setOverrideTargetField('price');
            }
          }
        }
      } else {
        // Typing into new unit price
        if (key === 'C') {
          setOverridePriceInput('');
        } else if (key === 'BACK') {
          setOverridePriceInput((prev) => prev.slice(0, -1));
        } else if (key === '.') {
          if (!overridePriceInput.includes('.')) setOverridePriceInput((prev) => (prev || '0') + '.');
        } else {
          const parts = overridePriceInput.split('.');
          if (parts.length === 2 && parts[1].length >= 3) return;
          setOverridePriceInput((prev) => prev + key);
        }
      }
    }
  };

  // ─── Apply Discount / Override Action ───
  const handleApply = () => {
    if (activeTab === 'percent') {
      const pct = parseFloat(percentInput);
      if (isNaN(pct) || pct <= 0 || pct >= 100) {
        onShowToast('⚠️ Please enter a discount percentage between 1% and 99%', 'info');
        return;
      }
      const unit = Math.max(0, Number((basePrice * (1 - pct / 100)).toFixed(3)));
      onApplyOverride(item.index, unit, `${pct}% OFF`);
      onClose();
    } else if (activeTab === 'amount') {
      const amt = parseFloat(amountInput);
      if (isNaN(amt) || amt <= 0 || amt > basePrice) {
        onShowToast(`⚠️ Please enter an amount between BD 0.005 and BD ${basePrice.toFixed(3)}`, 'info');
        return;
      }
      const unit = Math.max(0, Number((basePrice - amt).toFixed(3)));
      onApplyOverride(item.index, unit, `BD ${amt.toFixed(3)} OFF`);
      onClose();
    } else if (activeTab === 'override') {
      const pin = managerPinInput.trim();
      if (pin !== '9999' && pin !== '1234') {
        setOverrideError('Invalid Manager PIN. (Default: 9999)');
        setOverrideTargetField('pin');
        return;
      }
      const val = parseFloat(overridePriceInput);
      if (isNaN(val) || val < 0) {
        setOverrideError('Enter a valid price in BHD (>= 0.000).');
        setOverrideTargetField('price');
        return;
      }
      onApplyOverride(item.index, Number(val.toFixed(3)), 'Override');
      onClose();
    }
  };

  // ─── Restore Original Price Action ───
  const handleRestore = () => {
    onApplyOverride(item.index, basePrice, undefined);
    onShowToast(`↺ Restored original price: BD ${basePrice.toFixed(3)}`, 'info');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-3">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-bold text-xs uppercase tracking-wider flex items-center gap-1">
                <Tag size={12} /> Product Discount & Price
              </span>
              {product.barcode && (
                <span className="bg-slate-800 text-slate-300 text-[10px] font-mono px-2 py-0.5 rounded">
                  {product.barcode}
                </span>
              )}
            </div>
            <h3 className="font-black text-lg text-white leading-tight mt-0.5 truncate">
              {product.name}
            </h3>
            <p className="text-xs text-slate-300 font-mono mt-0.5">
              Original: BD {basePrice.toFixed(3)} × {qty} = BD {(basePrice * qty).toFixed(3)}
              {isAlreadyDiscounted && (
                <span className="ml-2 text-amber-300 font-bold">
                  (Currently: BD {currentPrice.toFixed(3)})
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center font-bold text-xl cursor-pointer transition-colors shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-3 p-1.5 bg-slate-100 border-b border-slate-200 gap-1 text-xs">
          <button
            type="button"
            onClick={() => {
              setActiveTab('percent');
              setOverrideError(null);
            }}
            className={`py-2.5 rounded-xl font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'percent'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <Percent size={15} className="text-amber-600" />
            <span>% Discount</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('amount');
              setOverrideError(null);
            }}
            className={`py-2.5 rounded-xl font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'amount'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <Tag size={15} className="text-emerald-600" />
            <span>BD Off</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('override');
              setOverrideError(null);
            }}
            className={`py-2.5 rounded-xl font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
              activeTab === 'override'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <KeyRound size={15} className="text-blue-600" />
            <span>Price Override</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-3 space-y-2.5 overflow-y-auto max-h-[75vh]">

          {/* TAB 1: PERCENTAGE DISCOUNT */}
          {activeTab === 'percent' && (
            <div>
              {/* Preset Buttons */}
              <div className="grid grid-cols-6 gap-1.5 mb-2.5">
                {[5, 10, 15, 20, 25, 50].map((pct) => {
                  const isSelected = percentInput === String(pct);
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setPercentInput(String(pct))}
                      className={`h-11 rounded-xl border-2 flex flex-col items-center justify-center active:scale-95 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50 text-amber-900 font-black shadow-xs'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold'
                      }`}
                    >
                      <span className="text-xs leading-none">{pct}%</span>
                      <span className="text-[9px] font-mono text-slate-500 mt-0.5">
                        {(basePrice * (1 - pct / 100)).toFixed(3)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom % Input Box */}
              <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Discount Rate:
                </span>
                <div className="flex items-center gap-1.5 bg-white border-2 border-amber-500 rounded-lg px-3 py-1.5">
                  <span className="font-mono font-black text-2xl text-slate-900 min-w-[48px] text-right">
                    {percentInput || '0'}
                  </span>
                  <span className="font-black text-amber-600 text-lg">% OFF</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FIXED BHD AMOUNT DISCOUNT */}
          {activeTab === 'amount' && (
            <div>
              {/* Preset Amount Buttons */}
              <div className="grid grid-cols-4 gap-1.5 mb-2.5">
                {[0.050, 0.100, 0.200, 0.500].map((amt) => {
                  const isSelected = amountInput === amt.toFixed(3);
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAmountInput(amt.toFixed(3))}
                      className={`h-11 rounded-xl border-2 flex flex-col items-center justify-center active:scale-95 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-black shadow-xs'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold'
                      }`}
                    >
                      <span className="text-xs leading-none">-{amt.toFixed(3)}</span>
                      <span className="text-[9px] font-mono text-slate-500 mt-0.5">
                        BD {Math.max(0, basePrice - amt).toFixed(3)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom BHD Deduct Box */}
              <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Deduct from Unit Price:
                </span>
                <div className="flex items-center gap-1.5 bg-white border-2 border-emerald-500 rounded-lg px-3 py-1.5">
                  <span className="font-bold text-emerald-700 text-sm">BD</span>
                  <span className="font-mono font-black text-2xl text-slate-900 min-w-[70px] text-right">
                    {amountInput || '0.000'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MANAGER PRICE OVERRIDE */}
          {activeTab === 'override' && (
            <div className="space-y-2">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 flex items-center gap-2 text-xs text-blue-900">
                <KeyRound size={16} className="shrink-0 text-blue-700" />
                <span className="font-medium">
                  Manager PIN required (9999). Tap field to type.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div
                  onClick={() => setOverrideTargetField('pin')}
                  className={`p-2.5 rounded-xl border-2 cursor-pointer transition-all ${
                    overrideTargetField === 'pin'
                      ? 'border-blue-600 bg-blue-50/50'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                    Manager PIN
                  </label>
                  <div className="font-mono font-black text-lg tracking-widest text-slate-900">
                    {managerPinInput ? '•'.repeat(managerPinInput.length) : <span className="text-slate-400 font-normal text-sm">Tap & enter</span>}
                  </div>
                </div>

                <div
                  onClick={() => setOverrideTargetField('price')}
                  className={`p-2.5 rounded-xl border-2 cursor-pointer transition-all ${
                    overrideTargetField === 'price'
                      ? 'border-blue-600 bg-blue-50/50'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                    New Unit Price (BHD)
                  </label>
                  <div className="font-mono font-black text-lg text-slate-900">
                    BD {overridePriceInput || '0.000'}
                  </div>
                </div>
              </div>

              {overrideError && (
                <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 p-2 rounded-lg">
                  ⚠️ {overrideError}
                </p>
              )}
            </div>
          )}

          {/* LIVE SUMMARY / PREVIEW BANNER */}
          <div className="bg-slate-900 text-white rounded-xl p-3 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
                  New Unit Price
                </span>
                {previewDiscountNote && (
                  <span className="bg-amber-400/20 text-amber-300 text-[10px] font-black px-1.5 py-0.5 rounded border border-amber-400/30">
                    {previewDiscountNote}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-black font-mono text-emerald-400">
                  BD {previewUnitPrice.toFixed(3)}
                </span>
                {basePrice > previewUnitPrice && (
                  <span className="text-xs text-slate-400 line-through font-mono">
                    BD {basePrice.toFixed(3)}
                  </span>
                )}
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                Line Total ({qty}x)
              </span>
              <span className="text-xl font-black font-mono text-white">
                BD {previewLineTotal.toFixed(3)}
              </span>
              {previewSavings > 0 && (
                <span className="text-[10px] font-bold text-emerald-400 font-mono block mt-0.5">
                  Save BD {previewSavings.toFixed(3)}
                </span>
              )}
            </div>
          </div>

          {/* DEDICATED ON-SCREEN TOUCH NUMPAD (Works on all modes for Sunmi D2mini touch) */}
          <div className="grid grid-cols-4 gap-1.5 pt-0.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '.'].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleKeypadPress(key)}
                className={`h-11 rounded-xl font-mono font-black text-base active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-xs ${
                  key === 'C'
                    ? 'bg-rose-100 hover:bg-rose-200 text-rose-800'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                }`}
              >
                {key}
              </button>
            ))}
          </div>

          {/* BACKSPACE BUTTON & APPLY ACTION */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => handleKeypadPress('BACK')}
              className="w-1/4 h-11 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer active:scale-95"
            >
              <Delete size={14} /> Back
            </button>
            
            <button
              type="button"
              onClick={handleApply}
              className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center justify-center gap-1.5 cursor-pointer shadow-md active:scale-95 transition-all"
            >
              <Check size={16} />
              <span>Apply Discount (BD {previewLineTotal.toFixed(3)})</span>
            </button>
          </div>

          {/* Item Actions: Quick Void / Remove from Cart & Restore Original Price */}
          <div className="flex gap-2 pt-1">
            {onRemoveItem && (
              <button
                type="button"
                onClick={() => {
                  onRemoveItem(item.index ?? product.id);
                  onClose();
                }}
                className="flex-1 py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-2xs"
                title={`Remove "${product.name}" (${qty} units) completely from cart`}
              >
                <Trash2 size={14} className="text-rose-600 stroke-[2.5]" />
                <span>🗑️ Remove Item ({qty}x)</span>
              </button>
            )}

            {isAlreadyDiscounted && (
              <button
                type="button"
                onClick={handleRestore}
                className="flex-1 py-2.5 px-3 rounded-xl border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors active:scale-95"
              >
                <RotateCcw size={12} />
                <span>↺ Restore Base Price (BD {basePrice.toFixed(3)})</span>
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default TapToEditDiscountModal;
