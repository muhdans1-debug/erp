import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { 
  ShieldCheck, 
  Lock, 
  Unlock, 
  ArrowLeft, 
  Receipt, 
  Share2, 
  KeyRound, 
  Calendar, 
  CheckCircle2, 
  ArrowDownRight, 
  ArrowUpRight,
  WifiOff,
  Printer,
  ChevronDown,
  PhoneCall,
  MessageCircle,
  Clock
} from 'lucide-react';
import BenefitPayModal from './components/BenefitPayModal';
import { generateBenefitPayPayload } from './utils/benefitPay';

const STATEMENT_TEXTS = {
  en: {
    brand: 'Askar Supermarket',
    secureKhata: 'Secure Digital Khata',
    accountLocked: 'Account Locked',
    enterPin: 'Enter your 4-digit PIN to view your private credit statement.',
    unlockBtn: 'Unlock Statement',
    verifying: 'Verifying PIN...',
    incorrectPin: 'Incorrect PIN. Please try again.',
    fourDigitsReq: 'Please enter your 4-digit PIN',
    welcome: 'Welcome',
    totalDue: 'Total Khata Due',
    creditTitle: 'Advance Store Credit',
    trusted: 'Device Trusted • 90-Day Token Active',
    payBenefit: 'Pay via BenefitPay',
    connectingGateway: 'Connecting to Gateway...',
    changePinTitle: 'Change Security PIN',
    changePinSubtitle: 'Replace your current 4-digit PIN with a confidential code of your choice.',
    currentPin: 'Current PIN',
    newPin: 'New 4-Digit PIN',
    updatePinBtn: 'Update PIN',
    updatingPin: 'Updating PIN...',
    historyTitle: 'Itemized Transaction History',
    noTransactions: 'No previous transactions found for this account.',
    shareWhatsapp: 'Share Statement on WhatsApp',
    printReceipt: 'Print Statement / PDF',
    lockDevice: 'Lock Device',
    backSearch: 'Back to Search',
    offlineSnapshot: 'Offline Snapshot — Reconnecting...',
    customAmount: 'Custom Payment Amount',
    loadMore: 'Load Older Transactions',
    loadingMore: 'Loading Transactions...',
    allLoaded: 'All transactions loaded',
    autoLockNotice: 'Session auto-locked after 15 minutes of inactivity for privacy.',
    networkErr: 'No internet connection detected. Showing saved offline snapshot.',
    callStore: 'Call Store Hotline',
    whatsappHelp: 'WhatsApp Helpdesk',
    settledTitle: 'Balance Settled (No Debt)',
    writeOff: 'Debt Forgiven / Write-Off',
    paymentReceived: 'Payment Received',
    storePurchase: 'Store Purchase',
    currency: 'BHD',
    custom: 'Custom',
    payCustomBtn: 'Pay Custom Amount'
  },
  ar: {
    brand: 'أسواق أسكر المركزية',
    secureKhata: 'دفتر الحسابات الرقمي الآمن',
    accountLocked: 'الحساب مقفل برمز سري',
    enterPin: 'أدخل رقمك السري المكون من 4 أرقام لفتح كشف حسابك.',
    unlockBtn: 'فتح كشف الحساب',
    verifying: 'جاري التحقق من الرمز...',
    incorrectPin: 'الرمز السري غير صحيح. يرجى المحاولة مرة أخرى.',
    fourDigitsReq: 'يرجى إدخال رمز مكون من 4 أرقام',
    welcome: 'مرحباً',
    totalDue: 'إجمالي الرصيد المستحق',
    creditTitle: 'رصيد دائن / دفعة مقدمة',
    trusted: 'جهاز موثوق • تسجيل الدخول مفعل',
    payBenefit: 'السداد عبر بنفت بي',
    connectingGateway: 'جاري الاتصال ببوابة الدفع...',
    changePinTitle: 'تغيير الرقم السري',
    changePinSubtitle: 'استبدل رقمك السري الحالي برمز خاص من اختيارك.',
    currentPin: 'الرقم السري الحالي',
    newPin: 'الرقم السري الجديد',
    updatePinBtn: 'تحديث الرمز السري',
    updatingPin: 'جاري التحديث...',
    historyTitle: 'سجل العمليات التفصيلي',
    noTransactions: 'لا توجد حركات مسجلة في هذا الحساب.',
    shareWhatsapp: 'مشاركة كشف الحساب عبر واتساب',
    printReceipt: 'طباعة كشف الحساب / PDF',
    lockDevice: 'قفل الجهاز',
    backSearch: 'العودة للبحث',
    offlineSnapshot: 'نسخة محفوظة بدون إنترنت',
    customAmount: 'مبلغ سداد مخصص',
    loadMore: 'تحميل العمليات السابقة',
    loadingMore: 'جاري التحميل...',
    allLoaded: 'تم عرض جميع العمليات',
    autoLockNotice: 'تم قفل الجلسة تلقائياً بعد 15 دقيقة لحماية خصوصيتك.',
    networkErr: 'لا يوجد اتصال بالإنترنت. يتم عرض النسخة المحفوظة.',
    callStore: 'الاتصال بالفرع',
    whatsappHelp: 'دعم واتساب',
    settledTitle: 'الحساب مسدد بالكامل (لا توجد ديون)',
    writeOff: 'إعفاء / تسوية دين',
    paymentReceived: 'دفعة مسددة',
    storePurchase: 'مشتريات من المحل',
    currency: 'د.ب',
    custom: 'مبلغ مخصص',
    payCustomBtn: 'سداد مبلغ مخصص'
  },
  ml: {
    brand: 'അസ്കർ സൂപ്പർമാർക്കറ്റ്',
    secureKhata: 'സുരക്ഷിത ഡിജിറ്റൽ ഖാത്ത',
    accountLocked: 'അക്കൗണ്ട് ലോക്ക് ചെയ്തിരിക്കുന്നു',
    enterPin: 'നിങ്ങളുടെ 4 അക്ക PIN നൽകി അക്കൗണ്ട് വിവരങ്ങൾ തുറക്കുക.',
    unlockBtn: 'അക്കൗണ്ട് തുറക്കുക',
    verifying: 'പരിശോധിക്കുന്നു...',
    incorrectPin: 'തെറ്റായ PIN. വീണ്ടും ശ്രമിക്കുക.',
    fourDigitsReq: '4 അക്ക PIN നൽകുക',
    welcome: 'സ്വാഗതം',
    totalDue: 'നൽകാനുള്ള ആകെ തുക',
    creditTitle: 'അഡ്വാൻസ് ക്രെഡിറ്റ് ബാക്കി',
    trusted: 'ഡിവൈസ് പരിശോധിച്ചു • ലോഗിൻ സജീവം',
    payBenefit: 'ബെനിഫിറ്റ് പേ വഴി നൽകുക',
    connectingGateway: 'കണക്റ്റ് ചെയ്യുന്നു...',
    changePinTitle: 'PIN മാറ്റുക',
    changePinSubtitle: 'പുതിയ 4 അക്ക രഹസ്യ PIN നൽകുക.',
    currentPin: 'ഇപ്പോഴത്തെ PIN',
    newPin: 'പുതിയ PIN',
    updatePinBtn: 'PIN അപ്ഡേറ്റ് ചെയ്യുക',
    updatingPin: 'അപ്ഡേറ്റ് ചെയ്യുന്നു...',
    historyTitle: 'പഴയ ബില്ലുകളും പേയ്‌മെന്റുകളും',
    noTransactions: 'ഇതുവരെ ഇടപാടുകൾ നടന്നിട്ടില്ല.',
    shareWhatsapp: 'വാട്ട്സ്ആപ്പിൽ പങ്കിടുക',
    printReceipt: 'പ്രിന്റ് ചെയ്യുക / PDF',
    lockDevice: 'ലോക്ക് ചെയ്യുക',
    backSearch: 'തിരികെ പോവുക',
    offlineSnapshot: 'ഓഫ്‌ലൈൻ വിവരങ്ങൾ',
    customAmount: 'മറ്റൊരു തുക നൽകുക',
    loadMore: 'കൂടുതൽ ഇടപാടുകൾ കാണുക',
    loadingMore: 'ലോഡ് ചെയ്യുന്നു...',
    allLoaded: 'മുഴുവൻ വിവരങ്ങളും ലഭ്യമാണ്',
    autoLockNotice: 'സുരക്ഷയ്ക്കായി 15 മിനിറ്റിനു ശേഷം അക്കൗണ്ട് ഓട്ടോ ലോക്ക് ആയി.',
    networkErr: 'ഇന്റർനെറ്റ് ലഭ്യമല്ല. ഓഫ്ലൈൻ വിവരങ്ങൾ കാണിക്കുന്നു.',
    callStore: 'കടയിലേക്ക് വിളിക്കുക',
    whatsappHelp: 'വാട്ട്സ്ആപ്പ് സഹായം',
    settledTitle: 'മുഴുവൻ തുകയും അടച്ചു തീർത്തു',
    writeOff: 'കടം ഒഴിവാക്കി',
    paymentReceived: 'പേയ്‌മെന്റ് ലഭിച്ചു',
    storePurchase: 'സാധനങ്ങൾ വാങ്ങി',
    currency: 'BHD',
    custom: 'മറ്റൊരു തുക',
    payCustomBtn: 'തുക നൽകുക'
  },
  bn: {
    brand: 'আসকার সুপারমার্কেট',
    secureKhata: 'সুরক্ষিত ডিজিটাল খাতা',
    accountLocked: 'অ্যাকাউন্ট লক করা আছে',
    enterPin: 'আপনার ৪ ডিজিটের পিন দিয়ে হিসাব বিবরণ খুলুন।',
    unlockBtn: 'বিবরণ দেখুন',
    verifying: 'যাচাই করা হচ্ছে...',
    incorrectPin: 'ভুল পিন নম্বর। আবার চেষ্টা করুন।',
    fourDigitsReq: 'অনুগ্রহ করে ৪ ডিজিটের পিন লিখুন',
    welcome: 'স্বাগতম',
    totalDue: 'মোট বাকি পরিমাণ',
    creditTitle: 'জমা টাকা (ক্রেডিট)',
    trusted: 'ডিভাইস যাচাইকৃত • ৯০ দিন কার্যকর',
    payBenefit: 'বেনিফিট পে দিয়ে দিন',
    connectingGateway: 'গেটওয়ে সংযোগ হচ্ছে...',
    changePinTitle: 'পিন নম্বর পরিবর্তন',
    changePinSubtitle: 'নতুন ৪ ডিজিটের গোপন পিন নম্বর সেট করুন।',
    currentPin: 'বর্তমান পিন',
    newPin: 'নতুন পিন',
    updatePinBtn: 'পিন পরিবর্তন করুন',
    updatingPin: 'পরিবর্তন হচ্ছে...',
    historyTitle: 'বিস্তারিত লেনদেন ইতিহাস',
    noTransactions: 'কোনো লেনদেন রেকর্ড নেই।',
    shareWhatsapp: 'হোয়াটসঅ্যাপে শেয়ার',
    printReceipt: 'রসিদ প্রিন্ট / PDF',
    lockDevice: 'ডিভাইস লক',
    backSearch: 'অনুসন্ধানে ফিরুন',
    offlineSnapshot: 'অফলাইন স্ন্যাপশট',
    customAmount: 'নির্দিষ্ট পরিমাণ টাকা',
    loadMore: 'পূর্বের লেনদেন লোড করুন',
    loadingMore: 'লোড হচ্ছে...',
    allLoaded: 'সব লেনদেন দেখানো হয়েছে',
    autoLockNotice: 'নিরাপত্তার জন্য ১৫ মিনিট পর স্বয়ংক্রিয়ভাবে লক করা হয়েছে।',
    networkErr: 'ইন্টারনেট সংযোগ নেই। সংরক্ষিত তথ্য দেখানো হচ্ছে।',
    callStore: 'দোকানে কল করুন',
    whatsappHelp: 'হোয়াটসঅ্যাপ সাপোর্ট',
    settledTitle: 'সব হিসাব পরিশোধিত (কোনো বাকি নেই)',
    writeOff: 'মওকুফ করা হয়েছে',
    paymentReceived: 'পরিশোধ গ্রহণ করা হয়েছে',
    storePurchase: 'দোকান থেকে কেনাকাটা',
    currency: 'BHD',
    custom: 'অন্যান্য',
    payCustomBtn: 'টাকা পরিশোধ করুন'
  },
  hi: {
    brand: 'अस्कर सुपरमार्केट',
    secureKhata: 'सुरक्षित डिजिटल खाता',
    accountLocked: 'खाता सुरक्षित रूप से लॉक है',
    enterPin: 'अपना 4-अंकों का पिन दर्ज करके विस्तृत खाता विवरण देखें।',
    unlockBtn: 'खाता अनलॉक करें',
    verifying: 'पिन सत्यापित हो रहा है...',
    incorrectPin: 'गलत पिन। पुनः प्रयास करें।',
    fourDigitsReq: 'कृपया 4 अंकों का पिन दर्ज करें',
    welcome: 'नमस्ते',
    totalDue: 'कुल बकाया राशि',
    creditTitle: 'अग्रिम जमा राशि',
    trusted: 'डिवाइस सत्यापित • 90 दिन मान्य',
    payBenefit: 'बेनिफिट पे से भुगतान करें',
    connectingGateway: 'गेटवे से जुड़ रहा है...',
    changePinTitle: 'सिक्योरिटी पिन बदलें',
    changePinSubtitle: 'नया 4-अंकों का गोपनीय पिन सेट करें।',
    currentPin: 'वर्तमान पिन',
    newPin: 'नया पिन',
    updatePinBtn: 'पिन अपडेट करें',
    updatingPin: 'अपडेट हो रहा है...',
    historyTitle: 'विस्तृत लेन-देन इतिहास',
    noTransactions: 'कोई लेन-देन रिकॉर्ड नहीं मिला।',
    shareWhatsapp: 'व्हाट्सएप पर भेजें',
    printReceipt: 'रसीद प्रिंट करें / PDF',
    lockDevice: 'डिवाइस लॉक करें',
    backSearch: 'पीछे जाएं',
    offlineSnapshot: 'ऑफलाइन विवरण',
    customAmount: 'कस्टम भुगतान राशि',
    loadMore: 'पुराने लेन-देन देखें',
    loadingMore: 'लोड हो रहा है...',
    allLoaded: 'सभी लेन-देन लोड हो चुके हैं',
    autoLockNotice: 'सुरक्षा के लिए 15 मिनट की निष्क्रियता के बाद ऑटो-लॉक कर दिया गया।',
    networkErr: 'इंटरनेट कनेक्शन नहीं है। ऑफलाइन विवरण दिखाया जा रहा है।',
    callStore: 'दुकान पर कॉल करें',
    whatsappHelp: 'व्हाट्सएप सहायता',
    settledTitle: 'खाता चुकता (कोई बकाया नहीं)',
    writeOff: 'ऋण माफ़ / समायोजन',
    paymentReceived: 'भुगतान प्राप्त',
    storePurchase: 'दुकान से खरीदारी',
    currency: 'BHD',
    custom: 'कस्टम',
    payCustomBtn: 'राशि का भुगतान करें'
  }
};

