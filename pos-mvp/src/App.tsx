import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { registerPlugin } from '@capacitor/core';
import LoginScreen from './pages/LoginScreen';
import CheckoutScreen from './pages/CheckoutScreen';
import StartShiftModal from './components/StartShiftModal';

// --- LAZY LOAD NON-CHECKOUT SPECIALIZED FLEET PORTALS ---
const CustomerDisplayPage = lazy(() => import('./pages/CustomerDisplayPage'));
const CustomerStatementPage = lazy(() => import('./pages/CustomerStatementPage'));
const CorporateSponsorDashboard = lazy(() => import('./pages/CorporateSponsorDashboard'));
const F100Pim = lazy(() => import('./F100Pim'));
const MobileKhataScreen = lazy(() => import('./pages/MobileKhataScreen'));
const MobileTapPad = lazy(() => import('./pages/MobileTapPad'));
const ProducePriceCommander = lazy(() => import('./pages/ProducePriceCommander'));
import { useDisasterRecovery } from './hooks/useDisasterRecovery';
import { useNetworkSync } from './hooks/useNetworkSync';
import { initOTA } from './utils/otaUpdater';
import { printNativeSunmiReceipt, printKhataStatement, showToast } from './utils/printer';
import { playNfcChime } from './utils/sound';
import { openCashDrawer } from './services/cashDrawerService';
import { Printer } from 'capacitor-sunmi-printer';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { initNativeOfflineStorage } from './utils/nativeDb';
import { getApiBaseUrl, getServerIp, DEFAULT_EDGE_API_URL } from './utils/apiConfig';
import { syncClockWithMasterServer, updateClockOffsetFromHeartbeat } from './utils/time';
import { useBarcodeWedge } from './hooks/useBarcodeWedge';
import { setManagerSessionPin, clearManagerSessionPin } from './utils/authUtils';
import { initPushNotifications, requestNotificationPermission, getNotificationPermissionStatus, showTransactionNotification, triggerTestTransactionNotification } from './utils/pushNotification';
import { Bell, X as CloseIcon } from 'lucide-react';

const CustomerDisplay = registerPlugin<any>('CustomerDisplay');

