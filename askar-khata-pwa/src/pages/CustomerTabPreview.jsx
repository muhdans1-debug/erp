import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  ShieldCheck,
  ArrowLeft,
  Share2,
  Lock,
  Unlock,
  CheckCircle2,
  WifiOff,
  Printer,
  PhoneCall,
  MessageCircle,
  Clock,
  Volume2,
  VolumeX,
  QrCode,
  Eye,
  EyeOff,
  Menu,
  User,
  Users,
  RotateCw,
  Search,
  X,
  ShoppingBag,
  CreditCard,
  Receipt,
  Bell,
  Fingerprint,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Smartphone,
  Maximize2,
  Minimize2,
  ExternalLink,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft
} from 'lucide-react';

// Mock Customer Presets for testing
const MOCK_CUSTOMERS = {
  mohammed: {
    id: 'CUST-8492',
    name: 'Mohammed Al-Doseri',
    nameAr: 'محمد الدوسري',
    nameMl: 'മുഹമ്മദ് അൽ ദോസരി',
    phone: '+973 3920 1842',
    cpr: '880419201',
    balance: 79.725,
    creditLimit: 100.000,
    hasMessGroup: true,
    messGroupName: 'Askar Camp Mess #12',
    messRoomTotal: 207.150,
    messMembersCount: 6,
    myMessShare: 34.525,
    personalBalance: 45.200,
    isActive: true,
    recentPurchases: [
      {
        id: 'tx_01',
        invoiceNo: 'INV-84920',
        timestamp: '2026-11-21T20:45:00Z',
        type: 'PURCHASE',
        amount: 2.950,
        runningBalance: 79.725,
        itemCount: 3,
        items: [
          { name: 'Almarai Fresh Milk 2L', nameAr: 'حليب المراعي 2 لتر', qty: 1, unitPrice: 1.050, total: 1.050 },
          { name: 'Khubz Flatbread (5 pcs)', nameAr: 'خبز لبناني 5 حبات', qty: 1, unitPrice: 0.100, total: 0.100 },
          { name: 'Fresh White Eggs 30s', nameAr: 'طبق بيض طازج 30 حبة', qty: 1, unitPrice: 1.800, total: 1.800 }
        ]
      },
      {
        id: 'tx_02',
        invoiceNo: 'PAY-40192',
        timestamp: '2026-11-19T17:15:00Z',
        type: 'PAYMENT',
        amount: -25.000,
        runningBalance: 76.775,
        channel: 'BenefitPay Fawri+',
        items: []
      },
      {
        id: 'tx_03',
        invoiceNo: 'INV-84102',
        timestamp: '2026-11-17T19:30:00Z',
        type: 'PURCHASE',
        amount: 8.420,
        runningBalance: 101.775,
        itemCount: 4,
        items: [
          { name: 'Loose Red Tomatoes (1.5 kg)', nameAr: 'طماطم بالكيلو', qty: 1.5, unitPrice: 0.350, total: 0.525 },
          { name: 'Chiquita Bananas (1.2 kg)', nameAr: 'موز شيكيتا بالكيلو', qty: 1.2, unitPrice: 0.550, total: 0.660 },
          { name: 'Basmati Rice 5kg Bag', nameAr: 'أرز بسمتي 5 كغ', qty: 1, unitPrice: 4.800, total: 4.800 },
          { name: 'Sunflower Cooking Oil 1.5L', nameAr: 'زيت دوار الشمس', qty: 1, unitPrice: 2.435, total: 2.435 }
        ]
      },
      {
        id: 'tx_04',
        invoiceNo: 'INV-83800',
        timestamp: '2026-11-14T21:10:00Z',
        type: 'PURCHASE',
        amount: 1.200,
        runningBalance: 93.355,
        itemCount: 2,
        items: [
          { name: 'Marlboro Gold Box', nameAr: 'سجائر مالبورو', qty: 1, unitPrice: 1.200, total: 1.200 }
        ]
      }
    ]
  },
  rajesh: {
    id: 'CUST-3104',
    name: 'Rajesh Kumar',
    nameAr: 'راجيش كومار',
    nameMl: 'രാജേഷ് കുമാർ',
    phone: '+973 3411 9901',
    cpr: '921104882',
    balance: 14.500,
    creditLimit: 40.000,
    hasMessGroup: false,
    isActive: true,
    recentPurchases: [
      {
        id: 'tx_11',
        invoiceNo: 'INV-79012',
        timestamp: '2026-11-20T18:20:00Z',
        type: 'PURCHASE',
        amount: 4.500,
        runningBalance: 14.500,
        itemCount: 2,
        items: [
          { name: 'Tea Dust 400g Red Label', nameAr: 'شاي ريد ليبل 400غ', qty: 1, unitPrice: 1.300, total: 1.300 },
          { name: 'Sugar 5kg Bag', nameAr: 'سكر 5 كغ', qty: 1, unitPrice: 3.200, total: 3.200 }
        ]
      },
      {
        id: 'tx_12',
        invoiceNo: 'PAY-39001',
        timestamp: '2026-11-10T12:00:00Z',
        type: 'PAYMENT',
        amount: -10.000,
        runningBalance: 10.000,
        channel: 'Cash Counter',
        items: []
      }
    ]
  },
  ali_settled: {
    id: 'CUST-1088',
    name: 'Ali Hassan',
    nameAr: 'علي حسن',
    nameMl: 'അലി ഹസ്സൻ',
    phone: '+973 3655 4410',
    cpr: '850119302',
    balance: 0.000,
    creditLimit: 50.000,
    hasMessGroup: false,
    isActive: true,
    recentPurchases: [
      {
        id: 'tx_21',
        invoiceNo: 'PAY-40010',
        timestamp: '2026-11-18T16:00:00Z',
        type: 'PAYMENT',
        amount: -35.200,
        runningBalance: 0.000,
        channel: 'BenefitPay Fawri+',
        items: []
      }
    ]
  }
};

