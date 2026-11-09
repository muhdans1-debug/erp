import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { 
  ShieldCheck, 
  ArrowLeft, 
  Share2, 
  Lock, 
  CheckCircle2, 
  WifiOff, 
  Printer, 
  PhoneCall, 
  MessageCircle 
} from 'lucide-react';
import BenefitPayModal from '../components/BenefitPayModal';

const TAB_TEXTS = {
  en: {
    brand: 'ASKAR SUPERMARKET',
    portal: 'Official Customer Khata Portal',
    live: 'LIVE LEDGER',
    tabOf: "'s Khata Tab",
    id: 'ID',
    owed: 'Outstanding Balance Owed',
    creditTitle: 'Advance Store Credit',
    limit: 'Credit Limit',
    payBtn: 'Settle via BenefitPay',
    connecting: 'Connecting to Gateway...',
    allSettled: 'All Settled Up — No Debt Owed',
    viewStatement: 'View Full Itemized Statement (PIN Protected)',
    secured: 'Secured by BenefitPay & Fawri+',
    shareWhatsapp: 'Share Summary on WhatsApp',
    backHome: 'Back to Search',
    offlineSnapshot: 'Offline Snapshot — Reconnecting...',
    customAmount: 'Custom Payment Amount',
    payFull: 'Pay Full Balance',
    networkErr: 'No internet connection detected. Showing saved offline snapshot.',
    needHelp: 'Need help with this bill?',
    callStore: 'Call Store Hotline',
    whatsappHelp: 'WhatsApp Support',
    settledTitle: 'Balance Settled (No Debt)',
    currency: 'BHD'
  },
  ar: {
    brand: 'أسواق أسكر المركزية',
    portal: 'البوابة الرسمية لحسابات الزبائن',
    live: 'حساب مباشر',
    tabOf: ' - كشف الحساب',
    id: 'رقم الحساب',
    owed: 'المبلغ المستحق للدفع',
    creditTitle: 'رصيد دائن / دفعة مقدمة',
    limit: 'الحد الائتماني',
    payBtn: 'السداد عبر بنفت بي',
    connecting: 'جاري الاتصال ببوابة الدفع...',
    allSettled: 'تم سداد كامل الحساب — لا توجد مبالغ مستحقة',
    viewStatement: 'عرض كشف الحساب التفصيلي (محمي برقم سري)',
    secured: 'محمي بواسطة بنفت بي وفوري+',
    shareWhatsapp: 'مشاركة كشف الحساب عبر واتساب',
    backHome: 'العودة للبحث',
    offlineSnapshot: 'نسخة محفوظة بدون إنترنت',
    customAmount: 'مبلغ سداد مخصص',
    payFull: 'سداد كامل المبلغ',
    networkErr: 'لا يوجد اتصال بالإنترنت. يتم عرض النسخة المحفوظة.',
    needHelp: 'هل تحتاج مساعدة في هذه الفاتورة؟',
    callStore: 'الاتصال بالفرع',
    whatsappHelp: 'دعم واتساب',
    settledTitle: 'الحساب مسدد بالكامل (لا توجد ديون)',
    currency: 'د.ب'
  },
  ml: {
    brand: 'അസ്കർ സൂപ്പർമാർക്കറ്റ്',
    portal: 'കസ്റ്റമർ ഖാത്ത പോർട്ടൽ',
    live: 'ലൈവ് ലെഡ്ജർ',
    tabOf: '-ന്റെ ഖാത്ത അക്കൗണ്ട്',
    id: 'ഐഡി',
    owed: 'നൽകാനുള്ള തുക (ബാക്കി)',
    creditTitle: 'അഡ്വാൻസ് ക്രെഡിറ്റ് ബാക്കി',
    limit: 'ക്രെഡിറ്റ് പരിധി',
    payBtn: 'ബെനിഫിറ്റ് പേ വഴി നൽകുക',
    connecting: 'ഗേറ്റ്‌വേ കണക്റ്റ് ചെയ്യുന്നു...',
    allSettled: 'മുഴുവൻ തുകയും അടച്ചു തീർത്തു',
    viewStatement: 'മുഴുവൻ ബിൽ വിവരങ്ങൾ കാണുക (PIN ആവശ്യം)',
    secured: 'ബെനിഫിറ്റ് പേ & ഫൗരി+ വഴി സുരക്ഷിതം',
    shareWhatsapp: 'വാട്ട്സ്ആപ്പിൽ പങ്കിടുക',
    backHome: 'തിരികെ പോവുക',
    offlineSnapshot: 'ഓഫ്‌ലൈൻ വിവരങ്ങൾ',
    customAmount: 'മറ്റൊരു തുക നൽകുക',
    payFull: 'മുഴുവൻ തുകയും അടയ്ക്കുക',
    networkErr: 'ഇന്റർനെറ്റ് ലഭ്യമല്ല. ഓഫ്ലൈൻ വിവരങ്ങൾ കാണിക്കുന്നു.',
    needHelp: 'ബില്ലിൽ സംശയമുണ്ടോ?',
    callStore: 'കടയിലേക്ക് വിളിക്കുക',
    whatsappHelp: 'വാട്ട്സ്ആപ്പ് സഹായം',
    settledTitle: 'മുഴുവൻ തുകയും അടച്ചു തീർത്തു',
    currency: 'BHD'
  },
  bn: {
    brand: 'আসকার সুপারমার্কেট',
    portal: 'গ্রাহক খাতা পোর্টাল',
    live: 'লাইভ লেজার',
    tabOf: '-এর খাতা হিসাব',
    id: 'আইডি',
    owed: 'বকেয়া টাকার পরিমাণ',
    creditTitle: 'জমা টাকা (ক্রেডিট)',
    limit: 'বাকি সীমা',
    payBtn: 'বেনিফিট পে দিয়ে পরিশোধ করুন',
    connecting: 'গেটওয়ে সংযোগ হচ্ছে...',
    allSettled: 'সব হিসাব পরিশোধিত — কোনো বাকি নেই',
    viewStatement: 'সম্পূর্ণ হিসাব বিবরণ দেখুন (PIN সুরক্ষিত)',
    secured: 'বেনিফিট পে দ্বারা সুরক্ষিত',
    shareWhatsapp: 'হোয়াটসঅ্যাপে পাঠান',
    backHome: 'অনুসন্ধানে ফিরুন',
    offlineSnapshot: 'অফলাইন স্ন্যাপশট',
    customAmount: 'নির্দিষ্ট পরিমাণ টাকা',
    payFull: 'সম্পূর্ণ বকেয়া পরিশোধ',
    networkErr: 'ইন্টারনেট সংযোগ নেই। সংরক্ষিত তথ্য দেখানো হচ্ছে।',
    needHelp: 'হিসাব বুঝতে সাহায্য চান?',
    callStore: 'দোকানে কল করুন',
    whatsappHelp: 'হোয়াটসঅ্যাপ সাপোর্ট',
    settledTitle: 'সব হিসাব পরিশোধিত (কোনো বাকি নেই)',
    currency: 'BHD'
  },
  hi: {
    brand: 'अस्कर सुपरमार्केट',
    portal: 'ग्राहक खाता पोर्टल',
    live: 'लाइव लेज़र',
    tabOf: ' का खाता विवरण',
    id: 'आईडी',
    owed: 'कुल बकाया राशि',
    creditTitle: 'अग्रिम जमा राशि',
    limit: 'उधार सीमा',
    payBtn: 'बेनिफिट पे से भुगतान करें',
    connecting: 'गेटवे से कनेक्ट हो रहा है...',
    allSettled: 'खाता चुकता — कोई बकाया नहीं',
    viewStatement: 'विस्तृत बिल देखें (पिन आवश्यक)',
    secured: 'बेनिफिट पे द्वारा सुरक्षित',
    shareWhatsapp: 'व्हाट्सएप पर शेयर करें',
    backHome: 'पीछे जाएं',
    offlineSnapshot: 'ऑफलाइन विवरण',
    customAmount: 'कस्टम भुगतान राशि',
    payFull: 'पूरी बकाया राशि चुकाएं',
    networkErr: 'इंटरनेट कनेक्शन नहीं है। ऑफलाइन विवरण दिखाया जा रहा है।',
    needHelp: 'बिल में सहायता चाहिए?',
    callStore: 'दुकान पर कॉल करें',
    whatsappHelp: 'व्हाट्सएप सहायता',
    settledTitle: 'खाता चुकता (कोई बकाया नहीं)',
    currency: 'BHD'
  }
};

