import React, { useState, useRef } from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import {
  QrCode,
  Maximize2,
  X,
  Smartphone,
  CheckCircle2,
  Zap,
  Radio
} from 'lucide-react';

const TRANSLATIONS = {
  en: {
    passTitle: 'Digital Khata Pass',
    scanHint: 'Show to cashier scanner for instant 0.1s checkout',
    tapToEnlarge: 'Tap to Enlarge',
    atCounterBtn: 'I AM AT THE COUNTER',
    atCounterActive: 'Notified POS Cashier',
    saveWallpaper: 'Save Lock-Screen Wallpaper',
    wallpaperDesc: 'Scan at counter without opening or unlocking phone',
    wallpaperSaved: 'Wallpaper downloaded! Set as phone lock screen.',
    room: 'Room / Mess',
    personalTab: 'Personal Tab',
    close: 'Close',
    modalTitle: 'Hold Phone to Cashier Scanner',
    modalHint: 'Optical barcode gun reads this instantly from your screen',
    customer: 'Customer'
  },
  ar: {
    passTitle: 'بطاقة الحساب الرقمية',
    scanHint: 'وجّه الشاشة لقارئ الباركود عند الكاشير للمسح خلال 0.1 ثانية',
    tapToEnlarge: 'انقر للتكبير وأقصى سطوع',
    atCounterBtn: 'أنا عند الكاشير',
    atCounterActive: 'تم إشعار الكاشير',
    saveWallpaper: 'حفظ كخلفية لشاشة القفل',
    wallpaperDesc: 'امسح عند الكاشير بمجرد إضاءة الشاشة دون فتح القفل',
    wallpaperSaved: 'تم تنزيل الخلفية! عيّنها كشاشة قفل لهاتفك.',
    room: 'السكن / الوجبات',
    personalTab: 'حساب شخصي',
    close: 'إغلاق',
    modalTitle: 'وجّه الشاشة لجهاز المسح عند الكاشير',
    modalHint: 'قارئ الباركود يقرأ الرمز فوراً في 0.1 ثانية',
    customer: 'الزبون'
  },
  ml: {
    passTitle: 'ഡിജിറ്റൽ ഖാത്താ പാസ്സ്',
    scanHint: 'ക്യാഷ്യറുടെ സ്കാനർക്ക് കാണിക്കുക - 0.1 സെക്കൻഡിൽ ബിൽ കണക്ട് ആകും',
    tapToEnlarge: 'വലുതാക്കാൻ തൊടുക',
    atCounterBtn: 'ഞാൻ കൗണ്ടറിലുണ്ട്',
    atCounterActive: 'ക്യാഷ്യറെ അറിയിച്ചു',
    saveWallpaper: 'ലോക്ക് സ്ക്രീൻ വാൾപേപ്പറായി സേവ് ചെയ്യുക',
    wallpaperDesc: 'ഫോൺ അൺലോക്ക് ചെയ്യാതെ സ്ക്രീൻ മാത്രം കാണിച്ചു സ്കാൻ ചെയ്യാം',
    wallpaperSaved: 'വാൾപേപ്പർ സേവ് ചെയ്തു! ഫോൺ ലോക്ക് സ്ക്രീൻ ആക്കി മാറ്റുക.',
    room: 'റൂം / മെസ്സ്',
    personalTab: 'പേഴ്സണൽ അക്കൗണ്ട്',
    close: 'അടയ്ക്കുക',
    modalTitle: 'ക്യാഷ്യറുടെ സ്കാനറിന് നേരെ കാണിക്കുക',
    modalHint: 'സ്ക്രീൻ ലോക്ക് മാറ്റാതെ തന്നെ സ്കാൻ ചെയ്യാൻ സാധിക്കും',
    customer: 'കസ്റ്റമർ'
  },
  bn: {
    passTitle: 'ডিজিটাল খাতা পাস',
    scanHint: '০.১ সেকেন্ডে বিল সংযোগ করতে ক্যাশিয়ারের স্ক্যানারে দেখান',
    tapToEnlarge: 'বড় করতে ট্যাপ করুন',
    atCounterBtn: 'আমি কাউন্টারে আছি',
    atCounterActive: 'ক্যাশিয়ারকে জানানো হয়েছে',
    saveWallpaper: 'লক-স্ক্রিন ওয়ালপেপার সংরক্ষণ করুন',
    wallpaperDesc: 'ফোন আনলক না করে শুধু স্ক্রিন দেখিয়ে স্ক্যান করুন',
    wallpaperSaved: 'ওয়ালপেপার সংরক্ষিত! লক স্ক্রিন হিসেবে সেট করুন।',
    room: 'রুম / মেস',
    personalTab: 'ব্যক্তিগত হিসাব',
    close: 'বন্ধ করুন',
    modalTitle: 'ক্যাশিয়ারের স্ক্যানারের দিকে ধরুন',
    modalHint: 'বারকোড স্ক্যানার স্ক্রিন থেকে সরাসরি রিড করবে',
    customer: 'গ্রাহক'
  },
  hi: {
    passTitle: 'डिजिटल खाता पास',
    scanHint: 'तुरंत 0.1s बिल जोड़ने के लिए कैशियर के स्कैनर को दिखाएं',
    tapToEnlarge: 'बड़ा करने के लिए टैप करें',
    atCounterBtn: 'मैं काउंटर पर हूँ',
    atCounterActive: 'कैशियर को सूचित किया गया',
    saveWallpaper: 'लॉक-स्क्रीन वॉलपेपर सेव करें',
    wallpaperDesc: 'फोन अनलॉक किए बिना सीधे स्क्रीन दिखाकर स्कैन कराएं',
    wallpaperSaved: 'वॉलपेपर सेव हो गया! इसे फोन की लॉक स्क्रीन बनाएं।',
    room: 'कमरा / मेस',
    personalTab: 'व्यक्तिগত खाता',
    close: 'बंद करें',
    modalTitle: 'कैशियर के स्कैनर के सामने रखें',
    modalHint: 'बारकोड स्कैनर स्क्रीन से तुरंत स्कैन कर लेगा',
    customer: 'ग्राहक'
  }
};

