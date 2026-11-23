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
  WifiOff,
  Lock,
  Menu
} from 'lucide-react';
import HamburgerDrawer from '../components/HamburgerDrawer';

const TRANSLATIONS = {
  en: {
    title: 'Private Customer Khata',
    subtitle: 'Direct & secure grocery ledger access. Public searching is disabled for your privacy.',
    privacyBadge: 'Strict Privacy Active',
    privacyNote: 'To protect your financial privacy, searching other customers is disabled. Access your Khata directly by scanning your receipt QR code.',
    scanReceiptBtn: 'Scan Receipt QR to Open My Khata',
    orScan: 'Point camera at receipt QR code to open your account directly',
    scanModalTitle: 'Scan Receipt QR Code',
    pointCameraHint: 'Point your camera at the private QR code printed on your Layali receipt.',
    orUploadPhoto: 'Upload receipt photo',
    closeBtn: 'Close Scanner',
    cameraPermissionErr: 'Unable to access camera. Please allow camera permissions or upload an image.',
    needHelp: 'Need help opening your account?',
    callStore: 'Call Store Hotline',
    whatsappHelp: 'WhatsApp Support',
    secureNote: '100% Protected by BenefitPay & Fawri+',
    notFound: 'No private account found matching this key. Please scan your receipt QR code or ask the cashier.',
    networkErr: 'No internet connection detected. Please check your mobile data or Wi-Fi.',
    offlineNotice: 'Offline Mode Active.',
    installAppBtn: 'Install Layali Khata App (1-Click)',
    updateAvailable: 'New version available! Refresh to update.',
    refreshNow: 'Refresh',
    currency: 'BHD'
  },
  ar: {
    title: 'دفتر حسابات الزبائن الخاص',
    subtitle: 'وصول مباشر وآمن لحسابك. تم إيقاف البحث العام لحماية خصوصيتك المالية.',
    privacyBadge: 'حماية الخصوصية مفعلة',
    privacyNote: 'لحماية خصوصيتك المالية، تم إلغاء البحث عن حسابات الآخرين. يمكنك الدخول المباشر لحسابك بمسح رمز QR من إيصالك.',
    scanReceiptBtn: 'مسح رمز QR من الإيصال لفتح حسابي',
    orScan: 'وجّه الكاميرا نحو رمز QR على الإيصال للدخول المباشر',
    scanModalTitle: 'مسح رمز الاستجابة السريعة للإيصال',
    pointCameraHint: 'وجّه الكاميرا بثبات نحو رمز QR المطبوع أسفل إيصال الشراء.',
    orUploadPhoto: 'رفع صورة الإيصال',
    closeBtn: 'إغلاق الكاميرا',
    cameraPermissionErr: 'تعذر الوصول إلى الكاميرا. يرجى السماح بالإذن أو رفع صورة.',
    needHelp: 'هل تحتاج مساعدة في فتح حسابك؟',
    callStore: 'الاتصال بالفرع مباشرة',
    whatsappHelp: 'دعم واتساب الفوري',
    secureNote: 'محمي بالكامل عبر بنفت بي وفوري+',
    notFound: 'لم يتم العثور على حساب مطابق. يرجى مسح رمز QR من الإيصال أو مراجعة الكاشير.',
    networkErr: 'لا يوجد اتصال بالإنترنت. يرجى التحقق من بيانات الهاتف أو الواي فاي.',
    offlineNotice: 'وضع عدم الاتصال مفعل.',
    installAppBtn: 'تثبيت تطبيق أسكر خاتا على هاتفك',
    updateAvailable: 'يتوفر تحديث جديد للتطبيق! اضغط للتحديث.',
    refreshNow: 'تحديث',
    currency: 'د.ب'
  },
  ml: {
    title: 'സ്വകാര്യ കസ്റ്റമർ ഖാത്ത',
    subtitle: 'നിങ്ങളുടെ സ്വന്തം അക്കൗണ്ടിലേക്ക് നേരിട്ട് പ്രവേശിക്കുക. സ്വകാര്യതയ്ക്കായി സെർച്ച് ഒഴിവാക്കിയിരിക്കുന്നു.',
    privacyBadge: 'സ്വകാര്യത സുരക്ഷിതം',
    privacyNote: 'മറ്റുള്ളവരുടെ അക്കൗണ്ടുകൾ തിരയുന്നത് ഒഴിവാക്കിയിരിക്കുന്നു. ബില്ലിലെ QR കോഡ് സ്കാൻ ചെയ്ത് സ്വന്തം അക്കൗണ്ട് നേരിട്ട് തുറക്കാം.',
    scanReceiptBtn: 'ബില്ലിലെ QR സ്കാൻ ചെയ്ത് തുറക്കുക',
    orScan: 'ബില്ലിലെ QR കോഡ് ക്യാമറയിൽ സ്കാൻ ചെയ്യുക',
    scanModalTitle: 'ബില്ലിലെ QR കോഡ് സ്കാൻ ചെയ്യുക',
    pointCameraHint: 'ബില്ലിന്റെ അടിയിലുള്ള QR കോഡിന് നേരെ ക്യാമറ പിടിക്കുക.',
    orUploadPhoto: 'ഫോട്ടോ അപ്‌ലോഡ് ചെയ്യുക',
    closeBtn: 'അടയ്ക്കുക',
    cameraPermissionErr: 'ക്യാമറ ആക്‌സസ് ചെയ്യാൻ കഴിഞ്ഞില്ല. അനുമതി നൽകുക.',
    needHelp: 'സഹായം ആവശ്യമുണ്ടോ?',
    callStore: 'കടയിലേക്ക് വിളിക്കുക',
    whatsappHelp: 'വാട്ട്സ്ആപ്പ് സഹായം',
    secureNote: 'ബെനിഫിറ്റ് പേ വഴി സുരക്ഷിതമായ പേയ്‌മെന്റ്',
    notFound: 'അക്കൗണ്ട് കണ്ടെത്താൻ കഴിഞ്ഞില്ല. ദയവായി ബില്ലിലെ QR കോഡ് സ്കാൻ ചെയ്യുക.',
    networkErr: 'ഇന്റർനെറ്റ് കണക്ഷൻ ലഭ്യമല്ല. ദയവായി പരിശോധിക്കുക.',
    offlineNotice: 'ഓഫ്‌ലൈൻ മോഡ്.',
    installAppBtn: 'ആപ്പ് ഫോണിൽ ഇൻസ്റ്റാൾ ചെയ്യുക',
    updateAvailable: 'പുതിയ അപ്ഡേറ്റ് ലഭ്യമാണ്! റീഫ്രഷ് ചെയ്യുക.',
    refreshNow: 'റീഫ്രഷ്',
    currency: 'BHD'
  },
  bn: {
    title: 'ব্যক্তিগত খাতা পোর্টাল',
    subtitle: 'সরাসরি আপনার ব্যক্তিগত হিসাবে প্রবেশ করুন। গোপনীয়তার স্বার্থে অন্য কারও হিসাব খোঁজা বন্ধ রাখা হয়েছে।',
    privacyBadge: 'গোপনীয়তা সুরক্ষিত',
    privacyNote: 'অন্যের হিসাব খোঁজা বন্ধ রাখা হয়েছে। আপনার ব্যক্তিগত হিসাব দেখতে রশিদের QR কোড স্ক্যান করুন।',
    scanReceiptBtn: 'রশিদের QR স্ক্যান করে খাতা খুলুন',
    orScan: 'রসিদের QR কোড সরাসরি স্ক্যান করুন',
    scanModalTitle: 'রসিদের QR কোড স্ক্যান',
    pointCameraHint: 'রসিদের নিচের QR কোডের দিকে ক্যামেরা তাক করুন।',
    orUploadPhoto: 'রসিদের ছবি আপলোড করুন',
    closeBtn: 'বন্ধ করুন',
    cameraPermissionErr: 'ক্যামেরা চালু করা যায়নি। অনুগ্রহ করে অনুমতি দিন।',
    needHelp: 'কোনো সাহায্য প্রয়োজন?',
    callStore: 'দোকানে সরাসরি কল করুন',
    whatsappHelp: 'হোয়াটসঅ্যাপ সহায়তা',
    secureNote: 'বেনিফিট পে দ্বারা ১০০% সুরক্ষিত',
    notFound: 'কোনো খাতা অ্যাকাউন্ট পাওয়া যায়নি। অনুগ্রহ করে রসিদের QR স্ক্যান করুন।',
    networkErr: 'ইন্টারনেট সংযোগ নেই। দয়া করে সংযোগ পরীক্ষা করুন।',
    offlineNotice: 'অফলাইন মোড।',
    installAppBtn: 'ফোনে অ্যাপ ইনস্টল করুন',
    updateAvailable: 'নতুন আপডেট পাওয়া গেছে! রিফ্রেশ করুন।',
    refreshNow: 'রিফ্রেশ',
    currency: 'BHD'
  },
  hi: {
    title: 'निजी ग्राहक खाता',
    subtitle: 'सीधे अपने निजी खाते में प्रवेश करें। आपकी गोपनीयता के लिए अन्य खाते खोजना बंद है।',
    privacyBadge: 'गोपनीयता सुरक्षित',
    privacyNote: 'दूसरों के खाते खोजना बंद कर दिया गया है। अपना खाता देखने के लिए रसीद का QR कोड स्कैन करें।',
    scanReceiptBtn: 'रसीद का QR स्कैन करके खाता खोलें',
    orScan: 'सीधे खाता खोलने के लिए रसीद का QR कोड स्कैन करें',
    scanModalTitle: 'रसीद का QR कोड स्कैन करें',
    pointCameraHint: 'रसीद के नीचे दिए गए QR कोड पर कैमरा सीधा रखें।',
    orUploadPhoto: 'रसीद की फोटो अपलोड करें',
    closeBtn: 'कैमरा बंद करें',
    cameraPermissionErr: 'कैमरा शुरू नहीं हो सका। कृपया अनुमति दें।',
    needHelp: 'क्या आपको सहायता चाहिए?',
    callStore: 'दुकान पर कॉल करें',
    whatsappHelp: 'व्हाट्सएप सहायता',
    secureNote: 'बेनिफिट पे और फॉरी+ द्वारा सुरक्षित',
    notFound: 'कोई खाता नहीं मिला। कृपया रसीद का QR कोड स्कैन करें।',
    networkErr: 'इंटरनेट कनेक्शन नहीं है। कृपया मोबाइल डेटा या वाई-फाई जांचें।',
    offlineNotice: 'ऑफलाइन मोड।',
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);

  // Auto-redirect if phone is already paired to a private customer account
  useEffect(() => {
    try {
      const boundId = localStorage.getItem('my_khata_customer_id');
      if (boundId) {
        navigate(`/tab/${encodeURIComponent(boundId)}`, { replace: true });
      }
    } catch {}
  }, [navigate]);

  // Permanent Device Binding: locks phone directly to customer tab
  const bindAndNavigate = useCallback((targetCustomerId, targetPath = null) => {
    if (!targetCustomerId) return;
    try {
      localStorage.setItem('my_khata_customer_id', targetCustomerId);
      document.cookie = `khata_customer_id=${encodeURIComponent(targetCustomerId)}; path=/; max-age=315360000; SameSite=Lax`;
    } catch (e) {
      console.warn('Binding error:', e);
    }
    navigate(targetPath || `/tab/${encodeURIComponent(targetCustomerId)}`);
  }, [navigate]);

  // In-App PWA Installation Prompt State (Resolved PWA-OFF-03)
  const [installPrompt, setInstallPrompt] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // Embedded Camera QR Scanner Modal States (ADV-11)
  const [isScannerOpen, setIsScannerOpen] = useState(() => searchParams.get('action') === 'scan');
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  // Store Manager / Cashier Directory View States
  const [showDrawer, setShowDrawer] = useState(false);
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [managerPinInput, setManagerPinInput] = useState('');
  const [isManagerUnlocked, setIsManagerUnlocked] = useState(false);
  const [managerCustomers, setManagerCustomers] = useState([]);
  const [managerLoading, setManagerLoading] = useState(false);
  const [managerSearch, setManagerSearch] = useState('');
  const [managerError, setManagerError] = useState('');

  const unlockManagerDirectory = async (e) => {
    e?.preventDefault();
    if (managerPinInput.trim() !== '9999') {
      setManagerError('Invalid Manager PIN. Access Denied.');
      return;
    }
    setManagerError('');
    setIsManagerUnlocked(true);
    setManagerLoading(true);

    try {
      const candidates = [
        'https://askar-edge-api.layali-askar-pos.workers.dev/khata/ledger',
        '/api/customers',
        'http://192.168.8.7:3000/khata/ledger'
      ];
      let loaded = false;
      for (const url of candidates) {
        try {
          const res = await fetch(url, {
            headers: { 'x-pos-client': 'store-pos', 'x-manager-pin': '9999' }
          });
          if (res.ok) {
            const data = await res.json();
            const list = data?.customers || (Array.isArray(data) ? data : []);
            if (Array.isArray(list) && list.length > 0) {
              setManagerCustomers(list);
              loaded = true;
              break;
            }
          }
        } catch {}
      }
      if (!loaded) {
        setManagerError('Failed to load Khata Directory. Please check store network.');
      }
    } catch (err) {
      setManagerError(err.message);
    } finally {
      setManagerLoading(false);
    }
  };

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

  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
  const isRtl = lang === 'ar';

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

    let cleanStr = str;
    if (cleanStr.toUpperCase().startsWith('KHATA:')) cleanStr = cleanStr.slice(6).trim();
    if (cleanStr.toUpperCase().startsWith('CUST-')) cleanStr = cleanStr.slice(5).trim();
    cleanStr = cleanStr.replace(/^#+|#+$/g, '');

    let detectedId = '';
    const match = str.match(/\/(tab|statement|khata|customer|pay)\/([a-zA-Z0-9_\-%]+)/i);
    if (match) {
      detectedId = match[2];
    } else if (targetRoute) {
      const parts = targetRoute.split('?')[0].split('/');
      detectedId = parts[parts.length - 1];
    } else {
      detectedId = normalizeArabicNumerals(cleanStr);
    }

    if (targetRoute) {
      bindAndNavigate(detectedId, targetRoute);
      return;
    }

    // Direct fallback for plain customer phone or UUID string
    bindAndNavigate(detectedId);
  }, [bindAndNavigate]);

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
        } else {
          // Dynamic lightweight fallback for Android WebViews & older Chrome
          let jsQR = window.jsQR;
          if (!jsQR) {
            try {
              const script = document.createElement('script');
              script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
              script.async = true;
              document.head.appendChild(script);
              await new Promise((res) => { script.onload = res; script.onerror = res; });
            } catch {}
          }
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          detectorTimer = setInterval(() => {
            if (!videoRef.current || videoRef.current.readyState < 2 || !ctx) return;
            if (typeof window.jsQR === 'function') {
              canvas.width = videoRef.current.videoWidth || 320;
              canvas.height = videoRef.current.videoHeight || 240;
              ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert'
              });
              if (code && code.data) {
                clearInterval(detectorTimer);
                handleDetectedCode(code.data);
              }
            }
          }, 350);
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

    // jsQR Fallback for photo uploads
    try {
      let jsQR = window.jsQR;
      if (!jsQR) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
        script.async = true;
        document.head.appendChild(script);
        await new Promise((res) => { script.onload = res; script.onerror = res; });
        jsQR = window.jsQR;
      }
      if (typeof jsQR === 'function') {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise((res) => { img.onload = res; });
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imgData.data, imgData.width, imgData.height);
          if (code && code.data) {
            handleDetectedCode(code.data);
            return;
          }
        }
      }
    } catch (err) {
      console.warn('jsQR image decode error:', err);
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
      {/* Top Bar: Clean Drawer Navigation, Brand & Language */}
      <header className="w-full max-w-md flex items-center justify-between pt-2 pb-2 no-print">
        <div className="flex items-center gap-2">
          {/* Hamburger Drawer Button */}
          <button
            type="button"
            onClick={() => setShowDrawer(true)}
            className="h-10 px-3 bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800 rounded-2xl flex items-center gap-1.5 text-slate-200 hover:text-white transition cursor-pointer shadow-xs"
            title="Open Menu"
          >
            <Menu className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-xs font-bold font-mono">MENU</span>
          </button>

          <div>
            <span className="font-black text-sm tracking-tight text-white uppercase block leading-none">Layali Khata</span>
            <span className="text-[10px] text-slate-400 font-mono">Bahrain • NBR Tax</span>
          </div>
        </div>

        {/* Quick Language Switcher */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-0.5 rounded-2xl">
          {['en', 'ar', 'ml'].map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLang(code)}
              className={`min-w-7 h-8 px-2 rounded-xl font-bold text-[11px] uppercase transition-all flex items-center justify-center cursor-pointer ${
                lang === code ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
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

          {/* Privacy Guarantee Pill */}
          <div className="mb-5 p-3.5 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl text-left flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-emerald-300">{t.privacyBadge}</p>
              <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">
                {t.privacyNote}
              </p>
            </div>
          </div>

          {/* Primary Action: One-Touch Embedded Camera QR Scanner */}
          <div className="space-y-3 no-print">
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="w-full min-h-[56px] py-4 px-6 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-black rounded-2xl text-sm transition-all flex items-center justify-center gap-3 cursor-pointer shadow-lg shadow-emerald-950/60"
            >
              <Camera className="w-5 h-5 text-white shrink-0" />
              <span>{t.scanReceiptBtn}</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full min-h-[46px] py-3 px-4 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-slate-200 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer border border-slate-700/80"
            >
              <Upload className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{t.orUploadPhoto}</span>
            </button>
          </div>

          {/* PWA In-App 1-Click Install Banner */}
          {installPrompt && (
            <div className="mt-4 no-print">
              <button
                type="button"
                onClick={handleInstallClick}
                className="w-full min-h-[46px] py-2.5 px-4 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/50 text-emerald-300 font-bold rounded-2xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
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
              href={`https://wa.me/${STORE_WHATSAPP}?text=Hello%20Layali%2C%20I%20need%20assistance%20with%20my%20Khata%20account.`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] py-2 px-3 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/60 rounded-xl text-xs font-semibold text-emerald-300 flex items-center justify-center gap-1.5 transition"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.whatsappHelp}</span>
            </a>
          </div>

          {/* Store Owner / Cashier Directory View Unlock Button */}
          <div className="mt-3 pt-3 border-t border-slate-800/60 text-center">
            <button
              type="button"
              onClick={() => setShowManagerModal(true)}
              className="text-[11px] font-bold text-slate-400 hover:text-emerald-400 flex items-center justify-center gap-1.5 mx-auto transition cursor-pointer"
            >
              <Lock className="w-3 h-3 text-slate-500" />
              <span>Store Manager Directory View</span>
            </button>
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

      {/* Manager Directory Modal (Strict PIN 9999 Protected) */}
      {showManagerModal && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-200 no-print">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-bold text-white">Store Khata Directory</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowManagerModal(false);
                  setIsManagerUnlocked(false);
                  setManagerPinInput('');
                  setManagerError('');
                }}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!isManagerUnlocked ? (
              <form onSubmit={unlockManagerDirectory} className="my-auto py-6 space-y-4">
                <div className="text-center space-y-1">
                  <p className="text-xs text-slate-400">Enter Manager PIN to view all customer accounts:</p>
                </div>
                <input
                  type="password"
                  maxLength={6}
                  value={managerPinInput}
                  onChange={(e) => setManagerPinInput(e.target.value)}
                  placeholder="Manager PIN (e.g. 9999)"
                  className="w-full py-3 px-4 bg-slate-950 border border-slate-800 rounded-2xl text-white text-center text-lg font-mono tracking-widest focus:ring-2 focus:ring-emerald-500 outline-none"
                  autoFocus
                />
                {managerError && (
                  <p className="text-xs font-semibold text-rose-400 text-center">{managerError}</p>
                )}
                <button
                  type="submit"
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition"
                >
                  Unlock Directory
                </button>
              </form>
            ) : (
              <div className="flex flex-col flex-1 overflow-hidden pt-3">
                <div className="relative mb-3 shrink-0">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={managerSearch}
                    onChange={(e) => setManagerSearch(e.target.value)}
                    placeholder="Search customer name, phone, CPR..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {managerLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-800/60">
                    {managerCustomers
                      .filter((c) => {
                        const s = (managerSearch || '').toLowerCase().trim();
                        if (!s) return true;
                        return (
                          (c.name && c.name.toLowerCase().includes(s)) ||
                          (c.phone && c.phone.includes(s)) ||
                          (c.cpr && c.cpr.includes(s))
                        );
                      })
                      .map((cust) => {
                        const bal = Number(cust.currentBalance ?? cust.balance ?? 0);
                        return (
                          <div
                            key={cust.id}
                            onClick={() => {
                              setShowManagerModal(false);
                              bindAndNavigate(cust.id);
                            }}
                            className="pt-2 pb-2 px-2 flex items-center justify-between hover:bg-slate-800/60 rounded-xl cursor-pointer transition"
                          >
                            <div className="min-w-0 pr-2">
                              <p className="text-xs font-bold text-white truncate">{cust.name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{cust.phone || 'No phone'}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-xs font-black font-mono ${bal > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                BD {bal.toFixed(3)}
                              </p>
                              <span className="text-[9px] text-emerald-500 hover:underline flex items-center gap-0.5 justify-end">
                                View Tab <ArrowRight className="w-2.5 h-2.5" />
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
                <div className="pt-2 border-t border-slate-800 text-center shrink-0">
                  <p className="text-[10px] text-slate-500 font-mono">
                    Total {managerCustomers.length} registered customers in store database
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* Slide-out Hamburger Drawer */}
      <HamburgerDrawer
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
        customer={null}
        lang={lang}
        onSelectLang={(newLang) => setLang(newLang)}
      />
    </div>
  );
}
