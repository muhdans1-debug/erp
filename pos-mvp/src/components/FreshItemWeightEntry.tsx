import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Scale, 
  ArrowLeft, 
  Check,
  Hash 
} from 'lucide-react';

export interface FreshItem {
  id: string;
  name: string;
  nameAr?: string;
  pricePerKg: number;
  category: 'VEGETABLES' | 'FRUITS' | 'MEAT' | 'SWEETS' | 'GRAINS' | 'POULTRY' | 'OTHER';
  icon: string; // High-contrast visual emoji / icon
  barcode?: string;
}

export interface FreshItemWeightEntryProps {
  onAddToCart?: (item: FreshItem, weightKg: number, totalPrice: number) => void;
  onClose?: () => void;
  onSwitchToPlu?: () => void;
  customItems?: FreshItem[];
  currencySymbol?: string;
  unitSymbol?: string;
  initialItem?: FreshItem | null;
}

// Default high-frequency loose & fresh items for Bahrain retail supermarkets
export const DEFAULT_FRESH_ITEMS: FreshItem[] = [
  { id: 'fresh_tomatoes', name: 'Loose Red Tomatoes', nameAr: 'طماطم طازجة', pricePerKg: 0.350, category: 'VEGETABLES', icon: '🍅' },
  { id: 'fresh_chicken', name: 'Fresh Local Chicken', nameAr: 'دجاج محلي طازج', pricePerKg: 1.200, category: 'POULTRY', icon: '🍗' },
  { id: 'fresh_sweets', name: 'Arabic Sweets / Halwa', nameAr: 'حلويات بحرينية', pricePerKg: 2.500, category: 'SWEETS', icon: '🍬' },
  { id: 'fresh_rice', name: 'Basmati Rice (Loose)', nameAr: 'أرز بسمتي سائب', pricePerKg: 0.650, category: 'GRAINS', icon: '🍚' },
  { id: 'fresh_cucumbers', name: 'Fresh Cucumbers', nameAr: 'خيار محلي', pricePerKg: 0.300, category: 'VEGETABLES', icon: '🥒' },
  { id: 'fresh_potatoes', name: 'Local Potatoes', nameAr: 'بطاطس طازجة', pricePerKg: 0.250, category: 'VEGETABLES', icon: '🥔' },
  { id: 'fresh_onions', name: 'Red Onions (Loose)', nameAr: 'بصل أحمر', pricePerKg: 0.280, category: 'VEGETABLES', icon: '🧅' },
  { id: 'fresh_bananas', name: 'Cavendish Bananas', nameAr: 'موز فلبيني', pricePerKg: 0.450, category: 'FRUITS', icon: '🍌' },
  { id: 'fresh_mutton', name: 'Fresh Local Mutton', nameAr: 'لحم غنم عربي', pricePerKg: 3.800, category: 'MEAT', icon: '🥩' },
  { id: 'fresh_apples', name: 'Red Gala Apples', nameAr: 'تفاح أحمر', pricePerKg: 0.600, category: 'FRUITS', icon: '🍎' },
  { id: 'fresh_oranges', name: 'Navel Oranges', nameAr: 'برتقال عصير', pricePerKg: 0.400, category: 'FRUITS', icon: '🍊' },
  { id: 'fresh_carrots', name: 'Fresh Carrots', nameAr: 'جزر طازج', pricePerKg: 0.320, category: 'VEGETABLES', icon: '🥕' }
];

/**
 * FreshItemWeightEntry Component
 * Tailored for Cashiers aged 60-80 with zero required onboarding.
 * Pure high-contrast OLED black theme with massive tap surfaces.
 */
