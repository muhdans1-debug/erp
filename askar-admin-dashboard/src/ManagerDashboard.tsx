import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import {
  LayoutDashboard, Users, TrendingUp, Package, ArrowLeft, Receipt, X, Clock,
  CheckCircle, ShoppingCart, RefreshCw, AlertCircle, Check, Truck, PackageCheck,
  Printer, Search, FileText, Activity, MessageCircle, ShieldAlert, ArrowUpDown,
  Layers, Eye, Scale, Send, CreditCard
} from 'lucide-react';
// --- LAZY-LOADED PAGES (never downloaded until the manager navigates to them) ---
const BarcodeGenerator = lazy(() => import('./BarcodeGenerator'));
const StockManagement = lazy(() => import('./StockManagement'));
const FinancialDashboard = lazy(() => import('./FinancialDashboard'));
const MasterReport = lazy(() => import('./MasterReport'));
const ProductManagement = lazy(() => import('./ProductManagement'));
const RegisterSpyWidget = lazy(() => import('./RegisterSpyWidget'));
const ProcurementLogistics = lazy(() => import('./ProcurementLogistics'));
const FinancialsVatReturn = lazy(() => import('./FinancialsVatReturn'));
const ScaleLabelStudio = lazy(() => import('./ScaleLabelStudio'));
const EmployeeShiftReconciliation = lazy(() => import('./EmployeeShiftReconciliation'));
const NfcManager = lazy(() => import('./NfcManager'));
// ---
import { TableSkeleton, KpiCardSkeleton } from './Skeleton';
import { useLaptopBridge } from './useLaptopBridge';
const printKhataStatement = () => window.print();

interface ManagerDashboardProps {
  apiBase?: string;
  onBackToPos?: () => void;
}

