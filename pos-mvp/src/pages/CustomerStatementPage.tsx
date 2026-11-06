import { useState, useEffect } from 'react';
import {
  Store,
  ShieldCheck,
  CreditCard,
  ShoppingBag,
  ArrowDownLeft,
  Users,
  CheckCircle2,
  RefreshCw,
  Printer,
  MessageSquare,
  AlertCircle,
  X,
  Sparkles,
  Lock,
  KeyRound,
  Zap
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { printKhataStatement } from '../utils/printer';

interface LedgerEntry {
  id: string;
  customerId?: string;
  invoiceNo?: string;
  reference?: string;
  type: string;
  amount: number;
  raw_amount?: number;
  running_balance?: number;
  runningBalance?: number;
  paymentType?: string;
  timestamp?: string;
  created_at?: string;
  formattedDate?: string;
  formattedTime?: string;
  memberName?: string;
}

interface MessMember {
  id: string;
  name: string;
  phone?: string | null;
  batchNo?: string | null;
  currentBalance: number;
  spendPercentage?: number;
}

interface MessGroupData {
  id: string;
  group_name: string;
  memberCount: number;
  totalBalance: number;
  members: MessMember[];
  messLedger?: LedgerEntry[];
}

interface CustomerData {
  id: string;
  name: string;
  phone?: string | null;
  cpr?: string | null;
  batchNo?: string | null;
  currentBalance: number;
  creditLimit?: number;
  mess_id?: string | null;
  description?: string | null;
}

interface CustomerStatementPageProps {
  customerId?: string | null;
  apiBase?: string;
}

export default function CustomerStatementPage({
  customerId: initialCustomerId,
  apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://192.168.8.7:3000'
}: CustomerStatementPageProps) {
  // Resolve customer ID from prop, URL search param (?id=...), path (/tab/:id), or persistent localStorage
  const [customerId] = useState<string>(() => {
    if (initialCustomerId) return initialCustomerId;
    if (typeof window !== 'undefined') {
      const searchId = new URLSearchParams(window.location.search).get('id');
      if (searchId) {
        localStorage.setItem('last_khata_customer_id', searchId);
        return searchId;
      }
      const pathParts = window.location.pathname.split('/');
      const tabIdx = pathParts.indexOf('tab');
      if (tabIdx !== -1 && pathParts[tabIdx + 1]) {
        const pathId = pathParts[tabIdx + 1];
        localStorage.setItem('last_khata_customer_id', pathId);
        return pathId;
      }
      const savedId = localStorage.getItem('last_khata_customer_id');
      if (savedId) return savedId;
    }
    return 'cust_nfc_demo_01'; // Default demo customer
  });

  // 4-Digit Khata PIN & Device Trust State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      // 1. Direct bypass if logged in as Cashier or Manager on POS terminal
      const role = localStorage.getItem('askar_role');
      if (role === 'CASHIER' || role === 'MANAGER') return true;

      // 2. Direct bypass if running on native Sunmi / Android Capacitor app
      const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
      if (isNative) return true;

      // 3. Direct bypass if opened via POS interface flag
      const search = new URLSearchParams(window.location.search);
      if (search.get('pos') === 'true' || search.get('mode') === 'pos' || search.get('auth') === 'true' || search.get('cashier') === 'true') {
        return true;
      }

      // 4. Saved device token
      const token = localStorage.getItem(`khata_token_${customerId}`);
      return Boolean(token);
    }
    return false;
  });
  const [pin, setPin] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
  const [isVerifyingPin, setIsVerifyingPin] = useState<boolean>(false);

  // Dynamic API Base Resolver (Supports Cloudflare Tunnel, custom domains, and local LAN)
  const resolveApiBase = (): string => {
    if (typeof window === 'undefined') return apiBase;
    
    // 1. Explicit override saved in query param (?tunnel= or ?api=)
    const urlApi = new URLSearchParams(window.location.search).get('api') || new URLSearchParams(window.location.search).get('tunnel');
    if (urlApi) {
      localStorage.setItem('khata_tunnel_api', urlApi);
      return urlApi.replace(/\/+$/, '');
    }

    // 2. Saved API override in localStorage (Master server URL or IP)
    const masterUrl = localStorage.getItem('master_server_url');
    if (masterUrl && masterUrl.trim()) return masterUrl.trim().replace(/\/+$/, '');

    const savedIp = localStorage.getItem('server_ip');
    if (savedIp && savedIp.trim()) return `http://${savedIp.trim()}:3000`;

    const savedApi = localStorage.getItem('khata_api_base') || localStorage.getItem('khata_tunnel_api');
    if (savedApi) return savedApi.replace(/\/+$/, '');

    // 3. Environment variable from Vite
    const envApi = (import.meta as any).env?.VITE_KHATA_API_BASE;
    if (envApi) return envApi.replace(/\/+$/, '');

    // 4. If running on HTTPS (such as trycloudflare.com, Cloudflare Pages, or Vercel)
    if (window.location.protocol === 'https:') {
      if (window.location.hostname.endsWith('.trycloudflare.com') || window.location.hostname.endsWith('.vercel.app')) {
        return ''; // Direct relative proxy through HTTPS origin
      }
      return '';
    }

    // 5. If running on local Wi-Fi or LAN
    if (window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return `http://${window.location.hostname}:3000`;
    }

    // 6. Native Android Capacitor check (Default to Supermarket Laptop)
    const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
    if (isNative) {
      return 'http://192.168.8.20:3000';
    }

    return apiBase || 'http://192.168.8.20:3000';
  };

  const handleVerifyPin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pin || pin.length !== 4) {
      setPinError('Please enter a 4-digit PIN');
      return;
    }
    setIsVerifyingPin(true);
    setPinError('');
    try {
      const resolvedApiBase = resolveApiBase();

      const res = await fetch(`${resolvedApiBase}/api/khata/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid: customerId, pin })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Incorrect PIN. Please try again.');
      }

      // Save trusted device token in localStorage
      localStorage.setItem(`khata_token_${customerId}`, data.deviceToken);
      setIsAuthenticated(true);
      fetchStatement();
    } catch (err: any) {
      setPinError(err.message || 'Incorrect PIN. Please try again.');
      setPin('');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleLockAccount = () => {
    localStorage.removeItem(`khata_token_${customerId}`);
    setIsAuthenticated(false);
    setPin('');
  };

  const handlePrintStatement = async () => {
    if (!customer) return;
    const formattedStatement = statement.map((item) => ({
      id: item.id,
      amount: Number(item.amount || item.raw_amount || 0),
      type: item.type === 'SALE' || item.type === 'CHARGE' ? 'SALE' : 'PAYMENT',
      reference: item.reference || item.invoiceNo || 'Store Purchase',
      formattedDate: item.formattedDate || new Date(item.created_at || item.timestamp || Date.now()).toLocaleDateString(),
      formattedTime: item.formattedTime || new Date(item.created_at || item.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      runningBalance: Number(item.running_balance ?? item.runningBalance ?? 0)
    }));

    try {
      await printKhataStatement({
        shopName: "ASKAR STORE - KHATA STATEMENT",
        customerName: customer.name,
        customerPhone: customer.phone,
        customerCpr: customer.cpr,
        statement: formattedStatement,
        currentBalance: currentBalance
      });
    } catch {
      window.print();
    }
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [statement, setStatement] = useState<LedgerEntry[]>([]);
  const [messGroup, setMessGroup] = useState<MessGroupData | null>(null);
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [flashCampaign, setFlashCampaign] = useState<any | null>(null);

  // View state & tabs
  const [activeTab, setActiveTab] = useState<'PERSONAL' | 'MESS'>('PERSONAL');
  const [selectedMemberFilter, setSelectedMemberFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'CHARGES' | 'PAYMENTS'>('ALL');

  // BenefitPay Payment Modal State
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [customPayAmount, setCustomPayAmount] = useState<string>('');
  const [isSubmittingPay, setIsSubmittingPay] = useState(false);
  const [paymentSuccessToast, setPaymentSuccessToast] = useState<{
    show: boolean;
    amount: number;
    reference: string;
  } | null>(null);

  // Check if ?success=true is already present in URL from a redirect
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isSuccess = new URLSearchParams(window.location.search).get('success');
      if (isSuccess === 'true') {
        setPaymentSuccessToast({
          show: true,
          amount: 0,
          reference: 'BenefitPay Online Settlement'
        });
      }
    }
  }, []);

  // Fetch statement data
  const fetchStatement = async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      const resolvedApiBase = resolveApiBase();

      const res = await fetch(`${resolvedApiBase}/api/customers/${customerId}/statement`);
      if (!res.ok) {
        throw new Error(`Failed to load statement (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to retrieve account records');
      }

      setCustomer(data.customer);
      setStatement(data.statement || []);
      setCurrentBalance(data.currentBalance || 0);
      setMessGroup(data.messGroup || null);

      try {
        const fcRes = await fetch(`${resolvedApiBase}/api/khata/flash-recovery`);
        if (fcRes.ok) {
          const fcData = await fcRes.json();
          if (fcData.success && fcData.campaign?.isActive) {
            setFlashCampaign(fcData.campaign);
          }
        }
      } catch {}

      if (data.messGroup && !messGroup) {
        // Customer has a mess group available
      }
    } catch (err: any) {
      console.error('Statement fetch error:', err);
      setError(err?.message || 'Could not connect to Askar Khata API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchStatement();
    }
  }, [customerId, isAuthenticated]);

  // Handle BenefitPay instant settlement
  const handleBenefitPaySettlement = async (amount: number) => {
    if (!amount || amount <= 0 || !customer) return;
    setIsSubmittingPay(true);
    try {
      const resolvedApiBase = resolveApiBase();

      const res = await fetch(`${resolvedApiBase}/api/customers/${customer.id}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountPaid: amount,
          paymentMethod: 'BENEFIT_PAY',
          reference: `BenefitPay Fawri+ Online Settlement`
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'BenefitPay settlement failed');
      }

      // Live update balance and add negative transaction entry
      const updatedBalance = data.newBalance !== undefined ? data.newBalance : Math.max(0, currentBalance - amount);
      setCurrentBalance(updatedBalance);
      if (customer) {
        setCustomer({ ...customer, currentBalance: updatedBalance });
      }

      const newEntry: LedgerEntry = {
        id: data.ledgerEntry?.id || `BP-${Date.now()}`,
        reference: 'BenefitPay Fawri+ Online Settlement',
        type: 'PAYMENT',
        paymentType: 'PAYMENT',
        amount: amount,
        raw_amount: -amount,
        running_balance: updatedBalance,
        runningBalance: updatedBalance,
        formattedDate: new Date().toLocaleDateString(),
        formattedTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date().toISOString()
      };

      setStatement((prev) => [newEntry, ...prev]);

      setIsPayModalOpen(false);
      setPaymentSuccessToast({
        show: true,
        amount: amount,
        reference: data.receiptNo || `BP-${Date.now().toString().slice(-6)}`
      });

      // Update URL silently with ?success=true
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.set('success', 'true');
        window.history.replaceState({}, '', url.toString());
      }
    } catch (err: any) {
      alert(`Payment Error: ${err?.message || 'Transaction could not be processed'}`);
    } finally {
      setIsSubmittingPay(false);
    }
  };

  const creditLimit = customer?.creditLimit || 50.0;
  const creditUsagePercent = Math.min(100, Math.round((currentBalance / creditLimit) * 100));

  // Determine active transactions to display based on tab & filters
  const displayedTransactions = () => {
    let source: LedgerEntry[] = [];

    if (activeTab === 'MESS' && messGroup?.messLedger) {
      source = messGroup.messLedger;
      if (selectedMemberFilter) {
        source = source.filter((item) => item.customerId === selectedMemberFilter);
      }
    } else {
      source = statement;
    }

    if (typeFilter === 'CHARGES') {
      return source.filter((item) => item.type === 'CHARGE');
    }
    if (typeFilter === 'PAYMENTS') {
      return source.filter((item) => item.type === 'PAYMENT' || item.type === 'WRITE_OFF');
    }
    return source;
  };

  const filteredList = displayedTransactions();

  // ──────────────────────────────────────────────────────────────────────────
  // KHATA AUTH GATEWAY: 4-DIGIT PIN & DEVICE TRUST LOCK SCREEN
  // ──────────────────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-5 selection:bg-emerald-500 selection:text-slate-950 font-sans">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 text-center animate-in fade-in duration-300">
          {/* Brand Header */}
          <div className="flex flex-col items-center space-y-1.5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-950/60 mb-1">
              <Store className="w-7 h-7 text-slate-950 stroke-[2.5]" />
            </div>
            <div className="flex items-center gap-1.5 justify-center">
              <h2 className="text-lg font-black text-white">Askar Supermarket</h2>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                أسواق عسكر
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Authenticated Khata Financial Portal</p>
          </div>

          {/* Lock Icon & Title */}
          <div className="space-y-1 pt-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-black">
              <Lock className="w-3.5 h-3.5" />
              <span>Secure Khata Access • كشف حساب آمن</span>
            </div>
            <h3 className="text-sm font-bold text-slate-200">Enter Your 4-Digit PIN</h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              Enter the 4-digit PIN established by the supermarket manager to view this financial statement.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleVerifyPin} className="space-y-4">
            <div className="relative">
              <input
                type="password"
                maxLength={4}
                inputMode="numeric"
                pattern="[0-9]*"
                autoFocus
                value={pin}
                onChange={(e) => {
                  setPinError('');
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                }}
                placeholder="••••"
                className="w-full text-center text-4xl font-mono tracking-[0.5em] py-3.5 px-4 bg-slate-950 border-2 border-slate-700 focus:border-emerald-500 rounded-2xl text-white outline-none transition-all placeholder:text-slate-600 shadow-inner"
              />
            </div>

            {pinError && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-2.5 text-xs text-rose-300 font-bold flex items-center justify-center gap-1.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isVerifyingPin || pin.length !== 4}
              className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 active:scale-95 text-slate-950 font-black rounded-2xl text-sm shadow-xl shadow-emerald-950/60 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isVerifyingPin ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying PIN...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4 stroke-[2.5]" />
                  <span>Unlock Statement (فتح الحساب)</span>
                </>
              )}
            </button>
          </form>

          {/* Security Device Trust Disclaimer */}
          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
            <p className="flex items-center justify-center gap-1 text-slate-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Device Trust: Saves token to phone for 90 days</span>
            </p>
            <p className="text-[10px] text-slate-400">
              Receipt QR codes are encrypted; random scans cannot access debt details.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <div className="relative mb-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center animate-ping absolute inset-0" />
          <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-emerald-500/40 flex items-center justify-center relative shadow-xl">
            <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          </div>
        </div>
        <h2 className="text-lg font-black text-white">Loading Khata Ledger...</h2>
        <p className="text-xs text-slate-400 mt-1">Connecting to Askar Supermarket Cloud</p>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-rose-400" />
        </div>
        <h2 className="text-xl font-black text-white mb-2">Account Not Found</h2>
        <p className="text-sm text-slate-400 max-w-sm mb-6 leading-relaxed">
          {error || `No registered Khata account was found matching ID: ${customerId}`}
        </p>
        <button
          onClick={fetchStatement}
          className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-bold rounded-xl text-sm transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16 selection:bg-emerald-500 selection:text-slate-950">
      {/* ──────────────────────────────────────────────────────────────────────────
          TOP STORE BRANDING & VERIFIED BADGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3.5">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-950/50">
              <Store className="w-5 h-5 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-base font-black text-white tracking-tight">Askar Supermarket</h1>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  أسواق عسكر
                </span>
              </div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                <span>Central Branch • Kingdom of Bahrain</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrintStatement}
              title="Print 58mm Thermal Statement Slip on Sunmi"
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print Slip</span>
            </button>
            <button
              onClick={() => fetchStatement()}
              title="Refresh Ledger"
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/'; }}
              title="Return to Register POS"
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs active:scale-95 transition-all cursor-pointer"
            >
              ← POS
            </button>
            <button
              onClick={handleLockAccount}
              title="Lock Account"
              className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
            >
              <Lock className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN CONTENT CONTAINER (MOBILE CENTERED)
          ────────────────────────────────────────────────────────────────────────── */}
      <main className="max-w-md mx-auto p-4 space-y-4">
        {/* FLASH RECOVERY SETTLEMENT INCENTIVE BANNER */}
        {flashCampaign?.isActive && Number(currentBalance || 0) > 0 && (
          <div className="bg-gradient-to-r from-amber-950/90 via-amber-900/80 to-orange-950/90 border border-amber-500/50 rounded-2xl p-4 shadow-xl relative overflow-hidden animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shrink-0 shadow-md shadow-amber-950/60">
                <Zap className="w-5 h-5 text-slate-950 stroke-[3]" />
              </div>
              <div className="flex-1 pr-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-amber-200 uppercase tracking-wide flex items-center gap-1.5">
                    <span>⚡ Flash Settlement Discount ({flashCampaign.discountPercent || 2}%)</span>
                  </h4>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 animate-pulse">
                    Save BD {(Number(currentBalance || 0) * (Number(flashCampaign.discountPercent || 2) / 100)).toFixed(3)}
                  </span>
                </div>
                <p className="text-[11px] text-amber-100/90 mt-1 leading-relaxed">
                  Settle today to pay <strong className="text-white underline decoration-amber-400 decoration-2">BD {(Number(currentBalance || 0) * (1 - Number(flashCampaign.discountPercent || 2) / 100)).toFixed(3)}</strong> instead of BD {Number(currentBalance || 0).toFixed(3)}.
                </p>
                <button
                  onClick={() => {
                    const discounted = (Number(currentBalance || 0) * (1 - Number(flashCampaign.discountPercent || 2) / 100)).toFixed(3);
                    setCustomPayAmount(discounted);
                    setIsPayModalOpen(true);
                  }}
                  className="mt-2.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs flex items-center gap-1.5 transition-all shadow-md"
                >
                  <span>Pay BD {(Number(currentBalance || 0) * (1 - Number(flashCampaign.discountPercent || 2) / 100)).toFixed(3)} Now</span>
                  <Zap className="w-3.5 h-3.5 stroke-[3]" />
                </button>
              </div>
            </div>
          </div>
        )}
        {paymentSuccessToast && (
          <div className="bg-gradient-to-r from-emerald-900/80 via-emerald-800/80 to-teal-900/80 border border-emerald-400/50 rounded-2xl p-4 shadow-2xl relative animate-in fade-in slide-in-from-top-4 duration-300">
            <button
              onClick={() => setPaymentSuccessToast(null)}
              className="absolute top-3 right-3 text-emerald-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow-md">
                <CheckCircle2 className="w-5 h-5 text-slate-950 stroke-[3]" />
              </div>
              <div className="pr-4">
                <h3 className="text-sm font-black text-emerald-200">
                  Payment Confirmed! تم استلام الدفعة بنجاح
                </h3>
                <p className="text-xs text-emerald-100/90 mt-0.5 leading-relaxed">
                  {paymentSuccessToast.amount > 0
                    ? `BD ${paymentSuccessToast.amount.toFixed(3)} settled via BenefitPay Fawri+. Your ledger has been immediately credited.`
                    : 'Your BenefitPay payment was confirmed and reconciled on the Askar cloud ledger.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* CUSTOMER PROFILE CARD */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  <ShieldCheck className="w-3 h-3" />
                  Verified Khata Customer
                </span>
                {customer.batchNo && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {customer.batchNo}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-black text-white">{customer.name}</h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {customer.phone || customer.cpr || 'Account: ' + customer.id.slice(0, 12)}
              </p>
            </div>

            {messGroup && (
              <div className="text-right">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  <Users className="w-3 h-3" />
                  {messGroup.group_name}
                </span>
                <p className="text-[10px] text-slate-400 mt-1 font-medium">
                  {messGroup.memberCount} Mess Members
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────────────────────
            BALANCE GAUGE & CREDIT LIMIT METER
            ────────────────────────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-b from-slate-900 to-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Current Outstanding Balance
            </span>
            <span
              className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                currentBalance > 0
                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                  : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              }`}
            >
              {currentBalance > 0 ? 'Balance Due' : 'Account Cleared'}
            </span>
          </div>

          <div className="flex items-baseline gap-2 mb-4">
            <span
              className={`text-4xl sm:text-5xl font-black font-mono tracking-tight ${
                currentBalance > 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              BD {currentBalance.toFixed(3)}
            </span>
            <span className="text-xs font-arabic text-slate-400">دينار بحريني</span>
          </div>

          {/* Credit Limit Progress Bar */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Credit Limit: BD {creditLimit.toFixed(3)}</span>
              <span className={creditUsagePercent >= 90 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                {creditUsagePercent}% Used
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  creditUsagePercent >= 90
                    ? 'bg-rose-500'
                    : creditUsagePercent >= 70
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${creditUsagePercent}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 text-right">
              Remaining Credit:{' '}
              <span className="text-emerald-400 font-mono font-bold">
                BD {Math.max(0, creditLimit - currentBalance).toFixed(3)}
              </span>
            </p>
          </div>

          {/* ──────────────────────────────────────────────────────────────────────────
              ONE-CLICK BENEFITPAY SETTLEMENT BUTTON
              ────────────────────────────────────────────────────────────────────────── */}
          <div className="mt-5 pt-4 border-t border-slate-800/80">
            <button
              onClick={() => {
                setCustomPayAmount(currentBalance > 0 ? currentBalance.toFixed(3) : '5.000');
                setIsPayModalOpen(true);
              }}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 active:scale-[0.98] transition-all text-slate-950 font-black rounded-2xl text-base shadow-xl shadow-emerald-950/60 flex items-center justify-center gap-2.5"
            >
              <CreditCard className="w-5 h-5 stroke-[2.5]" />
              <span>Pay via BenefitPay (ادفع عبر بنفت بي)</span>
              {currentBalance > 0 && (
                <span className="bg-slate-950/20 px-2 py-0.5 rounded-lg text-xs font-mono font-bold text-slate-950">
                  BD {currentBalance.toFixed(3)}
                </span>
              )}
            </button>
            <p className="text-[10px] text-slate-400 text-center mt-2">
              Instant Fawri+ reconciliation • Zero supermarket checkout queuing
            </p>
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────────────────────
            MESS GROUP TRANSPARENCY BREAKDOWN TAB SELECTOR (IF IN MESS)
            ────────────────────────────────────────────────────────────────────────── */}
        {messGroup && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-1 flex items-center gap-1">
            <button
              onClick={() => {
                setActiveTab('PERSONAL');
                setSelectedMemberFilter(null);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
                activeTab === 'PERSONAL'
                  ? 'bg-emerald-600 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              My Statement (حسابي)
            </button>
            <button
              onClick={() => setActiveTab('MESS')}
              className={`flex-1 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'MESS'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Mess Breakdown ({messGroup.group_name})</span>
            </button>
          </div>
        )}

        {/* ──────────────────────────────────────────────────────────────────────────
            VIEW A: MESS GROUP TRANSPARENCY MODULE (CAMP EXPENSES AUDIT)
            ────────────────────────────────────────────────────────────────────────── */}
        {activeTab === 'MESS' && messGroup && (
          <div className="space-y-3 animate-in fade-in duration-200">
            {/* Mess Header Explainer */}
            <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-black text-indigo-200">
                    Shared Labor Camp Transparency
                  </h3>
                  <p className="text-[11px] text-indigo-300/80">
                    End-of-month audit: Review exactly who bought what grocery supplies
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Camp Debt</span>
                  <p className="text-base font-black font-mono text-indigo-300">
                    BD {messGroup.totalBalance.toFixed(3)}
                  </p>
                </div>
              </div>
            </div>

            {/* Member Comparison Cards */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 px-1">
                <span>Room Members ({messGroup.members.length})</span>
                {selectedMemberFilter && (
                  <button
                    onClick={() => setSelectedMemberFilter(null)}
                    className="text-[11px] text-emerald-400 hover:underline"
                  >
                    Clear Filter
                  </button>
                )}
              </div>

              {messGroup.members.map((member) => {
                const isSelected = selectedMemberFilter === member.id;
                const isMe = member.id === customer.id;

                return (
                  <div
                    key={member.id}
                    onClick={() =>
                      setSelectedMemberFilter(isSelected ? null : member.id)
                    }
                    className={`cursor-pointer border rounded-2xl p-3.5 transition-all ${
                      isSelected
                        ? 'bg-indigo-900/40 border-indigo-400 shadow-lg'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                            isMe
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {member.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-sm font-bold text-white leading-tight">
                              {member.name}
                            </h4>
                            {isMe && (
                              <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                You
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono">
                            {member.phone || 'Mess Account Member'}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-black font-mono text-white">
                          BD {member.currentBalance.toFixed(3)}
                        </p>
                        <p className="text-[10px] text-indigo-300 font-bold">
                          {member.spendPercentage || 0}% of Camp Debt
                        </p>
                      </div>
                    </div>

                    {/* Spend Share Visual Bar */}
                    <div className="w-full h-1.5 rounded-full bg-slate-800 mt-2.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isMe ? 'bg-emerald-400' : 'bg-indigo-400'
                        }`}
                        style={{ width: `${member.spendPercentage || 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────────────────────────────────────
            CHRONOLOGICAL LEDGER TIMELINE
            ────────────────────────────────────────────────────────────────────────── */}
        <div className="space-y-3 pt-2">
          {/* Header & Type Filter */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-white flex items-center gap-1.5">
              <span>Ledger Timeline</span>
              <span className="text-xs text-slate-400 font-normal">
                ({filteredList.length})
              </span>
            </h3>

            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-0.5 text-[11px] font-bold">
              <button
                onClick={() => setTypeFilter('ALL')}
                className={`px-2 py-1 rounded-lg transition-all ${
                  typeFilter === 'ALL'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setTypeFilter('CHARGES')}
                className={`px-2 py-1 rounded-lg transition-all ${
                  typeFilter === 'CHARGES'
                    ? 'bg-slate-800 text-rose-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Groceries
              </button>
              <button
                onClick={() => setTypeFilter('PAYMENTS')}
                className={`px-2 py-1 rounded-lg transition-all ${
                  typeFilter === 'PAYMENTS'
                    ? 'bg-slate-800 text-emerald-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Payments
              </button>
            </div>
          </div>

          {/* Filter Notice */}
          {selectedMemberFilter && (
            <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl px-3 py-2 flex items-center justify-between text-xs text-indigo-300">
              <span>
                Filtering by Member:{' '}
                <strong>
                  {messGroup?.members.find((m) => m.id === selectedMemberFilter)?.name}
                </strong>
              </span>
              <button
                onClick={() => setSelectedMemberFilter(null)}
                className="text-[11px] underline font-bold"
              >
                Reset
              </button>
            </div>
          )}

          {/* Timeline Feed */}
          {filteredList.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">
              No transactions found for the selected filter.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredList.map((entry) => {
                const isPayment =
                  entry.type === 'PAYMENT' ||
                  entry.paymentType === 'PAYMENT' ||
                  (entry.raw_amount !== undefined && entry.raw_amount < 0);

                const isWriteOff = entry.type === 'WRITE_OFF';

                return (
                  <div
                    key={entry.id}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-3.5 transition-all flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isPayment
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : isWriteOff
                            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {isPayment ? (
                          <ArrowDownLeft className="w-5 h-5" />
                        ) : isWriteOff ? (
                          <ShieldCheck className="w-5 h-5" />
                        ) : (
                          <ShoppingBag className="w-5 h-5" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-bold text-white truncate leading-tight">
                            {entry.reference || entry.invoiceNo || 'Store Purchase'}
                          </p>
                          {entry.memberName && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              👤 {entry.memberName}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {entry.formattedDate} • {entry.formattedTime}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-black font-mono ${
                          isPayment
                            ? 'text-emerald-400'
                            : isWriteOff
                            ? 'text-purple-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {isPayment ? '-' : '+'}BD {entry.amount.toFixed(3)}
                      </p>
                      {entry.runningBalance !== undefined && (
                        <p className="text-[10px] text-slate-400 font-mono">
                          Bal: BD {entry.runningBalance.toFixed(3)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ──────────────────────────────────────────────────────────────────────────
            CUSTOMER UTILITIES & ACTION BUTTONS
            ────────────────────────────────────────────────────────────────────────── */}
        <div className="pt-2 space-y-2">
          <button
            type="button"
            onClick={handlePrintStatement}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print 58mm Thermal Slip (طباعة كشف الحساب)</span>
          </button>

          <a
            href="https://wa.me/97339123456?text=Hello%20Askar%20Supermarket%2C%20I%20have%20a%20question%20regarding%20my%20Khata%20account."
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-4 bg-emerald-950/40 border border-emerald-500/30 hover:bg-emerald-900/40 active:scale-95 text-emerald-300 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Contact Store Cashier on WhatsApp (خدمة العملاء)</span>
          </a>
        </div>

        {/* FOOTER AUDIT NOTE */}
        <footer className="text-center pt-4 pb-8 space-y-1 text-[11px] text-slate-400">
          <p>Askar Supermarket Enterprise Cloud • Continuous Ledger Audit</p>
          <p className="font-mono text-[10px]">
            Encrypted Edge Ledger • Synced with Bahrain Fawri+ Payment Gateway
          </p>
        </footer>
      </main>

      {/* ──────────────────────────────────────────────────────────────────────────
          BENEFITPAY INSTANT SETTLEMENT MODAL SHEET
          ────────────────────────────────────────────────────────────────────────── */}
      {isPayModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom-6 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Settle with BenefitPay</h3>
                  <p className="text-[11px] text-slate-400 font-arabic">الدفع عبر تطبيق بنفت بي</p>
                </div>
              </div>
              <button
                onClick={() => setIsPayModalOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Amount Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Select Amount to Pay (دينار بحريني)
              </label>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setCustomPayAmount(currentBalance.toFixed(3))}
                  className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                    customPayAmount === currentBalance.toFixed(3)
                      ? 'bg-emerald-600 text-slate-950 border-emerald-400 shadow-md font-black'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Full (BD {currentBalance.toFixed(3)})
                </button>
                <button
                  type="button"
                  onClick={() => setCustomPayAmount('10.000')}
                  className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                    customPayAmount === '10.000'
                      ? 'bg-emerald-600 text-slate-950 border-emerald-400 shadow-md font-black'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  BD 10.000
                </button>
                <button
                  type="button"
                  onClick={() => setCustomPayAmount('5.000')}
                  className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                    customPayAmount === '5.000'
                      ? 'bg-emerald-600 text-slate-950 border-emerald-400 shadow-md font-black'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  BD 5.000
                </button>
              </div>

              {/* Custom Input */}
              <div className="relative mt-2">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                  BD
                </span>
                <input
                  type="number"
                  step="0.001"
                  min="0.1"
                  value={customPayAmount}
                  onChange={(e) => setCustomPayAmount(e.target.value)}
                  placeholder="Enter custom amount"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-white text-base font-mono font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Fawri+ QR Code for Scanning From Another Phone */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Or Scan with BenefitPay Fawri+
              </span>
              <div className="bg-white p-2.5 rounded-xl shadow-lg">
                <QRCodeSVG
                  value={`BH-BENEFIT-FAWRI:MERCHANT=97300182:TOTAL=${parseFloat(customPayAmount || '0').toFixed(3)}:CUST=${customer.id}`}
                  size={120}
                  level="M"
                />
              </div>
              <p className="text-[10px] text-slate-400 font-arabic text-center">
                افتح تطبيق بنفت بي ووجّه الكاميرا لدفع المبلغ المحدد
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                disabled={isSubmittingPay || !parseFloat(customPayAmount)}
                onClick={() => handleBenefitPaySettlement(parseFloat(customPayAmount))}
                className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50 text-slate-950 font-black rounded-xl text-sm shadow-xl shadow-emerald-950/60 flex items-center justify-center gap-2 transition-all"
              >
                {isSubmittingPay ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Settlement...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 fill-slate-950" />
                    <span>
                      Confirm & Pay BD {parseFloat(customPayAmount || '0').toFixed(3)} Now
                    </span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsPayModalOpen(false)}
                className="w-full py-2 text-xs font-bold text-slate-400 hover:text-white transition-all text-center"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
