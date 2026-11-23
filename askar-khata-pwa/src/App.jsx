import { Component, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazyWithRetry } from './utils/lazyWithRetry';

const CustomerTab = lazyWithRetry(() => import('./pages/CustomerTab'), 'CustomerTab');
const CustomerTabPreview = lazyWithRetry(() => import('./pages/CustomerTabPreview'), 'CustomerTabPreview');
const HomeLookup = lazyWithRetry(() => import('./pages/HomeLookup'), 'HomeLookup');
const KhataStatement = lazyWithRetry(() => import('./KhataStatement').then(m => ({ default: m.KhataStatement })), 'KhataStatement');
const DevPortal = lazyWithRetry(() => import('./pages/DevPortal'), 'DevPortal');

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, updating: false };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('PWA Application Crash Prevented:', error, errorInfo);
    const msg = (error && (error.message || error.toString())) || '';
    const isChunkError = 
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Loading chunk') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('error loading dynamically imported module');

    if (isChunkError && !sessionStorage.getItem('khata_auto_healed')) {
      sessionStorage.setItem('khata_auto_healed', 'true');
      this.handleRefresh();
    }
  }

  handleRefresh = async () => {
    this.setState({ updating: true });
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch (e) {
      console.warn('Cache purge error:', e);
    }
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.set('t', Date.now().toString());
    window.location.replace(cleanUrl.toString());
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="max-w-sm w-full p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl">
            <h2 className="text-lg font-bold text-emerald-400 mb-2">Layali Supermarket • Khata Tab</h2>
            <p className="text-slate-400 text-xs mb-5">
              {this.state.updating ? 'Applying latest update...' : 'A cache refresh is required to update to the latest version.'}
            </p>
            <button
              type="button"
              disabled={this.state.updating}
              onClick={this.handleRefresh}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-sm text-white shadow-lg transition disabled:opacity-50"
            >
              {this.state.updating ? 'Updating Application...' : 'Refresh Application'}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * RootDispatcher: Direct-to-Balance Gateway for Laborers & Camp Patrons
 * Whenever the worker taps the PWA icon on their home screen (which loads '/'),
 * this dispatcher immediately checks persistent localStorage and 10-year cookies.
 * If configured previously by the shop owner, it bypasses all search/login screens
 * and directly renders the worker's personal live balance!
 */
function RootDispatcher() {
  try {
    // 1. Check persistent localStorage device binding
    let savedId = localStorage.getItem('my_khata_customer_id');

    // 2. Check 10-year cookie fallback (shared across PWA standalone & Safari/Chrome webviews)
    if (!savedId) {
      const match = document.cookie.match(/(?:^|;\s*)khata_customer_id=([^;]+)/);
      if (match) savedId = decodeURIComponent(match[1]);
    }

    // 3. Fallback to single previously viewed account cache
    if (!savedId) {
      const legacyId = localStorage.getItem('my_khata_id') || localStorage.getItem('khata_last_customer_id');
      if (legacyId) savedId = legacyId;
    }

    if (savedId) {
      return <Navigate to={`/tab/${encodeURIComponent(savedId)}`} replace />;
    }
  } catch (e) {
    console.warn('RootDispatcher device binding lookup error:', e);
  }

  return <HomeLookup />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-emerald-400 font-bold text-sm tracking-wide">Loading Khata...</div>}>
          <Routes>
            <Route path="/" element={<RootDispatcher />} />
            {/* Developer Stealth Console (No public links, secured by master password & biometrics) */}
            <Route path="/dev" element={<DevPortal />} />
            <Route path="/developer" element={<DevPortal />} />

            {/* Isolated Customer Tab Redesign Preview (Approved Plan Preview Sandbox) */}
            <Route path="/preview" element={<CustomerTabPreview />} />
            <Route path="/tab-preview" element={<CustomerTabPreview />} />

            {/* Canonical Customer Tab */}
            <Route path="/tab/:customerId" element={<CustomerTab />} />
            {/* Canonical Private Statement */}
            <Route path="/statement/:uuid" element={<KhataStatement />} />
            {/* Route Aliases for Legacy POS Receipts & Deep-Links (Resolved PWA-R4-11) */}
            <Route path="/khata/:uuid" element={<KhataStatement />} />
            <Route path="/receipt/:uuid" element={<KhataStatement />} />
            <Route path="/bill/:uuid" element={<CustomerTab />} />
            <Route path="/customer/:customerId" element={<CustomerTab />} />
            <Route path="/pay/:customerId" element={<CustomerTab />} />
            {/* Wildcard Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
