import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, Check, ExternalLink, ShieldCheck, QrCode, Smartphone, ArrowRight, Clock } from 'lucide-react';
import { openBenefitPayApp } from '../utils/benefitPay';

// Arabic-Indic Numeral Normalizer for Bahrain & GCC Accessibility (BP-06)
function normalizeArabicNumerals(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

// 5-Language Translations for Expat & GCC Patrons (BP-07)
const MODAL_TEXTS = {
  en: {
    title: 'BenefitPay',
    fawri: 'Fawri+',
    cbbCert: 'Central Bank of Bahrain • CBB Certified',
    amountDue: 'Amount to Settle',
    merchantIdLabel: 'Benefit Merchant ID',
    mobileLabel: 'Fawri+ Mobile Number',
    exactAmountLabel: 'Exact Amount (BHD)',
    scanTab: 'Scan Fawri+ QR',
    mobileTab: 'Pay on Mobile',
    scanStep: 'Open BenefitPay app & tap "Scan QR" to pay',
    scanSub: 'Amount is pre-filled directly to Askar Supermarket',
    launchApp: 'Launch BenefitPay App',
    openAppOnPhone: 'Open BenefitPay App on this Phone',
    sendInstructions: 'Send via Fawri+ using our registered Merchant ID or Mobile:',
    copy: 'Copy',
    copied: 'Copied!',
    refLabel: 'BenefitPay Reference / Fawri+ No. (Required)',
    refPlaceholder: 'e.g. 10482938',
    confirmBtn: 'Submit Payment for Cashier Verification',
    reconciling: 'Submitting Payment Claim...',
    successTitle: 'Payment Submitted for Review!',
    pendingSub: 'Your payment reference has been sent to the supermarket cashier. Your balance will be deducted once verified against store bank records.',
    statusPending: 'Status: Awaiting Cashier Approval',
    closeBtn: 'Done',
    crNote: 'Official Merchant CR: 200012345678901 • Askar Supermarket, Bahrain',
    desktopNotice: 'BenefitPay is a mobile application. Please scan the QR code using your smartphone camera or BenefitPay app.'
  },
  ar: {
    title: 'بنفت بي',
    fawri: 'فوري+',
    cbbCert: 'مصرف البحرين المركزي • معتمد ومحمي',
    amountDue: 'المبلغ المطلوب سداده',
    merchantIdLabel: 'معرف التاجر بنفت',
    mobileLabel: 'رقم هاتف فوري+',
    exactAmountLabel: 'المبلغ المحدد (د.ب)',
    scanTab: 'مسح رمز QR',
    mobileTab: 'الدفع من هذا الهاتف',
    scanStep: 'افتح تطبيق بنفت بي واختر "مسح الرمز" (Scan QR)',
    scanSub: 'سيتم تحديد المبلغ تلقائياً بدقة إلى حساب أسواق أسكر',
    launchApp: 'فتح تطبيق بنفت بي الآن',
    openAppOnPhone: 'أو افتح تطبيق بنفت بي مباشرة',
    sendInstructions: 'أرسل المبلغ عبر فوري+ باستخدام رقم الهاتف أو معرف التاجر:',
    copy: 'نسخ',
    copied: 'تم النسخ!',
    refLabel: 'رقم مرجع بنفت بي / رقم العملية (إلزامي)',
    refPlaceholder: 'مثال: ١٠٤٨٢٩٣٨',
    confirmBtn: 'إرسال إشعار السداد للمحاسب للتحقق',
    reconciling: 'جارٍ إرسال إشعار السداد...',
    successTitle: 'تم إرسال إشعار السداد للمراجعة!',
    pendingSub: 'تم إرسال رقم العملية إلى كاشير السوبرماركت. سيتم خصم الرصيد تلقائياً بمجرد مطابقة الإشعار البنكي.',
    statusPending: 'الحالة: بانتظار موافقة المحاسب',
    closeBtn: 'تم',
    crNote: 'السجل التجاري الرسمي: 200012345678901 • أسواق أسكر، البحرين',
    desktopNotice: 'تطبيق بنفت بي متاح للهواتف الذكية. يرجى مسح رمز الاستجابة السريعة (QR) عبر هاتفك.'
  },
  ml: {
    title: 'ബെനിഫിറ്റ് പേ',
    fawri: 'Fawri+',
    cbbCert: 'സെൻട്രൽ ബാങ്ക് ഓഫ് ബഹ്‌റൈൻ അംഗീകൃതം',
    amountDue: 'അടയ്ക്കാനുള്ള തുക',
    merchantIdLabel: 'മർച്ചന്റ് ഐഡി',
    mobileLabel: 'Fawri+ മൊബൈൽ നമ്പർ',
    exactAmountLabel: 'കൃത്യമായ തുക (BHD)',
    scanTab: 'QR സ്കാൻ ചെയ്യുക',
    mobileTab: 'ഫോണിൽ നൽകുക',
    scanStep: 'ബെനിഫിറ്റ് പേ ആപ്പ് തുറന്ന് "Scan QR" ക്ലിക്ക് ചെയ്യുക',
    scanSub: 'തുക കൃത്യമായി അസ്കർ സൂപ്പർമാർക്കറ്റിലേക്ക് നൽകപ്പെടും',
    launchApp: 'ബെനിഫിറ്റ് പേ ആപ്പ് തുറക്കുക',
    openAppOnPhone: 'ഈ ഫോണിൽ ബെനിഫിറ്റ് പേ തുറക്കുക',
    sendInstructions: 'മർച്ചന്റ് ഐഡിയോ ഫോൺ നമ്പറോ ഉപയോഗിച്ച് പണം നൽകുക:',
    copy: 'കോപ്പി',
    copied: 'കോപ്പി ചെയ്തു!',
    refLabel: 'ബെനിഫിറ്റ് പേ റഫറൻസ് നമ്പർ (നിർബന്ധം)',
    refPlaceholder: 'ഉദാ: 10482938',
    confirmBtn: 'പേയ്‌മെന്റ് വിവരങ്ങൾ കാഷ്യർക്ക് സമർപ്പിക്കുക',
    reconciling: 'സമർപ്പിക്കുന്നു...',
    successTitle: 'പേയ്‌മെന്റ് വിവരങ്ങൾ സമർപ്പിച്ചു!',
    pendingSub: 'വിവരങ്ങൾ സൂപ്പർമാർക്കറ്റ് കാഷ്യർക്ക് ലഭിച്ചു. ബാങ്ക് രേഖകളുമായി ഒത്തുനോക്കിയ ശേഷം ബാക്കി തുക കുറയും.',
    statusPending: 'സ്റ്റാറ്റസ്: കാഷ്യറുടെ അനുമതിക്കായി കാത്തിരിക്കുന്നു',
    closeBtn: 'ശരി',
    crNote: 'സി.ആർ: 200012345678901 • അസ്കർ സൂപ്പർമാർക്കറ്റ്, ബഹ്‌റൈൻ',
    desktopNotice: 'ബെനിഫിറ്റ് പേ മൊബൈൽ ആപ്പിൽ ലഭ്യമാണ്. ദയവായി നിങ്ങളുടെ ഫോൺ ഉപയോഗിച്ച് QR സ്കാൻ ചെയ്യുക.'
  },
  bn: {
    title: 'বেনিফিট পে',
    fawri: 'Fawri+',
    cbbCert: 'সেন্ট্রাল ব্যাংক অব বাহরাইন অনুমোদিত',
    amountDue: 'পরিশোধের পরিমাণ',
    merchantIdLabel: 'মার্চেন্ট আইডি',
    mobileLabel: 'ফাওরি+ মোবাইল নম্বর',
    exactAmountLabel: 'নির্দিষ্ট পরিমাণ (BHD)',
    scanTab: 'QR স্ক্যান করুন',
    mobileTab: 'মোবাইলে দিন',
    scanStep: 'বেনিফিট পে অ্যাপ খুলুন এবং "Scan QR" চাপুন',
    scanSub: 'টাকা সরাসরি আস্কার সুপারমার্কেটের একাউন্টে যাবে',
    launchApp: 'বেনিফিট পে অ্যাপ খুলুন',
    openAppOnPhone: 'এই ফোনে বেনিফিট পে খুলুন',
    sendInstructions: 'মার্চেন্ট আইডি বা মোবাইল নম্বর দিয়ে টাকা পাঠান:',
    copy: 'কপি',
    copied: 'কপি হয়েছে!',
    refLabel: 'রেফারেন্স নম্বর (বাধ্যতামূলক)',
    refPlaceholder: 'যেমন: 10482938',
    confirmBtn: 'যাচাইয়ের জন্য ক্যাশিয়ারের কাছে পাঠান',
    reconciling: 'পাঠানো হচ্ছে...',
    successTitle: 'পেমেন্ট পর্যালোচনার জন্য জমা হয়েছে!',
    pendingSub: 'আপনার পেমেন্ট রেফারেন্স ক্যাশিয়ারের কাছে পাঠানো হয়েছে। ব্যাংক রেকর্ডের সাথে যাচাই করার পর ব্যালেন্স আপডেট হবে।',
    statusPending: 'স্ট্যাটাস: ক্যাশিয়ারের অনুমোদনের অপেক্ষায়',
    closeBtn: 'সম্পন্ন',
    crNote: 'অফিসিয়াল সিআর: 200012345678901 • আস্কার সুপারমার্কেট, বাহরাইন',
    desktopNotice: 'বেনিফিট পে মোবাইল অ্যাপ। আপনার স্মার্টফোন দিয়ে QR কোডটি স্ক্যান করুন।'
  },
  hi: {
    title: 'बेनिफिट पे',
    fawri: 'Fawri+',
    cbbCert: 'सेंट्रल बैंक ऑफ बहरीन द्वारा प्रमाणित',
    amountDue: 'भुगतान राशि',
    merchantIdLabel: 'मर्चेंट आईडी',
    mobileLabel: 'फावरी+ मोबाइल नंबर',
    exactAmountLabel: 'सटीक राशि (BHD)',
    scanTab: 'QR स्कैन करें',
    mobileTab: 'मोबाइल पर भुगतान',
    scanStep: 'बेनिफिट पे ऐप खोलें और "Scan QR" दबाएं',
    scanSub: 'राशि सीधे असकर सुपरमार्केट के खाते में भेजी जाएगी',
    launchApp: 'बेनिफिट पे ऐप खोलें',
    openAppOnPhone: 'इस फोन पर बेनिफिट पे खोलें',
    sendInstructions: 'मर्चेंट आईडी या मोबाइल नंबर का उपयोग करके भुगतान करें:',
    copy: 'कॉपी',
    copied: 'कॉपी हो गया!',
    refLabel: 'रेफरेंस नंबर (अनिवार्य)',
    refPlaceholder: 'उदा: 10482938',
    confirmBtn: 'कैशियर सत्यापन के लिए भुगतान सबमिट करें',
    reconciling: 'सबमिट किया जा रहा है...',
    successTitle: 'भुगतान समीक्षा के लिए सबमिट हो गया!',
    pendingSub: 'आपका भुगतान रेफरेंस कैशियर को भेज दिया गया है। बैंक रिकॉर्ड से पुष्टि होने के बाद शेष राशि अपडेट हो जाएगी।',
    statusPending: 'स्थिति: कैशियर की मंजूरी प्रतीक्षित है',
    closeBtn: 'पूर्ण',
    crNote: 'सीआर नंबर: 200012345678901 • असकर सुपरमार्केट, बहरीन',
    desktopNotice: 'बेनिफिट पे एक मोबाइल ऐप है। कृपया अपने स्मार्टफोन से QR कोड स्कैन करें।'
  }
};

export default function BenefitPayModal({
  isOpen,
  onClose,
  data,
  lang = 'en',
  onSuccess
}) {
  const [activeTab, setActiveTab] = useState('qr'); // 'qr' | 'manual'
  const [copiedKey, setCopiedKey] = useState(null);
  const [referenceInput, setReferenceInput] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successResult, setSuccessResult] = useState(null);
  const backdropRef = useRef(null);

  const t = MODAL_TEXTS[lang] || MODAL_TEXTS.en;

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setSuccessResult(null);
      setReferenceInput('');
      setErrorMsg(null);
      setActiveTab('qr');
      setConfirming(false);
      setCopiedKey(null);
    }
  }

  // Keyboard accessibility: ESC key to close modal (BP-10)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !data) return null;

  const amountStr = Number(data.amount || 0).toFixed(3);
  const merchantName = data.merchantName || 'ASKAR SUPERMARKET';
  const merchantId = data.merchantId || '97300182';
  const mobileNumber = data.mobileNumber || '+973 32067388';
  const qrPayload = data.qrPayload || '';

  const handleCopy = (text, key) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  const handleConfirmPayment = async () => {
    setErrorMsg(null);
    setConfirming(true);

    // Normalize Arabic-Indic numerals for reference before API dispatch (BP-06)
    const normalizedRef = normalizeArabicNumerals(referenceInput).trim();
    if (!normalizedRef || normalizedRef.length < 4) {
      setErrorMsg('Please enter your 4+ digit BenefitPay reference number (e.g. 10482938)');
      setConfirming(false);
      return;
    }

    try {
      const savedJwt = localStorage.getItem(`khata_jwt_${data.customerId}`) || '';
      const savedPin = localStorage.getItem(`khata_pin_${data.customerId}`) || '';

      const headers = { 
        'Content-Type': 'application/json',
        ...(savedJwt ? { 'Authorization': `Bearer ${savedJwt}` } : {}),
        ...(savedPin ? { 'x-khata-pin': savedPin } : {})
      };

      const res = await fetch('/api/checkout/confirm', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: data.customerId,
          amount: data.amount,
          reference: normalizedRef,
          clientToken: savedJwt
        })
      });

      const result = await res.json();
      if (!res.ok || result.error) {
        throw new Error(result.error || 'Failed to submit payment claim');
      }

      setSuccessResult(result);
      if (onSuccess) {
        onSuccess(result);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error submitting payment claim');
    } finally {
      setConfirming(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  const handleOpenApp = () => {
    openBenefitPayApp(() => {
      alert(t.desktopNotice);
    });
  };

  return (
    <div 
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div 
        className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="benefitpay-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* BenefitPay Crimson Header */}
        <div className="bg-[#DA291C] px-5 py-4 text-white flex items-center justify-between relative shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-sm">
              <span className="text-[#DA291C] font-black text-sm tracking-tighter">BP</span>
            </div>
            <div>
              <h3 id="benefitpay-modal-title" className="font-extrabold text-base tracking-tight leading-tight flex items-center gap-1.5">
                <span>{t.title}</span>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/20 text-white uppercase tracking-wider">
                  {t.fawri}
                </span>
              </h3>
              <p className="text-[11px] text-white/80 font-medium">
                {t.cbbCert}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close BenefitPay Modal"
            className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Amount Banner */}
        <div className="bg-slate-950/90 px-5 py-3 border-b border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {t.amountDue}
            </span>
            <div className="text-2xl font-black font-mono text-emerald-400">
              {amountStr} <span className="text-xs text-slate-300 font-sans">BHD</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              {merchantName}
            </span>
            <span className="text-[11px] font-mono text-slate-300">
              ID: {merchantId}
            </span>
          </div>
        </div>

        {/* Tab Selection (Scan QR vs Pay on this Mobile) */}
        <div className="p-3 bg-slate-900 border-b border-slate-800 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('qr')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'qr'
                ? 'bg-red-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>{t.scanTab}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-red-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>{t.mobileTab}</span>
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {successResult ? (
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-500 flex items-center justify-center text-amber-400">
                <Clock className="w-8 h-8 stroke-[2.5]" />
              </div>
              <h4 className="text-lg font-bold text-white">
                {t.successTitle}
              </h4>
              <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
                {t.pendingSub}
              </p>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl w-full text-center space-y-1">
                <div className="text-[11px] text-slate-400 font-mono">
                  Ref: #{successResult.reference} • BHD {Number(successResult.claimedAmount || data.amount).toFixed(3)}
                </div>
                <div className="text-xs font-bold text-amber-400">
                  {t.statusPending}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 mt-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                {t.closeBtn || 'Done'}
              </button>
            </div>
          ) : activeTab === 'qr' ? (
            /* QR Code Mode */
            <div className="flex flex-col items-center space-y-3">
              <div className="bg-white p-3 rounded-2xl shadow-xl border-4 border-slate-700/50">
                {qrPayload ? (
                  <QRCodeSVG
                    value={qrPayload}
                    size={170}
                    level="M"
                    includeMargin={false}
                  />
                ) : (
                  <div className="w-[170px] h-[170px] flex items-center justify-center text-slate-400 text-xs">
                    Generating QR...
                  </div>
                )}
              </div>

              <div className="text-center space-y-1">
                <p className="text-xs font-semibold text-slate-200">
                  {t.scanStep}
                </p>
                <p className="text-[11px] text-slate-400">
                  {t.scanSub}
                </p>
              </div>

              {/* Mobile Deep Link Shortcut */}
              <button
                type="button"
                onClick={handleOpenApp}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-750 text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <span>{t.openAppOnPhone}</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          ) : (
            /* Direct Fawri+ / Mobile Copy Details */
            <div className="space-y-3">
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-2">
                <p className="text-xs text-slate-300">
                  {t.sendInstructions}
                </p>

                {/* Fawri+ Mobile Card */}
                <div className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-700 rounded-xl">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      {t.mobileLabel}
                    </span>
                    <span className="font-mono font-bold text-white text-sm">
                      {mobileNumber}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(mobileNumber, 'mobile')}
                    className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 rounded-lg flex items-center gap-1 transition cursor-pointer"
                  >
                    {copiedKey === 'mobile' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'mobile' ? t.copied : t.copy}</span>
                  </button>
                </div>

                {/* Merchant ID Card */}
                <div className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-700 rounded-xl">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      {t.merchantIdLabel}
                    </span>
                    <span className="font-mono font-bold text-white text-sm">
                      {merchantId}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(merchantId, 'mid')}
                    className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 rounded-lg flex items-center gap-1 transition cursor-pointer"
                  >
                    {copiedKey === 'mid' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'mid' ? t.copied : t.copy}</span>
                  </button>
                </div>

                {/* Amount to Send */}
                <div className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-700 rounded-xl">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      {t.exactAmountLabel}
                    </span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {amountStr}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(amountStr, 'amount')}
                    className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 rounded-lg flex items-center gap-1 transition cursor-pointer"
                  >
                    {copiedKey === 'amount' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'amount' ? t.copied : t.copy}</span>
                  </button>
                </div>
              </div>

              {/* Direct App Launch Button */}
              <button
                type="button"
                onClick={handleOpenApp}
                className="w-full py-3 px-4 bg-[#DA291C] hover:bg-[#b52216] text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <span>{t.launchApp}</span>
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Payment Confirmation Form */}
          {!successResult && (
            <div className="pt-2 border-t border-slate-800 space-y-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-300 block">
                  {t.refLabel}
                </label>
                <input
                  type="text"
                  value={referenceInput}
                  onChange={(e) => setReferenceInput(normalizeArabicNumerals(e.target.value))}
                  placeholder={t.refPlaceholder}
                  className="w-full py-2 px-3 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-xs focus:border-red-500 outline-none"
                />
                <p className="text-[10px] text-slate-400">
                  Enter the 4+ digit reference number from your BenefitPay confirmation screen.
                </p>
              </div>

              {errorMsg && (
                <div className="p-2.5 bg-red-950/60 border border-red-800 rounded-xl text-red-200 text-xs">
                  {errorMsg}
                </div>
              )}

              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={confirming || referenceInput.trim().length < 4}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {confirming ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{t.reconciling}</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-200" />
                    <span>{t.confirmBtn}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer Note */}
        <div className="p-3 bg-slate-950 border-t border-slate-800/80 text-center text-[10px] text-slate-500">
          {t.crNote}
        </div>
      </div>
    </div>
  );
}
