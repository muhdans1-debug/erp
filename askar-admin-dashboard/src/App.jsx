import { Routes, Route, Navigate } from 'react-router-dom';
// 1. Import your newly moved dashboard
import ManagerDashboard from './pages/ManagerDashboard';

// 2. Safely preserved old dashboard at /old if ever needed
import OldAdminDashboard from './pages/OldAdminDashboard';

export default function App() {
  return (
    <Routes>
      {/* 3. Set the Sunmi dashboard to the root IP path */}
      <Route path="/" element={<ManagerDashboard />} />

      {/* Direct path for /sunmi-dashboard */}
      <Route path="/sunmi-dashboard" element={<ManagerDashboard />} />

      {/* 4. Old dashboard accessible at /old */}
      <Route path="/old" element={<OldAdminDashboard />} />

      {/* Fallback to root */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