export const FreshItemWeightEntry: React.FC<FreshItemWeightEntryProps> = ({
  onAddToCart,
  onClose,
  onSwitchToPlu,
  customItems,
  currencySymbol = 'BD',
  unitSymbol = 'KG',
  initialItem = null
}) => {
  const items = useMemo(() => customItems && customItems.length > 0 ? customItems : DEFAULT_FRESH_ITEMS, [customItems]);

  // State Machine: State 1 (GRID) vs State 2 (NUMPAD)
  const [selectedItem, setSelectedItem] = useState<FreshItem | null>(initialItem);
  const [weightInput, setWeightInput] = useState<string>('0');

  // If initialItem is provided on mount, jump straight to numpad
  useEffect(() => {
    if (initialItem) {
      setSelectedItem(initialItem);
      setWeightInput('0');
    }
  }, [initialItem]);

  // Audio / Chime click feedback for confidence
  const playClickFeedback = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && 'AudioContext' in window) {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.06);
      }
    } catch { }
  }, []);

  // Selection transition: Grid -> Numpad
  const handleSelectItem = (item: FreshItem) => {
    playClickFeedback();
    setSelectedItem(item);
    setWeightInput('0');
  };

  // Back transition: Numpad -> Grid
  const handleBackToGrid = () => {
    playClickFeedback();
    setSelectedItem(null);
    setWeightInput('0');
  };

  // Numpad key tap logic
  const handlePadKey = (key: string) => {
    playClickFeedback();

    if (key === '.') {
      if (!weightInput.includes('.')) {
        setWeightInput(weightInput === '0' ? '0.' : weightInput + '.');
      }
      return;
    }

    if (key === 'BACKSPACE') {
      if (weightInput.length <= 1 || weightInput === '0') {
        setWeightInput('0');
      } else {
        setWeightInput(weightInput.slice(0, -1));
      }
      return;
    }

    if (key === 'CLEAR') {
      setWeightInput('0');
      return;
    }

    // Number keys 0-9
    if (weightInput === '0') {
      setWeightInput(key);
    } else {
      // Limit decimal places to 3 for standard scale kg resolution (e.g. 1.250)
      const parts = weightInput.split('.');
      if (parts.length === 2 && parts[1].length >= 3) {
        return; // Max 3 decimal places
      }
      if (weightInput.length >= 7) return; // Prevent overflow
      setWeightInput(weightInput + key);
    }
  };

  // Quick preset weight addition (+0.250, +0.500, +1.000, +2.000)
  const handlePresetWeight = (amount: number) => {
    playClickFeedback();
    const current = parseFloat(weightInput) || 0;
    const next = (current + amount).toFixed(3);
    setWeightInput(parseFloat(next).toString());
  };

  // Calculated price
  const floatWeight = parseFloat(weightInput) || 0;
  const unitPrice = selectedItem?.pricePerKg || 0;
  const computedTotal = (floatWeight * unitPrice).toFixed(3);
  const isValidWeight = floatWeight > 0.001;

  // Confirm and Add to Cart
  const handleConfirmAddToCart = () => {
    if (!selectedItem || !isValidWeight) return;
    playClickFeedback();
    if (onAddToCart) {
      onAddToCart(selectedItem, floatWeight, parseFloat(computedTotal));
    }
    // Return to grid for the next loose item or close if modal
    if (onClose) {
      onClose();
    } else {
      setSelectedItem(null);
      setWeightInput('0');
    }
  };

  // Physical Sunmi Keyboard / Keypad Support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // When in Numpad state
      if (selectedItem) {
        if (e.key === 'Escape') {
          e.preventDefault();
          handleBackToGrid();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (isValidWeight) handleConfirmAddToCart();
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          handlePadKey('BACKSPACE');
        } else if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.'].includes(e.key)) {
          e.preventDefault();
          handlePadKey(e.key);
        }
      } else {
        // When in Grid state
        if (e.key === 'Escape' && onClose) {
          e.preventDefault();
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItem, weightInput, isValidWeight]);

  return (
    <div className="w-full h-full min-h-screen bg-black text-white flex flex-col select-none font-sans overflow-x-hidden">
      
      {/* ============================================================== */}
      {/* STATE 1: VISUAL SPEED GRID                                     */}
      {/* ============================================================== */}
      {!selectedItem && (
        <div className="flex-1 flex flex-col p-4 sm:p-6 w-full max-w-7xl mx-auto animate-in fade-in duration-200">
          
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-4 sm:pb-6 border-b border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-neutral-900 border border-neutral-700 flex items-center justify-center text-green-500">
                <Scale size={28} />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-black text-white tracking-wide uppercase">
                  Loose & Fresh Items
                </h1>
                <p className="text-xl sm:text-2xl font-bold text-zinc-300">
                  Tap any item picture to enter scale weight
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {onSwitchToPlu && (
                <button
                  type="button"
                  onClick={onSwitchToPlu}
                  className="h-16 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white border-2 border-blue-400 font-black text-2xl flex items-center gap-2 cursor-pointer transition-all shadow-lg shadow-blue-500/20"
                >
                  <Hash size={26} />
                  <span>TYPE PLU</span>
                </button>
              )}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="h-16 px-6 rounded-2xl bg-neutral-900 hover:bg-neutral-800 active:scale-95 text-zinc-300 hover:text-white border-2 border-neutral-700 font-black text-2xl flex items-center gap-2 cursor-pointer transition-all"
                >
                  <span>✕ CLOSE</span>
                </button>
              )}
            </div>
          </div>

          {/* Massive Tap-Target Speed Grid */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6 pt-6 auto-rows-fr">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectItem(item)}
                className="min-h-[140px] sm:min-h-[160px] h-36 sm:h-44 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 border-2 border-neutral-800 hover:border-green-500 rounded-3xl p-4 sm:p-5 flex flex-col items-center justify-between text-center cursor-pointer shadow-2xl transition-all group"
              >
                {/* Visual Image / High-Contrast Emoji */}
                <div className="text-5xl sm:text-6xl transform group-hover:scale-110 transition-transform">
                  {item.icon}
                </div>

                {/* Item Label (No Small Text) */}
                <div className="w-full">
                  <div className="text-2xl sm:text-3xl font-black text-white leading-tight truncate">
                    {item.name}
                  </div>
                  {item.nameAr && (
                    <div className="text-lg sm:text-xl font-bold text-zinc-400 truncate">
                      {item.nameAr}
                    </div>
                  )}
                </div>

                {/* Price Per KG Tag */}
                <div className="w-full bg-black/60 border border-neutral-800 rounded-xl py-1 px-2 text-xl sm:text-2xl font-mono font-black text-zinc-300">
                  {currencySymbol} {item.pricePerKg.toFixed(3)} / {unitSymbol}
                </div>
              </button>
            ))}
          </div>

        </div>
      )}

      {/* ============================================================== */}
      {/* STATE 2: MULTIPLIER NUMPAD                                     */}
      {/* ============================================================== */}
      {selectedItem && (
        <div className="flex-1 flex flex-col justify-center p-3 sm:p-5 w-full max-w-6xl mx-auto animate-in fade-in duration-150">
          
          {/* Weight Prompt Header (Prominently displayed above numpad) */}
          <div className="text-center pb-2">
            <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight uppercase leading-tight">
              ENTER WEIGHT: <span className="text-green-400">{selectedItem.name}</span> ({unitSymbol})
            </h1>
          </div>

          {/* Split Screen Ergonomics for Sunmi D2 Mini Landscape */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            
            {/* LEFT COLUMN: Item Rate, Giant Scale Reading & Live Total */}
            <div className="md:col-span-5 flex flex-col gap-3">
              
              {/* Item Info & Rate Badge */}
              <div className="bg-neutral-900 border-2 border-neutral-800 rounded-3xl p-3 flex items-center justify-between shadow-xl">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{selectedItem.icon}</span>
                  <div>
                    <div className="text-2xl font-black text-white leading-none">{selectedItem.name}</div>
                    {selectedItem.nameAr && <div className="text-lg font-bold text-zinc-400">{selectedItem.nameAr}</div>}
                  </div>
                </div>
                <div className="bg-black border border-neutral-800 rounded-xl px-3 py-1 text-right">
                  <div className="text-xs uppercase font-bold text-zinc-400">Unit Rate</div>
                  <div className="text-xl font-mono font-black text-zinc-200">
                    {currencySymbol} {selectedItem.pricePerKg.toFixed(3)}
                  </div>
                </div>
              </div>

              {/* Massive Weight Display & Live Calculated Total Box */}
              <div className="bg-neutral-900 border-2 border-neutral-700 rounded-3xl p-4 shadow-2xl flex flex-col items-center justify-center">
                <div className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-1">
                  Scale Reading (Read physical scale)
                </div>

                {/* Giant Digits */}
                <div className="flex items-baseline justify-center gap-2">
                  <span className={`text-6xl sm:text-7xl font-mono font-black tracking-tight ${
                    weightInput === '0' || weightInput === '' ? 'text-zinc-600' : 'text-green-400'
                  }`}>
                    {weightInput}
                  </span>
                  <span className="text-3xl sm:text-4xl font-black text-zinc-400 font-mono">
                    {unitSymbol}
                  </span>
                </div>

                {/* Live Computed Currency Total */}
                <div className="mt-3 w-full bg-black/90 border border-neutral-700 rounded-2xl py-2 px-4 flex items-center justify-between text-2xl font-mono font-black">
                  <span className="text-zinc-400 text-base uppercase font-bold">Total:</span>
                  <span className="text-white text-3xl">
                    {currencySymbol} {computedTotal}
                  </span>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="grid grid-cols-4 gap-2">
                {[0.25, 0.5, 1.0, 2.0].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handlePresetWeight(preset)}
                    className="h-12 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-zinc-300 hover:text-white border-2 border-neutral-800 rounded-2xl text-lg font-black cursor-pointer transition-all"
                  >
                    +{preset}
                  </button>
                ))}
              </div>
            </div>

            {/* RIGHT COLUMN: Massive Multiplier Numpad & Action Buttons */}
            <div className="md:col-span-7 flex flex-col justify-center">
              
              {/* Massive Numeric Keypad (Keys min-h-[88px] h-22 sm:h-24 with text-4xl+) */}
              <div className="grid grid-cols-3 gap-2.5">
                {/* Row 1 */}
                <button
                  type="button"
                  onClick={() => handlePadKey('1')}
                  className="min-h-[84px] h-20 sm:h-22 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl rounded-2xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
                >
                  1
                </button>
                <button
                  type="button"
                  onClick={() => handlePadKey('2')}
                  className="min-h-[84px] h-20 sm:h-22 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl rounded-2xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
                >
                  2
                </button>
                <button
                  type="button"
                  onClick={() => handlePadKey('3')}
                  className="min-h-[84px] h-20 sm:h-22 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl rounded-2xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
                >
                  3
                </button>

                {/* Row 2 */}
                <button
                  type="button"
                  onClick={() => handlePadKey('4')}
                  className="min-h-[84px] h-20 sm:h-22 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl rounded-2xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
                >
                  4
                </button>
                <button
                  type="button"
                  onClick={() => handlePadKey('5')}
                  className="min-h-[84px] h-20 sm:h-22 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl rounded-2xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
                >
                  5
                </button>
                <button
                  type="button"
                  onClick={() => handlePadKey('6')}
                  className="min-h-[84px] h-20 sm:h-22 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl rounded-2xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
                >
                  6
                </button>

                {/* Row 3 */}
                <button
                  type="button"
                  onClick={() => handlePadKey('7')}
                  className="min-h-[84px] h-20 sm:h-22 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl rounded-2xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
                >
                  7
                </button>
                <button
                  type="button"
                  onClick={() => handlePadKey('8')}
                  className="min-h-[84px] h-20 sm:h-22 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl rounded-2xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
                >
                  8
                </button>
                <button
                  type="button"
                  onClick={() => handlePadKey('9')}
                  className="min-h-[84px] h-20 sm:h-22 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl rounded-2xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
                >
                  9
                </button>

                {/* Row 4 */}
                <button
                  type="button"
                  onClick={() => handlePadKey('.')}
                  className="min-h-[84px] h-20 sm:h-22 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl rounded-2xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
                >
                  .
                </button>
                <button
                  type="button"
                  onClick={() => handlePadKey('0')}
                  className="min-h-[84px] h-20 sm:h-22 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl rounded-2xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => handlePadKey('BACKSPACE')}
                  className="min-h-[84px] h-20 sm:h-22 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-red-400 hover:text-red-300 font-black text-3xl sm:text-4xl rounded-2xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center gap-1 transition-all"
                  title="Delete last digit"
                >
                  ⌫
                </button>
              </div>

              {/* Bottom Action Buttons: Giant BACK and ADD TO CART directly below numpad */}
              <div className="flex items-center gap-3 pt-3">
                {/* Destructive / Back Button (Layali Red) */}
                <button
                  type="button"
                  onClick={handleBackToGrid}
                  className="min-h-[84px] h-20 sm:h-22 flex-1 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black text-2xl sm:text-3xl rounded-2xl shadow-2xl flex items-center justify-center gap-2 cursor-pointer border-2 border-red-500/50 transition-all uppercase"
                >
                  <ArrowLeft size={32} strokeWidth={3} />
                  <span>BACK</span>
                </button>

                {/* Primary Action / Add to Cart Button (Zain Neon Green) */}
                <button
                  type="button"
                  disabled={!isValidWeight}
                  onClick={handleConfirmAddToCart}
                  className={`min-h-[84px] h-20 sm:h-22 flex-[2] font-black text-2xl sm:text-3xl rounded-2xl shadow-2xl flex items-center justify-center gap-2 border-2 transition-all uppercase ${
                    isValidWeight
                      ? 'bg-green-500 hover:bg-green-600 active:scale-95 text-black border-green-400 shadow-green-500/20 cursor-pointer animate-pulse'
                      : 'bg-green-950/40 text-green-900/40 border-green-900/20 cursor-not-allowed'
                  }`}
                >
                  <Check size={36} strokeWidth={3.5} />
                  <span>ADD TO CART</span>
                </button>
              </div>

            </div>

          </div>

        </div>
      )}

    </div>
  );
};

export default FreshItemWeightEntry;