const STORE_PHONE = '+97317000000';
const STORE_WHATSAPP = '97339000000';

// Robust ISO Date Formatter resilient against iOS Safari / WebKit SQLite space delimiters
function formatTxDate(rawTimestamp) {
  if (!rawTimestamp) return 'Recent';
  try {
    const sanitized = String(rawTimestamp).trim().replace(' ', 'T');
    const isoString = sanitized.includes('Z') || sanitized.includes('+') ? sanitized : `${sanitized}Z`;
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Recent';
    return d.toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return 'Recent';
  }
}

// Arabic-Indic Numeral Normalizer for Bahrain & GCC Accessibility (Resolved PWA-ACC-02)
function normalizeArabicNumerals(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
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

// Bounded local storage helper to prevent quota exhaustion (Resolved PWA-DAT-02)
function safeSetBoundedCache(key, value, prefix = 'khata_stmt_cache_') {
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

export function KhataStatement() {
  const { uuid } = useParams();
  const [searchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  const tokenKey = `khata_token_${uuid}`;
  const pinKey = `khata_pin_${uuid}`;
  const jwtKey = `khata_jwt_${uuid}`;

  const [lang, setLang] = useState('en');
  const t = STATEMENT_TEXTS[lang] || STATEMENT_TEXTS.en;
  const isRtl = lang === 'ar';

  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return Boolean(localStorage.getItem(jwtKey) || (localStorage.getItem(tokenKey) && localStorage.getItem(pinKey)));
  });
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const [account, setAccount] = useState(null);
  const [ledgerData, setLedgerData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [paying, setPaying] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [showBenefitModal, setShowBenefitModal] = useState(false);
  const [benefitPayData, setBenefitPayData] = useState(null);
  const [showSuccessBanner, setShowSuccessBanner] = useState(() => 
    statusParam === 'complete' || statusParam === 'success' || statusParam === 'mock_demo_success'
  );

  // Pagination for Multi-Year Ledgers (ADV-10)
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Inactivity notification banner (ADV-05)
  const [showAutoLockNotice, setShowAutoLockNotice] = useState(false);

  // Partial payment state
  const [payAmount, setPayAmount] = useState('');
  const [showCustomPay, setShowCustomPay] = useState(false);

  // Self-service PIN change states
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinMessage, setPinMessage] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);

  // AbortController ref for in-flight fetch management (ADV-07)
  const abortControllerRef = useRef(null);

  // Synchronize document lang & dir for screen readers (Resolved PWA-ACC-03)
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  // Lock account and wipe sensitive memory state (Clearing both uuid and canonical account.id)
  const handleLockAccount = useCallback((isAutoLock = false) => {
    try {
      localStorage.removeItem(tokenKey);
      localStorage.removeItem(pinKey);
      localStorage.removeItem(jwtKey);
      localStorage.removeItem(`khata_jwt_${uuid}`);
      if (account?.id) {
        localStorage.removeItem(`khata_token_${account.id}`);
        localStorage.removeItem(`khata_pin_${account.id}`);
        localStorage.removeItem(`khata_jwt_${account.id}`);
      }
    } catch {}

    setIsAuthenticated(false);
    setPin('');
    setPinError('');
    setAccount(null);
    setLedgerData([]);
    setHasMore(false);
    if (isAutoLock) {
      setShowAutoLockNotice(true);
    }
  }, [tokenKey, pinKey, jwtKey, uuid, account]);

  // 15-Minute Inactivity Auto-Lock for Shared Phones in Labor Camps (ADV-05)
  useEffect(() => {
    if (!isAuthenticated) return;

    let timeoutId;
    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLockAccount(true);
      }, 15 * 60 * 1000); // 15 minutes of inactivity
    };

    resetTimer();

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    activityEvents.forEach((evt) => {
      window.addEventListener(evt, resetTimer, { passive: true });
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, resetTimer);
      });
    };
  }, [isAuthenticated, handleLockAccount]);

  // Fetch statement & ledger data with cryptographic JWT pairing & rate-limited PIN authentication
  const fetchLedger = useCallback(async (customerId, userEnteredPin, signal) => {
    setLoading(true);
    setError(false);
    try {
      const savedJwt = localStorage.getItem(`khata_jwt_${customerId}`) || localStorage.getItem(`khata_jwt_${uuid}`) || '';
      const headers = {
        'Content-Type': 'application/json'
      };

      if (userEnteredPin) {
        headers['x-khata-pin'] = normalizeArabicNumerals(userEnteredPin);
      }
      if (savedJwt) {
        headers['Authorization'] = `Bearer ${savedJwt}`;
      }

      const response = await fetch(`/api/khata/${customerId}?limit=50&offset=0`, {
        method: 'GET',
        headers,
        signal
      });

      if (response.status === 401 || response.status === 403) {
        try {
          localStorage.removeItem(tokenKey);
          localStorage.removeItem(pinKey);
          localStorage.removeItem(jwtKey);
          localStorage.removeItem(`khata_jwt_${customerId}`);
        } catch {}
        setIsAuthenticated(false);
        setPinError(t.incorrectPin);
        setLoading(false);
        return false;
      }

      if (response.status === 429) {
        const errJson = await response.json().catch(() => ({}));
        setIsAuthenticated(false);
        setPinError(errJson.error || 'Too many failed attempts. Account temporarily locked.');
        setLoading(false);
        return false;
      }

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.message || 'Account Not Found');
      }

      const data = await response.json();

      // If server returned public fallback due to expired JWT/missing PIN (Resolved PWA-R4-01)
      if (data.isLocked) {
        try {
          localStorage.removeItem(tokenKey);
          localStorage.removeItem(jwtKey);
          localStorage.removeItem(`khata_jwt_${customerId}`);
        } catch {}
        setIsAuthenticated(false);
        setAccount(data);
        setLedgerData([]);
        setLoading(false);
        return false;
      }

      setAccount(data);
      const ledgerList = Array.isArray(data.ledger) ? data.ledger : [];
      setLedgerData(ledgerList);
      setHasMore(ledgerList.length >= 50);
      setIsOffline(false);

      // Cache snapshot and JWT token with bounded storage (Resolved ADV-06 & PWA-DAT-02)
      try {
        if (data.token) {
          localStorage.setItem(jwtKey, data.token);
          localStorage.setItem(`khata_jwt_${customerId}`, data.token);
          if (data.id) {
            localStorage.setItem(`khata_jwt_${data.id}`, data.token);
          }
        }
        localStorage.setItem(tokenKey, 'paired_' + Date.now());
        if (userEnteredPin) {
          localStorage.setItem(pinKey, userEnteredPin);
          if (data.id) localStorage.setItem(`khata_pin_${data.id}`, userEnteredPin);
        }
        safeSetBoundedCache(`khata_stmt_cache_${customerId}`, JSON.stringify({ account: data, ledger: ledgerList }));
        if (data.name) {
          localStorage.setItem(`khata_name_${customerId}`, data.name);
          if (data.id) localStorage.setItem(`khata_name_${data.id}`, data.name);
        }
      } catch {}

      setIsAuthenticated(true);
      setShowAutoLockNotice(false);
      setLoading(false);
      return true;
    } catch (err) {
      if (err.name === 'AbortError') {
        return false;
      }
      console.warn('Network issue fetching statement, attempting offline snapshot:', err);
      // Fallback to offline cached snapshot (ADV-08)
      try {
        const cached = localStorage.getItem(`khata_stmt_cache_${customerId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          setAccount(parsed.account);
          setLedgerData(parsed.ledger || []);
          setHasMore(false);
          setIsOffline(true);
          setIsAuthenticated(true);
          setLoading(false);
          return true;
        }
      } catch {}

      setError(t.networkErr);
      setLoading(false);
      return false;
    }
  }, [tokenKey, pinKey, jwtKey, uuid, t.incorrectPin, t.networkErr]);

  // AbortController component unmount lifecycle cleanup (ADV-07)
  useEffect(() => {
    if (!isAuthenticated) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const savedPin = localStorage.getItem(pinKey) || '';
    const load = async () => {
      await fetchLedger(uuid, savedPin, controller.signal);
    };
    load();

    return () => {
      controller.abort();
    };
  }, [isAuthenticated, uuid, pinKey, fetchLedger]);

  // Auto-refresh statement balance when returning from BenefitPay app via visibilitychange (BP-08)
  useEffect(() => {
    if (!isAuthenticated) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const savedPin = localStorage.getItem(pinKey) || '';
        fetchLedger(uuid, savedPin);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, uuid, pinKey, fetchLedger]);

  // Load Older Historical Ledger Records with Dynamic Token Resolution (Resolved ADV-10)
  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    try {
      const savedJwt = (account?.id && localStorage.getItem(`khata_jwt_${account.id}`)) || localStorage.getItem(`khata_jwt_${uuid}`) || '';
      const savedPin = localStorage.getItem(pinKey) || '';
      const headers = {
        'Content-Type': 'application/json',
        ...(savedJwt ? { 'Authorization': `Bearer ${savedJwt}` } : {}),
        ...(savedPin ? { 'x-khata-pin': savedPin } : {})
      };

      const res = await fetch(`/api/khata/${uuid}?limit=50&offset=${ledgerData.length}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const newRecords = Array.isArray(data.ledger) ? data.ledger : [];
        if (newRecords.length > 0) {
          setLedgerData((prev) => [...prev, ...newRecords]);
          setHasMore(newRecords.length >= 50);
        } else {
          setHasMore(false);
        }
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.warn('Error loading older transactions:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  // Execute PIN verification with concurrency protection
  const triggerPinVerify = async (pinValue) => {
    if (isVerifying) return;
    const clean = normalizeArabicNumerals(pinValue);
    if (!clean || clean.length < 4) {
      setPinError(t.fourDigitsReq);
      return;
    }

    setIsVerifying(true);
    setPinError('');

    try {
      const success = await fetchLedger(uuid, clean);
      if (!success) {
        setPin('');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifyPin = async (e) => {
    if (e) e.preventDefault();
    triggerPinVerify(pin);
  };

  // Mobile Keypad Handler with Instant Auto-Submit on 4th Digit
  const handleDigitClick = (digit) => {
    const norm = normalizeArabicNumerals(digit);
    if (pin.length < 4) {
      const updated = pin + norm;
      setPin(updated);
      if (pinError) setPinError('');
      if (updated.length === 4) {
        triggerPinVerify(updated);
      }
    }
  };

  const handleChangePin = async (e) => {
    if (e) e.preventDefault();
    if (isChangingPin) return;
    const normOld = normalizeArabicNumerals(oldPin);
    const normNew = normalizeArabicNumerals(newPin);

    if (!normOld || normOld.length !== 4) {
      setPinMessage('❌ ' + t.fourDigitsReq);
      return;
    }
    if (!normNew || normNew.length !== 4) {
      setPinMessage('❌ ' + t.fourDigitsReq);
      return;
    }

    setIsChangingPin(true);
    setPinMessage('');

    try {
      const response = await fetch('/api/auth/change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid: account?.id || uuid, oldPin: normOld, newPin: normNew })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        localStorage.setItem(pinKey, normNew);
        if (account?.id) localStorage.setItem(`khata_pin_${account.id}`, normNew);
        setPinMessage('✅ PIN updated successfully!');
        setOldPin('');
        setNewPin('');
      } else {
        setPinMessage('❌ ' + (data.error || 'Failed to update PIN'));
      }
    } catch {
      setPinMessage('❌ Connection error. Please try again.');
    } finally {
      setIsChangingPin(false);
    }
  };

  // Real Tap Payments / BenefitPay Execution with Strict Minimum Validation (Resolved PWA-INT-03 & BP-08)
  const handlePayBenefitPay = async (specifiedAmount) => {
    if (!account || Number(account.balance) <= 0) return;
    const finalAmount = Number(Number(specifiedAmount || payAmount || account.balance).toFixed(3));
    
    if (isNaN(finalAmount) || finalAmount < 0.100) {
      alert('Minimum settlement amount is 0.100 BHD (100 fils)');
      return;
    }

    setPaying(true);
    try {
      const savedJwt = (account?.id && localStorage.getItem(`khata_jwt_${account.id}`)) || localStorage.getItem(`khata_jwt_${uuid}`) || '';
      const savedPin = localStorage.getItem(pinKey) || '';
      const headers = {
        'Content-Type': 'application/json',
        ...(savedJwt ? { 'Authorization': `Bearer ${savedJwt}` } : {}),
        ...(savedPin ? { 'x-khata-pin': savedPin } : {})
      };

      const res = await fetch('/api/checkout/init', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: account?.id || uuid,
          amount: Math.min(finalAmount, Number(account.balance)),
          customerName: account.name,
          sourceView: 'statement'
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || 'Payment initialization failed. Please try again.');
        return;
      }

      if (data.mode === 'GATEWAY_REDIRECT' && data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
      } else {
        // Direct Fawri+ BenefitPay Mode (Dynamic CBB EMVCo QR code & deep link)
        setBenefitPayData(data);
        setShowBenefitModal(true);
      }
    } catch (err) {
      console.warn('Payment API unavailable, falling back to local BenefitPay generator:', err);
      // Offline / Local CBB QR Fallback (BP-08)
      try {
        const fallbackAmount = Math.min(finalAmount, Number(account.balance));
        const invoiceRef = `KHATA-${(account?.id || uuid).slice(0, 8)}`;
        const qrString = generateBenefitPayPayload(fallbackAmount, invoiceRef);
        setBenefitPayData({
          mode: 'BENEFITPAY_FAWRI',
          amount: fallbackAmount,
          currency: 'BHD',
          merchantName: 'ASKAR SUPERMARKET',
          merchantId: '97300182',
          mobileNumber: '+973 32067388',
          iban: 'BH67NBOB00000012345678',
          branchId: 'POS-01',
          qrPayload: qrString,
          customerId: account?.id || uuid,
          customerName: account.name
        });
        setShowBenefitModal(true);
      } catch (localErr) {
        alert(`Failed to launch BenefitPay: ${localErr.message}`);
      }
    } finally {
      setPaying(false);
    }
  };

  const handleShareWhatsApp = () => {
    if (!account) return;
    const balanceNum = Number(account.balance || 0);
    const balanceStr = Math.abs(balanceNum).toFixed(3);
    const isSettled = Math.abs(balanceNum) < 0.0005;

    let textStr = '';
    if (lang === 'ar') {
      textStr = `*أسواق أسكر المركزية - كشف الحساب*\nالزبون: ${account.name}\n${isSettled ? 'الحالة: الحساب مسدد بالكامل (لا توجد ديون)' : `الرصيد: ${t.currency} ${balanceStr}`}\nرابط الكشف: ${window.location.href}`;
    } else {
      textStr = `*Askar Supermarket Statement*\nCustomer: ${account.name}\n${isSettled ? 'Status: Fully Settled (No Debt Owed)' : `Balance: ${t.currency} ${balanceStr}`}\nStatement Link: ${window.location.href}`;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(textStr)}`, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  // ----------------------------------------------------
  // 1. LOCKED VIEW: PIN Verification & Touch Keypad
  // ----------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div 
        dir={isRtl ? 'rtl' : 'ltr'}
        className="flex flex-col items-center justify-between min-h-screen bg-slate-950 text-white p-4 pt-safe pb-safe select-none selection:bg-emerald-500 selection:text-white"
      >
        {/* Top Header */}
        <div className="w-full max-w-sm flex items-center justify-between pt-2 no-print">
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white py-2">
            <ArrowLeft className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
            <span>{t.backSearch}</span>
          </Link>

          {/* Large Accessible Lang toggle */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-2xl text-xs font-bold">
            {['en', 'ar', 'ml', 'bn', 'hi'].map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={`min-w-8 h-9 px-2.5 rounded-xl uppercase transition ${
                  lang === code ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        </div>

        {/* Lock Modal */}
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center my-auto relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          {showAutoLockNotice && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-300 text-xs font-semibold flex items-center gap-2 text-center no-print">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{t.autoLockNotice}</span>
            </div>
          )}

          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 shadow-inner">
            <Lock className="w-8 h-8" />
          </div>

          <span className="text-[10px] font-black tracking-widest text-emerald-400 uppercase bg-emerald-950/80 border border-emerald-800/40 px-3 py-1 rounded-full mb-3">
            {t.secureKhata}
          </span>

          <h1 className="text-2xl font-black tracking-tight text-white mb-1.5 text-center">
            {t.accountLocked}
          </h1>
          <p className="text-xs text-slate-400 text-center mb-6 leading-relaxed">
            {t.enterPin}
          </p>

          <form onSubmit={handleVerifyPin} className="w-full flex flex-col items-center no-print">
            {/* 4 PIN Dots Indicator */}
            <div className="flex items-center justify-center gap-3.5 mb-6">
              {[0, 1, 2, 3].map((index) => {
                const filled = pin.length > index;
                return (
                  <div
                    key={index}
                    className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                      filled
                        ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)] scale-110'
                        : 'border-slate-700 bg-slate-950'
                    }`}
                  />
                );
              })}
            </div>

            {/* Direct Input Field for Screen Readers / Physical Keyboards with Arabic Normalization */}
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={(e) => {
                const val = normalizeArabicNumerals(e.target.value).replace(/\D/g, '').slice(0, 4);
                setPin(val);
                if (pinError) setPinError('');
                if (val.length === 4) triggerPinVerify(val);
              }}
              className="sr-only"
              autoFocus
              id="hidden-pin-input"
            />

            {/* Error Message */}
            {pinError && (
              <div className="mb-4 text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl text-center w-full">
                {pinError}
              </div>
            )}

            {/* Large 3x4 On-Screen Keypad for Camp Laborers */}
            <div className="grid grid-cols-3 gap-2.5 w-full mb-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleDigitClick(String(digit))}
                  disabled={isVerifying}
                  className="h-14 rounded-2xl bg-slate-950/80 hover:bg-slate-800 active:bg-emerald-600 active:text-white border border-slate-800 text-white font-mono text-xl font-bold transition shadow-xs flex items-center justify-center cursor-pointer select-none"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setPin('');
                  setPinError('');
                }}
                disabled={isVerifying}
                className="h-14 rounded-2xl bg-slate-950/40 hover:bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-xs font-bold transition flex items-center justify-center cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => handleDigitClick('0')}
                disabled={isVerifying}
                className="h-14 rounded-2xl bg-slate-950/80 hover:bg-slate-800 active:bg-emerald-600 active:text-white border border-slate-800 text-white font-mono text-xl font-bold transition shadow-xs flex items-center justify-center cursor-pointer select-none"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pin.length > 0) {
                    setPin(pin.slice(0, -1));
                    if (pinError) setPinError('');
                  }
                }}
                disabled={isVerifying}
                className="h-14 rounded-2xl bg-slate-950/40 hover:bg-slate-900 border border-slate-800 text-slate-400 hover:text-white text-xs font-bold transition flex items-center justify-center cursor-pointer"
              >
                ⌫
              </button>
            </div>

            {/* Manual Unlock Submit Button */}
            <button
              type="submit"
              disabled={isVerifying || pin.length !== 4}
              className="w-full min-h-[50px] bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 text-white font-bold py-3.5 rounded-2xl transition shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 cursor-pointer text-sm"
            >
              {isVerifying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{t.verifying}</span>
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>{t.unlockBtn}</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <footer className="w-full max-w-sm py-2 text-center text-slate-600 text-[11px] flex items-center justify-center gap-1.5 no-print">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/60" />
          <span>NBR Tax Compliant • Protected by BenefitPay</span>
        </footer>
      </div>
    );
  }

  // ----------------------------------------------------
  // 2. LOADING STATE
  // ----------------------------------------------------
  if (loading && !account) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-sm w-full text-center shadow-xl">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 font-medium text-sm">Deciphering Khata Statement...</p>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 3. ERROR STATE
  // ----------------------------------------------------
  if (error && !account) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-sm w-full text-center shadow-xl">
          <div className="w-14 h-14 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold border border-red-500/30">
            !
          </div>
          <h2 className="text-xl font-black mb-2">Statement Error</h2>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            {typeof error === 'string' ? error : 'Unable to retrieve private Khata statement. Please check your network or try again.'}
          </p>
          <div className="space-y-2">
            <button
              onClick={() => handleLockAccount(false)}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl text-xs transition"
            >
              Re-enter PIN
            </button>
            <Link
              to="/"
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-2xl text-xs transition inline-block"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 4. UNLOCKED VIEW: Private Statement & Balance Details
  // ----------------------------------------------------
  const balanceNum = Number(account?.balance || 0);
  const isDebt = balanceNum > 0.0005;
  const isCredit = balanceNum < -0.0005;
  const isSettled = !isDebt && !isCredit;
  const absBalance = Math.abs(balanceNum).toFixed(3);

  return (
    <div 
      dir={isRtl ? 'rtl' : 'ltr'}
      className="min-h-screen bg-slate-950 text-white flex flex-col items-center p-4 pt-safe pb-safe selection:bg-emerald-500 selection:text-white"
    >
      {/* Top Header & Actions */}
      <div className="w-full max-w-md mb-3 flex items-center justify-between no-print">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition py-2">
          <ArrowLeft className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
          <span>{t.backSearch}</span>
        </Link>

        {/* Language Switcher & Lock Device Button */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-2xl">
            {['en', 'ar', 'ml', 'bn', 'hi'].map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={`min-w-8 h-8 px-2 rounded-xl font-bold text-xs uppercase transition-all flex items-center justify-center ${
                  lang === code ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                {code}
              </button>
            ))}
          </div>

          <button
            onClick={() => handleLockAccount(false)}
            className="h-10 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl text-xs text-rose-400 font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.lockDevice}</span>
          </button>
        </div>
      </div>

      <div className="w-full max-w-md space-y-4">
        {/* Offline Snapshot Banner */}
        {isOffline && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-300 text-xs font-semibold flex items-center gap-2 justify-center no-print">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{t.offlineSnapshot}</span>
          </div>
        )}

        {/* Success Banner when returning from BenefitPay / Payment Gateway (BP-08) */}
        {showSuccessBanner && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-300 text-sm font-semibold flex items-center justify-between no-print">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>Payment received! Your statement balance has been updated.</span>
            </div>
            <button 
              type="button" 
              onClick={() => setShowSuccessBanner(false)}
              className="text-emerald-400/70 hover:text-emerald-300 font-bold px-1"
              aria-label="Dismiss banner"
            >
              ✕
            </button>
          </div>
        )}

        {/* MAIN BALANCE SUMMARY CARD */}
        <div className="p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-slate-400 font-medium">{t.welcome},</p>
              <h2 className="text-xl font-black text-white tracking-tight">{account.name}</h2>
              {account.cpr && (
                <p className="text-[11px] text-slate-400 font-mono">CPR: {account.cpr}</p>
              )}
            </div>
            <div className="text-right">
              <span className="text-[10px] font-mono tracking-widest text-emerald-400 uppercase bg-emerald-950/80 border border-emerald-800/40 px-3 py-1 rounded-full">
                Active Khata
              </span>
              <p className="text-[10px] text-slate-400 mt-1 font-mono">ID: {account.id?.slice(0, 8)}...</p>
            </div>
          </div>

          {/* Balance Amount Block */}
          <div className="py-6 px-4 bg-slate-950/80 rounded-3xl border border-slate-800 text-center my-4">
            <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">
              {isCredit ? t.creditTitle : isSettled ? t.settledTitle : t.totalDue}
            </p>
            <p className={`text-5xl font-black my-2 tracking-tight ${isCredit || isSettled ? 'text-emerald-400' : 'text-rose-500'}`}>
              {isCredit ? `+${t.currency} ${absBalance}` : `${t.currency} ${absBalance}`}
            </p>
            <p className="text-xs text-slate-400 font-mono">
              Credit Limit: {t.currency} {Number(account.credit_limit || 30.0).toFixed(3)}
            </p>
          </div>

          {/* Settle / Payment Actions (Partial & Full Support) */}
          {isDebt ? (
            <div className="space-y-3 no-print">
              {/* Quick Chip Amount Selectors (BP-09) */}
              {(() => {
                const chips = getDynamicQuickChips(balanceNum);
                return (
                  <div className={`grid ${chips.length >= 3 ? 'grid-cols-4' : chips.length === 2 ? 'grid-cols-3' : chips.length === 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-2 text-xs font-bold font-mono`}>
                    {chips.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => handlePayBenefitPay(amt)}
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

              {/* Custom Partial Amount Field */}
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
                    onClick={() => handlePayBenefitPay(payAmount)}
                    disabled={paying || !payAmount || Number(payAmount) < 0.100}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 font-bold text-xs rounded-xl transition"
                  >
                    {t.payCustomBtn || 'Pay Custom Amount'}
                  </button>
                </div>
              )}

              {/* Settle Full Tab Button */}
              <button
                onClick={() => handlePayBenefitPay(balanceNum)}
                disabled={paying}
                className="w-full min-h-[52px] bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-60 text-white font-bold py-3.5 rounded-2xl text-base shadow-lg shadow-emerald-900/40 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {paying ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{t.connectingGateway}</span>
                  </>
                ) : (
                  <>
                    <span>{t.payBenefit} ({t.currency} {balanceNum.toFixed(3)})</span>
                    <span className="text-emerald-200">→</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="mt-5 w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold py-3.5 rounded-2xl text-sm flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>All Settled Up — No Debt Owed</span>
            </div>
          )}

          {/* Action Row: WhatsApp & Print */}
          <div className="grid grid-cols-2 gap-2 mt-3 no-print">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="min-h-[46px] inline-flex items-center justify-center gap-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 py-2.5 rounded-2xl transition cursor-pointer"
            >
              <Share2 className="w-4 h-4 text-emerald-400" />
              <span>WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[46px] inline-flex items-center justify-center gap-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 py-2.5 rounded-2xl transition cursor-pointer"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>

        {/* ITEMIZED TRANSACTION HISTORY TABLE WITH PAGINATION (ADV-10) */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-400" />
              <span>{t.historyTitle}</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-400">{ledgerData.length} records</span>
          </div>

          {ledgerData.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              <p>{t.noTransactions}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {ledgerData.map((tx, idx) => {
                const isWriteOff = tx.type === 'WRITE_OFF';
                const isPayment = tx.type === 'PAYMENT' || Number(tx.amount) < 0;
                const absAmount = Math.abs(Number(tx.amount || 0)).toFixed(3);
                const txDate = formatTxDate(tx.timestamp);

                return (
                  <div
                    key={tx.id || idx}
                    className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isWriteOff
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : isPayment 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}>
                        {isWriteOff ? <CheckCircle2 className="w-4 h-4" /> : isPayment ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="font-bold text-white truncate max-w-[170px]">
                          {tx.reference || (isWriteOff ? t.writeOff : (isPayment ? t.paymentReceived : t.storePurchase))}
                        </p>
                        <p className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                          <Calendar className="w-3 h-3 text-slate-600" />
                          <span>{txDate}</span>
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className={`font-mono font-black text-xs ${
                        isWriteOff ? 'text-amber-400' : isPayment ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {isWriteOff || isPayment ? '-' : '+'}{t.currency} {absAmount}
                      </span>
                      {tx.running_balance !== undefined && tx.running_balance !== null && (
                        <p className="text-[10px] text-slate-500 font-mono">
                          bal: {Number(tx.running_balance).toFixed(3)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Load More Button for Multi-Year Ledgers (ADV-10) */}
          {hasMore && (
            <div className="mt-4 pt-3 border-t border-slate-800/80 text-center no-print">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full min-h-[44px] py-2.5 px-4 bg-slate-950/80 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 text-slate-300 hover:text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {loadingMore ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    <span>{t.loadingMore}</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 text-emerald-400" />
                    <span>{t.loadMore}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Customer Self-Service Change PIN */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl no-print">
          <div className="flex items-center gap-2 mb-1.5">
            <KeyRound className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">{t.changePinTitle}</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            {t.changePinSubtitle}
          </p>

          <form onSubmit={handleChangePin} className="space-y-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                {t.currentPin}
              </label>
              <input 
                type="password" 
                placeholder="••••" 
                maxLength={4}
                inputMode="numeric"
                pattern="[0-9]*"
                className="p-3.5 rounded-2xl bg-slate-950 border border-slate-700 text-white placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none w-full font-mono text-center tracking-widest text-lg"
                value={oldPin}
                onChange={(e) => setOldPin(normalizeArabicNumerals(e.target.value).replace(/\D/g, '').slice(0, 4))}
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                {t.newPin}
              </label>
              <input 
                type="password" 
                placeholder="••••" 
                maxLength={4}
                inputMode="numeric"
                pattern="[0-9]*"
                className="p-3.5 rounded-2xl bg-slate-950 border border-slate-700 text-white placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none w-full font-mono text-center tracking-widest text-lg"
                value={newPin}
                onChange={(e) => setNewPin(normalizeArabicNumerals(e.target.value).replace(/\D/g, '').slice(0, 4))}
              />
            </div>

            <button 
              type="submit"
              disabled={isChangingPin || oldPin.length !== 4 || newPin.length !== 4}
              className="w-full min-h-[48px] mt-1 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold py-3 rounded-2xl border border-slate-700 shadow-xs cursor-pointer text-xs transition"
            >
              {isChangingPin ? t.updatingPin : t.updatePinBtn}
            </button>

            {pinMessage && (
              <div className={`p-3 rounded-2xl text-center text-xs font-semibold ${
                pinMessage.startsWith('✅') 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-red-500/10 text-red-400 border border-red-500/30'
              }`}>
                {pinMessage}
              </div>
            )}
          </form>
        </div>

        {/* Store Helpline & WhatsApp Support for Elderly Patrons (ADV-14) */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 text-center no-print">
          <p className="text-xs text-slate-400 font-medium mb-3">Need help with your statement or billing?</p>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={`tel:${STORE_PHONE}`}
              className="min-h-[44px] py-2 px-3 bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition"
            >
              <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.callStore}</span>
            </a>
            <a
              href={`https://wa.me/${STORE_WHATSAPP}?text=Hello%20Askar%20Coldstore%2C%20I%20have%20a%20question%20about%20my%20Khata%20statement.`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] py-2 px-3 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/60 rounded-xl text-xs font-semibold text-emerald-300 flex items-center justify-center gap-1.5 transition"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.whatsappHelp}</span>
            </a>
          </div>
        </div>
      </div>

      <footer className="mt-6 text-center text-slate-600 text-[11px] no-print">
        {t.brand} • NBR Tax Compliant Digital Statement
      </footer>

      {/* BenefitPay Fawri+ Payment Modal */}
      <BenefitPayModal
        isOpen={showBenefitModal}
        onClose={() => setShowBenefitModal(false)}
        data={benefitPayData}
        lang={lang}
        onSuccess={() => {
          fetchLedger(uuid, localStorage.getItem(pinKey) || '');
        }}
      />
    </div>
  );
}
