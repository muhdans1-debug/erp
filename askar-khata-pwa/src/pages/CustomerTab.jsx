import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import BarcodeComponent from 'react-barcode';
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
  QrCode,
  Barcode as BarcodeIcon,
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
  BellRing,
  BellOff,
  Fingerprint,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Zap,
  Maximize2,
  FileText,
  Store,
  Layers
} from 'lucide-react';
import {
  isPhoneLockAvailable,
  registerPhoneLock,
  verifyPhoneLock,
  isPhoneLockConfigured,
  isSessionVerified,
  createReceiptDeviceToken,
  getDeviceAuthHeaders
} from '../utils/phoneLockAuth';
import BenefitPayModal from '../components/BenefitPayModal';
import { generateBenefitPayPayload } from '../utils/benefitPay';

const STORE_PHONE = '+97317000000';
const STORE_WHATSAPP = '97336000000';

const TAB_TEXTS = {
  en: {
    brand: 'LAYALI SUPERMARKET',
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
    viewStatement: 'Official Tax Statement (PDF)',
    secured: 'Secured by BenefitPay & Fawri+',
    shareWhatsapp: 'Share Statement on WhatsApp',
    backHome: 'Back to Search',
    offlineSnapshot: 'Offline Snapshot — Reconnecting...',
    customAmount: 'Custom Payment Amount',
    payFull: 'Pay Full Balance',
    networkErr: 'No internet connection detected. Showing saved offline snapshot.',
    needHelp: 'Need help with this bill?',
    callStore: 'Call Store Hotline',
    whatsappHelp: 'WhatsApp Support',
    settledTitle: 'Balance Settled (No Debt)',
    recentPurchases: 'Transaction History',
    transactionsHistory: 'Full Transaction History',
    filterAll: 'All',
    filterPurchases: 'Purchases',
    filterPayments: 'Payments',
    searchTxPlaceholder: 'Search invoice #, item, or amount...',
    clearSearch: 'Clear',
    noTxFound: 'No transactions matching search',
    showingCount: 'Showing',
    of: 'of',
    runningBal: 'Balance',
    currency: 'BHD',
    hideBalance: 'Privacy Mode (Hide)',
    showBalance: 'Show Balance',
    freezeTitle: 'Freeze Account',
    frozenBadge: 'Account Locked / Frozen',
    frozenDesc: 'In-store credit charges are disabled to protect your account.',
    unfreezeBtn: '🔓 Unlock / Unfreeze Khata',
    freezeBtn: '🔒 Freeze Khata (Lost Card Protection)',
    personalTab: 'Personal Credit Card',
    myMessShare: 'My Mess Share',
    fullMess: 'Full Mess',
    allDebt: 'Master Consolidated Card',
    receiptVerifiedTitle: 'Authentic Receipt Verified',
    receiptZeroDrift: '100% Zero-Drift Parity',
    receiptZeroDriftDesc: 'Live cloud balance matches your printed receipt bit-for-bit.',
    counterPassTitle: 'Pay Without Card (Counter Pass)',
    counterPassDesc: 'Show this QR code to the cashier barcode gun at checkout to charge your Khata without carrying your physical card.',
    atCounterBtn: 'I AM AT THE COUNTER',
    atCounterActive: '✅ Cashier Notified (Screen Active)',
    atCounterSending: 'Pinging Register...',
    notifTitle: 'Live Transaction Alerts',
    notifSubtitleActive: '● Active • Instant alert on buy',
    notifSubtitleOff: '○ Off • Tap to enable alerts',
    notifTurnOn: 'Turn On Alerts 🔔',
    notifTurnOff: 'Turn Off Alerts',
    notifTest: 'Test Alert',
    notifActivatedToast: 'Live Alerts Activated 🔔',
    notifActivatedToastDesc: 'Your phone will ring & vibrate with purchase details on every successful counter checkout.'
  },
  ar: {
    brand: 'أسواق ليالي المركزية',
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
    viewStatement: 'كشف الحساب الضريبي الرسمي (PDF)',
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
    recentPurchases: 'سجل المعاملات والتواريخ',
    transactionsHistory: 'سجل المعاملات بالكامل',
    filterAll: 'الكل',
    filterPurchases: 'مشتريات',
    filterPayments: 'سدادات',
    searchTxPlaceholder: 'ابحث برقم الفاتورة أو الصنف أو المبلغ...',
    clearSearch: 'مسح',
    noTxFound: 'لم يتم العثور على أي معاملات',
    showingCount: 'عرض',
    of: 'من أصل',
    runningBal: 'الرصيد',
    currency: 'د.ب',
    hideBalance: 'وضع الخصوصية (إخفاء)',
    showBalance: 'إظهار الرصيد',
    freezeTitle: 'تجميد الحساب',
    frozenBadge: 'الحساب مجمد / مقفل',
    frozenDesc: 'تم إيقاف المشتريات الآجلة في المتجر لحماية حسابك.',
    unfreezeBtn: '🔓 إلغاء التجميد وفتح الحساب',
    freezeBtn: '🔒 تجميد الحساب (حماية البطاقة المفقودة)',
    personalTab: 'بطاقة الائتمان الشخصي',
    myMessShare: 'نصيبي من المشترك',
    fullMess: 'مشترك الغرفة بالكامل',
    allDebt: 'البطاقة الشاملة المدمجة',
    receiptVerifiedTitle: 'تم التحقق من صحة الإيصال',
    receiptZeroDrift: 'تطابق كامل 100% بدون أي فرق',
    receiptZeroDriftDesc: 'رصيد السحابة يطابق تماماً الرصيد المطبوع على الإيصال.',
    counterPassTitle: 'الدفع بدون بطاقة (بطاقة الكاونتر)',
    counterPassDesc: 'وجّه هذا الرمز لجهاز قارئ الباركود عند الكاشير لتسجيل مشترياتك في الحساب بدون الحاجة لبطاقتك البلاستيكية.',
    atCounterBtn: 'أنا عند الكاشير',
    atCounterActive: '✅ تم إشعار الكاشير (الشاشة نشطة)',
    atCounterSending: 'جاري الاتصال بالكاشير...',
    notifTitle: 'إشعارات الشراء المباشرة',
    notifSubtitleActive: '● مفعلة • تنبيه فوري عند الشراء',
    notifSubtitleOff: '○ متوقفة • اضغط للتفعيل',
    notifTurnOn: 'تفعيل الإشعارات 🔔',
    notifTurnOff: 'إيقاف الإشعارات',
    notifTest: 'تجربة',
    notifActivatedToast: 'تم تفعيل التنبيهات المباشرة 🔔',
    notifActivatedToastDesc: 'سيرن هاتفك ويهتز مع تفاصيل الفاتورة فور إتمام عملية الشراء عند الكاشير.'
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
    viewStatement: 'ടാക്സ് സ്റ്റേറ്റ്മെന്റ് (PDF)',
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
    recentPurchases: 'ഇടപാടുകളുടെ വിവരങ്ങൾ',
    transactionsHistory: 'മുഴുവൻ ഇടപാടുകളുടെ വിവരങ്ങൾ',
    filterAll: 'എല്ലാം',
    filterPurchases: 'വാങ്ങിയവ',
    filterPayments: 'അടച്ചവ',
    searchTxPlaceholder: 'ബില്ലുകൾ അല്ലെങ്കിൽ സാധനങ്ങൾ തിരയുക...',
    clearSearch: 'ക്ലിയർ',
    noTxFound: 'ഇടപാടുകൾ ഒന്നും കണ്ടെത്തിയില്ല',
    showingCount: 'കാണിക്കുന്നത്',
    of: '/',
    runningBal: 'ബാക്കി',
    currency: 'BHD',
    hideBalance: 'തുക മറയ്ക്കുക (പ്രൈവസി)',
    showBalance: 'തുക കാണിക്കുക',
    freezeTitle: 'അക്കൗണ്ട് മരവിപ്പിക്കുക',
    frozenBadge: 'അക്കൗണ്ട് മരവിപ്പിച്ചിരിക്കുന്നു',
    frozenDesc: 'കടയിൽ നിന്ന് സാധനങ്ങൾ കടം വാങ്ങുന്നത് തടഞ്ഞിരിക്കുന്നു.',
    unfreezeBtn: '🔓 അക്കൗണ്ട് അൺലോക്ക് ചെയ്യുക',
    freezeBtn: '🔒 അക്കൗണ്ട് ഫ്രീസ് ചെയ്യുക (കാർഡ് നഷ്ടപ്പെട്ടാൽ)',
    personalTab: 'പേഴ്സണൽ അക്കൗണ്ട്',
    myMessShare: 'മെസ്സ് വിഹിതം',
    fullMess: 'മുഴുവൻ മെസ്സ് തുക',
    allDebt: 'മുഴുവൻ കുടിശ്ശിക',
    receiptVerifiedTitle: 'യഥാർത്ഥ രസീത് സ്ഥിരീകരിച്ചു',
    receiptZeroDrift: '100% കൃത്യമായ കണക്ക്',
    receiptZeroDriftDesc: 'നിങ്ങളുടെ കൈവശമുള്ള ബില്ലിലെ തുകയും ഓൺലൈൻ തുകയും ഒന്നുതന്നെയാണ്.',
    counterPassTitle: 'കാർഡില്ലാതെ വാങ്ങുക (കൗണ്ടർ പാസ്)',
    counterPassDesc: 'കാർഡ് കൈവശമില്ലാത്തപ്പോൾ ഈ ക്യുആർ കോഡ് ക്യാഷ്യറുടെ സ്കാനറിന് കാണിക്കുക.',
    atCounterBtn: '⚡ ഞാൻ കൗണ്ടറിലുണ്ട്',
    atCounterActive: '✅ ക്യാഷ്യറെ അറിയിച്ചു',
    atCounterSending: 'കണക്റ്റ് ചെയ്യുന്നു...',
    notifTitle: 'ലൈവ് ട്രാൻസാക്ഷൻ അലേർട്ട്',
    notifSubtitleActive: '● ആക്റ്റീവ് • വാങ്ങുമ്പോൾ അലേർട്ട്',
    notifSubtitleOff: '○ ഓഫ് • ഓൺ ചെയ്യാൻ ടാപ്പ് ചെയ്യുക',
    notifTurnOn: 'അലേർട്ട് ഓൺ ചെയ്യുക 🔔',
    notifTurnOff: 'അലേർട്ട് ഓഫ് ചെയ്യുക',
    notifTest: 'ടെസ്റ്റ്',
    notifActivatedToast: 'ലൈവ് അലേർട്ട് ഓൺ ചെയ്തു 🔔',
    notifActivatedToastDesc: 'കൗണ്ടറിൽ സാധനങ്ങൾ വാങ്ങുമ്പോൾ നിങ്ങളുടെ ഫോണിൽ ശബ്ദവും അലേർട്ടും ലഭിക്കും.'
  }
};

/**
 * Format helper for month grouping in full transaction ledger
 */
function formatMonthYear(dateStr, lang) {
  if (!dateStr) return 'Recent';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Recent';
    return d.toLocaleDateString(lang === 'ar' ? 'ar-BH' : 'en-GB', {
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return 'Recent';
  }
}

/**
 * Format helper for localized date and time
 */
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

/**
 * Build dynamic 3D multi-card wallet from live ledger record
 */
export function buildWalletCardsFromLedger(ledger, lang = 'en') {
  if (!ledger) return [];
  const cards = [];
  const totalBalance = Number(ledger.balance || 0);
  const messes = Array.isArray(ledger.messes) ? ledger.messes : [];
  const totalMessShare = messes.reduce((sum, m) => sum + Number(m.memberShare ?? m.myShare ?? 0), 0);
  const personalBal = ledger.personalBalance !== undefined && ledger.personalBalance !== null
    ? Math.max(0, Number(ledger.personalBalance))
    : Math.max(0, Number((totalBalance - totalMessShare).toFixed(3)));
  const isMultiWallet = messes.length > 0 && personalBal > 0;
  const isFrozen = ledger.is_active === 0;

  // 1. Obsidian Personal Card (Obsidian Titanium) - FIRST
  cards.push({
    id: 'card-personal',
    type: 'PERSONAL',
    title: lang === 'ar' ? 'بطاقة الائتمان الشخصي' : 'Personal Credit Card',
    cardTier: 'OBSIDIAN TITANIUM',
    accountCode: `KHT-${String(ledger.id || 'CUST').slice(-4)}-OB`,
    balance: personalBal,
    creditLimit: Number(ledger.credit_limit || ledger.creditLimit || 30.0),
    depositAmount: Number(ledger.card_deposit_amount || 0),
    depositStatus: String(ledger.card_deposit_status || 'NONE').toUpperCase(),
    depositInCredit: Number(ledger.depositInCredit || 0),
    theme: 'obsidian',
    accentColor: '#0071E3',
    chipStyle: 'gold',
    gradient: 'from-[#1C1C1C] via-[#141414] to-[#0D0D0D]',
    borderGlow: 'border-[#0071E3]/40 shadow-[0_4px_12px_rgba(0,0,0,0.6),0_16px_36px_rgba(0,0,0,0.8),0_20px_50px_rgba(0,113,227,0.32)]',
    chipColor: 'from-[#0071E3] via-[#0077ED] to-[#003d7a]',
    isFrozen
  });

  // 2. Royal Sapphire Mess Cards (One per Mess Group)
  messes.forEach((mess, idx) => {
    const memberShare = Number(mess.memberShare ?? mess.myShare ?? 0);
    const roomTotal = Number(mess.groupTotal || mess.totalBalance || 0);
    const memberCount = Number(mess.memberCount || 1);
    const roommateSplit = Number(mess.equalSplitShare ?? (roomTotal / Math.max(1, memberCount)));

    cards.push({
      id: `card-mess-${mess.id || idx}`,
      type: 'MESS',
      messId: mess.id,
      title: mess.name || mess.group_name || `Mess Room #${idx + 1}`,
      cardTier: 'ROYAL SAPPHIRE',
      accountCode: `KHT-${String(ledger.id || 'CUST').slice(-4)}-M${idx + 1}`,
      balance: memberShare,
      roomTotal,
      memberCount,
      roommateSplit,
      creditLimit: roomTotal,
      theme: 'sapphire',
      accentColor: '#2563EB',
      chipStyle: 'silver',
      gradient: 'from-[#172554] via-[#0f172a] to-[#020617]',
      borderGlow: 'border-blue-500/40 shadow-[0_4px_12px_rgba(0,0,0,0.6),0_16px_36px_rgba(0,0,0,0.8),0_20px_50px_rgba(37,99,235,0.35)]',
      chipColor: 'from-blue-400 via-blue-600 to-blue-800',
      isFrozen
    });
  });

  // 3. Consolidated Master Card (Titanium Emerald - Total Outstanding) - LAST
  if (isMultiWallet || messes.length > 1) {
    cards.push({
      id: 'card-master',
      type: 'MASTER',
      title: lang === 'ar' ? 'البطاقة الشاملة المدمجة' : 'Master Consolidated Card',
      cardTier: 'TITANIUM EMERALD',
      accountCode: `KHT-${String(ledger.id || 'CUST').slice(-4)}-ALL`,
      balance: totalBalance,
      personalBalance: personalBal,
      messBalance: Math.max(0, Number((totalBalance - personalBal).toFixed(3))),
      creditLimit: Number(ledger.credit_limit || ledger.creditLimit || 30.0),
      theme: 'emerald',
      accentColor: '#10B981',
      chipStyle: 'platinum',
      gradient: 'from-[#064e3b] via-[#022c22] to-[#01140e]',
      borderGlow: 'border-emerald-500/40 shadow-[0_4px_12px_rgba(0,0,0,0.6),0_16px_36px_rgba(0,0,0,0.8),0_20px_50px_rgba(16,185,129,0.35)]',
      chipColor: 'from-emerald-400 via-emerald-600 to-emerald-800',
      isFrozen,
      breakdown: { personal: personalBal, messes }
    });
  }

  return cards;
}

const DEMO_FALLBACK = {
  id: 'CUST-8492',
  name: 'Mohammed Al-Doseri',
  cpr: '880419201',
  phone: '+973 3920 1842',
  balance: 87.925,
  personalBalance: 45.200,
  messShare: 42.725,
  credit_limit: 100.000,
  is_active: 1,
  card_deposit_amount: 3.000,
  card_deposit_status: 'DEFERRED_PAYDAY',
  payday_day_of_month: 28,
  messes: [
    {
      id: 'mess_villa_12',
      name: 'Villa 12 Camp Mess (Room 4)',
      group_name: 'Villa 12 Camp Mess (Room 4)',
      memberShare: 42.725,
      groupTotal: 256.350,
      memberCount: 6,
      equalSplitShare: 42.725
    }
  ],
  transactions: [
    {
      id: 'tx_p01',
      invoiceNo: 'INV-84922',
      timestamp: '2026-11-24T18:30:00Z',
      type: 'PURCHASE',
      amount: 2.500,
      runningBalance: 87.925,
      reference: 'INV-84922',
      items: [
        { name: 'Almarai Fresh Milk 2L', qty: 1, unitPrice: 1.050, total: 1.050 },
        { name: 'Fresh White Eggs 30s', qty: 1, unitPrice: 1.450, total: 1.450 }
      ]
    },
    {
      id: 'tx_p02',
      invoiceNo: 'PAY-40192',
      timestamp: '2026-11-23T15:20:00Z',
      type: 'PAYMENT',
      amount: 20.000,
      runningBalance: 85.425,
      reference: 'Fawri+ BenefitPay Payment',
      channel: 'BenefitPay Fawri+'
    },
    {
      id: 'tx_p03',
      invoiceNo: 'INV-84882',
      timestamp: '2026-11-22T18:20:00Z',
      type: 'PURCHASE',
      amount: 1.450,
      runningBalance: 105.425,
      reference: 'INV-84882',
      items: [
        { name: "Lay's Salt & Vinegar Chips", qty: 1, unitPrice: 0.450, total: 0.450 },
        { name: 'Coca Cola 1.25L Bottle', qty: 1, unitPrice: 0.400, total: 0.400 }
      ]
    },
    {
      id: 'tx_dep01',
      invoiceNo: 'DEP-84920',
      timestamp: '2026-11-01T09:00:00Z',
      type: 'CHARGE',
      subledger_type: 'DEPOSIT_DEFERRED',
      amount: 3.000,
      runningBalance: 3.000,
      reference: 'Physical Card Security Deposit (Due on 28th Payday)',
      items: [
        { name: 'NFC Card Security Deposit (Payable on First Payday)', qty: 1, unitPrice: 3.000, total: 3.000 }
      ]
    }
  ]
};

function computeEan13Checksum(digits12) {
  if (!digits12 || digits12.length !== 12) return 0;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(digits12[i], 10);
    sum += (i % 2 === 0) ? digit : digit * 3;
  }
  const mod = sum % 10;
  return mod === 0 ? 0 : 10 - mod;
}

