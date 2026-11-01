import React, { useState, useEffect } from 'react';
import { X, Scale } from 'lucide-react';

export interface WeightItem {
  id?: string;
  name: string;
  sellingPrice?: number;
  price?: number;
  barcode?: string;
  is_weighed_item?: boolean;
  [key: string]: any;
}

export interface WeightInputModalProps {
  item: WeightItem | null;
  isOpen: boolean;
  onClose: () => void;
  onAdd: (item: WeightItem, weight: number) => void;
}

export const WeightInputModal: React.FC<WeightInputModalProps> = ({ item, isOpen, onClose, onAdd }) => {
  const [weight, setWeight] = useState<string>("0");

  // Reset weight to "0" whenever the modal opens or item changes
  useEffect(() => {
    if (isOpen) {
      setWeight("0");
    }
  }, [isOpen, item]);

  // Support physical Sunmi keyboard / numpad shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setWeight((prev) => {
          if (prev.length <= 1 || prev === '0') return '0';
          return prev.slice(0, -1);
        });
      } else if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.'].includes(e.key)) {
        e.preventDefault();
        handlePadClick(e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, weight, item]);

  if (!isOpen || !item) return null;

  const handlePadClick = (val: string) => {
    if (val === '.' && weight.includes('.')) return; // Prevent duplicate decimals

    if (weight === "0" && val !== ".") {
      setWeight(val);
    } else {
      setWeight((prev) => prev + val);
    }
  };

  const handleConfirm = () => {
    const floatWeight = parseFloat(weight);
    if (floatWeight > 0) {
      onAdd(item, floatWeight);
      setWeight("0");
      onClose();
    }
  };

  const unitPrice = item.sellingPrice ?? item.price ?? 0;
  const currentFloatWeight = parseFloat(weight) || 0;
  const calculatedTotal = (currentFloatWeight * unitPrice).toFixed(3);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-gray-900 p-6 rounded-2xl w-full max-w-sm sm:w-96 text-white border border-gray-600 shadow-2xl relative select-none">
        
        {/* Header with Title and Close Button */}
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-1">
              <Scale size={16} />
              <span>Weighed Produce Entry</span>
            </div>
            <h2 className="text-2xl font-black text-white truncate leading-tight">
              {item.name}
            </h2>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              Unit Rate: BHD {unitPrice.toFixed(3)} / kg
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 -mt-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl transition-colors cursor-pointer"
            title="Cancel & Close [Esc]"
          >
            <X size={22} />
          </button>
        </div>

        {/* Live Weight Display Readout */}
        <div className="bg-gray-800 border border-gray-700 text-right p-4 rounded-xl mb-3 shadow-inner">
          <div className="flex items-baseline justify-end gap-2">
            <span className="font-mono text-5xl font-black text-white tracking-tight tabular-nums">
              {weight}
            </span>
            <span className="text-2xl font-bold text-emerald-400">kg</span>
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700/60 text-xs font-mono text-gray-400">
            <span>Computed Total:</span>
            <span className="text-base font-bold text-amber-400">
              BHD {calculatedTotal}
            </span>
          </div>
        </div>
        
        {/* Custom Massive Numpad Specifically Built for Sunmi D2 Mini Touch */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', 'DEL'].map((key) => {
            const isDel = key === 'DEL';
            return (
              <button 
                key={key}
                type="button"
                onClick={() => (isDel ? setWeight("0") : handlePadClick(key))}
                className={`min-h-[80px] h-[80px] text-3xl font-black rounded-xl active:scale-95 transition-all shadow-md flex items-center justify-center cursor-pointer ${
                  isDel 
                    ? 'bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-extrabold' 
                    : 'bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white border border-gray-700'
                }`}
              >
                {key}
              </button>
            );
          })}
        </div>
        
        {/* Bottom Actions Cluster */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-1/3 bg-gray-800 hover:bg-gray-700 active:scale-95 min-h-[76px] text-lg font-bold rounded-xl border border-gray-700 text-gray-300 transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button 
            type="button"
            onClick={handleConfirm}
            disabled={currentFloatWeight <= 0}
            className={`w-2/3 min-h-[76px] text-2xl font-black rounded-xl active:scale-95 transition-all shadow-lg flex items-center justify-center cursor-pointer ${
              currentFloatWeight > 0
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-emerald-900/50 text-emerald-400/40 cursor-not-allowed'
            }`}
          >
            Add to Cart
          </button>
        </div>

      </div>
    </div>
  );
};

export default WeightInputModal;
