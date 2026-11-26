import React, { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from 'react';
import {
  ArrowLeft,
  Check,
  X,
  CreditCard,
  Banknote,
  Smartphone,
  Scale,
  ShoppingCart,
  Sparkles,
  Search,
  Plus
} from 'lucide-react';

export interface OmniItem {
  code: string;
  name: string;
  nameAr?: string;
  pricePerKg: number;
  icon: string;
  category?: string;
  barcode?: string;
  isPopular?: boolean;
  productId?: string;
  imageUrl?: string | null;
  imageUrlThumb?: string | null;
}

export interface PredictiveOmniPadProps {
  initialItem?: OmniItem | null;
  onAddToCart?: (item: OmniItem, weightKg: number, totalPrice: number, keepOpen?: boolean) => void;
  onTenderCash?: () => void;
  onTenderBenefit?: () => void;
  onTenderKhata?: () => void;
  onClose?: () => void;
  onResetItem?: () => void;
  customItems?: OmniItem[];
  currencySymbol?: string;
  unitSymbol?: string;
  className?: string;
  isFullscreen?: boolean;
  cartCount?: number;
  cartTotal?: number;
}

// Built-in fallback loose produce catalog for Bahrain retail (Synced with PIM & Daily Produce)
export const DEFAULT_OMNI_ITEMS: OmniItem[] = [
  { code: '10', name: 'Rice matta', nameAr: 'أرز ماتا كيرلا سائب', pricePerKg: 0.600, icon: '🍚', isPopular: true, category: 'PRODUCE' },
  { code: '12', name: 'Rice 900', nameAr: 'أرز فاخر', pricePerKg: 0.900, icon: '🍚', isPopular: true, category: 'PRODUCE' },
  { code: '13', name: 'Atta', nameAr: 'طحين أتا فاخر', pricePerKg: 0.100, icon: '🌾', isPopular: true, category: 'PRODUCE' },
  { code: '35', name: 'Apple', nameAr: 'تفاح رويال جالا', pricePerKg: 1.200, icon: '🍎', isPopular: true, category: 'PRODUCE' },
  { code: '77', name: 'Rice 1200', nameAr: 'أرز بسمتي فاخر 1200', pricePerKg: 1.200, icon: '🍚', isPopular: true, category: 'ESSENTIALS' },
  { code: '101', name: 'Chilly green', nameAr: 'فلفل أخضر حار', pricePerKg: 1.500, icon: '🌶️', isPopular: true, category: 'PRODUCE' },
  { code: '102', name: 'Tomato', nameAr: 'طماطم طازجة', pricePerKg: 0.500, icon: '🍅', isPopular: true, category: 'PRODUCE' },
  { code: '105', name: 'Coli flower', nameAr: 'قرنبيط زهرة أبيض', pricePerKg: 1.000, icon: '🥦', isPopular: true, category: 'PRODUCE' },
  { code: '106', name: 'Ginjar', nameAr: 'زنجبيل طازج', pricePerKg: 2.400, icon: '🧄', isPopular: true, category: 'PRODUCE' },
  { code: '107', name: 'Garlic Pack', nameAr: 'ثوم طازج', pricePerKg: 2.000, icon: '🧄', isPopular: true, category: 'PRODUCE' },
  { code: '109', name: 'Cabaj', nameAr: 'ملفوف أخضر', pricePerKg: 0.500, icon: '🥬', isPopular: true, category: 'PRODUCE' },
  { code: '110', name: 'Cucaber', nameAr: 'خيار محلي طازج', pricePerKg: 0.700, icon: '🥒', isPopular: true, category: 'PRODUCE' },
  { code: '111', name: 'Iemone', nameAr: 'ليمون أصفر', pricePerKg: 1.400, icon: '🍋', isPopular: true, category: 'PRODUCE' },
  { code: '112', name: 'Carate', nameAr: 'جزر طازج ممتاز', pricePerKg: 0.800, icon: '🥕', isPopular: true, category: 'PRODUCE' },
  { code: '113', name: 'Capsicam', nameAr: 'فلفل بارد رومي', pricePerKg: 1.200, icon: '🫑', isPopular: true, category: 'PRODUCE' },
  { code: '115', name: 'Baigane B', nameAr: 'باذنجان أسود', pricePerKg: 0.800, icon: '🍆', isPopular: true, category: 'PRODUCE' },
  { code: '119', name: 'Ladeyfinger', nameAr: 'بامية خضراء طازجة', pricePerKg: 1.800, icon: '🫛', isPopular: true, category: 'PRODUCE' },
  { code: '120', name: 'AVARAKA', nameAr: 'أفاراكا خضار', pricePerKg: 1.200, icon: '🫛', isPopular: true, category: 'PRODUCE' },
  { code: '121', name: 'Kerala', nameAr: 'كارلا / كيريلا مر', pricePerKg: 1.200, icon: '🥒', isPopular: true, category: 'PRODUCE' },
  { code: '125', name: 'Stick muriga', nameAr: 'مورينجا / عيدان طازجة', pricePerKg: 2.200, icon: '🌿', isPopular: true, category: 'PRODUCE' },
  { code: '126', name: 'BEEF', nameAr: 'لحم بقري طازج', pricePerKg: 3.900, icon: '🥩', isPopular: true, category: 'MEAT' },
  { code: '127', name: 'CHICKEN LOOS', nameAr: 'دجاج طازج سائب', pricePerKg: 1.500, icon: '🍗', isPopular: true, category: 'MEAT' },
  { code: '128', name: 'CHIKEN  FINGER', nameAr: 'أصابع دجاج', pricePerKg: 1.200, icon: '🍗', isPopular: true, category: 'MEAT' },
];

/**
 * Predictive Omni-Pad Component (Full-Screen & High-Speed Retail Workflow)
 * Merges PLU Short Code lookup and Fresh Scale item weight entry into a unified,
 * single-focus full screen interface for Sunmi Terminals & Desktop POS.
 * 
 * Target Audience: Cashiers aged 60-80.
 * Ergonomics: Pure OLED Black, extreme visual feedback, massive tap targets.
 */
export const PredictiveOmniPad: React.FC<PredictiveOmniPadProps> = ({
  initialItem = null,
  onAddToCart,
  onTenderCash,
  onTenderBenefit,
  onTenderKhata,
  onClose,
  onResetItem,
  customItems,
  currencySymbol = 'BD',
  unitSymbol = 'KG',
  className = '',
  isFullscreen = true,
  cartCount = 0,
  cartTotal = 0
}) => {
  const items = useMemo(() => {
    return customItems !== undefined ? customItems : DEFAULT_OMNI_ITEMS;
  }, [customItems]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const autoLockTimerRef = useRef<any>(null);

  const clearAutoLockTimer = useCallback(() => {
    if (autoLockTimerRef.current) {
      clearTimeout(autoLockTimerRef.current);
      autoLockTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearAutoLockTimer();
  }, [clearAutoLockTimer]);

  // Active Category Filter for Fresh Omni-Pad
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  // Numpad input string (used for code in State 1 & 2; weight in State 3)
  const [typedCode, setTypedCode] = useState<string>('');
  const deferredTypedCode = useDeferredValue(typedCode);
  const [selectedItem, setSelectedItem] = useState<OmniItem | null>(initialItem || null);
  const [weightInput, setWeightInput] = useState<string>('0');

  useEffect(() => {
    setSelectedItem(initialItem || null);
    setWeightInput('0');
    if (!initialItem) {
      setTypedCode('');
    }
  }, [initialItem]);

  // Audio click feedback
  const playChime = useCallback((frequency = 800) => {
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

  // ---------------------------------------------------------------------------
  // FILTERING LOGIC (The Predictive Visual Viewport)
  // ---------------------------------------------------------------------------
  const filteredItems = useMemo(() => {
    let list = items;
    if (activeCategory !== 'ALL') {
      list = list.filter((item) => (item.category || 'PRODUCE').toUpperCase() === activeCategory);
    }
    const query = deferredTypedCode.trim().toLowerCase();
    if (!query) {
      // State 1: All items (popular items first)
      return [...list].sort((a, b) => (b.isPopular ? 1 : 0) - (a.isPopular ? 1 : 0));
    }
    // State 2: Instant prefix/contains filtering across code, name, Arabic name & barcode
    return list.filter((item) => {
      const matchCode = item.code.toLowerCase().includes(query);
      const matchName = item.name.toLowerCase().includes(query);
      const matchNameAr = item.nameAr ? item.nameAr.toLowerCase().includes(query) : false;
      const matchBarcode = item.barcode ? item.barcode.toLowerCase().includes(query) : false;
      return matchCode || matchName || matchNameAr || matchBarcode;
    });
  }, [items, deferredTypedCode, activeCategory]);

  // Exact code match
  const exactMatch = useMemo(() => {
    if (!typedCode) return null;
    return items.find((i) => i.code === typedCode) || null;
  }, [items, typedCode]);

  // ---------------------------------------------------------------------------
  // STATE TRANSITIONS & SPEED WORKFLOW HANDLERS
  // ---------------------------------------------------------------------------
  const handleSelectItem = (item: OmniItem) => {
    clearAutoLockTimer();
    playChime(950);
    setSelectedItem(item);
    setWeightInput('0');
  };

  const handleCancelSelection = () => {
    clearAutoLockTimer();
    playChime(600);
    setSelectedItem(null);
    setWeightInput('0');
    onResetItem?.();
  };

  const handleClearCode = () => {
    clearAutoLockTimer();
    playChime(500);
    setTypedCode('');
    searchInputRef.current?.focus();
  };

  // Dedicated Fresh Omni-Pad Handler (Resets selection to search other products instantly)
  const handleFreshOmniPad = useCallback(() => {
    clearAutoLockTimer();
    playChime(750);
    setSelectedItem(null);
    setWeightInput('0');
    setTypedCode('');
    onResetItem?.();
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 60);
  }, [playChime, onResetItem, clearAutoLockTimer]);

  // Numpad Tap Dispatcher
  const handlePadTap = (key: string) => {
    playChime(850);

    // STATE 3: Weight Entry Mode
    if (selectedItem) {
      if (key === 'CLEAR') {
        setWeightInput('0');
        return;
      }
      if (key === 'BACKSPACE') {
        if (weightInput.length <= 1 || weightInput === '0') {
          setWeightInput('0');
        } else {
          setWeightInput((prev) => prev.slice(0, -1));
        }
        return;
      }
      if (key === '.') {
        if (!weightInput.includes('.')) {
          setWeightInput(weightInput === '0' ? '0.' : weightInput + '.');
        }
        return;
      }
      // Numbers 0-9
      if (weightInput === '0') {
        setWeightInput(key);
      } else {
        const parts = weightInput.split('.');
        if (parts.length === 2 && parts[1].length >= 3) return; // 3 decimal places
        if (weightInput.length >= 7) return;
        setWeightInput((prev) => prev + key);
      }
      return;
    }

    // STATE 1 & 2: PLU Code Lookup Mode
    if (key === 'CLEAR') {
      clearAutoLockTimer();
      setTypedCode('');
      return;
    }
    if (key === 'BACKSPACE') {
      clearAutoLockTimer();
      setTypedCode((prev) => prev.slice(0, -1));
      return;
    }
    if (key === '.') {
      return; // No decimals in PLU short codes
    }
    // Numbers 0-9
    if (typedCode.length < 5) {
      clearAutoLockTimer();
      const nextCode = typedCode + key;
      setTypedCode(nextCode);

      // Intelligent Auto-Locking with Prefix Collision Resolution:
      // If code matches an item:
      // 1. If strictly unique (no longer codes share prefix) -> instant auto-lock (120ms)
      // 2. If longer codes share prefix (e.g. typed '10', but '101'..'110' exist) ->
      //    debounce 350ms. If cashier stops typing, auto-lock '10'!
      //    If they keep typing, timer clears and 3-digit item locks immediately.
      const matched = items.find((i) => i.code === nextCode);
      if (matched) {
        const longerMatches = items.filter((i) => i.code !== nextCode && i.code.startsWith(nextCode));
        if (longerMatches.length === 0) {
          autoLockTimerRef.current = setTimeout(() => {
            handleSelectItem(matched);
          }, 120);
        } else {
          autoLockTimerRef.current = setTimeout(() => {
            handleSelectItem(matched);
          }, 350);
        }
      }
    }
  };

  // Quick preset weight buttons (+0.25, +0.5, +1.0, +2.0 KG)
  const handleAddPreset = (delta: number) => {
    playChime(900);
    const curr = parseFloat(weightInput) || 0;
    const next = (curr + delta).toFixed(3);
    setWeightInput(parseFloat(next).toString());
  };

  // Calculations
  const numericWeight = parseFloat(weightInput) || 0;
  const isValidWeight = numericWeight > 0;
  const computedTotal = selectedItem
    ? (numericWeight * selectedItem.pricePerKg).toFixed(3)
    : '0.000';

  const handleConfirmAddToCart = (keepOpen: boolean = false) => {
    if (!selectedItem || !isValidWeight) return;
    playChime(1100);
    onAddToCart?.(selectedItem, numericWeight, parseFloat(computedTotal), keepOpen);
    // Reset back to State 1 (Fresh Omni-Pad ready for searching other products)
    setSelectedItem(null);
    setTypedCode('');
    setWeightInput('0');
    onResetItem?.();
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 60);
  };

  // Keyboard support (Sunmi physical numpad, barcode scanner, or desktop keyboard)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if an input is active
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (selectedItem) {
          handleCancelSelection();
        } else if (typedCode) {
          handleClearCode();
        } else if (onClose) {
          onClose();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        clearAutoLockTimer();
        if (selectedItem) {
          if (isValidWeight) handleConfirmAddToCart();
        } else if (exactMatch) {
          handleSelectItem(exactMatch);
        } else if (filteredItems.length === 1) {
          handleSelectItem(filteredItems[0]);
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
  }, [selectedItem, typedCode, weightInput, isValidWeight, exactMatch, filteredItems]);

  return (
    <div className={`w-full h-full flex flex-col bg-black text-white select-none font-sans overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50' : ''} ${className}`}>

      {/* =================================================================== */}
      {/* FULL-SCREEN TOP NAVIGATION HEADER                                   */}
      {/* =================================================================== */}
      <div className="h-16 px-4 md:px-6 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between shrink-0">

        {/* Brand / Mode Indicator */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/20 text-green-400 border border-green-500/40 flex items-center justify-center text-xl font-black">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm md:text-base font-black tracking-wider text-white">
                PREDICTIVE OMNI-PAD
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-green-500 text-black uppercase tracking-wider">
                FULL SCREEN
              </span>
            </div>
            <div className="text-xs text-zinc-400 font-medium hidden sm:block">
              High-Speed Scale Weight & PLU Short Codes • Layali Supermarket
            </div>
          </div>
        </div>

        {/* Center: Live Workflow Pill */}
        <div className="hidden md:flex items-center gap-2">
          {selectedItem ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-green-950/60 border border-green-500/60 px-3 py-1 rounded-xl">
                <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-ping" />
                <span className="text-xs font-black text-green-300 uppercase tracking-wide">
                  SCALE WEIGHT ({selectedItem.name})
                </span>
              </div>
              <button
                type="button"
                data-testid="omni-fresh-pad-top-btn"
                onClick={handleFreshOmniPad}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-black rounded-xl border border-blue-400 shadow flex items-center gap-1.5 cursor-pointer transition-all"
                title="Reset to Fresh Omni-Pad to search other products"
              >
                <Sparkles size={13} className="text-amber-300" />
                <span>FRESH OMNI-PAD</span>
              </button>
            </div>
          ) : typedCode ? (
            <div className="flex items-center gap-2 bg-blue-950/60 border border-blue-500/60 px-3 py-1 rounded-xl">
              <span className="text-xs font-black text-blue-300 uppercase tracking-wide">
                🔍 FILTERING PLU: #{typedCode} ({filteredItems.length} match{filteredItems.length === 1 ? '' : 'es'})
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3 py-1 rounded-xl">
              <span className="text-xs font-bold text-zinc-300">
                👉 Tap Item Card or Type PLU Code on Numpad
              </span>
            </div>
          )}

          {cartCount > 0 && (
            <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 px-3 py-1 rounded-xl text-xs font-bold text-zinc-300 font-mono">
              <ShoppingCart size={13} className="text-amber-400" />
              <span>{cartCount} in cart ({currencySymbol} {cartTotal.toFixed(3)})</span>
            </div>
          )}
        </div>

        {/* Right: Exit / Close Button */}
        <div className="flex items-center gap-2">
          <kbd className="hidden sm:inline-block px-2 py-1 bg-neutral-900 border border-neutral-800 rounded text-xs font-mono font-bold text-zinc-400">
            Esc
          </kbd>
          {onClose && (
            <button
              type="button"
              data-testid="omni-close-fullscreen-btn"
              onClick={onClose}
              className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 active:scale-95 text-white font-bold text-sm rounded-xl border border-neutral-700 hover:border-red-500 flex items-center gap-2 transition-all cursor-pointer"
            >
              <X size={18} className="text-red-400" />
              <span className="hidden sm:inline">BACK TO REGISTER</span>
            </button>
          )}
        </div>
      </div>

      {/* =================================================================== */}
      {/* MAIN TWO-COLUMN FULL-SCREEN WORKSPACE                               */}
      {/* =================================================================== */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* ----------------------------------------------------------------- */}
        {/* LEFT COLUMN: THE VISUAL SPEED VIEWPORT & SCALE READOUT (~55% width) */}
        {/* ----------------------------------------------------------------- */}
        <div className="flex-1 flex flex-col bg-black p-3 md:p-6 border-b lg:border-b-0 lg:border-r border-neutral-800 overflow-hidden">

          {/* Viewport Sub-header */}
          <div className="flex items-center justify-between pb-3 shrink-0">
            <div className="flex items-center gap-2">
              <Scale size={20} className="text-green-400" />
              <span className="text-sm md:text-base font-black uppercase tracking-wider text-zinc-300">
                {selectedItem ? 'Physical Scale Reading' : 'Visual Speed Grid (Produce & Loose Items)'}
              </span>
            </div>

            {!selectedItem && typedCode && (
              <button
                type="button"
                onClick={handleClearCode}
                className="text-xs font-black text-red-400 hover:text-red-300 bg-red-950/40 border border-red-900/60 px-2.5 py-1 rounded-lg cursor-pointer transition-colors"
              >
                Clear Search [CLR]
              </button>
            )}
          </div>

          {/* --------------------------------------------------------------- */}
          {/* STATE 1 & 2: EXPANSIVE TOUCH CARDS GRID (Produce & Loose Items) */}
          {/* --------------------------------------------------------------- */}
          {!selectedItem && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* High-Speed Search Input Bar */}
              <div className="relative mb-2.5 shrink-0">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                  <Search size={18} />
                </div>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={typedCode}
                  onChange={(e) => setTypedCode(e.target.value)}
                  placeholder="Search other product (Name, Arabic, or PLU #)..."
                  className="w-full pl-10 pr-24 py-2.5 bg-neutral-900 border-2 border-neutral-800 focus:border-green-500 rounded-2xl text-white font-bold text-sm placeholder-zinc-500 focus:outline-none transition-all shadow-inner"
                />
                {typedCode && (
                  <button
                    type="button"
                    onClick={handleClearCode}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs font-black text-red-400 hover:text-red-300 cursor-pointer"
                  >
                    <span className="bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700">CLR ✕</span>
                  </button>
                )}
              </div>

              {/* Category Filter Chips for Quick Browsing */}
              <div className="flex items-center gap-1.5 pb-2.5 overflow-x-auto scrollbar-hide shrink-0">
                {[
                  { id: 'ALL', label: 'All Items' },
                  { id: 'PRODUCE', label: 'Produce 🥦' },
                  { id: 'ESSENTIALS', label: 'Essentials 🌾' },
                  { id: 'MEAT', label: 'Meat 🥩' },
                  { id: 'SWEETS', label: 'Sweets 🍬' }
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer ${activeCategory === cat.id
                      ? 'bg-green-500 text-black shadow-md shadow-green-500/20'
                      : 'bg-neutral-900 text-zinc-400 hover:text-white border border-neutral-800'
                      }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto pr-1 scrollbar-hide">
                {filteredItems.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                    {filteredItems.map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        data-testid="omni-item-card"
                        onClick={() => handleSelectItem(item)}
                        className="min-h-[140px] md:min-h-[170px] bg-neutral-900 hover:bg-neutral-850 active:bg-neutral-800 active:scale-95 border-2 border-neutral-800 hover:border-green-500 rounded-2xl md:rounded-3xl p-3 md:p-4 flex flex-col items-center justify-between text-center cursor-pointer shadow-xl transition-all group shrink-0"
                      >
                        {/* Top Bar: PLU Code badge & Unit Price */}
                        <div className="w-full flex items-center justify-between">
                          <span className="bg-black/90 border border-neutral-700 px-2.5 py-0.5 rounded-lg text-xs md:text-sm font-mono font-black text-blue-400">
                            #{item.code}
                          </span>
                          <span className="text-xs md:text-sm font-mono font-bold text-zinc-300">
                            {currencySymbol} {item.pricePerKg.toFixed(3)}
                          </span>
                        </div>

                        {/* Giant Photo / Emoji Icon (Prioritizes 80x80 Micro WebP for 0ms Sunmi Render) */}
                        <div className="w-16 h-16 md:w-20 md:h-20 my-1 flex items-center justify-center transform group-hover:scale-110 transition-transform">
                          {(item.imageUrlThumb || item.imageUrl) ? (
                            <img
                              src={item.imageUrlThumb || item.imageUrl || ''}
                              alt={item.name}
                              className="w-full h-full object-cover rounded-2xl shadow-md border border-neutral-700/60"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <span className="text-5xl md:text-6xl">{item.icon}</span>
                          )}
                        </div>

                        {/* Item Names */}
                        <div className="w-full">
                          <div className="text-base md:text-xl font-black text-white leading-tight truncate">
                            {item.name}
                          </div>
                          {item.nameAr && (
                            <div className="text-xs md:text-sm font-bold text-zinc-400 truncate mt-0.5">
                              {item.nameAr}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  /* No Matches State */
                  <div className="h-full bg-neutral-900/40 border-2 border-dashed border-neutral-800 rounded-3xl flex flex-col items-center justify-center p-8 text-center">
                    <span className="text-6xl mb-3">🔍</span>
                    <h3 className="text-2xl font-black text-red-400">
                      No Loose Item Found for "{typedCode}"
                    </h3>
                    <p className="text-sm text-zinc-400 mt-2 max-w-sm">
                      Check the produce name or PLU short code, or tap the button below to reset the keypad.
                    </p>
                    <button
                      type="button"
                      onClick={handleClearCode}
                      className="mt-4 px-6 py-2.5 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-black text-sm rounded-xl cursor-pointer transition-all"
                    >
                      RESET SEARCH [CLR]
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* STATE 3: LOCKED ITEM SHOWCASE & DIGITAL SCALE DISPLAY           */}
          {/* --------------------------------------------------------------- */}
          {selectedItem && (
            <div className="flex-1 flex flex-col justify-between space-y-4 animate-in zoom-in-95 duration-150">

              {/* Selected Item Hero Header */}
              <div className="bg-neutral-900 border-2 border-green-500/80 rounded-3xl p-4 md:p-6 flex items-center justify-between shadow-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 md:w-24 md:h-24 bg-black/80 border border-neutral-800 rounded-2xl flex items-center justify-center text-6xl md:text-7xl shrink-0 shadow-inner overflow-hidden">
                    {(selectedItem.imageUrlThumb || selectedItem.imageUrl) ? (
                      <img
                        src={selectedItem.imageUrlThumb || selectedItem.imageUrl || ''}
                        alt={selectedItem.name}
                        className="w-full h-full object-cover rounded-2xl"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      selectedItem.icon
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-600/40 text-blue-300 border border-blue-500/60 px-2 py-0.5 rounded-lg text-xs font-mono font-black">
                        PLU #{selectedItem.code}
                      </span>
                      <span className="text-sm font-mono font-bold text-zinc-300">
                        {currencySymbol} {selectedItem.pricePerKg.toFixed(3)} / {unitSymbol}
                      </span>
                    </div>
                    <h2 className="text-2xl md:text-4xl font-black text-white leading-tight uppercase mt-1">
                      {selectedItem.name}
                    </h2>
                    {selectedItem.nameAr && (
                      <p className="text-sm md:text-base font-bold text-zinc-400 mt-0.5">
                        {selectedItem.nameAr}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                  <button
                    type="button"
                    data-testid="omni-fresh-pad-hero-btn"
                    onClick={handleFreshOmniPad}
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white font-black text-xs md:text-sm rounded-2xl border-2 border-blue-400 shadow-lg shadow-blue-600/30 flex items-center gap-2 cursor-pointer transition-all uppercase tracking-wider shrink-0"
                    title="Reset to Fresh Omni-Pad to search other products"
                  >
                    <Sparkles size={16} className="text-amber-300" />
                    <span>Fresh Omni-Pad (Search)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelSelection}
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-zinc-400 hover:text-white rounded-xl text-xs font-bold border border-neutral-700 cursor-pointer transition-colors"
                  >
                    Change
                  </button>
                </div>
              </div>

              {/* Real Digital Scale Display (Bizerba / Mettler Toledo style) */}
              <div className="flex-1 bg-black border-2 border-green-500 shadow-[0_0_40px_rgba(34,197,94,0.18)] rounded-3xl p-6 md:p-8 flex flex-col justify-center items-center text-center relative overflow-hidden">
                <div className="absolute top-4 left-6 text-xs font-black tracking-widest text-zinc-500 uppercase flex items-center gap-2">
                  <Scale size={16} className="text-green-400" />
                  <span>SCALE NET WEIGHT READOUT</span>
                </div>

                {/* Massive Glowing Weight Digits */}
                <div className="flex items-baseline justify-center my-3">
                  <span className={`text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-mono font-black tracking-wider transition-colors ${isValidWeight ? 'text-green-400 drop-shadow-[0_0_20px_rgba(34,197,94,0.5)]' : 'text-zinc-700'
                    }`}>
                    {weightInput}
                  </span>
                  <span className="text-3xl md:text-4xl font-mono font-black text-zinc-500 ml-3">
                    {unitSymbol}
                  </span>
                </div>

                {/* Live Formula & Subtotal */}
                <div className="mt-2 py-2 px-6 bg-neutral-900/80 border border-neutral-800 rounded-2xl flex items-center gap-3 text-sm md:text-lg font-mono">
                  <span className="text-zinc-400">
                    {currencySymbol} {selectedItem.pricePerKg.toFixed(3)} × {weightInput} {unitSymbol} =
                  </span>
                  <span className="text-2xl md:text-3xl font-black text-white">
                    {currencySymbol} {computedTotal}
                  </span>
                </div>

                {/* Direct quick button to search other products */}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={handleFreshOmniPad}
                    className="px-4 py-1.5 bg-neutral-900/90 hover:bg-neutral-850 active:scale-95 text-blue-400 hover:text-blue-300 border border-blue-500/40 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md"
                  >
                    <Search size={14} />
                    <span>Search Other Product (Fresh Omni-Pad)</span>
                  </button>
                </div>
              </div>

              {/* Quick Weight Preset Chips (+0.25, +0.5, +1.0, +2.0 KG) */}
              <div className="grid grid-cols-4 gap-2 md:gap-3 shrink-0">
                {[0.25, 0.5, 1.0, 2.0].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleAddPreset(preset)}
                    className="py-3 bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-zinc-200 hover:text-white border-2 border-neutral-800 hover:border-green-500 rounded-2xl text-base md:text-lg font-black cursor-pointer transition-all shadow-md"
                  >
                    +{preset} {unitSymbol}
                  </button>
                ))}
              </div>

            </div>
          )}

        </div>

        {/* ----------------------------------------------------------------- */}
        {/* RIGHT COLUMN: THE PERMANENT OMNI-PAD NUMPAD (~45% width)           */}
        {/* ----------------------------------------------------------------- */}
        <div className="w-full lg:w-[480px] xl:w-[540px] flex flex-col justify-between bg-neutral-950 p-4 md:p-6 shrink-0 overflow-hidden">

          {/* Numpad Header / Active Value Readout */}
          <div className="h-14 bg-neutral-900 border border-neutral-800 rounded-2xl px-4 flex items-center justify-between mb-3 shrink-0">
            <span className="text-xs uppercase font-bold text-zinc-400">
              {selectedItem ? 'Type Weight on Pad:' : 'Type Short Code on Pad:'}
            </span>
            <span className="text-2xl font-mono font-black text-blue-400">
              {selectedItem ? `${weightInput} ${unitSymbol}` : typedCode ? `#${typedCode}` : 'Ready'}
            </span>
          </div>

          {/* The Oversized Keypad Grid (Keys are min-h-[72px] to min-h-[92px]) */}
          <div className="grid grid-cols-3 gap-2.5 md:gap-3 flex-1 auto-rows-fr my-1">
            {/* Digits 1-9 */}
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                data-testid={`omni-key-${digit}`}
                onClick={() => handlePadTap(digit)}
                className="min-h-[64px] md:min-h-[80px] lg:min-h-[90px] h-full bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-3xl md:text-4xl rounded-2xl md:rounded-3xl border-2 border-neutral-800 hover:border-green-500 shadow-xl cursor-pointer flex items-center justify-center transition-all select-none"
              >
                {digit}
              </button>
            ))}

            {/* Row 4: Key '.' in Weight mode vs 'CLR' in Code mode */}
            <button
              type="button"
              onClick={() => handlePadTap(selectedItem ? '.' : 'CLEAR')}
              className={`min-h-[64px] md:min-h-[80px] lg:min-h-[90px] h-full bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 font-black rounded-2xl md:rounded-3xl border-2 border-neutral-800 shadow-xl cursor-pointer flex items-center justify-center transition-all select-none ${selectedItem ? 'text-white text-4xl md:text-5xl' : 'text-red-400 text-xl md:text-2xl'
                }`}
            >
              {selectedItem ? '.' : 'CLR'}
            </button>

            {/* Digit 0 */}
            <button
              type="button"
              data-testid="omni-key-0"
              onClick={() => handlePadTap('0')}
              className="min-h-[64px] md:min-h-[80px] lg:min-h-[90px] h-full bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-white font-black text-3xl md:text-4xl rounded-2xl md:rounded-3xl border-2 border-neutral-800 hover:border-green-500 shadow-xl cursor-pointer flex items-center justify-center transition-all select-none"
            >
              0
            </button>

            {/* Backspace ⌫ */}
            <button
              type="button"
              onClick={() => handlePadTap('BACKSPACE')}
              className="min-h-[64px] md:min-h-[80px] lg:min-h-[90px] h-full bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 active:scale-95 text-red-400 hover:text-red-300 font-black text-2xl md:text-3xl rounded-2xl md:rounded-3xl border-2 border-neutral-800 shadow-xl cursor-pointer flex items-center justify-center transition-all select-none"
              title="Delete last digit"
            >
              ⌫
            </button>
          </div>

          {/* Bottom Action Bar */}
          <div className="h-16 md:h-20 pt-2 shrink-0">
            {selectedItem ? (
              /* State 3: Bottom Action Bar - CANCEL, FRESH OMNI-PAD, ADD & NEXT, ADD TO CART */
              <div className="h-full grid grid-cols-4 gap-2">
                <button
                  type="button"
                  data-testid="omni-cancel-btn"
                  onClick={handleCancelSelection}
                  className="h-full bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-zinc-300 hover:text-white font-black text-xs md:text-sm rounded-2xl shadow-lg flex items-center justify-center gap-1.5 cursor-pointer border border-neutral-700 transition-all uppercase"
                >
                  <ArrowLeft size={18} strokeWidth={2.5} />
                  <span>CANCEL</span>
                </button>

                <button
                  type="button"
                  data-testid="omni-fresh-action-btn"
                  onClick={handleFreshOmniPad}
                  className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white font-black text-xs md:text-sm rounded-2xl shadow-lg flex items-center justify-center gap-1.5 cursor-pointer border border-blue-400/50 transition-all uppercase"
                  title="Clear selection and open fresh Omni-Pad to search other products"
                >
                  <Sparkles size={18} className="text-yellow-300 animate-pulse" />
                  <span className="truncate">FRESH PAD</span>
                </button>

                <button
                  type="button"
                  data-testid="omni-add-next-btn"
                  disabled={!isValidWeight}
                  onClick={() => handleConfirmAddToCart(true)}
                  className={`h-full font-black text-xs md:text-sm rounded-2xl shadow-lg flex items-center justify-center gap-1.5 border transition-all uppercase ${isValidWeight
                    ? 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)] cursor-pointer'
                    : 'bg-emerald-950/40 text-emerald-900/40 border-emerald-900/20 cursor-not-allowed'
                    }`}
                  title="Add to cart and immediately keep Omni-Pad fresh for next product"
                >
                  <Plus size={18} strokeWidth={3} />
                  <span className="truncate">ADD & NEXT</span>
                </button>

                <button
                  type="button"
                  data-testid="omni-add-btn"
                  disabled={!isValidWeight}
                  onClick={() => handleConfirmAddToCart(false)}
                  className={`h-full font-black text-xs md:text-base rounded-2xl shadow-xl flex items-center justify-center gap-1.5 border-2 transition-all uppercase ${isValidWeight
                    ? 'bg-green-500 hover:bg-green-400 active:scale-95 text-black border-green-400 shadow-[0_0_25px_rgba(34,197,94,0.4)] cursor-pointer'
                    : 'bg-green-950/40 text-green-900/40 border-green-900/20 cursor-not-allowed'
                    }`}
                >
                  <Check size={20} strokeWidth={3.5} />
                  <span className="truncate">ADD TO CART</span>
                </button>
              </div>
            ) : (
              /* State 1 & 2: Tender Action Buttons */
              <div className="h-full grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={onTenderCash}
                  className="h-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-sm md:text-base rounded-2xl shadow-lg border border-emerald-500 flex flex-col items-center justify-center cursor-pointer transition-all uppercase leading-tight"
                >
                  <div className="flex items-center gap-1.5">
                    <Banknote size={18} />
                    <span>CASH</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-200">[F1] Tender</span>
                </button>

                <button
                  type="button"
                  onClick={onTenderBenefit}
                  className="h-full bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-black text-sm md:text-base rounded-2xl shadow-lg border border-rose-500 flex flex-col items-center justify-center cursor-pointer transition-all uppercase leading-tight"
                >
                  <div className="flex items-center gap-1.5">
                    <Smartphone size={16} />
                    <span>BENEFIT</span>
                  </div>
                  <span className="text-[10px] font-mono text-rose-200">Fawri+ QR</span>
                </button>

                <button
                  type="button"
                  onClick={onTenderKhata}
                  className="h-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-black text-sm md:text-base rounded-2xl shadow-lg border border-indigo-500 flex flex-col items-center justify-center cursor-pointer transition-all uppercase leading-tight"
                >
                  <div className="flex items-center gap-1.5">
                    <CreditCard size={16} />
                    <span>CARD/KHATA</span>
                  </div>
                  <span className="text-[10px] font-mono text-indigo-200">[F2] Card / NFC</span>
                </button>
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
};

export default PredictiveOmniPad;