export default function CustomerTab() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  const receiptInv = searchParams.get('receiptInv');

  const [lang, setLang] = useState('en');
  const t = TAB_TEXTS[lang] || TAB_TEXTS.en;
  const isRtl = lang === 'ar';

  // Session & Security Detection
  const isDevSession = typeof window !== 'undefined' && Boolean(
    sessionStorage.getItem('khata_dev_jwt') || searchParams.get('dev_mode') === '1'
  );

  const boundCustomerId = typeof window !== 'undefined' ? (localStorage.getItem('my_khata_customer_id') || '') : '';
  const isDeviceBoundToOther = useMemo(() => {
    if (isDevSession || !boundCustomerId || !customerId || boundCustomerId === customerId) {
      return false;
    }
    try {
      const cached = localStorage.getItem(`khata_tab_cache_${boundCustomerId}`) || localStorage.getItem(`khata_tab_cache_${customerId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        const normTarget = String(customerId).replace(/^(\+973|00973|973)/, '').replace(/\D/g, '');
        const normPhone = parsed.phone ? String(parsed.phone).replace(/^(\+973|00973|973)/, '').replace(/\D/g, '') : '';
        if (parsed.id === customerId || parsed.access_token === customerId || (normPhone && normPhone === normTarget)) {
          return false;
        }
      }
    } catch {}
    return true;
  }, [boundCustomerId, customerId, isDevSession]);

  const [phoneLockRequired, setPhoneLockRequired] = useState(() => {
    if (typeof window === 'undefined' || isDevSession) return false;
    if (isSessionVerified(customerId)) return false;
    return isPhoneLockConfigured(customerId);
  });
  const [verifyingPhoneLock, setVerifyingPhoneLock] = useState(false);
  const [phoneLockError, setPhoneLockError] = useState('');

  // Primary Ledger State
  const [ledger, setLedger] = useState(() => {
    try {
      if (typeof window !== 'undefined' && customerId && !isDeviceBoundToOther) {
        const cached = localStorage.getItem(`khata_tab_cache_${customerId}`);
        if (cached) return JSON.parse(cached);
      }
    } catch {}
    return null;
  });
  const ledgerRef = useRef(ledger);
  useEffect(() => {
    ledgerRef.current = ledger;
  }, [ledger]);
  const [loading, setLoading] = useState(!ledger);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState('');
  const [isOffline, setIsOffline] = useState(false);

  // 3D Card Deck State
  const cards = useMemo(() => buildWalletCardsFromLedger(ledger, lang), [ledger, lang]);
  const [activeCardIndex, setActiveCardIndex] = useState(() => {
    const cardParam = searchParams.get('card');
    if (cardParam) {
      const parsed = parseInt(cardParam, 10);
      if (!isNaN(parsed) && parsed >= 0) return parsed;
    }
    return 0;
  });
  const [isCardFlipped, setIsCardFlipped] = useState(() => searchParams.get('flipped') === 'true');
  const [hideBalance, setHideBalance] = useState(() => {
    try {
      return localStorage.getItem('khata_hide_balance') === 'true';
    } catch {
      return false;
    }
  });

  // Peeking Card Overlap Calculations for Swipe Affordance
  const nextCard = cards.length > 1 ? cards[(activeCardIndex + 1) % cards.length] : null;
  const prevCard = cards.length > 1 ? cards[(activeCardIndex - 1 + cards.length) % cards.length] : null;
  const hasNext = cards.length > 1 && (activeCardIndex < cards.length - 1);
  const hasPrev = cards.length > 1 && activeCardIndex > 0;

  // Horizontal Card Drag & Slide Animation States (Swipe Left / Swipe Right)
  const [cardDragX, setCardDragX] = useState(0);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [slidePhase, setSlidePhase] = useState('IDLE'); // 'IDLE' | 'EXIT' | 'ENTER'
  const [slideDir, setSlideDir] = useState('NONE'); // 'LEFT' | 'RIGHT'
  const slideTimerRef = useRef(null);
  const cardGestureIntentRef = useRef('UNDECIDED');
  const isTransitioningRef = useRef(false);
  const transitionTimeoutRef = useRef(null);

  // Active Card Clamp
  const activeCard = cards[activeCardIndex] || cards[0] || {
    id: 'card-default',
    title: 'Layali Khata Tab',
    balance: 0,
    creditLimit: 30,
    theme: 'obsidian',
    isFrozen: false
  };

  // Google Pay Navigation Views: 'MAIN' | 'ALL_TRANSACTIONS'
  const [activeSubView, setActiveSubView] = useState('MAIN');
  const [allTxSearchQuery, setAllTxSearchQuery] = useState('');
  const [allTxTypeFilter, setAllTxTypeFilter] = useState('ALL'); // 'ALL' | 'PURCHASE' | 'PAYMENT'
  const [allTxCardScope, setAllTxCardScope] = useState('ACTIVE'); // 'ACTIVE' | 'ALL_CARDS'
  const [allTxMonthFilter, setAllTxMonthFilter] = useState('ALL');

  // Modal States
  const [isDrawerOpen, setIsDrawerOpen] = useState(() => searchParams.get('drawer') === 'open');
  const [showCounterPass, setShowCounterPass] = useState(() => searchParams.get('counter_pass') === 'open');
  const [passFormat, setPassFormat] = useState(() => {
    const p = searchParams.get('format');
    if (p === 'qr') return 'QR';
    if (p === 'code128') return 'CODE128';
    return 'EAN13';
  }); // 'EAN13' | 'CODE128' | 'QR'
  const [showStatementModal, setShowStatementModal] = useState(() => searchParams.get('statement') === 'open');
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [showBenefitModal, setShowBenefitModal] = useState(false);
  const [benefitPayData, setBenefitPayData] = useState(null);
  const [paying, setPaying] = useState(false);

  const customerRawId = ledger?.id || customerId || 'CUST-8492';
  const customerBarcodeCode = useMemo(() => {
    const clean = String(customerRawId).trim().toUpperCase();
    return clean.startsWith('CUST-') ? clean : `CUST-${clean}`;
  }, [customerRawId]);

  const customerEan13Code = useMemo(() => {
    const numOnly = String(customerRawId).replace(/\D/g, '') || '8492';
    const padded10 = numOnly.padStart(10, '0').slice(-10);
    const first12 = `29${padded10}`;
    const check = computeEan13Checksum(first12);
    return `${first12}${check}`;
  }, [customerRawId]);

  // Counter Beacon State
  const [beaconStatus, setBeaconStatus] = useState(() => searchParams.get('beacon') === 'active' ? 'SENT' : 'IDLE');
  const [counterSecondsLeft, setCounterSecondsLeft] = useState(90);

  useEffect(() => {
    if (beaconStatus !== 'SENT') return;
    const timer = setInterval(() => {
      setCounterSecondsLeft(prev => {
        if (prev <= 1) {
          setBeaconStatus('IDLE');
          return 90;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [beaconStatus]);

  // Live Register Alert State
  const [liveTxAlert, setLiveTxAlert] = useState(() => {
    if (searchParams.get('alert') === 'mock') {
      return {
        title: 'Store Purchase Notice',
        message: 'Mohammed Al-Doseri: 3 items (2.500 BHD) via KHATA. Inv #INV-84922',
        amount: 2.500,
        formattedAmount: '2.500 BHD',
        invoiceNo: 'INV-84922'
      };
    }
    return null;
  });
  const handledPushTxIdsRef = useRef(new Map());

  // Dual-tone Web Audio Chime
  const playTxChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const playTone = (freq, start, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };
      playTone(587.33, 0.0, 0.12); // D5
      playTone(880.00, 0.1, 0.25); // A5
    } catch {}
  }, []);

  // Live Push / Web Notification Enabled state (persisted in localStorage, default ON)
  const [isNotifEnabled, setIsNotifEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('khata_live_notifications');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const isNotifEnabledRef = useRef(isNotifEnabled);
  useEffect(() => {
    isNotifEnabledRef.current = isNotifEnabled;
  }, [isNotifEnabled]);

  const [notifPermission, setNotifPermission] = useState(() => {
    return (typeof window !== 'undefined' && 'Notification' in window) ? Notification.permission : 'default';
  });

  const knownTxIdsRef = useRef(new Set());
  const isFirstLedgerLoadRef = useRef(true);

  // Master Live Transaction Notification Dispatcher (Sound + Vibration + Toast + Web Push)
  const triggerLiveTransactionNotification = useCallback((tx, options = {}) => {
    if (!tx) return;
    const isEnabled = options.force ? true : isNotifEnabledRef.current;
    if (!isEnabled) return;

    const txKey = String(tx.id || tx.invoiceNo || tx.reference || `tx_${tx.amount}_${Date.now()}`);
    if (!options.force) {
      const last = handledPushTxIdsRef.current.get(txKey);
      if (last && (Date.now() - last) < 25000) return;
      handledPushTxIdsRef.current.set(txKey, Date.now());
    }

    // 1. Dual-tone supermarket checkout audio chime
    playTxChime();

    // 2. Hardware vibration pulse
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([120, 60, 120]);
      }
    } catch {}

    // 3. Floating emerald high-contrast alert toast
    const alertAmount = Number(tx.amount || 0);
    const formattedAmt = tx.formattedAmount || `${alertAmount.toFixed(3)} BHD`;
    const alertTitle = tx.title || (lang === 'ar' ? 'إشعار شراء من المتجر' : 'Store Purchase Notice');
    const alertMsg = tx.message || `${tx.customerName || ledgerRef.current?.name || 'Customer'}: ${tx.itemsCount ? `${tx.itemsCount} items ` : ''}(${formattedAmt}) via KHATA. Inv #${tx.invoiceNo || tx.id || 'INV'}`;

    setLiveTxAlert({
      title: alertTitle,
      message: alertMsg,
      amount: alertAmount,
      formattedAmount: formattedAmt,
      invoiceNo: tx.invoiceNo || tx.id || 'INV'
    });

    // 4. Native OS Web Notification
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        const notifTitle = `Layali Khata: ${formattedAmt} Purchase`;
        const notifOptions = {
          body: alertMsg,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/badge-72x72.png',
          tag: txKey,
          renotify: true
        };
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification(notifTitle, notifOptions).catch(() => {
              new Notification(notifTitle, notifOptions);
            });
          }).catch(() => {
            new Notification(notifTitle, notifOptions);
          });
        } else {
          new Notification(notifTitle, notifOptions);
        }
      }
    } catch {}
  }, [lang, playTxChime]);

  // Toggle Live Notifications On/Off
  const handleToggleNotifications = useCallback(async () => {
    const nextState = !isNotifEnabled;
    setIsNotifEnabled(nextState);
    try {
      localStorage.setItem('khata_live_notifications', String(nextState));
    } catch {}

    if (nextState) {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default') {
          try {
            const perm = await Notification.requestPermission();
            setNotifPermission(perm);
          } catch {}
        }
      }
      playTxChime();
      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate(60);
        }
      } catch {}
      setLiveTxAlert({
        title: t.notifActivatedToast,
        message: t.notifActivatedToastDesc,
        amount: 0,
        formattedAmount: 'ACTIVE',
        invoiceNo: 'LIVE-ALERT'
      });
    } else {
      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate(30);
        }
      } catch {}
    }
  }, [isNotifEnabled, playTxChime, t.notifActivatedToast, t.notifActivatedToastDesc]);

  // Test Live Alert Button (instant preview of chime, vibration, toast & push)
  const handleTestLiveAlert = useCallback(() => {
    setIsDrawerOpen(false);
    triggerLiveTransactionNotification({
      title: lang === 'ar' ? 'تجربة إشعار الشراء المباشر' : 'Live Purchase Alert Test',
      message: `${ledgerRef.current?.name || 'Mohammed Al-Doseri'}: 3 items (2.500 BHD) via KHATA. Inv #INV-TEST-${Math.floor(Math.random() * 9000 + 1000)}`,
      amount: 2.500,
      formattedAmount: '2.500 BHD',
      invoiceNo: `TEST-${Date.now().toString().slice(-4)}`
    }, { force: true });
  }, [lang, triggerLiveTransactionNotification]);

  // Fetch Live Ledger Data
  const fetchLedger = useCallback(async (signal) => {
    try {
      if (!ledgerRef.current) setLoading(true);
      setError('');

      const savedPin = localStorage.getItem(`khata_pin_${customerId}`) || '';
      const savedJwt = localStorage.getItem(`khata_jwt_${customerId}`) || '';
      const devJwt = typeof window !== 'undefined' ? sessionStorage.getItem('khata_dev_jwt') : null;
      const deviceAuthHeaders = getDeviceAuthHeaders(customerId);
      const headers = {
        'Content-Type': 'application/json',
        ...(savedPin ? { 'x-khata-pin': savedPin } : {}),
        ...(devJwt ? { 'Authorization': `Bearer ${devJwt}` } : (savedJwt ? { 'Authorization': `Bearer ${savedJwt}` } : {})),
        ...deviceAuthHeaders
      };

      const res = await fetch(`/api/khata/${encodeURIComponent(customerId)}/tab`, {
        headers,
        signal: signal instanceof AbortSignal ? signal : undefined
      });

      let finalRes = res;
      if (res.status === 401 || res.status === 403) {
        finalRes = await fetch(`/api/khata/${encodeURIComponent(customerId)}/tab`, {
          headers: { 'Content-Type': 'application/json' },
          signal: signal instanceof AbortSignal ? signal : undefined
        });
      }

      if (!finalRes.ok) {
        const errBody = await finalRes.json().catch(() => ({}));
        throw new Error(errBody.error || errBody.message || 'Customer Khata record not found');
      }

      const data = await finalRes.json();
      const custData = data.customer || data;
      const rawDeposit = data.deposit || custData.deposit;
      const allTx = data.transactions || data.statement || data.recentPurchases || data.ledger || custData.transactions || [];
      const balanceVal = Number(custData.balance ?? custData.currentBalance ?? data.balance ?? data.currentBalance ?? 0);
      const messShareVal = Math.max(0, Number(custData.messShare ?? custData.mess_share ?? data.messShare ?? 0));
      const depAmt = Number(custData.card_deposit_amount ?? rawDeposit?.amount ?? data.depositAmount ?? data.card_deposit_amount ?? 0);
      const depStatus = String(custData.card_deposit_status || rawDeposit?.status || data.card_deposit_status || data.depositStatus || 'NONE').toUpperCase();
      const depInCredit = (depStatus === 'IN_CREDIT' || depStatus === 'DEFERRED_CREDIT' || depStatus === 'DEFERRED_PAYDAY' || Boolean(rawDeposit?.inCredit) || Boolean(custData.depositInCredit)) ? depAmt : 0;
      const personalVal = Math.max(0, Number(custData.personalBalance ?? custData.personal_balance ?? Math.max(0, balanceVal - messShareVal)));

      const customerRecord = {
        id: custData.id || data.id || customerId,
        name: custData.name || data.name || 'Valued Customer',
        cpr: custData.cpr || data.cpr || '—',
        phone: custData.phone || data.phone || '',
        balance: balanceVal,
        personalBalance: personalVal,
        messShare: messShareVal,
        depositInCredit: depInCredit,
        messes: Array.isArray(custData.messes) ? custData.messes : (Array.isArray(data.messes) ? data.messes : (data.wallets?.messes || [])),
        credit_limit: Number(custData.credit_limit ?? custData.creditLimit ?? data.credit_limit ?? data.creditLimit ?? 30.0),
        is_active: custData.is_active !== undefined ? Number(custData.is_active) : (data.is_active !== undefined ? Number(data.is_active) : (custData.isActive === false ? 0 : 1)),
        card_deposit_amount: depAmt,
        card_deposit_status: depStatus,
        cash_advance_balance: Number(custData.cash_advance_balance ?? data.cash_advance_balance ?? 0),
        payday_day_of_month: Number(custData.payday_day_of_month ?? data.payday_day_of_month ?? 28),
        transactions: allTx,
        recentPurchases: allTx,
        cycleBreakdown: data.cycleBreakdown || custData.cycleBreakdown || null
      };

      setLedger(customerRecord);
      setIsOffline(false);

      // Real-time live transaction diff detection
      if (allTx && allTx.length > 0) {
        if (isFirstLedgerLoadRef.current) {
          allTx.forEach(tx => {
            const id = String(tx.id || tx.invoiceNo || tx.reference || `${tx.date}_${tx.amount}`);
            knownTxIdsRef.current.add(id);
          });
          isFirstLedgerLoadRef.current = false;
        } else {
          const newTxList = allTx.filter(tx => {
            const id = String(tx.id || tx.invoiceNo || tx.reference || `${tx.date}_${tx.amount}`);
            return !knownTxIdsRef.current.has(id);
          });

          allTx.forEach(tx => {
            const id = String(tx.id || tx.invoiceNo || tx.reference || `${tx.date}_${tx.amount}`);
            knownTxIdsRef.current.add(id);
          });

          if (newTxList.length > 0) {
            const latestNewTx = newTxList[0];
            triggerLiveTransactionNotification({
              title: lang === 'ar' ? 'عملية شراء جديدة معتمدة' : 'New Approved Purchase',
              message: `${customerRecord.name}: ${Number(latestNewTx.amount || 0).toFixed(3)} BHD via KHATA. Inv #${latestNewTx.invoiceNo || latestNewTx.id || 'INV'}`,
              amount: latestNewTx.amount,
              formattedAmount: `${Number(latestNewTx.amount || 0).toFixed(3)} BHD`,
              invoiceNo: latestNewTx.invoiceNo || latestNewTx.id || 'INV'
            });
          }
        }
      }

      if (!isDevSession) {
        try {
          const bindId = customerRecord.id || customerId;
          localStorage.setItem('my_khata_customer_id', bindId);
          document.cookie = `khata_customer_id=${encodeURIComponent(bindId)}; path=/; max-age=315360000; SameSite=Lax`;
          createReceiptDeviceToken(bindId);
        } catch {}
      }

      try {
        localStorage.setItem(`khata_tab_cache_${customerId}`, JSON.stringify(customerRecord));
      } catch {}
    } catch (err) {
      if (err.name === 'AbortError') return;
      try {
        const cached = localStorage.getItem(`khata_tab_cache_${customerId}`);
        if (cached) {
          setLedger(JSON.parse(cached));
          setIsOffline(true);
          return;
        }
      } catch {}
      if (customerId === 'demo' || searchParams.get('mock') === '1' || !ledgerRef.current) {
        setLedger(DEMO_FALLBACK);
      } else {
        setError(err.message || 'Cannot reach central Khata ledger.');
      }
    } finally {
      setLoading(false);
    }
  }, [customerId, isDevSession, lang, triggerLiveTransactionNotification]);

  // Smooth Manual Refresh with full 360-deg animation and haptic feedback
  const handleManualRefresh = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(25);
      }
    } catch {}

    const startTime = Date.now();
    try {
      await fetchLedger();
    } finally {
      const elapsed = Date.now() - startTime;
      const minDuration = 700; // Guarantee full 360° spin
      if (elapsed < minDuration) {
        await new Promise((r) => setTimeout(r, minDuration - elapsed));
      }
      setIsSyncing(false);
    }
  }, [fetchLedger, isSyncing]);

  useEffect(() => {
    const controller = new AbortController();
    if (!isDeviceBoundToOther && !phoneLockRequired && customerId) {
      fetchLedger(controller.signal);
    }
    return () => controller.abort();
  }, [customerId, fetchLedger, isDeviceBoundToOther, phoneLockRequired]);

  // Real-Time Counter Checkout Notification via WebSocket Bus
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname === 'localhost' ? 'localhost:3333' : window.location.host;
    let socket = null;
    let reconnectTimer = null;
    let isCleanedUp = false;

    const connectWs = () => {
      if (isCleanedUp) return;
      try {
        socket = new WebSocket(`${wsProtocol}//${wsHost}/ws`);
        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'TRANSACTION_NOTIFICATION') {
              const tx = data.payload;
              if (!tx) return;

              const txCustId = tx.customerId ? String(tx.customerId).trim().toLowerCase() : '';
              const myId = customerId ? String(customerId).trim().toLowerCase() : '';
              const myLedgerId = ledger?.id ? String(ledger.id).trim().toLowerCase() : '';

              if (txCustId && (txCustId === myId || txCustId === myLedgerId)) {
                triggerLiveTransactionNotification(tx);
                fetchLedger();
              }
            }
          } catch {}
        };
        socket.onclose = () => {
          if (!isCleanedUp) {
            reconnectTimer = setTimeout(connectWs, 4000);
          }
        };
        socket.onerror = () => {
          if (socket) socket.close();
        };
      } catch {}
    };

    connectWs();
    return () => {
      isCleanedUp = true;
      if (socket) socket.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [customerId, ledger?.id, fetchLedger, triggerLiveTransactionNotification]);

  // Auto-dismiss live checkout alert
  useEffect(() => {
    if (!liveTxAlert) return;
    const timer = setTimeout(() => setLiveTxAlert(null), 8000);
    return () => clearTimeout(timer);
  }, [liveTxAlert]);

  // Service Worker Push Event Fallback
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const handleSwMessage = (event) => {
      if (event.data?.type === 'PUSH_TRANSACTION_NOTIFICATION') {
        const payload = event.data.payload;
        if (!payload) return;
        const incomingId = payload.customerId ? String(payload.customerId).trim().toLowerCase() : '';
        const curId = customerId ? String(customerId).trim().toLowerCase() : '';
        if (incomingId && curId && incomingId === curId) {
          triggerLiveTransactionNotification(payload);
          fetchLedger();
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
  }, [customerId, fetchLedger, triggerLiveTransactionNotification]);

  // Background live sync for instant transaction detection when on cellular 4G/5G
  useEffect(() => {
    if (!isNotifEnabled || !customerId || isDeviceBoundToOther || phoneLockRequired) return;
    const pollInterval = setInterval(() => {
      fetchLedger();
    }, 6000);
    return () => clearInterval(pollInterval);
  }, [isNotifEnabled, customerId, isDeviceBoundToOther, phoneLockRequired, fetchLedger]);

  // BenefitPay Return Cleanup
  useEffect(() => {
    if (statusParam === 'complete' || statusParam === 'success') {
      const pollTimer = setTimeout(() => {
        fetchLedger();
        try {
          window.history.replaceState({}, '', window.location.pathname);
        } catch {}
      }, 2000);
      return () => clearTimeout(pollTimer);
    }
  }, [statusParam, fetchLedger]);

  // Tab visibility balance sync
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchLedger();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchLedger]);

  // 3-Path High Reliability "I AM AT THE COUNTER" Beacon
  const handleAnnounceAtCounter = async () => {
    if (beaconStatus === 'SENDING') return;
    setBeaconStatus('SENDING');
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([60, 40, 60]);
      }
    } catch {}

    const payload = JSON.stringify({
      customerId: ledger?.id || customerId,
      customerName: ledger?.name || 'Customer',
      terminalId: 'T1',
      timestamp: Date.now()
    });

    const headers = { 'Content-Type': 'application/json' };

    // 1. Direct Sovereign Cloudflare Edge Gateway (Always reachable over cellular 4G/5G)
    const edgePromise = fetch('https://askar-edge-api.layali-askar-pos.workers.dev/api/khata/present-at-counter', {
      method: 'POST',
      headers,
      body: payload
    }).catch(() => null);

    // 2. Relative API on Vercel
    const vercelPromise = fetch('/api/khata/present-at-counter', {
      method: 'POST',
      headers,
      body: payload
    }).catch(() => null);

    // 3. Local store LAN master if reachable
    const localPromise = (typeof window !== 'undefined' && window.location.protocol === 'http:')
      ? fetch('http://192.168.8.7:3000/api/khata/present-at-counter', {
          method: 'POST',
          headers,
          body: payload
        }).catch(() => null)
      : Promise.resolve(null);

    try {
      await Promise.race([
        Promise.all([edgePromise, vercelPromise, localPromise]),
        new Promise(r => setTimeout(r, 1200))
      ]);
    } catch {}

    setBeaconStatus('SENT');
    setCounterSecondsLeft(90);
  };

  // Instant Card Freeze Toggle
  const handleToggleFreeze = async () => {
    if (!ledger) return;
    const isCurrentlyActive = ledger.is_active !== 0;
    const confirmMsg = isCurrentlyActive
      ? (lang === 'ar' ? 'هل أنت متأكد من تجميد بطاقتك؟ سيتم إيقاف المشتريات الآجلة فوراً.' : 'Are you sure you want to FREEZE your Khata? In-store credit purchases will be blocked immediately.')
      : (lang === 'ar' ? 'هل أنت متأكد من إلغاء تجميد الحساب؟' : 'Are you sure you want to UNFREEZE your Khata account?');

    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/khata/${encodeURIComponent(ledger.id || customerId)}/freeze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ freeze: isCurrentlyActive })
      });
      const result = await res.json();
      if (result.success) {
        const nextActive = result.is_active !== undefined ? Number(result.is_active) : (isCurrentlyActive ? 0 : 1);
        const updated = { ...ledger, is_active: nextActive };
        setLedger(updated);
        try {
          localStorage.setItem(`khata_tab_cache_${customerId}`, JSON.stringify(updated));
        } catch {}
      } else {
        alert(result.error || 'Failed to update account freeze state');
      }
    } catch {
      alert('Connection error updating account lock status');
    }
  };

  // Transition Lock: Prevents bounce oscillation while animating
  const lockTransition = useCallback((durationMs = 380) => {
    isTransitioningRef.current = true;
    if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
    transitionTimeoutRef.current = setTimeout(() => {
      isTransitioningRef.current = false;
    }, durationMs);
  }, []);

  // Buttery Smooth Horizontal Card Slide Lifecycle (Direction or Direct Index)
  const handleSlideCard = useCallback((directionOrIndex) => {
    if (cards.length <= 1 || isTransitioningRef.current) return;

    let targetIndex;
    let isNext;

    if (typeof directionOrIndex === 'number') {
      if (directionOrIndex === activeCardIndex || directionOrIndex < 0 || directionOrIndex >= cards.length) return;
      targetIndex = directionOrIndex;
      isNext = directionOrIndex > activeCardIndex;
    } else {
      isNext = directionOrIndex === 'NEXT';
      targetIndex = isNext
        ? (activeCardIndex + 1) % cards.length
        : (activeCardIndex - 1 + cards.length) % cards.length;
    }

    setIsCardFlipped(false);
    setCardDragX(0);

    setSlideDir(isNext ? 'LEFT' : 'RIGHT');
    setSlidePhase('EXIT');
    lockTransition(380);

    if (slideTimerRef.current) clearTimeout(slideTimerRef.current);
    slideTimerRef.current = setTimeout(() => {
      setActiveCardIndex(targetIndex);
      setSlidePhase('ENTER');

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSlidePhase('IDLE');
          setSlideDir('NONE');
        });
      });
    }, 150);
  }, [activeCardIndex, cards.length, lockTransition]);

  // Keyboard Navigation for Card Carousel
  const handleCarouselKeyDown = useCallback((e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (hasNext) handleSlideCard('NEXT');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (hasPrev) handleSlideCard('PREV');
    } else if (e.key === 'Home') {
      e.preventDefault();
      if (activeCardIndex !== 0) handleSlideCard(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      if (activeCardIndex !== cards.length - 1) handleSlideCard(cards.length - 1);
    }
  }, [hasNext, hasPrev, activeCardIndex, cards.length, handleSlideCard]);

  // Compute 60/120 FPS GPU Horizontal Slide Transform
  const cardSlideTransform = useMemo(() => {
    if (cardDragX !== 0) {
      return {
        transform: `translate3d(${cardDragX}px, 0, 0) rotate(${cardDragX * 0.024}deg)`,
        transition: 'none',
        opacity: Math.max(0.72, 1 - Math.abs(cardDragX) * 0.0016)
      };
    }
    if (slidePhase === 'EXIT') {
      const exitX = slideDir === 'LEFT' ? '-115%' : '115%';
      const exitRot = slideDir === 'LEFT' ? '-5deg' : '5deg';
      return {
        transform: `translate3d(${exitX}, 0, 0) rotate(${exitRot}) scale(0.92)`,
        transition: 'transform 160ms cubic-bezier(0.4, 0, 1, 1), opacity 150ms ease-out',
        opacity: 0
      };
    }
    if (slidePhase === 'ENTER') {
      const enterX = slideDir === 'LEFT' ? '90%' : '-90%';
      const enterRot = slideDir === 'LEFT' ? '4deg' : '-4deg';
      return {
        transform: `translate3d(${enterX}, 0, 0) rotate(${enterRot}) scale(0.94)`,
        transition: 'none',
        opacity: 0
      };
    }
    return {
      transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)',
      transition: 'transform 340ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease-out',
      opacity: 1
    };
  }, [cardDragX, slidePhase, slideDir]);

  // Touch gesture handlers on physical card
  const cardTouchStartXRef = useRef(0);
  const cardTouchStartYRef = useRef(0);
  const cardTouchStartTimeRef = useRef(0);

  const handleCardTouchStart = (e) => {
    cardTouchStartXRef.current = e.touches[0].clientX;
    cardTouchStartYRef.current = e.touches[0].clientY;
    cardTouchStartTimeRef.current = Date.now();
    cardGestureIntentRef.current = 'UNDECIDED';
    setIsDraggingCard(false);
  };

  const handleCardTouchMove = (e) => {
    if (isTransitioningRef.current) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - cardTouchStartXRef.current;
    const deltaY = currentY - cardTouchStartYRef.current;

    if (cardGestureIntentRef.current === 'UNDECIDED') {
      if (Math.abs(deltaX) > 7 && Math.abs(deltaX) > Math.abs(deltaY)) {
        cardGestureIntentRef.current = 'HORIZONTAL';
        setIsDraggingCard(true);
      } else if (Math.abs(deltaY) > 7 && Math.abs(deltaY) > Math.abs(deltaX)) {
        cardGestureIntentRef.current = 'VERTICAL';
      }
    }

    if (cardGestureIntentRef.current === 'HORIZONTAL') {
      let dampedX = deltaX;
      if (activeCardIndex === 0 && deltaX > 0) dampedX = deltaX * 0.28;
      else if (activeCardIndex === cards.length - 1 && deltaX < 0) dampedX = deltaX * 0.28;
      setCardDragX(dampedX);
    }
  };

  const handleCardTouchEnd = (e) => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - cardTouchStartXRef.current;
    const deltaY = endY - cardTouchStartYRef.current;
    const duration = Date.now() - cardTouchStartTimeRef.current;
    const intent = cardGestureIntentRef.current;
    cardGestureIntentRef.current = 'UNDECIDED';
    setIsDraggingCard(false);

    if (intent === 'HORIZONTAL' || (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 20)) {
      const isFastFlick = duration < 280 && Math.abs(deltaX) > 25;
      const passedThreshold = Math.abs(cardDragX || deltaX) > 45 || isFastFlick;

      if (passedThreshold) {
        if ((cardDragX < 0 || deltaX < 0) && hasNext) {
          handleSlideCard('NEXT');
          return;
        } else if ((cardDragX > 0 || deltaX > 0) && hasPrev) {
          handleSlideCard('PREV');
          return;
        }
      }
      setCardDragX(0);
      return;
    }
    setCardDragX(0);
  };

  // Mouse Drag Swiping for Desktop
  const isMouseDownRef = useRef(false);
  const cardMouseStartXRef = useRef(0);
  const cardMouseStartYRef = useRef(0);

  const handleCardMouseDown = (e) => {
    isMouseDownRef.current = true;
    cardMouseStartXRef.current = e.clientX;
    cardMouseStartYRef.current = e.clientY;
    cardTouchStartTimeRef.current = Date.now();
    cardGestureIntentRef.current = 'UNDECIDED';
    setIsDraggingCard(false);
  };

  const handleCardMouseMove = (e) => {
    if (!isMouseDownRef.current || isTransitioningRef.current) return;
    const deltaX = e.clientX - cardMouseStartXRef.current;
    const deltaY = e.clientY - cardMouseStartYRef.current;

    if (cardGestureIntentRef.current === 'UNDECIDED') {
      if (Math.abs(deltaX) > 6 && Math.abs(deltaX) > Math.abs(deltaY)) {
        cardGestureIntentRef.current = 'HORIZONTAL';
        setIsDraggingCard(true);
      }
    }

    if (cardGestureIntentRef.current === 'HORIZONTAL') {
      let dampedX = deltaX;
      if (activeCardIndex === 0 && deltaX > 0) dampedX = deltaX * 0.28;
      else if (activeCardIndex === cards.length - 1 && deltaX < 0) dampedX = deltaX * 0.28;
      setCardDragX(dampedX);
    }
  };

  const handleCardMouseUp = (e) => {
    if (!isMouseDownRef.current) return;
    isMouseDownRef.current = false;
    const deltaX = e.clientX - cardMouseStartXRef.current;
    const duration = Date.now() - cardTouchStartTimeRef.current;
    setIsDraggingCard(false);

    if (cardGestureIntentRef.current === 'HORIZONTAL') {
      const isFastFlick = duration < 280 && Math.abs(deltaX) > 25;
      const passedThreshold = Math.abs(cardDragX || deltaX) > 45 || isFastFlick;

      if (passedThreshold) {
        if ((cardDragX < 0 || deltaX < 0) && hasNext) {
          handleSlideCard('NEXT');
          return;
        } else if ((cardDragX > 0 || deltaX > 0) && hasPrev) {
          handleSlideCard('PREV');
          return;
        }
      }
    }
    setCardDragX(0);
  };

  const handleCardMouseLeave = () => {
    if (isMouseDownRef.current) {
      isMouseDownRef.current = false;
      setIsDraggingCard(false);
      setCardDragX(0);
    }
  };

  const handleToggleCardFlip = () => {
    setIsCardFlipped(prev => !prev);
  };

  // BenefitPay Settle Execution
  const handleTriggerPayment = async (amount) => {
    if (!ledger) return;
    const payAmountVal = Number(Number(amount || activeCard.balance).toFixed(3));
    if (isNaN(payAmountVal) || payAmountVal < 0.100) {
      alert('Minimum settlement amount is 0.100 BHD');
      return;
    }

    try {
      setPaying(true);
      const res = await fetch('/api/checkout/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: ledger.id || customerId,
          amount: payAmountVal,
          customerName: ledger.name,
          paymentTarget: activeCard.type === 'MESS' ? 'MESS' : activeCard.type === 'PERSONAL' ? 'PERSONAL' : 'ALL',
          targetMessId: activeCard.messId || null,
          targetName: activeCard.title,
          sourceView: 'tab'
        })
      });

      const data = await res.json();
      if (res.ok && data.mode === 'GATEWAY_REDIRECT' && data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
      } else {
        setBenefitPayData({
          ...data,
          amount: payAmountVal,
          paymentTarget: activeCard.type,
          targetName: activeCard.title
        });
        setShowBenefitModal(true);
      }
    } catch (e) {
      // Offline fallback QR
      const invoiceRef = `KHATA-${String(ledger.id || customerId).slice(-6)}`;
      const offlineQr = generateBenefitPayPayload(payAmountVal, invoiceRef);
      setBenefitPayData({
        mode: 'BENEFITPAY_FAWRI',
        amount: payAmountVal,
        currency: 'BHD',
        merchantName: 'LAYALI SUPERMARKET',
        merchantId: '97300182',
        mobileNumber: '+973 32067388',
        iban: 'BH67NBOB00000012345678',
        branchId: 'POS-01',
        qrPayload: offlineQr,
        customerId: ledger.id || customerId,
        customerName: ledger.name
      });
      setShowBenefitModal(true);
    } finally {
      setPaying(false);
    }
  };

  // Share Statement via WhatsApp
  const handleShareWhatsApp = () => {
    if (!ledger) return;
    const balanceNum = Number(activeCard.balance || 0);
    const balanceStr = Math.abs(balanceNum).toFixed(3);
    const isSettled = Math.abs(balanceNum) < 0.0005;

    let textStr = '';
    if (lang === 'ar') {
      textStr = `*أسواق ليالي المركزية - كشف الحساب*\nالزبون: ${ledger.name}\nالبطاقة: ${activeCard.title}\n${isSettled ? 'الحالة: الحساب مسدد بالكامل' : `المبلغ المستحق: ${balanceStr} د.ب`}\nالسداد إلكترونياً عبر بنفت بي: ${window.location.href}`;
    } else {
      textStr = `*Layali Khata Tab*\nCustomer: ${ledger.name}\nCard: ${activeCard.title}\n${isSettled ? 'Status: Fully Settled' : `Outstanding Balance: BHD ${balanceStr}`}\nPay online via BenefitPay: ${window.location.href}`;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(textStr)}`, '_blank');
  };

  // Google Pay Transactions Filtering
  const allTransactions = useMemo(() => {
    return ledger?.transactions || ledger?.statement || [];
  }, [ledger]);

  // Recent 10 Transactions (Card-Bound)
  const recent10Tx = useMemo(() => {
    let list = allTransactions;
    if (activeCard.type === 'PERSONAL') {
      list = list.filter(tx => !tx.mess_id && tx.walletName !== 'Room Mess');
    } else if (activeCard.type === 'MESS' && activeCard.messId) {
      list = list.filter(tx => tx.mess_id === activeCard.messId);
    }
    return list.slice(0, 10);
  }, [allTransactions, activeCard]);

  // Full Transactions Filtered & Grouped
  const filteredAllTx = useMemo(() => {
    return allTransactions.filter(tx => {
      // Scope filter
      if (allTxCardScope === 'ACTIVE') {
        if (activeCard.type === 'PERSONAL' && (tx.mess_id || tx.walletName === 'Room Mess')) return false;
        if (activeCard.type === 'MESS' && tx.mess_id !== activeCard.messId) return false;
      }
      // Type filter
      if (allTxTypeFilter === 'PURCHASE' && tx.type !== 'PURCHASE' && tx.type !== 'CHARGE') return false;
      if (allTxTypeFilter === 'PAYMENT' && tx.type !== 'PAYMENT') return false;
      // Search filter
      if (allTxSearchQuery) {
        const q = allTxSearchQuery.toLowerCase();
        const inv = String(tx.invoiceNo || tx.reference || '').toLowerCase();
        const amt = String(tx.amount || '').toLowerCase();
        const items = Array.isArray(tx.items) ? tx.items.map(i => i.name?.toLowerCase()).join(' ') : '';
        if (!inv.includes(q) && !amt.includes(q) && !items.includes(q)) return false;
      }
      // Month filter
      if (allTxMonthFilter !== 'ALL') {
        const d = tx.timestamp || tx.created_at || '';
        if (!d.startsWith(allTxMonthFilter)) return false;
      }
      return true;
    });
  }, [allTransactions, allTxCardScope, activeCard, allTxTypeFilter, allTxSearchQuery, allTxMonthFilter]);

  // Month-grouped records for All Transactions
  const groupedAllTx = useMemo(() => {
    const groups = {};
    for (const tx of filteredAllTx) {
      const monthKey = formatMonthYear(tx.timestamp || tx.created_at, lang);
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(tx);
    }
    return groups;
  }, [filteredAllTx, lang]);

  // Security Gate: Account Mismatch Lockout Screen
  if (isDeviceBoundToOther) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="bg-slate-900 border border-rose-500/30 rounded-3xl p-8 w-full max-w-md text-center shadow-2xl">
          <div className="w-16 h-16 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-500/40">
            <Lock className="w-8 h-8 text-rose-400" />
          </div>
          <span className="text-[10px] font-mono tracking-widest uppercase px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
            Account Protected
          </span>
          <h2 className="text-xl font-black text-white mt-4 mb-2">Personal Khata Locked</h2>
          <p className="text-slate-300 text-xs mb-6 leading-relaxed">
            This device is registered to another Khata account. Opening another patron's tab is restricted for camp privacy.
          </p>
          <button
            type="button"
            onClick={() => { window.location.href = `/tab/${encodeURIComponent(boundCustomerId)}`; }}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl text-sm transition cursor-pointer flex items-center justify-center gap-2 shadow-lg"
          >
            <ShieldCheck className="w-5 h-5" />
            <span>Return to My Khata</span>
          </button>
        </div>
      </div>
    );
  }

  // Security Gate: Biometric Phone Lock Gate
  if (phoneLockRequired) {
    const handleUnlock = async () => {
      setVerifyingPhoneLock(true);
      setPhoneLockError('');
      try {
        const res = await verifyPhoneLock(customerId);
        if (res.success) {
          setPhoneLockRequired(false);
          fetchLedger();
        } else {
          setPhoneLockError(res.error || 'Authentication cancelled');
        }
      } catch (e) {
        setPhoneLockError(e.message || 'Verification failed');
      } finally {
        setVerifyingPhoneLock(false);
      }
    };

    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-md text-center shadow-2xl">
          <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-3xl flex items-center justify-center mx-auto mb-5 border-2 border-emerald-500/40">
            <Fingerprint className="w-12 h-12" />
          </div>
          <span className="text-[10px] font-mono tracking-widest uppercase px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
            Biometric Phone Lock
          </span>
          <h2 className="text-2xl font-black text-white mt-4 mb-2">Touch to Unlock</h2>
          <p className="text-slate-300 text-xs mb-6 leading-relaxed">
            Use your phone fingerprint, face unlock, or screen pattern to open your Khata tab.
          </p>
          {phoneLockError && (
            <div className="mb-4 p-3 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-300 text-xs font-semibold">
              {phoneLockError}
            </div>
          )}
          <button
            type="button"
            onClick={handleUnlock}
            disabled={verifyingPhoneLock}
            className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black rounded-2xl text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-lg"
          >
            {verifyingPhoneLock ? 'Verifying...' : 'Unlock with Phone Lock'}
          </button>
        </div>
      </div>
    );
  }

  // Loading Skeleton
  if (loading || !ledger) {
    return (
      <div className="min-h-screen bg-[#000000] text-white flex flex-col items-center justify-between p-4 animate-pulse">
        <header 
          style={{ paddingTop: 'max(14px, calc(env(safe-area-inset-top, 0px) + 8px))' }}
          className="w-full max-w-md flex items-center justify-between pb-2"
        >
          <div className="w-10 h-10 bg-white/10 rounded-2xl" />
          <div className="w-32 h-6 bg-white/10 rounded-xl" />
          <div className="w-20 h-10 bg-white/10 rounded-2xl" />
        </header>
        <main className="w-full max-w-md flex-1 flex flex-col gap-4 my-auto">
          <div className="w-full aspect-[1.58/1] bg-white/5 border border-white/10 rounded-3xl" />
          <div className="h-32 bg-white/5 border border-white/10 rounded-3xl" />
        </main>
      </div>
    );
  }

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="min-h-[100dvh] bg-[#000000] text-[#FFFAFA] font-sans flex flex-col items-center justify-between selection:bg-[#0071E3] selection:text-white relative overflow-x-hidden"
    >
      {/* ─────────────────────────────────────────────────────────────
          1. REAL-TIME REGISTER ALERT TOAST (Safe-area aware, under apex)
          ───────────────────────────────────────────────────────────── */}
      {liveTxAlert && (
        <aside
          role="alert"
          style={{ top: 'calc(max(14px, env(safe-area-inset-top, 0px)) + 58px)' }}
          className="fixed left-3 right-3 z-[70] max-w-md mx-auto p-3.5 rounded-2xl bg-[#121214]/95 border-2 border-emerald-400 shadow-[0_12px_40px_rgba(16,185,129,0.45)] text-white animate-in slide-in-from-top duration-200 flex items-center justify-between gap-3 backdrop-blur-xl"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center shrink-0 text-emerald-300">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                  {liveTxAlert.title || 'Store Purchase Notice'}
                </span>
                <span className="text-xs font-mono font-black text-white">
                  {liveTxAlert.formattedAmount || `${Number(liveTxAlert.amount || 0).toFixed(3)} BHD`}
                </span>
              </div>
              <p className="text-[11px] text-neutral-300 truncate font-medium">
                {liveTxAlert.message || `Invoice #${liveTxAlert.invoiceNo || 'INV'}: Balance updated`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLiveTxAlert(null)}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </aside>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. APEX BAR (Header: Hamburger Menu, Brand & Privacy Eye)
          ───────────────────────────────────────────────────────────── */}
      <header 
        style={{ paddingTop: 'max(14px, calc(env(safe-area-inset-top, 0px) + 8px))' }}
        className="w-full max-w-md px-4 pb-3 flex items-center justify-between shrink-0 border-b border-white/[0.08] bg-[#0A0A0A]/95 backdrop-blur-xl z-30"
      >
        {/* Left: 0ms PointerDown Hamburger Menu Button */}
        <div className="w-20 flex items-center justify-start shrink-0">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            onPointerDown={() => setIsDrawerOpen(true)}
            className="h-10 px-2.5 sm:px-3 bg-white/10 hover:bg-white/15 active:scale-95 border border-white/15 rounded-2xl flex items-center gap-1.5 text-white transition cursor-pointer shadow-xs"
            title="Open Menu & Tools"
          >
            <Menu className="w-5 h-5 text-[#0071E3] shrink-0" />
            <span className="text-[11px] font-bold font-mono tracking-wider hidden sm:inline">MENU</span>
          </button>
        </div>

        {/* Center: Brand Title */}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-1 min-w-0 pointer-events-none">
          <div className="flex items-center justify-center gap-1.5 leading-none">
            <span className="text-sm font-black tracking-wider text-white">
              LAYALI
            </span>
            <span className="text-sm font-black tracking-wider text-[#0071E3]">
              KHATA
            </span>
          </div>
          <span className="text-[10px] text-neutral-400 font-sans tracking-wide mt-0.5">أسواق ليالي</span>
        </div>

        {/* Right: Refresh & Hide Balance Toggle */}
        <div className="w-20 flex items-center justify-end gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isSyncing}
            className={`w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/15 active:scale-95 border border-white/15 flex items-center justify-center text-white transition cursor-pointer shrink-0 ${
              isSyncing ? 'opacity-80 pointer-events-none' : ''
            }`}
            title="Refresh Ledger"
          >
            <RotateCw
              className={`w-3.5 h-3.5 transition-colors duration-200 ${
                isSyncing ? 'animate-spin text-[#0071E3]' : 'text-neutral-300'
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => {
              setHideBalance(prev => {
                const next = !prev;
                try { localStorage.setItem('khata_hide_balance', String(next)); } catch {}
                return next;
              });
            }}
            className="w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/15 active:scale-95 border border-white/15 flex items-center justify-center text-white transition cursor-pointer shrink-0"
            title={hideBalance ? t.showBalance : t.hideBalance}
          >
            {hideBalance ? <EyeOff className="w-3.5 h-3.5 text-amber-400" /> : <Eye className="w-3.5 h-3.5 text-neutral-300" />}
          </button>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          3. MAIN VIEW: CONDITIONAL (ALL TRANSACTIONS vs 3D CARD HERO)
          ───────────────────────────────────────────────────────────── */}
      {activeSubView === 'ALL_TRANSACTIONS' ? (
        /* ═════════════════════════════════════════════════════════════
           GOOGLE PAY ALL TRANSACTIONS DEDICATED VIEW
           ═════════════════════════════════════════════════════════════ */
        <div className="w-full max-w-md flex-1 flex flex-col overflow-y-auto px-4 py-3 space-y-3.5">
          {/* Subview Nav Header */}
          <div className="flex items-center justify-between shrink-0 pb-2 border-b border-white/10">
            <button
              type="button"
              onClick={() => setActiveSubView('MAIN')}
              className="flex items-center gap-2 text-xs font-bold text-white hover:text-[#0071E3] transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Wallet</span>
            </button>
            <span className="text-[10px] font-mono font-bold bg-[#0071E3]/20 text-[#0071E3] px-2.5 py-0.5 rounded-full border border-[#0071E3]/30">
              {filteredAllTx.length} items
            </span>
          </div>

          {/* Search Bar */}
          <div className="relative flex items-center bg-[#161616] border border-white/15 rounded-full px-3.5 py-2">
            <Search className="w-4 h-4 text-neutral-400 shrink-0 mr-2" />
            <input
              type="text"
              value={allTxSearchQuery}
              onChange={(e) => setAllTxSearchQuery(e.target.value)}
              placeholder={t.searchTxPlaceholder}
              className="w-full bg-transparent text-xs text-white placeholder-neutral-500 focus:outline-hidden font-medium"
            />
            {allTxSearchQuery && (
              <button
                type="button"
                onClick={() => setAllTxSearchQuery('')}
                className="text-neutral-400 hover:text-white p-0.5 rounded-full cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            {['ALL', 'PURCHASE', 'PAYMENT'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setAllTxTypeFilter(type)}
                className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 transition cursor-pointer border ${
                  allTxTypeFilter === type
                    ? 'bg-[#0071E3] text-white border-[#0071E3]'
                    : 'bg-white/5 hover:bg-white/10 text-neutral-400 border-white/10'
                }`}
              >
                {type === 'ALL' ? t.filterAll : type === 'PURCHASE' ? t.filterPurchases : t.filterPayments}
              </button>
            ))}
          </div>

          {/* Month Grouped Transaction Ledger */}
          <div className="space-y-4">
            {Object.keys(groupedAllTx).length > 0 ? (
              Object.entries(groupedAllTx).map(([month, txs]) => (
                <div key={month} className="space-y-1.5">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400 px-1">
                    {month}
                  </span>
                  <div className="rounded-2xl bg-[#141414] border border-white/10 divide-y divide-white/[0.06] overflow-hidden">
                    {txs.map((tx) => {
                      const isDeferredDeposit = tx.subledger_type === 'DEPOSIT_DEFERRED' || tx.type === 'DEPOSIT_DEFERRED' || (tx.reference && tx.reference.toLowerCase().includes('card security deposit'));
                      const isDepositHeld = tx.type === 'CARD_DEPOSIT' || tx.type === 'DEPOSIT_COLLECTED' || tx.subledger_type === 'DEPOSIT';
                      const isDeposit = isDeferredDeposit || isDepositHeld;
                      const isPurchase = !isDeposit && (tx.type === 'PURCHASE' || tx.type === 'CHARGE');
                      const isMessSplit = !isDeposit && Boolean(
                        tx.subledger_type === 'MESS_SHARE' ||
                        tx.mess_id || 
                        tx.is_mess_split ||
                        tx.group_total ||
                        (tx.reference && tx.reference.toLowerCase().includes('mess split'))
                      );
                      const fullBasketBill = Number(tx.bill_total || tx.group_total || tx.amount || 0);
                      const memberShareBill = Number(tx.split_share !== null && tx.split_share !== undefined ? tx.split_share : tx.amount || 0);

                      const { date, time } = formatTxDate(tx.timestamp || tx.created_at, lang);
                      const depositAmountVal = Number(tx.displayAmount ?? tx.depositAmount ?? (Number(tx.amount) > 0 ? tx.amount : null) ?? ledger?.card_deposit_amount ?? 3.0).toFixed(3);
                      return (
                        <div
                          key={tx.id || tx.invoiceNo}
                          onClick={() => setSelectedReceipt(tx)}
                          className="p-3.5 hover:bg-white/[0.04] active:bg-white/[0.08] transition cursor-pointer flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${
                              isDeferredDeposit 
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' 
                                : isDepositHeld
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                  : isPurchase 
                                    ? (isMessSplit ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40' : 'bg-[#0071E3]/20 text-[#0071E3] border-[#0071E3]/40')
                                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            }`}>
                              {isDeposit ? <ShieldCheck className="w-4 h-4" /> : isPurchase ? (isMessSplit ? <Users className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />) : <CreditCard className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                                <span>
                                  {isDeferredDeposit 
                                    ? (lang === 'ar' ? 'تأمين بطاقة الائتمان (مؤجل ليوم الراتب)' : 'Card Security Deposit (Payable on Payday)')
                                    : isDepositHeld
                                      ? (lang === 'ar' ? 'تأمين البطاقة في صندوق الأمانات' : 'Card Security Deposit (Held in Trust)')
                                      : (tx.reference || tx.invoiceNo || (isPurchase ? 'Store Purchase' : 'Fawri+ Payment'))}
                                </span>
                                {isMessSplit && (
                                  <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-500/20 px-1.5 py-0.2 rounded border border-indigo-500/30 shrink-0">
                                    🥘 {tx.messName || 'Mess'} {tx.member_count ? `(1/${tx.member_count})` : ''}
                                  </span>
                                )}
                              </span>
                              <span className="text-[10px] text-neutral-400 block font-mono">
                                {isDeferredDeposit
                                  ? `${date} - Due on ${ledger?.payday_day_of_month || 28}th Payday`
                                  : isDepositHeld
                                    ? `${date} - Refundable upon card return`
                                    : `${date} - ${time}`}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {isMessSplit && fullBasketBill > memberShareBill ? (
                              <>
                                <span className="text-xs font-black font-mono block text-amber-400">
                                  +BD {memberShareBill.toFixed(3)}
                                </span>
                                <span className="text-[9px] text-neutral-400 font-mono block">
                                  ({(tx.member_count || Math.round(fullBasketBill / Math.max(0.001, memberShareBill))) > 1 ? `1/${tx.member_count || Math.round(fullBasketBill / Math.max(0.001, memberShareBill))} of ` : ''}BD {fullBasketBill.toFixed(3)})
                                </span>
                              </>
                            ) : (
                              <span className={`text-xs font-black font-mono block ${
                                isDeferredDeposit 
                                  ? 'text-amber-400' 
                                  : isDepositHeld 
                                    ? 'text-emerald-400' 
                                    : isPurchase 
                                      ? 'text-white' 
                                      : 'text-emerald-400'
                              }`}>
                                {isDeposit ? `BD ${depositAmountVal}` : `${isPurchase ? '' : '-'}BD ${Number(tx.amount || 0).toFixed(3)}`}
                              </span>
                            )}
                            <span className="text-[9px] text-neutral-500 font-mono">
                              Bal: BD {Number(tx.runningBalance ?? tx.running_balance ?? 0).toFixed(3)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-neutral-400 text-xs">
                {t.noTxFound}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ═════════════════════════════════════════════════════════════
           MAIN 3D CARD HERO & GOOGLE PAY RECENT 10 VIEW
           ═════════════════════════════════════════════════════════════ */
        <main className="w-full max-w-md flex-1 flex flex-col justify-between px-4 py-3 space-y-4">
          
          {/* Offline Warning */}
          {isOffline && (
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-300 text-xs font-semibold flex items-center gap-2 justify-center">
              <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{t.offlineSnapshot}</span>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              3D PHYSICAL CARD CAROUSEL (Exact Apple Wallet Deck)
              ───────────────────────────────────────────────────────────── */}
          <div
            role="region"
            aria-roledescription="carousel"
            aria-label="Khata Credit Cards"
            tabIndex={0}
            onKeyDown={handleCarouselKeyDown}
            className="relative w-full flex items-center justify-center outline-hidden select-none"
          >
            {/* 1. Peeking Previous Card (Left Edge when on Card 1 or 2) */}
            {hasPrev && prevCard && (
              <div
                onClick={(e) => { e.stopPropagation(); handleSlideCard('PREV'); }}
                className="absolute left-0 top-0 bottom-0 rounded-r-[28px] sm:rounded-r-[32px] border-y border-r bg-gradient-to-b cursor-pointer z-30 shadow-2xl flex items-center justify-center group active:scale-95 transition-all duration-300 ease-out overflow-hidden"
                style={{
                  width: cardDragX > 0 ? `${Math.min(38, 22 + cardDragX * 0.25)}px` : '22px',
                  transform: cardDragX > 0 ? `scale(${Math.min(1.04, 1 + cardDragX * 0.001)})` : 'scale(1)',
                  background: 'linear-gradient(to bottom, #1C1C1C, #0D0D0D)',
                  borderColor: 'rgba(0,113,227,0.3)',
                  boxShadow: '10px 0 30px rgba(0,0,0,0.85), 0 10px 25px rgba(0,113,227,0.22), inset -1px 0 1px rgba(255,255,255,0.25)'
                }}
                title={`Swipe back to ${prevCard.title}`}
              >
                <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-white/40 via-white/10 to-transparent pointer-events-none" />
                <div className="w-1 h-12 rounded-full bg-white/40 group-hover:bg-white/70 transition shadow-xs" />
              </div>
            )}

            {/* 2. Main Active Card (h-[475px] rounded-[32px]) */}
            <section
              role="group"
              aria-roledescription="slide"
              aria-label={`Card ${activeCardIndex + 1} of ${cards.length}: ${activeCard.title}, Balance BHD ${Number(activeCard.balance).toFixed(3)}`}
              onTouchStart={handleCardTouchStart}
              onTouchMove={handleCardTouchMove}
              onTouchEnd={handleCardTouchEnd}
              onMouseDown={handleCardMouseDown}
              onMouseMove={handleCardMouseMove}
              onMouseUp={handleCardMouseUp}
              onMouseLeave={handleCardMouseLeave}
              style={{
                transition: isDraggingCard
                  ? 'none'
                  : 'height 380ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 380ms cubic-bezier(0.22, 1, 0.36, 1), padding 380ms cubic-bezier(0.22, 1, 0.36, 1), width 380ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 380ms cubic-bezier(0.22, 1, 0.36, 1), transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease-out',
                transform: cardSlideTransform.transform,
                opacity: cardSlideTransform.opacity,
                willChange: 'height, border-radius, width, transform',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden'
              }}
              className={`overflow-hidden backdrop-blur-2xl border relative z-20 h-[475px] rounded-[32px] bg-gradient-to-b ${activeCard.gradient} ${activeCard.borderGlow} p-5 flex flex-col justify-between cursor-grab active:cursor-grabbing select-none ${
                cards.length > 1 ? 'w-[calc(100%-28px)] mx-auto' : 'w-full'
              }`}
            >
              {/* Specular Laser Edge Highlight & Chamfer Ring */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />
              <div className="absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10 pointer-events-none" />

              {/* ─────────────────────────────────────────────────────
                  3D FLIPPER SCENE (Perspective & Preserve-3d)
                  ───────────────────────────────────────────────────── */}
              <div
                className="flex-1 relative transition-all duration-350 ease-out"
                style={{ perspective: '1200px' }}
              >
                <div
                  className="relative w-full h-full flex flex-col justify-between transition-transform duration-500 ease-out"
                  style={{
                    transformStyle: 'preserve-3d',
                    transform: isCardFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                  }}
                >
                  {/* ═════════════════════════════════════════════════
                      A. FRONT FACE: HEADER, BALANCE, GAUGE & ACTIONS
                      ═════════════════════════════════════════════════ */}
                  <div
                    className="w-full h-full flex flex-col justify-between"
                    style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                  >
                    {/* Header Row: Patron Avatar, Customer Name & Card Title */}
                    <div className="flex items-center justify-between gap-2 shrink-0 pt-0.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-[#0071E3] font-bold text-xs shrink-0 shadow-inner">
                          {activeCard.type === 'MESS' ? <Users className="w-4 h-4 text-white" /> : <User className="w-4 h-4 text-[#0071E3]" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-black text-[#FFFAFA] leading-snug text-base sm:text-lg truncate">
                            {ledger.name || 'Valued Customer'}
                          </h3>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] text-neutral-400 font-medium block">
                              {activeCard.title}
                            </span>
                            {/* Clean Colored Typography Status Badge (Strictly NO circular dots) */}
                            {activeCard.type === 'PERSONAL' && (
                              (activeCard.depositStatus === 'IN_CREDIT' || activeCard.depositStatus === 'DEFERRED_CREDIT' || activeCard.depositStatus === 'DEFERRED_PAYDAY' || Number(activeCard.depositInCredit || 0) > 0) ? (
                                <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded-full">
                                  IN CREDIT (DUE): BD {Number(activeCard.depositAmount || 0).toFixed(3)}
                                </span>
                              ) : (activeCard.depositStatus === 'HELD' || activeCard.depositStatus === 'HELD_IN_TRUST') ? (
                                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                  HELD IN TRUST: BD {Number(activeCard.depositAmount || 0).toFixed(3)}
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                                  NO DEPOSIT
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Top Action Row: Frozen badge & Flip QR Button */}
                      <div className="flex items-center gap-2 shrink-0">
                        {activeCard.isFrozen && (
                          <span className="text-[9px] font-mono font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                            <Lock className="w-2.5 h-2.5" />
                            <span>{lang === 'ar' ? 'مجمّد' : 'FROZEN'}</span>
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleToggleCardFlip(); }}
                          className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-[#FFFAFA] border border-white/15 flex items-center gap-1.5 text-xs font-bold transition cursor-pointer shadow-xs"
                          title="Flip Card for POS QR Scanner"
                        >
                          <QrCode className="w-3.5 h-3.5 text-[#0071E3]" />
                          <span>{lang === 'ar' ? 'قلب للباركود' : 'Flip QR'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Big Live Balance Centerpiece */}
                    <div className="py-1">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-3 rounded-full ${activeCard.balance < -0.0005 ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]' : 'bg-[#0071E3]'}`} />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300">
                            {activeCard.type === 'MESS'
                              ? (lang === 'ar' ? 'حصتك الفردية في الميس' : t.myMessShare)
                              : activeCard.balance < -0.0005
                                ? (lang === 'ar' ? 'رصيد إيداع مسبق / رصيد دائن' : t.creditTitle)
                                : (lang === 'ar' ? 'رصيد الحساب الشخصي المستحق' : t.owed)}
                          </span>
                        </div>
                        {activeCard.type === 'MESS' && activeCard.roomTotal ? (
                          <span className="text-[10.5px] font-mono font-bold text-[#FFFAFA] tracking-wide">
                            Room Total: BHD {Number(activeCard.roomTotal).toFixed(3)}
                          </span>
                        ) : activeCard.balance < -0.0005 ? (
                          <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                            {lang === 'ar' ? 'دفعة مقدمة متاحة' : 'Credit Deposit'}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-[11px] font-mono font-bold tracking-widest text-[#FFFAFA] uppercase bg-white/[0.08] border border-white/10 px-2 py-0.5 rounded-md shadow-xs">
                          BHD
                        </span>
                        <span className={`text-4xl sm:text-5xl font-black font-mono tracking-tight tabular-nums ${activeCard.balance < -0.0005 ? 'text-emerald-400' : 'text-[#FFFAFA]'}`}>
                          {hideBalance ? '••••••' : (activeCard.balance < -0.0005 ? Math.abs(Number(activeCard.balance)).toFixed(3) : Number(activeCard.balance).toFixed(3))}
                        </span>
                      </div>

                      {/* MASTER CARD DEDICATED MESS SPLIT BREAKDOWN WITH #FF9900 PERSONAL ACCENT */}
                      {activeCard.type === 'MASTER' ? (
                        <div className="mt-2 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-mono font-bold">
                            <div className="flex items-center gap-1">
                              <span className="text-[#FF9900] font-medium">{lang === 'ar' ? 'شخصي' : 'Personal'}:</span>
                              <span className="text-[#FFFAFA] tabular-nums font-bold">BD {hideBalance ? '•••' : Number(activeCard.personalBalance || 0).toFixed(3)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[#0071E3] font-medium">{lang === 'ar' ? 'الميس' : 'Mess Split'}:</span>
                              <span className="text-[#0071E3] tabular-nums font-bold">BD {hideBalance ? '•••' : Number(activeCard.messBalance || 0).toFixed(3)}</span>
                            </div>
                          </div>

                          {/* Dual Proportion Splitting Line: Personal Share colored #FF9900 */}
                          <div className="w-full bg-black/60 h-2 rounded-full overflow-hidden flex border border-white/10">
                            <div
                              className="h-full bg-[#FF9900] rounded-l-full shadow-[0_0_8px_rgba(255,153,0,0.6)] transition-all duration-500"
                              style={{ width: `${Math.round(((activeCard.personalBalance || 0) / Math.max(0.001, activeCard.balance)) * 100)}%` }}
                              title="Personal Share (#FF9900)"
                            />
                            <div
                              className="h-full bg-[#0071E3] rounded-r-full shadow-[0_0_8px_rgba(0,113,227,0.5)] transition-all duration-500"
                              style={{ width: `${Math.round(((activeCard.messBalance || 0) / Math.max(0.001, activeCard.balance)) * 100)}%` }}
                              title="Mess Split Share (#0071E3)"
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Standard Credit Limit / Settlement Gauge */}
                          <div className="w-full bg-black/60 h-1.5 rounded-full mt-2 overflow-hidden border border-white/5">
                            <div
                              className="h-full rounded-full transition-all duration-500 bg-[#0071E3]"
                              style={{
                                width: `${Math.min(100, (activeCard.balance / Math.max(1, activeCard.creditLimit || 100)) * 100)}%`
                              }}
                            />
                          </div>
                          <div className="flex justify-between items-center text-[9px] text-neutral-400 font-mono mt-1">
                            <span>
                              {activeCard.type === 'MESS'
                                ? `Split in ${activeCard.memberCount || 1} shares`
                                : `Limit: BHD ${Number(activeCard.creditLimit || 30).toFixed(3)}`}
                            </span>
                            <span>
                              {`${Math.round((activeCard.balance / Math.max(1, activeCard.creditLimit || 100)) * 100)}% utilized`}
                            </span>
                          </div>

                          {/* Personal Card Dedicated Deposit Entity Row */}
                          {activeCard.type === 'PERSONAL' && (
                            <div className="flex items-center justify-between text-[10px] font-mono mt-2 pt-1.5 border-t border-white/10">
                              <span className="text-neutral-400 font-medium">Card Security Deposit:</span>
                              <span className={`font-black text-xs uppercase tracking-wider ${
                                activeCard.depositStatus === 'HELD' || activeCard.depositStatus === 'HELD_IN_TRUST'
                                  ? 'text-emerald-400'
                                  : (activeCard.depositStatus === 'IN_CREDIT' || activeCard.depositStatus === 'DEFERRED_CREDIT' || activeCard.depositStatus === 'DEFERRED_PAYDAY' || Number(activeCard.depositInCredit || 0) > 0)
                                    ? 'text-amber-400'
                                    : 'text-slate-400'
                              }`}>
                                {activeCard.depositStatus === 'HELD' || activeCard.depositStatus === 'HELD_IN_TRUST'
                                  ? `Deposited (BD ${Number(activeCard.depositAmount || 0).toFixed(3)})`
                                  : (activeCard.depositStatus === 'IN_CREDIT' || activeCard.depositStatus === 'DEFERRED_CREDIT' || activeCard.depositStatus === 'DEFERRED_PAYDAY' || Number(activeCard.depositInCredit || 0) > 0)
                                    ? `Credit Deposit (BD ${Number(activeCard.depositAmount || 0).toFixed(3)})`
                                    : 'No Deposit'}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Minimalist Optical Carousel Indicator Dots */}
                    {cards.length > 1 && (
                      <div className="flex items-center justify-center gap-1 py-1 select-none" role="tablist" aria-label="Card pagination">
                        {cards.map((c, idx) => {
                          const isActive = activeCardIndex === idx;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (idx !== activeCardIndex) {
                                  handleSlideCard(idx);
                                }
                              }}
                              className="py-2 px-1 flex items-center justify-center transition-all cursor-pointer border-0 bg-transparent group"
                              title={c.title}
                              aria-label={`Go to card ${idx + 1}: ${c.title}`}
                              aria-selected={isActive}
                              role="tab"
                            >
                              <span className={`block w-2 h-2 rounded-full transition-all duration-300 ease-out ${
                                isActive ? 'bg-[#0071E3] shadow-[0_0_8px_#0071E3]' : 'bg-white/25 group-hover:bg-white/45'
                              }`} />
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Front Action Row: Pay Fawri+ Button */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleTriggerPayment(activeCard.balance); }}
                        disabled={paying || activeCard.balance <= 0.0005}
                        className="flex-1 min-h-[42px] px-6 py-2.5 rounded-full font-semibold text-xs sm:text-[13px] tracking-[-0.01em] flex items-center justify-center gap-2 bg-[#0071E3] hover:bg-[#0077ED] active:bg-[#0062C4] active:scale-[0.97] disabled:opacity-50 text-[#FFFAFA] transition-all duration-200 cursor-pointer border-t border-white/25 shadow-[0_4px_16px_rgba(0,113,227,0.38)] hover:shadow-[0_6px_22px_rgba(0,113,227,0.48)]"
                      >
                        <CreditCard className="w-4 h-4 text-[#FFFAFA]" />
                        <span>
                          {paying
                            ? 'Connecting...'
                            : activeCard.balance < -0.0005
                              ? (lang === 'ar' ? 'رصيد إيداع متاح • الحساب مسدد بالكامل' : 'Advance Credit Active • Fully Settled')
                              : (activeCard.type === 'MASTER'
                              ? (lang === 'ar' ? 'سداد المجموع بالكامل • فوري+' : 'Settle Total Balance • Fawri+')
                              : (lang === 'ar' ? 'سداد فوري (Fawri+)' : 'Pay Fawri+'))}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* ═════════════════════════════════════════════════
                      B. BACK FACE: 3D FLIPPED CASHIER QR & BEACON PASS
                      ═════════════════════════════════════════════════ */}
                  <div
                    className="absolute inset-0 w-full h-full flex flex-col justify-between"
                    style={{
                      backfaceVisibility: 'hidden',
                      WebkitBackfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)'
                    }}
                  >
                    {/* Magnetic Credit Hologram Stripe */}
                    <div className="w-full h-8 bg-gradient-to-r from-neutral-900 via-black to-neutral-900 border-y border-white/10 rounded-xl shrink-0 shadow-inner" />

                    {/* Counter Beacon Header & Flip Back Action */}
                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <span className="text-xs font-black text-[#FFFAFA] uppercase tracking-wider block font-mono">
                          {beaconStatus === 'SENT'
                            ? (lang === 'ar' ? 'جاهز للمسح عند الكاشير' : 'COUNTER SCANNER ACTIVE')
                            : (lang === 'ar' ? 'رمز مسح بطاقة الائتمان' : 'OFFICIAL CREDIT QR PASS')}
                        </span>
                        <span className="text-[9px] text-neutral-400 font-mono">
                          Station #01 Ready • Instant 0.1s Scan
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {beaconStatus === 'SENT' && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0071E3]/20 border border-[#0071E3]/40 text-[#0071E3] font-mono text-[10px] font-bold shadow-xs">
                            <Clock className="w-3 h-3 text-[#0071E3] animate-spin" />
                            <span>{counterSecondsLeft}s</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleToggleCardFlip(); }}
                          className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-[#FFFAFA] border border-white/15 flex items-center gap-1.5 text-xs font-bold transition cursor-pointer shadow-xs"
                          title="Flip Back to Balance"
                        >
                          <RotateCw className="w-3.5 h-3.5 text-[#0071E3]" />
                          <span>{lang === 'ar' ? 'الرجوع للرصيد' : 'Flip Back'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Format Toggle Pill: EAN-13 vs Code 128 vs 2D QR Code */}
                    <div className="flex items-center justify-center gap-1 p-1 rounded-xl bg-white/10 backdrop-blur-md mb-2 border border-white/10 max-w-xs mx-auto">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPassFormat('EAN13'); }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black transition cursor-pointer ${
                          passFormat === 'EAN13'
                            ? 'bg-[#0071E3] text-white shadow-md shadow-[#0071E3]/50'
                            : 'text-white/70 hover:text-white'
                        }`}
                      >
                        <BarcodeIcon className="w-3 h-3" />
                        <span>EAN-13</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPassFormat('CODE128'); }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black transition cursor-pointer ${
                          passFormat === 'CODE128'
                            ? 'bg-[#0071E3] text-white shadow-md shadow-[#0071E3]/50'
                            : 'text-white/70 hover:text-white'
                        }`}
                      >
                        <BarcodeIcon className="w-3 h-3" />
                        <span>Code 128</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPassFormat('QR'); }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black transition cursor-pointer ${
                          passFormat === 'QR'
                            ? 'bg-[#0071E3] text-white shadow-md shadow-[#0071E3]/50'
                            : 'text-white/70 hover:text-white'
                        }`}
                      >
                        <QrCode className="w-3 h-3" />
                        <span>2D QR</span>
                      </button>
                    </div>

                    {/* High-Contrast Optical Code Centerpiece - Styled exactly as Layali reference */}
                    <div className="flex flex-col items-center justify-center my-auto py-1">
                      {/* Neon Blue Rounded Badge Container matching user reference */}
                      <div className="w-full max-w-[310px] bg-[#000000] border-[2.5px] border-[#3b82f6] shadow-[0_0_30px_rgba(59,130,246,0.7)] rounded-[22px] p-2.5 flex flex-col items-center">
                        {passFormat === 'EAN13' ? (
                          <div className="w-full bg-white rounded-xl p-2 shadow-sm flex flex-col items-center justify-center">
                            <BarcodeComponent
                              value={customerEan13Code}
                              format="EAN13"
                              width={1.65}
                              height={62}
                              displayValue={true}
                              font="monospace"
                              fontSize={13}
                              margin={8}
                              background="#ffffff"
                              lineColor="#000000"
                            />
                            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider -mt-0.5">
                              Standard Grocery Scanner Gun Pass
                            </span>
                          </div>
                        ) : passFormat === 'CODE128' ? (
                          <div className="w-full bg-white rounded-xl p-2 shadow-sm flex flex-col items-center justify-center">
                            <BarcodeComponent
                              value={customerBarcodeCode}
                              format="CODE128"
                              width={1.5}
                              height={62}
                              displayValue={true}
                              font="monospace"
                              fontSize={13}
                              margin={8}
                              background="#ffffff"
                              lineColor="#000000"
                            />
                            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider -mt-0.5">
                              Code 128 Card Pass
                            </span>
                          </div>
                        ) : (
                          <div className="bg-white rounded-xl p-2 shadow-sm">
                            <QRCodeSVG
                              value={`https://askar-khata-pwa.vercel.app/tab/${encodeURIComponent(ledger?.id || customerId)}`}
                              size={145}
                              level="M"
                              fgColor="#000000"
                              bgColor="#ffffff"
                              includeMargin={true}
                            />
                          </div>
                        )}
                      </div>

                      {/* LAYALI Bold Modern Typography directly under badge */}
                      <span className="text-base font-black text-white tracking-[0.25em] font-sans mt-2">
                        LAYALI
                      </span>

                      {/* "I AM AT THE COUNTER" BEACON ACTION BUTTON RIGHT NEAR THE QR CODE */}
                      <div className="w-full max-w-xs mt-2 px-1">
                        {beaconStatus !== 'SENT' ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleAnnounceAtCounter(); }}
                            disabled={beaconStatus === 'SENDING'}
                            className="w-full py-2.5 px-3 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] active:scale-95 text-[#FFFAFA] font-black text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-[#0071E3]/35 cursor-pointer disabled:opacity-50 border-t border-white/20"
                            title="Alert Layali Cashier Counter"
                          >
                            <Zap className="w-4 h-4 text-amber-300 fill-amber-300 shrink-0" />
                            <span>
                              {beaconStatus === 'SENDING'
                                ? t.atCounterSending
                                : t.atCounterBtn}
                            </span>
                          </button>
                        ) : (
                          <div className="w-full flex items-center justify-between gap-2 bg-[#0071E3]/25 border border-[#0071E3]/50 rounded-xl px-3 py-2 shadow-md">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-[#0071E3] animate-ping shrink-0" />
                              <span className="text-xs font-black text-[#0071E3] font-mono">
                                {lang === 'ar' ? `● نشط عند الكاشير: ${counterSecondsLeft}ث` : `● Active at POS: ${counterSecondsLeft}s`}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setBeaconStatus('IDLE'); }}
                              className="py-1 px-2.5 rounded-lg bg-[#0071E3] hover:bg-[#0077ED] text-[#FFFAFA] font-bold text-[10px] flex items-center gap-1 transition active:scale-95 cursor-pointer shadow-xs"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Done</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 3. Peeking Next Card (Right Edge - Essential Swipe Signifier) */}
            {hasNext && nextCard && (
              <div
                onClick={(e) => { e.stopPropagation(); handleSlideCard('NEXT'); }}
                className="absolute right-0 top-0 bottom-0 rounded-l-[28px] sm:rounded-l-[32px] border-y border-l bg-gradient-to-b cursor-pointer z-30 shadow-2xl flex items-center justify-center group active:scale-95 transition-all duration-300 ease-out overflow-hidden"
                style={{
                  width: cardDragX < 0 ? `${Math.min(38, 22 + Math.abs(cardDragX) * 0.25)}px` : '22px',
                  transform: cardDragX < 0 ? `scale(${Math.min(1.04, 1 + Math.abs(cardDragX) * 0.001)})` : 'scale(1)',
                  background: 'linear-gradient(to bottom, #1C1C1C, #0D0D0D)',
                  borderColor: 'rgba(0,113,227,0.3)',
                  boxShadow: '-10px 0 30px rgba(0,0,0,0.85), 0 10px 25px rgba(0,113,227,0.22), inset 1px 0 1px rgba(255,255,255,0.25)'
                }}
                title={`Swipe to ${nextCard.title}`}
              >
                <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-white/40 via-white/10 to-transparent pointer-events-none" />
                <div className="w-1 h-12 rounded-full bg-white/40 group-hover:bg-white/70 transition shadow-xs" />
              </div>
            )}
          </div>

          {/* Flip Back to Balance Button under Card when Flipped */}
          {isCardFlipped && (
            <div className="pt-2 pb-0.5 px-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleToggleCardFlip(); }}
                className="w-full py-2.5 px-4 rounded-full bg-white/10 hover:bg-white/20 active:scale-[0.98] text-[#FFFAFA] font-bold text-xs flex items-center justify-center gap-2 border border-white/15 transition cursor-pointer shadow-lg hover:border-[#0071E3]/50"
              >
                <RotateCw className="w-3.5 h-3.5 text-[#0071E3]" />
                <span>{lang === 'ar' ? 'الرجوع إلى الرصيد' : 'Flip Back to Balance'}</span>
              </button>
            </div>
          )}

          {/* Monthly Cycle Transparency Card: Eliminates confusion on brought-forward balances */}
          {ledger?.cycleBreakdown && (ledger.cycleBreakdown.hasPriorCarryOver || (ledger.cycleBreakdown.priorCycleBalance && Math.abs(ledger.cycleBreakdown.priorCycleBalance) > 0.001)) && (
            <div className="rounded-3xl bg-[#141414] border border-amber-500/30 p-4 space-y-2.5 shadow-xl">
              <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                <span className="flex items-center gap-1.5">
                  <span>📌</span>
                  <span>{lang === 'ar' ? 'تفصيل الدورة الشهرية' : 'Monthly Cycle Breakdown'}</span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30 font-medium">
                    {lang === 'ar' ? 'رصيد مرحل' : 'Brought Forward'}
                  </span>
                </span>
                <span className="text-[10px] text-neutral-400 font-mono">
                  {ledger.cycleBreakdown.currentMonthLabel}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-0.5 text-center font-mono">
                <div className="bg-black/50 p-2.5 rounded-2xl border border-white/5">
                  <div className="text-[10px] text-neutral-400 font-sans font-medium">
                    {lang === 'ar' ? 'الشهر السابق' : 'Prior Month (B/F)'}
                  </div>
                  <div className="text-xs font-black text-amber-400 mt-1">
                    BD {Number(ledger.cycleBreakdown.priorCycleBalance || 0).toFixed(3)}
                  </div>
                  <div className="text-[9px] text-neutral-500 font-sans mt-0.5">
                    {ledger.cycleBreakdown.priorMonthLabel}
                  </div>
                </div>
                <div className="bg-black/50 p-2.5 rounded-2xl border border-white/5">
                  <div className="text-[10px] text-neutral-400 font-sans font-medium">
                    {lang === 'ar' ? 'مشتريات الشهر' : 'This Month Spent'}
                  </div>
                  <div className="text-xs font-black text-rose-400 mt-1">
                    +BD {Number(ledger.cycleBreakdown.currentMonthPurchases || 0).toFixed(3)}
                  </div>
                  <div className="text-[9px] text-neutral-500 font-sans mt-0.5">
                    {lang === 'ar' ? 'مشتريات' : 'Purchases'}
                  </div>
                </div>
                <div className="bg-black/50 p-2.5 rounded-2xl border border-white/5">
                  <div className="text-[10px] text-neutral-400 font-sans font-medium">
                    {lang === 'ar' ? 'إجمالي المستحق' : 'Total Outstanding'}
                  </div>
                  <div className="text-xs font-black text-emerald-400 mt-1">
                    BD {Number(ledger.cycleBreakdown.currentBalance ?? activeCard.balance).toFixed(3)}
                  </div>
                  <div className="text-[9px] text-neutral-500 font-sans mt-0.5">
                    {lang === 'ar' ? 'الحساب الشامل' : 'Consolidated'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              4. GOOGLE PAY RECENT ACTIVITY (10 ITEMS DIRECTLY BELOW)
              ───────────────────────────────────────────────────────────── */}
          <section className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between px-1">
              <div>
                <h4 className="text-sm font-bold text-white tracking-tight">
                  {t.recentPurchases}
                </h4>
                <span className="text-[10px] text-neutral-400 font-medium">
                  Latest 10 transactions • {activeCard.title}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubView('ALL_TRANSACTIONS')}
                className="text-xs font-bold text-[#0071E3] hover:text-[#47a3ff] flex items-center gap-0.5 cursor-pointer active:scale-95 transition"
              >
                <span>See all</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Inset List Card */}
            <div className="rounded-3xl bg-[#141414] border border-white/10 divide-y divide-white/[0.06] overflow-hidden shadow-xl">
              {recent10Tx.length > 0 ? (
                recent10Tx.map((tx) => {
                  const isDeferredDeposit = tx.subledger_type === 'DEPOSIT_DEFERRED' || tx.type === 'DEPOSIT_DEFERRED' || (tx.reference && tx.reference.toLowerCase().includes('card security deposit'));
                  const isDepositHeld = tx.type === 'CARD_DEPOSIT' || tx.type === 'DEPOSIT_COLLECTED' || tx.subledger_type === 'DEPOSIT';
                  const isDeposit = isDeferredDeposit || isDepositHeld;
                  const isPurchase = !isDeposit && (tx.type === 'PURCHASE' || tx.type === 'CHARGE');
                  const isMessSplit = !isDeposit && Boolean(
                    tx.subledger_type === 'MESS_SHARE' ||
                    tx.mess_id || 
                    tx.is_mess_split ||
                    tx.group_total ||
                    (tx.reference && tx.reference.toLowerCase().includes('mess split'))
                  );
                  const fullBasketBill = Number(tx.bill_total || tx.group_total || tx.amount || 0);
                  const memberShareBill = Number(tx.split_share !== null && tx.split_share !== undefined ? tx.split_share : tx.amount || 0);

                  const { date, time } = formatTxDate(tx.timestamp || tx.created_at, lang);
                  const depositAmountVal = Number(tx.displayAmount ?? tx.depositAmount ?? (Number(tx.amount) > 0 ? tx.amount : null) ?? ledger?.card_deposit_amount ?? 3.0).toFixed(3);
                  return (
                    <div
                      key={tx.id || tx.invoiceNo}
                      onClick={() => setSelectedReceipt(tx)}
                      className="p-3.5 hover:bg-white/[0.04] active:bg-white/[0.08] transition cursor-pointer flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${
                          isDeferredDeposit 
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' 
                            : isDepositHeld
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                              : isPurchase 
                                ? (isMessSplit ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40' : 'bg-[#0071E3]/20 text-[#0071E3] border-[#0071E3]/40')
                                : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        }`}>
                          {isDeposit ? <ShieldCheck className="w-4 h-4" /> : isPurchase ? (isMessSplit ? <Users className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />) : <CreditCard className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                            <span>
                              {isDeferredDeposit 
                                ? (lang === 'ar' ? 'تأمين بطاقة الائتمان (مؤجل ليوم الراتب)' : 'Card Security Deposit (Payable on Payday)')
                                : isDepositHeld
                                  ? (lang === 'ar' ? 'تأمين البطاقة في صندوق الأمانات' : 'Card Security Deposit (Held in Trust)')
                                  : (tx.reference || tx.invoiceNo || (isPurchase ? 'Store Purchase' : 'Fawri+ Payment'))}
                            </span>
                            {isMessSplit && (
                              <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-500/20 px-1.5 py-0.2 rounded border border-indigo-500/30 shrink-0">
                                🥘 {tx.messName || 'Mess'} {tx.member_count ? `(1/${tx.member_count})` : ''}
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] text-neutral-400 block font-mono">
                            {isDeferredDeposit
                              ? `${date} - Due on ${ledger?.payday_day_of_month || 28}th Payday`
                              : isDepositHeld
                                ? `${date} - Refundable upon card return`
                                : `${date} - ${time}`}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {isMessSplit && fullBasketBill > memberShareBill ? (
                          <>
                            <span className="text-xs font-black font-mono block text-amber-400">
                              +BD {memberShareBill.toFixed(3)}
                            </span>
                            <span className="text-[9px] text-neutral-400 font-mono block">
                              ({(tx.member_count || Math.round(fullBasketBill / Math.max(0.001, memberShareBill))) > 1 ? `1/${tx.member_count || Math.round(fullBasketBill / Math.max(0.001, memberShareBill))} of ` : ''}BD {fullBasketBill.toFixed(3)})
                            </span>
                          </>
                        ) : (
                          <span className={`text-xs font-black font-mono block ${
                            isDeferredDeposit 
                              ? 'text-amber-400' 
                              : isDepositHeld 
                                ? 'text-emerald-400' 
                                : isPurchase 
                                  ? 'text-white' 
                                  : 'text-emerald-400'
                          }`}>
                            {isDeposit ? `BD ${depositAmountVal}` : `${isPurchase ? '' : '-'}BD ${Number(tx.amount || 0).toFixed(3)}`}
                          </span>
                        )}
                        <span className="text-[9px] text-neutral-500 font-mono">
                          Bal: BD {Number(tx.runningBalance ?? tx.running_balance ?? 0).toFixed(3)}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-neutral-400 text-xs">
                  {t.noTxFound}
                </div>
              )}
            </div>
          </section>

          {/* Footer Store Tag */}
          <footer className="py-2 text-center text-neutral-600 text-[10px] font-mono">
            Layali Supermarket • Block 951 Askar • CR: 12345-1
          </footer>
        </main>
      )}

      {/* ─────────────────────────────────────────────────────────────
          5. HAMBURGER SLIDE-OUT DRAWER (0ms GPU Motion, bg-black/80)
          ───────────────────────────────────────────────────────────── */}
      <div
        className={`fixed inset-0 z-50 flex transition-all duration-200 ${
          isDrawerOpen ? 'pointer-events-auto visible opacity-100' : 'pointer-events-none invisible opacity-0'
        }`}
        aria-hidden={!isDrawerOpen}
      >
        {/* Backdrop (Dark Overlay, No Heavy Blur Filter to Avoid WebKit Stall) */}
        <div
          onClick={() => setIsDrawerOpen(false)}
          onPointerDown={() => setIsDrawerOpen(false)}
          className={`fixed inset-0 bg-black/80 transition-opacity duration-200 ease-out ${
            isDrawerOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Drawer Sheet */}
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          className={`relative w-[85%] max-w-[340px] h-full bg-[#121214] border-r border-white/10 z-50 flex flex-col justify-between p-5 shadow-2xl overflow-y-auto transition-transform duration-200 ease-out transform ${
            isDrawerOpen ? 'translate-x-0' : (isRtl ? 'translate-x-full' : '-translate-x-full')
          }`}
          style={{ willChange: 'transform' }}
        >
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#0071E3]/20 border border-[#0071E3]/40 flex items-center justify-center text-[#0071E3]">
                  <Store className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white font-mono uppercase">LAYALI SUPERMARKET</h3>
                  <p className="text-[10px] text-neutral-400">CR: 12345-1 • NBR VAT: 200000000000002</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="p-1 rounded-xl bg-white/10 text-neutral-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 🌟 1. PAY WITHOUT CARD (COUNTER PASS) BUTTON (User Request) */}
            <button
              type="button"
              onClick={() => {
                setIsDrawerOpen(false);
                setShowCounterPass(true);
              }}
              className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-blue-900/40 via-blue-800/30 to-blue-900/40 hover:from-blue-800/50 hover:to-blue-700/50 border-2 border-blue-500/60 shadow-[0_0_20px_rgba(43,130,246,0.35)] flex items-center justify-between text-left transition cursor-pointer active:scale-95"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/50 flex items-center justify-center text-blue-400 shrink-0">
                  <QrCode className="w-5 h-5 text-blue-300" />
                </div>
                <div>
                  <span className="text-xs font-black text-white block">
                    {t.counterPassTitle}
                  </span>
                  <span className="text-[10px] text-blue-300 font-mono block">
                    Instant 0.1s Barcode Gun Scan
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold bg-blue-500 text-white px-2 py-0.5 rounded-full uppercase">
                OPEN
              </span>
            </button>

            {/* Card Security Suite: Freeze Toggle */}
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400 block">
                Card & Account Security
              </span>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${activeCard.isFrozen ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    {activeCard.isFrozen ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">
                      {activeCard.isFrozen ? 'Card is Frozen' : 'Card is Active'}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono block">
                      {activeCard.title}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleFreeze}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer border ${
                    activeCard.isFrozen
                      ? 'bg-rose-500 text-white border-rose-400'
                      : 'bg-white/10 hover:bg-white/20 text-neutral-200 border-white/15'
                  }`}
                >
                  {activeCard.isFrozen ? 'Unfreeze' : 'Freeze'}
                </button>
              </div>
            </div>

            {/* Card Security Deposit (Independent Entity) */}
            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`w-4 h-4 ${
                    ledger?.card_deposit_status === 'HELD' || ledger?.card_deposit_status === 'HELD_IN_TRUST' 
                      ? 'text-emerald-400' 
                      : (ledger?.card_deposit_status === 'IN_CREDIT' || ledger?.card_deposit_status === 'DEFERRED_CREDIT' || ledger?.card_deposit_status === 'DEFERRED_PAYDAY' || Number(ledger?.depositInCredit || 0) > 0)
                        ? 'text-rose-400' 
                        : 'text-slate-400'
                  }`} />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-300">
                    {lang === 'ar' ? 'تأمين البطاقة الذكية' : 'Card Security Deposit'}
                  </span>
                </div>
                <span className={`text-xs font-black uppercase tracking-wider ${
                  ledger?.card_deposit_status === 'HELD' || ledger?.card_deposit_status === 'HELD_IN_TRUST'
                    ? 'text-emerald-400' 
                    : (ledger?.card_deposit_status === 'IN_CREDIT' || ledger?.card_deposit_status === 'DEFERRED_CREDIT' || ledger?.card_deposit_status === 'DEFERRED_PAYDAY' || Number(ledger?.depositInCredit || 0) > 0)
                      ? 'text-amber-400'
                      : 'text-slate-400'
                }`}>
                  {ledger?.card_deposit_status === 'HELD' || ledger?.card_deposit_status === 'HELD_IN_TRUST'
                    ? 'Deposited' 
                    : (ledger?.card_deposit_status === 'IN_CREDIT' || ledger?.card_deposit_status === 'DEFERRED_CREDIT' || ledger?.card_deposit_status === 'DEFERRED_PAYDAY' || Number(ledger?.depositInCredit || 0) > 0)
                      ? 'Credit Deposit'
                      : 'No Deposit'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs pt-0.5">
                <span className="text-neutral-400 font-medium">
                  {lang === 'ar' ? 'مبلغ التأمين' : 'Deposit Amount'}:
                </span>
                <span className="font-mono font-bold text-white">
                  BD {Number(ledger?.card_deposit_amount || 0).toFixed(3)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-neutral-400">
                <span>{lang === 'ar' ? 'حالة السداد والراتب' : 'Deposit Settlement'}:</span>
                <span className={`font-mono font-bold ${
                  ledger?.card_deposit_status === 'HELD' || ledger?.card_deposit_status === 'HELD_IN_TRUST' 
                    ? 'text-emerald-300' 
                    : (ledger?.card_deposit_status === 'IN_CREDIT' || ledger?.card_deposit_status === 'DEFERRED_CREDIT' || ledger?.card_deposit_status === 'DEFERRED_PAYDAY' || Number(ledger?.depositInCredit || 0) > 0)
                      ? 'text-amber-300' 
                      : 'text-slate-400'
                }`}>
                  {ledger?.card_deposit_status === 'HELD' || ledger?.card_deposit_status === 'HELD_IN_TRUST'
                    ? (lang === 'ar' ? 'محفوظ كأمانة مستردة' : 'Paid (Custodial Collateral)')
                    : (ledger?.card_deposit_status === 'IN_CREDIT' || ledger?.card_deposit_status === 'DEFERRED_CREDIT' || ledger?.card_deposit_status === 'DEFERRED_PAYDAY' || Number(ledger?.depositInCredit || 0) > 0)
                      ? (lang === 'ar' ? `مستحق في يوم الراتب (${ledger?.payday_day_of_month || 28})` : `Due on ${ledger?.payday_day_of_month || 28}th Payday`)
                      : (lang === 'ar' ? 'لا يوجد تأمين مسجل' : 'No Deposit Recorded')}
                </span>
              </div>
              <p className="text-[10px] text-neutral-400 leading-tight pt-1 border-t border-white/5">
                {ledger?.card_deposit_status === 'HELD' || ledger?.card_deposit_status === 'HELD_IN_TRUST'
                  ? (lang === 'ar' ? 'مبلغ التأمين محفوظ كأمانة ومسترد بالكامل عند إعادة البطاقة بحالة سليمة.' : 'Deposit is safely held in custodial trust and fully refunded upon card return.')
                  : (ledger?.card_deposit_status === 'IN_CREDIT' || ledger?.card_deposit_status === 'DEFERRED_CREDIT' || ledger?.card_deposit_status === 'DEFERRED_PAYDAY' || Number(ledger?.depositInCredit || 0) > 0)
                    ? (lang === 'ar' ? 'تم قيد التأمين بالدين بشكل منفصل عن المشتريات ومستحق التحصيل في يوم الراتب.' : 'Deposit is recorded as an isolated card liability, payable separately or with your credit account.')
                    : (lang === 'ar' ? 'لا يوجد رصيد تأمين مقيد على هذا الحساب.' : 'No card security deposit is held or owed on this customer account.')
                }
              </p>
            </div>

            {/* 🔔 LIVE TRANSACTION NOTIFICATIONS & ALERT TOGGLE (User Request) */}
            <div className={`p-3.5 rounded-2xl border transition-all ${
              isNotifEnabled 
                ? 'bg-gradient-to-r from-emerald-950/40 via-emerald-900/20 to-emerald-950/40 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                : 'bg-white/[0.03] border-white/10'
            }`}>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition ${
                    isNotifEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm' : 'bg-white/10 text-neutral-400'
                  }`}>
                    {isNotifEnabled ? <BellRing className="w-4 h-4 animate-pulse" /> : <BellOff className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-white block">
                        {t.notifTitle}
                      </span>
                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full uppercase ${
                        isNotifEnabled ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40' : 'bg-neutral-800 text-neutral-400'
                      }`}>
                        {isNotifEnabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <span className="text-[10px] text-neutral-400 font-medium block">
                      {isNotifEnabled ? t.notifSubtitleActive : t.notifSubtitleOff}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  id="toggle-notifications-btn"
                  onClick={handleToggleNotifications}
                  className={`col-span-3 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 border ${
                    isNotifEnabled
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-white border-emerald-400 shadow-md'
                      : 'bg-white/10 hover:bg-white/20 text-neutral-200 border-white/15'
                  }`}
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>{isNotifEnabled ? t.notifTurnOff : t.notifTurnOn}</span>
                </button>
                <button
                  type="button"
                  id="test-notifications-btn"
                  onClick={handleTestLiveAlert}
                  className="col-span-2 py-2 px-2.5 rounded-xl font-bold text-xs bg-white/[0.07] hover:bg-white/[0.14] text-neutral-200 border border-white/15 flex items-center justify-center gap-1 transition cursor-pointer active:scale-95"
                  title="Test live purchase alert sound, vibration & toast"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t.notifTest}</span>
                </button>
              </div>
            </div>

            {/* Official Tax Statement Modal Launcher */}
            <button
              type="button"
              onClick={() => {
                setIsDrawerOpen(false);
                setShowStatementModal(true);
              }}
              className="w-full p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-between text-xs transition cursor-pointer text-white"
            >
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#0071E3]" />
                <span className="font-semibold">{t.viewStatement}</span>
              </span>
              <Printer className="w-3.5 h-3.5 text-neutral-400" />
            </button>

            {/* Share WhatsApp Statement */}
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="w-full p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-between text-xs transition cursor-pointer text-white"
            >
              <span className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold">{t.shareWhatsapp}</span>
              </span>
              <Share2 className="w-3.5 h-3.5 text-neutral-400" />
            </button>

            {/* Language Preferences */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400 px-1">
                Language
              </span>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10">
                {['en', 'ar', 'ml'].map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setLang(code)}
                    className={`py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      lang === code ? 'bg-[#0071E3] text-white shadow-xs' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {code === 'en' ? 'English' : code === 'ar' ? 'العربية' : 'മലയാളം'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Drawer Support Footer */}
          <div className="pt-4 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <a
                href={`tel:${STORE_PHONE}`}
                className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-semibold flex items-center justify-center gap-1.5 border border-white/10 transition"
              >
                <PhoneCall className="w-3.5 h-3.5 text-[#0071E3]" />
                <span>Call Store</span>
              </a>
              <a
                href={`https://wa.me/${STORE_WHATSAPP}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5 border border-emerald-500/30 transition"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          6. LAYALI COUNTER PASS MODAL (PAY WITHOUT CARD REFERENCE)
          ───────────────────────────────────────────────────────────── */}
      {showCounterPass && (
        <div 
          style={{ paddingTop: 'max(16px, calc(env(safe-area-inset-top, 0px) + 16px))' }}
          className="fixed inset-0 z-[10000] bg-black/95 flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="w-full max-w-sm flex flex-col items-center">
            {/* Close button */}
            <div className="w-full flex justify-end mb-4">
              <button
                type="button"
                onClick={() => setShowCounterPass(false)}
                className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 text-neutral-400 hover:text-white flex items-center justify-center cursor-pointer active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Format Toggle Pill: EAN-13 vs Code 128 vs QR Code */}
            <div className="w-full flex items-center justify-center gap-1.5 p-1.5 rounded-2xl bg-slate-900 border border-slate-800 mb-4">
              <button
                type="button"
                onClick={() => setPassFormat('EAN13')}
                className={`flex-1 flex items-center justify-center gap-1 py-2 px-2 rounded-xl text-xs font-black transition cursor-pointer ${
                  passFormat === 'EAN13'
                    ? 'bg-[#0071E3] text-white shadow-lg shadow-[#0071E3]/50'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <BarcodeIcon className="w-3.5 h-3.5" />
                <span>EAN-13</span>
              </button>
              <button
                type="button"
                onClick={() => setPassFormat('CODE128')}
                className={`flex-1 flex items-center justify-center gap-1 py-2 px-2 rounded-xl text-xs font-black transition cursor-pointer ${
                  passFormat === 'CODE128'
                    ? 'bg-[#0071E3] text-white shadow-lg shadow-[#0071E3]/50'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <BarcodeIcon className="w-3.5 h-3.5" />
                <span>Code 128</span>
              </button>
              <button
                type="button"
                onClick={() => setPassFormat('QR')}
                className={`flex-1 flex items-center justify-center gap-1 py-2 px-2 rounded-xl text-xs font-black transition cursor-pointer ${
                  passFormat === 'QR'
                    ? 'bg-[#0071E3] text-white shadow-lg shadow-[#0071E3]/50'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>2D QR</span>
              </button>
            </div>

            {/* Styled Layali Badge Container (Matches User Uploaded Reference) */}
            <div className="w-full bg-[#000000] border-[3px] border-[#3b82f6] shadow-[0_0_45px_rgba(59,130,246,0.65)] rounded-[32px] p-6 flex flex-col items-center">
              {passFormat === 'EAN13' ? (
                <div className="w-full bg-white rounded-2xl p-4 flex flex-col items-center justify-center shadow-lg">
                  <BarcodeComponent
                    value={customerEan13Code}
                    format="EAN13"
                    width={1.8}
                    height={90}
                    displayValue={true}
                    font="monospace"
                    fontSize={16}
                    margin={12}
                    background="#ffffff"
                    lineColor="#000000"
                  />
                  <div className="mt-2 text-center">
                    <span className="text-[11px] font-bold text-slate-700 tracking-wider uppercase block">
                      ⚡ Standard Grocery 1D Laser & 2D Scanner Gun Pass
                    </span>
                  </div>
                </div>
              ) : passFormat === 'CODE128' ? (
                <div className="w-full bg-white rounded-2xl p-4 flex flex-col items-center justify-center shadow-lg">
                  <BarcodeComponent
                    value={customerBarcodeCode}
                    format="CODE128"
                    width={1.6}
                    height={90}
                    displayValue={true}
                    font="monospace"
                    fontSize={16}
                    margin={12}
                    background="#ffffff"
                    lineColor="#000000"
                  />
                  <div className="mt-2 text-center">
                    <span className="text-[11px] font-bold text-slate-700 tracking-wider uppercase block">
                      ⚡ Code 128 Alphanumeric Scanner Pass
                    </span>
                  </div>
                </div>
              ) : (
                <div className="w-full aspect-square max-w-[270px] bg-white rounded-2xl p-3 flex items-center justify-center shadow-lg">
                  <QRCodeSVG
                    value={`https://askar-khata-pwa.vercel.app/tab/${encodeURIComponent(ledger?.id || customerId)}`}
                    size={240}
                    level="M"
                    fgColor="#000000"
                    bgColor="#ffffff"
                    includeMargin={true}
                  />
                </div>
              )}

              {/* Bold LAYALI Modern Typography */}
              <div className="mt-5 text-center">
                <h2 className="text-3xl sm:text-4xl font-black text-white tracking-[0.25em] font-sans">
                  LAYALI
                </h2>
                <span className="text-[11px] text-blue-400 font-mono tracking-widest uppercase block mt-1 font-semibold">
                  {passFormat === 'EAN13' ? 'EAN-13 Supermarket Gun Pass' : passFormat === 'CODE128' ? 'Code 128 Alphanumeric Pass' : 'Official Counter Pass • Pay Without Card'}
                </span>
              </div>
            </div>

            {/* Zero-Scan Instant Alternative Hint */}
            <div className="w-full mt-3 bg-gradient-to-r from-amber-500/10 via-amber-500/15 to-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-center">
              <span className="text-[11px] text-amber-200 font-semibold block">
                💡 Laser guns reflect off screen glass?
              </span>
              <span className="text-[10px] text-amber-300/80 block mt-0.5">
                Tap <strong>"I AM AT THE COUNTER"</strong> below to instantly alert the POS with zero scanning!
              </span>
            </div>

            {/* Cashier Beacon Action */}
            <div className="w-full mt-5 space-y-2.5">
              {beaconStatus !== 'SENT' ? (
                <button
                  type="button"
                  onClick={handleAnnounceAtCounter}
                  disabled={beaconStatus === 'SENDING'}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-75 text-white font-black rounded-2xl text-xs uppercase tracking-wider transition cursor-pointer shadow-lg shadow-blue-950 flex items-center justify-center gap-2"
                >
                  {beaconStatus === 'SENDING' ? (
                    <span>{t.atCounterSending}</span>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 text-amber-300 fill-amber-300 shrink-0" />
                      <span>{t.atCounterBtn}</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="w-full bg-blue-950/60 border-2 border-blue-500 rounded-2xl p-3 flex items-center justify-between shadow-lg shadow-blue-950">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping shrink-0" />
                    <div>
                      <span className="text-xs font-black text-white block">
                        {lang === 'ar' ? `● تم إشعار الكاشير: ${counterSecondsLeft}ث` : `● Cashier Notified: ${counterSecondsLeft}s`}
                      </span>
                      <span className="text-[10px] text-blue-300 font-mono block">
                        POS Station #01 Active
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBeaconStatus('IDLE')}
                    className="py-1 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1 active:scale-95 cursor-pointer shrink-0"
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Done</span>
                  </button>
                </div>
              )}
              <p className="text-center text-[11px] text-neutral-400 leading-relaxed px-2">
                {t.counterPassDesc}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          7. OFFICIAL BAHRAIN TAX STATEMENT MODAL (10% VAT PRINT READY)
          ───────────────────────────────────────────────────────────── */}
      {showStatementModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#121214] border border-white/15 rounded-[32px] p-6 max-w-md w-full space-y-4 shadow-2xl animate-in zoom-in-95 text-white max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#0071E3]/20 border border-[#0071E3]/40 flex items-center justify-center text-[#0071E3]">
                  <Store className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white font-mono uppercase">
                    LAYALI AL-KHARIF SUPERMARKET W.L.L.
                  </h3>
                  <p className="text-[10px] text-neutral-400 font-mono">
                    CR: 12345-1 • NBR VAT TIN: 200000000000002
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStatementModal(false)}
                className="p-1 rounded-xl bg-white/10 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Patron CPR & Card Info */}
            <div className="p-3 rounded-2xl bg-black/40 border border-white/5 grid grid-cols-2 gap-2 text-xs font-mono">
              <div>
                <span className="text-[10px] text-neutral-400 block">PATRON NAME:</span>
                <span className="font-bold text-white block truncate">{ledger.name}</span>
                <span className="text-[10px] text-neutral-400 block mt-1">CPR NUMBER:</span>
                <span className="text-white font-bold">{ledger.cpr || '—'}</span>
              </div>
              <div>
                <span className="text-[10px] text-neutral-400 block">ACCOUNT/CARD:</span>
                <span className="font-bold text-[#0071E3] block truncate">{activeCard.title}</span>
                <span className="text-[10px] text-neutral-400 block mt-1">DATE:</span>
                <span className="text-white">{new Date().toLocaleDateString('en-GB')}</span>
              </div>
            </div>

            {/* 10% VAT Breakdown */}
            <div className="space-y-1.5 p-3 rounded-2xl bg-white/[0.03] border border-white/10 font-mono text-xs">
              <div className="flex justify-between text-neutral-400">
                <span>Net Total (Excl. VAT):</span>
                <span className="text-white font-bold">BHD {(Number(activeCard.balance || 0) / 1.10).toFixed(3)}</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Bahrain VAT (10%):</span>
                <span className="text-[#0071E3] font-bold">BHD {(Number(activeCard.balance || 0) - (Number(activeCard.balance || 0) / 1.10)).toFixed(3)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm pt-2 border-t border-white/10 text-white">
                <span>Total Balance Payable:</span>
                <span className="text-[#0071E3]">BHD {Number(activeCard.balance || 0).toFixed(3)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-3 bg-[#0071E3] hover:bg-[#0077ED] text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md active:scale-95"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print / Save PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setShowStatementModal(false)}
                className="py-3 px-5 bg-white/10 text-white font-bold rounded-xl text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          8. ITEMIZED RECEIPT MODAL
          ───────────────────────────────────────────────────────────── */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#121214] border border-white/15 rounded-[32px] p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95 text-white max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-white/10">
              <div>
                <span className="text-xs font-black tracking-wider uppercase font-mono block text-[#0071E3]">
                  LAYALI SUPERMARKET
                </span>
                <h3 className="text-sm font-bold text-white font-mono">
                  Invoice #{selectedReceipt.invoiceNo || selectedReceipt.reference || 'INV'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="p-1 rounded-xl bg-white/10 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const isDep = selectedReceipt.subledger_type === 'DEPOSIT_DEFERRED' || 
                            selectedReceipt.type === 'DEPOSIT_DEFERRED' || 
                            selectedReceipt.type === 'CARD_DEPOSIT' || 
                            selectedReceipt.type === 'DEPOSIT_COLLECTED' || 
                            selectedReceipt.subledger_type === 'DEPOSIT' ||
                            (selectedReceipt.reference && selectedReceipt.reference.toLowerCase().includes('card security deposit'));
              const isDepDef = selectedReceipt.subledger_type === 'DEPOSIT_DEFERRED' || selectedReceipt.type === 'DEPOSIT_DEFERRED' || (selectedReceipt.reference && selectedReceipt.reference.toLowerCase().includes('payday'));
              const isMessSplit = !isDep && Boolean(
                selectedReceipt.subledger_type === 'MESS_SHARE' ||
                selectedReceipt.mess_id || 
                selectedReceipt.is_mess_split ||
                selectedReceipt.group_total ||
                (selectedReceipt.reference && selectedReceipt.reference.toLowerCase().includes('mess split'))
              );
              const fullBasketBill = Number(selectedReceipt.bill_total || selectedReceipt.group_total || selectedReceipt.amount || 0);
              const memberShareBill = Number(selectedReceipt.split_share !== null && selectedReceipt.split_share !== undefined ? selectedReceipt.split_share : selectedReceipt.amount || 0);
              const memberCount = selectedReceipt.member_count || 1;
              const shopper = selectedReceipt.shopper_name || selectedReceipt.shopperName || null;

              const billedAmt = isDep
                ? Number(selectedReceipt.displayAmount ?? selectedReceipt.depositAmount ?? (Number(selectedReceipt.amount) > 0 ? selectedReceipt.amount : null) ?? ledger?.card_deposit_amount ?? 3.0).toFixed(3)
                : Number(selectedReceipt.amount || 0).toFixed(3);

              return (
                <>
                  {/* Mess Split Highlight Banner */}
                  {isMessSplit && (
                    <div className="p-3 rounded-2xl bg-indigo-950/60 border border-indigo-500/40 text-xs font-mono space-y-1.5 text-left">
                      <div className="flex items-center justify-between text-indigo-200 font-bold">
                        <span className="flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-indigo-400" />
                          <span>Room Mess: {selectedReceipt.messName || 'Shared Mess'}</span>
                        </span>
                        <span className="text-[10px] bg-indigo-500/30 px-2 py-0.5 rounded text-indigo-200 font-bold">
                          {memberCount} Room Members
                        </span>
                      </div>
                      {shopper && (
                        <p className="text-[11px] text-indigo-300 font-sans">
                          Counter Shopper: <strong className="text-white">{shopper}</strong>
                        </p>
                      )}
                      <div className="pt-1.5 border-t border-indigo-500/30 flex items-center justify-between text-xs">
                        <span className="text-slate-300">Total Kitchen Basket:</span>
                        <span className="text-white font-black text-sm">BD {fullBasketBill.toFixed(3)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-bold text-amber-300 bg-indigo-900/40 p-2 rounded-xl">
                        <span>Added to Your Balance:</span>
                        <span className="text-emerald-400 font-mono text-sm">+BD {memberShareBill.toFixed(3)}</span>
                      </div>
                    </div>
                  )}

                  {/* Date & Amount */}
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-black/40 border border-white/5 font-mono text-xs">
                    <span className="text-neutral-400">
                      {isDep ? 'Security Deposit:' : isMessSplit ? 'Your Share Billed:' : 'Total Billed:'}
                    </span>
                    <span className={`text-base font-black ${isDep ? (isDepDef ? 'text-amber-400' : 'text-emerald-400') : isMessSplit ? 'text-amber-400' : 'text-white'}`}>
                      {isMessSplit ? `+BHD ${memberShareBill.toFixed(3)}` : `BHD ${billedAmt}`}
                    </span>
                  </div>

                  {/* Items List (if available) */}
                  {isDep ? (
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Deposit Status:</span>
                        <span className={`font-black text-xs uppercase tracking-wider ${isDepDef ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {isDepDef ? 'Credit Deposit' : 'Deposited'}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 font-sans leading-relaxed pt-1 border-t border-slate-800/80">
                        {isDepDef 
                          ? 'Physical NFC card security deposit deferred to customer payday. Excluded from grocery running credit debt balance.'
                          : 'Physical NFC card security deposit held in custodial trust. Excluded from grocery running credit debt balance and refundable upon card return.'}
                      </p>
                    </div>
                  ) : Array.isArray(selectedReceipt.items) && selectedReceipt.items.length > 0 ? (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {selectedReceipt.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between text-xs py-1 border-b border-white/5">
                          <span className="text-neutral-300 truncate max-w-[180px]">{it.name} x{it.qty || 1}</span>
                          <span className="font-mono text-white">BD {Number(it.total || it.unitPrice || 0).toFixed(3)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-400 text-center py-2">
                      Official store register transaction record
                    </p>
                  )}
                </>
              );
            })()}

            <button
              type="button"
              onClick={() => setSelectedReceipt(null)}
              className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          9. BENEFITPAY FAWRI+ MODAL
          ───────────────────────────────────────────────────────────── */}
      {showBenefitModal && benefitPayData && (
        <BenefitPayModal
          isOpen={showBenefitModal}
          onClose={() => setShowBenefitModal(false)}
          amount={benefitPayData.amount}
          currency="BHD"
          merchantName="LAYALI SUPERMARKET"
          qrPayload={benefitPayData.qrPayload}
          checkoutUrl={benefitPayData.checkoutUrl}
          customerId={ledger.id || customerId}
          customerName={ledger.name}
          targetName={benefitPayData.targetName}
          lang={lang}
        />
      )}
    </div>
  );
}
