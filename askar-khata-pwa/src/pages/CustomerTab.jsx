import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
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
  ShieldAlert,
  Menu
} from 'lucide-react';
import BenefitPayModal from '../components/BenefitPayModal';
import HamburgerDrawer from '../components/HamburgerDrawer';
import ReceiptModal from '../components/ReceiptModal';
import TransactionItemCard from '../components/TransactionItemCard';
import { generateBenefitPayPayload } from '../utils/benefitPay';

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
    custom: 'Custom',
    payCustomBtn: 'Pay Custom Amount',
    listenBalance: '🔊 Listen to Balance',
    switchAcc: '⚙️ Switch Account / Setup New Phone',
    recentPurchases: 'Transaction History',
    transactionsHistory: 'Full Transaction History',
    filterAll: 'All',
    filterPurchases: 'Purchases',
    filterPayments: 'Payments',
    runningBal: 'Balance',
    showMore: 'Show More Transactions',
    showLess: 'Show Less',
    noRecentPurchases: 'No transactions recorded',
    currency: 'BHD',
    hideBalance: 'Camp Privacy Mode (Hide)',
    showBalance: 'Show Balance',
    freezeTitle: 'Freeze Account',
    frozenBadge: 'Account Locked / Frozen',
    frozenDesc: 'In-store credit charges are disabled to protect your account.',
    unfreezeBtn: '🔓 Unlock / Unfreeze Khata',
    freezeBtn: '🔒 Freeze Khata (Lost Card Protection)'
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
    custom: 'مخصص',
    payCustomBtn: 'دفع المبلغ المخصص',
    listenBalance: '🔊 استمع إلى الرصيد',
    switchAcc: '⚙️ تغيير الحساب / إعداد هاتف آخر',
    recentPurchases: 'سجل المعاملات والتواريخ',
    transactionsHistory: 'سجل المعاملات والتواريخ بالكامل',
    filterAll: 'الكل',
    filterPurchases: 'مشتريات',
    filterPayments: 'سدادات',
    runningBal: 'الرصيد',
    showMore: 'عرض المزيد من المعاملات',
    showLess: 'عرض أقل',
    noRecentPurchases: 'لا توجد معاملات مسجلة',
    currency: 'د.ب',
    hideBalance: 'وضع الخصوصية (إخفاء)',
    showBalance: 'إظهار الرصيد',
    freezeTitle: 'تجميد الحساب',
    frozenBadge: 'الحساب مجمد / مقفل',
    frozenDesc: 'تم إيقاف المشتريات الآجلة في المتجر لحماية حسابك.',
    unfreezeBtn: '🔓 إلغاء التجميد وفتح الحساب',
    freezeBtn: '🔒 تجميد الحساب (حماية البطاقة المفقودة)'
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
    custom: 'കസ്റ്റം',
    payCustomBtn: 'തുക നൽകുക',
    listenBalance: '🔊 തുക കേൾക്കുക',
    switchAcc: '⚙️ അക്കൗണ്ട് മാറ്റുക',
    recentPurchases: 'ഇടപാടുകളുടെ വിവരങ്ങൾ',
    transactionsHistory: 'മുഴുവൻ ഇടപാടുകളുടെ വിവരങ്ങൾ',
    filterAll: 'എല്ലാം',
    filterPurchases: 'വാങ്ങിയവ',
    filterPayments: 'അടച്ചവ',
    runningBal: 'ബാക്കി',
    showMore: 'കൂടുതൽ ഇടപാടുകൾ കാണുക',
    showLess: 'കുറച്ചു കാണിക്കുക',
    noRecentPurchases: 'ഇടപാടുകൾ ലഭ്യമല്ല',
    currency: 'BHD',
    hideBalance: 'തുക മറയ്ക്കുക (പ്രൈവസി)',
    showBalance: 'തുക കാണിക്കുക',
    freezeTitle: 'അക്കൗണ്ട് മരവിപ്പിക്കുക',
    frozenBadge: 'അക്കൗണ്ട് മരവിപ്പിച്ചിരിക്കുന്നു',
    frozenDesc: 'കടയിൽ നിന്ന് സാധനങ്ങൾ കടം വാങ്ങുന്നത് തടഞ്ഞിരിക്കുന്നു.',
    unfreezeBtn: '🔓 അക്കൗണ്ട് അൺലോക്ക് ചെയ്യുക',
    freezeBtn: '🔒 അക്കൗണ്ട് ഫ്രീസ് ചെയ്യുക (കാർഡ് നഷ്ടപ്പെട്ടാൽ)'
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
    custom: 'কাস্টম',
    payCustomBtn: 'নির্দিষ্ট টাকা দিন',
    listenBalance: '🔊 বাকি হিসাব শুনুন',
    switchAcc: '⚙️ অ্যাকাউন্ট পরিবর্তন করুন',
    recentPurchases: 'লেনদেনের বিস্তারিত ইতিহাস',
    transactionsHistory: 'সম্পূর্ণ লেনদেনের ইতিহাস ও তারিখ',
    filterAll: 'সকল',
    filterPurchases: 'ক্রয়',
    filterPayments: 'পরিশোধ',
    runningBal: 'ব্যালেন্স',
    showMore: 'আরও লেনদেন দেখুন',
    showLess: 'কম দেখুন',
    noRecentPurchases: 'কোনো লেনদেন রেকর্ড নেই',
    currency: 'BHD',
    hideBalance: 'ব্যক্তিগত মোড (লুকান)',
    showBalance: 'টাকা দেখুন',
    freezeTitle: 'অ্যাকাউন্ট ফ্রিজ করুন',
    frozenBadge: 'অ্যাকাউন্ট লক করা হয়েছে',
    frozenDesc: 'দোকান থেকে বাকিতে কেনাকাটা সাময়িকভাবে বন্ধ আছে।',
    unfreezeBtn: '🔓 অ্যাকাউন্ট আনলক করুন',
    freezeBtn: '🔒 অ্যাকাউন্ট ফ্রিজ করুন (কার্ড হারালে)'
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
    custom: 'कस्टम',
    payCustomBtn: 'कस्टम राशि भरें',
    listenBalance: '🔊 बाकी हिसाब सुनें',
    switchAcc: '⚙️ खाता बदलें / नया फोन सेटअप करें',
    recentPurchases: 'पूरा लेन-देन इतिहास',
    transactionsHistory: 'पूरा लेन-देन इतिहास एवं तारीखें',
    filterAll: 'सभी',
    filterPurchases: 'खरीदारी',
    filterPayments: 'भुगतान',
    runningBal: 'बकाया',
    showMore: 'और लेन-देन देखें',
    showLess: 'कम दिखाएं',
    noRecentPurchases: 'कोई लेन-देन दर्ज नहीं है',
    currency: 'BHD',
    hideBalance: 'प्राइवेसी मोड (छिपाएं)',
    showBalance: 'बकाया दिखाएं',
    freezeTitle: 'खाता फ्रीज करें',
    frozenBadge: 'खाता लॉक / फ्रीज है',
    frozenDesc: 'दुकान से उधारी खरीदारी अस्थायी रूप से बंद है।',
    unfreezeBtn: '🔓 खाता अनलॉक करें',
    freezeBtn: '🔒 खाता फ्रीज करें (खोए कार्ड की सुरक्षा)'
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

