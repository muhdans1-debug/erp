import { useState, useEffect } from 'react';
import { registerPlugin } from '@capacitor/core';
import LoginScreen from './pages/LoginScreen';
import CheckoutScreen from './pages/CheckoutScreen';
import ManagerDashboard from './pages/ManagerDashboard';
import StartShiftModal from './components/StartShiftModal';
import CustomerDisplayPage from './pages/CustomerDisplayPage';
import CustomerStatementPage from './pages/CustomerStatementPage';
import CorporateSponsorDashboard from './pages/CorporateSponsorDashboard';
import { useDisasterRecovery } from './hooks/useDisasterRecovery';
import { initOTA } from './utils/otaUpdater';
import { useSunmiBridge } from './hooks/useSunmiBridge';
import { printFullReceipt } from './utils/printer';

const CustomerDisplay = registerPlugin<any>('CustomerDisplay');

export default function App() {
  // Target the 4.3" SUNMI Customer Display route directly (800x480)
  const isCustomerDisplayRoute = typeof window !== 'undefined' && (
    window.location.pathname === '/customer-display' ||
    window.location.pathname.endsWith('/customer-display') ||
    new URLSearchParams(window.location.search).get('view') === 'customer-display'
  );

  // Public Cloud Edge Host Check (Cloudflare Pages, Vercel, or custom Khata domain)
  const isPublicEdge = typeof window !== 'undefined' && (
    window.location.hostname.includes('pages.dev') ||
    window.location.hostname.includes('vercel.app') ||
    window.location.hostname.includes('trycloudflare.com') ||
    window.location.hostname.includes('askar') ||
    window.location.hostname === 'khata.askar.com'
  );

  // Target Customer Self-Service Statement Portal (/tab/:id, /statement, /khata, ?view=statement, OR root / on public edge)
  const isStatementRoute = typeof window !== 'undefined' && (
    window.location.pathname.startsWith('/tab') ||
    window.location.pathname === '/statement' ||
    window.location.pathname === '/khata' ||
    window.location.pathname.startsWith('/khata/') ||
    new URLSearchParams(window.location.search).get('view') === 'statement' ||
    new URLSearchParams(window.location.search).has('khata') ||
    (isPublicEdge && !window.location.pathname.startsWith('/sponsor') && !window.location.pathname.startsWith('/b2b') && !window.location.search.includes('view=sponsor'))
  );

  // Target Corporate Sponsor B2B Dashboard (/sponsor, /b2b, or ?view=sponsor)
  const isSponsorRoute = typeof window !== 'undefined' && (
    window.location.pathname.startsWith('/sponsor') ||
    window.location.pathname.startsWith('/b2b') ||
    new URLSearchParams(window.location.search).get('view') === 'sponsor'
  );

  const statementCustomerId = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('id') ||
       (window.location.pathname.startsWith('/tab/') ? window.location.pathname.replace('/tab/', '').split('/')[0] : null))
    : null;

  // If booted on Manager Laptop port (5175) or explicitly requested via query parameter
  const isManagerPort = typeof window !== 'undefined' && (
    window.location.port === '5175' ||
    window.location.search.includes('view=dashboard') ||
    window.location.search.includes('view=manager')
  );

  // 1. Reliable Lock: Read from localStorage
  const [userRole, setUserRole] = useState<'NONE' | 'CASHIER' | 'MANAGER'>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.port === '5175' || window.location.search.includes('view=dashboard')) {
        return 'MANAGER';
      }
      const saved = localStorage.getItem('askar_role') as any;
      if (saved === 'CASHIER') return 'CASHIER';
    }
    return 'NONE';
  });

  const [apiBase] = useState(() => {
    if (typeof window !== 'undefined') {
      const custom = localStorage.getItem('master_server_url');
      if (custom) return custom;
      const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
      if (isNative) return 'http://192.168.8.7:3000';
      const host = window.location.hostname || 'localhost';
      return `http://${host}:3000`;
    }
    return 'http://localhost:3000';
  });

  // Disaster Recovery Protocol: Cloud Traffic Light & Physical Backup
  const {
    syncStatus,
    lastSyncTime,
    offlineHours,
    isExporting,
    performSync,
    exportDatabaseBackup,
  } = useDisasterRecovery(apiBase);

  // Initialize Capgo Over-The-Air (OTA) updater for silent remote hot-swaps
  useEffect(() => {
    initOTA();
  }, []);

  // Eagerly launch the Customer Display on Sunmi's secondary 800x480 HDMI Screen
  useEffect(() => {
    const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
    if (isNative && !isCustomerDisplayRoute) {
      try {
        CustomerDisplay.openUrl({ url: 'http://localhost/?view=customer-display' }).catch(() => {});
      } catch (e) {
        console.warn('CustomerDisplay openUrl error', e);
      }
    }
  }, []);

  // Local RJ45 UI Bridge: Zero-latency hardware link with Manager's back-office laptop
  const { activeLock, broadcastNfcScan, broadcastCartState, managerScanLocked, managerScanMessage } = useSunmiBridge();

  useEffect(() => {
    const handleNfcBroadcast = (e: any) => {
      const nfcId = e?.detail?.nfcId || e?.detail;
      if (nfcId) {
        broadcastNfcScan(nfcId);
      }
    };

    const handleCartBroadcast = (e: any) => {
      const detail = e?.detail;
      if (detail && broadcastCartState) {
        broadcastCartState(detail.cart || [], detail.total || 0, detail.customer || null, detail.activeCartId || '1');
      }
    };

    const handleRemotePrint = (e: any) => {
      const payload = e?.detail;
      if (payload) {
        printFullReceipt(payload).catch((err) => console.warn('Remote print error:', err));
      }
    };

    const handleNfcAssigned = (e: any) => {
      const payload = e?.detail;
      if (payload?.tag_id) {
        console.log(`🎉 [App] NFC Card ${payload.tag_id} linked to ${payload.target_name} (${payload.card_type})!`);
      }
    };

    const handleRemoteLock = () => {
      console.log('🔒 [App] Remote Lock Register triggered by Manager Laptop');
      handleLockTerminal();
    };

    window.addEventListener('sunmi-nfc-broadcast', handleNfcBroadcast);
    window.addEventListener('sunmi-cart-broadcast', handleCartBroadcast);
    window.addEventListener('sunmi-remote-print', handleRemotePrint);
    window.addEventListener('sunmi-nfc-assigned', handleNfcAssigned);
    window.addEventListener('sunmi-remote-lock', handleRemoteLock);

    return () => {
      window.removeEventListener('sunmi-nfc-broadcast', handleNfcBroadcast);
      window.removeEventListener('sunmi-cart-broadcast', handleCartBroadcast);
      window.removeEventListener('sunmi-remote-print', handleRemotePrint);
      window.removeEventListener('sunmi-nfc-assigned', handleNfcAssigned);
      window.removeEventListener('sunmi-remote-lock', handleRemoteLock);
    };
  }, [broadcastNfcScan, broadcastCartState]);

  // Track if the cashier has declared their opening cash
  const [activeShiftId, setActiveShiftId] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? (localStorage.getItem('askar_shift_id') || localStorage.getItem('active_shift_id')) : null;
  });

  // If Cashier, check if shift is already active on backend
  useEffect(() => {
    if (userRole === 'CASHIER') {
      fetch(`${apiBase}/api/shifts/current?t=${Date.now()}`, { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          if (data.hasActiveShift && data.shift) {
            setActiveShiftId(data.shift.id);
            localStorage.setItem('askar_shift_id', data.shift.id);
            localStorage.setItem('active_shift_id', data.shift.id);
          } else {
            setActiveShiftId(null);
            localStorage.removeItem('askar_shift_id');
            localStorage.removeItem('active_shift_id');
          }
        })
        .catch(() => { });
    }
  }, [apiBase, userRole]);

  // Securely update state and storage together
  const handleLogin = (role: 'CASHIER' | 'MANAGER', employee?: { id: string; name: string }) => {
    setUserRole(role);
    localStorage.setItem('askar_role', role);
    if (employee) {
      localStorage.setItem('active_employee_id', employee.id);
      localStorage.setItem('active_shift_cashier', employee.name);
    }
  };

  const handleLockTerminal = () => {
    setUserRole('NONE');
    setActiveShiftId(null);
    localStorage.removeItem('askar_role');
    localStorage.removeItem('active_employee_id');
    localStorage.removeItem('askar_shift_id');
    localStorage.removeItem('active_shift_id');
  };

  const handleShiftStart = (newShiftId: string) => {
    setActiveShiftId(newShiftId);
    localStorage.setItem('askar_shift_id', newShiftId);
    localStorage.setItem('active_shift_id', newShiftId);
  };

  if (isCustomerDisplayRoute) {
    return (
      <div className="w-full h-full min-h-screen bg-slate-900 overflow-hidden flex flex-col">
        <CustomerDisplayPage />
      </div>
    );
  }

  // --- VIEW 0: INTERACTIVE CUSTOMER KHATA & FINANCIAL PORTAL ---
  if (isStatementRoute) {
    return <CustomerStatementPage customerId={statementCustomerId} apiBase={apiBase} />;
  }

  // --- VIEW 0B: CORPORATE SPONSOR B2B FLEET DASHBOARD (/sponsor) ---
  if (isSponsorRoute) {
    return <CorporateSponsorDashboard apiBase={apiBase} />;
  }

  // --- VIEW 3: THE ORIGINAL ASKAR BACK-OFFICE MANAGER (:5175 / ?view=dashboard) ---
  if (userRole === 'MANAGER' || isManagerPort) {
    return (
      <ManagerDashboard
        apiBase={apiBase}
        onBackToPos={() => {
          if (window.location.port === '5175') {
            window.location.href = 'http://' + window.location.hostname + ':5173/';
          } else {
            handleLogin('CASHIER');
          }
        }}
      />
    );
  }

  const renderManagerScanOverlay = () => {
    if (!managerScanLocked) return null;
    return (
      <div className="fixed inset-0 z-[999999] bg-slate-950/92 backdrop-blur-md flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-full bg-blue-600/20 flex items-center justify-center animate-ping absolute inset-0" />
          <div className="w-24 h-24 rounded-full bg-blue-600/30 flex items-center justify-center border-2 border-blue-400 relative shadow-2xl">
            <svg className="w-12 h-12 text-blue-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 004 11m0 0a8 8 0 00.99 7.132" />
            </svg>
          </div>
        </div>
        <h2 className="text-2xl font-black text-white mb-2 tracking-wide">
          Manager NFC Scan Active
        </h2>
        <p className="text-slate-300 max-w-sm text-sm font-medium leading-relaxed mb-4">
          {managerScanMessage || "Manager is scanning a card from the laptop. Please hold customer card to the back of the terminal."}
        </p>
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
          Hardware NFC Transceiver ON
        </div>
      </div>
    );
  };

  // --- VIEW 1: THE SECURE LOGIN LOCK (For POS Terminal :5173) ---
  if (userRole === 'NONE') {
    return (
      <>
        {renderManagerScanOverlay()}
        <LoginScreen onLogin={handleLogin} apiBase={apiBase} />
      </>
    );
  }

  // --- VIEW 2: THE CASHIER ENVIRONMENT ---
  if (userRole === 'CASHIER') {
    return (
      <div className="h-screen w-full relative bg-slate-900 overflow-hidden">
        {renderManagerScanOverlay()}
        {activeLock && (
          <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9999] bg-amber-600 text-white px-4 py-2 rounded-xl shadow-2xl flex items-center gap-2 border border-amber-400 font-bold text-xs">
            <span className="w-2 h-2 rounded-full bg-white" />
            <span>Khata Customer [{activeLock.customerName || activeLock.customerId}] locked by Back-Office Laptop.</span>
          </div>
        )}
        {/* FIX: Only ask the CASHIER for the floating cash, and only if a shift hasn't started */}
        {!activeShiftId ? (
          <StartShiftModal
            cashierName={typeof window !== 'undefined' ? (localStorage.getItem('active_shift_cashier') || 'Cashier 1') : 'Cashier 1'}
            employeeId={typeof window !== 'undefined' ? (localStorage.getItem('active_employee_id') || 'emp_cashier_1') : 'emp_cashier_1'}
            apiBase={apiBase}
            onShiftStart={handleShiftStart}
            onCancel={handleLockTerminal}
          />
        ) : (
          <CheckoutScreen
            isCashierTrapped={true}
            onLockTerminal={handleLockTerminal}
            shiftId={activeShiftId}
            disasterRecovery={{
              syncStatus,
              lastSyncTime,
              offlineHours,
              isExporting,
              performSync,
              exportDatabaseBackup
            }}
          />
        )}
      </div>
    );
  }

  return null;
}