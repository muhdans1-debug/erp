import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Search, 
  Phone, 
  ShieldCheck, 
  ArrowRight, 
  User, 
  QrCode, 
  Camera, 
  X, 
  Upload, 
  PhoneCall, 
  MessageCircle,
  AlertCircle,
  Download,
  RefreshCw,
  WifiOff
} from 'lucide-react';

const TRANSLATIONS = {
  en: {
    title: 'Customer Khata Portal',
    subtitle: 'View your digital grocery tab, itemized receipts & settle online.',
    searchPlaceholder: 'Enter Phone, Name, CPR, or ID',
    searchBtn: 'Find My Account',
    recentTab: 'Previously Viewed Accounts',
    noRecent: 'No accounts saved on this device yet.',
    orScan: 'Or scan the QR code printed on your Askar receipt.',
    scanReceiptBtn: 'Scan Receipt QR',
    scanModalTitle: 'Scan Receipt QR Code',
    pointCameraHint: 'Point your camera at the QR code printed on the bottom of your receipt.',
    orUploadPhoto: 'Upload receipt photo',
    closeBtn: 'Close Scanner',
    cameraPermissionErr: 'Unable to access camera. Please allow camera permissions or upload an image.',
    needHelp: 'Need help with your account?',
    callStore: 'Call Store Hotline',
    whatsappHelp: 'WhatsApp Support',
    secureNote: '100% Protected by BenefitPay & Fawri+',
    notFound: 'No active Khata account found. Please check your number or contact the cashier.',
    networkErr: 'No internet connection detected. Please check your mobile data or Wi-Fi.',
    offlineNotice: 'Offline Mode Active — You can open previously saved accounts below.',
    installAppBtn: 'Install Askar Khata App (1-Click)',
    updateAvailable: 'New version available! Refresh to update.',
    refreshNow: 'Refresh',
    currency: 'BHD'
  },
  ar: {
    title: 'بوابة دفتر حسابات الزبائن',
    subtitle: 'عرض فواتير البقالة الرقمية، تفاصيل الحساب والسداد إلكترونياً.',
    searchPlaceholder: 'أدخل رقم الهاتف أو الاسم أو الرقم السكاني',
    searchBtn: 'البحث عن حسابي',
    recentTab: 'الحسابات السابقة على هذا الجهاز',
    noRecent: 'لا توجد حسابات محفوظة حتى الآن.',
    orScan: 'أو امسح رمز الاستجابة السريعة (QR) المطبوع على إيصال أسكر.',
    scanReceiptBtn: 'مسح رمز الإيصال (QR)',
    scanModalTitle: 'مسح رمز الاستجابة السريعة للإيصال',
    pointCameraHint: 'وجّه الكاميرا بثبات نحو رمز الاستجابة السريعة أسفل الإيصال.',
    orUploadPhoto: 'رفع صورة الإيصال',
    closeBtn: 'إغلاق الكاميرا',
    cameraPermissionErr: 'تعذر الوصول إلى الكاميرا. يرجى السماح بالإذن أو رفع صورة.',
    needHelp: 'هل تحتاج مساعدة في حسابك؟',
    callStore: 'الاتصال بالفرع مباشرة',
    whatsappHelp: 'دعم واتساب الفوري',
    secureNote: 'محمي بالكامل عبر بنفت بي وفوري+',
    notFound: 'لم يتم العثور على حساب نشط. يرجى التأكد من الرقم أو مراجعة الكاشير.',
    networkErr: 'لا يوجد اتصال بالإنترنت. يرجى التحقق من بيانات الهاتف أو الواي فاي.',
    offlineNotice: 'وضع عدم الاتصال مفعل — يمكنك فتح الحسابات المحفوظة أدناه.',
    installAppBtn: 'تثبيت تطبيق أسكر خاتا على هاتفك',
    updateAvailable: 'يتوفر تحديث جديد للتطبيق! اضغط للتحديث.',
    refreshNow: 'تحديث',
    currency: 'د.ب'
  },
  ml: {
    title: 'കസ്റ്റമർ ഖാത്ത പോർട്ടൽ',
    subtitle: 'നിങ്ങളുടെ ഗ്രോസറി ബില്ലുകളും കുടിശ്ശിക വിവരങ്ങളും ഓൺലൈനിൽ കാണുക.',
    searchPlaceholder: 'ഫോൺ നമ്പർ അല്ലെങ്കിൽ കസ്റ്റമർ ഐഡി നൽകുക',
    searchBtn: 'അക്കൗണ്ട് കണ്ടെത്തുക',
    recentTab: 'ഈ ഫോണിൽ നേരത്തെ തുറന്ന അക്കൗണ്ടുകൾ',
    noRecent: 'സേവ് ചെയ്ത അക്കൗണ്ടുകൾ ലഭ്യമല്ല.',
    orScan: 'അല്ലെങ്കിൽ അസ്കർ ബില്ലിലെ QR കോഡ് സ്കാൻ ചെയ്യുക.',
    scanReceiptBtn: 'ബില്ലിലെ QR സ്കാൻ ചെയ്യുക',
    scanModalTitle: 'ബില്ലിലെ QR കോഡ് സ്കാൻ ചെയ്യുക',
    pointCameraHint: 'ബില്ലിന്റെ അടിയിലുള്ള QR കോഡിന് നേരെ ക്യാമറ പിടിക്കുക.',
    orUploadPhoto: 'ഫോട്ടോ അപ്‌ലോഡ് ചെയ്യുക',
    closeBtn: 'അടയ്ക്കുക',
    cameraPermissionErr: 'ക്യാമറ ആക്‌സസ് ചെയ്യാൻ കഴിഞ്ഞില്ല. അനുമതി നൽകുക അല്ലെങ്കിൽ ഫോട്ടോ എടുക്കുക.',
    needHelp: 'സഹായം ആവശ്യമുണ്ടോ?',
    callStore: 'കടയിലേക്ക് വിളിക്കുക',
    whatsappHelp: 'വാട്ട്സ്ആപ്പ് സഹായം',
    secureNote: 'ബെനിഫിറ്റ് പേ വഴി സുരക്ഷിതമായ പേയ്‌മെന്റ്',
    notFound: 'അക്കൗണ്ട് കണ്ടെത്താൻ കഴിഞ്ഞില്ല. ദയവായി നമ്പർ പരിശോധിക്കുക.',
    networkErr: 'ഇന്റർനെറ്റ് കണക്ഷൻ ലഭ്യമല്ല. ദയവായി പരിശോധിക്കുക.',
    offlineNotice: 'ഓഫ്‌ലൈൻ മോഡ് — സേവ് ചെയ്ത അക്കൗണ്ടുകൾ താഴെ ലഭ്യമാണ്.',
    installAppBtn: 'ആപ്പ് ഫോണിൽ ഇൻസ്റ്റാൾ ചെയ്യുക',
    updateAvailable: 'പുതിയ അപ്ഡേറ്റ് ലഭ്യമാണ്! റീഫ്രഷ് ചെയ്യുക.',
    refreshNow: 'റീഫ്രഷ്',
    currency: 'BHD'
  },
  bn: {
    title: 'গ্রাহক খাতা পোর্টাল',
    subtitle: 'আপনার ডিজিটাল মুদির বাকি হিসাব দেখুন এবং অনলাইনে পরিশোধ করুন।',
    searchPlaceholder: 'ফোন নম্বর, নাম বা কাস্টমার আইডি লিখুন',
    searchBtn: 'অ্যাকাউন্ট খুঁজুন',
    recentTab: 'পূর্বে দেখা অ্যাকাউন্টসমূহ',
    noRecent: 'এখনও কোনো অ্যাকাউন্ট সংরক্ষিত নেই।',
    orScan: 'অথবা রশিদে থাকা QR কোড স্ক্যান করুন।',
    scanReceiptBtn: 'রসিদের QR স্ক্যান করুন',
    scanModalTitle: 'রসিদের QR কোড স্ক্যান',
    pointCameraHint: 'রসিদের নিচের QR কোডের দিকে ক্যামেরা তাক করুন।',
    orUploadPhoto: 'রসিদের ছবি আপলোড করুন',
    closeBtn: 'বন্ধ করুন',
    cameraPermissionErr: 'ক্যামেরা চালু করা যায়নি। অনুগ্রহ করে অনুমতি দিন অথবা ছবি আপলোড করুন।',
    needHelp: 'কোনো সাহায্য প্রয়োজন?',
    callStore: 'দোকানে সরাসরি কল করুন',
    whatsappHelp: 'হোয়াটসঅ্যাপ সহায়তা',
    secureNote: 'বেনিফিট পে দ্বারা ১০০% সুরক্ষিত',
    notFound: 'কোনো খাতা অ্যাকাউন্ট পাওয়া যায়নি।',
    networkErr: 'ইন্টারনেট সংযোগ নেই। দয়া করে সংযোগ পরীক্ষা করুন।',
    offlineNotice: 'অফলাইন মোড — পূর্বে সংরক্ষিত অ্যাকাউন্ট নিচে দেখুন।',
    installAppBtn: 'ফোনে অ্যাপ ইনস্টল করুন',
    updateAvailable: 'নতুন আপডেট পাওয়া গেছে! রিফ্রেশ করুন।',
    refreshNow: 'রিফ্রেশ',
    currency: 'BHD'
  },
  hi: {
    title: 'ग्राहक खाता पोर्टल',
    subtitle: 'अपना किराना हिसाब, बिल विवरण देखें और ऑनलाइन भुगतान करें।',
    searchPlaceholder: 'फ़ोन नंबर, नाम या ग्राहक आईडी दर्ज करें',
    searchBtn: 'मेरा खाता ढूंढें',
    recentTab: 'हाल ही में देखे गए खाते',
    noRecent: 'इस डिवाइस पर कोई खाता सहेजा नहीं गया है।',
    orScan: 'या अपनी रसीद पर मुद्रित QR कोड स्कैन करें।',
    scanReceiptBtn: 'रसीद का QR स्कैन करें',
    scanModalTitle: 'रसीद का QR कोड स्कैन करें',
    pointCameraHint: 'रसीद के नीचे दिए गए QR कोड पर कैमरा सीधा रखें।',
    orUploadPhoto: 'रसीद की फोटो अपलोड करें',
    closeBtn: 'कैमरा बंद करें',
    cameraPermissionErr: 'कैमरा शुरू नहीं हो सका। कृपया अनुमति दें या फोटो अपलोड करें।',
    needHelp: 'क्या आपको सहायता चाहिए?',
    callStore: 'दुकान पर कॉल करें',
    whatsappHelp: 'व्हाट्सएप सहायता',
    secureNote: 'बेनिफिट पे और फॉरी+ द्वारा सुरक्षित',
    notFound: 'कोई खाता नहीं मिला। कृपया नंबर जांचें या कैशियर से संपर्क करें।',
    networkErr: 'इंटरनेट कनेक्शन नहीं है। कृपया मोबाइल डेटा या वाई-फाई जांचें।',
    offlineNotice: 'ऑफलाइन मोड — नीचे सहेजे गए खाते उपलब्ध हैं।',
    installAppBtn: 'फोन में ऐप इंस्टॉल करें',
    updateAvailable: 'नया अपडेट उपलब्ध है! रिफ्रेश करें।',
    refreshNow: 'रिफ्रेश',
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

export default function HomeLookup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [lang, setLang] = useState('en');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);

  // In-App PWA Installation Prompt State (Resolved PWA-OFF-03)
  const [installPrompt, setInstallPrompt] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // Embedded Camera QR Scanner Modal States (ADV-11)
  const [isScannerOpen, setIsScannerOpen] = useState(() => searchParams.get('action') === 'scan');
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  // Synchronize HTML document lang & dir for screen readers (Resolved PWA-ACC-03)
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  // Listen for online/offline connectivity changes
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Capture beforeinstallprompt for in-app install button (Resolved PWA-OFF-03)
  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    const handleAppInstalled = () => {
      setInstallPrompt(null);
    };
    const handlePwaUpdate = () => {
      setUpdateAvailable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('pwa-update-available', handlePwaUpdate);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-update-available', handlePwaUpdate);
    };
  }, []);

  // Deduplicated Recent Accounts across all cached tabs & statements (Resolved PWA-ACC-04)
  const [recentAccounts] = useState(() => {
    try {
      const keys = Object.keys(localStorage).filter(k => 
        k.startsWith('khata_name_') || k.startsWith('khata_tab_cache_') || k.startsWith('khata_pin_')
      );
      const seenIds = new Set();
      const seenNames = new Set();
      const accounts = [];

      for (const k of keys) {
        const id = k.replace(/^(khata_name_|khata_tab_cache_|khata_pin_)/, '');
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);

        const name = localStorage.getItem(`khata_name_${id}`) || 'Saved Account';
        if (!seenNames.has(name.toLowerCase())) {
          seenNames.add(name.toLowerCase());
          accounts.push({ id, name });
        }
      }
      return accounts;
    } catch {
      return [];
    }
  });

  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
  const isRtl = lang === 'ar';

  const handleSearch = async (e) => {
    e?.preventDefault();
    const clean = normalizeArabicNumerals(query).trim();
    if (!clean || clean.length < 2) return;

    setLoading(true);
    setError('');
    setSearchResults([]);

    try {
      const res = await fetch('/api/customers/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: clean })
      });
      const data = await res.json();

      if (res.ok && data.matches && data.matches.length > 0) {
        if (data.matches.length === 1) {
          navigate(`/tab/${data.matches[0].id}`);
        } else {
          setSearchResults(data.matches);
        }
      } else {
        setError(t.notFound);
      }
    } catch {
      setError(t.networkErr);
    } finally {
      setLoading(false);
    }
  };

  // Robust QR Code payload parsing for all deep links (Resolved PWA-INT-01)
  const handleDetectedCode = useCallback((raw) => {
    if (!raw) return;
    const str = String(raw).trim();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScannerOpen(false);

    let targetRoute = '';
    if (str.startsWith('http://') || str.startsWith('https://')) {
      try {
        const parsed = new URL(str);
        const p = parsed.pathname;
        if (p.startsWith('/tab/') || p.startsWith('/statement/') || p.startsWith('/khata/') || p.startsWith('/customer/') || p.startsWith('/pay/')) {
          targetRoute = `${p}${parsed.search || ''}`;
        }
      } catch {}
    } else {
      const match = str.match(/\/(tab|statement|khata|customer|pay)\/([a-zA-Z0-9_\-%]+)/i);
      if (match) {
        targetRoute = `/${match[1].toLowerCase()}/${match[2]}`;
      }
    }

    if (targetRoute) {
      navigate(targetRoute);
      return;
    }

    // Direct fallback for plain customer phone or UUID string
    navigate(`/tab/${encodeURIComponent(normalizeArabicNumerals(str))}`);
  }, [navigate]);

  // Start Camera Stream when Scanner opens
  useEffect(() => {
    if (!isScannerOpen) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      return;
    }

    let isSubscribed = true;
    let detectorTimer = null;

    const startCamera = async () => {
      setCameraError('');
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera API not supported on this browser');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });

        if (!isSubscribed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        // Native BarcodeDetector loop if supported by browser
        if ('BarcodeDetector' in window) {
          const barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
          detectorTimer = setInterval(async () => {
            if (!videoRef.current || videoRef.current.readyState < 2) return;
            try {
              const barcodes = await barcodeDetector.detect(videoRef.current);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                clearInterval(detectorTimer);
                handleDetectedCode(barcodes[0].rawValue);
              }
            } catch {
              // Frame scan skipped
            }
          }, 300);
        }
      } catch (err) {
        console.warn('Camera stream error:', err);
        if (isSubscribed) {
          setCameraError(t.cameraPermissionErr);
        }
      }
    };

    startCamera();

    return () => {
      isSubscribed = false;
      if (detectorTimer) clearInterval(detectorTimer);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [isScannerOpen, handleDetectedCode, t.cameraPermissionErr]);

  // Fallback: decode QR code from an uploaded receipt photo
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if ('BarcodeDetector' in window) {
      try {
        const imageBitmap = await createImageBitmap(file);
        const barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const barcodes = await barcodeDetector.detect(imageBitmap);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          handleDetectedCode(barcodes[0].rawValue);
          return;
        }
      } catch (err) {
        console.warn('Barcode detect from image error:', err);
      }
    }
    setCameraError('No QR code detected in the selected image. Please try again or type your phone number.');
  };

  const closeScanner = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScannerOpen(false);
    setCameraError('');
  };

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  return (
    <div 
      dir={isRtl ? 'rtl' : 'ltr'} 
      className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-between p-4 pt-safe pb-safe selection:bg-emerald-500 selection:text-white"
    >
      {/* Top Bar: Brand & Language Toggle (Min 44px Touch Targets) */}
      <header className="w-full max-w-md flex items-center justify-between pt-2 pb-2 no-print">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black text-base shadow-xs">
            A
          </div>
          <div>
            <span className="font-black text-sm tracking-tight text-white uppercase block leading-none">Askar Khata</span>
            <span className="text-[10px] text-slate-400 font-mono">Bahrain • NBR Tax</span>
          </div>
        </div>

        {/* Large Accessible Language Switcher */}
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
      </header>

      {/* Main Card */}
      <main className="w-full max-w-md my-auto py-2">
        {/* Offline Notification Pill */}
        {isOffline && (
          <div className="mb-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-300 text-xs font-semibold flex items-center gap-2 justify-center no-print">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{t.offlineNotice}</span>
          </div>
        )}

        {/* PWA Version Update Toast (Resolved PWA-OFF-04) */}
        {updateAvailable && (
          <div className="mb-3 p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-200 text-xs font-semibold flex items-center justify-between no-print">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
              <span>{t.updateAvailable}</span>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="py-1 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition"
            >
              {t.refreshNow}
            </button>
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          {/* Subtle Glow */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="text-center mb-6">
            <span className="text-[10px] font-mono tracking-widest uppercase px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
              Official Self-Service Portal
            </span>
            <h1 className="text-2xl font-black text-white tracking-tight mt-3 mb-1">
              {t.title}
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t.subtitle}
            </p>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="space-y-3 no-print">
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (error) setError('');
                }}
                placeholder={t.searchPlaceholder}
                className={`w-full py-4 bg-slate-950 border border-slate-700 rounded-2xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium ${
                  isRtl ? 'pr-11 pl-4' : 'pl-11 pr-4'
                }`}
                autoFocus
              />
              <Phone className={`w-5 h-5 text-slate-500 absolute top-1/2 -translate-y-1/2 pointer-events-none ${isRtl ? 'right-4' : 'left-4'}`} />
            </div>

            <button
              type="submit"
              disabled={loading || query.trim().length < 2}
              className="w-full min-h-[52px] py-3.5 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 text-white font-bold rounded-2xl text-base transition-all shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  <span>{t.searchBtn}</span>
                </>
              )}
            </button>
          </form>

          {/* One-Touch Embedded Camera QR Scanner Launch Button (ADV-11) */}
          <div className="mt-3 no-print">
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="w-full min-h-[48px] py-3 px-4 bg-slate-950/80 hover:bg-slate-800 border border-emerald-500/40 text-emerald-400 font-bold rounded-2xl text-xs transition-all flex items-center justify-center gap-2.5 cursor-pointer shadow-xs active:scale-[0.99]"
            >
              <Camera className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{t.scanReceiptBtn}</span>
            </button>
          </div>

          {/* PWA In-App 1-Click Install Banner (Resolved PWA-OFF-03) */}
          {installPrompt && (
            <div className="mt-3 no-print">
              <button
                type="button"
                onClick={handleInstallClick}
                className="w-full min-h-[48px] py-3 px-4 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/50 text-emerald-300 font-bold rounded-2xl text-xs transition-all flex items-center justify-center gap-2.5 cursor-pointer shadow-xs"
              >
                <Download className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{t.installAppBtn}</span>
              </button>
            </div>
          )}

          {/* Error Notice */}
          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-center">
              <p className="text-xs font-semibold text-red-400">{error}</p>
            </div>
          )}

          {/* Multiple Matches Selection */}
          {searchResults.length > 1 && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Select Account:</p>
              {searchResults.map((cust) => {
                const custBal = Number(cust.balance || 0);
                const isCredit = custBal < -0.0005;
                const isSettled = Math.abs(custBal) < 0.0005;
                const absBalance = Math.abs(custBal).toFixed(3);
                return (
                  <button
                    key={cust.id}
                    type="button"
                    onClick={() => navigate(`/tab/${cust.id}`)}
                    className="w-full p-3.5 bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-between text-left transition-all"
                  >
                    <div>
                      <p className="text-sm font-bold text-white">{cust.name}</p>
                      {cust.maskedPhone && (
                        <p className="text-[10px] text-slate-400 font-mono">{cust.maskedPhone}</p>
                      )}
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <span className={`text-xs font-mono font-bold ${isCredit || isSettled ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isCredit ? `+${t.currency} ${absBalance}` : `${t.currency} ${absBalance}`}
                      </span>
                      <ArrowRight className={`w-4 h-4 text-slate-400 ${isRtl ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Deduplicated Previously Viewed Accounts on this Device (Resolved PWA-ACC-04) */}
          {recentAccounts.length > 0 && searchResults.length === 0 && (
            <div className="mt-6 pt-5 border-t border-slate-800">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <User className="w-4 h-4 text-emerald-400" />
                <span>{t.recentTab}</span>
              </p>
              <div className="space-y-2">
                {recentAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => navigate(`/tab/${acc.id}`)}
                    className="w-full min-h-[46px] p-3 bg-slate-950/60 hover:bg-slate-800 border border-slate-800/80 rounded-xl flex items-center justify-between text-left text-xs transition"
                  >
                    <span className="font-semibold text-slate-200">{acc.name}</span>
                    <span className="text-emerald-400 text-xs font-mono font-bold">Open →</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* QR Code Hint */}
          <div className="mt-6 pt-4 border-t border-slate-800/60 text-center no-print">
            <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5 leading-relaxed">
              <QrCode className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{t.orScan}</span>
            </p>
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
              href={`https://wa.me/${STORE_WHATSAPP}?text=Hello%20Askar%20Coldstore%2C%20I%20need%20assistance%20with%20my%20Khata%20account.`}
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

      {/* Footer Trust Badge */}
      <footer className="w-full max-w-md py-3 text-center no-print">
        <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>{t.secureNote}</span>
        </p>
      </footer>

      {/* Embedded Barcode & QR Camera Scanner Modal (ADV-11) */}
      {isScannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-between p-4 pt-safe pb-safe animate-in fade-in duration-200 no-print">
          {/* Header */}
          <div className="w-full max-w-md flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-emerald-400" />
              <h2 className="text-sm font-bold text-white">{t.scanModalTitle}</h2>
            </div>
            <button
              type="button"
              onClick={closeScanner}
              className="w-10 h-10 rounded-full bg-slate-800/90 text-slate-300 hover:text-white flex items-center justify-center"
              aria-label={t.closeBtn}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scanner Viewfinder */}
          <div className="relative w-full max-w-sm aspect-square bg-slate-950 rounded-3xl overflow-hidden border-2 border-emerald-500/60 shadow-2xl flex items-center justify-center my-auto">
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className="w-full h-full object-cover"
            />
            {/* Viewfinder Target Reticle */}
            <div className="absolute inset-8 border-2 border-emerald-400/80 rounded-2xl pointer-events-none flex items-center justify-center">
              <div className="w-full h-0.5 bg-emerald-400/80 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
            </div>

            {/* Error Message if Camera Access Denied */}
            {cameraError && (
              <div className="absolute inset-4 bg-slate-950/95 p-4 rounded-2xl flex flex-col items-center justify-center text-center">
                <AlertCircle className="w-8 h-8 text-amber-400 mb-2" />
                <p className="text-xs text-slate-300 font-medium mb-3">{cameraError}</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <Upload className="w-4 h-4" />
                  <span>{t.orUploadPhoto}</span>
                </button>
              </div>
            )}
          </div>

          {/* Bottom Actions */}
          <div className="w-full max-w-sm space-y-3 pb-4">
            {typeof window !== 'undefined' && !('BarcodeDetector' in window) && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs text-center leading-relaxed">
                💡 <strong>iPhone Tip:</strong> You can scan your receipt QR code directly with your iPhone Camera app to open your statement instantly! Or upload a photo below.
              </div>
            )}
            <p className="text-[11px] text-slate-400 text-center">{t.pointCameraHint}</p>
            
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileUpload}
            />

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[46px] py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-2xl flex items-center justify-center gap-1.5 transition"
              >
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>{t.orUploadPhoto}</span>
              </button>
              <button
                type="button"
                onClick={closeScanner}
                className="min-h-[46px] py-2.5 px-3 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold rounded-2xl transition"
              >
                {t.closeBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
