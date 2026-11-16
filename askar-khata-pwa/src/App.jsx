import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { KhataStatement } from './KhataStatement';
import CustomerTab from './pages/CustomerTab';
import HomeLookup from './pages/HomeLookup';

/**
 * RootDispatcher: Direct-to-Balance Gateway for Laborers & Camp Patrons
 * Whenever the worker taps the PWA icon on their home screen (which loads '/'),
 * this dispatcher immediately checks persistent localStorage and 10-year cookies.
 * If configured previously by the shop owner, it bypasses all search/login screens
 * and directly renders the worker's personal live balance!
 */
function RootDispatcher() {
  const [searchParams] = useSearchParams();
  const isReset = searchParams.get('reset') === '1' || searchParams.get('switch') === '1';

  if (!isReset) {
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
  }

  return <HomeLookup />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootDispatcher />} />
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
    </BrowserRouter>
  );
}
