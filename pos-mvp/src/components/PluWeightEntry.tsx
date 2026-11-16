import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Search, 
  ArrowLeft, 
  Check, 
  Images, 
  AlertCircle,
  Hash
} from 'lucide-react';

export interface PluItem {
  code: string;
  name: string;
  nameAr?: string;
  price: number;
  icon?: string;
  unit?: string;
  barcode?: string;
}

export interface PluWeightEntryProps {
  onAddToCart?: (item: PluItem, weightKg: number, totalPrice: number) => void;
  onClose?: () => void;
  onBrowsePictures?: () => void;
  customDictionary?: Record<string, { name: string; price: number; nameAr?: string; icon?: string; unit?: string }>;
  currencySymbol?: string;
  unitSymbol?: string;
}

// Required mock dictionary with Bahrain supermarket loose items
export const DEFAULT_PLU_DICTIONARY: Record<string, { name: string; price: number; nameAr?: string; icon?: string; unit?: string }> = {
  '12': { name: 'Loose Rice', nameAr: 'أرز بسمتي سائب', price: 0.800, icon: '🍚', unit: 'KG' },
  '14': { name: 'Tomatoes', nameAr: 'طماطم طازجة', price: 0.400, icon: '🍅', unit: 'KG' },
  '50': { name: 'Fresh Chicken', nameAr: 'دجاج محلي طازج', price: 1.200, icon: '🍗', unit: 'KG' },
  '15': { name: 'Fresh Cucumbers', nameAr: 'خيار محلي', price: 0.300, icon: '🥒', unit: 'KG' },
  '16': { name: 'Local Potatoes', nameAr: 'بطاطس طازجة', price: 0.250, icon: '🥔', unit: 'KG' },
  '18': { name: 'Red Onions', nameAr: 'بصل أحمر', price: 0.280, icon: '🧅', unit: 'KG' },
  '20': { name: 'Cavendish Bananas', nameAr: 'موز فلبيني', price: 0.450, icon: '🍌', unit: 'KG' },
  '25': { name: 'Arabic Sweets', nameAr: 'حلويات بحرينية', price: 2.500, icon: '🍬', unit: 'KG' },
  '30': { name: 'Fresh Mutton', nameAr: 'لحم غنم عربي', price: 3.800, icon: '🥩', unit: 'KG' }
};

/**
 * PluWeightEntry Component
 * Hybrid PLU Short Code Lookup & Weight Entry for Sunmi Terminal.
 * Targeted for Cashiers aged 60-80.
 * Pure OLED Black with massive tap targets and single-focus state transitions.
 */
