import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ShoppingBag, Sparkles, CheckCircle2, ShieldCheck, Users, ArrowRight } from 'lucide-react';

interface CartItem {
  id?: string;
  name: string;
  price?: number;
  sellingPrice?: number;
  qty?: number;
  quantity?: number;
}

interface KhataCustomer {
  id: string;
  name: string;
  balance?: number;
  currentBalance?: number;
  mess_id?: string;
  group_name?: string;
}

// Supplier Ad Network Campaigns for Monetization (Almarai, Nada, Daily Specials)
const PROMO_ADS = [
  {
    id: 'almarai',
    brand: 'Almarai المراعي',
    tagline: 'Farm Fresh Quality Every Day',
    subtext: '100% Pure Fresh Milk, Laban & Cheddar Cheese',
    badge: 'Sponsored Partner',
    accentColor: '#0284c7', // Sky-600
    bgGradient: 'from-sky-900 via-blue-950 to-slate-950',
    icon: '🥛',
    dealText: 'Fresh Daily Deliveries — Available in Dairy Chiller'
  },
  {
    id: 'nada',
    brand: 'Nada ندى',
    tagline: 'Pure Natural Juices & Fresh Dairy',
    subtext: 'No Added Sugar • Rich in Vitamin C',
    badge: 'Special Supplier Promo',
    accentColor: '#16a34a', // Emerald-600
    bgGradient: 'from-emerald-950 via-teal-950 to-slate-950',
    icon: '🍊',
    dealText: 'Buy 2 Large Fresh Juices & Save 15% Today'
  },
  {
    id: 'bakery',
    brand: 'Askar Fresh Oven مخبز عسكر',
    tagline: 'Hot Stone Bakery Baked Hourly',
    subtext: 'Fresh Samoli, Tandoor Khubz & Warm Croissants',
    badge: 'In-Store Daily Deal',
    accentColor: '#d97706', // Amber-600
    bgGradient: 'from-amber-950 via-stone-950 to-slate-950',
    icon: '🥐',
    dealText: 'Fresh Batch Out of the Oven Right Now'
  },
  {
    id: 'benefit',
    brand: 'BenefitPay بنفت بي',
    tagline: 'Instant QR Contactless Payments',
    subtext: 'Fast, Secure & 100% Free Fawri+ Local Transfers',
    badge: 'Official Payment Partner',
    accentColor: '#dc2626', // Red-600
    bgGradient: 'from-red-950 via-rose-950 to-slate-950',
    icon: '⚡',
    dealText: 'Scan & Pay Instantly with your Mobile Banking App'
  }
];