/**
 * CustomerTabPreview: Zero-Stutter Apple Same-Card Shrink & Morph
 *
 * Solutions implemented:
 * 1. Persistent Unified DOM: The header, customer name, CPR, and buttons NEVER unmount during transition.
 * 2. Cross-fade & scale: Inner elements smoothly fade and collapse without layout thrashing.
 * 3. Directional lock: Huge hysteresis buffer prevents slow-scroll vibration/flapping.
 * 4. Swipe Gestures: Full touch gesture support for buttery smooth transitions.
 */
export default function CustomerTabPreview() {
  const [selectedPresetKey, setSelectedPresetKey] = useState('mohammed');

  // Default to native full-screen on mobile devices
  const [isPhoneFrame, setIsPhoneFrame] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 640;
    }
    return false;
  });

  const [lang, setLang] = useState('en');
  const [hideBalance, setHideBalance] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showBenefitModal, setShowBenefitModal] = useState(false);
  const [filterType, setFilterType] = useState('ALL');

  // Morph State: false = Big Hero Card, true = Compact Sticky Card
  const [isCompact, setIsCompact] = useState(false);
  const scrollContainerRef = useRef(null);
  const touchStartYRef = useRef(0);
  const touchLastYRef = useRef(0);
  const isTouchActiveRef = useRef(false);

  // Card-to-List Active Promotion State ('BALANCE' | 'INVOICE' | 'MESS')
  const [activeFocus, setActiveFocus] = useState('BALANCE');
  const [promotedTx, setPromotedTx] = useState(null);

  const customer = MOCK_CUSTOMERS[selectedPresetKey] || MOCK_CUSTOMERS.mohammed;
  const isRtl = lang === 'ar';

  const absBalance = Math.abs(customer.balance).toFixed(3);
  const isCredit = customer.balance < 0;
  const isSettled = customer.balance === 0;

  // Directional Lock Scroll Listener:
  // When scrolling down past 35px, trigger compact mode.
  // CRITICAL: NEVER revert isCompact to false automatically during normal scroll!
  // Reverting to expanded is ONLY triggered when the user explicitly:
  // 1. Taps "Full" button
  // 2. Taps "Reset" button
  // 3. Deliberately pulls DOWN when already at scrollTop <= 0.
  // This mathematical directional lock 100% prevents threshold flapping, shuttering, and glitching!
  const tickingRef = useRef(false);
  const handleScroll = useCallback((e) => {
    const top = e.currentTarget.scrollTop;
    if (!tickingRef.current) {
      window.requestAnimationFrame(() => {
        if (top > 35 && !isCompact) {
          setIsCompact(true);
        }
        tickingRef.current = false;
      });
      tickingRef.current = true;
    }
  }, [isCompact]);

  // Touch Swipe Gesture Handlers (Fluid Apple Direct Manipulation)
  const handleTouchStart = (e) => {
    touchStartYRef.current = e.touches[0].clientY;
    touchLastYRef.current = e.touches[0].clientY;
    isTouchActiveRef.current = true;
  };

  const handleTouchMove = (e) => {
    if (!isTouchActiveRef.current) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartYRef.current;

    // When on the Big Card: A slow swipe UP of even 30px smoothly initiates compact mode
    if (!isCompact && deltaY < -30) {
      setIsCompact(true);
      isTouchActiveRef.current = false;
    }
  };

  const handleTouchEnd = (e) => {
    const endY = e.changedTouches[0].clientY;
    const deltaY = endY - touchStartYRef.current;
    isTouchActiveRef.current = false;

    // Swipe UP on Big Card: If user swiped up quickly or slowly
    if (deltaY < -25 && !isCompact) {
      setIsCompact(true);
    }
    // Pull DOWN on Compact Card: ONLY when at the very top of the feed (scrollTop <= 2px)
    // and user deliberately pulls down by > 45px (like iOS pull-to-refresh)
    else if (deltaY > 45 && isCompact) {
      const top = scrollContainerRef.current ? scrollContainerRef.current.scrollTop : 0;
      if (top <= 2) {
        setIsCompact(false);
        setActiveFocus('BALANCE');
        setPromotedTx(null);
      }
    }
  };

  // Smooth glide to transactions (shrinks the card)
  const handleScrollDownToTransactions = useCallback(() => {
    setIsCompact(true);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: 240,
        behavior: 'smooth'
      });
    }
  }, []);

  // Smooth return to top (expands that same card back to big)
  const handleExpandToBig = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
    setIsCompact(false);
    setActiveFocus('BALANCE');
    setPromotedTx(null);
  }, []);

  // Filter transactions
  const displayedTx = useMemo(() => {
    if (!customer.recentPurchases) return [];
    if (filterType === 'PURCHASE') return customer.recentPurchases.filter(t => t.type === 'PURCHASE');
    if (filterType === 'PAYMENT') return customer.recentPurchases.filter(t => t.type === 'PAYMENT');
    return customer.recentPurchases;
  }, [customer, filterType]);

  // Promote a transaction into the card
  const handlePromoteTx = (tx) => {
    if (promotedTx?.id === tx.id && activeFocus === 'INVOICE') {
      setActiveFocus('BALANCE');
      setPromotedTx(null);
    } else {
      setPromotedTx(tx);
      setActiveFocus('INVOICE');
    }
  };

  // Promote Mess Room
  const handlePromoteMess = () => {
    if (activeFocus === 'MESS') {
      setActiveFocus('BALANCE');
    } else {
      setActiveFocus('MESS');
      setPromotedTx(null);
    }
  };

  // Return to default live balance
  const handleReturnToBalance = () => {
    setActiveFocus('BALANCE');
    setPromotedTx(null);
  };

  // Multi-Language Audio Voice Balance Readout
  const handleSpeakBalance = () => {
    if (isSpeaking) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported on this device.');
      return;
    }

    window.speechSynthesis.cancel();
    let text = '';
    let voiceLang = 'en-US';

    if (lang === 'ar') {
      voiceLang = 'ar-SA';
      text = isSettled
        ? `رصيد حسابك في أسواق ليالي مسدد بالكامل، صفر دينار.`
        : isCredit
          ? `لديك رصيد فائض متجر بقيمة ${absBalance} دينار بحريني.`
          : `إجمالي المبلغ المستحق عليك في أسواق ليالي هو ${absBalance} دينار بحريني.`;
    } else if (lang === 'ml') {
      voiceLang = 'ml-IN';
      text = isSettled
        ? `ലയാലി സൂപ്പർമാർക്കറ്റിൽ താങ്കളുടെ അക്കൗണ്ട് പൂർണ്ണമായും സെറ്റിൽ ചെയ്തിരിക്കുന്നു.`
        : `ലയാലി സൂപ്പർമാർക്കറ്റിലെ താങ്കളുടെ ബാക്കി തുക ${absBalance} ബഹ്റൈൻ ദിനാർ ആണ്.`;
    } else {
      voiceLang = 'en-US';
      text = isSettled
        ? `Your Layali Khata account is fully settled. Zero balance.`
        : isCredit
          ? `You have a store advance credit of ${absBalance} Bahraini Dinars.`
          : `Your outstanding balance at Layali Supermarket is ${absBalance} Bahraini Dinars.`;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voiceLang;
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  // Localized customer name
  const localizedCustomerName = useMemo(() => {
    if (lang === 'ar' && customer.nameAr) return customer.nameAr;
    if (lang === 'ml' && customer.nameMl) return customer.nameMl;
    return customer.name;
  }, [customer, lang]);

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* ─────────────────────────────────────────────────────────────
          1. TOP PREVIEW CONTROL BAR (Sandbox Presets & Mode Toggle)
          ───────────────────────────────────────────────────────────── */}
      <header className="w-full bg-slate-900/90 border-b border-white/10 px-4 py-2 flex flex-wrap items-center justify-between gap-2.5 z-40 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-black tracking-tight text-white flex items-center gap-1.5">
            <span className="text-emerald-400 font-mono"></span>
            <span>Zero-Stutter Morph Preview</span>
          </span>
          <span className="text-[10px] bg-white/10 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-white/10">
            Preview
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Preset Customer Selector */}
          <div className="flex items-center gap-1 bg-black/40 border border-white/10 p-1 rounded-xl text-xs">
            <span className="text-slate-400 text-[10px] font-mono px-1">Patron:</span>
            <button
              type="button"
              onClick={() => { setSelectedPresetKey('mohammed'); handleExpandToBig(); }}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition ${selectedPresetKey === 'mohammed' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
              Mohammed (Debt)
            </button>
            <button
              type="button"
              onClick={() => { setSelectedPresetKey('rajesh'); handleExpandToBig(); }}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition ${selectedPresetKey === 'rajesh' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
              Rajesh (Staples)
            </button>
            <button
              type="button"
              onClick={() => { setSelectedPresetKey('ali_settled'); handleExpandToBig(); }}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition ${selectedPresetKey === 'ali_settled' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
              Ali (Settled)
            </button>
          </div>

          {/* Viewport Frame Toggle */}
          <button
            type="button"
            onClick={() => setIsPhoneFrame(prev => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 active:scale-95 text-slate-200 text-xs font-bold rounded-xl transition cursor-pointer border border-white/10"
            title="Toggle between Mobile Bezel Frame and Full Screen View"
          >
            {isPhoneFrame ? (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Full-Screen</span>
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                <span>iPhone Bezel</span>
              </>
            )}
          </button>

          {/* Language Switcher */}
          <div className="flex items-center bg-black/40 border border-white/10 p-0.5 rounded-xl text-xs font-bold">
            {['en', 'ar', 'ml'].map(code => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={`min-w-6 h-7 px-2 rounded-lg uppercase transition ${lang === code ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
              >
                {code}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          2. VIEWPORT CANVAS (iPhone Bezel Frame vs Full Screen)
          ───────────────────────────────────────────────────────────── */}
      <main className="w-full flex-1 flex items-center justify-center sm:p-4 overflow-hidden">
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          className={`w-full bg-[#05070B] text-white flex flex-col justify-between transition-all duration-300 relative ${isPhoneFrame
              ? 'max-w-[390px] h-[844px] max-h-[92vh] rounded-[48px] border-[8px] border-slate-900 shadow-[0_25px_70px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.12)] overflow-hidden ring-1 ring-slate-800'
              : 'max-w-md h-screen sm:min-h-screen'
            }`}
        >
          {/* Simulated Apple Dynamic Island (in Phone Frame mode) */}
          {isPhoneFrame && (
            <div className="w-full pt-3 pb-1 flex justify-center shrink-0 z-30 select-none pointer-events-none">
              <div className="w-28 h-6 bg-black rounded-full border border-white/10 shadow-inner flex items-center justify-between px-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-slate-800" />
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────
              3. TOP STORE APP BAR (Always Visible Minimal Brand Pill)
              ───────────────────────────────────────────────────────── */}
          <div className="px-5 py-2.5 flex items-center justify-between shrink-0 border-b border-white/[0.04] bg-[#05070B]/90 backdrop-blur-md z-30">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-emerald-400 font-black text-xs shadow-inner">
                LK
              </div>
              <div>
                <span className="text-xs font-black tracking-tight text-white uppercase block leading-none">
                  Layali <span className="text-emerald-400">Khata</span>
                </span>
                <span className="text-[10px] text-slate-400 block font-medium">
                  {lang === 'ar' ? 'أسواق ليالي المركزية' : 'Askar Central Supermarket'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setHideBalance(prev => !prev)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer active:scale-95"
                title="Camp Privacy Mode"
              >
                {hideBalance ? <EyeOff className="w-3.5 h-3.5 text-amber-400" /> : <Eye className="w-3.5 h-3.5 text-slate-400" />}
              </button>
              <button
                type="button"
                onClick={handleExpandToBig}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer active:scale-95"
                title="Reset to Big Balance"
              >
                <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
              </button>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────
              4. UNINHIBITED SCROLL CONTAINER
              ───────────────────────────────────────────────────────── */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="flex-1 overflow-y-auto px-3.5 py-2 scrollbar-hide relative"
            style={{
              overflowAnchor: 'none',
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-y',
              overscrollBehaviorY: 'contain'
            }}
          >
            <div className="min-h-[140vh] flex flex-col">
              {/* ═════════════════════════════════════════════════════
                  THE PERSISTENT SINGLE-DOM CARD
                  (Zero Unmounting during transition = Zero Stutter!)
                  ═════════════════════════════════════════════════════ */}
              <section
                style={{
                  transition: 'height 280ms cubic-bezier(0.16, 1, 0.3, 1), padding 280ms cubic-bezier(0.16, 1, 0.3, 1), border-radius 280ms cubic-bezier(0.16, 1, 0.3, 1)',
                  transform: 'translateZ(0)',
                  willChange: 'height, transform',
                  contain: 'paint'
                }}
                className={`sticky top-2 z-20 overflow-hidden backdrop-blur-2xl border ${isCompact
                    ? 'h-[132px] rounded-2xl bg-slate-900/95 border-white/20 shadow-[0_16px_36px_rgba(0,0,0,0.7)] p-3'
                    : 'h-[56vh] max-h-[480px] min-h-[400px] rounded-[32px] bg-gradient-to-b from-slate-900/85 via-slate-900/65 to-slate-950/95 border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.6)] p-5 flex flex-col justify-between'
                  } ${activeFocus === 'INVOICE'
                    ? 'ring-1 ring-indigo-500/50 border-indigo-500/40'
                    : activeFocus === 'MESS'
                      ? 'ring-1 ring-amber-500/50 border-amber-500/40'
                      : ''
                  }`}
              >
                {/* Apple Specular Edge Highlight */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

                {/* ─────────────────────────────────────────────────────
                    PROMOTED INVOICE VIEW (Card-to-List)
                    ───────────────────────────────────────────────────── */}
                {activeFocus === 'INVOICE' && promotedTx ? (
                  <div className="h-full flex flex-col justify-between space-y-2 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
                          <Receipt className="w-4 h-4 text-indigo-400" />
                        </div>
                        <div>
                          <span className="text-xs font-black text-white font-mono block">
                            #{promotedTx.invoiceNo}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(promotedTx.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleReturnToBalance}
                        className="px-2.5 py-1 bg-white/10 hover:bg-white/15 active:scale-95 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer border border-white/10 shadow-xs"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'إغلاق' : 'Close'}</span>
                      </button>
                    </div>

                    {/* Line Items Table */}
                    <div className="bg-black/35 rounded-2xl p-2.5 border border-white/5 space-y-1.5 overflow-y-auto max-h-[160px] scrollbar-hide">
                      {promotedTx.items && promotedTx.items.length > 0 ? (
                        promotedTx.items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-white/[0.04] last:border-0">
                            <div className="min-w-0 pr-2">
                              <span className="font-medium text-slate-200 block truncate">
                                {lang === 'ar' && item.nameAr ? item.nameAr : item.name}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {item.qty} × BHD {item.unitPrice.toFixed(3)}
                              </span>
                            </div>
                            <span className="font-mono font-bold text-white shrink-0">
                              BHD {item.total.toFixed(3)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 italic py-2 text-center">
                          {promotedTx.channel ? `Payment settled via ${promotedTx.channel}` : 'Regular store voucher item'}
                        </p>
                      )}
                    </div>

                    {/* Total & Remaining */}
                    <div className="flex items-center justify-between pt-1 px-1">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Slip Total</span>
                        <span className="text-base font-black font-mono text-white">
                          BHD {Math.abs(promotedTx.amount).toFixed(3)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Balance After</span>
                        <span className="text-sm font-black font-mono text-indigo-300">
                          BHD {promotedTx.runningBalance.toFixed(3)}
                        </span>
                      </div>
                    </div>

                    {/* Zero Drift Badge & Share */}
                    <div className="pt-1 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        <span>Verified Slip</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => alert(`Sharing Bill #${promotedTx.invoiceNo} on WhatsApp...`)}
                        className="text-[11px] font-bold text-slate-300 hover:text-white px-3 py-1 rounded-xl bg-white/10 hover:bg-white/15 flex items-center gap-1 transition cursor-pointer active:scale-95 border border-white/10"
                      >
                        <Share2 className="w-3 h-3 text-emerald-400" />
                        <span>Share</span>
                      </button>
                    </div>
                  </div>
                ) : activeFocus === 'MESS' && customer.hasMessGroup ? (
                  /* ─────────────────────────────────────────────────────
                     PROMOTED MESS ROOM BREAKDOWN
                     ───────────────────────────────────────────────────── */
                  <div className="h-full flex flex-col justify-between space-y-2 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4 text-amber-400" />
                        </div>
                        <div>
                          <span className="text-xs font-black text-white block">
                            {customer.messGroupName}
                          </span>
                          <span className="text-[10px] text-amber-400/80 font-mono">
                            {customer.messMembersCount} Camp Roommates
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleReturnToBalance}
                        className="px-2.5 py-1 bg-white/10 hover:bg-white/15 active:scale-95 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer border border-white/10 shadow-xs"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'الرجوع' : 'Close'}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 my-1 text-center">
                      <div className="p-2.5 bg-black/40 rounded-2xl border border-white/5">
                        <span className="text-[10px] uppercase text-slate-400 block mb-0.5">Room Debt</span>
                        <span className="text-sm font-black font-mono text-white">
                          BHD {customer.messRoomTotal.toFixed(3)}
                        </span>
                      </div>
                      <div className="p-2.5 bg-amber-500/15 rounded-2xl border border-amber-500/30">
                        <span className="text-[10px] uppercase text-amber-300 font-bold block mb-0.5">Your Share</span>
                        <span className="text-sm font-black font-mono text-amber-300">
                          BHD {customer.myMessShare.toFixed(3)}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowBenefitModal(true)}
                      className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
                    >
                      <CreditCard className="w-4 h-4 text-white" />
                      <span>Pay My Room Share (BHD {customer.myMessShare.toFixed(3)})</span>
                    </button>
                  </div>
                ) : (
                  /* ─────────────────────────────────────────────────────
                     PERSISTENT UNIFIED BALANCE CARD (Zero Unmounting!)
                     ───────────────────────────────────────────────────── */
                  <div className="h-full flex flex-col justify-between">
                    {/* ROW 1: Identity & Tabular Balance */}
                    <div className="flex items-center justify-between gap-2 shrink-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-emerald-400 font-bold text-xs shrink-0">
                          <User className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h3 className={`font-black text-white truncate transition-all duration-200 ${isCompact ? 'text-xs' : 'text-base sm:text-lg'}`}>
                              {localizedCustomerName}
                            </h3>
                            <span className={`text-[9px] font-mono font-bold uppercase text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/30 shrink-0 transition-opacity duration-200 ${isCompact ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                              Verified
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono block">
                            CPR {customer.cpr} {!isCompact && `• Limit: BHD ${customer.creditLimit.toFixed(3)}`}
                          </span>
                        </div>
                      </div>

                      {/* Compact Balance Display (Permanently in DOM with smooth GPU fade & translate) */}
                      <div className={`text-right shrink-0 transition-all duration-260 ease-out ${isCompact ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-2 scale-90 pointer-events-none'}`}>
                        <span className="text-[8px] uppercase tracking-wider text-slate-400 block font-bold leading-none mb-0.5">
                          {isCredit ? 'Credit' : 'Balance'}
                        </span>
                        <span className={`text-base font-black font-mono leading-none ${isCredit || isSettled ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {hideBalance ? '••••••' : `BD ${absBalance}`}
                        </span>
                      </div>
                    </div>

                    {/* BIG BALANCE CENTERPIECE (GPU Opacity & Max-Height Collapsing) */}
                    <div className={`transition-all duration-280 ease-out overflow-hidden ${isCompact ? 'opacity-0 -translate-y-3 max-h-0 py-0 pointer-events-none' : 'opacity-100 translate-y-0 max-h-48 py-2'}`}>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-0.5">
                        {isCredit ? 'Store Advance Credit' : isSettled ? 'Account Settled (Zero Debt)' : 'Total Outstanding Balance'}
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-mono font-bold text-slate-400">BHD</span>
                        <span className={`text-5xl font-black font-mono tracking-tight ${isCredit || isSettled ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {hideBalance ? '••••••' : absBalance}
                        </span>
                      </div>

                      {/* Credit Limit Usage Bar */}
                      <div className="w-full bg-black/40 h-1.5 rounded-full mt-2 overflow-hidden border border-white/5">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${isSettled ? 'bg-emerald-500 w-0' : 'bg-rose-500'}`}
                          style={{ width: `${Math.min(100, (customer.balance / customer.creditLimit) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* ACTIONS ROW (Transitions smoothly from large grid to inline pills) */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10 shrink-0">
                      <div className="flex items-center gap-1.5 flex-1">
                        <button
                          type="button"
                          onClick={handleSpeakBalance}
                          className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer active:scale-95 ${isSpeaking
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                              : 'bg-white/10 hover:bg-white/15 text-emerald-300 border-white/15'
                            } ${!isCompact ? 'flex-1 py-2.5' : ''}`}
                        >
                          {isSpeaking ? <VolumeX className="w-3.5 h-3.5 text-amber-400 animate-spin" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
                          <span>{lang === 'ar' ? 'صوت' : 'Voice'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowBenefitModal(true)}
                          className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white transition-all cursor-pointer shadow-md ${!isCompact ? 'flex-1 py-2.5' : ''}`}
                        >
                          <CreditCard className="w-3.5 h-3.5 text-white" />
                          <span>{lang === 'ar' ? 'سداد فوري' : 'Pay Now'}</span>
                        </button>
                      </div>

                      {/* Full View Button (In Compact Mode) */}
                      <button
                        type="button"
                        onClick={handleExpandToBig}
                        className={`px-2.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 text-slate-200 hover:text-white border border-white/10 flex items-center gap-1 text-[11px] font-bold transition-all duration-200 cursor-pointer ${isCompact ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none hidden'}`}
                        title="Expand back to big balance card"
                      >
                        <Maximize2 className="w-3 h-3 text-emerald-400" />
                        <span>Full</span>
                      </button>
                    </div>

                    {/* EXTRA BIG DETAILS (Mess Split & Bouncing Hint) - Only visible when expanded */}
                    <div className={`transition-all duration-280 ease-out overflow-hidden ${isCompact ? 'opacity-0 -translate-y-2 max-h-0 pt-0 pointer-events-none' : 'opacity-100 translate-y-0 max-h-40 pt-2'}`}>
                      {customer.hasMessGroup && (
                        <div
                          onClick={handlePromoteMess}
                          className="p-2 bg-black/40 hover:bg-black/60 border border-white/10 rounded-2xl flex items-center justify-between cursor-pointer transition active:scale-98 mb-2"
                        >
                          <div className="flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-xs font-bold text-slate-200">{customer.messGroupName}</span>
                          </div>
                          <span className="text-amber-400 font-mono text-xs font-bold">BHD {customer.myMessShare.toFixed(3)}</span>
                        </div>
                      )}

                      <div
                        onClick={handleScrollDownToTransactions}
                        className="flex flex-col items-center justify-center gap-1 cursor-pointer text-slate-400 hover:text-white transition group select-none animate-bounce pt-1"
                      >
                        <span className="text-[10px] font-bold tracking-wider uppercase text-slate-300 group-hover:text-emerald-400 transition">
                          {lang === 'ar' ? 'اسحب أو اضغط لعرض الفواتير' : 'Scroll down to shrink card & view bills'}
                        </span>
                        <ChevronDown className="w-4 h-4 text-emerald-400" />
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* ═════════════════════════════════════════════════════
                  TRANSACTIONS FEED (Revealed Underneath the Card)
                  ═════════════════════════════════════════════════════ */}
              <div className="space-y-2.5 pt-4">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Recent Grocery Activity</span>
                  </span>

                  {/* Segmented Filter Pills */}
                  <div className="flex items-center bg-black/40 border border-white/10 p-0.5 rounded-xl text-[10px] font-bold">
                    {['ALL', 'PURCHASE', 'PAYMENT'].map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFilterType(type)}
                        className={`px-2.5 py-1 rounded-lg transition uppercase ${filterType === type ? 'bg-white/20 text-white shadow-xs' : 'text-slate-400 hover:text-white'}`}
                      >
                        {type === 'ALL' ? 'All' : type === 'PURCHASE' ? 'Bills' : 'Paid'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* iOS Inset-Grouped Table Container */}
                <div className="rounded-3xl bg-slate-900/50 backdrop-blur-xl border border-white/10 overflow-hidden divide-y divide-white/[0.06] shadow-lg">
                  {displayedTx.map((tx) => {
                    const isPurchase = tx.type === 'PURCHASE';
                    const isSelected = promotedTx?.id === tx.id && activeFocus === 'INVOICE';

                    return (
                      <div
                        key={tx.id}
                        onClick={() => handlePromoteTx(tx)}
                        className={`p-3.5 transition-all cursor-pointer flex items-center justify-between gap-3 active:bg-white/10 ${isSelected
                            ? 'bg-indigo-950/40 ring-1 ring-inset ring-indigo-500/50'
                            : 'hover:bg-white/[0.03]'
                          }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Apple Squircle Icon */}
                          <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 border ${isPurchase
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                            }`}>
                            {isPurchase ? <ShoppingBag className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white font-mono truncate">
                                #{tx.invoiceNo}
                              </span>
                              {isPurchase && (
                                <span className="text-[10px] text-slate-400 bg-white/5 border border-white/5 px-1.5 py-0.2 rounded-md">
                                  {tx.itemCount || 1} items
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 block truncate font-medium">
                              {new Date(tx.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <span className={`text-xs font-black font-mono block ${isPurchase ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {isPurchase ? `+BD ${tx.amount.toFixed(3)}` : `-BD ${Math.abs(tx.amount).toFixed(3)}`}
                            </span>
                            <span className="text-[10px] text-indigo-400 font-medium block">
                              Inspect
                            </span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Generous bottom padding to ensure infinite smooth scrolling over thumb dock */}
              <div className="h-44" />
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────
              5. FIXED LOWER THUMB ZONE (Apple Frosted Glass Dock)
              ───────────────────────────────────────────────────────── */}
          <div className="p-4 bg-[#05070B]/95 border-t border-white/[0.08] shrink-0 space-y-2 backdrop-blur-2xl z-20">
            <button
              type="button"
              onClick={() => setShowBenefitModal(true)}
              className="w-full min-h-[50px] py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-black rounded-2xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/80 border border-white/10"
            >
              <CreditCard className="w-4 h-4 text-white shrink-0" />
              <span>
                {lang === 'ar' ? 'السداد عبر بنفت بي (فوري+)' : 'Settle via BenefitPay • Fawri+'}
              </span>
            </button>

            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <button
                type="button"
                onClick={() => alert('Opening Full Statement document...')}
                className="py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                <span>Full Statement</span>
              </button>
              <a
                href="https://wa.me/97339000000"
                target="_blank"
                rel="noreferrer"
                className="py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>WhatsApp Help</span>
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* Simulated BenefitPay Modal */}
      {showBenefitModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/15 rounded-[32px] p-6 max-w-sm w-full text-center space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/30">
              <CreditCard className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-white">BenefitPay Quick Settle</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Scan Bahrain EMVCo QR code using your BenefitPay app to settle your account balance directly.
            </p>
            <div className="p-4 bg-white rounded-2xl inline-block mx-auto shadow-inner">
              <QrCode className="w-40 h-40 text-black mx-auto" />
            </div>
            <div className="font-mono text-sm font-bold text-emerald-400">
              Amount: BHD {absBalance}
            </div>
            <button
              type="button"
              onClick={() => setShowBenefitModal(false)}
              className="w-full py-3 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl text-xs transition cursor-pointer border border-white/10 active:scale-95"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