export default function ManagerDashboard({ apiBase: propApiBase, onBackToPos }: ManagerDashboardProps) {
  const { remoteDrawerKick, remoteClearCart, remoteLockRegister } = useLaptopBridge();
  const apiBase = propApiBase || (typeof window !== 'undefined'
    ? (localStorage.getItem('master_server_url') || `http://${window.location.hostname || 'localhost'}:3000`)
    : 'http://localhost:3000');
  const [activeTab, setActiveTab] = useState<'overview' | 'master' | 'pim' | 'pnl' | 'khata' | 'nfc' | 'orders' | 'stock' | 'barcodes' | 'spy' | 'vat' | 'whatsapp_po' | 'scale_labels' | 'shifts'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'master' || tabParam === 'ledger' || tabParam === 'command') return 'master';
      if (tabParam === 'pim' || tabParam === 'products' || tabParam === 'catalog') return 'pim';
      if (tabParam === 'pnl' || tabParam === 'financials') return 'pnl';
      if (tabParam === 'stock' || tabParam === 'logistics') return 'stock';
      if (tabParam === 'orders') return 'orders';
      if (tabParam === 'khata') return 'khata';
      if (tabParam === 'nfc' || tabParam === 'cards') return 'nfc';
      if (tabParam === 'barcodes') return 'barcodes';
      if (tabParam === 'spy') return 'spy';
      if (tabParam === 'vat') return 'vat';
      if (tabParam === 'whatsapp_po' || tabParam === 'distributors') return 'whatsapp_po';
      if (tabParam === 'scale_labels' || tabParam === 'scale') return 'scale_labels';
      if (tabParam === 'shifts' || tabParam === 'employees' || tabParam === 'reconciliation') return 'shifts';
    }
    return 'overview';
  });
  const [pendingDraftsCount, setPendingDraftsCount] = useState<number>(0);

  // Remote NFC Hardware Relay: Auto-detect physical NFC taps beamed from Sunmi terminal
  const [activeNfcCustomer, setActiveNfcCustomer] = useState<any | null>(null);
  const [unknownNfcTag, setUnknownNfcTag] = useState<string | null>(null);
  const lastProcessedTagTimestamp = useRef<number>(0);

  useEffect(() => {
    let unmounted = false;
    let ws: WebSocket | null = null;
    let pollInterval: any = null;

    const handleNfcScan = async (tagId: string, preloadedCustomer?: any) => {
      const cleanId = (tagId || '').trim().toUpperCase();
      if (!cleanId) return;

      console.log(`📱 [Manager NFC Receiver] Processing remote tag from Sunmi: ${cleanId}`);

      if (preloadedCustomer) {
        setActiveNfcCustomer(preloadedCustomer);
        setUnknownNfcTag(null);
        return;
      }

      try {
        const res = await fetch(`${apiBase}/api/customers/nfc/${encodeURIComponent(cleanId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.customer) {
            setActiveNfcCustomer(data.customer);
            setUnknownNfcTag(null);
            return;
          }
        }
      } catch (err) {
        console.warn('NFC customer lookup error:', err);
      }

      setUnknownNfcTag(cleanId);
      setActiveNfcCustomer(null);
    };

    // 1. WebSocket Bridge Connection (:3000/ws)
    const connectWs = () => {
      if (unmounted) return;
      try {
        ws = new WebSocket('ws://localhost:3000/ws');
        ws.onopen = () => {
          console.log('⚡ [Manager Dashboard] Remote NFC Relay WebSocket connected on :3000/ws');
        };
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'NFC_SCANNED' || data.type === 'UNKNOWN_NFC_SCANNED') {
              const tag = data.payload?.tag_id || data.payload?.id;
              if (tag) {
                lastProcessedTagTimestamp.current = Date.now();
                handleNfcScan(tag, data.payload?.customer);
              }
            }
          } catch { }
        };
        ws.onerror = () => ws?.close();
        ws.onclose = () => {
          if (!unmounted) setTimeout(connectWs, 3000);
        };
      } catch { }
    };

    connectWs();

    // 2. Dual-channel fallback: poll Fastify /api/nfc/latest only if WS is disconnected
    pollInterval = setInterval(async () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        return; // Active WebSocket push handles real-time scans; skip polling
      }
      try {
        const res = await fetch(`${apiBase}/api/nfc/latest`);
        if (res.ok) {
          const data = await res.json();
          if (data?.latest?.tag_id && data.latest.timestamp > lastProcessedTagTimestamp.current) {
            lastProcessedTagTimestamp.current = data.latest.timestamp;
            handleNfcScan(data.latest.tag_id, data.latest.customer);
          }
        }
      } catch { }
    }, 4000);

    return () => {
      unmounted = true;
      clearInterval(pollInterval);
      ws?.close();
    };
  }, [apiBase]);

  const fetchDraftsCount = () => {
    fetch(`${apiBase}/api/purchase-orders/drafts`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.drafts)) {
          setPendingDraftsCount(data.drafts.length);
        }
      })
      .catch(() => { });
  };

  useEffect(() => {
    fetchDraftsCount();
    const interval = setInterval(fetchDraftsCount, 15000);
    return () => clearInterval(interval);
  }, [apiBase]);

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#f8fafc',
        color: '#0f172a',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
      }}
      className="flex h-screen w-screen bg-slate-50 text-slate-900 overflow-hidden"
    >
      {/* Pinned Fixed Sidebar Navigation (288px) */}
      <div
        className="fixed left-0 top-0 h-screen w-[288px] bg-slate-900 text-white flex flex-col shadow-xl z-30"
      >
        <div style={{ padding: '24px 20px', borderBottom: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#10b981', margin: 0 }}>
            Askar Supermarket
          </h2>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0' }}>
            Back-Office Manager
          </p>
        </div>

        <nav style={{ flex: 1, padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('overview')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backgroundColor: activeTab === 'overview' ? '#059669' : 'transparent',
              color: activeTab === 'overview' ? '#ffffff' : '#cbd5e1',
            }}
          >
            <LayoutDashboard size={19} />
            <span>Overview & Analytics</span>
          </button>

          <button
            onClick={() => setActiveTab('master')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backgroundColor: activeTab === 'master' ? '#059669' : 'transparent',
              color: activeTab === 'master' ? '#ffffff' : '#cbd5e1',
            }}
          >
            <Activity size={19} />
            <span>Command Center (Master)</span>
          </button>

          <button
            onClick={() => setActiveTab('pim')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backgroundColor: activeTab === 'pim' ? '#059669' : 'transparent',
              color: activeTab === 'pim' ? '#ffffff' : '#cbd5e1',
            }}
          >
            <Layers size={19} />
            <span>Product Catalog (PIM)</span>
          </button>

          <button
            onClick={() => setActiveTab('pnl')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backgroundColor: activeTab === 'pnl' ? '#059669' : 'transparent',
              color: activeTab === 'pnl' ? '#ffffff' : '#cbd5e1',
            }}
          >
            <TrendingUp size={19} />
            <span>Profit & Loss (P&L)</span>
          </button>

          <button
            onClick={() => setActiveTab('khata')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backgroundColor: activeTab === 'khata' ? '#059669' : 'transparent',
              color: activeTab === 'khata' ? '#ffffff' : '#cbd5e1',
            }}
          >
            <Users size={19} />
            <span>Khata Ledgers</span>
          </button>

          <button
            onClick={() => setActiveTab('nfc')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backgroundColor: activeTab === 'nfc' ? '#059669' : 'transparent',
              color: activeTab === 'nfc' ? '#ffffff' : '#cbd5e1',
            }}
          >
            <CreditCard size={19} />
            <span>NFC Card Manager</span>
            <span style={{
              marginLeft: 'auto',
              fontSize: '10px',
              fontWeight: 'bold',
              padding: '2px 8px',
              borderRadius: '9999px',
              backgroundColor: activeTab === 'nfc' ? '#ffffff' : '#064e3b',
              color: activeTab === 'nfc' ? '#065f46' : '#6ee7b7'
            }}>
              Relay
            </span>
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backgroundColor: activeTab === 'orders' ? '#059669' : 'transparent',
              color: activeTab === 'orders' ? '#ffffff' : '#cbd5e1',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <ShoppingCart size={19} />
              <span>Purchase Orders</span>
            </div>
            {pendingDraftsCount > 0 && (
              <span
                style={{
                  backgroundColor: '#f59e0b',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                }}
              >
                {pendingDraftsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('stock')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backgroundColor: activeTab === 'stock' ? '#059669' : 'transparent',
              color: activeTab === 'stock' ? '#ffffff' : '#cbd5e1',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Truck size={19} />
              <span>Stock & Logistics</span>
            </div>
            {pendingDraftsCount > 0 && (
              <span
                style={{
                  backgroundColor: '#f59e0b',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                }}
              >
                {pendingDraftsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('barcodes')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backgroundColor: activeTab === 'barcodes' ? '#059669' : 'transparent',
              color: activeTab === 'barcodes' ? '#ffffff' : '#cbd5e1',
            }}
          >
            <Printer size={19} />
            <span>Barcode Labels</span>
          </button>

          {/* Additional Features: Register Spy */}
          <button
            onClick={() => setActiveTab('spy')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backgroundColor: activeTab === 'spy' ? '#059669' : 'transparent',
              color: activeTab === 'spy' ? '#ffffff' : '#cbd5e1',
            }}
          >
            <Eye size={19} />
            <span>Register Spy (Till)</span>
          </button>

          {/* Additional Features: Bahrain NBR 10% VAT Return */}
          <button
            onClick={() => setActiveTab('vat')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backgroundColor: activeTab === 'vat' ? '#059669' : 'transparent',
              color: activeTab === 'vat' ? '#ffffff' : '#cbd5e1',
            }}
          >
            <Receipt size={19} />
            <span>Bahrain NBR VAT Return</span>
          </button>

          {/* Additional Features: WhatsApp Distributor POs */}
          <button
            onClick={() => setActiveTab('whatsapp_po')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backgroundColor: activeTab === 'whatsapp_po' ? '#059669' : 'transparent',
              color: activeTab === 'whatsapp_po' ? '#ffffff' : '#cbd5e1',
            }}
          >
            <Send size={19} />
            <span>WhatsApp Distributor POs</span>
          </button>

          {/* Additional Features: Scale & Produce Labels */}
          <button
            onClick={() => setActiveTab('scale_labels')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backgroundColor: activeTab === 'scale_labels' ? '#059669' : 'transparent',
              color: activeTab === 'scale_labels' ? '#ffffff' : '#cbd5e1',
            }}
          >
            <Scale size={19} />
            <span>Scale & Produce Labels</span>
          </button>

          {/* Core Loss Prevention: Shifts & Cashier Blind Reconciliation */}
          <button
            onClick={() => setActiveTab('shifts')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backgroundColor: activeTab === 'shifts' ? '#059669' : 'transparent',
              color: activeTab === 'shifts' ? '#ffffff' : '#cbd5e1',
            }}
          >
            <Clock size={19} />
            <span>Shift & Cashier Audits</span>
          </button>
        </nav>

        {/* Back to POS Navigation */}
        {onBackToPos && (
          <div style={{ padding: '16px', borderTop: '1px solid #1e293b' }}>
            <button
              onClick={onBackToPos}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px 16px',
                borderRadius: '10px',
                backgroundColor: '#1e293b',
                color: '#e2e8f0',
                border: '1px solid #334155',
                fontWeight: 'bold',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <ArrowLeft size={16} />
              <span>Back to Register</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area with ml-[288px] and max-w-7xl containment */}
      <main className={`ml-[288px] flex-1 h-screen overflow-y-auto bg-slate-50 ${activeTab === 'barcodes' || activeTab === 'pim' ? 'p-0' : 'p-6 lg:p-8'}`}>
        <div className={activeTab === 'barcodes' || activeTab === 'pim' ? 'w-full' : 'max-w-7xl mx-auto w-full'}>
          {/* Sleek Toast when an NFC Card is tapped on Sunmi while on another tab */}
          {activeTab !== 'nfc' && (activeNfcCustomer || unknownNfcTag) && (
            <div className="mb-5 px-5 py-3.5 bg-slate-900 border-2 border-emerald-500 rounded-2xl shadow-xl flex items-center justify-between gap-4 text-white animate-in slide-in-from-top-3">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold">
                    {activeNfcCustomer
                      ? `⚡ Sunmi Tap: ${activeNfcCustomer.name} (Debt: ${(Number(activeNfcCustomer.balance || activeNfcCustomer.outstanding_balance || 0)).toFixed(3)} BHD)`
                      : `⚠️ Unregistered Card Tapped on Sunmi: ${unknownNfcTag}`
                    }
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setActiveTab('nfc');
                    setActiveNfcCustomer(null);
                    setUnknownNfcTag(null);
                  }}
                  className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer"
                >
                  <CreditCard size={14} />
                  <span>Open in NFC Manager</span>
                </button>
                <button
                  onClick={() => {
                    setActiveNfcCustomer(null);
                    setUnknownNfcTag(null);
                  }}
                  className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'overview' && <FinancialOverview apiBase={apiBase} />}
          <Suspense fallback={<div className="flex items-center justify-center h-64 text-slate-500 font-bold text-sm">Loading...</div>}>
            {activeTab === 'master' && <MasterReport apiBase={apiBase} />}
            {activeTab === 'pim' && <ProductManagement apiBase={apiBase} />}
            {activeTab === 'pnl' && <FinancialDashboard apiBase={apiBase} />}
            {activeTab === 'khata' && <KhataLedger apiBase={apiBase} />}
            {activeTab === 'nfc' && (
              <NfcManager
                apiBase={apiBase}
                onNavigateToKhata={() => setActiveTab('khata')}
                onOpenCustomerStatement={() => setActiveTab('khata')}
              />
            )}
            {activeTab === 'orders' && <PendingOrders apiBase={apiBase} onOrdersUpdated={fetchDraftsCount} />}
            {activeTab === 'stock' && <StockManagement apiBase={apiBase} />}
            {activeTab === 'barcodes' && <BarcodeGenerator apiBase={apiBase} />}
            {activeTab === 'spy' && (
              <RegisterSpyWidget
                onDrawerKick={remoteDrawerKick}
                onClearCart={remoteClearCart}
                onLockRegister={remoteLockRegister}
              />
            )}
            {activeTab === 'vat' && <FinancialsVatReturn apiBase={apiBase} />}
            {activeTab === 'whatsapp_po' && <ProcurementLogistics apiBase={apiBase} />}
            {activeTab === 'scale_labels' && <ScaleLabelStudio />}
            {activeTab === 'shifts' && <EmployeeShiftReconciliation apiBase={apiBase} />}
          </Suspense>
        </div>
      </main>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function FinancialOverview({ apiBase }: { apiBase: string }) {
  const [period, setPeriod] = useState<'day' | 'month' | 'year'>('day');
  const [metrics, setMetrics] = useState({
    revenue: '0.000',
    cogs: '0.000',
    netProfit: '0.000',
    profitMargin: '0%',
  });
  const [chartData, setChartData] = useState<any[]>([
    { name: 'Week 1', profit: 120.500 },
    { name: 'Week 2', profit: 210.250 },
    { name: 'Week 3', profit: 180.000 },
    { name: 'Week 4', profit: 240.750 },
  ]);

  const [sales, setSales] = useState<any[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(860);
  const [loading, setLoading] = useState(true);

  const fetchSales = async () => {
    setLoadingSales(true);
    try {
      // Laptop Network Fetch: Loads sales from Fastify master server over HTTP
      const response = await fetch(`${apiBase}/api/reports/sales`, {
        headers: { 'x-manager-pin': '9999' }
      });
      const data = await response.json();
      if (Array.isArray(data)) {
        setSales(data);
      }
    } catch (err) {
      console.warn('Sales report fetch notice:', err);
    } finally {
      setLoadingSales(false);
    }
  };

  useEffect(() => {
    fetchSales();
    const interval = setInterval(fetchSales, 5000);

    const host = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(`ws://${host}:3000/ws`);
      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.type === 'SALE_COMPLETED' || d.type === 'SHIFT_CLOSED') {
            fetchSales();
          }
        } catch { }
      };
    } catch { }

    return () => {
      clearInterval(interval);
      ws?.close();
    };
  }, [apiBase]);

  useEffect(() => {
    const measure = () => {
      if (chartContainerRef.current && chartContainerRef.current.clientWidth > 0) {
        setChartWidth(chartContainerRef.current.clientWidth);
      }
    };
    measure();
    const t = setTimeout(measure, 150);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    const loadFinancials = () => {
      fetch(`${apiBase}/api/reports/financials?period=${period}`, {
        headers: { 'x-manager-pin': '9999' }
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          return res.json();
        })
        .then((data) => {
          if (data.metrics) {
            setMetrics(data.metrics);
          }
          if (Array.isArray(data.chartData) && data.chartData.length > 0) {
            setChartData(data.chartData);
          }
        })
        .catch((err) => console.warn('Financials report notice:', err))
        .finally(() => setLoading(false));
    };

    setLoading(true);
    loadFinancials();
    const interval = setInterval(loadFinancials, 5000);
    return () => clearInterval(interval);
  }, [period, apiBase]);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
            Financial Reports
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0 0' }}>
            Live revenue, COGS, and profit margin analytics
          </p>
        </div>

        {/* Period Selector Tabs */}
        <div
          style={{
            display: 'flex',
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            padding: '4px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            gap: '4px',
          }}
        >
          {(['day', 'month', 'year'] as const).map((p) => {
            const isActive = period === p;
            return (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontWeight: isActive ? 'bold' : '500',
                  fontSize: '13px',
                  textTransform: 'capitalize',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: isActive ? '#ecfdf5' : 'transparent',
                  color: isActive ? '#065f46' : '#64748b',
                  transition: 'all 0.15s ease',
                }}
              >
                {p === 'day' ? 'Today' : `This ${p}`}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Cards Grid - F-Pattern: Most critical metric (Net Profit) at top-left */}
      {loading ? (
        <KpiCardSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          <KpiCard
            title="Net Profit"
            value={`BD ${metrics.netProfit}`}
            icon={<TrendingUp size={24} className="text-emerald-600" />}
            iconBg="#ecfdf5"
            highlight="emerald"
          />
          <KpiCard
            title="Total Revenue"
            value={`BD ${metrics.revenue}`}
            icon={<TrendingUp size={24} className="text-blue-600" />}
            iconBg="#eff6ff"
          />
          <KpiCard
            title="COGS (Cost of Goods)"
            value={`BD ${metrics.cogs}`}
            icon={<Package size={24} className="text-amber-600" />}
            iconBg="#fffbeb"
          />
          <KpiCard
            title="Profit Margin"
            value={metrics.profitMargin}
            icon={<LayoutDashboard size={24} className="text-purple-600" />}
            iconBg="#f5f3ff"
          />
        </div>
      )}

      {/* Recharts Profit Trend Container */}
      <div
        style={{
          backgroundColor: '#ffffff',
          padding: '24px',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '17px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>
            Profit Trend
          </h3>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {period === 'day' ? 'Hourly Performance' : period === 'month' ? 'Weekly Performance' : 'Monthly Performance'}
          </span>
        </div>

        <div ref={chartContainerRef} style={{ width: '100%', height: '320px' }}>
          <BarChart width={chartWidth} height={320} data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} stroke="#64748b" fontSize={12} />
            <YAxis
              axisLine={false}
              tickLine={false}
              stroke="#64748b"
              fontSize={12}
              tickFormatter={(val) => `BD ${val}`}
            />
            <Tooltip
              cursor={{ fill: '#f8fafc' }}
              formatter={(value: any) => [`BD ${Number(value).toFixed(3)}`, 'Net Profit']}
              contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}
            />
            <Bar dataKey="profit" fill="#10B981" radius={[6, 6, 0, 0]} maxBarSize={60} />
          </BarChart>
        </div>
      </div>

      {/* Live Sales Activity Table (From Fastify /api/reports/sales) */}
      <div className="mt-8 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Recent Register Sales</h3>
            <p className="text-xs text-slate-500 mt-0.5">Live transactions synchronized from Sunmi POS terminals via Fastify API</p>
          </div>
          <button
            onClick={fetchSales}
            disabled={loadingSales}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            <RefreshCw size={14} className={loadingSales ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Payment Method</th>
                <th className="py-3 px-4 text-right">Total Amount</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Date / Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingSales && sales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">Loading sales from server...</td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">No sales recorded yet.</td>
                </tr>
              ) : (
                sales.slice(0, 20).map((sale) => (
                  <tr key={sale.id || sale.invoice_number} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      #{sale.invoice_number || sale.invoiceNo || sale.id}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700">
                      {sale.customerName || sale.customer_name || 'Walk-in Cash Customer'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">
                        {sale.payment_type || sale.paymentType || 'CASH'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                      BD {Number(sale.total || sale.grandTotal || 0).toFixed(3)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                        {sale.status || 'COMPLETED'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-xs text-slate-500 font-mono">
                      {sale.created_at || sale.createdAt ? new Date(sale.created_at || sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Just now'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KhataLedger({ apiBase = 'http://localhost:3000' }: { apiBase?: string }) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [search, setSearch] = useState('');
  const [sortParam, setSortParam] = useState<'highest' | 'lowest' | 'alpha' | 'stale' | 'overlimit'>('highest');
  const [onlyDebtors, setOnlyDebtors] = useState(false);
  const [statementCustomer, setStatementCustomer] = useState<any | null>(null);
  const [statementSales, setStatementSales] = useState<any[]>([]);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Client-side date range filtering for dispute resolution & targeted monthly thermal printing
  const filteredStatement = useMemo(() => {
    if (!statementSales) return [];

    return statementSales.filter((tx) => {
      if (!startDate && !endDate) return true;

      const dateStr = tx.created_at || tx.timestamp || tx.createdAt;
      const txDate = new Date(dateStr);
      const start = startDate ? new Date(startDate) : new Date('2000-01-01');
      const end = endDate ? new Date(endDate) : new Date('2100-01-01');

      if (endDate) end.setHours(23, 59, 59, 999);

      return txDate >= start && txDate <= end;
    });
  }, [statementSales, startDate, endDate]);

  // Customer Settle Modal State (Receive Payment)
  const [settleCustomer, setSettleCustomer] = useState<any | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMethod, setSettleMethod] = useState<'CASH' | 'BENEFIT_PAY'>('CASH');
  const [isSettling, setIsSettling] = useState(false);

  // Stale Bad Debt Write-Off Modal State
  const [writeOffCustomer, setWriteOffCustomer] = useState<any | null>(null);
  const [writeOffReason, setWriteOffReason] = useState('Uncollectible stale balance > 45 days');
  const [writeOffPin, setWriteOffPin] = useState('');
  const [isWritingOff, setIsWritingOff] = useState(false);
  const [writeOffToast, setWriteOffToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);

  const handleExecuteSettle = async () => {
    if (!settleCustomer) return;
    const amt = parseFloat(settleAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid payment amount.');
      return;
    }

    setIsSettling(true);
    try {
      const res = await fetch(`${apiBase}/api/customers/${settleCustomer.id}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amt,
          paymentMethod: settleMethod,
          reference: `${settleMethod === 'BENEFIT_PAY' ? 'BenefitPay' : 'Cash'} Payment (Back-Office)`
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWriteOffToast({
          type: 'success',
          message: `✅ Received BD ${amt.toFixed(3)} for ${settleCustomer.name}! New Balance: BD ${Number(data.newBalance ?? 0).toFixed(3)}`
        });
        setTimeout(() => setWriteOffToast(null), 5000);
        setSettleCustomer(null);
        setSettleAmount('');
        loadCustomers();
      } else {
        alert(data.error || 'Failed to record payment');
      }
    } catch (e: any) {
      alert(`Network error: ${e.message}`);
    } finally {
      setIsSettling(false);
    }
  };

  const loadCustomers = () => {
    setLoadingCustomers(true);
    const query = new URLSearchParams({
      sort: sortParam,
      ...(onlyDebtors ? { onlyDebtors: 'true' } : {}),
    });

    fetch(`${apiBase}/khata/ledger?${query.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.customers)) {
          setCustomers(data.customers);
        } else if (Array.isArray(data)) {
          setCustomers(data);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingCustomers(false));
  };

  useEffect(() => {
    loadCustomers();
  }, [apiBase, sortParam, onlyDebtors]);

  // Calculate store-wide Khata metrics
  const totalOutstanding = customers.reduce(
    (sum, c) => sum + (Number(c.currentBalance || 0) > 0 ? Number(c.currentBalance || 0) : 0),
    0
  );
  const totalDebtors = customers.filter((c) => Number(c.currentBalance || 0) > 0).length;
  const staleCustomers = customers.filter((c) => c.isStale);
  const staleDebtTotal = staleCustomers.reduce((sum, c) => sum + (Number(c.currentBalance || 0) > 0 ? Number(c.currentBalance || 0) : 0), 0);
  const overLimitCustomers = customers.filter((c) => c.isOverLimit);

  const filtered = customers.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.cpr && c.cpr.toLowerCase().includes(q)) ||
      (c.batchNo && c.batchNo.toLowerCase().includes(q)) ||
      (c.cardUid && c.cardUid.toLowerCase().includes(q))
    );
  });

  const exportToExcel = () => {
    if (customers.length === 0) {
      alert('No customer data to export.');
      return;
    }
    const headers = ['Customer Name', 'Phone / Contact', 'CPR Number', 'Batch / Group No', 'NFC Card UID', 'Outstanding Balance (BD)', 'Credit Limit (BD)', 'Aging Risk', 'Days Overdue', 'Notes'];
    const rows = customers.map((c) => [
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      `"${(c.cpr || '').replace(/"/g, '""')}"`,
      `"${(c.batchNo || '').replace(/"/g, '""')}"`,
      `"${(c.cardUid || 'Unlinked').replace(/"/g, '""')}"`,
      Number(c.currentBalance || 0).toFixed(3),
      Number(c.creditLimit || 30).toFixed(3),
      c.agingRisk || 'HEALTHY',
      c.daysSinceLastPayment ?? 0,
      `"${(c.description || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Khata_Credit_Parties_${sortParam}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const viewStatement = async (customer: any) => {
    setStatementCustomer(customer);
    setLoadingStatement(true);
    try {
      const res = await fetch(`${apiBase}/khata/${customer.id}/statement`);
      const data = await res.json();
      setStatementSales(data.statement || data.sales || []);
    } catch (e) {
      console.error(e);
      setStatementSales([]);
    } finally {
      setLoadingStatement(false);
    }
  };

  const handleExecuteWriteOff = async () => {
    if (!writeOffCustomer) return;
    if (writeOffPin !== '9999') {
      alert('Unauthorized: Invalid Manager PIN. Please enter PIN 9999.');
      return;
    }

    setIsWritingOff(true);
    try {
      const res = await fetch(`${apiBase}/api/khata/write-off`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: writeOffCustomer.id,
          reason: writeOffReason,
          managerPin: writeOffPin,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setWriteOffToast({
          type: 'success',
          message: `Successfully written off BD ${writeOffCustomer.currentBalance.toFixed(3)} for ${writeOffCustomer.name}. Recorded in general ledger.`
        });
        setTimeout(() => setWriteOffToast(null), 5000);
        setWriteOffCustomer(null);
        setWriteOffPin('');
        loadCustomers();
      } else {
        alert(data.error || 'Write-off failed');
      }
    } catch (e: any) {
      alert(`Network error: ${e.message}`);
    } finally {
      setIsWritingOff(false);
    }
  };

  const formatPhoneForWhatsApp = (rawPhone?: string | null) => {
    if (!rawPhone) return '';
    const digits = String(rawPhone).replace(/[^0-9]/g, '');
    if (digits.length === 8) return `973${digits}`; // Bahrain 8-digit mobile
    return digits;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto">

      {/* Toast Notification */}
      {writeOffToast && (
        <div className={`p-4 rounded-xl text-sm font-bold border flex items-center justify-between shadow-md animate-in fade-in ${writeOffToast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-red-50 text-red-800 border-red-300'
          }`}>
          <span>{writeOffToast.message}</span>
          <button onClick={() => setWriteOffToast(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Credit Parties (Khata Ledger)</h1>
            <span className="text-xs font-bold px-2.5 py-0.5 bg-slate-900 text-white rounded-full">
              Cash Recovery Engine
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Live debt exposure, trapped cash flow ranking, aging analysis, and 1-click WhatsApp debt reminders.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowBroadcastModal(true)}
            disabled={totalDebtors === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 cursor-pointer shadow-xs active:scale-95 transition-all text-sm disabled:opacity-50"
            title="Open Morning Cash Recovery Center to message all debtors via WhatsApp"
          >
            <MessageCircle size={16} /> Broadcast Reminders ({totalDebtors})
          </button>
          <button
            onClick={loadCustomers}
            className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl font-bold flex items-center gap-2 cursor-pointer shadow-xs transition-all text-sm"
          >
            <RefreshCw size={15} /> Refresh
          </button>
          <button
            onClick={exportToExcel}
            className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2 rounded-xl font-bold flex items-center gap-2 cursor-pointer shadow-xs active:scale-95 transition-all text-sm"
          >
            <FileText size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Top 4 KPI Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Outstanding */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs flex items-center justify-between border-l-4 border-l-red-500">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Market Credit</p>
            <p className="text-2xl font-black text-red-600 font-mono tabular-nums">
              BD {totalOutstanding.toFixed(3)}
            </p>
            <p className="text-[11px] text-slate-400 font-medium">Trapped operational liquidity</p>
          </div>
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center shrink-0">
            <AlertCircle size={24} />
          </div>
        </div>

        {/* Active Debtors */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs flex items-center justify-between border-l-4 border-l-blue-500">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Debtors</p>
            <p className="text-2xl font-black text-slate-900 font-mono tabular-nums">
              {totalDebtors} <span className="text-sm font-bold text-slate-500">Parties</span>
            </p>
            <p className="text-[11px] text-slate-400 font-medium">Out of {customers.length} total accounts</p>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
            <Users size={24} />
          </div>
        </div>

        {/* Stale Debt / Red Zone (>45 Days) */}
        <div className={`p-6 rounded-2xl border shadow-xs flex items-center justify-between border-l-4 ${staleCustomers.length > 0 ? 'bg-rose-50/30 border-rose-200 border-l-rose-600' : 'bg-white border-slate-200/90 border-l-slate-400'
          }`}>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-rose-700">Stale Debt (Red Zone)</span>
              {staleCustomers.length > 0 && (
                <span className="text-[10px] font-black bg-rose-600 text-white px-1.5 py-0.2 rounded animate-pulse">
                  &gt;45d
                </span>
              )}
            </div>
            <p className="text-2xl font-black text-rose-600 font-mono tabular-nums">
              BD {staleDebtTotal.toFixed(3)}
            </p>
            <p className="text-[11px] text-rose-700 font-bold">{staleCustomers.length} Parties Abandoned Tab</p>
          </div>
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center shrink-0">
            <ShieldAlert size={24} />
          </div>
        </div>

        {/* Over Limit Accounts */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs flex items-center justify-between border-l-4 border-l-amber-500">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Over Credit Limit</p>
            <p className="text-2xl font-black text-amber-600 font-mono tabular-nums">
              {overLimitCustomers.length} <span className="text-sm font-bold text-slate-500">Parties</span>
            </p>
            <p className="text-[11px] text-slate-400 font-medium">Default Limit: BD 30.000</p>
          </div>
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
            <TrendingUp size={24} />
          </div>
        </div>
      </div>

      {/* Data Table with Sorting & Filter Bar */}
      {loadingCustomers ? (
        <TableSkeleton rows={6} columns={6} />
      ) : (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200/90 overflow-hidden">

          {/* Controls Bar: Search + Sorting Dropdown + Filter Pills */}
          <div className="p-4 border-b bg-slate-50/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">

            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                type="text"
                placeholder="Search by name, phone, CPR, batch, or card UID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none bg-white text-sm font-medium"
              />
            </div>

            {/* Sorting Dropdown & Debtor Filter */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <ArrowUpDown size={13} /> Sort By:
                </span>
                <select
                  value={sortParam}
                  onChange={(e: any) => setSortParam(e.target.value)}
                  className="bg-white border-2 border-slate-300 rounded-xl px-3 py-1.5 text-xs sm:text-sm font-bold text-slate-800 outline-none focus:border-blue-500 shadow-2xs cursor-pointer"
                >
                  <option value="highest">Highest Debt First (Trapped Cash)</option>
                  <option value="stale">🚨 Stale Debt / Red Zone (&gt;45d)</option>
                  <option value="overlimit">⚠️ Over Credit Limit First</option>
                  <option value="lowest">Lowest Balance First</option>
                  <option value="alpha">Alphabetical (A-Z)</option>
                </select>
              </div>

              {/* Only Debtors Toggle */}
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 px-3 py-1.5 rounded-xl cursor-pointer hover:bg-slate-50 select-none shadow-2xs">
                <input
                  type="checkbox"
                  checked={onlyDebtors}
                  onChange={(e) => setOnlyDebtors(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Only Active Debts (&gt;BD 0)</span>
              </label>

              <span className="text-xs text-slate-400 font-bold font-mono">
                {filtered.length} Parties
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50/90 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5 font-bold text-slate-600 text-xs uppercase tracking-wider">Customer Name</th>
                  <th className="px-5 py-3.5 font-bold text-slate-600 text-xs uppercase tracking-wider">Contact & CPR</th>
                  <th className="px-5 py-3.5 font-bold text-slate-600 text-xs uppercase tracking-wider">NFC Card ID</th>
                  <th className="px-5 py-3.5 font-bold text-slate-600 text-xs uppercase tracking-wider text-right">Outstanding Debt</th>
                  <th className="px-5 py-3.5 font-bold text-slate-600 text-xs uppercase tracking-wider text-center">Aging & Risk</th>
                  <th className="px-5 py-3.5 font-bold text-slate-600 text-xs uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((customer) => {
                  const balance = Number(customer.currentBalance || 0);
                  const limit = Number(customer.creditLimit || 30.0);
                  const isStale = customer.isStale || (balance > 0 && customer.daysSinceLastPayment > 45);
                  const isOver = customer.isOverLimit || balance > limit;
                  const phoneDigits = formatPhoneForWhatsApp(customer.phone);

                  return (
                    <tr
                      key={customer.id}
                      className={`transition-colors ${isStale ? 'bg-rose-50/40 hover:bg-rose-50/70' : 'even:bg-slate-50/50 hover:bg-blue-50/60'
                        }`}
                    >
                      {/* Name & Batch (Click to View Statement) */}
                      <td
                        className="px-5 py-3.5 cursor-pointer group"
                        onClick={() => viewStatement(customer)}
                        title="Click to view full Khata statement ledger"
                      >
                        <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors flex items-center gap-2">
                          <span className="underline decoration-slate-300 group-hover:decoration-blue-500 underline-offset-4">{customer.name}</span>
                          {customer.batchNo && (
                            <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded uppercase tracking-wider font-extrabold no-underline">
                              {customer.batchNo}
                            </span>
                          )}
                        </div>
                        {customer.description && (
                          <div className="text-xs text-slate-400 truncate max-w-xs mt-0.5" title={customer.description}>
                            {customer.description}
                          </div>
                        )}
                      </td>

                      {/* Phone & CPR */}
                      <td className="px-5 py-3.5 text-slate-600">
                        <div className="text-sm font-medium">{customer.phone || <span className="text-slate-300">No phone</span>}</div>
                        {customer.cpr && (
                          <div className="text-xs text-slate-400 font-mono mt-0.5">CPR: {customer.cpr}</div>
                        )}
                      </td>

                      {/* NFC Card UID */}
                      <td className="px-5 py-3.5 font-mono text-xs">
                        {customer.cardUid ? (
                          <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md font-bold border border-blue-200 whitespace-nowrap">
                            💳 {customer.cardUid}
                          </span>
                        ) : (
                          <span className="text-slate-300 italic">Unlinked</span>
                        )}
                      </td>

                      {/* Balance & Credit Limit */}
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className={`font-black text-lg ${balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          BD {balance.toFixed(3)}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 font-sans font-medium">
                          Limit: <span className="font-mono">BD {limit.toFixed(3)}</span>
                          {isOver && (
                            <span className="ml-1 text-[10px] font-black bg-amber-100 text-amber-800 px-1 rounded">
                              EXCEEDED
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Idea 6: Automated Credit Score & Trust Tiering */}
                      <td className="px-5 py-3.5 text-center whitespace-nowrap">
                        {balance <= 0 ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                            🟢 Cleared (Zero Debt)
                          </span>
                        ) : isStale ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1 shadow-2xs">
                              🚨 RED ZONE ({customer.daysSinceLastPayment ?? 46}d)
                            </span>
                            <span className="text-[10px] text-rose-600 font-bold mt-0.5">Stale Tab (&gt;45d)</span>
                          </div>
                        ) : isOver ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="px-2.5 py-1 rounded-full text-xs font-black bg-purple-100 text-purple-800 border border-purple-300 flex items-center gap-1">
                              ⛔ OVER LIMIT
                            </span>
                            <span className="text-[10px] text-purple-600 font-bold mt-0.5">POS Blocked</span>
                          </div>
                        ) : (customer.daysSinceLastPayment ?? 0) <= 14 && balance <= limit * 0.5 ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            ⭐ VIP / Low Risk ({customer.daysSinceLastPayment ?? 0}d)
                          </span>
                        ) : balance <= limit * 0.8 && (customer.daysSinceLastPayment ?? 0) <= 30 ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            ✓ Good Standing ({customer.daysSinceLastPayment ?? 0}d)
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            ⚠️ Caution / Aging ({customer.daysSinceLastPayment ?? 0}d)
                          </span>
                        )}
                      </td>

                      {/* Action Hub: 1-Click WhatsApp + Statement + Bad Debt Write-Off */}
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">

                          {/* Idea 1: 1-Click WhatsApp Reminder */}
                          {balance > 0 && phoneDigits ? (
                            <a
                              href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(
                                `Hello ${customer.name}, your current Khata credit balance at Askar Supermarket is BHD ${balance.toFixed(3)}. Please arrange a payment soon. Thank you!`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 font-bold text-xs shadow-xs transition-transform active:scale-95 cursor-pointer"
                              title="Open WhatsApp chat with prefilled debt reminder"
                            >
                              <MessageCircle size={14} className="fill-white/20" /> WhatsApp
                            </a>
                          ) : null}

                          {/* Receive Payment / Settle Button */}
                          {balance > 0 && (
                            <button
                              onClick={() => {
                                setSettleCustomer(customer);
                                setSettleAmount(balance.toFixed(3));
                                setSettleMethod('CASH');
                              }}
                              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer active:scale-95 shadow-2xs flex items-center gap-1"
                              title="Receive Payment / Settle Khata Balance"
                            >
                              <span>💳 Settle</span>
                            </button>
                          )}

                          {/* View Statement Button */}
                          <button
                            onClick={() => viewStatement(customer)}
                            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer active:scale-95 shadow-2xs"
                          >
                            Statement
                          </button>

                          {/* Stale Debt Write-Off Action */}
                          {isStale && balance > 0 && (
                            <button
                              onClick={() => {
                                setWriteOffCustomer(customer);
                                setWriteOffPin('');
                                setWriteOffReason(`Uncollectible debt > ${customer.daysSinceLastPayment || 45} days overdue`);
                              }}
                              className="text-xs bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 px-2.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer active:scale-95 shadow-2xs"
                              title="Write off uncollectible debt to expense ledger"
                            >
                              Write-Off
                            </button>
                          )}

                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400 font-bold">
                      No credit customers found{search ? ` matching "${search}"` : ''}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bad Debt Write-Off Confirmation Dialog */}
      {writeOffCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-rose-200">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2 text-rose-600">
                <ShieldAlert size={24} />
                <h3 className="text-lg font-bold text-slate-900">Write-Off Bad Debt</h3>
              </div>
              <button onClick={() => setWriteOffCustomer(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Writing off balances closes the customer's outstanding Khata balance and records an audit-compliant <strong>Business Bad Debt Expense</strong> for P&L tax offset.
            </p>

            <div className="bg-rose-50 p-3.5 rounded-xl border border-rose-200 text-sm">
              <div className="flex justify-between font-bold text-slate-800">
                <span>Customer:</span>
                <span>{writeOffCustomer.name}</span>
              </div>
              <div className="flex justify-between font-bold text-rose-700 mt-1">
                <span>Write-Off Amount:</span>
                <span className="font-mono text-base">BD {writeOffCustomer.currentBalance.toFixed(3)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>Days Overdue:</span>
                <span>{writeOffCustomer.daysSinceLastPayment ?? 46} Days</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Reason / Reference</label>
              <input
                type="text"
                value={writeOffReason}
                onChange={(e) => setWriteOffReason(e.target.value)}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg outline-none font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Enter Manager PIN (9999) *</label>
              <input
                type="password"
                maxLength={4}
                value={writeOffPin}
                onChange={(e) => setWriteOffPin(e.target.value)}
                placeholder="••••"
                className="w-full text-center text-xl tracking-widest font-mono p-2.5 bg-white border-2 border-slate-300 rounded-lg outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWriteOffCustomer(null)}
                className="flex-1 py-2.5 border border-slate-300 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteWriteOff}
                disabled={isWritingOff || writeOffPin.length < 4}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs disabled:opacity-50 shadow-sm"
              >
                {isWritingOff ? 'Recording...' : 'Confirm Write-Off'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settle Customer Khata Balance Modal */}
      {settleCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <span>Receive Khata Payment</span>
              </h3>
              <button
                onClick={() => setSettleCustomer(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
              <div className="font-bold text-slate-900 text-base">{settleCustomer.name}</div>
              <div className="text-xs text-slate-500 font-mono mt-0.5">{settleCustomer.phone || 'No phone'}</div>
              <div className="mt-2 flex justify-between items-center border-t border-slate-200 pt-2">
                <span className="text-xs text-slate-500 font-bold uppercase">Current Outstanding:</span>
                <span className="text-lg font-black text-red-600 font-mono">
                  BD {Number(settleCustomer.currentBalance || 0).toFixed(3)}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Payment Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettleMethod('CASH')}
                    className={`py-2 px-3 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      settleMethod === 'CASH'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>💵 Cash</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettleMethod('BENEFIT_PAY')}
                    className={`py-2 px-3 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      settleMethod === 'BENEFIT_PAY'
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>📱 BenefitPay</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Amount Paying (BD)
                </label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setSettleAmount(Number(settleCustomer.currentBalance || 0).toFixed(3))}
                    className="px-2.5 py-1 bg-amber-100 text-amber-900 font-bold text-xs rounded-lg hover:bg-amber-200 cursor-pointer"
                  >
                    Full Balance
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettleAmount((Number(settleCustomer.currentBalance || 0) / 2).toFixed(3))}
                    className="px-2.5 py-1 bg-slate-100 text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-200 cursor-pointer"
                  >
                    50% Partial
                  </button>
                </div>
                <input
                  type="number"
                  step="0.001"
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  placeholder="0.000"
                  className="w-full text-2xl font-black font-mono p-3 bg-white border-2 border-slate-300 rounded-xl outline-none focus:border-emerald-500 transition-all"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSettleCustomer(null)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteSettle}
                  disabled={isSettling || !settleAmount || parseFloat(settleAmount) <= 0}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-all cursor-pointer disabled:opacity-50 shadow-sm flex items-center justify-center gap-1.5"
                >
                  {isSettling ? 'Recording...' : 'Confirm Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Statement Modal */}
      {statementCustomer && (
        <div
          onClick={() => setStatementCustomer(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#f8fafc',
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: '18px',
                    fontWeight: 'bold',
                    color: '#0f172a',
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Receipt size={20} color="#059669" />
                  <span>Khata Statement: {statementCustomer.name}</span>
                </h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0', display: 'flex', gap: '12px' }}>
                  <span>Card UID: <strong>{statementCustomer.cardUid || 'None'}</strong></span>
                  <span>•</span>
                  <span>
                    Current Debt:{' '}
                    <strong style={{ color: '#dc2626' }}>
                      BD {Number(statementCustomer.currentBalance || 0).toFixed(3)}
                    </strong>
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!statementCustomer) return;
                    const formattedStatement = filteredStatement.map((s: any) => ({
                      id: s.id,
                      amount: Number(s.amount ?? s.total ?? 0),
                      type: s.type || s.paymentType || 'CHARGE',
                      reference: s.reference || s.invoiceNo || 'Store Purchase',
                      formattedDate: s.formattedDate || new Date(s.created_at || s.timestamp || s.createdAt).toLocaleDateString(),
                      formattedTime: s.formattedTime || new Date(s.created_at || s.timestamp || s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      runningBalance: Number(s.running_balance ?? s.runningBalance ?? s.total ?? 0)
                    }));
                    await printKhataStatement({
                      customerName: statementCustomer.name,
                      customerPhone: statementCustomer.phone,
                      customerCpr: statementCustomer.cpr,
                      statement: formattedStatement,
                      currentBalance: statementCustomer.currentBalance
                    });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
                  title="Print official thermal statement slip on Sunmi printer"
                >
                  <Printer size={14} /> Print Statement Slip
                </button>
                <button
                  onClick={() => {
                    setStatementCustomer(null);
                    setStartDate('');
                    setEndDate('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: '6px',
                  }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body with Date Filter Control Bar & Data Table */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }} className="space-y-4">
              {/* Admin Control Bar */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-wrap justify-between items-center gap-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-800">Ledger History</h4>
                  <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                    {filteredStatement.length} Entries
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">FROM</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white font-medium"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">TO</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white font-medium"
                    />
                  </div>

                  {(startDate || endDate) && (
                    <button
                      type="button"
                      onClick={() => { setStartDate(''); setEndDate(''); }}
                      className="text-red-600 hover:text-red-800 text-xs font-bold px-1.5 py-1 cursor-pointer transition-colors"
                    >
                      Clear Filters
                    </button>
                  )}

                  {/* Pass the FILTERED statement to thermal printer function */}
                  <button
                    type="button"
                    onClick={async () => {
                      if (!statementCustomer) return;
                      const formattedStatement = filteredStatement.map((s: any) => ({
                        id: s.id,
                        amount: Number(s.amount ?? s.total ?? 0),
                        type: s.type || s.paymentType || 'CHARGE',
                        reference: s.reference || s.invoiceNo || 'Store Purchase',
                        formattedDate: s.formattedDate || new Date(s.created_at || s.timestamp || s.createdAt).toLocaleDateString(),
                        formattedTime: s.formattedTime || new Date(s.created_at || s.timestamp || s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        runningBalance: Number(s.running_balance ?? s.runningBalance ?? s.total ?? 0)
                      }));
                      await printKhataStatement({
                        customerName: statementCustomer.name,
                        customerPhone: statementCustomer.phone,
                        customerCpr: statementCustomer.cpr,
                        statement: formattedStatement,
                        currentBalance: statementCustomer.currentBalance
                      });
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                  >
                    <Printer size={13} />
                    <span>Print Filtered Statement</span>
                  </button>
                </div>
              </div>

              {loadingStatement ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: '#64748b' }}>
                  Loading customer transactions...
                </div>
              ) : (
                /* Admin Data Table */
                <div className="bg-white rounded-xl shadow-xs overflow-hidden border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Ref / Invoice</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Charge/Credit</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Running Balance</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {filteredStatement.map((tx: any) => {
                        const isPayment = tx.type === 'PAYMENT';
                        const isWriteOff = tx.type === 'WRITE_OFF';
                        const dateStr = tx.created_at || tx.timestamp || tx.createdAt;
                        const refText = tx.reference || (tx.type === 'CHARGE' ? (tx.invoiceNo || `INV-${String(tx.id).slice(0, 6)}`) : (isWriteOff ? 'Bad Debt Write-Off' : 'Cash Payment'));
                        const amtVal = Number(tx.amount ?? tx.total ?? 0);
                        const balVal = Number(tx.running_balance ?? tx.runningBalance ?? 0);

                        return (
                          <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 font-mono">
                              {dateStr ? new Date(dateStr).toLocaleString('en-GB') : '-'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-slate-900">
                              <span>{refText}</span>
                              {isWriteOff && (
                                <span className="ml-2 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold">
                                  WRITE-OFF
                                </span>
                              )}
                            </td>
                            <td className={`px-4 py-3 whitespace-nowrap text-xs font-bold text-right font-mono ${isPayment || isWriteOff ? 'text-green-600' : 'text-red-600'}`}>
                              {isPayment || isWriteOff ? '-' : '+'}{amtVal.toFixed(3)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-900 font-bold text-right font-mono">
                              {balVal.toFixed(3)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {filteredStatement.length === 0 && (
                    <div className="p-8 text-center text-slate-500 font-medium text-sm">
                      No records found for the selected date range.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Idea 7: Morning Cash Recovery Broadcast Center */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6 space-y-4 border border-emerald-300 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-start border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <MessageCircle size={26} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">
                    Morning Cash Recovery Hub
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Recover trapped cash flow by sending 1-click WhatsApp reminders to active debtors.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBroadcastModal(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Total Trapped Cash</span>
                <span className="text-2xl font-black font-mono text-emerald-800">BD {totalOutstanding.toFixed(3)}</span>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">Parties with Debt</span>
                <span className="text-2xl font-black font-mono text-blue-800">{totalDebtors} Parties</span>
              </div>
            </div>

            {/* Debtors List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 pr-1 space-y-1">
              {customers
                .filter((c) => Number(c.currentBalance || 0) > 0)
                .map((c) => {
                  const balance = Number(c.currentBalance || 0);
                  const phoneDigits = formatPhoneForWhatsApp(c.phone);
                  const reminderText = encodeURIComponent(
                    `Hello ${c.name}, this is a friendly reminder from Askar Supermarket regarding your Khata credit balance of BD ${balance.toFixed(3)}. You can settle in-store or via BenefitPay. Thank you!`
                  );
                  return (
                    <div key={c.id} className="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded-xl transition-colors">
                      <div className="min-w-0 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{c.name}</span>
                          {c.isStale && (
                            <span className="text-[9px] font-black bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">
                              STALE ({c.daysSinceLastPayment ?? 46}d)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                          {c.phone || 'No Phone'} • CPR: {c.cpr || 'N/A'}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono font-black text-sm text-slate-900">
                          BD {balance.toFixed(3)}
                        </span>
                        {phoneDigits ? (
                          <a
                            href={`https://wa.me/${phoneDigits}?text=${reminderText}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition-all"
                          >
                            <MessageCircle size={14} /> Send WhatsApp
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400 font-semibold italic">No Phone</span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="pt-2 border-t flex justify-between items-center text-xs text-slate-500">
              <span>💡 Messages open directly in WhatsApp with pre-filled debt details.</span>
              <button
                type="button"
                onClick={() => setShowBroadcastModal(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl"
              >
                Close Hub
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon,
  iconBg,
  highlight,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  iconBg: string;
  highlight?: 'emerald' | 'blue' | 'amber';
}) {
  return (
    <div className={`bg-white p-6 lg:p-8 rounded-2xl border transition-all duration-200 shadow-xs hover:shadow-sm flex items-center justify-between gap-4 ${highlight === 'emerald' ? 'border-emerald-200/80 bg-emerald-50/10' : 'border-slate-200/90'
      }`}>
      <div className="space-y-1.5 flex-1 min-w-0">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider truncate">
          {title}
        </h4>
        <p className={`text-2xl lg:text-3xl font-black font-mono tabular-nums truncate tracking-tight ${highlight === 'emerald' ? 'text-emerald-700' : 'text-slate-900'
          }`}>
          {value}
        </p>
      </div>
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs"
        style={{ backgroundColor: iconBg }}
      >
        {icon}
      </div>
    </div>
  );
}

// --- PENDING ORDERS / HUMAN-IN-THE-LOOP APPROVAL COMPONENT ---

function PendingOrders({
  apiBase,
  onOrdersUpdated,
}: {
  apiBase: string;
  onOrdersUpdated?: () => void;
}) {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [triggeringCheck, setTriggeringCheck] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [viewFilter, setViewFilter] = useState<'DRAFT' | 'ALL'>('DRAFT');

  const fetchOrders = () => {
    setLoading(true);
    const endpoint = viewFilter === 'DRAFT' ? `${apiBase}/api/purchase-orders/drafts` : `${apiBase}/api/purchase-orders`;
    fetch(endpoint)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setDrafts(data.drafts || data.orders || []);
        }
      })
      .catch((err) => {
        console.error('Failed to load purchase orders:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchOrders();
  }, [apiBase, viewFilter]);

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    setStatusMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/purchase-orders/${id}/approve`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: data.simulated
            ? 'Purchase Order approved! (Simulated mode: set EMAIL_USER & EMAIL_APP_PASS in .env for live Gmail delivery)'
            : 'Purchase Order successfully approved and emailed to supplier!',
        });
        // Remove or update the approved PO
        setDrafts((prev) => (viewFilter === 'DRAFT' ? prev.filter((po) => po.id !== id) : prev.map((po) => (po.id === id ? { ...po, status: 'SENT' } : po))));
        if (onOrdersUpdated) onOrdersUpdated();
      } else {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Failed to approve purchase order.',
        });
      }
    } catch (err: any) {
      console.error(err);
      setStatusMessage({
        type: 'error',
        text: 'Network error communicating with back-office server.',
      });
    } finally {
      setApprovingId(null);
    }
  };

  const handleTriggerReorderCheck = async () => {
    setTriggeringCheck(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/automation/trigger-reorder`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          type: 'success',
          text: data.count > 0 ? `Scanned inventory: Generated ${data.count} new draft Purchase Order(s).` : 'Inventory check complete: All stock levels are currently above minimum thresholds.',
        });
        fetchOrders();
        if (onOrdersUpdated) onOrdersUpdated();
      }
    } catch (err: any) {
      console.error(err);
      setStatusMessage({
        type: 'error',
        text: 'Failed to run automated inventory reorder scan.',
      });
    } finally {
      setTriggeringCheck(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Clock style={{ color: '#f59e0b' }} size={28} />
            Pending Approvals & Orders
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0 0' }}>
            Human-in-the-Loop review for nightly automated stock restocking
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Filter toggle */}
          <div style={{ display: 'flex', backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '3px' }}>
            <button
              onClick={() => setViewFilter('DRAFT')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: viewFilter === 'DRAFT' ? '#059669' : 'transparent',
                color: viewFilter === 'DRAFT' ? '#ffffff' : '#64748b',
              }}
            >
              Drafts Only
            </button>
            <button
              onClick={() => setViewFilter('ALL')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: viewFilter === 'ALL' ? '#059669' : 'transparent',
                color: viewFilter === 'ALL' ? '#ffffff' : '#64748b',
              }}
            >
              All Orders
            </button>
          </div>

          {/* Trigger Scan Button */}
          <button
            onClick={handleTriggerReorderCheck}
            disabled={triggeringCheck}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '10px',
              backgroundColor: '#1e293b',
              color: '#ffffff',
              border: 'none',
              fontWeight: 600,
              fontSize: '13px',
              cursor: triggeringCheck ? 'not-allowed' : 'pointer',
              opacity: triggeringCheck ? 0.7 : 1,
            }}
          >
            <RefreshCw size={15} className={triggeringCheck ? 'animate-spin' : ''} />
            <span>{triggeringCheck ? 'Scanning Inventory...' : 'Run Stock Check Now'}</span>
          </button>
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '10px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px',
            backgroundColor: statusMessage.type === 'success' ? '#ecfdf5' : '#fef2f2',
            color: statusMessage.type === 'success' ? '#065f46' : '#991b1b',
            border: `1px solid ${statusMessage.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
          }}
        >
          {statusMessage.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Content list */}
      {loading ? (
        <TableSkeleton rows={4} columns={4} />
      ) : drafts.length === 0 ? (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            padding: '60px 24px',
            textAlign: 'center',
          }}
        >
          <CheckCircle size={44} style={{ color: '#10b981', margin: '0 auto 16px auto' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 8px 0' }}>
            No Pending Approvals Needed
          </h3>
          <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '460px', margin: '0 auto 20px auto' }}>
            All inventory levels are currently above minimum threshold. The automation engine runs every night at 11:00 PM to prepare new orders if needed.
          </p>
          <button
            onClick={handleTriggerReorderCheck}
            disabled={triggeringCheck}
            style={{
              padding: '10px 20px',
              backgroundColor: '#059669',
              color: '#ffffff',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Run Immediate Stock Check
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: '20px' }}>
          {drafts.map((po) => {
            const items = typeof po.itemsJson === 'string' ? JSON.parse(po.itemsJson) : (po.itemsJson || []);
            const isApproved = po.status === 'SENT';

            return (
              <div
                key={po.id}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '16px',
                  border: isApproved ? '1px solid #e2e8f0' : '1px solid #cbd5e1',
                  padding: '24px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  {/* Top card header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
                          {po.supplierName}
                        </h3>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor: isApproved ? '#dcfce7' : '#fef3c7',
                            color: isApproved ? '#15803d' : '#b45309',
                          }}
                        >
                          {po.status}
                        </span>
                      </div>
                      <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>
                        {po.supplierEmail}
                      </p>
                      <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0 0' }}>
                        Created: {new Date(po.createdAt).toLocaleString()}
                      </p>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#059669' }}>
                        BD {Number(po.estimatedCost).toFixed(3)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                        {items.length} line item{items.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>

                  {/* Items list */}
                  <div
                    style={{
                      backgroundColor: '#f8fafc',
                      borderRadius: '12px',
                      padding: '12px 16px',
                      marginBottom: '20px',
                      maxHeight: '160px',
                      overflowY: 'auto',
                      border: '1px solid #f1f5f9',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, color: '#94a3b8', paddingBottom: '6px', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>
                      <span>Item & Order Qty</span>
                      <span>Line Total</span>
                    </div>
                    {items.map((item: any, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 0',
                          borderBottom: idx !== items.length - 1 ? '1px solid #edf2f7' : 'none',
                          fontSize: '13px',
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>{item.reorderQuantity}x</span>{' '}
                          <span style={{ color: '#334155' }}>{item.name}</span>
                          <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '6px' }}>
                            (Stock: {item.currentStock})
                          </span>
                        </div>
                        <span style={{ fontWeight: 600, color: '#475569' }}>
                          BD {(item.reorderQuantity * item.unitCost).toFixed(3)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Approve Button */}
                {isApproved ? (
                  <div
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '10px',
                      backgroundColor: '#f1f5f9',
                      color: '#475569',
                      fontWeight: 600,
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <Check size={16} style={{ color: '#10b981' }} />
                    <span>Order Approved & Sent</span>
                  </div>
                ) : (
                  <button
                    onClick={() => handleApprove(po.id)}
                    disabled={approvingId === po.id}
                    style={{
                      width: '100%',
                      backgroundColor: approvingId === po.id ? '#047857' : '#059669',
                      color: '#ffffff',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      padding: '14px',
                      borderRadius: '10px',
                      border: 'none',
                      cursor: approvingId === po.id ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 2px 8px rgba(5,150,105,0.2)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {approvingId === po.id ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        <span>Processing & Sending Email...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle size={18} />
                        <span>Approve & Send Email</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* In-Transit Deliveries Section (Awaiting Delivery Truck) */}
      <InTransitOrders apiBase={apiBase} onReceived={fetchOrders} />
    </div>
  );
}

// --- IN-TRANSIT DELIVERIES COMPONENT ---

function InTransitOrders({
  apiBase,
  onReceived,
}: {
  apiBase: string;
  onReceived?: () => void;
}) {
  const [transitOrders, setTransitOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchTransit = () => {
    setLoading(true);
    fetch(`${apiBase}/api/purchase-orders/transit`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setTransitOrders(data.orders || []);
        }
      })
      .catch((err) => {
        console.error('Failed to load transit orders:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTransit();
    const interval = setInterval(fetchTransit, 20000);
    return () => clearInterval(interval);
  }, [apiBase]);

  const handleReceive = async (id: string, supplierName: string) => {
    if (!window.confirm(`Confirm the delivery truck from "${supplierName}" has arrived and all items are accounted for?`)) {
      return;
    }

    setReceivingId(id);
    setFeedback(null);
    try {
      const res = await fetch(`${apiBase}/api/purchase-orders/${id}/receive`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.success) {
        setFeedback({
          type: 'success',
          text: `Delivery received! Stock quantities for "${supplierName}" have been injected into live inventory.`,
        });
        setTransitOrders((prev) => prev.filter((po) => po.id !== id));
        if (onReceived) onReceived();
      } else {
        setFeedback({
          type: 'error',
          text: data.error || 'Failed to receive delivery.',
        });
      }
    } catch (err) {
      console.error(err);
      setFeedback({
        type: 'error',
        text: 'Network error communicating with back-office server.',
      });
    } finally {
      setReceivingId(null);
    }
  };

  return (
    <div style={{ marginTop: '48px', borderTop: '2px solid #e2e8f0', paddingTop: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Truck style={{ color: '#2563eb' }} size={24} />
            In-Transit Deliveries
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>
            Orders approved and emailed to distributors awaiting delivery truck arrival at Askar Supermarket
          </p>
        </div>

        <button
          onClick={fetchTransit}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '8px',
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            color: '#475569',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Transit</span>
        </button>
      </div>

      {feedback && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '10px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px',
            backgroundColor: feedback.type === 'success' ? '#eff6ff' : '#fef2f2',
            color: feedback.type === 'success' ? '#1e40af' : '#991b1b',
            border: `1px solid ${feedback.type === 'success' ? '#bfdbfe' : '#fecaca'}`,
          }}
        >
          {feedback.type === 'success' ? <PackageCheck size={18} /> : <AlertCircle size={18} />}
          <span>{feedback.text}</span>
        </div>
      )}

      {loading && transitOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748b' }}>
          <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
          <p style={{ fontSize: '13px' }}>Checking in-transit shipments...</p>
        </div>
      ) : transitOrders.length === 0 ? (
        <div
          style={{
            backgroundColor: '#f8fafc',
            border: '1px dashed #cbd5e1',
            borderRadius: '12px',
            padding: '36px 20px',
            textAlign: 'center',
            color: '#64748b',
          }}
        >
          <Truck size={36} style={{ color: '#94a3b8', margin: '0 auto 10px auto' }} />
          <p style={{ margin: 0, fontWeight: 600, fontSize: '14px', color: '#475569' }}>
            No deliveries currently in transit
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
            When you approve a draft order above, it will appear here until the shipment arrives at store.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {transitOrders.map((po) => {
            const items = typeof po.itemsJson === 'string' ? JSON.parse(po.itemsJson) : (po.itemsJson || []);
            const isReceiving = receivingId === po.id;

            return (
              <div
                key={po.id}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #dbeafe',
                  borderRadius: '14px',
                  padding: '18px 24px',
                  boxShadow: '0 2px 8px rgba(37,99,235,0.04)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '16px',
                }}
              >
                <div style={{ flex: '1 1 240px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>
                      {po.supplierName}
                    </h3>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        backgroundColor: '#dbeafe',
                        color: '#1d4ed8',
                      }}
                    >
                      IN TRANSIT
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>
                    Ordered on {new Date(po.createdAt).toLocaleDateString()} at{' '}
                    {new Date(po.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0 0' }}>
                    Supplier Email: {po.supplierEmail}
                  </p>
                </div>

                <div style={{ flex: '1 1 200px', backgroundColor: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>
                    EXPECTED DELIVERIES ({items.length} item{items.length !== 1 ? 's' : ''}):
                  </div>
                  <div style={{ fontSize: '12px', color: '#334155', maxHeight: '48px', overflowY: 'auto' }}>
                    {items.map((it: any, idx: number) => (
                      <span key={idx} style={{ display: 'inline-block', marginRight: '10px' }}>
                        • <strong>+{it.reorderQuantity}</strong> {it.name}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ textAlign: 'right', minWidth: '120px' }}>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e40af' }}>
                    BD {Number(po.estimatedCost).toFixed(3)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Invoice Est.</div>
                </div>

                <button
                  onClick={() => handleReceive(po.id, po.supplierName)}
                  disabled={isReceiving}
                  style={{
                    backgroundColor: isReceiving ? '#1d4ed8' : '#2563eb',
                    color: '#ffffff',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    padding: '12px 20px',
                    borderRadius: '10px',
                    border: 'none',
                    cursor: isReceiving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {isReceiving ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Updating Stock...</span>
                    </>
                  ) : (
                    <>
                      <PackageCheck size={18} />
                      <span>Receive Delivery</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { KhataLedger as BackOfficeKhataList };
