import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  X, 
  Search, 
  FileText, 
  CreditCard, 
  Eye, 
  EyeOff, 
  Volume2, 
  VolumeX, 
  Lock, 
  Unlock, 
  PhoneCall, 
  MessageCircle, 
  ShieldCheck, 
  Store, 
  User, 
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Sparkles
} from 'lucide-react';

const DRAWER_TEXTS = {
  en: {
    title: 'Navigation & Tools',
    storeName: 'ASKAR SUPERMARKET',
    storeSubtitle: 'Central Branch • Kingdom of Bahrain',
    myAccount: 'My Khata Account',
    accountActive: 'Active & Verified',
    accountFrozen: 'Locked / Frozen',
    freezeKhata: 'Freeze Khata (Lost Card)',
    unfreezeKhata: 'Unlock Khata',
    homeLookup: 'Khata Search & QR Scanner',
    liveTab: 'Live Balance & Quick Pay',
    fullStatement: 'Itemized Statement (PIN)',
    payBenefit: 'Settle via BenefitPay',
    privacyMode: 'Camp Privacy Mode',
    privacyHide: 'Hide Balance (Private)',
    privacyShow: 'Show Balance',
    voiceAudio: 'Listen to Balance',
    stopVoice: 'Stop Voice Audio',
    language: 'Choose Language',
    supportSection: 'Store Support & Helpline',
    callStore: 'Call Store Hotline',
    whatsappHelp: 'WhatsApp Support',
    storeInfo: 'Store Credentials',
    crNumber: 'CR: 12345-1',
    vatNumber: 'VAT: 200000000000002',
    address: 'Block 951, Askar, Bahrain',
    nbrCompliant: 'NBR 10% VAT Compliant',
    close: 'Close Menu'
  },
  ar: {
    title: 'القائمة والأدوات',
    storeName: 'أسواق أسكر المركزية',
    storeSubtitle: 'الفرع الرئيسي • مملكة البحرين',
    myAccount: 'حساب الخاتة الخاص بي',
    accountActive: 'نشط ومعتمد',
    accountFrozen: 'مقفل / مجمد',
    freezeKhata: 'تجميد الحساب (فقدان البطاقة)',
    unfreezeKhata: 'إلغاء التجميد وفتح الحساب',
    homeLookup: 'البحث عن الحساب ومسح الرمز',
    liveTab: 'كشف الحساب المباشر والسداد',
    fullStatement: 'كشف الحساب التفصيلي (رقم سري)',
    payBenefit: 'السداد عبر بنفت بي',
    privacyMode: 'وضع الخصوصية في السكن',
    privacyHide: 'إخفاء الرصيد (خصوصية)',
    privacyShow: 'إظهار الرصيد',
    voiceAudio: 'استمع إلى الرصيد بالصوت',
    stopVoice: 'إيقاف الصوت',
    language: 'اختر اللغة',
    supportSection: 'الدعم وخدمة العملاء',
    callStore: 'الاتصال بالفرع مباشرة',
    whatsappHelp: 'محادثة الدعم عبر واتساب',
    storeInfo: 'بيانات المتجر الرسمية',
    crNumber: 'ست: 12345-1',
    vatNumber: 'الرقم الضريبي: 200000000000002',
    address: 'مجمع 951، عسكر، البحرين',
    nbrCompliant: 'معتمد لدى الجهاز الوطني للإيرادات',
    close: 'إغلاق القائمة'
  },
  ml: {
    title: 'മെനു & വിവരങ്ങൾ',
    storeName: 'അസ്കർ സൂപ്പർമാർക്കറ്റ്',
    storeSubtitle: 'മെയിൻ ബ്രാഞ്ച് • ബഹ്‌റൈൻ',
    myAccount: 'എന്റെ ഖാത്ത അക്കൗണ്ട്',
    accountActive: 'ആക്റ്റീവ് അക്കൗണ്ട്',
    accountFrozen: 'ലോക്ക് ചെയ്ത അക്കൗണ്ട്',
    freezeKhata: 'കാർഡ് നഷ്ടപ്പെട്ടാൽ ലോക്ക് ചെയ്യുക',
    unfreezeKhata: 'ലോക്ക് മാറ്റുക',
    homeLookup: 'സെർച്ചും QR സ്കാനറും',
    liveTab: 'ലൈവ് ബാലൻസും പേയ്‌മെന്റും',
    fullStatement: 'മുഴുവൻ ബിൽ വിവരങ്ങൾ (PIN)',
    payBenefit: 'ബെനിഫിറ്റ് പേ വഴി നൽകുക',
    privacyMode: 'ക്യാമ്പ് പ്രൈവസി മോഡ്',
    privacyHide: 'ബാലൻസ് മറയ്ക്കുക',
    privacyShow: 'ബാലൻസ് കാണിക്കുക',
    voiceAudio: 'ബാലൻസ് ശബ്ദത്തിൽ കേൾക്കുക',
    stopVoice: 'ശബ്ദം നിർത്തുക',
    language: 'ഭാഷ തിരഞ്ഞെടുക്കുക',
    supportSection: 'സഹായത്തിന് വിളിക്കാം',
    callStore: 'കടയിലേക്ക് വിളിക്കുക',
    whatsappHelp: 'വാട്ട്സ്ആപ്പ് സഹായം',
    storeInfo: 'സ്ഥാപന വിവരങ്ങൾ',
    crNumber: 'CR: 12345-1',
    vatNumber: 'VAT: 200000000000002',
    address: 'ബ്ലോക്ക് 951, അസ്കർ, ബഹ്‌റൈൻ',
    nbrCompliant: 'NBR 10% വാറ്റ് അംഗീകൃതം',
    close: 'മെനു അടയ്ക്കുക'
  },
  bn: {
    title: 'মেনু ও অপশন',
    storeName: 'আসকার সুপারমার্কেট',
    storeSubtitle: 'মূল শাখা • বাহরাইন',
    myAccount: 'আমার খাতা অ্যাকাউন্ট',
    accountActive: 'সক্রিয় হিসাব',
    accountFrozen: 'লক করা হিসাব',
    freezeKhata: 'খাতা লক করুন (কার্ড হারালে)',
    unfreezeKhata: 'খাতা আনলক করুন',
    homeLookup: 'খাতা খুঁজুন ও QR স্ক্যানার',
    liveTab: 'লাইভ ব্যালেন্স ও পেমেন্ট',
    fullStatement: 'সম্পূর্ণ হিসাব (PIN সুরক্ষিত)',
    payBenefit: 'বেনিফিট পে পেমেন্ট',
    privacyMode: 'গোপনীয়তা মোড',
    privacyHide: 'ব্যালেন্স লুকান',
    privacyShow: 'ব্যালেন্স দেখান',
    voiceAudio: 'ব্যালেন্স শুনুন',
    stopVoice: 'অডিও বন্ধ করুন',
    language: 'ভাষা নির্বাচন করুন',
    supportSection: 'সহায়তা ও যোগাযোগ',
    callStore: 'দোকানে সরাসরি কল করুন',
    whatsappHelp: 'হোয়াটসঅ্যাপে যোগাযোগ',
    storeInfo: 'দোকানের বিবরণ',
    crNumber: 'CR: 12345-1',
    vatNumber: 'VAT: 200000000000002',
    address: 'ব্লক ৯৫১, আসকার, বাহরাইন',
    nbrCompliant: 'NBR ১০% ভ্যাট অনুমোদিত',
    close: 'মেনু বন্ধ করুন'
  },
  hi: {
    title: 'मेनू और सुविधाएं',
    storeName: 'अस्कर सुपरमार्केट',
    storeSubtitle: 'मुख्य शाखा • बहरीन',
    myAccount: 'मेरा खाता अकाउंट',
    accountActive: 'सक्रिय और सत्यापित',
    accountFrozen: 'लॉक किया गया खाता',
    freezeKhata: 'खाता फ्रीज करें (कार्ड खोने पर)',
    unfreezeKhata: 'खाता अनलॉक करें',
    homeLookup: 'खाता खोज और QR स्कैनर',
    liveTab: 'लाइव बैलेंस और भुगतान',
    fullStatement: 'विस्तृत स्टेटमेंट (PIN)',
    payBenefit: 'बेनिफिट पे से भुगतान',
    privacyMode: 'प्राइवेसी मोड',
    privacyHide: 'बैलेंस छुपाएं',
    privacyShow: 'बैलेंस दिखाएं',
    voiceAudio: 'बैलेंस सुनें',
    stopVoice: 'ऑडियो रोकें',
    language: 'भाषा चुनें',
    supportSection: 'सहायता और संपर्क',
    callStore: 'दुकान पर कॉल करें',
    whatsappHelp: 'व्हाट्सएप सहायता',
    storeInfo: 'दुकान का विवरण',
    crNumber: 'CR: 12345-1',
    vatNumber: 'VAT: 200000000000002',
    address: 'ब्लॉक 951, अस्कर, बहरीन',
    nbrCompliant: 'NBR 10% वैट अनुपालन',
    close: 'मेनू बंद करें'
  }
};

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ar', label: 'العربية', flag: '🇧🇭' },
  { code: 'ml', label: 'മലയാളം', flag: '🇮🇳' },
  { code: 'bn', label: 'বাংলা', flag: '🇧🇩' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' }
];