// Adaptive Dynamic Quick Chips based on customer debt balance (BP-09)
function getDynamicQuickChips(balance) {
  const bal = Number(balance || 0);
  if (bal >= 20) return [5, 10, 20];
  if (bal >= 10) return [2, 5, 10];
  if (bal >= 5) return [1, 2, 5];
  if (bal >= 1) return [0.5, 1, 2].filter(a => a < bal);
  if (bal >= 0.2) return [0.1, 0.2, 0.5].filter(a => a < bal);
  return [];
}

// Helper: Localized date and time formatting for full transaction ledger
function formatTxDate(dateStr, lang) {
  if (!dateStr) return { date: '—', time: '' };
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { date: String(dateStr), time: '' };
    const date = d.toLocaleDateString(lang === 'ar' ? 'ar-BH' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    const time = d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    return { date, time };
  } catch {
    return { date: String(dateStr), time: '' };
  }
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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [txFilter, setTxFilter] = useState('ALL'); // 'ALL' | 'PURCHASE' | 'PAYMENT'
  const [visibleTxCount, setVisibleTxCount] = useState(10);
  const [hideBalance, setHideBalance] = useState(() => {
    try {
      return localStorage.getItem('khata_hide_balance') === 'true';
    } catch {
      return false;
    }
  });
  const [freezeLoading, setFreezeLoading] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  const abortControllerRef = useRef(null);
  const [showSuccessBanner, setShowSuccessBanner] = useState(() => 
    statusParam === 'complete' || statusParam === 'success' || statusParam === 'mock_demo_success'
  );

  // Synchronize document lang & dir for screen readers (Resolved PWA-ACC-03)
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  // Multilingual Voice Speech for Laborers & Non-Literate Camp Patrons
  const speakBalance = useCallback(() => {
    if (!('speechSynthesis' in window) || !ledger) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const balanceNum = Number(ledger.balance || 0);
    const absBal = Math.abs(balanceNum).toFixed(3);
    const isSettled = Math.abs(balanceNum) <= 0.0005;
    const name = ledger.name || '';

    let textToSpeak = '';
    let voiceLang = 'en-US';

    switch (lang) {
      case 'hi':
        voiceLang = 'hi-IN';
        textToSpeak = isSettled
          ? `नमस्ते ${name}, आपका अस्कर सुपरमार्केट में कोई बकाया नहीं है। आपका पूरा हिसाब चुकता है।`
          : `नमस्ते ${name}, आपका अस्कर सुपरमार्केट में कुल बकाया ${absBal} दीनार है।`;
        break;
      case 'bn':
        voiceLang = 'bn-BD';
        textToSpeak = isSettled
          ? `নমস্কার ${name}, আপনার আসকার সুপারমার্কেটে কোনো বাকি নেই। সব হিসাব পরিশোধিত।`
          : `নমস্কার ${name}, আপনার আসকার সুপারমার্কেটে মোট বাকি ${absBal} দিনার।`;
        break;
      case 'ml':
        voiceLang = 'ml-IN';
        textToSpeak = isSettled
          ? `നമസ്കാരം ${name}, അസ്കർ സൂപ്പർമാർക്കറ്റിൽ കുടിശ്ശിക ഒന്നും തന്നെ ഇല്ല. എല്ലാം അടച്ചു തീർത്തു.`
          : `നമസ്കാരം ${name}, അസ്കർ സൂപ്പർമാർക്കറ്റിൽ നിങ്ങൾക്ക് നൽകാനുള്ള തുക ${absBal} ദിനാർ ആണ്.`;
        break;
      case 'ar':
        voiceLang = 'ar-SA';
        textToSpeak = isSettled
          ? `مرحباً ${name}، تم سداد كامل الحساب في أسواق أسكر ولا توجد أي مبالغ مستحقة.`
          : `مرحباً ${name}، رصيد حسابك المستحق في أسواق أسكر هو ${absBal} دينار بحريني.`;
        break;
      default:
        voiceLang = 'en-US';
        textToSpeak = isSettled
          ? `Hello ${name}, your Askar Supermarket account is fully settled with zero debt owed.`
          : `Hello ${name}, your outstanding balance at Askar Supermarket is ${absBal} Bahraini Dinars.`;
        break;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = voiceLang;
    utterance.rate = 0.88;

    const voices = window.speechSynthesis.getVoices();
    const matchVoice = voices.find(v => v.lang === voiceLang || v.lang.startsWith(voiceLang.slice(0, 2)));
    if (matchVoice) {
      utterance.voice = matchVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [ledger, lang, isSpeaking]);

  const toggleHideBalance = () => {
    setHideBalance(prev => {
      const next = !prev;
      try {
        localStorage.setItem('khata_hide_balance', String(next));
      } catch {}
      return next;
    });
  };

  const handleToggleFreeze = async () => {
    if (!ledger) return;
    const isCurrentlyActive = ledger.is_active !== 0;
    const confirmMsg = isCurrentlyActive
      ? 'Are you sure you want to FREEZE your Khata? In-store credit purchases will be blocked immediately until you unlock it.'
      : 'Are you sure you want to UNFREEZE your Khata account?';

    if (!window.confirm(confirmMsg)) return;

    try {
      setFreezeLoading(true);
      const res = await fetch(`/api/khata/${encodeURIComponent(ledger.id || customerId)}/freeze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ freeze: isCurrentlyActive })
      });
      const result = await res.json();
      if (result.success) {
        const nextActive = result.is_active !== undefined ? Number(result.is_active) : (isCurrentlyActive ? 0 : 1);
        const updatedRecord = {
          ...ledger,
          is_active: nextActive,
          isActive: Boolean(nextActive)
        };
        setLedger(updatedRecord);
        // Persist immediately to local cache so refresh or offline doesn't revert state
        try {
          safeSetBoundedCache(`khata_tab_cache_${customerId}`, JSON.stringify(updatedRecord));
          if (ledger.id && ledger.id !== customerId) {
            safeSetBoundedCache(`khata_tab_cache_${ledger.id}`, JSON.stringify(updatedRecord));
          }
        } catch (e) {
          console.warn('Failed to update cache on freeze:', e);
        }
      } else {
        alert(result.error || 'Failed to update account freeze state');
      }
    } catch {
      alert('Connection error updating account lock status');
    } finally {
      setFreezeLoading(false);
    }
  };

  // Cancel speech on unmount
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

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
      const allTx = data.transactions || data.recentPurchases || data.ledger || [];
      const customerRecord = {
        id: data.id || customerId,
        name: data.name || 'Valued Customer',
        balance: Number(data.balance ?? data.currentBalance ?? 0),
        credit_limit: Number(data.credit_limit ?? data.creditLimit ?? 30.0),
        is_active: data.is_active !== undefined ? Number(data.is_active) : (data.isActive === false ? 0 : 1),
        pendingClaims: data.pendingClaims || [],
        recentPurchases: allTx,
        transactions: allTx,
        ledger: allTx
      };

      setLedger(customerRecord);
      setIsOffline(false);

      // Permanent Device Binding: Store in localStorage and 10-year cookie
      try {
        const bindId = customerRecord.id || customerId;
        localStorage.setItem('my_khata_customer_id', bindId);
        document.cookie = `khata_customer_id=${encodeURIComponent(bindId)}; path=/; max-age=315360000; SameSite=Lax`;
      } catch (bindErr) {
        console.warn('CustomerTab device binding error:', bindErr);
      }

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
          const parsed = JSON.parse(cached);
          setLedger(parsed);
          setIsOffline(true);
          setLoading(false);
          try {
            const bindId = parsed.id || customerId;
            localStorage.setItem('my_khata_customer_id', bindId);
            document.cookie = `khata_customer_id=${encodeURIComponent(bindId)}; path=/; max-age=315360000; SameSite=Lax`;
          } catch {}
          return;
        }
      } catch {}

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setError(t.networkErr || 'No internet connection detected.');
      } else {
        setError(err.message && !err.message.includes('fetch') ? err.message : 'Cannot reach server. The central service may be temporarily unavailable or updating.');
      }
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

  // Tab visibility listener: automatically refresh balance when user tabs back from BenefitPay app (BP-12)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchLedger();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchLedger]);

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
          customerName: ledger.name,
          sourceView: 'tab'
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
      // Graceful offline fallback: Generate BenefitPay Fawri+ QR locally if network drops
      if (!navigator.onLine || err.message?.includes('fetch') || err.message?.includes('network')) {
        const fallbackAmount = Math.min(finalAmount, ledger.balance);
        const invoiceRef = `KHATA-${String(ledger.id).slice(-6)}`;
        const offlineQr = generateBenefitPayPayload(fallbackAmount, invoiceRef);
        setBenefitPayData({
          mode: 'BENEFITPAY_FAWRI',
          amount: fallbackAmount,
          currency: 'BHD',
          merchantName: 'ASKAR SUPERMARKET',
          merchantId: '97300182',
          mobileNumber: '+973 32067388',
          iban: 'BH67NBOB00000012345678',
          branchId: 'POS-01',
          qrPayload: offlineQr,
          customerId: ledger.id,
          customerName: ledger.name
        });
        setShowBenefitModal(true);
      } else {
        alert(`Payment error: ${err.message}`);
      }
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

  if (error && !ledger) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl p-8 w-full max-w-md text-center">
          <div className="w-14 h-14 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold border border-red-500/30">
            !
          </div>
          <h2 className="text-xl font-black text-white mb-2">Notice</h2>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">{error}</p>
          <button onClick={() => window.location.href = '/?switch=1'} className="inline-flex items-center gap-2 px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl text-sm transition cursor-pointer">
            <QrCode className="w-4 h-4" />
            <span>Scan Receipt QR Code</span>
          </button>
        </div>
      </div>
    );
  }

  if (loading || !ledger) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl p-8 w-full max-w-md text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 font-medium text-sm">Loading Khata Ledger...</p>
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
      {/* Clean Top Header & Slide-out Drawer Navigation */}
      <header className="w-full max-w-md mb-3 flex items-center justify-between px-1 no-print">
        {/* Left: Clean Hamburger Drawer Button */}
        <button
          type="button"
          onClick={() => setShowDrawer(true)}
          className="min-h-[44px] px-3.5 bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800 rounded-2xl flex items-center gap-2 text-slate-200 hover:text-white transition cursor-pointer shadow-xs"
          title="Open Menu & Tools"
        >
          <Menu className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold font-mono tracking-wider">MENU</span>
        </button>

        {/* Center: Brand & Bilingual Title */}
        <div className="flex flex-col items-center">
          <span className="text-xs font-black tracking-wider text-white">
            ASKAR <span className="text-emerald-400">KHATA</span>
          </span>
          <span className="text-[10px] text-slate-400 font-sans">أسواق أسكر</span>
        </div>

        {/* Right: Camp Privacy Mode & Language Selector */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleHideBalance}
            className="w-10 h-10 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-center text-slate-300 hover:text-white transition cursor-pointer shadow-xs"
            title={hideBalance ? t.showBalance : t.hideBalance}
          >
            {hideBalance ? <EyeOff className="w-4 h-4 text-amber-400" /> : <Eye className="w-4 h-4 text-slate-400" />}
          </button>
          <div className="flex items-center bg-slate-900 border border-slate-800 p-0.5 rounded-2xl">
            {['en', 'ar', 'ml'].map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={`min-w-7 h-8 px-1.5 rounded-xl font-bold text-[11px] uppercase transition-all flex items-center justify-center cursor-pointer ${
                  lang === code ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        </div>
      </header>

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

          {ledger?.pendingClaims && ledger.pendingClaims.length > 0 && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-300 text-xs font-semibold space-y-2 no-print text-left">
              <div className="flex items-center gap-2 font-bold text-sm text-amber-400">
                <Clock className="w-4 h-4 shrink-0" />
                <span>Payment Verification in Progress</span>
              </div>
              {ledger.pendingClaims.map((claim) => (
                <div key={claim.id} className="flex items-center justify-between font-mono text-[11px] bg-slate-950/80 p-2.5 rounded-xl border border-amber-500/20">
                  <span>BHD {Number(claim.amount).toFixed(3)} (Ref: #{claim.reference})</span>
                  <span className="text-amber-400 font-bold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30">
                    Awaiting Cashier
                  </span>
                </div>
              ))}
              <p className="text-[10px] text-amber-400/80">
                Your payment was submitted to the supermarket cashier and will be verified against store bank records.
              </p>
            </div>
          )}

          {/* Frozen / Locked Account Alert Banner */}
          {ledger?.is_active === 0 && (
            <div className="mb-6 p-4 bg-rose-500/15 border-2 border-rose-500/40 rounded-2xl text-rose-300 text-xs font-semibold space-y-2 no-print text-left">
              <div className="flex items-center gap-2 font-bold text-sm text-rose-400">
                <ShieldAlert className="w-5 h-5 shrink-0 text-rose-400" />
                <span>{t.frozenBadge}</span>
              </div>
              <p className="text-[11px] text-rose-200">
                {t.frozenDesc}
              </p>
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
          <div className="my-6 py-6 px-4 bg-slate-950/80 rounded-3xl border border-slate-800 relative">
            <div className="flex items-center justify-between mb-1 px-1">
              <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">
                {isCredit ? t.creditTitle : isSettled ? t.settledTitle : t.owed}
              </p>
              <button
                type="button"
                onClick={toggleHideBalance}
                title={hideBalance ? t.showBalance : t.hideBalance}
                className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer"
              >
                {hideBalance ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t.showBalance}</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t.hideBalance}</span>
                  </>
                )}
              </button>
            </div>
            <p className={`text-5xl sm:text-6xl font-black my-2 tracking-tight ${isCredit || isSettled ? 'text-emerald-400' : 'text-rose-500'}`}>
              {hideBalance 
                ? '••••••' 
                : (isCredit ? `+${t.currency} ${absBalance}` : `${t.currency} ${absBalance}`)}
            </p>
            <p className="text-xs text-slate-400 font-medium mb-4">
              {t.limit}: {t.currency} {ledger.credit_limit.toFixed(3)}
            </p>

            {/* Voice Audio Button for Laborers & Non-literate Camp Patrons */}
            {typeof window !== 'undefined' && 'speechSynthesis' in window && (
              <button
                type="button"
                onClick={speakBalance}
                className={`w-full py-3 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 border transition-all cursor-pointer shadow-xs active:scale-[0.98] ${
                  isSpeaking
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse'
                    : 'bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border-emerald-700/50 hover:border-emerald-500'
                }`}
              >
                {isSpeaking ? (
                  <>
                    <VolumeX className="w-4 h-4 text-amber-400 animate-spin" />
                    <span>Stop Voice Audio</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                    <span>{t.listenBalance}</span>
                  </>
                )}
              </button>
            )}

            {/* Sovereign Khata Self-Freeze / Unlock Kill Switch */}
            <button
              type="button"
              onClick={handleToggleFreeze}
              disabled={freezeLoading}
              className={`w-full py-2.5 px-4 mt-2.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 border transition-all cursor-pointer shadow-xs active:scale-[0.98] ${
                ledger.is_active === 0
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-rose-500/40 hover:text-rose-300'
              }`}
            >
              {freezeLoading ? (
                <span>Updating status...</span>
              ) : ledger.is_active === 0 ? (
                <>
                  <Unlock className="w-4 h-4 text-amber-400" />
                  <span>{t.unfreezeBtn}</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-slate-400" />
                  <span>{t.freezeBtn}</span>
                </>
              )}
            </button>
          </div>

          {/* Payment Section (Full or Partial Settlement) */}
          {isDebt ? (
            <div className="space-y-3 no-print">
              {/* Quick Chip Partial Amount Selectors */}
              {(() => {
                const chips = getDynamicQuickChips(balanceNum);
                return (
                  <div className={`grid ${chips.length >= 3 ? 'grid-cols-4' : chips.length === 2 ? 'grid-cols-3' : chips.length === 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-2 text-xs font-bold font-mono`}>
                    {chips.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => handlePay(amt)}
                        disabled={paying}
                        className="py-2.5 px-1 bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 rounded-xl border border-slate-700 text-slate-200 transition"
                      >
                        {amt.toFixed(3)} {t.currency}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setShowCustomPay(!showCustomPay)}
                      className={`py-2.5 px-1 rounded-xl border text-slate-200 transition ${
                        showCustomPay ? 'bg-emerald-700 border-emerald-500' : 'bg-slate-800/80 border-slate-700'
                      }`}
                    >
                      {t.custom || 'Custom'}
                    </button>
                  </div>
                );
              })()}

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
                    {t.payCustomBtn || 'Pay Custom Amount'}
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

          {/* Full Transaction History with Dates & Running Balances */}
          {(() => {
            const allTransactions = ledger.transactions || ledger.recentPurchases || ledger.ledger || [];
            if (allTransactions.length === 0) {
              return (
                <div className="my-4 p-4 bg-slate-950/80 border border-slate-800 rounded-2xl text-center text-xs text-slate-500">
                  {t.noRecentPurchases || 'No transactions recorded'}
                </div>
              );
            }

            const purchases = allTransactions.filter(tx => {
              const amt = Number(tx.amount || 0);
              const type = (tx.type || '').toUpperCase();
              return !(type.includes('PAY') || type.includes('SETTLE') || amt < 0);
            });

            const payments = allTransactions.filter(tx => {
              const amt = Number(tx.amount || 0);
              const type = (tx.type || '').toUpperCase();
              return type.includes('PAY') || type.includes('SETTLE') || amt < 0;
            });

            const displayedTransactions = txFilter === 'PURCHASE'
              ? purchases
              : txFilter === 'PAYMENT'
              ? payments
              : allTransactions;

            const visibleItems = displayedTransactions.slice(0, visibleTxCount);
            const hasMore = displayedTransactions.length > visibleTxCount;

            return (
              <div className="my-4 p-4 bg-slate-950/80 border border-slate-800 rounded-2xl text-left">
                {/* Header & Filter Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      {t.transactionsHistory || 'Transaction History'}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                      {allTransactions.length}
                    </span>
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1 text-[11px] font-semibold bg-slate-900 p-1 rounded-xl border border-slate-800 shrink-0 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setTxFilter('ALL')}
                      className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                        txFilter === 'ALL'
                          ? 'bg-slate-700 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t.filterAll || 'All'} ({allTransactions.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxFilter('PURCHASE')}
                      className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                        txFilter === 'PURCHASE'
                          ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60 shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t.filterPurchases || 'Purchases'} ({purchases.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTxFilter('PAYMENT')}
                      className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                        txFilter === 'PAYMENT'
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t.filterPayments || 'Payments'} ({payments.length})
                    </button>
                  </div>
                </div>

                {/* List of Interactive Itemized Transactions */}
                <div className="space-y-2.5">
                  {visibleItems.map((tx, idx) => (
                    <TransactionItemCard
                      key={tx.id || idx}
                      tx={tx}
                      lang={lang}
                      currency={t.currency || 'BHD'}
                      onViewReceipt={(inv) => setSelectedReceipt(inv)}
                    />
                  ))}
                </div>

                {/* Show More / Show Less Pagination Button */}
                {displayedTransactions.length > 10 && (
                  <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-center gap-2">
                    {hasMore ? (
                      <button
                        type="button"
                        onClick={() => setVisibleTxCount(prev => prev + 15)}
                        className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-700/80 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <span>{t.showMore || 'Show More'} ({displayedTransactions.length - visibleTxCount} remaining)</span>
                        <span>↓</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setVisibleTxCount(10)}
                        className="py-1.5 px-4 bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                      >
                        <span>{t.showLess || 'Show Less'}</span>
                        <span>↑</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

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

        {/* Discreet Shop Owner Switch / Setup Link */}
        <div className="mt-4 text-center no-print">
          <Link
            to="/?switch=1"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition py-1"
          >
            <span>{t.switchAcc}</span>
          </Link>
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

      {/* Slide-out Hamburger Drawer */}
      <HamburgerDrawer
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
        customer={ledger}
        lang={lang}
        onSelectLang={(newLang) => setLang(newLang)}
        hideBalance={hideBalance}
        onToggleHideBalance={toggleHideBalance}
        isSpeaking={isSpeaking}
        onToggleVoice={speakBalance}
        isFrozen={ledger?.is_active === 0}
        freezeLoading={freezeLoading}
        onToggleFreeze={handleToggleFreeze}
        onOpenBenefitPay={() => {
          if (ledger && ledger.balance > 0) {
            handlePay(ledger.balance);
          }
        }}
      />

      {/* Simplified Tax Invoice Receipt Modal */}
      <ReceiptModal
        isOpen={Boolean(selectedReceipt)}
        onClose={() => setSelectedReceipt(null)}
        invoice={selectedReceipt}
        lang={lang}
      />
    </div>
  );
}
