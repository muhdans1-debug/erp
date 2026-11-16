import { Routes, Route, Navigate } from 'react-router-dom';
import ManagerDashboard from './pages/ManagerDashboard';
import OldAdminDashboard from './pages/OldAdminDashboard';
import AdminAuthGuard from './components/AdminAuthGuard';

export default function App() {
  return (
    <AdminAuthGuard>
      <Routes>
        {/* Set the Sunmi dashboard to the root IP path */}
        <Route path="/" element={<ManagerDashboard />} />

        {/* Direct path for /sunmi-dashboard */}
        <Route path="/sunmi-dashboard" element={<ManagerDashboard />} />

        {/* Old dashboard accessible at /old */}
        <Route path="/old" element={<OldAdminDashboard />} />

        {/* Fallback to root */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AdminAuthGuard>
  );
}