export default function HamburgerDrawer({
  isOpen,
  onClose,
  customer,
  lang = 'en',
  onSelectLang,
  hideBalance = false,
  onToggleHideBalance,
  isSpeaking = false,
  onToggleVoice,
  onToggleFreeze,
  isFrozen = false,
  freezeLoading = false,
  onOpenBenefitPay
}) {
  const navigate = useNavigate();
  const t = DRAWER_TEXTS[lang] || DRAWER_TEXTS.en;
  const isRtl = lang === 'ar';

  if (!isOpen) return null;

  const customerId = customer?.id || '';
  const customerName = customer?.name || '';
  const balanceNum = Number(customer?.balance || 0);
  const isDebt = balanceNum > 0.0005;
  const isCredit = balanceNum < -0.0005;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden text-left" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
      />

      {/* Drawer Panel */}
      <aside className={`absolute inset-y-0 ${isRtl ? 'right-0' : 'left-0'} w-full max-w-xs sm:max-w-sm bg-slate-900 border-${isRtl ? 'l' : 'r'} border-slate-800 shadow-2xl flex flex-col z-10 transition-transform duration-300 transform translate-x-0 overflow-y-auto`}>
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 sticky top-0 z-20">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-md shadow-emerald-950/60">
              <Store className="w-5 h-5 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-xs font-black text-white tracking-wide">{t.storeName}</h2>
              <p className="text-[10px] text-slate-400">{t.storeSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
            title={t.close}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 p-4 space-y-4 text-xs">
          {/* Customer Profile Card (if available) */}
          {customer && (
            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 shadow-inner space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold block mb-0.5">
                    {t.myAccount}
                  </span>
                  <h3 className="text-sm font-bold text-white truncate max-w-[180px]">
                    {customerName}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono">ID: {customerId}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  isFrozen
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                }`}>
                  {isFrozen ? t.accountFrozen : t.accountActive}
                </span>
              </div>

              {/* Balance Summary in Drawer */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-medium">Balance</span>
                <span className={`font-mono font-bold text-sm ${
                  isCredit ? 'text-emerald-400' : isDebt ? 'text-rose-400' : 'text-slate-300'
                }`}>
                  {hideBalance ? '••••••' : `BHD ${Math.abs(balanceNum).toFixed(3)}`}
                </span>
              </div>

              {/* 1-Tap Freeze Toggle */}
              {onToggleFreeze && (
                <button
                  type="button"
                  onClick={onToggleFreeze}
                  disabled={freezeLoading}
                  className={`w-full mt-1 py-2 px-3 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                    isFrozen
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-rose-300 hover:border-rose-500/30'
                  }`}
                >
                  {freezeLoading ? (
                    <span>...</span>
                  ) : isFrozen ? (
                    <>
                      <Unlock className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t.unfreezeKhata}</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t.freezeKhata}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Navigation Links */}
          <div className="space-y-1">
            <Link
              to="/"
              onClick={onClose}
              className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-800 text-slate-200 hover:text-white transition group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-emerald-400">
                  <Search className="w-3.5 h-3.5" />
                </div>
                <span className="font-semibold text-xs">{t.homeLookup}</span>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 text-slate-500 group-hover:text-white ${isRtl ? 'rotate-180' : ''}`} />
            </Link>

            {customerId && (
              <>
                <Link
                  to={`/tab/${encodeURIComponent(customerId)}`}
                  onClick={onClose}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-800 text-slate-200 hover:text-white transition group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <CreditCard className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-semibold text-xs">{t.liveTab}</span>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 text-slate-500 group-hover:text-white ${isRtl ? 'rotate-180' : ''}`} />
                </Link>

                <Link
                  to={`/statement/${encodeURIComponent(customerId)}`}
                  onClick={onClose}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-800 text-slate-200 hover:text-white transition group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-semibold text-xs">{t.fullStatement}</span>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 text-slate-500 group-hover:text-white ${isRtl ? 'rotate-180' : ''}`} />
                </Link>

                {onOpenBenefitPay && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenBenefitPay();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-800 text-slate-200 hover:text-white transition group cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-semibold text-xs">{t.payBenefit}</span>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 text-slate-500 group-hover:text-white ${isRtl ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Privacy & Accessibility Toggles */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            {onToggleHideBalance && (
              <button
                type="button"
                onClick={onToggleHideBalance}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-slate-300 transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  {hideBalance ? (
                    <EyeOff className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Eye className="w-4 h-4 text-slate-400" />
                  )}
                  <span className="font-medium text-xs">
                    {hideBalance ? t.privacyShow : t.privacyHide}
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400">
                  {hideBalance ? 'OFF' : 'ON'}
                </span>
              </button>
            )}

            {onToggleVoice && (
              <button
                type="button"
                onClick={onToggleVoice}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer ${
                  isSpeaking
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse'
                    : 'bg-slate-950/80 hover:bg-slate-800 border-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isSpeaking ? (
                    <VolumeX className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                  )}
                  <span className="font-medium text-xs">
                    {isSpeaking ? t.stopVoice : t.voiceAudio}
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400">
                  🔊
                </span>
              </button>
            )}
          </div>

          {/* Language Switcher */}
          <div className="pt-2 border-t border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
              {t.language}
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {LANGUAGES.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => {
                    if (onSelectLang) onSelectLang(item.code);
                  }}
                  className={`py-2 px-2.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    lang === item.code
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-slate-950/60 hover:bg-slate-800 text-slate-300 border border-slate-800'
                  }`}
                >
                  <span>{item.flag}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Store Support Hotline & WhatsApp */}
          <div className="pt-2 border-t border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
              {t.supportSection}
            </span>
            <div className="grid grid-cols-2 gap-2">
              <a
                href="tel:17700000"
                className="min-h-[42px] py-2 px-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-[11px] font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition"
              >
                <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t.callStore}</span>
              </a>
              <a
                href="https://wa.me/97339999999?text=Hello%20Askar%20Supermarket%2C%20I%20have%20an%20inquiry%20regarding%20my%20Khata."
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[42px] py-2 px-2.5 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/60 rounded-xl text-[11px] font-semibold text-emerald-300 flex items-center justify-center gap-1.5 transition"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t.whatsappHelp}</span>
              </a>
            </div>
          </div>

          {/* Store Info & Tax Credentials */}
          <div className="pt-2 border-t border-slate-800/60 text-[10px] text-slate-500 font-mono space-y-0.5">
            <div className="flex items-center gap-1 text-emerald-400/80 font-bold">
              <ShieldCheck className="w-3 h-3" />
              <span>{t.nbrCompliant}</span>
            </div>
            <p>{t.crNumber} • {t.vatNumber}</p>
            <p>{t.address}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