export default function App() {
  // Ultra-Speed Hardware Barcode Scanner & Sunmi Native Broadcast Wedge
  useBarcodeWedge();

  // Target the 4.3" SUNMI Customer Display route directly (800x480)
  const isCustomerDisplayRoute = typeof window !== 'undefined' && (
    window.location.pathname === '/customer-display' ||
    window.location.pathname.endsWith('/customer-display') ||
    new URLSearchParams(window.location.search).get('view') === 'customer-display'
  );

  // Explicit Cashier Billing POS Route (on laptops, desktops, web browsers, or Sunmi terminals)
  const isExplicitPos = typeof window !== 'undefined' && (
    window.location.pathname === '/pos' ||
    window.location.pathname.startsWith('/pos/') ||
    window.location.pathname === '/register' ||
    window.location.pathname === '/checkout' ||
    new URLSearchParams(window.location.search).get('view') === 'pos' ||
    new URLSearchParams(window.location.search).get('view') === 'register' ||
    new URLSearchParams(window.location.search).get('view') === 'checkout'
  );

  // Target Customer Self-Service Statement Portal (/tab/:id, /customer/:id, /statement, /khata, ?view=statement)
  // Dedicated statement host: khata.askar.com
  const isStatementRoute = typeof window !== 'undefined' && !isExplicitPos && (
    window.location.pathname.startsWith('/tab') ||
    window.location.pathname.startsWith('/customer') ||
    window.location.pathname === '/statement' ||
    window.location.pathname === '/khata' ||
    window.location.pathname.startsWith('/khata/') ||
    new URLSearchParams(window.location.search).get('view') === 'statement' ||
    new URLSearchParams(window.location.search).get('view') === 'customer' ||
    new URLSearchParams(window.location.search).has('khata') ||
    (window.location.hostname === 'khata.askar.com')
  );

  // Target Corporate Sponsor B2B Dashboard (/sponsor, /b2b, or ?view=sponsor)
  const isSponsorRoute = typeof window !== 'undefined' && (
    window.location.pathname.startsWith('/sponsor') ||
    window.location.pathname.startsWith('/b2b') ||
    new URLSearchParams(window.location.search).get('view') === 'sponsor'
  );

  // Target iPhone 16 Pro / Mobile Tap Pad Route (/tap, /relay, or ?view=tap, ?view=companion)
  const isTapPadRoute = typeof window !== 'undefined' && (
    window.location.pathname === '/tap' ||
    window.location.pathname.startsWith('/tap/') ||
    window.location.pathname === '/relay' ||
    window.location.pathname.startsWith('/relay/') ||
    new URLSearchParams(window.location.search).get('view') === 'tap' ||
    new URLSearchParams(window.location.search).get('view') === 'relay' ||
    new URLSearchParams(window.location.search).get('view') === 'companion'
  );

  // Target Daily Fresh Produce Commander (/produce, /veggies, or ?view=produce, ?tab=produce)
  const isProduceRoute = typeof window !== 'undefined' && (
    window.location.pathname === '/produce' ||
    window.location.pathname.startsWith('/produce/') ||
    window.location.pathname === '/veggies' ||
    window.location.pathname.startsWith('/veggies/') ||
    new URLSearchParams(window.location.search).get('view') === 'produce' ||
    new URLSearchParams(window.location.search).get('tab') === 'produce' ||
    new URLSearchParams(window.location.search).get('view') === 'veggies'
  );

  // Target 60-Sec Price Change (/price-change, /flash-pricing, ?view=price-change)
  const isPriceChangeRoute = typeof window !== 'undefined' && (
    window.location.pathname === '/price-change' ||
    window.location.pathname === '/flash-pricing' ||
    window.location.pathname.startsWith('/price-change') ||
    new URLSearchParams(window.location.search).get('view') === 'price-change' ||
    new URLSearchParams(window.location.search).get('tab') === 'price_change' ||
    new URLSearchParams(window.location.search).get('view') === '60s' ||
    new URLSearchParams(window.location.search).get('tab') === '60s'
  );

  // Feitian F100 Handheld Terminal Detection (Terminal 02 Profile)
  const isF100Device = typeof window !== 'undefined' && (
    (typeof navigator !== 'undefined' && (
      navigator.userAgent.toLowerCase().includes('f100') ||
      navigator.userAgent.toLowerCase().includes('feitian') ||
      navigator.userAgent.toLowerCase().includes('fp-100') ||
      navigator.userAgent.toLowerCase().includes('smartpos')
    )) ||
    localStorage.getItem('terminal_id') === 'T2' ||
    localStorage.getItem('f100_default_mode') === 'true' ||
    localStorage.getItem('f100_active_mode') === 'pos' ||
    localStorage.getItem('f100_active_mode') === 'pim' ||
    window.location.pathname.startsWith('/f100') ||
    window.location.pathname.startsWith('/pim') ||
    new URLSearchParams(window.location.search).get('view') === 'f100' ||
    new URLSearchParams(window.location.search).get('view') === 'pim' ||
    new URLSearchParams(window.location.search).get('view') === 'mobile' ||
    new URLSearchParams(window.location.search).get('view') === 'khata' ||
    ['2', 't2', 'f100'].includes((new URLSearchParams(window.location.search).get('terminal') || '').toLowerCase())
  );

  const [f100Mode, setF100Mode] = useState<'pos' | 'pim'>(() => {
    if (typeof window !== 'undefined') {
      const view = new URLSearchParams(window.location.search).get('view');
      if (view === 'pim' || view === 'f100') return 'pim';
      if (view === 'pos' || view === 'mobile' || view === 'khata') return 'pos';
      const saved = localStorage.getItem('f100_active_mode');
      if (saved === 'pim' || saved === 'pos') return saved;
      if (localStorage.getItem('f100_default_mode') === 'true') return 'pim';
    }
    return 'pos'; // Default to high-speed Terminal 02 Khata POS
  });

  // Automatically enforce terminal prefix and ID for multi-device fleet (Laptops + Sunmi + Handhelds)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const explicitParam = (searchParams.get('terminal') || searchParams.get('terminalId') || searchParams.get('register') || '').toLowerCase();
      const ua = (navigator.userAgent || '').toLowerCase();
      const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
      const isMobile = /android|iphone|ipad|ipod/i.test(ua);

      // 1. Explicit URL parameter always wins
      if (explicitParam === '1' || explicitParam === 't1' || explicitParam === 'sunmi') {
        localStorage.setItem('terminal_id', 'T1');
        localStorage.setItem('REGISTER_PREFIX', 'T1');
        return;
      }
      if (explicitParam === '2' || explicitParam === 't2' || explicitParam === 'f100' || explicitParam === 'mobile' || explicitParam === 'khata' || explicitParam === 'pim') {
        localStorage.setItem('terminal_id', 'T2');
        localStorage.setItem('REGISTER_PREFIX', 'T2');
        return;
      }
      if (explicitParam === '3' || explicitParam === 't3' || explicitParam === 'desktop' || explicitParam === 'laptop' || explicitParam === 'laptop1' || explicitParam === 'web') {
        localStorage.setItem('terminal_id', 'T3');
        localStorage.setItem('REGISTER_PREFIX', 'T3');
        return;
      }
      if (explicitParam === '4' || explicitParam === 't4' || explicitParam === 'desktop2' || explicitParam === 'laptop2' || explicitParam === 'web2') {
        localStorage.setItem('terminal_id', 'T4');
        localStorage.setItem('REGISTER_PREFIX', 'T4');
        return;
      }
      if (explicitParam === 'm1' || explicitParam === 'phone' || explicitParam === 'phone1' || explicitParam === 'mobile1') {
        localStorage.setItem('terminal_id', 'M1');
        localStorage.setItem('REGISTER_PREFIX', 'M1');
        return;
      }
      if (explicitParam === 'm2' || explicitParam === 'phone2' || explicitParam === 'mobile2') {
        localStorage.setItem('terminal_id', 'M2');
        localStorage.setItem('REGISTER_PREFIX', 'M2');
        return;
      }

      // 2. Hardware profile detection
      if (isF100Device) {
        if (!localStorage.getItem('terminal_id') || localStorage.getItem('terminal_id') === 'T1') {
          localStorage.setItem('terminal_id', 'T2');
          localStorage.setItem('REGISTER_PREFIX', 'T2');
        }
      } else if (!isMobile && !isNative) {
        // Desktop Web POS (PC / Mac / Laptop running browser)
        const myClientUuid = (() => {
          let id = localStorage.getItem('pos_browser_client_uuid');
          if (!id) {
            id = 'desk_' + Math.random().toString(36).slice(2, 9);
            localStorage.setItem('pos_browser_client_uuid', id);
          }
          return id;
        })();

        // Query live fleet to avoid colliding with an already active Counter 3 (Desktop 1)
        const candidateBases = [apiBase, DEFAULT_EDGE_API_URL].filter(Boolean);
        const firstBase = candidateBases[0] || 'https://askar-edge-api.layali-askar-pos.workers.dev';
        fetch(`${firstBase}/api/register/cart/live`, { signal: AbortSignal.timeout(3000) })
          .then(r => r.json())
          .then(data => {
            const t3 = (data.registers || []).find((r: any) => r.terminalId === 'T3');
            const now = Date.now();
            const isT3BusyOnOtherDevice = Boolean(
              t3 &&
              t3.isOnline &&
              t3.clientUuid &&
              t3.clientUuid !== myClientUuid &&
              (now - (t3.lastSeen || 0) < 40000)
            );
            const currentStored = localStorage.getItem('terminal_id');
            if (isT3BusyOnOtherDevice) {
              if (!currentStored || currentStored === 'T3' || currentStored === 'T1' || currentStored === 'SUNMI-D2-REG01' || currentStored === '1') {
                console.log(`⚡ [Fleet Guard] Counter 3 is active on another machine (${t3.clientUuid}). Auto-assigning Counter 4 (Desktop 2).`);
                localStorage.setItem('terminal_id', 'T4');
                localStorage.setItem('REGISTER_PREFIX', 'T4');
                window.dispatchEvent(new CustomEvent('terminal-switched', { detail: { terminalId: 'T4' } }));
              }
            } else {
              if (!currentStored || currentStored === 'T1' || currentStored === 'SUNMI-D2-REG01' || currentStored === '1') {
                localStorage.setItem('terminal_id', 'T3');
                localStorage.setItem('REGISTER_PREFIX', 'T3');
                window.dispatchEvent(new CustomEvent('terminal-switched', { detail: { terminalId: 'T3' } }));
              }
            }
          })
          .catch(() => {
            const currentStored = localStorage.getItem('terminal_id');
            if (!currentStored || currentStored === 'T1' || currentStored === 'SUNMI-D2-REG01' || currentStored === '1') {
              localStorage.setItem('terminal_id', 'T3');
              localStorage.setItem('REGISTER_PREFIX', 'T3');
            }
          });
      } else if (isMobile && !isNative) {
        // Mobile phone browser (iPhone / Android Web POS)
        const existing = localStorage.getItem('terminal_id');
        if (!existing || existing === 'T1' || existing === 'T3') {
          localStorage.setItem('terminal_id', 'M1');
          localStorage.setItem('REGISTER_PREFIX', 'M1');
        }
      } else {
        // Native or Android device defaults to Sunmi T1 unless configured
        if (!localStorage.getItem('terminal_id')) {
          localStorage.setItem('terminal_id', 'T1');
          localStorage.setItem('REGISTER_PREFIX', 'T1');
        }
      }
    }
  }, [isF100Device]);

  const statementCustomerId = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('id') ||
      new URLSearchParams(window.location.search).get('customerId') ||
      (window.location.pathname.startsWith('/tab/') ? window.location.pathname.replace('/tab/', '').split('/')[0].split('?')[0] : null) ||
      (window.location.pathname.startsWith('/customer/') ? window.location.pathname.replace('/customer/', '').split('/')[0].split('?')[0] : null) ||
      (window.location.pathname.startsWith('/khata/') ? window.location.pathname.replace('/khata/', '').split('/')[0].split('?')[0] : null) ||
      (window.location.pathname.startsWith('/statement/') ? window.location.pathname.replace('/statement/', '').split('/')[0].split('?')[0] : null))
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
      if (saved === 'CASHIER' || saved === 'MANAGER') return saved;
    }
    return 'NONE';
  });

  const [apiBase] = useState(() => getApiBaseUrl());

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
    initPushNotifications().catch(() => { });
  }, []);

  // ⚡ Native Android SQLite Initialization (immunizes offline transactions against browser cache evictions)
  useEffect(() => {
    initNativeOfflineStorage().catch((err) => {
      console.warn('Native offline storage notice (non-fatal on web):', err);
    });
  }, []);

  // 🟢 PREVENTS DOZE MODE: Forces Android to keep screen and CPU active while POS is running
  useEffect(() => {
    const lockScreen = async () => {
      try {
        await KeepAwake.keepAwake();
        console.log('✅ Native Wake-Lock Acquired: Sync timers will not suspend.');
      } catch (err) {
        console.warn('Native wake-lock notice (non-fatal on web):', err);
      }
    };

    lockScreen();

    return () => {
      try {
        KeepAwake.allowSleep().catch(() => { });
      } catch { }
    };
  }, []);

  // Eagerly launch the Customer Display on Sunmi's secondary 800x480 HDMI Screen
  useEffect(() => {
    const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
    if (isNative) {
      if (typeof Printer !== 'undefined') {
        Printer.initPrinter?.().catch(() => { });
      }
      if (!isCustomerDisplayRoute) {
        try {
          CustomerDisplay.openUrl({ url: 'http://localhost/customer.html' }).catch(() => { });
        } catch (e) {
          console.warn('CustomerDisplay openUrl error', e);
        }
      }
    }
  }, []);

  // Single Connection State (Dispatched via useNetworkSync over WebSocket)
  useNetworkSync(getServerIp());
  const [activeLock, setActiveLock] = useState<any>(null);
  const [managerScanLocked, setManagerScanLocked] = useState(false);
  const [managerScanMessage, setManagerScanMessage] = useState("");

  // Universal Floating Push Notification Banner & Live Transaction Popups
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [showGlobalNotifBanner, setShowGlobalNotifBanner] = useState(true);
  const [liveTxAlert, setLiveTxAlert] = useState<{
    id?: string;
    txType: 'SALE' | 'KHATA_PAYMENT' | 'KHATA_CHARGE' | 'REFUND' | 'EXPENSE';
    title: string;
    message: string;
    amount: number;
    formattedAmount?: string;
    reference?: string;
    invoiceNo?: string;
    paymentMethod?: string;
    customerId?: string | null;
    customerName?: string | null;
    timestamp?: string;
  } | null>(null);

  useEffect(() => {
    initPushNotifications().catch(() => { });
    const perm = getNotificationPermissionStatus();
    setNotifPermission(perm);
    setShowGlobalNotifBanner(true);

    const handleIncomingTx = (e: any) => {
      const data = e.detail;
      if (data) {
        setLiveTxAlert(data);
      }
    };
    window.addEventListener('pwa-transaction-notification', handleIncomingTx);
    return () => {
      window.removeEventListener('pwa-transaction-notification', handleIncomingTx);
    };
  }, []);

  // Auto-dismiss the live popup alert after 9 seconds
  useEffect(() => {
    if (!liveTxAlert) return;
    const t = setTimeout(() => {
      setLiveTxAlert(null);
    }, 9000);
    return () => clearTimeout(t);
  }, [liveTxAlert]);

  const handleEnableGlobalPush = async () => {
    const res = await requestNotificationPermission();
    setNotifPermission(res);
    if (res === 'granted') {
      showToast('🔔 Phone Notifications Activated!');
      showTransactionNotification({
        txType: 'SALE',
        title: 'Askar POS Alerts Activated 🔔',
        message: 'This phone will now receive real-time alerts for every transaction.',
        amount: 0,
        formattedAmount: 'Ready'
      });
    } else {
      showToast('⚠️ Notifications blocked in browser settings');
    }
  };

  const handleDismissGlobalNotif = () => {
    setShowGlobalNotifBanner(false);
  };

  const renderLiveTransactionAlertModal = () => {
    if (!liveTxAlert) return null;

    // Filter for customer statement portal so customer only receives alerts for their own account
    if (isStatementRoute && statementCustomerId && liveTxAlert.customerId && liveTxAlert.customerId !== statementCustomerId) {
      return null;
    }

    const isPositive = liveTxAlert.txType === 'SALE' || liveTxAlert.txType === 'KHATA_PAYMENT';
    const isCharge = liveTxAlert.txType === 'KHATA_CHARGE';

    const bgGradient = isPositive
      ? 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)'
      : isCharge
        ? 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)'
        : 'linear-gradient(135deg, #881337 0%, #450a0a 100%)';

    const borderColor = isPositive ? '#10b981' : isCharge ? '#3b82f6' : '#f43f5e';
    const glowColor = isPositive ? 'rgba(16, 185, 129, 0.45)' : isCharge ? 'rgba(59, 130, 246, 0.45)' : 'rgba(244, 63, 94, 0.45)';

    return (
      <div
        role="alert"
        style={{
          position: 'fixed',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 24px)',
          maxWidth: '460px',
          zIndex: 99999999,
          background: bgGradient,
          border: `2px solid ${borderColor}`,
          borderRadius: '20px',
          padding: '16px 18px',
          boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.9), 0 0 25px ${glowColor}`,
          color: '#ffffff',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '14px',
                background: isPositive ? 'rgba(16, 185, 129, 0.25)' : isCharge ? 'rgba(59, 130, 246, 0.25)' : 'rgba(244, 63, 94, 0.25)',
                border: `1.5px solid ${borderColor}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                flexShrink: 0
              }}
            >
              {isPositive ? '💰' : isCharge ? '💳' : '💸'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: '900',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: borderColor,
                    color: '#ffffff'
                  }}
                >
                  {liveTxAlert.txType.replace('_', ' ')}
                </span>
                <span style={{ fontSize: '11px', color: '#cbd5e1' }}>
                  {liveTxAlert.paymentMethod ? `via ${liveTxAlert.paymentMethod}` : ''}
                </span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: '900', letterSpacing: '-0.5px', marginTop: '4px', color: '#ffffff' }}>
                {liveTxAlert.formattedAmount || `${liveTxAlert.amount.toFixed(3)} BHD`}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLiveTxAlert(null)}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              borderRadius: '999px',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.15)', fontSize: '12px', display: 'flex', justifyContent: 'space-between', color: '#e2e8f0' }}>
          <div>
            {liveTxAlert.customerName && <span>👤 <strong>{liveTxAlert.customerName}</strong></span>}
            {liveTxAlert.invoiceNo && <span style={{ marginLeft: liveTxAlert.customerName ? '8px' : '0' }}>Inv: #{liveTxAlert.invoiceNo}</span>}
          </div>
          <div style={{ color: '#94a3b8', fontSize: '11px' }}>
            {liveTxAlert.timestamp ? new Date(liveTxAlert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
          </div>
        </div>
      </div>
    );
  };

  const renderGlobalNotifBanner = () => {
    return (
      <>
        {renderLiveTransactionAlertModal()}
        {!showGlobalNotifBanner ? (
          <button
            type="button"
            onClick={() => setShowGlobalNotifBanner(true)}
            style={{
              position: 'fixed',
              bottom: '16px',
              right: '16px',
              zIndex: 9999999,
              background: '#0f172a',
              border: '1.5px solid #3b82f6',
              borderRadius: '999px',
              padding: '8px 14px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
              color: '#93c5fd',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            <Bell size={14} />
            <span>Alerts Live</span>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
          </button>
        ) : (
          <div
            style={{
              position: 'fixed',
              top: '12px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 'calc(100% - 24px)',
              maxWidth: '480px',
              zIndex: 9999999,
              background: notifPermission === 'granted'
                ? 'linear-gradient(135deg, #064e3b 0%, #0f172a 100%)'
                : 'linear-gradient(135deg, #1e3a8a 0%, #1e1b4b 100%)',
              border: `1.5px solid ${notifPermission === 'granted' ? '#10b981' : '#3b82f6'}`,
              borderRadius: '18px',
              padding: '10px 14px',
              boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.8), 0 0 20px rgba(59, 130, 246, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              color: '#ffffff',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '12px',
                  background: notifPermission === 'granted' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(59, 130, 246, 0.25)',
                  border: `1px solid ${notifPermission === 'granted' ? '#34d399' : '#60a5fa'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: notifPermission === 'granted' ? '#6ee7b7' : '#93c5fd',
                  flexShrink: 0
                }}
              >
                <Bell size={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: '800', letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {notifPermission === 'granted' ? 'Phone Push Alerts Active 🔔' : 'Instant Transaction Alerts 🔔'}
                </div>
                <div style={{ fontSize: '11px', color: '#bfdbfe', opacity: 0.9, lineHeight: '1.2' }}>
                  {notifPermission === 'granted' ? 'All sales & payments sync to this phone' : 'Live audio & visual popups on this screen'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              {notifPermission === 'default' && (
                <button
                  type="button"
                  onClick={handleEnableGlobalPush}
                  style={{
                    background: '#2563eb',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '6px 12px',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.5)'
                  }}
                >
                  Enable
                </button>
              )}
              <button
                type="button"
                onClick={() => triggerTestTransactionNotification()}
                style={{
                  background: '#059669',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '6px 12px',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(5, 150, 105, 0.4)'
                }}
              >
                Test Alert
              </button>
              <button
                type="button"
                onClick={handleDismissGlobalNotif}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '6px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <CloseIcon size={16} />
              </button>
            </div>
          </div>
        )}
      </>
    );
  };

  const lastRelayedNfcTagRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });

  const broadcastNfcScan = (nfcId: string, customerData?: any) => {
    const cleanId = (nfcId || '').trim().toUpperCase();
    if (!cleanId) return;

    // Debounce: prevent duplicate relays within 2.5 seconds per card
    const now = Date.now();
    if (lastRelayedNfcTagRef.current.id === cleanId && (now - lastRelayedNfcTagRef.current.time) < 2500) {
      return;
    }
    lastRelayedNfcTagRef.current = { id: cleanId, time: now };

    try {
      playNfcChime();
    } catch { }

    // Single authoritative relay destination (no duplicate concurrent POSTs)
    const targetBase = apiBase || DEFAULT_EDGE_API_URL;
    fetch(`${targetBase}/api/nfc/relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pos-client': 'store-pos' },
      body: JSON.stringify({ tag_id: cleanId, id: cleanId, terminalId: 'Sunmi POS', customer: customerData || null }),
      signal: AbortSignal.timeout(3000)
    }).catch(() => { });
  };

  const latestCartRef = useRef<any>({ items: [], total: 0, customer: null, activeCartId: '1' });
  const processedPrintJobsRef = useRef<Map<string, number>>(new Map());

  const getResolvedTerminalInfo = () => {
    let resolvedTerminalId = (typeof window !== 'undefined' && localStorage.getItem('terminal_id')) || 'T1';
    if (resolvedTerminalId === 'LAPTOP-01' || resolvedTerminalId === 'WEB-POS') resolvedTerminalId = 'T3';
    if (resolvedTerminalId === 'LAPTOP-02' || resolvedTerminalId === 'WEB-POS-2') resolvedTerminalId = 'T4';
    if (resolvedTerminalId === 'SUNMI-D2-REG01' || resolvedTerminalId === '1') resolvedTerminalId = 'T1';
    if (resolvedTerminalId === 'F100' || resolvedTerminalId === '2') resolvedTerminalId = 'T2';
    if (resolvedTerminalId === '3') resolvedTerminalId = 'T3';
    if (resolvedTerminalId === '4') resolvedTerminalId = 'T4';

    // If on a desktop browser and not Capacitor native, automatically resolve legacy T1 to T3
    if (typeof window !== 'undefined') {
      const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
      const isMobile = typeof navigator !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent);
      if (!isMobile && !isNative && (resolvedTerminalId === 'T1' || resolvedTerminalId === 'SUNMI-D2-REG01')) {
        resolvedTerminalId = 'T3';
      }
      if (isF100Device) {
        resolvedTerminalId = 'T2';
      }
    }

    let resolvedTerminalName = 'Counter 1 (Sunmi D2 Mini)';
    if (resolvedTerminalId === 'T2') resolvedTerminalName = 'Counter 2 (Feitian F100)';
    if (resolvedTerminalId === 'T3') resolvedTerminalName = 'Counter 3 (Desktop Web POS 1)';
    if (resolvedTerminalId === 'T4') resolvedTerminalName = 'Counter 4 (Desktop Web POS 2)';
    if (resolvedTerminalId === 'M1') resolvedTerminalName = 'Floor Phone 1 (Mobile Web POS)';
    if (resolvedTerminalId === 'M2') resolvedTerminalName = 'Floor Phone 2 (Mobile Web POS)';

    const cashierName = (typeof window !== 'undefined' && (localStorage.getItem('cashier_name') || localStorage.getItem('askar_cashier_name'))) || 'Cashier 1';
    return { resolvedTerminalId, resolvedTerminalName, cashierName };
  };

  const processRemoteCommands = (commands: any[]) => {
    if (!Array.isArray(commands) || commands.length === 0) return;
    for (const rawCmd of commands) {
      let cmdName = '';
      let payload: any = {};

      if (typeof rawCmd === 'string') {
        if (rawCmd.startsWith('{')) {
          try {
            const parsed = JSON.parse(rawCmd);
            cmdName = parsed.command || parsed.type || '';
            payload = parsed.payload || parsed;
          } catch {
            cmdName = rawCmd;
          }
        } else if (rawCmd.includes('::')) {
          const [name, jsonStr] = rawCmd.split('::');
          cmdName = name;
          try { payload = JSON.parse(jsonStr); } catch { }
        } else {
          cmdName = rawCmd;
        }
      } else if (typeof rawCmd === 'object' && rawCmd !== null) {
        cmdName = rawCmd.command || rawCmd.type || '';
        payload = rawCmd.payload || rawCmd;
      }

      const cmd = String(cmdName || '').toUpperCase().replace(/^REMOTE_/, '');
      console.log(`⚡ [Fleet Remote Command] Executing: ${cmd}`, payload);

      if (cmd === 'DRAWER_KICK') {
        window.dispatchEvent(new CustomEvent('sunmi-remote-drawer-kick', { detail: payload }));
      } else if (cmd === 'CLEAR_CART') {
        window.dispatchEvent(new CustomEvent('sunmi-remote-clear-cart'));
      } else if (cmd === 'LOCK_REGISTER') {
        window.dispatchEvent(new CustomEvent('sunmi-remote-lock'));
      } else if (cmd === 'BENEFIT_PAY_SUCCESS') {
        console.log('⚡ [BenefitPay Webhook] Incoming Fawri+ auto-settlement event:', payload);
        window.dispatchEvent(new CustomEvent('sunmi-remote-benefit-success', { detail: payload }));
      } else if (cmd === 'PRINT' || cmd === 'PRINT_REQUEST' || cmd === 'PRINT_RECEIPT') {
        console.log('🖨️ [Sunmi Print Station] Incoming network print request:', payload);
        window.dispatchEvent(new CustomEvent('sunmi-remote-print', { detail: payload }));
      }
    }
  };

  const broadcastCartState = (cart: any[], total: number, customer?: any, activeCartId: string = '1') => {
    latestCartRef.current = { cart, total, customer, activeCartId };
    const { resolvedTerminalId, resolvedTerminalName, cashierName } = getResolvedTerminalInfo();

    const cartPayload = {
      items: (cart || []).map((item) => ({
        id: item.id || item.barcode,
        barcode: item.barcode,
        name: item.name || item.name_en || 'Item',
        quantity: item.quantity || 1,
        price: item.price ?? item.sellingPrice ?? 0,
        total: (item.price ?? item.sellingPrice ?? 0) * (item.quantity ?? 1),
        is_weighed_item: !!item.is_weighed_item
      })),
      itemCount: (cart || []).reduce((sum, item) => sum + (item.quantity || 1), 0),
      total: Number(total || 0),
      customer: customer ? {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        balance: customer.balance,
        card_type: customer.card_type,
        mess_id: customer.mess_id
      } : null,
      activeCartId,
      terminalId: resolvedTerminalId,
      terminalName: resolvedTerminalName,
      cashierName,
      status: (cart && cart.length > 0) ? 'ACTIVE_CART' : (isF100Device && f100Mode === 'pim' ? 'PIM_ACTIVE' : 'IDLE'),
      updatedAt: new Date().toISOString()
    };
    const candidateBases = [apiBase, DEFAULT_EDGE_API_URL].filter(
      (v, i, a): v is string => Boolean(v) && a.indexOf(v) === i
    );
    for (const base of candidateBases) {
      fetch(`${base}/api/register/cart/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-pos-client': 'store-pos' },
        body: JSON.stringify(cartPayload)
      })
        .then(res => res.json())
        .then(data => {
          if (data && data.commands) processRemoteCommands(data.commands);
        })
        .catch(() => { });
    }
  };

  // ⚡ Autonomous Multi-Terminal Register Spy Heartbeat (Guarantees ONLINE status across fleet)
  useEffect(() => {
    const sendAutonomousHeartbeat = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const { resolvedTerminalId, resolvedTerminalName, cashierName } = getResolvedTerminalInfo();
      const current = latestCartRef.current || {};
      const candidateBases = [apiBase, DEFAULT_EDGE_API_URL].filter(
        (v, i, a): v is string => Boolean(v) && a.indexOf(v) === i
      );
      const myClientUuid = (typeof window !== 'undefined' && localStorage.getItem('pos_browser_client_uuid')) || undefined;
      const heartbeatPayload = {
        terminalId: resolvedTerminalId,
        terminalName: resolvedTerminalName,
        cashierName,
        clientUuid: myClientUuid,
        items: (current.cart || []).map((item: any) => ({
          id: item.id || item.barcode,
          barcode: item.barcode,
          name: item.name || item.name_en || 'Item',
          quantity: item.quantity || 1,
          price: item.price ?? item.sellingPrice ?? 0,
          total: (item.price ?? item.sellingPrice ?? 0) * (item.quantity ?? 1),
          is_weighed_item: !!item.is_weighed_item
        })),
        itemCount: (current.cart || []).reduce((sum: number, item: any) => sum + (item.quantity || 1), 0),
        total: Number(current.total || 0),
        customer: current.customer || null,
        activeCartId: current.activeCartId || '1',
        status: (current.cart && current.cart.length > 0) ? 'ACTIVE_CART' : (isF100Device && f100Mode === 'pim' ? 'PIM_ACTIVE' : 'IDLE'),
        updatedAt: new Date().toISOString()
      };

      for (const base of candidateBases) {
        fetch(`${base}/api/register/cart/live`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-pos-client': 'store-pos' },
          body: JSON.stringify(heartbeatPayload),
          signal: AbortSignal.timeout(3000)
        })
          .then(res => res.json())
          .then(data => {
            if (data?.serverEpoch) updateClockOffsetFromHeartbeat(data.serverEpoch);
            if (data && data.commands) processRemoteCommands(data.commands);
            // Collision Guard: If this desktop is T3 but another device claimed T3, step to T4
            const isNativePlatform = typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.());
            const isMobileDevice = typeof navigator !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent);
            if (data?.registers && typeof window !== 'undefined' && !isMobileDevice && !isNativePlatform) {
              const currentTerm = localStorage.getItem('terminal_id');
              if (currentTerm === 'T3' && myClientUuid) {
                const t3 = (data.registers || []).find((r: any) => r.terminalId === 'T3');
                const now = Date.now();
                if (t3 && t3.isOnline && t3.clientUuid && t3.clientUuid !== myClientUuid && (now - (t3.lastSeen || 0) < 40000)) {
                  console.log(`⚡ [Fleet Collision Detected] Re-assigning to Counter 4 (Desktop 2).`);
                  localStorage.setItem('terminal_id', 'T4');
                  localStorage.setItem('REGISTER_PREFIX', 'T4');
                  window.dispatchEvent(new CustomEvent('terminal-switched', { detail: { terminalId: 'T4' } }));
                }
              }
            }
          })
          .catch(() => { });
      }
    };

    sendAutonomousHeartbeat();
    syncClockWithMasterServer().catch(() => { });
    const interval = setInterval(sendAutonomousHeartbeat, 15000);
    const clockSyncInterval = setInterval(() => {
      syncClockWithMasterServer().catch(() => { });
    }, 60000);

    const handleTerminalSwitched = () => {
      sendAutonomousHeartbeat();
    };
    window.addEventListener('terminal-switched', handleTerminalSwitched);

    return () => {
      clearInterval(interval);
      clearInterval(clockSyncInterval);
      window.removeEventListener('terminal-switched', handleTerminalSwitched);
    };
  }, [apiBase, isF100Device, f100Mode]);

  useEffect(() => {
    const handleMasterWsMessage = (e: any) => {
      const data = e?.detail;
      if (!data) return;
      if (data.type === 'KHATA_EDIT_LOCK' || data.type === 'LOCK_STATE_SYNC') {
        setActiveLock(data.payload);
      } else if (data.type === 'KHATA_EDIT_RELEASE') {
        setActiveLock(null);
      } else if (data.type === 'MANAGER_CARD_SCAN_START') {
        setManagerScanLocked(true);
        setManagerScanMessage(data.payload?.message || '');
      } else if (data.type === 'MANAGER_CARD_SCAN_COMPLETE' || data.type === 'MANAGER_CARD_SCAN_CANCEL') {
        setManagerScanLocked(false);
        setManagerScanMessage('');
      }
    };
    window.addEventListener('master-ws-message', handleMasterWsMessage);
    return () => window.removeEventListener('master-ws-message', handleMasterWsMessage);
  }, []);

  useEffect(() => {
    const handleNfcBroadcast = (e: any) => {
      // Guard against echoed / relayed events to prevent infinite loop
      if (e?.detail?.isRelayed || e?.detail?.fromRelay) return;
      // Guard: Only native Android POS devices with physical RF transceivers should broadcast scans
      const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
      if (!isNative) return;

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
        // Prevent duplicate printing from concurrent WebSocket push and HTTP polling fallback
        const dedupKey = payload.jobId || payload.invoiceNo || (payload.items?.[0]?.name + '_' + payload.total);
        const now = Date.now();
        if (dedupKey && processedPrintJobsRef.current.has(dedupKey)) {
          const lastPrinted = processedPrintJobsRef.current.get(dedupKey) || 0;
          if (now - lastPrinted < 25000) {
            console.log('🖨️ [Sunmi Print Station] Skipping duplicate print job:', dedupKey);
            return;
          }
        }
        if (dedupKey) {
          processedPrintJobsRef.current.set(dedupKey, now);
        }

        console.log('🖨️ [Sunmi Print Station] Printing receipt for invoice:', payload.invoiceNo);
        showToast('🖨️ Printing: ' + (payload.invoiceNo || 'Receipt'));
        printNativeSunmiReceipt(payload)
          .then((printed) => {
            if (printed && (payload.paymentMode === 'CASH' || payload.paymentMethod === 'CASH')) {
              openCashDrawer(payload.changeDue || 0).catch(() => { });
            }
          })
          .catch((err) => console.warn('Remote print error:', err));

        // Acknowledge print completion to central server
        if (payload.jobId) {
          const candidateBases = [apiBase, DEFAULT_EDGE_API_URL].filter(
            (v, i, a): v is string => Boolean(v) && a.indexOf(v) === i
          );
          for (const base of candidateBases) {
            fetch(`${base}/api/print/complete`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobId: payload.jobId })
            }).catch(() => { });
          }
        }
      }
    };

    const handleRemotePrintStatement = (e: any) => {
      const payload = e?.detail;
      if (payload) {
        printKhataStatement(payload).catch((err) => console.warn('Remote statement print error:', err));
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

    const handleRemoteDrawerKick = (e: any) => {
      console.log('⚡ [App] Remote Cash Drawer Kick received across network:', e?.detail);
      openCashDrawer(e?.detail?.saleTotal).catch((err) => console.warn('App drawer kick error:', err));
    };

    window.addEventListener('sunmi-nfc-broadcast', handleNfcBroadcast);
    window.addEventListener('sunmi-nfc-scan', handleNfcBroadcast);
    window.addEventListener('sunmi-cart-broadcast', handleCartBroadcast);
    window.addEventListener('sunmi-remote-print', handleRemotePrint);
    window.addEventListener('sunmi-remote-print-statement', handleRemotePrintStatement);
    window.addEventListener('sunmi-nfc-assigned', handleNfcAssigned);
    window.addEventListener('sunmi-remote-lock', handleRemoteLock);
    window.addEventListener('sunmi-remote-drawer-kick', handleRemoteDrawerKick);

    return () => {
      window.removeEventListener('sunmi-nfc-broadcast', handleNfcBroadcast);
      window.removeEventListener('sunmi-nfc-scan', handleNfcBroadcast);
      window.removeEventListener('sunmi-cart-broadcast', handleCartBroadcast);
      window.removeEventListener('sunmi-remote-print', handleRemotePrint);
      window.removeEventListener('sunmi-remote-print-statement', handleRemotePrintStatement);
      window.removeEventListener('sunmi-nfc-assigned', handleNfcAssigned);
      window.removeEventListener('sunmi-remote-lock', handleRemoteLock);
      window.removeEventListener('sunmi-remote-drawer-kick', handleRemoteDrawerKick);
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
  const handleLogin = (role: 'CASHIER' | 'MANAGER', employee?: { id: string; name: string; pin?: string }) => {
    setUserRole(role);
    localStorage.setItem('askar_role', role);
    if (role === 'MANAGER' && employee?.pin) {
      setManagerSessionPin(employee.pin);
    }
    if (employee) {
      localStorage.setItem('active_employee_id', employee.id);
      localStorage.setItem('active_shift_cashier', employee.name);
    }
  };

  const handleLockTerminal = () => {
    setUserRole('NONE');
    setActiveShiftId(null);
    clearManagerSessionPin();
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

  // --- VIEW 0D: IPHONE 16 PRO MOBILE TAP PAD & RELAY STATION (/tap) ---
  if (isTapPadRoute) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-900 text-white flex items-center justify-center font-bold">Loading Tap Pad...</div>}>
        {renderGlobalNotifBanner()}
        <MobileTapPad />
      </Suspense>
    );
  }

  // --- VIEW 0E: DAILY FRESH PRODUCE & VEGGIE COMMANDER (/produce, /veggies, /price-change) ---
  if (isPriceChangeRoute) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-900 text-white flex items-center justify-center font-bold">Loading Price Commander...</div>}>
        {renderGlobalNotifBanner()}
        <ProducePriceCommander apiBase={apiBase} initialMode="60s" />
      </Suspense>
    );
  }
  if (isProduceRoute) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-900 text-white flex items-center justify-center font-bold">Loading Produce Commander...</div>}>
        {renderGlobalNotifBanner()}
        <ProducePriceCommander apiBase={apiBase} initialMode="catalog" />
      </Suspense>
    );
  }

  // --- VIEW 0C: FEITIAN F100 TERMINAL 02 (PIM vs MOBILE KHATA POS) ---
  if (isF100Device) {
    if (f100Mode === 'pim') {
      return (
        <Suspense fallback={<div className="min-h-screen bg-slate-900 text-white flex items-center justify-center font-bold">Loading F100 PIM...</div>}>
          {renderGlobalNotifBanner()}
          <F100Pim
            onSwitchToPos={() => {
              setF100Mode('pos');
              try { localStorage.setItem('f100_active_mode', 'pos'); } catch { }
            }}
          />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-900 text-white flex items-center justify-center font-bold">Loading Khata POS...</div>}>
        {renderGlobalNotifBanner()}
        <MobileKhataScreen
          onSwitchToPim={() => {
            setF100Mode('pim');
            try { localStorage.setItem('f100_active_mode', 'pim'); } catch { }
          }}
        />
      </Suspense>
    );
  }

  if (isCustomerDisplayRoute) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-900 text-white flex items-center justify-center font-bold">Loading Display...</div>}>
        <div className="w-full h-full min-h-screen bg-slate-900 overflow-hidden flex flex-col">
          <CustomerDisplayPage />
        </div>
      </Suspense>
    );
  }

  // --- VIEW 0: INTERACTIVE CUSTOMER KHATA & FINANCIAL PORTAL ---
  if (isStatementRoute) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-900 text-white flex items-center justify-center font-bold">Loading Khata...</div>}>
        {renderGlobalNotifBanner()}
        <CustomerStatementPage customerId={statementCustomerId} apiBase={apiBase} />
      </Suspense>
    );
  }

  // --- VIEW 0B: CORPORATE SPONSOR B2B FLEET DASHBOARD (/sponsor) ---
  if (isSponsorRoute) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-900 text-white flex items-center justify-center font-bold">Loading B2B Portal...</div>}>
        {renderGlobalNotifBanner()}
        <CorporateSponsorDashboard apiBase={apiBase} />
      </Suspense>
    );
  }

  // --- VIEW 3: THE ASKAR BACK-OFFICE MANAGER SUITE (When explicitly accessing manager port / route) ---
  if (isManagerPort) {
    const dashboardUrl = `http://${typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'localhost'}:5177`;
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-8 text-center select-none">
        <div className="w-20 h-20 rounded-3xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center mb-6 text-3xl font-black">
          👔
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">Manager Command Center</h1>
        <p className="text-slate-400 max-w-md mb-8 text-sm leading-relaxed">
          The back-office management suite has been migrated to the Master Laptop for maximum register performance and hardware security.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={dashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/30 text-sm"
          >
            Open Laptop Back-Office (Port 5177) ↗
          </a>
          <button
            type="button"
            onClick={() => handleLogin('CASHIER')}
            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all text-sm cursor-pointer"
          >
            ← Back to Cashier Register
          </button>
        </div>
      </div>
    );
  }

  const renderManagerScanOverlay = () => {
    if (!managerScanLocked) return null;
    return (
      <div className="fixed inset-0 z-[999999] bg-slate-950/92 flex flex-col items-center justify-center p-6 text-white text-center">
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
        {renderGlobalNotifBanner()}
        {renderManagerScanOverlay()}
        <LoginScreen onLogin={handleLogin} apiBase={apiBase} />
      </>
    );
  }

  // --- VIEW 2: THE POS REGISTER ENVIRONMENT (Cashier or Store Manager) ---
  if (userRole === 'CASHIER' || userRole === 'MANAGER') {
    return (
      <div className="h-screen w-full relative bg-slate-900 overflow-hidden">
        {renderGlobalNotifBanner()}
        {renderManagerScanOverlay()}
        {activeLock && (
          <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9999] bg-amber-600 text-white px-4 py-2 rounded-xl shadow-2xl flex items-center gap-2 border border-amber-400 font-bold text-xs">
            <span className="w-2 h-2 rounded-full bg-white" />
            <span>Khata Customer [{activeLock.customerName || activeLock.customerId}] locked by Back-Office Laptop.</span>
          </div>
        )}
        {!activeShiftId ? (
          <StartShiftModal
            cashierName={typeof window !== 'undefined' ? (localStorage.getItem('active_shift_cashier') || (userRole === 'MANAGER' ? 'Store Manager' : 'Cashier 1')) : 'Cashier 1'}
            employeeId={typeof window !== 'undefined' ? (localStorage.getItem('active_employee_id') || (userRole === 'MANAGER' ? 'emp_manager_1' : 'emp_cashier_1')) : 'emp_cashier_1'}
            apiBase={apiBase}
            onShiftStart={handleShiftStart}
            onCancel={handleLockTerminal}
          />
        ) : (
          <CheckoutScreen
            isCashierTrapped={userRole === 'CASHIER'}
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