export default function CustomerDisplayPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [customer, setCustomer] = useState<KhataCustomer | null>(null);
  const [qrCheckoutUrl, setQrCheckoutUrl] = useState<string | null>(null);
  const [currentAdIndex, setCurrentAdIndex] = useState(0);

  // 1. Dual-Channel Listeners (BroadcastChannel 'sunmi_dual_screen' & 'askar_customer_display_channel')
  useEffect(() => {
    let sunmiChannel: BroadcastChannel | null = null;
    let askarChannel: BroadcastChannel | null = null;

    try {
      sunmiChannel = new BroadcastChannel('sunmi_dual_screen');
      sunmiChannel.onmessage = (event) => {
        const data = event.data;
        if (!data) return;

        if (data.type === 'STATE_UPDATE' && data.payload) {
          const rawCart = data.payload.cart || [];
          setCart(rawCart);
          setTotal(Number(data.payload.total ?? rawCart.reduce((s: number, i: any) => s + (i.price || i.sellingPrice || 0) * (i.qty || i.quantity || 1), 0)));
          setCustomer(data.payload.customer || null);
          setQrCheckoutUrl(null);
        }

        if (data.type === 'SHOW_QR' && data.payload) {
          setQrCheckoutUrl(data.payload.url || data.payload.qrPayload || null);
        }
      };
    } catch (e) {
      console.warn('sunmi_dual_screen broadcast not supported', e);
    }

    try {
      askarChannel = new BroadcastChannel('askar_customer_display_channel');
      askarChannel.onmessage = (event) => {
        const data = event.data;
        if (!data) return;

        // Legacy format handling
        if (data.recentItems || data.total !== undefined) {
          setCart(data.recentItems || []);
          setTotal(Number(data.total || 0));
          if (data.customerName) {
            setCustomer({ id: 'active', name: data.customerName, balance: data.customerBalance || 0 });
          } else if (data.customer) {
            setCustomer(data.customer);
          } else if (data.recentItems?.length === 0 && !data.isBenefitPay) {
            setCustomer(null);
          }

          if (data.isBenefitPay) {
            setQrCheckoutUrl(data.qrPayload || `BH-BENEFIT-FAWRI:TOTAL=${data.total}`);
          } else if (!data.isBenefitPay && !qrCheckoutUrl) {
            setQrCheckoutUrl(null);
          }
        }
      };
    } catch (e) {
      console.warn('askar_customer_display_channel broadcast not supported', e);
    }

    // Storage event for cross-browser fallback
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'askar_customer_display_state' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setTotal(Number(parsed.total || 0));
          setCart(parsed.recentItems || []);
          if (parsed.isBenefitPay) {
            setQrCheckoutUrl(parsed.qrPayload || `BH-BENEFIT-FAWRI:TOTAL=${parsed.total}`);
          }
          if (parsed.customerName) {
            setCustomer({ id: 'active', name: parsed.customerName, balance: parsed.customerBalance || 0 });
          }
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      sunmiChannel?.close();
      askarChannel?.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // 2. The Idle Ad Network: Auto-loop billboards every 6 seconds when register is empty
  useEffect(() => {
    if (cart.length > 0 || customer || qrCheckoutUrl) return;

    const timer = setInterval(() => {
      setCurrentAdIndex((prev) => (prev + 1) % PROMO_ADS.length);
    }, 6000);

    return () => clearInterval(timer);
  }, [cart.length, customer, qrCheckoutUrl]);

  const activeAd = PROMO_ADS[currentAdIndex];
  const customerBalance = customer ? Number(customer.balance ?? customer.currentBalance ?? 0) : 0;

  // ════════════════════════════════════════════════════════════════════════════
  // BIG IDEA 1: THE IDLE AD NETWORK & DIGITAL BILLBOARD (Cart = 0 & No Customer)
  // ════════════════════════════════════════════════════════════════════════════
  if (cart.length === 0 && !customer && !qrCheckoutUrl) {
    return (
      <div className="w-full h-full min-h-screen bg-slate-950 flex flex-col justify-between p-4 sm:p-6 relative overflow-hidden select-none animate-in fade-in duration-300">
        {/* Dynamic Promotional Background with ambient glow */}
        <div className={`absolute inset-0 bg-gradient-to-br ${activeAd.bgGradient} opacity-95 transition-all duration-700`} />
        
        {/* Top Header: Store Brand & Sponsored Badge */}
        <div className="relative z-10 flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-xl shadow-xl">
              🏪
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-wider uppercase">
                Askar Supermarket
              </h2>
              <p className="text-[10px] text-emerald-400 font-bold font-arabic">
                أسواق عسكر المركزية • فرع عسكر الرئيسي
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-white/15 text-white border border-white/20 backdrop-blur-md">
              {activeAd.badge}
            </span>
            <div className="flex gap-1.5">
              {PROMO_ADS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === currentAdIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/30'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Center Spotlight: The Featured Supplier Billboard */}
        <div className="relative z-10 flex items-center justify-between gap-4 py-3 my-auto">
          <div className="max-w-xl space-y-2.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 text-white text-xs font-bold">
              <span>{activeAd.icon}</span>
              <span>{activeAd.brand}</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight">
              {activeAd.tagline}
            </h1>

            <p className="text-sm sm:text-base text-white/80 font-medium">
              {activeAd.subtext}
            </p>

            <div className="p-3 rounded-xl bg-black/40 border border-white/10 backdrop-blur-md flex items-center gap-2.5 text-xs text-emerald-300 font-bold">
              <Sparkles size={16} className="text-emerald-400 shrink-0" />
              <span>{activeAd.dealText}</span>
            </div>
          </div>

          {/* Right Brand Icon / Visual Box */}
          <div className="shrink-0 flex flex-col items-center justify-center w-24 h-24 sm:w-48 sm:h-48 rounded-2xl bg-white/5 border border-white/15 backdrop-blur-md shadow-2xl relative">
            <div className="text-4xl sm:text-6xl animate-bounce duration-1000">
              {activeAd.icon}
            </div>
            <p className="mt-1 text-[9px] sm:text-xs font-black tracking-widest text-white/70 uppercase">
              {activeAd.brand}
            </p>
          </div>
        </div>

        {/* Bottom Bar: Checkout Prompt */}
        <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-3 text-[11px] text-white/70">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span>Fawri+ BenefitPay • Visa • Mastercard • NFC Khata Store Credit</span>
          </div>
          <div className="flex items-center gap-1.5 text-white font-bold animate-pulse">
            <span>Next Customer Please</span>
            <ArrowRight size={12} />
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // BIG IDEA 3: BENEFITPAY QR AUTO-CHECKOUT (Frictionless Mobile Camera Payment)
  // ════════════════════════════════════════════════════════════════════════════
  if (qrCheckoutUrl) {
    const fawriPayload = qrCheckoutUrl.startsWith('http') || qrCheckoutUrl.startsWith('BH-')
      ? qrCheckoutUrl
      : JSON.stringify({
          scheme: 'FAWRI_PLUS',
          merchantId: 'BH-BENEFIT-97300182',
          merchantName: 'ASKAR SUPERMARKET',
          amount: Number(total.toFixed(3)),
          currency: 'BHD',
          url: qrCheckoutUrl
        });

    return (
      <div className="w-full h-full min-h-screen bg-gradient-to-br from-red-600 via-rose-700 to-red-900 text-white flex flex-col items-center justify-between p-4 sm:p-6 select-none animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between w-full max-w-2xl border-b border-white/20 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-wider uppercase">BenefitPay Fawri+</h2>
              <p className="text-[10px] text-white/80 font-arabic">الدفع الفوري عبر بنفت بي</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase font-bold tracking-widest text-white/70">Amount Due</p>
            <p className="text-xl sm:text-2xl font-black font-mono leading-none">{total.toFixed(3)} BHD</p>
          </div>
        </div>

        {/* Center: High-Resolution QR Code */}
        <div className="flex flex-col items-center justify-center my-auto">
          <div className="bg-white p-4 rounded-3xl shadow-2xl border-4 border-white/40 flex items-center justify-center">
            <QRCodeSVG
              value={fawriPayload}
              size={180}
              level="H"
              includeMargin={false}
              fgColor="#000000"
              bgColor="#ffffff"
            />
          </div>

          <div className="mt-3 text-center space-y-1">
            <p className="text-lg sm:text-xl font-black tracking-tight text-white drop-shadow">
              Scan with BenefitPay to Pay
            </p>
            <p className="text-xs text-white/80 font-arabic">
              افتح تطبيق بنفت بي ووجّه الكاميرا لإتمام الدفع فوراً
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="w-full max-w-md bg-black/20 rounded-2xl p-2.5 border border-white/20 text-center text-[10px] sm:text-xs font-medium text-white/90">
          Instant settlement • Receipt prints automatically once confirmed
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // BIG IDEA 2 & ACTIVE CART: LIVE CART MIRROR & KHATA PROFILE REVEAL
  // ════════════════════════════════════════════════════════════════════════════
  const getStatementUrl = (customerId: string) => {
    if (typeof window !== 'undefined') {
      const custom = localStorage.getItem('khata_portal_domain');
      if (custom) return `${custom.replace(/\/+$/, '')}/tab/${customerId}`;
      const hostname = window.location.hostname;
      // In local testing or running on Sunmi terminal Android webview (where host is localhost / 127.0.0.1)
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `https://askar-khata.pages.dev/tab/${customerId}`;
      }
      return `${window.location.origin}/tab/${customerId}`;
    }
    return `https://askar-khata.pages.dev/tab/${customerId}`;
  };

  const khataStatementUrl = customer ? getStatementUrl(customer.id) : '';

  return (
    <div className="w-full h-full min-h-screen bg-slate-900 text-white flex flex-col md:flex-row select-none overflow-hidden font-sans">
      {/* ──────────────────────────────────────────────────────────────────────────
          LEFT: REAL-TIME RECEIPT PRINTER MIRROR & CART LEDGER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="w-full md:w-1/2 h-full p-4 sm:p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800 bg-slate-950/70">
        <div>
          {/* Brand Subheader */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-sm font-black text-emerald-400 tracking-wider uppercase">
                Askar Supermarket
              </h2>
              <p className="text-[10px] text-slate-400">أسواق عسكر المركزية</p>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
              {cart.length} {cart.length === 1 ? 'Item' : 'Items'}
            </span>
          </div>

          {/* Big Total Box */}
          <div className="mt-4 bg-slate-900/90 rounded-2xl p-4 border border-slate-800 shadow-inner">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
              Total Due / المجموع
            </span>
            <div className="text-5xl lg:text-6xl font-black font-mono text-emerald-400 tracking-tighter mt-1 leading-none tabular-nums">
              BD {total.toFixed(3)}
            </div>
          </div>
        </div>

        {/* Live Items Stream */}
        <div className="flex-1 flex flex-col justify-end mt-4 overflow-hidden">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between border-b border-slate-800/80 pb-1">
            <span>Current Basket Items</span>
            <span>Price</span>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[220px] pr-1">
            {cart.length === 0 ? (
              <div className="h-28 flex flex-col items-center justify-center text-slate-600 gap-1.5 border border-dashed border-slate-800 rounded-xl">
                <ShoppingBag size={24} className="opacity-40" />
                <span className="text-xs font-medium">Scanning items...</span>
              </div>
            ) : (
              cart.slice(-4).map((item, idx) => {
                const qty = item.qty ?? item.quantity ?? 1;
                const unitPrice = item.price ?? item.sellingPrice ?? 0;
                const isLatest = idx === Math.min(cart.length, 4) - 1;

                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between rounded-xl px-3 py-2 transition-all ${
                      isLatest
                        ? 'bg-emerald-500/15 border border-emerald-500/30'
                        : 'bg-slate-900/50 border border-slate-800/60 opacity-80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                      <span className="text-lg font-black text-emerald-400 font-mono shrink-0">
                        {qty}x
                      </span>
                      <span className="text-base font-bold text-white truncate leading-tight">
                        {item.name}
                      </span>
                    </div>
                    <span className="text-base font-black font-mono text-emerald-400 tabular-nums shrink-0">
                      BD {(unitPrice * qty).toFixed(3)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Left Footer */}
        <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <span>VAT (10%) Included</span>
          <span className="text-emerald-400 font-bold">Fast & Secure Checkout</span>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          RIGHT 50%: LIVE KHATA PROFILE REVEAL & BENEFITPAY CALL TO ACTION
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="w-full md:w-1/2 h-full p-4 sm:p-6 flex flex-col items-center justify-center bg-slate-900 shrink-0 text-center relative">
        {customer ? (
          /* LIVE KHATA CUSTOMER REVEAL */
          <div className="flex flex-col items-center justify-center w-full max-w-sm space-y-4 animate-in fade-in duration-200">
            {/* Customer Welcome Header */}
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Verified Khata Customer
              </span>
              <h3 className="text-2xl font-black text-white pt-1">
                Welcome, {customer.name}
              </h3>
              {customer.group_name && (
                <p className="text-xs text-indigo-300 font-bold flex items-center justify-center gap-1.5">
                  <Users size={13} />
                  <span>Mess Group: {customer.group_name}</span>
                </p>
              )}
            </div>

            {/* Current Khata Balance Metric */}
            <div className="w-full bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 shadow-inner">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Current Khata Balance
              </p>
              <p className={`text-2xl font-black font-mono mt-0.5 ${customerBalance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {customerBalance.toFixed(3)} <span className="text-sm font-bold text-slate-400">BHD</span>
              </p>
            </div>

            {/* Statement QR Code */}
            <div className="bg-white p-3 rounded-2xl shadow-2xl border-2 border-white/80">
              <QRCodeSVG
                value={khataStatementUrl}
                size={140}
                level="M"
                includeMargin={false}
              />
            </div>

            {/* Instructions */}
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-slate-300">
                Scan to View Full Statement on Phone
              </p>
              <p className="text-[10px] text-slate-400 font-arabic">
                امسح الرمز بكاميرا هاتفك لعرض كشف الحساب وتفاصيل المعاملات
              </p>
            </div>
          </div>
        ) : (
          /* DEFAULT BENEFITPAY & CONTACTLESS CALLOUT */
          <div className="flex flex-col items-center justify-center w-full max-w-sm space-y-5">
            <div className="flex items-center gap-2 bg-red-600 text-white px-4 py-1.5 rounded-full shadow-lg">
              <span className="text-xs font-black tracking-wider uppercase">BenefitPay Fawri+</span>
              <span className="text-[11px] font-arabic">بنفت بي</span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl shadow-2xl border-2 border-white/80">
              <QRCodeSVG
                value={`BH-BENEFIT-FAWRI:MERCHANT=97300182:TOTAL=${total.toFixed(3)}`}
                size={160}
                level="M"
                includeMargin={false}
              />
            </div>

            <div className="space-y-1">
              <p className="text-base font-extrabold text-white tracking-wide">
                Pay with BenefitPay
              </p>
              <p className="text-xs text-slate-400">
                Or tap your physical NFC card on terminal back
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950/60 px-3.5 py-2 rounded-xl border border-slate-800">
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
              <span>Tap Debit / Credit / Khata NFC anytime</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
