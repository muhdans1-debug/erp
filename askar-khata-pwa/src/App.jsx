import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { KhataStatement } from './KhataStatement';
import CustomerTab from './pages/CustomerTab';
import HomeLookup from './pages/HomeLookup';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeLookup />} />
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