export default function DigitalKhataPass({ customer, lang = 'en' }) {
  const [showEnlargeModal, setShowEnlargeModal] = useState(false);
  const [isGeneratingWallpaper, setIsGeneratingWallpaper] = useState(false);
  const [wallpaperToast, setWallpaperToast] = useState('');
  const [beaconStatus, setBeaconStatus] = useState('IDLE');

  if (!customer) return null;

  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
  const isRtl = lang === 'ar';

  // Primary scannable token: Uses PWA tab URL for dual compatibility (POS barcode scanner gun + mobile phone camera)
  const customerId = customer.id || customer._id || customer.customerId || customer.cardUid || customer.phone;
  const baseUrl = (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
    ? window.location.origin
    : 'https://askar-khata-pwa.vercel.app';
  const passUrl = `${baseUrl}/tab/${customerId}`;

  const primaryMessName = (customer.messes && customer.messes.length > 0)
    ? customer.messes[0].group_name || customer.messes[0].name
    : null;

  // 1-Tap Counter Beacon Signal (Works across 4G/5G Cellular and Store Wi-Fi)
  const handleAnnounceAtCounter = async () => {
    if (beaconStatus === 'SENDING') return;
    setBeaconStatus('SENDING');

    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([40, 60, 40]);
      }
    } catch {}

    const payload = JSON.stringify({
      customerId: customer.id,
      terminalId: 'T1'
    });

    const headers = { 'Content-Type': 'application/json' };

    // 1. Direct Sovereign Cloudflare Edge Gateway (Always reachable over cellular 4G/5G without store Wi-Fi)
    const edgePromise = fetch('https://askar-edge-api.layali-askar-pos.workers.dev/api/khata/present-at-counter', {
      method: 'POST',
      headers,
      body: payload
    }).catch(() => null);

    // 2. Relative API or Vercel Cloud Proxy
    const vercelPromise = fetch('/api/khata/present-at-counter', {
      method: 'POST',
      headers,
      body: payload
    }).catch(() => null);

    // 3. Local store master server (only attempted if customer is on plain HTTP)
    const localPromise = (typeof window !== 'undefined' && window.location.protocol === 'http:')
      ? fetch('http://192.168.8.7:3000/api/khata/present-at-counter', {
          method: 'POST',
          headers,
          body: payload
        }).catch(() => null)
      : Promise.resolve(null);

    try {
      await Promise.all([edgePromise, vercelPromise, localPromise]);
      setBeaconStatus('SENT');
      setTimeout(() => setBeaconStatus('IDLE'), 20000);
    } catch {
      setBeaconStatus('SENT');
      setTimeout(() => setBeaconStatus('IDLE'), 20000);
    }
  };

  // Generate Lock-Screen Wallpaper (1080 x 1920 phone aspect ratio)
  const handleDownloadWallpaper = () => {
    setIsGeneratingWallpaper(true);
    try {
      const qrCanvas = document.getElementById('khata-wallpaper-qr-canvas');
      if (!qrCanvas) {
        alert('QR generator preparing, please try again in a moment');
        setIsGeneratingWallpaper(false);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d');

      // 1. Sleek Dark Slate Gradient Background
      const grad = ctx.createLinearGradient(0, 0, 0, 1920);
      grad.addColorStop(0, '#090d16');
      grad.addColorStop(0.3, '#0b1329');
      grad.addColorStop(0.7, '#081720');
      grad.addColorStop(1, '#050a10');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1920);

      // Ambient emerald glow top and bottom
      const glowTop = ctx.createRadialGradient(540, 300, 50, 540, 300, 600);
      glowTop.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
      glowTop.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = glowTop;
      ctx.fillRect(0, 0, 1080, 800);

      // 2. Supermarket Branding Header
      ctx.textAlign = 'center';
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 38px sans-serif';
      ctx.fillText('LAYALI SUPERMARKET • أسواق ليالي المركزية', 540, 240);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 28px sans-serif';
      ctx.fillText('DIGITAL KHATA PASS • بطاقة الحساب', 540, 290);

      // 3. Customer Identity Card Box
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(100, 360, 880, 260, 40);
      ctx.fill();
      ctx.stroke();

      // Customer Name
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 68px sans-serif';
      ctx.fillText(customer.name.toUpperCase(), 540, 460);

      // Mess Room or Room Number
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 36px sans-serif';
      const roomDesc = primaryMessName ? `ROOM / MESS: ${primaryMessName}` : `ACCOUNT ID: ${customer.id.slice(0, 13)}...`;
      ctx.fillText(roomDesc, 540, 530);

      if (customer.cardUid) {
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 26px monospace';
        ctx.fillText(`NFC CARD: ${customer.cardUid}`, 540, 580);
      }

      // 4. Massive Scannable QR Code Box (Pure White Background with 4-module quiet zone)
      const qrBoxSize = 720;
      const qrBoxX = (1080 - qrBoxSize) / 2;
      const qrBoxY = 670;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 48);
      ctx.fill();

      // Border around QR card
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 48);
      ctx.stroke();

      // Draw QR Canvas centered
      const qrDrawPadding = 50;
      ctx.drawImage(
        qrCanvas,
        qrBoxX + qrDrawPadding,
        qrBoxY + qrDrawPadding,
        qrBoxSize - (qrDrawPadding * 2),
        qrBoxSize - (qrDrawPadding * 2)
      );

      // 5. High-Visibility Cashier Instructions
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 42px sans-serif';
      ctx.fillText('⚡ POINT AT CASHIER SCANNER', 540, 1460);

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText('0.1s Fast Scan • No Phone Unlock Required', 540, 1515);

      ctx.fillStyle = '#64748b';
      ctx.font = 'normal 26px sans-serif';
      ctx.fillText('കൗണ്ടറിൽ ഫോൺ സ്ക്രീൻ കാണിക്കുക • لا حاجة لفتح القفل', 540, 1565);

      // Footer
      ctx.fillStyle = '#334155';
      ctx.font = 'normal 22px sans-serif';
      ctx.fillText('Layali Supermarket Official PWA Pass', 540, 1820);

      // Download Wallpaper Image
      const link = document.createElement('a');
      link.download = `Layali_Khata_Pass_${customer.name.replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      setWallpaperToast(t.wallpaperSaved);
      setTimeout(() => setWallpaperToast(''), 6000);
    } catch (err) {
      console.error('Failed to create wallpaper:', err);
      alert('Could not export wallpaper: ' + err.message);
    } finally {
      setIsGeneratingWallpaper(false);
    }
  };

  return (
    <>
      {/* Hidden offscreen QR Canvas used for the high-res Lock-Screen Wallpaper export */}
      <div style={{ position: 'fixed', left: -9999, top: -9999, visibility: 'hidden' }}>
        <QRCodeCanvas
          id="khata-wallpaper-qr-canvas"
          value={passUrl}
          size={600}
          level="M"
          marginSize={2}
          bgColor="#FFFFFF"
          fgColor="#000000"
        />
      </div>

      {/* Primary Digital Khata Pass Card */}
      <div
        id="digital-khata-pass-card"
        dir={isRtl ? 'rtl' : 'ltr'}
        className="w-full my-3 p-4 sm:p-5 bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-emerald-500/40 rounded-3xl shadow-xl relative overflow-hidden text-left"
      >
        {/* Glow corner */}
        <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-500/15 rounded-full blur-2xl pointer-events-none" />

        {/* Header Row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <QrCode className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-black text-emerald-300 uppercase tracking-wider font-sans">
                  {t.passTitle}
                </h2>
                <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  0.1s Scan
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-sans mt-0.5">
                {t.scanHint}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowEnlargeModal(true)}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer border border-slate-700 shadow-xs shrink-0"
            title={t.tapToEnlarge}
          >
            <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">{t.tapToEnlarge}</span>
          </button>
        </div>

        {/* Center: High-Contrast QR Code & Identity Block */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-center gap-4">
          {/* High-Contrast QR Code Box */}
          <div
            onClick={() => setShowEnlargeModal(true)}
            className="p-2.5 bg-white rounded-2xl shadow-lg border-2 border-emerald-400 cursor-pointer hover:scale-105 active:scale-95 transition-transform shrink-0 flex items-center justify-center"
            title="Tap to enlarge QR Code"
          >
            <QRCodeSVG
              value={passUrl}
              size={132}
              level="M"
              bgColor="#FFFFFF"
              fgColor="#000000"
            />
          </div>

          {/* Customer Metadata Block */}
          <div className="flex-1 w-full text-center sm:text-left space-y-1.5">
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              {t.customer}
            </div>
            <div className="text-xl font-black text-white tracking-tight">
              {customer.name}
            </div>

            {primaryMessName ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs font-bold font-sans">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{primaryMessName}</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300 text-xs font-medium font-sans">
                <span>{t.personalTab}</span>
              </div>
            )}

            {customer.cardUid && (
              <div className="text-[10px] font-mono text-slate-500">
                Card: <span className="text-slate-400">{customer.cardUid}</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons: 1-Tap Counter Beacon & Save Wallpaper */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Button 1: I AM AT THE COUNTER Beacon */}
          <button
            type="button"
            onClick={handleAnnounceAtCounter}
            disabled={beaconStatus === 'SENDING'}
            className={`w-full py-2.5 px-3 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md ${beaconStatus === 'SENT'
              ? 'bg-emerald-600 text-white border-2 border-emerald-400 animate-pulse'
              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 hover:shadow-emerald-500/20 active:scale-98'
              }`}
          >
            {beaconStatus === 'SENT' ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>{t.atCounterActive || 'Notified POS Cashier'}</span>
              </>
            ) : beaconStatus === 'SENDING' ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>Notifying POS...</span>
              </>
            ) : (
              <>
                <Radio className="w-4 h-4" />
                <span>{t.atCounterBtn || 'I AM AT THE COUNTER'}</span>
              </>
            )}
          </button>

          {/* Button 2: Save as Lock-Screen Wallpaper */}
          <button
            type="button"
            onClick={handleDownloadWallpaper}
            disabled={isGeneratingWallpaper}
            className="w-full py-2.5 px-3 bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition cursor-pointer active:scale-98 shadow-sm"
          >
            {isGeneratingWallpaper ? (
              <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Smartphone className="w-4 h-4 text-emerald-400" />
            )}
            <span>{t.saveWallpaper}</span>
          </button>
        </div>

        {/* Wallpaper Toast */}
        {wallpaperToast && (
          <div className="mt-2 p-2.5 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-[11px] font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{wallpaperToast}</span>
          </div>
        )}
      </div>

      {/* Fullscreen Enlarge Modal (Bright Mode for Scanner) */}
      {showEnlargeModal && (
        <div
          className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center animate-in fade-in"
          onClick={() => setShowEnlargeModal(false)}
        >
          <div
            className="bg-slate-900 border-2 border-emerald-500/60 rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowEnlargeModal(false)}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer border border-slate-700"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center justify-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-black text-emerald-400 uppercase tracking-wider font-sans">
                {t.modalTitle}
              </h3>
            </div>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              {t.modalHint}
            </p>

            {/* Giant High-Contrast Pure White QR Card */}
            <div className="p-4 bg-white rounded-3xl shadow-2xl border-4 border-emerald-400 inline-block mb-4">
              <QRCodeSVG
                value={passUrl}
                size={250}
                level="M"
                bgColor="#FFFFFF"
                fgColor="#000000"
              />
            </div>

            {/* Customer Details Under QR */}
            <div className="space-y-1">
              <div className="text-2xl font-black text-white tracking-tight">
                {customer.name}
              </div>
              {primaryMessName && (
                <div className="text-sm font-bold text-emerald-400">
                  {primaryMessName}
                </div>
              )}
              {customer.cardUid && (
                <div className="text-xs font-mono text-slate-400 mt-1">
                  {customer.cardUid}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowEnlargeModal(false)}
              className="mt-6 w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-bold text-xs transition cursor-pointer border border-slate-700"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
