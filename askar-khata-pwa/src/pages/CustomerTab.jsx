import { useEffect, useState, useRef, useCallback, lazy, Suspense } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
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
  Fingerprint
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
const BenefitPayModal = lazy(() => import('../components/BenefitPayModal'));
const HamburgerDrawer = lazy(() => import('../components/HamburgerDrawer'));
const ReceiptModal = lazy(() => import('../components/ReceiptModal'));
import TransactionItemCard from '../components/TransactionItemCard';
import DigitalKhataPass from '../components/DigitalKhataPass';
import { generateBenefitPayPayload } from '../utils/benefitPay';

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
    recentPurchases: 'Transaction History',
    transactionsHistory: 'Full Transaction History',
    filterAll: 'All',
    filterPersonal: 'Personal Tab',
    filterMess: 'Mess Splits',
    filterPurchases: 'Purchases',
    filterPayments: 'Payments',
    searchTxPlaceholder: 'Search transactions, items, or invoice #...',
    clearSearch: 'Clear',
    noTxFound: 'No transactions matching search',
    showingCount: 'Showing',
    of: 'of',
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
    freezeBtn: '🔒 Freeze Khata (Lost Card Protection)',
    personalTab: 'Personal Tab',
    myMessShare: 'My Mess Share',
    fullMess: 'Full Mess',
    allDebt: 'All Debt',
    accountBreakdown: 'Account Breakdown (Tap to Select)',
    privatePurchases: 'Private grocery purchases',
    membersLabel: 'members',
    yourShareInRoom: 'Your individual share in this room',
    combinedRooms: 'Mess Groups Combined',
    sharedRoomSplit: 'Your shared room split debt',
    selectedBadge: 'Selected',
    refreshBtn: 'Refresh',
    receiptVerifiedTitle: 'Authentic Receipt Verified',
    receiptZeroDrift: '100% Zero-Drift Parity',
    receiptZeroDriftDesc: 'Live cloud balance matches your printed receipt bit-for-bit.',
    receiptPaidDownDesc: 'Balance paid down since this receipt was printed.',
    receiptNewChargesDesc: 'New purchases recorded since this receipt was printed.',
    receiptInvoiceLabel: 'Invoice',
    receiptPrintedBal: 'Slip Balance',
    receiptLiveBal: 'Live Cloud Balance',
    viewReceiptInHistory: 'View Scanned Receipt in History'
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
    recentPurchases: 'سجل المعاملات والتواريخ',
    transactionsHistory: 'سجل المعاملات والتواريخ بالكامل',
    filterAll: 'الكل',
    filterPersonal: 'الحساب الشخصي',
    filterMess: 'مصاريف السكن',
    filterPurchases: 'مشتريات',
    filterPayments: 'سدادات',
    searchTxPlaceholder: 'البحث في المشتريات أو الفواتير...',
    clearSearch: 'مسح',
    noTxFound: 'لم يتم العثور على أي معاملات',
    showingCount: 'عرض',
    of: 'من أصل',
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
    freezeBtn: '🔒 تجميد الحساب (حماية البطاقة المفقودة)',
    personalTab: 'الحساب الشخصي',
    myMessShare: 'نصيبي من المشترك',
    fullMess: 'مشترك الغرفة بالكامل',
    allDebt: 'إجمالي الحساب',
    accountBreakdown: 'تفاصيل الحسابات (اضغط للاختيار)',
    privatePurchases: 'مشترياتك الشخصية من السوبرماركت',
    membersLabel: 'أعضاء',
    yourShareInRoom: 'نصيبك الفردي في هذه الغرفة',
    combinedRooms: 'جروبات مشتركة مدمجة',
    sharedRoomSplit: 'نصيبك من مصاريف المشترك',
    selectedBadge: 'تم الاختيار',
    refreshBtn: 'تحديث',
    receiptVerifiedTitle: 'تم التحقق من صحة الإيصال',
    receiptZeroDrift: 'تطابق كامل 100% بدون أي فرق',
    receiptZeroDriftDesc: 'رصيد السحابة يطابق تماماً الرصيد المطبوع على الإيصال.',
    receiptPaidDownDesc: 'تم سداد دفعات إضافية بعد طباعة هذا الإيصال.',
    receiptNewChargesDesc: 'تمت إضافة مشتريات جديدة بعد طباعة هذا الإيصال.',
    receiptInvoiceLabel: 'الفاتورة',
    receiptPrintedBal: 'رصيد الإيصال',
    receiptLiveBal: 'الرصيد المباشر',
    viewReceiptInHistory: 'عرض الإيصال الممسوح في السجل'
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
    recentPurchases: 'ഇടപാടുകളുടെ വിവരങ്ങൾ',
    transactionsHistory: 'മുഴുവൻ ഇടപാടുകളുടെ വിവരങ്ങൾ',
    filterAll: 'എല്ലാം',
    filterPersonal: 'പേഴ്സണൽ',
    filterMess: 'മെസ്സ് വിഹിതം',
    filterPurchases: 'വാങ്ങിയവ',
    filterPayments: 'അടച്ചവ',
    searchTxPlaceholder: 'ബില്ലുകൾ അല്ലെങ്കിൽ സാധനങ്ങൾ തിരയുക...',
    clearSearch: 'ക്ലിയർ',
    noTxFound: 'ഇടപാടുകൾ ഒന്നും കണ്ടെത്തിയില്ല',
    showingCount: 'കാണിക്കുന്നത്',
    of: '/',
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
    freezeBtn: '🔒 അക്കൗണ്ട് ഫ്രീസ് ചെയ്യുക (കാർഡ് നഷ്ടപ്പെട്ടാൽ)',
    personalTab: 'പേഴ്സണൽ അക്കൗണ്ട്',
    myMessShare: 'മെസ്സ് വിഹിതം',
    fullMess: 'മുഴുവൻ മെസ്സ് തുക',
    allDebt: 'മുഴുവൻ കുടിശ്ശിക',
    accountBreakdown: 'അക്കൗണ്ട് വിവരങ്ങൾ (തിരഞ്ഞെടുക്കുക)',
    privatePurchases: 'സ്വകാര്യ വാങ്ങലുകൾ',
    membersLabel: 'അംഗങ്ങൾ',
    yourShareInRoom: 'ഈ മെസ്സിലെ നിങ്ങളുടെ വിഹിതം',
    combinedRooms: 'മെസ്സ് ഗ്രൂപ്പുകൾ സംയോജിപ്പിച്ചത്',
    sharedRoomSplit: 'നിങ്ങളുടെ മെസ്സ് വിഹിതം',
    selectedBadge: 'തിരഞ്ഞെടുത്തു',
    refreshBtn: 'റീഫ്രഷ്',
    receiptVerifiedTitle: 'യഥാർത്ഥ രസീത് സ്ഥിരീകരിച്ചു',
    receiptZeroDrift: '100% കൃത്യമായ കണക്ക്',
    receiptZeroDriftDesc: 'നിങ്ങളുടെ കൈവശമുള്ള ബില്ലിലെ തുകയും ഓൺലൈൻ തുകയും ഒന്നുതന്നെയാണ്.',
    receiptPaidDownDesc: 'ഈ ബില്ലിന് ശേഷം തുക അടച്ചിട്ടുണ്ട്.',
    receiptNewChargesDesc: 'ഈ ബില്ലിന് ശേഷം പുതിയ സാധനങ്ങൾ വാങ്ങിയിട്ടുണ്ട്.',
    receiptInvoiceLabel: 'ഇൻവോയ്സ്',
    receiptPrintedBal: 'ബില്ലിലെ തുക',
    receiptLiveBal: 'ഇപ്പോഴത്തെ തുക',
    viewReceiptInHistory: 'ലിസ്റ്റിൽ കാണുക'
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
    recentPurchases: 'লেনদেনের বিস্তারিত ইতিহাস',
    transactionsHistory: 'সম্পূর্ণ লেনদেনের ইতিহাস ও তারিখ',
    filterAll: 'সকল',
    filterPersonal: 'ব্যক্তিগত',
    filterMess: 'মেস হিসাব',
    filterPurchases: 'ক্রয়',
    filterPayments: 'পরিশোধ',
    searchTxPlaceholder: 'বিল বা পণ্য অনুসন্ধান করুন...',
    clearSearch: 'মুছুন',
    noTxFound: 'কোনো লেনদেন পাওয়া যায়নি',
    showingCount: 'প্রদর্শন',
    of: '/',
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
    freezeBtn: '🔒 অ্যাকাউন্ট ফ্রিজ করুন (কার্ড হারালে)',
    personalTab: 'ব্যক্তিগত খাতা',
    myMessShare: 'মেস শেয়ার',
    fullMess: 'পুরো মেস হিসাব',
    allDebt: 'মোট বাকি',
    accountBreakdown: 'হিসাবের বিবরণ (নির্বাচন করুন)',
    privatePurchases: 'ব্যক্তিগত কেনাকাটা',
    membersLabel: 'সদস্য',
    yourShareInRoom: 'এই মেসে আপনার শেয়ার',
    combinedRooms: 'সম্মিলিত মেস গ্রুপ',
    sharedRoomSplit: 'আপনার মেস শেয়ার',
    selectedBadge: 'নির্বাচিত',
    refreshBtn: 'রিফ্রেশ',
    receiptVerifiedTitle: 'আসল রসিদ যাচাইকৃত',
    receiptZeroDrift: '১০০% সঠিক হিসাব',
    receiptZeroDriftDesc: 'আপনার রসিদের ব্যালেন্স এবং অনলাইন ব্যালেন্স একদম এক।',
    receiptPaidDownDesc: 'রসিদ প্রিন্ট হওয়ার পর টাকা জমা হয়েছে।',
    receiptNewChargesDesc: 'রসিদ প্রিন্ট হওয়ার পর নতুন কেনাকাটা যুক্ত হয়েছে।',
    receiptInvoiceLabel: 'চালান',
    receiptPrintedBal: 'রসিদের ব্যালেন্স',
    receiptLiveBal: 'বর্তমান ব্যালেন্স',
    viewReceiptInHistory: 'ইতিহাসে দেখুন'
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
    recentPurchases: 'पूरा लेन-देन इतिहास',
    transactionsHistory: 'पूरा लेन-देन इतिहास एवं तारीखें',
    filterAll: 'सभी',
    filterPersonal: 'पर्सनल',
    filterMess: 'मेस का हिस्सा',
    filterPurchases: 'खरीदारी',
    filterPayments: 'भुगतान',
    searchTxPlaceholder: 'बिल या सामान खोजें...',
    clearSearch: 'साफ़ करें',
    noTxFound: 'कोई लेनदेन नहीं मिला',
    showingCount: 'दिखा रहे हैं',
    of: 'में से',
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
    freezeBtn: '🔒 खाता फ्रीज करें (खोए कार्ड की सुरक्षा)',
    personalTab: 'निजी खाता',
    myMessShare: 'मेस हिस्सा',
    fullMess: 'पूरा मेस खाता',
    allDebt: 'कुल बकाया',
    accountBreakdown: 'खाता विवरण (चुनने के लिए टैप करें)',
    privatePurchases: 'निजी खरीदारी',
    membersLabel: 'सदस्य',
    yourShareInRoom: 'इस रूम में आपका हिस्सा',
    combinedRooms: 'संयुक्त मेस ग्रुप',
    sharedRoomSplit: 'आपका साझा मेस खर्च',
    selectedBadge: 'चयनित',
    refreshBtn: 'रिफ्रेश',
    receiptVerifiedTitle: 'असली रसीद सत्यापित',
    receiptZeroDrift: '100% सटीक मिलान',
    receiptZeroDriftDesc: 'आपकी मुद्रित रसीद का बैलेंस और ऑनलाइन बैलेंस पूरी तरह समान है।',
    receiptPaidDownDesc: 'रसीद प्रिंट होने के बाद भुगतान जमा किया गया है।',
    receiptNewChargesDesc: 'रसीद प्रिंट होने के बाद नई खरीदारी जुड़ी है।',
    receiptInvoiceLabel: 'चालान (इनवॉइस)',
    receiptPrintedBal: 'रसीद का बैलेंस',
    receiptLiveBal: 'लाइव खाता बैलेंस',
    viewReceiptInHistory: 'लेन-देन इतिहास में देखें'
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  const receiptInv = searchParams.get('receiptInv');
  const receiptBal = searchParams.get('receiptBal');
  const receiptTs = searchParams.get('receiptTs');
  const [dismissReceiptBanner, setDismissReceiptBanner] = useState(false);
  const transactionsSectionRef = useRef(null);
  
  const [lang, setLang] = useState('en');
  const t = TAB_TEXTS[lang] || TAB_TEXTS.en;
  const isRtl = lang === 'ar';

  // Developer Inspection Session Detection
  const isDevSession = typeof window !== 'undefined' && Boolean(
    sessionStorage.getItem('khata_dev_jwt') || searchParams.get('dev_mode') === '1'
  );

  // Anti-IDOR Single-Customer Device Binding Enforcement (Resilient against Phone Number / Access Token aliases)
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

  // Native Biometric Phone Lock State (Zero-PIN for Elderly Labor Patrons, Bypassed for Developer)
  const [phoneLockRequired, setPhoneLockRequired] = useState(() => {
    if (typeof window === 'undefined' || isDevSession) return false;
    if (isSessionVerified(customerId)) return false;
    return isPhoneLockConfigured(customerId);
  });
  const [verifyingPhoneLock, setVerifyingPhoneLock] = useState(false);
  const [phoneLockError, setPhoneLockError] = useState('');
  const [phoneLockEnrolling, setPhoneLockEnrolling] = useState(false);
  const [phoneLockEnrolledSuccess, setPhoneLockEnrolledSuccess] = useState(false);
  const [showEnrollBanner, setShowEnrollBanner] = useState(false);

  useEffect(() => {
    let active = true;
    if (customerId && !isPhoneLockConfigured(customerId)) {
      isPhoneLockAvailable().then((avail) => {
        if (active && avail) {
          setShowEnrollBanner(true);
        }
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [customerId]);

  const [ledger, setLedger] = useState(() => {
    try {
      if (typeof window !== 'undefined' && customerId && !isDeviceBoundToOther) {
        let cached = localStorage.getItem(`khata_tab_cache_${customerId}`);
        if (!cached) {
          const myId = localStorage.getItem('my_khata_customer_id');
          if (myId && myId === customerId) cached = localStorage.getItem(`khata_tab_cache_${myId}`);
        }
        if (cached) return JSON.parse(cached);
      }
    } catch {}
    return null;
  });
  const [loading, setLoading] = useState(() => {
    try {
      if (typeof window !== 'undefined' && customerId && !isDeviceBoundToOther) {
        const cached = localStorage.getItem(`khata_tab_cache_${customerId}`);
        if (cached) return false;
      }
    } catch {}
    return true;
  });
  const [isSyncing, setIsSyncing] = useState(false);

  const handledPushTxIdsRef = useRef(new Map());
  const customerIdRef = useRef(customerId);
  const ledgerNameRef = useRef(null);
  customerIdRef.current = customerId;
  ledgerNameRef.current = ledger?.name || null;
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState('ALL'); // 'ALL' | 'PERSONAL' | 'MESS' | 'MESS_GROUP'
  const [selectedPaymentMessId, setSelectedPaymentMessId] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [showCustomPay, setShowCustomPay] = useState(false);
  const [showBenefitModal, setShowBenefitModal] = useState(false);
  const [benefitPayData, setBenefitPayData] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [txFilter, setTxFilter] = useState('ALL'); // 'ALL' | 'PERSONAL' | 'MESS' | 'PURCHASE' | 'PAYMENT'
  const [txSearch, setTxSearch] = useState('');
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

  // --- Customer Push Notification Management ---
  const [notifPermission, setNotifPermission] = useState(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });
  const [liveTxAlert, setLiveTxAlert] = useState(null);
  const [isSubscribingPush, setIsSubscribingPush] = useState(false);

  // Play transaction success chime via Web Audio API
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

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const handleEnablePush = async () => {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      alert('Push notifications are not supported on this browser context.');
      return;
    }
    setIsSubscribingPush(true);
    try {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
      if (perm !== 'granted') {
        setIsSubscribingPush(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const keyRes = await fetch('/api/notifications/vapid-public-key');
      const { publicKey } = await keyRes.json();

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
      }

      const subJson = sub.toJSON();
      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: subJson.keys,
          customerId: customerId,
          customerName: ledger?.name || null
        })
      });

      playTxChime();
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([80, 40, 80]);
      }

      setLiveTxAlert({
        title: 'Phone Alerts Activated 🔔',
        message: 'Your phone is now registered to receive real-time push alerts whenever you buy items at the store.',
        amount: 0,
        formattedAmount: 'ACTIVE'
      });
    } catch (err) {
      console.warn('Push subscription failed:', err.message);
    } finally {
      setIsSubscribingPush(false);
    }
  };

  const handleTestPush = async () => {
    playTxChime();
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([100, 50, 100]);
    }
    setLiveTxAlert({
      title: 'Store Purchase Notice 🛒',
      message: `${ledger?.name || 'Customer'}: Purchased 3 items (2.500 BHD) via CASH. Inv #INV-TEST-${Date.now().toString().slice(-4)}`,
      amount: 2.500,
      formattedAmount: '2.500 BHD'
    });

    try {
      await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customerId,
          customerName: ledger?.name || 'Customer',
          amount: 2.500
        })
      });
    } catch {}
  };

  // Auto-dismiss live alert
  useEffect(() => {
    if (!liveTxAlert) return;
    const t = setTimeout(() => setLiveTxAlert(null), 8000);
    return () => clearTimeout(t);
  }, [liveTxAlert]);

  const abortControllerRef = useRef(null);
  const [showSuccessBanner, setShowSuccessBanner] = useState(() => 
    statusParam === 'complete' || statusParam === 'success' || statusParam === 'mock_demo_success'
  );

  const handleScrollToReceipt = useCallback(() => {
    if (receiptInv) {
      setTxSearch(receiptInv);
      setTxFilter('ALL');
    }
    if (transactionsSectionRef.current) {
      transactionsSectionRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [receiptInv]);

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
          ? `Hello ${name}, your Layali account is fully settled with zero debt owed.`
          : `Hello ${name}, your outstanding balance at Layali is ${absBal} Bahraini Dinars.`;
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
      const savedJwt = (typeof localStorage !== 'undefined' && (localStorage.getItem(`khata_jwt_${customerId}`) || localStorage.getItem(`khata_jwt_${ledger.id}`))) || '';
      let promptPin = '';
      if (!isCurrentlyActive && !savedJwt) {
        promptPin = (window.prompt('🔒 Enter your 4-digit Khata PIN to unfreeze your account:') || '').trim();
        if (!promptPin) {
          setFreezeLoading(false);
          return;
        }
      }
      const headers = { 'Content-Type': 'application/json' };
      if (savedJwt) headers['Authorization'] = `Bearer ${savedJwt}`;

      const res = await fetch(`/api/khata/${encodeURIComponent(ledger.id || customerId)}/freeze`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ freeze: isCurrentlyActive, pin: promptPin || undefined })
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
      // Optimistic Zero-Wait: Only block screen with spinner if no cached snapshot is present
      if (!ledger && !localStorage.getItem(`khata_tab_cache_${customerId}`)) {
        setLoading(true);
      } else {
        setIsSyncing(true);
      }
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
        signal
      });
      
      let finalRes = res;
      if (res.status === 401 || res.status === 403) {
        // Fallback retry unauthenticated for public tab overview without destroying stored credentials
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
      const balanceVal = Number(data.balance ?? data.currentBalance ?? 0);
      const messShareVal = Math.max(0, Number(data.messShare ?? data.mess_share ?? 0));
      const personalVal = Math.max(0, Number(data.personalBalance ?? data.personal_balance ?? Math.max(0, balanceVal - messShareVal)));

      const customerRecord = {
        id: data.id || customerId,
        name: data.name || 'Valued Customer',
        balance: balanceVal,
        personalBalance: personalVal,
        messShare: messShareVal,
        messes: Array.isArray(data.messes) ? data.messes : [],
        hasMessGroup: Boolean(data.hasMessGroup || (data.messes && data.messes.length > 0)),
        isMultiMess: Boolean(data.isMultiMess || (data.messes && data.messes.length > 1)),
        credit_limit: Number(data.credit_limit ?? data.creditLimit ?? 30.0),
        is_active: data.is_active !== undefined ? Number(data.is_active) : (data.isActive === false ? 0 : 1),
        pendingClaims: data.pendingClaims || [],
        recentPurchases: allTx,
        transactions: allTx,
        ledger: allTx
      };

      setLedger(customerRecord);
      setIsOffline(false);

      // Permanent Device Binding: Store in localStorage and 10-year cookie (bypassed in developer inspection mode)
      if (!isDevSession) {
        try {
          const bindId = customerRecord.id || customerId;
          localStorage.setItem('my_khata_customer_id', bindId);
          document.cookie = `khata_customer_id=${encodeURIComponent(bindId)}; path=/; max-age=315360000; SameSite=Lax`;
          createReceiptDeviceToken(bindId);
        } catch (bindErr) {
          console.warn('CustomerTab device binding error:', bindErr);
        }
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
      setIsSyncing(false);
    }
  }, [customerId, t.networkErr]);

  useEffect(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Security Gate: Stop network fetch if this phone belongs to someone else
    if (isDeviceBoundToOther) {
      return;
    }

    // Security Gate: Stop network fetch until user unlocks phone lock
    if (phoneLockRequired) {
      return;
    }

    if (customerId) {
      const load = async () => {
        await fetchLedger(controller.signal);
      };
      load();
    }

    return () => {
      controller.abort();
    };
  }, [customerId, fetchLedger, isDeviceBoundToOther, phoneLockRequired]);

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

  // Listen for real incoming push transactions forwarded from service worker with strict anti-loop deduplication
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const handleSwMessage = (event) => {
      if (event.data?.type === 'PUSH_TRANSACTION_NOTIFICATION') {
        const payload = event.data.payload;
        if (!payload) return;

        // Guard 1: Ignore zero-amount phantom sales
        const amountNum = Number(payload.amount || 0);
        if (amountNum <= 0 && (!payload.txType || payload.txType === 'SALE')) {
          return;
        }

        const txKey = payload.id || (payload.invoiceNo ? `inv_${payload.invoiceNo}` : `tx_${payload.amount}_${payload.timestamp}`);
        const lastHandled = handledPushTxIdsRef.current.get(txKey);
        if (lastHandled && (Date.now() - lastHandled) < 45000) {
          // Already processed within 45s - break loop
          return;
        }
        handledPushTxIdsRef.current.set(txKey, Date.now());

        const currentCustId = customerIdRef.current;
        const currentCustName = ledgerNameRef.current;
        const incomingCustId = payload.customerId ? String(payload.customerId).trim().toLowerCase() : '';
        const currentCustIdStr = currentCustId ? String(currentCustId).trim().toLowerCase() : '';
        // Guard 2: Strictly require matching this specific customer's account (never accept unassigned/anonymous sales)
        const matchesCustomer = Boolean(
          (incomingCustId && currentCustIdStr && incomingCustId === currentCustIdStr) || 
          (currentCustName && payload.customerName && String(payload.customerName).trim().toLowerCase() === String(currentCustName).trim().toLowerCase())
        );

        if (matchesCustomer) {
          playTxChime();
          if (typeof navigator.vibrate === 'function') {
            try { navigator.vibrate([100, 50, 100]); } catch {}
          }
          setLiveTxAlert(payload);
          fetchLedger();
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
  }, [fetchLedger, playTxChime]);

  const balanceNum = Number(ledger?.balance || 0);
  const messShareBal = Math.max(0, Number(ledger?.messShare ?? 0));
  const personalBal = Math.max(0, Number(ledger?.personalBalance ?? Math.max(0, balanceNum - messShareBal)));
  const activeMess = (ledger?.messes && ledger.messes.find(m => m.id === selectedPaymentMessId)) || (ledger?.messes && ledger.messes[0]);

  let targetDebt = balanceNum;
  let targetName = t.allDebt || 'All Debt';
  if (paymentTarget === 'PERSONAL') {
    targetDebt = Math.max(0, personalBal);
    targetName = t.personalTab || 'Personal Tab';
  } else if (paymentTarget === 'MESS') {
    targetDebt = Math.max(0, messShareBal);
    targetName = t.myMessShare || 'My Mess Share';
  } else if (paymentTarget === 'MESS_GROUP' && activeMess) {
    targetDebt = Math.max(0, Number(activeMess.groupTotal ?? activeMess.totalBalance ?? 0));
    const rawMessName = activeMess.group_name || activeMess.name || 'Room';
    targetName = `${t.fullMess || 'Full Mess'}: ${rawMessName}`;
  } else if (paymentTarget === 'CASH_ADVANCE') {
    targetDebt = Math.max(0, Number(ledger.cash_advance_balance || 0));
    targetName = 'Payday Cash Advance (سلفة نقدية)';
  }
  const isTargetDebt = targetDebt > 0.0005;

  // Real Tap Payments / BenefitPay Execution with Strict Minimum Validation (Resolved PWA-INT-03)
  const handlePay = async (specifiedAmount) => {
    if (!ledger) return;
    const activeTargetDebt = targetDebt;
    if (activeTargetDebt <= 0) return;
    const finalAmount = Number(Number(specifiedAmount || payAmount || activeTargetDebt).toFixed(3));
    
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
          amount: Math.min(finalAmount, activeTargetDebt),
          customerName: ledger.name,
          paymentTarget,
          targetMessId: selectedPaymentMessId,
          targetName,
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
        setBenefitPayData({
          ...data,
          paymentTarget,
          targetMessId: selectedPaymentMessId,
          targetName
        });
        setShowBenefitModal(true);
      }
    } catch (err) {
      // Graceful offline fallback: Generate BenefitPay Fawri+ QR locally if network drops
      if (!navigator.onLine || err.message?.includes('fetch') || err.message?.includes('network')) {
        const fallbackAmount = Math.min(finalAmount, activeTargetDebt);
        const invoiceRef = `KHATA-${String(ledger.id).slice(-6)}`;
        const offlineQr = generateBenefitPayPayload(fallbackAmount, invoiceRef);
        setBenefitPayData({
          mode: 'BENEFITPAY_FAWRI',
          amount: fallbackAmount,
          currency: 'BHD',
          merchantName: 'LAYALI SUPERMARKET',
          merchantId: '97300182',
          mobileNumber: '+973 32067388',
          iban: 'BH67NBOB00000012345678',
          branchId: 'POS-01',
          qrPayload: offlineQr,
          customerId: ledger.id,
          customerName: ledger.name,
          paymentTarget,
          targetMessId: selectedPaymentMessId,
          targetName
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
      textStr = `*أسواق ليالي المركزية - كشف الحساب*\nالزبون: ${ledger.name}\n${isSettled ? 'الحالة: الحساب مسدد بالكامل (لا توجد مبالغ مستحقة)' : `المبلغ المستحق: ${balanceStr} د.ب`}\nالسداد إلكترونياً عبر بنفت بي: ${window.location.href}`;
    } else {
      textStr = `*Layali Khata Tab*\nCustomer: ${ledger.name}\n${isSettled ? 'Status: Fully Settled (No Debt Owed)' : `Outstanding Balance: BHD ${balanceStr}`}\nPay online via BenefitPay: ${window.location.href}`;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(textStr)}`, '_blank');
  };

  // Security Gate 1: Account Mismatch Lockout Screen (Anti-IDOR)
  if (isDeviceBoundToOther) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="bg-slate-900 border border-rose-500/30 rounded-3xl shadow-2xl p-8 w-full max-w-md text-center relative overflow-hidden">
          <div className="w-16 h-16 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-500/40">
            <Lock className="w-8 h-8 text-rose-400" />
          </div>
          <span className="text-[10px] font-mono tracking-widest uppercase px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
            Account Mismatch Protected
          </span>
          <h2 className="text-xl font-black text-white mt-4 mb-2">
            {lang === 'ar' ? 'هذا الهاتف مرتبط بحساب آخر' : 'Personal Khata Locked'}
          </h2>
          <p className="text-slate-300 text-xs mb-6 leading-relaxed">
            {lang === 'ar'
              ? 'هذا الهاتف مسجل ومقفل على حسابك الخاص في ليالي. لا يمكنك فتح أو تصفح حساب زبون آخر.'
              : "This device is registered to your personal Khata account. Opening another customer's tab is prohibited."}
          </p>
          <button 
            type="button"
            onClick={() => {
              window.location.href = `/tab/${encodeURIComponent(boundCustomerId)}`;
            }} 
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black rounded-2xl text-sm transition cursor-pointer shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-5 h-5 text-white" />
            <span>{lang === 'ar' ? 'الرجوع إلى حسابي' : 'Return to My Khata'}</span>
          </button>
        </div>
      </div>
    );
  }

  // Security Gate 2: Native Phone Lock Biometric Gate (Zero-PIN for Laborers)
  if (phoneLockRequired) {
    const handleUnlockPhoneLock = async () => {
      setVerifyingPhoneLock(true);
      setPhoneLockError('');
      try {
        const res = await verifyPhoneLock(customerId);
        if (res.success) {
          setPhoneLockRequired(false);
          if (!ledger) {
            fetchLedger();
          }
        } else if (res.needsReenroll) {
          // Incompatible or legacy credential format: require explicit PIN verification
          setPhoneLockError(
            lang === 'ar'
              ? 'انتهت صلاحية بصمة الهاتف على هذا الجهاز. يرجى إدخال الرمز السري لفتح الحساب.'
              : 'Biometric credential expired on this phone. Please open with your 4-digit PIN.'
          );
        } else {
          setPhoneLockError(res.error || 'Authentication cancelled. Please try again.');
        }
      } catch (e) {
        setPhoneLockError(e.message || 'Verification failed');
      } finally {
        setVerifyingPhoneLock(false);
      }
    };

    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-8 w-full max-w-md text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-3xl flex items-center justify-center mx-auto mb-5 border-2 border-emerald-500/40 shadow-inner">
            <Fingerprint className="w-12 h-12 text-emerald-400" />
          </div>

          <span className="text-[10px] font-mono tracking-widest uppercase px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
            Biometric Phone Lock
          </span>

          <h2 className="text-2xl font-black text-white mt-4 mb-2">
            {lang === 'ar' ? 'تأكيد قفل الهاتف' : lang === 'ml' ? 'ഫോൺ ലോക്ക് തുറക്കുക' : 'Touch to Unlock'}
          </h2>
          <p className="text-slate-300 text-xs mb-8 leading-relaxed">
            {lang === 'ar' 
              ? 'يرجى لمس بصمة الإصبع أو بصمة الوجه أو رمز قفل الشاشة الخاص بهاتفك لفتح كشف الحساب.'
              : lang === 'ml'
              ? 'നിങ്ങളുടെ ഫിംഗർപ്രിന്റ് അല്ലെങ്കിൽ ഫോൺ ലോക്ക് ഉപയോഗിച്ച് തുറക്കുക.'
              : 'Use your phone fingerprint, face unlock, or screen pattern to open your private Khata.'}
          </p>

          {phoneLockError && (
            <div className="mb-6 p-3 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-300 text-xs font-semibold">
              {phoneLockError}
            </div>
          )}

          <button
            type="button"
            onClick={handleUnlockPhoneLock}
            disabled={verifyingPhoneLock}
            className="w-full min-h-[56px] py-4 px-6 bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white font-black rounded-2xl text-sm transition-all flex items-center justify-center gap-3 cursor-pointer shadow-lg shadow-emerald-950/60"
          >
            {verifyingPhoneLock ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Fingerprint className="w-6 h-6 text-white shrink-0" />
                <span>
                  {lang === 'ar' ? 'فتح عبر بصمة الهاتف' : lang === 'ml' ? 'ഫിംഗർപ്രിന്റ് ഉപയോഗിക്കുക' : 'Unlock with Phone Lock'}
                </span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => navigate(`/statement/${encodeURIComponent(customerId)}`)}
            className="w-full mt-3 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-2xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer border border-slate-700"
          >
            <Lock className="w-4 h-4 text-slate-400" />
            <span>{lang === 'ar' ? 'الدخول عبر الرقم السري (PIN)' : 'Unlock with 4-Digit PIN instead'}</span>
          </button>
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
          <button onClick={() => window.location.reload()} className="inline-flex items-center gap-2 px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl text-sm transition cursor-pointer">
            <RotateCw className="w-4 h-4" />
            <span>Reload Tab</span>
          </button>
        </div>
      </div>
    );
  }

  if (loading || !ledger) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-between p-4 pt-safe pb-safe animate-pulse">
        {/* Header Skeleton */}
        <header className="w-full max-w-md mb-3 flex items-center justify-between px-1">
          <div className="w-20 h-10 bg-slate-900 border border-slate-800 rounded-2xl" />
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-36 h-4 bg-slate-800 rounded-md" />
            <div className="w-24 h-3 bg-emerald-950/80 rounded-md" />
          </div>
          <div className="w-10 h-10 bg-slate-900 border border-slate-800 rounded-2xl" />
        </header>

        {/* Balance Card Skeleton */}
        <main className="w-full max-w-md flex-1 flex flex-col gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center flex flex-col items-center">
            <div className="w-36 h-4 bg-slate-800 rounded-md mb-2" />
            <div className="w-48 h-10 bg-slate-800 rounded-xl mb-4" />
            <div className="w-full h-12 bg-emerald-600/20 border border-emerald-500/30 rounded-2xl" />
          </div>

          {/* Transactions List Skeleton */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center mb-1">
              <div className="w-28 h-4 bg-slate-800 rounded-md" />
              <div className="w-16 h-3 bg-slate-800 rounded-md" />
            </div>
            <div className="h-16 bg-slate-900 border border-slate-800 rounded-2xl" />
            <div className="h-16 bg-slate-900 border border-slate-800 rounded-2xl" />
            <div className="h-16 bg-slate-900 border border-slate-800 rounded-2xl" />
          </div>
        </main>

        <footer className="w-full max-w-md py-2 text-center text-slate-700 text-[11px]">
          LAYALI SUPERMARKET • Loading Khata Ledger...
        </footer>
      </div>
    );
  }

  const isDebt = balanceNum > 0.0005;
  const isCredit = balanceNum < -0.0005;
  const isSettled = !isDebt && !isCredit;
  const absBalance = Math.abs(balanceNum).toFixed(3);

  return (
    <div 
      dir={isRtl ? 'rtl' : 'ltr'}
      className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-between p-4 pt-safe pb-safe selection:bg-emerald-500 selection:text-white"
    >
      {/* Developer Sticky Inspection Mode Banner */}
      {isDevSession && (
        <div className="w-full max-w-md mb-3 p-2.5 bg-violet-950/90 border border-violet-500/50 rounded-2xl flex items-center justify-between shadow-xl text-white no-print">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-violet-400 animate-pulse shrink-0" />
            <div className="min-w-0">
              <span className="text-xs font-black tracking-wide text-violet-200 block truncate">
                🛠️ DEV INSPECTION MODE
              </span>
              <span className="text-[10px] text-violet-300 font-mono block truncate">
                Customer: {ledger?.name || customerId}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/dev')}
            className="py-1 px-3 bg-violet-600 hover:bg-violet-500 active:scale-95 text-white rounded-xl text-xs font-bold transition shrink-0 cursor-pointer shadow-md"
          >
            ← Return to Dev
          </button>
        </div>
      )}

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
            LAYALI <span className="text-emerald-400">KHATA</span>
          </span>
          <span className="text-[10px] text-slate-400 font-sans">أسواق ليالي</span>
        </div>

        {/* Right: Refresh, Camp Privacy Mode & Language Selector */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then((regs) => {
                  for (const r of regs) r.update().catch(() => {});
                });
              }
              fetchLedger();
            }}
            className="w-10 h-10 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800 flex items-center justify-center text-slate-300 hover:text-white transition cursor-pointer shadow-xs"
            title={t.refreshBtn || 'Refresh'}
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : 'text-slate-400'}`} />
          </button>
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

      {/* Floating Live Transaction Banner Popup */}
      {liveTxAlert && (
        <div
          role="alert"
          className="fixed top-4 left-4 right-4 z-[9999] max-w-md mx-auto p-4 rounded-2xl shadow-2xl border-2 border-emerald-400 bg-emerald-950 text-white animate-in slide-in-from-top duration-300 flex items-start gap-3 backdrop-blur-md"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shrink-0 text-emerald-300 font-bold text-lg">
            🛒
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                {liveTxAlert.title || 'Purchase Notice'}
              </span>
              <span className="text-xs font-mono font-bold text-emerald-200">
                {liveTxAlert.formattedAmount || `${liveTxAlert.amount} BHD`}
              </span>
            </div>
            <p className="text-xs text-slate-200 mt-1 font-medium leading-relaxed">
              {liveTxAlert.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLiveTxAlert(null)}
            className="p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <main className="w-full max-w-md my-auto">
        {/* Native Phone Lock 1-Tap Enrollment Banner for Elderly & Labor Patrons */}
        {showEnrollBanner && (
          <div className="mb-3 p-4 bg-emerald-950/50 border border-emerald-500/40 rounded-3xl text-left flex items-start justify-between gap-3 shadow-lg no-print">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <Fingerprint className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs font-black text-white">
                  {lang === 'ar' ? 'تفعيل قفل الهاتف ببصمة الإصبع' : 'Enable 1-Touch Phone Lock'}
                </p>
                <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">
                  {lang === 'ar'
                    ? 'احمِ حسابك بقفل الهاتف ببصمة الإصبع حتى لا يرى أحد رصيدك.'
                    : 'Protect your Khata with your phone fingerprint so nobody else can view your bill.'}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={phoneLockEnrolling}
                    onClick={async () => {
                      setPhoneLockEnrolling(true);
                      try {
                        const res = await registerPhoneLock(customerId, ledger?.name || 'Customer');
                        if (res.success) {
                          setShowEnrollBanner(false);
                          setPhoneLockEnrolledSuccess(true);
                          setTimeout(() => setPhoneLockEnrolledSuccess(false), 5000);
                        } else if (res.error) {
                          alert(res.error);
                        }
                      } catch (e) {
                        alert(e.message || 'Setup failed');
                      } finally {
                        setPhoneLockEnrolling(false);
                      }
                    }}
                    className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    {phoneLockEnrolling ? '...' : (
                      <>
                        <Fingerprint className="w-4 h-4" />
                        <span>{lang === 'ar' ? 'تفعيل الآن' : 'Enable Now'}</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEnrollBanner(false)}
                    className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs rounded-xl transition cursor-pointer"
                  >
                    {lang === 'ar' ? 'لاحقاً' : 'Dismiss'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {phoneLockEnrolledSuccess && (
          <div className="mb-3 p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-300 text-xs font-semibold flex items-center gap-2 no-print">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Phone Lock enabled successfully! Your account is now secured by your phone biometrics.</span>
          </div>
        )}

        {/* Customer Push Notification Activation & Test Bar */}
        <div className="mb-3 p-3 bg-gradient-to-r from-slate-900 to-indigo-950/80 border border-indigo-500/40 rounded-2xl shadow-md flex items-center justify-between gap-2.5 no-print">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
              notifPermission === 'granted' 
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30 animate-pulse'
            }`}>
              {notifPermission === 'granted' ? <Bell className="w-4 h-4" /> : <BellRing className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black text-white tracking-wide">
                  Store Purchase Alerts
                </span>
                {notifPermission === 'granted' ? (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold px-1.5 py-0.2 rounded-md">
                    ACTIVE
                  </span>
                ) : (
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold px-1.5 py-0.2 rounded-md">
                    OFF
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 font-medium truncate">
                {notifPermission === 'granted' ? 'Alerts active for purchases & payments' : 'Receive instant alerts when you buy items'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {notifPermission !== 'granted' && (
              <button
                type="button"
                onClick={handleEnablePush}
                disabled={isSubscribingPush}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl shadow active:scale-95 transition cursor-pointer"
              >
                {isSubscribingPush ? '...' : 'Turn On'}
              </button>
            )}
            <button
              type="button"
              onClick={handleTestPush}
              className="px-2.5 py-1.5 bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow active:scale-95 transition cursor-pointer flex items-center gap-1"
              title="Test real-time alert on this phone"
            >
              <span>🧪 Test</span>
            </button>
          </div>
        </div>

        {/* Digital Khata Pass (Phone-to-POS 0.1s Barcode Gun Scan & Counter Beacon) */}
        {ledger && <DigitalKhataPass customer={ledger} lang={lang} />}

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

          {/* Tamper-Evident Authentic Receipt Verified Card (Systemic Precaution 3) */}
          {receiptInv && !dismissReceiptBanner && ledger && (() => {
            const printedBal = receiptBal !== null && receiptBal !== undefined && !isNaN(Number(receiptBal)) ? Number(receiptBal) : null;
            const liveBal = Number(ledger.balance || 0);
            const diff = printedBal !== null ? Number((liveBal - printedBal).toFixed(3)) : null;
            const isMatch = diff !== null && Math.abs(diff) < 0.001;
            const isPaidDown = diff !== null && diff < -0.0005;
            const isNewCharges = diff !== null && diff > 0.0005;

            return (
              <div className="mb-6 p-4 bg-emerald-950/40 border-2 border-emerald-500/50 rounded-2xl text-left relative overflow-hidden shadow-lg shadow-emerald-950/50 no-print">
                {/* Glow Accent */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />

                {/* Header */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-emerald-300 uppercase tracking-wider font-sans">
                        {t.receiptVerifiedTitle || 'Authentic Receipt Verified'}
                      </h3>
                      <p className="text-[10px] text-slate-400 font-mono">
                        #{receiptInv}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDismissReceiptBanner(true)}
                    className="w-6 h-6 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer border border-slate-800"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Figures comparison */}
                <div className="grid grid-cols-2 gap-2 my-2.5 font-mono text-center">
                  {printedBal !== null && (
                    <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                      <span className="text-[9px] uppercase tracking-wider text-slate-400 block mb-0.5">
                        {t.receiptPrintedBal || 'Slip Balance'}
                      </span>
                      <span className="text-sm font-black text-slate-200">
                        {t.currency || 'BHD'} {printedBal.toFixed(3)}
                      </span>
                    </div>
                  )}
                  <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 block mb-0.5">
                      {t.receiptLiveBal || 'Live Cloud Balance'}
                    </span>
                    <span className={`text-sm font-black ${isMatch ? 'text-emerald-400' : 'text-slate-100'}`}>
                      {t.currency || 'BHD'} {liveBal.toFixed(3)}
                    </span>
                  </div>
                </div>

                {/* Explanation & Parity confirmation */}
                <div className="text-[11px] font-sans leading-tight mt-1 flex items-start gap-1.5 text-slate-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    {isMatch && (
                      <span className="text-emerald-300 font-bold">
                        {t.receiptZeroDrift || '100% Zero-Drift Parity'}: {t.receiptZeroDriftDesc || 'Live cloud balance matches your printed receipt bit-for-bit.'}
                      </span>
                    )}
                    {isPaidDown && (
                      <span className="text-emerald-300">
                        {t.receiptPaidDownDesc || 'Account paid down'}: BD {Math.abs(diff).toFixed(3)} credited since receipt was printed.
                      </span>
                    )}
                    {isNewCharges && (
                      <span className="text-amber-300">
                        {t.receiptNewChargesDesc || 'Active purchases'}: BD {diff.toFixed(3)} in new charges recorded since receipt was printed.
                      </span>
                    )}
                    {!diff && !isMatch && (
                      <span className="text-emerald-300 font-bold">
                        {t.receiptZeroDriftDesc || 'Live cloud balance verified with store register.'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Jump to transaction button */}
                <button
                  type="button"
                  onClick={handleScrollToReceipt}
                  className="w-full mt-2.5 py-1.5 px-3 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 rounded-xl text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>{t.viewReceiptInHistory || 'View Scanned Receipt in History'}</span>
                </button>
              </div>
            );
          })()}

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
            <span className="text-[10px] font-mono tracking-widest text-emerald-400 uppercase bg-emerald-950/80 border border-emerald-800/40 px-3 py-1 rounded-full flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
              {isSyncing ? 'UPDATING...' : t.live}
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

          {/* Financial Breakdown Cards with Full Mess Room Visibility (Replicating Central Payment) */}
          {(ledger.hasMessGroup || (ledger.messes && ledger.messes.length > 0) || Math.abs(personalBal - balanceNum) > 0.001) && (
            <div className="my-5 text-left no-print">
              <div className="flex items-center justify-between mb-2.5 px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  {t.accountBreakdown || 'Account Breakdown (Tap to Select)'}
                </span>
                {paymentTarget !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentTarget('ALL');
                      setSelectedPaymentMessId(null);
                      setPayAmount('');
                    }}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer underline"
                  >
                    Reset to All Debt
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 1. Personal Tab */}
                <div
                  onClick={() => {
                    setPaymentTarget('PERSONAL');
                    setSelectedPaymentMessId(null);
                    setPayAmount('');
                  }}
                  className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer relative overflow-hidden ${
                    paymentTarget === 'PERSONAL'
                      ? 'bg-emerald-950/70 border-emerald-500 ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-950/50'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-300 uppercase tracking-wider">{t.personalTab || 'Personal Tab'}</span>
                    <div className="flex items-center gap-1.5">
                      {paymentTarget === 'PERSONAL' && (
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {t.selectedBadge || 'Selected'}
                        </span>
                      )}
                      <User className="w-4 h-4 text-emerald-400" />
                    </div>
                  </div>
                  <div className="text-2xl font-black text-white mt-1.5 tracking-tight font-mono">
                    {hideBalance ? '••••••' : `${t.currency} ${personalBal.toFixed(3)}`}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {t.privatePurchases || 'Private grocery purchases'}
                  </div>
                </div>

                {/* 2. My Mess Share */}
                {(ledger.hasMessGroup || (ledger.messes && ledger.messes.length > 0)) && (
                  <div
                    onClick={() => {
                      setPaymentTarget('MESS');
                      setSelectedPaymentMessId(null);
                      setPayAmount('');
                    }}
                    className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer relative overflow-hidden ${
                      paymentTarget === 'MESS'
                        ? 'bg-indigo-950/70 border-indigo-500 ring-2 ring-indigo-500/30 shadow-lg shadow-indigo-950/50'
                        : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-indigo-300 uppercase tracking-wider">{t.myMessShare || 'My Mess Share'}</span>
                      <div className="flex items-center gap-1.5">
                        {paymentTarget === 'MESS' && (
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                            {t.selectedBadge || 'Selected'}
                          </span>
                        )}
                        <Users className="w-4 h-4 text-indigo-400" />
                      </div>
                    </div>
                    <div className="text-2xl font-black text-white mt-1.5 tracking-tight font-mono">
                      {hideBalance ? '••••••' : `${t.currency} ${messShareBal.toFixed(3)}`}
                    </div>
                    <div className="text-[11px] text-indigo-300/80 mt-1 truncate">
                      {ledger.messes && ledger.messes.length > 1
                        ? `${ledger.messes.length} ${t.combinedRooms || 'Mess Groups Combined'}`
                        : (t.sharedRoomSplit || 'Your shared room split debt')}
                    </div>
                  </div>
                )}

                {/* 3. Separate Full Mess Room Balances for EACH enrolled mess */}
                {ledger.messes && ledger.messes.length > 0 && ledger.messes.map((m) => {
                  const isSelected = paymentTarget === 'MESS_GROUP' && selectedPaymentMessId === m.id;
                  const gTotal = Number(m.groupTotal ?? m.totalBalance ?? 0);
                  const mShare = Number(m.memberShare ?? m.myShare ?? 0);
                  const mName = m.group_name || m.name || 'Room Mess';
                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        setPaymentTarget('MESS_GROUP');
                        setSelectedPaymentMessId(m.id);
                        setPayAmount('');
                      }}
                      className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer relative overflow-hidden ${
                        isSelected
                          ? 'bg-purple-950/70 border-purple-500 ring-2 ring-purple-500/30 shadow-lg shadow-purple-950/50'
                          : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-purple-300 uppercase tracking-wider truncate" title={mName}>
                          {t.fullMess || 'Full Mess'}: {mName}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isSelected && (
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                              {t.selectedBadge || 'Selected'}
                            </span>
                          )}
                          <Users className="w-4 h-4 text-purple-400" />
                        </div>
                      </div>
                      <div className="text-2xl font-black text-white mt-1.5 tracking-tight font-mono">
                        {hideBalance ? '••••••' : `${t.currency} ${gTotal.toFixed(3)}`}
                      </div>
                      <div className="text-[11px] text-purple-300/80 mt-1 flex items-center justify-between">
                        <span className="truncate">Share: {t.currency} {mShare.toFixed(3)}</span>
                        <span className="shrink-0">{m.memberCount || 2} {t.membersLabel || 'members'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Target Description Alert Note */}
              {paymentTarget === 'MESS_GROUP' && (
                <div className="mt-3 p-3 bg-purple-950/50 border border-purple-800/60 rounded-2xl text-purple-200 text-xs flex items-start gap-2.5">
                  <Users className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-purple-300">
                      {targetName} Settlement ({t.currency} {targetDebt.toFixed(3)})
                    </div>
                    <p className="text-[11px] text-purple-300/80 mt-0.5 leading-relaxed">
                      Clears collective room debt for all members. Personal tab ({t.currency} {personalBal.toFixed(3)}) will NOT be deducted or affected.
                    </p>
                  </div>
                </div>
              )}
              {paymentTarget === 'PERSONAL' && (
                <div className="mt-3 p-3 bg-emerald-950/50 border border-emerald-800/60 rounded-2xl text-emerald-200 text-xs flex items-start gap-2.5">
                  <User className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-emerald-300">
                      {targetName} Settlement ({t.currency} {targetDebt.toFixed(3)})
                    </div>
                    <p className="text-[11px] text-emerald-300/80 mt-0.5 leading-relaxed">
                      Clears only your private supermarket purchases. Mess group debts remain untouched.
                    </p>
                  </div>
                </div>
              )}
              {paymentTarget === 'MESS' && (
                <div className="mt-3 p-3 bg-indigo-950/50 border border-indigo-800/60 rounded-2xl text-indigo-200 text-xs flex items-start gap-2.5">
                  <Users className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-indigo-300">
                      {targetName} Settlement ({t.currency} {targetDebt.toFixed(3)})
                    </div>
                    <p className="text-[11px] text-indigo-300/80 mt-0.5 leading-relaxed">
                      Clears your personal split share across room messes ({t.currency} {messShareBal.toFixed(3)}).
                    </p>
                  </div>
                </div>
              )}
              {paymentTarget === 'CASH_ADVANCE' && (
                <div className="mt-3 p-3 bg-amber-950/50 border border-amber-800/60 rounded-2xl text-amber-200 text-xs flex items-start gap-2.5">
                  <CreditCard className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-amber-300">
                      {targetName} Settlement ({t.currency} {targetDebt.toFixed(3)})
                    </div>
                    <p className="text-[11px] text-amber-300/80 mt-0.5 leading-relaxed">
                      Settle your emergency payday cash advance via BenefitPay. Grocery tab balance will remain untouched.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Card Security Deposit (Custodial Trust Badge) */}
          {ledger.card_type === 'DIGITAL_PASS' ? (
            <div className="my-4 p-4 bg-sky-950/60 border border-sky-800/60 rounded-2xl text-left no-print">
              <div className="flex items-center gap-2 font-bold text-sm text-sky-400">
                <span>📱</span>
                <span>Free Digital Pass Active (0.000 BHD Deposit)</span>
              </div>
              <p className="text-[11px] text-sky-200/80 mt-1 leading-relaxed">
                Your account is active via Digital Pass on your mobile device. No physical card deposit was collected or required.
              </p>
            </div>
          ) : (Number(ledger.card_deposit_amount || 0) > 0 || ledger.card_deposit_status === 'HELD') ? (
            <div className="my-4 p-4 bg-emerald-950/60 border border-emerald-800/60 rounded-2xl text-left no-print">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-400">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span>Card Security Deposit Held in Custodial Trust</span>
                </div>
                <span className="font-mono font-black text-sm text-emerald-300 bg-emerald-900/60 border border-emerald-700/60 px-2 py-0.5 rounded-lg">
                  {t.currency} {Number(ledger.card_deposit_amount || 3).toFixed(3)}
                </span>
              </div>
              <p className="text-[11px] text-emerald-200/90 mt-1.5 leading-relaxed">
                <strong>100% Refundable in Cash (أمانة مستردة):</strong> Held in custodial trust under Bahrain NBR 0% VAT rules. Fully refunded in cash at the store counter upon returning your physical NFC card with zero outstanding grocery debt.
              </p>
              {ledger.card_deposit_receipt_no && (
                <div className="text-[10px] text-emerald-400/80 font-mono mt-1">
                  Receipt: #{ledger.card_deposit_receipt_no}
                </div>
              )}
            </div>
          ) : null}

          {/* Payday Cash Advance (Salfah / سلفة نقدية) Banner */}
          {Number(ledger.cash_advance_balance || 0) > 0 && (
            <div className="my-4 p-4 bg-amber-950/60 border border-amber-800/60 rounded-2xl text-left no-print">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm text-amber-400">
                  <CreditCard className="w-5 h-5 text-amber-400" />
                  <span>Payday Cash Advance (سلفة نقدية)</span>
                </div>
                <span className="font-mono font-black text-sm text-amber-300 bg-amber-900/60 border border-amber-700/60 px-2 py-0.5 rounded-lg">
                  {t.currency} {Number(ledger.cash_advance_balance).toFixed(3)}
                </span>
              </div>
              <p className="text-[11px] text-amber-200/90 mt-1.5 leading-relaxed">
                Emergency salary cash advance dispensed from supermarket till. Repayable on your next company payday ({ledger.payday_day_of_month || 28}th).
              </p>
            </div>
          )}

          {/* Payment Section (Targeted Full or Partial Settlement) */}
          {isTargetDebt ? (
            <div className="space-y-3 no-print">
              {/* Quick Target Filter Pills */}
              {(ledger.hasMessGroup || (ledger.messes && ledger.messes.length > 0) || Number(ledger.cash_advance_balance || 0) > 0) && (
                <div className="flex flex-wrap gap-1.5 p-1 bg-slate-950/80 rounded-2xl border border-slate-800 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentTarget('ALL');
                      setSelectedPaymentMessId(null);
                      setPayAmount('');
                    }}
                    className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer ${
                      paymentTarget === 'ALL'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white bg-slate-900'
                    }`}
                  >
                    {t.allDebt || 'All Debt'} ({t.currency} {balanceNum.toFixed(3)})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentTarget('PERSONAL');
                      setSelectedPaymentMessId(null);
                      setPayAmount('');
                    }}
                    className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer ${
                      paymentTarget === 'PERSONAL'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white bg-slate-900'
                    }`}
                  >
                    {t.personalTab || 'Personal'} ({t.currency} {personalBal.toFixed(3)})
                  </button>
                  {Number(ledger.cash_advance_balance || 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentTarget('CASH_ADVANCE');
                        setSelectedPaymentMessId(null);
                        setPayAmount('');
                      }}
                      className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer ${
                        paymentTarget === 'CASH_ADVANCE'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-amber-300 hover:text-white bg-slate-900 border border-amber-800/60'
                      }`}
                    >
                      Salfah ({t.currency} {Number(ledger.cash_advance_balance).toFixed(3)})
                    </button>
                  )}
                  {(ledger.hasMessGroup || (ledger.messes && ledger.messes.length > 0)) && (
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentTarget('MESS');
                        setSelectedPaymentMessId(null);
                        setPayAmount('');
                      }}
                      className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer ${
                        paymentTarget === 'MESS'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-white bg-slate-900'
                      }`}
                    >
                      {t.myMessShare || 'My Share'} ({t.currency} {messShareBal.toFixed(3)})
                    </button>
                  )}
                  {ledger.messes && ledger.messes.map(m => {
                    const isSelected = paymentTarget === 'MESS_GROUP' && selectedPaymentMessId === m.id;
                    const gTotal = Number(m.groupTotal ?? m.totalBalance ?? 0);
                    const mName = m.group_name || m.name || 'Room';
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setPaymentTarget('MESS_GROUP');
                          setSelectedPaymentMessId(m.id);
                          setPayAmount('');
                        }}
                        className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer ${
                          isSelected
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'text-purple-300 hover:text-white bg-slate-900 border border-purple-800/40'
                        }`}
                      >
                        {t.fullMess || 'Full'} [{mName}] ({t.currency} {gTotal.toFixed(3)})
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Quick Chip Partial Amount Selectors */}
              {(() => {
                const chips = getDynamicQuickChips(targetDebt);
                return (
                  <div className={`grid ${chips.length >= 3 ? 'grid-cols-4' : chips.length === 2 ? 'grid-cols-3' : chips.length === 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-2 text-xs font-bold font-mono`}>
                    {chips.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => handlePay(amt)}
                        disabled={paying}
                        className="py-2.5 px-1 bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 rounded-xl border border-slate-700 text-slate-200 transition cursor-pointer"
                      >
                        {amt.toFixed(3)} {t.currency}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setShowCustomPay(!showCustomPay)}
                      className={`py-2.5 px-1 rounded-xl border text-slate-200 transition cursor-pointer ${
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
                    placeholder={`Min 0.100 (Max: ${targetDebt.toFixed(3)})`}
                    className="w-full text-center py-2.5 px-3 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-sm focus:border-emerald-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handlePay(payAmount)}
                    disabled={paying || !payAmount || Number(payAmount) < 0.100}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 font-bold text-xs rounded-xl transition cursor-pointer"
                  >
                    {t.payCustomBtn || 'Pay Custom Amount'}
                  </button>
                </div>
              )}

              {/* Primary Targeted Settle Button */}
              <button
                onClick={() => handlePay(targetDebt)}
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
                    <span>
                      {t.payBtn} • {targetName} ({t.currency} {targetDebt.toFixed(3)})
                    </span>
                    <span className="text-emerald-200">→</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold py-4 rounded-2xl text-base flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              <span>{t.allSettled} ({targetName})</span>
            </div>
          )}

          {/* Full Transaction History with Dates & Running Balances */}
          {(() => {
            const allTransactions = ledger.transactions || ledger.recentPurchases || ledger.ledger || [];
            if (allTransactions.length === 0) {
              return (
                <div className="my-4 p-6 bg-slate-950/80 border border-slate-800 rounded-2xl text-center space-y-2">
                  <div className="w-10 h-10 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-400">
                    <ShoppingBag className="w-5 h-5 text-slate-500" />
                  </div>
                  <p className="text-xs font-bold text-slate-300 font-sans">
                    {t.noRecentPurchases || 'No transactions recorded'}
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                    When grocery purchases or BenefitPay payments are recorded on your account, they will appear here with full itemized tax receipts.
                  </p>
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

            const messTransactions = allTransactions.filter(tx => {
              const ref = (tx.reference || '').toLowerCase();
              const type = (tx.type || '').toUpperCase();
              return Boolean(
                tx.subledger_type === 'MESS_SHARE' ||
                tx.mess_id || 
                tx.category === 'MESS_SPLIT' || 
                ref.includes('mess split') || 
                type.includes('MESS')
              );
            });

            const personalTransactions = allTransactions.filter(tx => {
              const ref = (tx.reference || '').toLowerCase();
              const type = (tx.type || '').toUpperCase();
              if (tx.subledger_type === 'PERSONAL') return true;
              if (tx.subledger_type === 'MESS_SHARE') return false;
              return !tx.mess_id && tx.category !== 'MESS_SPLIT' && !ref.includes('mess split') && !type.includes('MESS');
            });

            const hasMessTransactions = messTransactions.length > 0 || Boolean(ledger.hasMessGroup);

            // Filter by Active Tab
            let tabFiltered = allTransactions;
            if (txFilter === 'PURCHASE') tabFiltered = purchases;
            else if (txFilter === 'PAYMENT') tabFiltered = payments;
            else if (txFilter === 'MESS') tabFiltered = messTransactions;
            else if (txFilter === 'PERSONAL') tabFiltered = personalTransactions;

            // Filter by Search Query
            const query = (txSearch || '').trim().toLowerCase();
            const displayedTransactions = query
              ? tabFiltered.filter(tx => {
                  if (tx.reference && tx.reference.toLowerCase().includes(query)) return true;
                  if (tx.invoiceNo && tx.invoiceNo.toLowerCase().includes(query)) return true;
                  if (tx.id && String(tx.id).toLowerCase().includes(query)) return true;
                  if (tx.categoryBadge && tx.categoryBadge.toLowerCase().includes(query)) return true;
                  if (tx.messName && tx.messName.toLowerCase().includes(query)) return true;
                  if (String(tx.amount || '').includes(query)) return true;
                  if (Array.isArray(tx.items)) {
                    for (const it of tx.items) {
                      if (it.name && it.name.toLowerCase().includes(query)) return true;
                      if (it.nameAr && it.nameAr.toLowerCase().includes(query)) return true;
                      if (it.barcode && String(it.barcode).toLowerCase().includes(query)) return true;
                    }
                  }
                  return false;
                })
              : tabFiltered;

            const visibleItems = displayedTransactions.slice(0, visibleTxCount);
            const hasMore = displayedTransactions.length > visibleTxCount;

            return (
              <div ref={transactionsSectionRef} className="my-4 p-4 bg-slate-950/80 border border-slate-800 rounded-2xl text-left">
                {/* Header & Badges */}
                <div className="flex items-center justify-between gap-2.5 mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-sans">
                      {t.transactionsHistory || 'Transaction History'}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                      {allTransactions.length}
                    </span>
                  </div>
                  {query && (
                    <span className="text-[10px] font-mono text-emerald-400">
                      {displayedTransactions.length} found
                    </span>
                  )}
                </div>

                {/* Instant Search Bar */}
                <div className="relative mb-3">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={txSearch}
                    onChange={(e) => {
                      setTxSearch(e.target.value);
                      setVisibleTxCount(10);
                    }}
                    placeholder={t.searchTxPlaceholder || 'Search transactions, items, or invoice #...'}
                    className="w-full pl-8.5 pr-8 py-2 bg-slate-900 border border-slate-800 focus:border-emerald-500/60 rounded-xl text-xs text-white placeholder-slate-500 outline-none font-mono transition"
                  />
                  {txSearch && (
                    <button
                      type="button"
                      onClick={() => setTxSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 rounded-md cursor-pointer transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Horizontally Scrollable Category Filter Pills */}
                <div className="flex items-center gap-1 text-[11px] font-semibold bg-slate-900 p-1 rounded-xl border border-slate-800 overflow-x-auto no-scrollbar mb-3">
                  <button
                    type="button"
                    onClick={() => { setTxFilter('ALL'); setVisibleTxCount(10); }}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer shrink-0 ${
                      txFilter === 'ALL'
                        ? 'bg-slate-700 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t.filterAll || 'All'} ({allTransactions.length})
                  </button>
                  {hasMessTransactions && (
                    <>
                      <button
                        type="button"
                        onClick={() => { setTxFilter('PERSONAL'); setVisibleTxCount(10); }}
                        className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer shrink-0 ${
                          txFilter === 'PERSONAL'
                            ? 'bg-slate-700 text-white shadow-xs'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {t.filterPersonal || 'Personal Tab'} ({personalTransactions.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => { setTxFilter('MESS'); setVisibleTxCount(10); }}
                        className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                          txFilter === 'MESS'
                            ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 shadow-xs'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Users className="w-3 h-3" />
                        <span>{t.filterMess || 'Mess Splits'} ({messTransactions.length})</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => { setTxFilter('PURCHASE'); setVisibleTxCount(10); }}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer shrink-0 ${
                      txFilter === 'PURCHASE'
                        ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60 shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t.filterPurchases || 'Purchases'} ({purchases.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTxFilter('PAYMENT'); setVisibleTxCount(10); }}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer shrink-0 ${
                      txFilter === 'PAYMENT'
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t.filterPayments || 'Payments'} ({payments.length})
                  </button>
                </div>

                {/* Filter & Counter Bar */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-2 px-0.5">
                  <span>
                    {t.showingCount || 'Showing'} <strong className="text-emerald-400">{visibleItems.length}</strong> {t.of || 'of'} <strong className="text-white">{displayedTransactions.length}</strong>
                  </span>
                  {query && (
                    <button
                      type="button"
                      onClick={() => setTxSearch('')}
                      className="text-emerald-400 hover:underline text-[10px] font-sans cursor-pointer"
                    >
                      {t.clearSearch || 'Clear search'}
                    </button>
                  )}
                </div>

                {/* List of Interactive Itemized Transactions */}
                {visibleItems.length > 0 ? (
                  <div className="space-y-2.5">
                    {visibleItems.map((tx, idx) => (
                      <TransactionItemCard
                        key={tx.id || idx}
                        tx={tx}
                        lang={lang}
                        currency={t.currency || 'BHD'}
                        highlighted={Boolean(
                          receiptInv && (
                            String(tx.invoiceNo || '').includes(receiptInv) ||
                            String(tx.reference || '').includes(receiptInv) ||
                            String(tx.id || '') === receiptInv
                          )
                        )}
                        onViewReceipt={(inv) => setSelectedReceipt(inv)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center space-y-2.5">
                    <p className="text-xs text-slate-400">
                      {t.noTxFound || 'No transactions matching your search'} {query && `"${query}"`}
                    </p>
                    <button
                      type="button"
                      onClick={() => { setTxSearch(''); setTxFilter('ALL'); }}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-emerald-400 rounded-xl text-xs font-semibold cursor-pointer transition"
                    >
                      {t.clearSearch || 'Reset Filters'}
                    </button>
                  </div>
                )}

                {/* Show More / Show Less Pagination Button */}
                {displayedTransactions.length > 10 && (
                  <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-center gap-2">
                    {hasMore ? (
                      <button
                        type="button"
                        onClick={() => setVisibleTxCount(prev => prev + 15)}
                        className="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-850 text-emerald-400 border border-slate-700/80 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <span>{t.showMore || 'Show More'} ({displayedTransactions.length - visibleTxCount} remaining)</span>
                        <span>↓</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setVisibleTxCount(10)}
                        className="py-1.5 px-4 bg-slate-900 hover:bg-slate-850 text-slate-400 border border-slate-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
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
              href={`https://wa.me/${STORE_WHATSAPP}?text=Hello%20Layali%2C%20I%20have%20a%20question%20about%20my%20Khata%20bill.`}
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

      {/* BenefitPay Fawri+ Payment Modal & Drawers */}
      <Suspense fallback={null}>
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
      </Suspense>
    </div>
  );
}