export const PluWeightEntry: React.FC<PluWeightEntryProps> = ({
  onAddToCart,
  onClose,
  onBrowsePictures,
  customDictionary,
  currencySymbol = 'BD',
  unitSymbol = 'KG'
}) => {
  // Merge default mock data with any custom catalog dictionary
  const pluDb = useMemo(() => {
    return { ...DEFAULT_PLU_DICTIONARY, ...(customDictionary || {}) };
  }, [customDictionary]);

  // Two sequential states:
  // State 1: 'LOOKUP' (Entering PLU Short Code)
  // State 2: 'WEIGHT' (Entering Weight for Recognized Item)
  const [currentMode, setCurrentMode] = useState<'LOOKUP' | 'WEIGHT'>('LOOKUP');

  // Input States
  const [pluInput, setPluInput] = useState<string>('');
  const [recognizedItem, setRecognizedItem] = useState<PluItem | null>(null);
  const [weightInput, setWeightInput] = useState<string>('0');
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Audio / Chime click feedback for tactile confidence
  const playClickFeedback = useCallback((frequency = 800) => {
    try {
      if (typeof window !== 'undefined' && 'AudioContext' in window) {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.06);
      }
    } catch { }
  }, []);

  // -------------------------------------------------------------
  // STATE 1 LOGIC: PLU LOOKUP
  // -------------------------------------------------------------
  const handleFindItem = (codeOverride?: string) => {
    const code = (codeOverride || pluInput).trim();
    if (!code) {
      setLookupError('PLEASE ENTER A NUMBER');
      playClickFeedback(300);
      return;
    }

    const matched = pluDb[code];
    if (matched) {
      playClickFeedback(950);
      setRecognizedItem({
        code,
        name: matched.name,
        nameAr: matched.nameAr,
        price: matched.price,
        icon: matched.icon || '⚖️',
        unit: matched.unit || unitSymbol
      });
      setWeightInput('0');
      setLookupError(null);
      setCurrentMode('WEIGHT');
    } else {
      playClickFeedback(300);
      setLookupError(`CODE "${code}" NOT FOUND`);
    }
  };

  // Quick tap on pre-defined shortcut chip
  const handleQuickChipSelect = (code: string) => {
    setPluInput(code);
    handleFindItem(code);
  };

  // -------------------------------------------------------------
  // STATE 2 LOGIC: WEIGHT ENTRY & COMPUTATION
  // -------------------------------------------------------------
  const floatWeight = parseFloat(weightInput) || 0;
  const unitPrice = recognizedItem?.price || 0;
  const computedTotal = (floatWeight * unitPrice).toFixed(3);
  const isValidWeight = floatWeight > 0.001;

  const handleAddPresetWeight = (amount: number) => {
    playClickFeedback(850);
    const current = parseFloat(weightInput) || 0;
    const next = (current + amount).toFixed(3);
    setWeightInput(parseFloat(next).toString());
  };

  const handleConfirmAddToCart = () => {
    if (!recognizedItem || !isValidWeight) return;
    playClickFeedback(1050);
    if (onAddToCart) {
      onAddToCart(recognizedItem, floatWeight, parseFloat(computedTotal));
    }
    // Reset back to State 1 for the next item or close if callback provided
    if (onClose) {
      onClose();
    } else {
      setRecognizedItem(null);
      setPluInput('');
      setWeightInput('0');
      setCurrentMode('LOOKUP');
    }
  };

  const handleBackToLookup = () => {
    playClickFeedback(600);
    setCurrentMode('LOOKUP');
    setWeightInput('0');
    setLookupError(null);
  };

  // -------------------------------------------------------------
  // SHARED NUMPAD KEY DISPATCHER
  // -------------------------------------------------------------
  const handlePadTap = (key: string) => {
    playClickFeedback(800);
    setLookupError(null);

    // MODE 1: Entering PLU Code (Integers only)
    if (currentMode === 'LOOKUP') {
      if (key === 'CLEAR') {
        setPluInput('');
        return;
      }
      if (key === 'BACKSPACE') {
        setPluInput((prev) => prev.slice(0, -1));
        return;
      }
      if (key === '.') {
        return; // No decimals in PLU short codes
      }
      if (pluInput.length >= 6) return; // Cap short code length
      setPluInput((prev) => prev + key);
      return;
    }

    // MODE 2: Entering Scale Weight (Supports Decimals e.g. 1.250)
    if (currentMode === 'WEIGHT') {
      if (key === 'CLEAR') {
        setWeightInput('0');
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
      if (key === '.') {
        if (!weightInput.includes('.')) {
          setWeightInput(weightInput === '0' ? '0.' : weightInput + '.');
        }
        return;
      }
      if (weightInput === '0') {
        setWeightInput(key);
      } else {
        const parts = weightInput.split('.');
        if (parts.length === 2 && parts[1].length >= 3) {
          return; // Max 3 decimal places for retail scale accuracy
        }
        if (weightInput.length >= 7) return;
        setWeightInput(weightInput + key);
      }
    }
  };

  // Physical Sunmi Keyboard / Keypad Support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (currentMode === 'WEIGHT') {
          handleBackToLookup();
        } else if (onClose) {
          onClose();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (currentMode === 'LOOKUP') {
          handleFindItem();
        } else if (currentMode === 'WEIGHT' && isValidWeight) {
          handleConfirmAddToCart();
        }
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handlePadTap('BACKSPACE');
      } else if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.'].includes(e.key)) {
        e.preventDefault();
        handlePadTap(e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentMode, pluInput, weightInput, isValidWeight, recognizedItem]);

  return (
    <div className="w-full h-full min-h-screen bg-black text-white flex flex-col select-none font-sans overflow-x-hidden">
      
      {/* Top Header Bar */}
      <div className="w-full max-w-6xl mx-auto px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center font-black text-2xl ${
            currentMode === 'LOOKUP' 
              ? 'bg-blue-500/20 text-blue-400 border-blue-500/40' 
              : 'bg-green-500/20 text-green-400 border-green-500/40'
          }`}>
            {currentMode === 'LOOKUP' ? <Hash size={28} /> : <span>{recognizedItem?.icon || '⚖️'}</span>}
          </div>
          <div>
            <div className="text-xs sm:text-sm font-bold uppercase tracking-widest text-zinc-400">
              {currentMode === 'LOOKUP' ? 'Step 1 of 2: Item Short Code' : 'Step 2 of 2: Scale Weight'}
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">
              {currentMode === 'LOOKUP' ? 'PLU Short Code Entry' : `${recognizedItem?.name} Weight`}
            </h2>
          </div>
        </div>

        {/* Close Button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="h-12 px-5 rounded-2xl bg-neutral-900 hover:bg-neutral-800 active:scale-95 text-zinc-300 hover:text-white border-2 border-neutral-700 font-black text-xl flex items-center gap-2 cursor-pointer transition-all"
          >
            ✕ CLOSE
          </button>
        )}
      </div>

      {/* Main Split Layout: Left Info/Display Pane + Right Massive Numpad */}
      <div className="flex-1 w-full max-w-6xl mx-auto p-3 sm:p-5 flex flex-col justify-center">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 items-center">
          
          {/* ============================================================== */}
          {/* LEFT PANE: DISPLAY & ACTIONS ACCORDING TO STATE                 */}
          {/* ============================================================== */}
          <div className="md:col-span-5 flex flex-col gap-3">
            
            {/* ------------------------------------------------------------ */}
            {/* STATE 1 LEFT DISPLAY: PLU LOOKUP DISPLAY                     */}
            {/* ------------------------------------------------------------ */}
            {currentMode === 'LOOKUP' && (
              <div className="flex flex-col gap-3 animate-in fade-in duration-150">
                
                {/* Massive Display Box for Typed Short Code */}
                <div className="bg-neutral-900 border-2 border-neutral-700 rounded-3xl p-5 shadow-2xl flex flex-col items-center justify-center text-center">
                  <span className="text-sm sm:text-base font-bold uppercase tracking-widest text-zinc-400 mb-1">
                    Typed PLU Short Code
                  </span>

                  {/* Giant Code Digits */}
                  <div className="h-24 sm:h-28 flex items-center justify-center">
                    <span className={`text-6xl sm:text-8xl font-mono font-black tracking-widest ${
                      pluInput ? 'text-blue-400' : 'text-zinc-600'
                    }`}>
                      {pluInput || '00'}
                    </span>
                  </div>

                  {/* Error / Instruction Banner */}
                  {lookupError ? (
                    <div className="mt-2 w-full bg-red-600/30 border border-red-500 rounded-2xl py-2 px-3 flex items-center justify-center gap-2 text-red-200 text-lg font-black uppercase animate-shake">
                      <AlertCircle size={22} className="shrink-0" />
                      <span>{lookupError}</span>
                    </div>
                  ) : (
                    <div className="text-base sm:text-lg font-bold text-zinc-300">
                      Type item number (e.g. <span className="text-blue-400 font-mono">14</span> for Tomatoes)
                    </div>
                  )}
                </div>

                {/* Massive Primary Action: FIND LOOSE ITEM (bg-blue-500) */}
                <button
                  type="button"
                  data-testid="find-loose-item-btn"
                  onClick={() => handleFindItem()}
                  className="min-h-[84px] h-20 sm:h-22 w-full bg-blue-500 hover:bg-blue-600 active:scale-95 text-white font-black text-2xl sm:text-3xl rounded-3xl shadow-2xl flex items-center justify-center gap-3 cursor-pointer border-2 border-blue-400 shadow-blue-500/20 transition-all uppercase"
                >
                  <Search size={32} strokeWidth={3} />
                  <span>FIND LOOSE ITEM</span>
                </button>

                {/* Secondary Fallback: BROWSE PICTURES (bg-neutral-800) */}
                {onBrowsePictures && (
                  <button
                    type="button"
                    onClick={onBrowsePictures}
                    className="h-16 w-full bg-neutral-900 hover:bg-neutral-800 active:scale-95 text-zinc-300 hover:text-white font-black text-xl sm:text-2xl rounded-2xl border-2 border-neutral-700 shadow-lg flex items-center justify-center gap-3 cursor-pointer transition-all uppercase"
                  >
                    <Images size={26} className="text-zinc-400" />
                    <span>BROWSE PICTURES</span>
                  </button>
                )}

                {/* Quick PLU Helper Badges (Common Loose Items) */}
                <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-3">
                  <div className="text-xs uppercase font-bold text-zinc-400 mb-2">
                    Quick Codes (Tap to Auto-Fill):
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(pluDb).slice(0, 6).map(([code, item]) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => handleQuickChipSelect(code)}
                        className="py-2 px-2.5 rounded-xl bg-black hover:bg-neutral-800 active:scale-95 border border-neutral-700 text-left transition-all cursor-pointer"
                      >
                        <div className="text-xs font-mono font-black text-blue-400">#{code}</div>
                        <div className="text-sm font-bold text-white truncate">{item.name}</div>
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {/* ------------------------------------------------------------ */}
            {/* STATE 2 LEFT DISPLAY: RECOGNIZED ITEM & WEIGHT DISPLAY       */}
            {/* ------------------------------------------------------------ */}
            {currentMode === 'WEIGHT' && recognizedItem && (
              <div className="flex flex-col gap-3 animate-in fade-in duration-150">
                
                {/* Recognized Item Header & Rate Card */}
                <div className="bg-neutral-900 border-2 border-neutral-800 rounded-3xl p-3 flex items-center justify-between shadow-xl">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">{recognizedItem.icon}</span>
                    <div>
                      <div className="text-2xl sm:text-3xl font-black text-white leading-none">
                        {recognizedItem.name}
                      </div>
                      {recognizedItem.nameAr && (
                        <div className="text-lg font-bold text-zinc-400">
                          {recognizedItem.nameAr}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="bg-black border border-neutral-800 rounded-xl px-3 py-1 text-right">
                    <div className="text-xs uppercase font-bold text-zinc-400">Rate / {recognizedItem.unit || unitSymbol}</div>
                    <div className="text-xl font-mono font-black text-green-400">
                      {currencySymbol} {recognizedItem.price.toFixed(3)}
                    </div>
                  </div>
                </div>

                {/* Massive Scale Reading Display Box */}
                <div className="bg-neutral-900 border-2 border-neutral-700 rounded-3xl p-4 shadow-2xl flex flex-col items-center justify-center text-center">
                  <div className="text-xs sm:text-sm font-bold uppercase tracking-widest text-zinc-400 mb-1">
                    Scale Reading (Read physical scale)
                  </div>

                  {/* Giant Weight Digits */}
                  <div className="flex items-baseline justify-center gap-2">
                    <span className={`text-6xl sm:text-8xl font-mono font-black tracking-tight ${
                      weightInput === '0' || weightInput === '' ? 'text-zinc-600' : 'text-green-400'
                    }`}>
                      {weightInput}
                    </span>
                    <span className="text-3xl sm:text-4xl font-black text-zinc-400 font-mono">
                      {recognizedItem.unit || unitSymbol}
                    </span>
                  </div>

                  {/* Live Computed Total */}
                  <div className="mt-2 w-full bg-black/90 border border-neutral-700 rounded-2xl py-2 px-4 flex items-center justify-between text-2xl font-mono font-black">
                    <span className="text-zinc-400 text-base uppercase font-bold">Total Amount:</span>
                    <span className="text-white text-3xl sm:text-4xl">
                      {currencySymbol} {computedTotal}
                    </span>
                  </div>
                </div>

                {/* Quick Preset Weight Chips */}
                <div className="grid grid-cols-4 gap-2">
                  {[0.25, 0.5, 1.0, 2.0].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleAddPresetWeight(preset)}
                      className="h-12 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-zinc-300 hover:text-white border-2 border-neutral-800 rounded-2xl text-lg font-black cursor-pointer transition-all"
                    >
                      +{preset}
                    </button>
                  ))}
                </div>

                {/* State 2 Action Buttons: BACK/CANCEL (bg-red-600) + ADD TO CART (bg-green-500) */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleBackToLookup}
                    className="min-h-[84px] h-20 sm:h-22 flex-1 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black text-2xl sm:text-3xl rounded-2xl shadow-2xl flex items-center justify-center gap-2 cursor-pointer border-2 border-red-500/50 transition-all uppercase"
                  >
                    <ArrowLeft size={30} strokeWidth={3} />
                    <span>BACK</span>
                  </button>

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
                    <Check size={34} strokeWidth={3.5} />
                    <span>ADD TO CART</span>
                  </button>
                </div>

              </div>
            )}

          </div>

          {/* ============================================================== */}
          {/* RIGHT PANE: THE MASSIVE NUMPAD FOCUS (KEYS h-24 / text-4xl)     */}
          {/* ============================================================== */}
          <div className="md:col-span-7 flex flex-col justify-center">
            
            {/* Top Instruction Banner above Numpad */}
            <div className="text-center pb-2">
              <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight uppercase leading-tight">
                {currentMode === 'LOOKUP' ? (
                  <span>ENTER SHORT CODE & TAP <span className="text-blue-400">FIND</span></span>
                ) : (
                  <span><span className="text-green-400">{recognizedItem?.name}</span> - ENTER WEIGHT</span>
                )}
              </h1>
            </div>

            {/* Massive 3x4 Numpad (Keys min-h-[84px] h-20 sm:h-24, text-4xl) */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              {/* Row 1 */}
              <button
                type="button"
                onClick={() => handlePadTap('1')}
                className="min-h-[84px] h-20 sm:h-24 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl sm:text-5xl rounded-3xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
              >
                1
              </button>
              <button
                type="button"
                onClick={() => handlePadTap('2')}
                className="min-h-[84px] h-20 sm:h-24 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl sm:text-5xl rounded-3xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
              >
                2
              </button>
              <button
                type="button"
                onClick={() => handlePadTap('3')}
                className="min-h-[84px] h-20 sm:h-24 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl sm:text-5xl rounded-3xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
              >
                3
              </button>

              {/* Row 2 */}
              <button
                type="button"
                onClick={() => handlePadTap('4')}
                className="min-h-[84px] h-20 sm:h-24 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl sm:text-5xl rounded-3xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
              >
                4
              </button>
              <button
                type="button"
                onClick={() => handlePadTap('5')}
                className="min-h-[84px] h-20 sm:h-24 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl sm:text-5xl rounded-3xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
              >
                5
              </button>
              <button
                type="button"
                onClick={() => handlePadTap('6')}
                className="min-h-[84px] h-20 sm:h-24 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl sm:text-5xl rounded-3xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
              >
                6
              </button>

              {/* Row 3 */}
              <button
                type="button"
                onClick={() => handlePadTap('7')}
                className="min-h-[84px] h-20 sm:h-24 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl sm:text-5xl rounded-3xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
              >
                7
              </button>
              <button
                type="button"
                onClick={() => handlePadTap('8')}
                className="min-h-[84px] h-20 sm:h-24 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl sm:text-5xl rounded-3xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
              >
                8
              </button>
              <button
                type="button"
                onClick={() => handlePadTap('9')}
                className="min-h-[84px] h-20 sm:h-24 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl sm:text-5xl rounded-3xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
              >
                9
              </button>

              {/* Row 4: Key '.' in weight mode or 'CLEAR' in lookup mode */}
              <button
                type="button"
                onClick={() => handlePadTap(currentMode === 'LOOKUP' ? 'CLEAR' : '.')}
                className={`min-h-[84px] h-20 sm:h-24 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 font-black rounded-3xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all ${
                  currentMode === 'LOOKUP' ? 'text-red-400 text-2xl sm:text-3xl' : 'text-white text-5xl'
                }`}
              >
                {currentMode === 'LOOKUP' ? 'CLR' : '.'}
              </button>

              <button
                type="button"
                onClick={() => handlePadTap('0')}
                className="min-h-[84px] h-20 sm:h-24 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-4xl sm:text-5xl rounded-3xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
              >
                0
              </button>

              <button
                type="button"
                onClick={() => handlePadTap('BACKSPACE')}
                className="min-h-[84px] h-20 sm:h-24 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-red-400 hover:text-red-300 font-black text-3xl sm:text-4xl rounded-3xl border-2 border-neutral-800 shadow-lg cursor-pointer flex items-center justify-center transition-all"
                title="Delete last digit"
              >
                ⌫
              </button>
            </div>

          </div>

        </div>
      </div>

    </div>
  );
};

export default PluWeightEntry;