const STORE_PHONE = '+97317000000';
const STORE_WHATSAPP = '97339000000';

// Arabic-Indic Numeral Normalizer for Bahrain & GCC Accessibility (Resolved PWA-ACC-02)
function normalizeArabicNumerals(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

// Bounded local storage helper to prevent quota exhaustion (Resolved PWA-DAT-02)
function safeSetBoundedCache(key, value, prefix = 'khata_tab_cache_') {
  try {
    localStorage.setItem(key, value);
    const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
    if (keys.length > 10) {
      for (let i = 0; i < keys.length - 10; i++) {
        localStorage.removeItem(keys[i]);
      }
    }
  } catch {}
}

export default function CustomerTab() {
  const { customerId } = useParams();
  const [searchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  
  const [lang, setLang] = useState('en');
  const t = TAB_TEXTS[lang] || TAB_TEXTS.en;
  const isRtl = lang === 'ar';

  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [showCustomPay, setShowCustomPay] = useState(false);
  const [showBenefitModal, setShowBenefitModal] = useState(false);
  const [benefitPayData, setBenefitPayData] = useState(null);

  const abortControllerRef = useRef(null);
  const [showSuccessBanner, setShowSuccessBanner] = useState(() => 
    statusParam === 'complete' || statusParam === 'success' || statusParam === 'mock_demo_success'
  );

  // Synchronize document lang & dir for screen readers (Resolved PWA-ACC-03)
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const fetchLedger = useCallback(async (signal) => {
    try {
      setLoading(true);
      setError('');

      const savedPin = localStorage.getItem(`khata_pin_${customerId}`) || '';
      const savedJwt = localStorage.getItem(`khata_jwt_${customerId}`) || '';
      const headers = {
        'Content-Type': 'application/json',
        ...(savedPin ? { 'x-khata-pin': savedPin } : {}),
        ...(savedJwt ? { 'Authorization': `Bearer ${savedJwt}` } : {})
      };

      const res = await fetch(`/api/khata/${encodeURIComponent(customerId)}/tab`, { 
        headers,
        signal
      });
      
      let finalRes = res;
      if (res.status === 401 || res.status === 403) {
        // Stale or invalid credentials stored on device — purge and retry unauthenticated for public tab (Resolved PWA-R4-02)
        try {
          localStorage.removeItem(`khata_pin_${customerId}`);
          localStorage.removeItem(`khata_jwt_${customerId}`);
        } catch {}
        finalRes = await fetch(`/api/khata/${encodeURIComponent(customerId)}/tab`, {
          headers: { 'Content-Type': 'application/json' },
          signal
        });
      }

      if (finalRes.status === 429) {
        const errBody = await finalRes.json().catch(() => ({}));
        throw new Error(errBody.error || 'Too many attempts. Account locked temporarily.');
      }

      if (!finalRes.ok) {
        const errBody = await finalRes.json().catch(() => ({}));
        throw new Error(errBody.error || errBody.message || 'Customer Khata record not found');
      }

      const data = await finalRes.json();
      const customerRecord = {
        id: data.id || customerId,
        name: data.name || 'Valued Customer',
        balance: Number(data.balance ?? data.currentBalance ?? 0),
        credit_limit: Number(data.credit_limit ?? data.creditLimit ?? 30.0)
      };

      setLedger(customerRecord);
      setIsOffline(false);

      // Synchronize cross-identifier key pairing with bounded storage (Resolved ADV-06 & PWA-DAT-02)
      try {
        safeSetBoundedCache(`khata_tab_cache_${customerId}`, JSON.stringify(customerRecord));
        if (data.id && data.id !== customerId) {
          safeSetBoundedCache(`khata_tab_cache_${data.id}`, JSON.stringify(customerRecord));
          const pin = localStorage.getItem(`khata_pin_${customerId}`);
          if (pin) localStorage.setItem(`khata_pin_${data.id}`, pin);
          const jwtToken = localStorage.getItem(`khata_jwt_${customerId}`);
          if (jwtToken) localStorage.setItem(`khata_jwt_${data.id}`, jwtToken);
        }
        if (data.name) {
          localStorage.setItem(`khata_name_${customerId}`, data.name);
          if (data.id) localStorage.setItem(`khata_name_${data.id}`, data.name);
        }
      } catch {}
    } catch (err) {
      if (err.name === 'AbortError') return;

      // Attempt to load offline snapshot
      try {
        const cached = localStorage.getItem(`khata_tab_cache_${customerId}`);
        if (cached) {
          setLedger(JSON.parse(cached));
          setIsOffline(true);
          setLoading(false);
          return;
        }
      } catch {}

      setError(t.networkErr || err.message || 'Could not load ledger');
    } finally {
      setLoading(false);
    }
  }, [customerId, t.networkErr]);

  useEffect(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (customerId) {
      const load = async () => {
        await fetchLedger(controller.signal);
      };
      load();
    }

    return () => {
      controller.abort();
    };
  }, [customerId, fetchLedger]);

  // Handle post-payment reconciliation and URL cleanup (Resolved PWA-DAT-03)
  useEffect(() => {
    if (statusParam === 'complete' || statusParam === 'success' || statusParam === 'mock_demo_success') {
      const pollTimer = setTimeout(() => {
        fetchLedger();
        try {
          window.history.replaceState({}, '', window.location.pathname);
        } catch {}
      }, 2000);

      const dismissTimer = setTimeout(() => {
        setShowSuccessBanner(false);
      }, 8000);

      return () => {
        clearTimeout(pollTimer);
        clearTimeout(dismissTimer);
      };
    }
  }, [statusParam, fetchLedger]);

  // Real Tap Payments / BenefitPay Execution with Strict Minimum Validation (Resolved PWA-INT-03)
  const handlePay = async (specifiedAmount) => {
    if (!ledger || ledger.balance <= 0) return;
    const finalAmount = Number(Number(specifiedAmount || payAmount || ledger.balance).toFixed(3));
    
    if (isNaN(finalAmount) || finalAmount < 0.100) {
      alert('Minimum settlement amount is 0.100 BHD (100 fils)');
      return;
    }

    try {
      setPaying(true);
      const initRes = await fetch('/api/checkout/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: ledger?.id || customerId,
          amount: Math.min(finalAmount, ledger.balance),
          customerName: ledger.name
        })
      });

      const data = await initRes.json();
      if (!initRes.ok || data.error) {
        throw new Error(data.error || 'Payment initialization failed');
      }

      if (data.mode === 'GATEWAY_REDIRECT' && data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
      } else {
        // Direct Fawri+ BenefitPay Mode (Dynamic CBB EMVCo QR code & deep link)
        setBenefitPayData(data);
        setShowBenefitModal(true);
      }
    } catch (err) {
      alert(`Payment error: ${err.message}`);
    } finally {
      setPaying(false);
    }
  };

  const handleShareWhatsApp = () => {
    if (!ledger) return;
    const balanceNum = Number(ledger.balance || 0);
    const balanceStr = Math.abs(balanceNum).toFixed(3);
    const isSettled = Math.abs(balanceNum) < 0.0005;

    let textStr = '';
    if (lang === 'ar') {
      textStr = `*أسواق أسكر المركزية - كشف الحساب*\nالزبون: ${ledger.name}\n${isSettled ? 'الحالة: الحساب مسدد بالكامل (لا توجد مبالغ مستحقة)' : `المبلغ المستحق: ${balanceStr} د.ب`}\nالسداد إلكترونياً عبر بنفت بي: ${window.location.href}`;
    } else {
      textStr = `*Askar Supermarket Khata Tab*\nCustomer: ${ledger.name}\n${isSettled ? 'Status: Fully Settled (No Debt Owed)' : `Outstanding Balance: BHD ${balanceStr}`}\nPay online via BenefitPay: ${window.location.href}`;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(textStr)}`, '_blank');
  };

  if (loading && !ledger) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl p-8 w-full max-w-md text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 font-medium text-sm">Loading Khata Ledger...</p>
        </div>
      </div>
    );
  }

  if (error && !ledger) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl p-8 w-full max-w-md text-center">
          <div className="w-14 h-14 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold border border-red-500/30">
            !
          </div>
          <h2 className="text-xl font-black text-white mb-2">Notice</h2>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">{error}</p>
          <Link to="/" className="inline-flex items-center gap-2 px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl text-sm transition">
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Search</span>
          </Link>
        </div>
      </div>
    );
  }

  const balanceNum = Number(ledger?.balance || 0);
  const isDebt = balanceNum > 0.0005;
  const isCredit = balanceNum < -0.0005;
  const isSettled = !isDebt && !isCredit;
  const absBalance = Math.abs(balanceNum).toFixed(3);

  return (
    <div 
      dir={isRtl ? 'rtl' : 'ltr'}
      className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-between p-4 pt-safe pb-safe selection:bg-emerald-500 selection:text-white"
    >
      {/* Top Header & Navigation */}
      <div className="w-full max-w-md mb-2 flex items-center justify-between px-1 no-print">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition py-2">
          <ArrowLeft className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
          <span>{t.backHome}</span>
        </Link>

        {/* Language Switcher (Min 44px Height) */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-2xl">
          {['en', 'ar', 'ml', 'bn', 'hi'].map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLang(code)}
              className={`min-w-8 h-9 px-2.5 rounded-xl font-bold text-xs uppercase transition-all flex items-center justify-center ${
                lang === code ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {code}
            </button>
          ))}
        </div>
      </div>

      <main className="w-full max-w-md my-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 text-center relative overflow-hidden">
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Offline Snapshot Warning */}
          {isOffline && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-300 text-xs font-semibold flex items-center gap-2 justify-center no-print">
              <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{t.offlineSnapshot}</span>
            </div>
          )}

          {showSuccessBanner && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-300 text-sm font-semibold flex items-center gap-2 justify-center no-print">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>Payment received! Your balance has been updated.</span>
            </div>
          )}

          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-[10px] font-mono tracking-widest text-emerald-400 uppercase bg-emerald-950/80 border border-emerald-800/40 px-3 py-1 rounded-full">
              {t.live}
            </span>
          </div>

          <h1 className="text-2xl font-black text-white tracking-tight">
            {ledger.name}{t.tabOf}
          </h1>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">{t.id}: {ledger.id}</p>

          {/* Balance Display (Emerald for Credit & Settled, Rose for Debt) */}
          <div className="my-6 py-6 px-4 bg-slate-950/80 rounded-3xl border border-slate-800">
            <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">
              {isCredit ? t.creditTitle : isSettled ? t.settledTitle : t.owed}
            </p>
            <p className={`text-5xl font-black my-2 tracking-tight ${isCredit || isSettled ? 'text-emerald-400' : 'text-rose-500'}`}>
              {isCredit ? `+${t.currency} ${absBalance}` : `${t.currency} ${absBalance}`}
            </p>
            <p className="text-xs text-slate-400 font-medium">
              {t.limit}: {t.currency} {ledger.credit_limit.toFixed(3)}
            </p>
          </div>

          {/* Payment Section (Full or Partial Settlement) */}
          {isDebt ? (
            <div className="space-y-3 no-print">
              {/* Quick Chip Partial Amount Selectors */}
              <div className="grid grid-cols-4 gap-2 text-xs font-bold font-mono">
                {[5, 10, 20].map((amt) => {
                  if (amt >= balanceNum) return null;
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => handlePay(amt)}
                      disabled={paying}
                      className="py-2.5 px-1 bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 rounded-xl border border-slate-700 text-slate-200 transition"
                    >
                      {amt} {t.currency}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setShowCustomPay(!showCustomPay)}
                  className={`py-2.5 px-1 rounded-xl border text-slate-200 transition ${
                    showCustomPay ? 'bg-emerald-700 border-emerald-500' : 'bg-slate-800/80 border-slate-700'
                  }`}
                >
                  Custom
                </button>
              </div>

              {/* Custom Amount Input with Arabic-Indic Support */}
              {showCustomPay && (
                <div className="p-3 bg-slate-950 rounded-2xl border border-slate-700 space-y-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={payAmount}
                    onChange={(e) => {
                      const raw = normalizeArabicNumerals(e.target.value).replace(/[^0-9.]/g, '');
                      const parts = raw.split('.');
                      const clean = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : raw;
                      setPayAmount(clean);
                    }}
                    placeholder={`Min 0.100 (Max: ${balanceNum.toFixed(3)})`}
                    className="w-full text-center py-2.5 px-3 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-sm focus:border-emerald-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handlePay(payAmount)}
                    disabled={paying || !payAmount || Number(payAmount) < 0.100}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 font-bold text-xs rounded-xl transition"
                  >
                    Pay Custom Amount
                  </button>
                </div>
              )}

              {/* Primary Full Settle Button */}
              <button
                onClick={() => handlePay(balanceNum)}
                disabled={paying}
                className="w-full min-h-[52px] bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-60 text-white font-bold py-3.5 px-6 rounded-2xl text-base shadow-lg shadow-emerald-900/40 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {paying ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{t.connecting}</span>
                  </>
                ) : (
                  <>
                    <span>{t.payBtn} ({t.currency} {balanceNum.toFixed(3)})</span>
                    <span className="text-emerald-200">→</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold py-4 rounded-2xl text-base flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              <span>{t.allSettled}</span>
            </div>
          )}

          {/* Action Buttons: Itemized Statement, WhatsApp Share & Print */}
          <div className="mt-5 space-y-2 no-print">
            <Link
              to={`/statement/${encodeURIComponent(ledger?.id || customerId)}`}
              className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 hover:bg-emerald-950/80 border border-emerald-800/40 py-3 rounded-2xl transition"
            >
              <Lock className="w-4 h-4" />
              <span>{t.viewStatement}</span>
            </Link>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 py-2.5 rounded-2xl transition cursor-pointer"
              >
                <Share2 className="w-4 h-4 text-emerald-400" />
                <span>WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 py-2.5 rounded-2xl transition cursor-pointer"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>Print Tab</span>
              </button>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>{t.secured}</span>
            </span>
            <span className="font-mono text-[11px]">NBR COMPLIANT</span>
          </div>
        </div>

        {/* Store Helpline & WhatsApp Support for Elderly Patrons (ADV-14) */}
        <div className="mt-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 text-center no-print">
          <p className="text-xs text-slate-400 font-medium mb-3">{t.needHelp}</p>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={`tel:${STORE_PHONE}`}
              className="min-h-[44px] py-2 px-3 bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition"
            >
              <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.callStore}</span>
            </a>
            <a
              href={`https://wa.me/${STORE_WHATSAPP}?text=Hello%20Askar%20Coldstore%2C%20I%20have%20a%20question%20about%20my%20Khata%20bill.`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] py-2 px-3 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/60 rounded-xl text-xs font-semibold text-emerald-300 flex items-center justify-center gap-1.5 transition"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.whatsappHelp}</span>
            </a>
          </div>
        </div>
      </main>

      <footer className="w-full max-w-md py-2 text-center text-slate-600 text-[11px] no-print">
        {t.brand} • NBR Tax Compliant Digital Statement
      </footer>

      {/* BenefitPay Fawri+ Payment Modal */}
      <BenefitPayModal
        isOpen={showBenefitModal}
        onClose={() => setShowBenefitModal(false)}
        data={benefitPayData}
        lang={lang}
        onSuccess={() => {
          fetchLedger();
        }}
      />
    </div>
  );
}
