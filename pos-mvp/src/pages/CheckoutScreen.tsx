import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Search, Plus, PlusCircle, Trash2, Wifi, HardDrive, RefreshCw, ScanLine, ShoppingCart, UserPlus, Lock, Unlock, Truck, Receipt, Banknote, FileText, Printer, X, Tag, RotateCcw, Coins, Settings, CreditCard, TrendingUp, Radio, Users, Monitor, Smartphone, Laptop, ChevronDown, Maximize2 } from 'lucide-react';
import { printFullReceipt, printKhataStatement, printRefundReceipt } from '../utils/printer';
import { openCashDrawer, kickCashDrawer } from '../services/cashDrawerService';
import { processSecureRefund } from '../services/salesService';
import { playThankYouVoice } from '../utils/sound';
import { parseScaleBarcode, findProductByPLU } from '../utils/scaleBarcodeParser';
import { CustomerDisplay } from '../plugins/CustomerDisplay';
import { getManagerPin } from '../utils/authUtils';
// --- LAZY-LOADED BACK-OFFICE PAGES (never parsed on Sunmi in cashier mode) ---
const StockManagement = lazy(() => import('./StockManagement'));
const FinancialDashboard = lazy(() => import('./FinancialDashboard'));
const MasterReport = lazy(() => import('./MasterReport'));
const NfcManager = lazy(() => import('../components/NfcManager'));
import KhataHubModal from '../components/KhataHubModal';
import ZReportModal from '../components/ZReportModal';
import BlindCloseShiftModal from '../components/BlindCloseShiftModal';
import CashOutModal from '../components/CashOutModal';
import AddProductModal from '../components/AddProductModal';
import PosAddProductModal from '../components/PosAddProductModal';
import RefundModal from '../components/RefundModal';
import PaymentModal from '../components/PaymentModal';
import { QuickProductEditModal } from '../components/QuickProductEditModal';
import { AddQuickProductModal } from '../components/AddQuickProductModal';
import { EditQuickTabsModal, QuickCategory, DEFAULT_CATEGORIES } from '../components/EditQuickTabsModal';
import ReceivingDrawer from '../components/ReceivingDrawer';
import OrderHistoryDrawer from '../components/OrderHistoryDrawer';
import { PreviousBillsModal } from '../components/PreviousBillsModal';
import { saveRecentSale, getLastSale } from '../services/recentSalesService';
import PredictiveOmniPad, { DEFAULT_OMNI_ITEMS, OmniItem } from '../components/PredictiveOmniPad';
import CartTable from '../components/CartTable';
import F12SearchOverlay from '../components/F12SearchOverlay';
import DeveloperDiagnosticsModal from '../components/DeveloperDiagnosticsModal';
import CustomerEnrollmentModal from '../components/CustomerEnrollmentModal';
import ProductBarcodeModal from '../components/ProductBarcodeModal';
import ServerConfigModal from '../components/ServerConfigModal';
import { getApiBaseUrl, getServerIp, DEFAULT_EDGE_API_URL, CLOUD_GATEWAY_URL, LAN_SERVER_URL } from '../utils/apiConfig';
import HardCreditLimitModal from '../components/HardCreditLimitModal';
import TapToEditDiscountModal from '../components/TapToEditDiscountModal';
import BenefitPayConfigModal from '../components/BenefitPayConfigModal';
import PrinterStyleConfigModal from '../components/PrinterStyleConfigModal';
import { generateBenefitPayPayload, getStoredBenefitPayConfig } from '../utils/benefitPay';
import { Product, Customer, CartTab } from '../types/pos';
export type { Product, Customer, CartTab };
import { useCartStore, calculateCartTotals, type CartItem } from '../store/cartStore';
import { useNfcReader } from '../hooks/useNfcReader';
import { useNetworkSync } from '../hooks/useNetworkSync';
import { useCheckoutProcessor } from '../hooks/useCheckoutProcessor';
import { QuickProductGrid } from '../components/QuickProductGrid';
import { db } from '../db.ts';
import { mapDbRowToProduct } from '../services/productMapper';
import { reindexCatalog } from '../services/localDb';
import { useDisasterRecovery } from '../hooks/useDisasterRecovery';
import SyncTrafficLight from '../components/SyncTrafficLight';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { saveSaleOffline } from '../utils/nativeDb';
import { generateCompliantInvoiceNumber, generateNextInvoiceNumber } from '../utils/nbrInvoice';

const DEFAULT_PRODUCTS: Product[] = [
  { id: '1', name: 'Arabian Perfume', price: 25.500, unitCost: 15.0, barcode: '1', vatRate: 10, isScaleItem: false, stockQuantity: 99999 },
  { id: '2', name: 'Smart Watch', price: 45.000, unitCost: 30.0, barcode: '2', vatRate: 10, isScaleItem: false, stockQuantity: 99999 },
  { id: '3', name: 'Wireless Earbuds', price: 15.000, unitCost: 8.0, barcode: '3', vatRate: 10, isScaleItem: false, stockQuantity: 99999 },
  { id: '4', name: 'USB-C Cable', price: 3.500, unitCost: 1.5, barcode: '4', vatRate: 10, isScaleItem: false, stockQuantity: 99999 },
  { id: '101', name: 'Fresh Australian Mutton / Lamb', price: 3.800, unitCost: 2.5, barcode: '00101', vatRate: 0, isScaleItem: false, stockQuantity: 99999 },
  { id: '102', name: 'Fresh Local Beef Cubes', price: 3.200, unitCost: 2.0, barcode: '00102', vatRate: 0, isScaleItem: false, stockQuantity: 99999 },
  { id: '103', name: 'Turkish White Feta Cheese', price: 2.400, unitCost: 1.5, barcode: '00103', vatRate: 0, isScaleItem: false, stockQuantity: 99999 },
  { id: '104', name: 'Almarai Fresh Milk 2L', price: 1.100, unitCost: 0.850, barcode: '00104', vatRate: 0, isScaleItem: false, stockQuantity: 99999 },
  { id: '105', name: 'White Sliced Bread', price: 0.400, unitCost: 0.250, barcode: '00105', vatRate: 0, isScaleItem: false, stockQuantity: 99999 },
  { id: '107', name: 'Loose Red Tomatoes 1kg', price: 0.350, unitCost: 0.200, barcode: '00107', vatRate: 0, isScaleItem: true, stockQuantity: 99999 },
  { id: '110', name: 'Red Onions 1kg', price: 0.250, unitCost: 0.150, barcode: '00110', vatRate: 0, isScaleItem: true, stockQuantity: 99999 },
];

export interface CheckoutScreenProps {
  isCashierTrapped?: boolean;
  onLockTerminal?: () => void;
  shiftId?: string | null;
  disasterRecovery?: {
    syncStatus: any;
    lastSyncTime: any;
    offlineHours: any;
    isExporting: any;
    performSync: any;
    exportDatabaseBackup: any;
  };
}

export default function CheckoutScreen({ isCashierTrapped: _isCashierTrapped = false, onLockTerminal, shiftId, disasterRecovery }: CheckoutScreenProps) {
  const [viewMode, setViewMode] = useState<'pos' | 'dashboard' | 'stock' | 'pnl' | 'master'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'dashboard') return 'dashboard';
      if (params.get('view') === 'stock' || params.get('view') === 'logistics') return 'stock';
      if (params.get('view') === 'pnl' || params.get('view') === 'financials') return 'pnl';
      if (params.get('view') === 'master' || params.get('view') === 'report' || params.get('view') === 'command') return 'master';
    }
    return 'pos';
  });
  const [emergencyUnlocked, setEmergencyUnlocked] = useState(false);
  const [emergencyPinInput, setEmergencyPinInput] = useState('');
  const [emergencyPinError, setEmergencyPinError] = useState(false);

  // Dynamic Multi-Terminal Fleet Switcher (T1 Sunmi, T2 F100, T3 Desktop 1, T4 Desktop 2, M1/M2 Mobile Phones)
  const [currentTerminal, setCurrentTerminal] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const tid = localStorage.getItem('terminal_id');
      if (tid === 'T1' || tid === 'T2' || tid === 'T3' || tid === 'T4' || tid === 'M1' || tid === 'M2') return tid;
      if (tid === 'LAPTOP-01' || tid === 'WEB-POS') return 'T3';
      if (tid === 'LAPTOP-02' || tid === 'WEB-POS-2' || tid === '4') return 'T4';
      if (tid === 'PHONE-01' || tid === 'MOBILE-01') return 'M1';
      if (tid === 'PHONE-02' || tid === 'MOBILE-02') return 'M2';
      const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
      const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
      return isMobile && !isNative ? 'M1' : (!isMobile && !isNative) ? 'T3' : 'T1';
    }
    return 'T3';
  });
  const [showTerminalMenu, setShowTerminalMenu] = useState(false);

  const handleSwitchTerminal = (targetId: 'T1' | 'T2' | 'T3' | 'T4' | 'M1' | 'M2') => {
    localStorage.setItem('terminal_id', targetId);
    localStorage.setItem('REGISTER_PREFIX', targetId);
    setCurrentTerminal(targetId);
    setShowTerminalMenu(false);
    window.dispatchEvent(new CustomEvent('terminal-switched', { detail: { terminalId: targetId } }));
    window.dispatchEvent(new CustomEvent('sunmi-cart-broadcast', {
      detail: { cart, total, customer, activeCartId, terminalId: targetId }
    }));
    const label = targetId === 'T1' ? 'Counter 1 (Sunmi D2 Mini)' :
      targetId === 'T2' ? 'Counter 2 (Feitian F100)' :
        targetId === 'T3' ? 'Counter 3 (Desktop Web POS 1)' :
          targetId === 'T4' ? 'Counter 4 (Desktop Web POS 2)' :
            targetId === 'M1' ? 'Floor Phone 1 (Mobile Web POS)' :
              'Floor Phone 2 (Mobile Web POS)';
    showToast(`⚡ Active Register set to: ${label}`, 'info');
  };

  useEffect(() => {
    const onSwitched = (e: any) => {
      if (e?.detail?.terminalId) {
        setCurrentTerminal(e.detail.terminalId);
      }
    };
    window.addEventListener('terminal-switched', onSwitched);
    return () => window.removeEventListener('terminal-switched', onSwitched);
  }, []);

  const [catalog, setCatalog] = useState<Product[]>(DEFAULT_PRODUCTS);

  // 🛒 Decoupled Global Zustand Cart Store via useCheckoutProcessor
  const {
    cart,
    carts,
    activeCartId,
    activeCart,
    cartTotals,
    clearCart: storeClearCart,
    addNewTab: storeAddNewTab,
    closeTab: storeCloseTab,
    setActiveCartId
  } = useCheckoutProcessor();

  // Tab Management Functions bound to global store
  const addNewTab = () => {
    if (carts.length >= 4) {
      showToast("⚠️ Maximum 4 parked carts allowed.", "info");
      return;
    }
    storeAddNewTab();
  };

  const closeTab = (idToClose: string, e?: React.MouseEvent) => {
    e?.stopPropagation(); // Prevent clicking tab underneath X
    storeCloseTab(idToClose);
    if (carts.length <= 1) {
      setCustomer(null);
    }
  };

  const clearActiveCart = () => {
    storeClearCart();
    setCustomer(null);
  };
  const [apiBase, setApiBase] = useState<string>(() => {
    return getApiBaseUrl();
  });

  // Resolve working API base across candidates
  const resolveApiBase = useCallback(async (): Promise<string | null> => {
    const configuredTarget = getApiBaseUrl();
    const candidates = [
      configuredTarget,
      CLOUD_GATEWAY_URL,
      DEFAULT_EDGE_API_URL,
      LAN_SERVER_URL
    ].filter((val, idx, arr): val is string => Boolean(val) && arr.indexOf(val) === idx);

    for (const url of candidates) {
      try {
        const res = await fetch(`${url}/api/products`, { signal: AbortSignal.timeout(2500) });
        if (res.ok) { setApiBase(url); return url; }
      } catch { }
      try {
        const res = await fetch(`${url}/products`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) { setApiBase(url); return url; }
      } catch { }
    }
    return configuredTarget;
  }, [apiBase]);

  // Disaster Recovery Protocol: Traffic Light & Physical Backup
  // If parent App passed disasterRecovery, disable inner hook to eliminate duplicate listeners & CPU churn
  const innerDr = useDisasterRecovery(apiBase, !disasterRecovery);
  const {
    syncStatus,
    lastSyncTime,
    offlineHours,
    isExporting,
    performSync,
    exportDatabaseBackup,
  } = disasterRecovery || innerDr;

  const {
    pendingCount: offlinePendingCount,
    isDraining: isDrainingOfflineSales,
    drainQueue: drainOfflineQueue,
    updatePendingCount: updateOfflinePendingCount,
  } = useOfflineSync(apiBase);

  // Master Back-Office Server Configuration State
  const [showServerConfigModal, setShowServerConfigModal] = useState(false);
  // BenefitPay Owner Account Configuration State
  const [showBenefitPayConfigModal, setShowBenefitPayConfigModal] = useState(false);
  const [showPrinterStyleModal, setShowPrinterStyleModal] = useState(false);
  const [offlineBannerDismissed, setOfflineBannerDismissed] = useState(false);

  // Active Linked Customer for Checkout
  const [customer, setCustomer] = useState<Customer | null>(null);

  // Customer Management & Enrollment State
  const [showCustomersModal, setShowCustomersModal] = useState(false);
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [bindingCustomerId, setBindingCustomerId] = useState<string | null>(null);
  const [newCustCardUid, setNewCustCardUid] = useState('');

  // Hardware Barcode Scanner State
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null);

  // Barcode Assigner & Product Management State
  const [showProductsModal, setShowProductsModal] = useState(false);
  const [bindingProductId, setBindingProductId] = useState<string | null>(null);
  const [unassignedBarcode, setUnassignedBarcode] = useState<string | null>(null);
  const [manualBarcodeAssignInput, setManualBarcodeAssignInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isReturnMode, setIsReturnMode] = useState(false);
  const [showKhataHub, setShowKhataHub] = useState(false);
  const [showNfcManager, setShowNfcManager] = useState(false);
  const [showMessModal, setShowMessModal] = useState(false);
  const [showZReportModal, setShowZReportModal] = useState(false);
  const [showBlindCloseModal, setShowBlindCloseModal] = useState(false);
  const [showCashOutModal, setShowCashOutModal] = useState(false);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [showReceivingDrawer, setShowReceivingDrawer] = useState(false);
  const [showOrderHistoryDrawer, setShowOrderHistoryDrawer] = useState(false);
  const [showPreviousBillsModal, setShowPreviousBillsModal] = useState(false);
  const [showMoreActionsMenu, setShowMoreActionsMenu] = useState(false);
  const [showNumpad, setShowNumpad] = useState(false);
  const [changeFlashNotice, setChangeFlashNotice] = useState<{ changeDue: number; tendered: number } | null>(null);
  const [lastCompletedSale, setLastCompletedSale] = useState<{
    invoiceNo: string;
    items: CartItem[];
    subtotal: number;
    totalVat: number;
    total: number;
    paymentMode: string;
    cashTendered?: number;
    changeDue?: number;
    date: string;
    cashierName: string;
    customerName?: string;
  } | null>(() => {
    const last = getLastSale();
    if (!last) return null;
    return {
      invoiceNo: last.invoiceNo,
      items: (last.items || []) as any,
      subtotal: last.subtotal,
      totalVat: last.vat,
      total: last.total,
      paymentMode: last.paymentMode,
      cashTendered: last.cashTendered,
      changeDue: last.changeDue,
      date: last.timestamp,
      cashierName: last.cashierName || 'Register 01',
      customerName: last.customerName
    };
  });
  const changeFlashTimeoutRef = useRef<any>(null);
  const receivingScanCallbackRef = useRef<((barcode: string) => boolean) | null>(null);
  const handleRegisterReceivingScanListener = useCallback((cb: ((barcode: string) => boolean) | null) => {
    receivingScanCallbackRef.current = cb;
  }, []);

  // In-app non-blocking toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 3500);
  }, []);

  // Selective receipt printing preference (default: false / selective on-demand)
  const [isAutoPrintEnabled, setIsAutoPrintEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('pos_auto_print_receipt');
      if (saved !== null) return JSON.parse(saved);
    } catch { }
    return false; // Default: selective printing (off)
  });

  // Thermal paper roll format preference: '58mm' (compact) vs '80mm' (standard desktop POS)
  const [receiptFormat, setReceiptFormat] = useState<'58mm' | '80mm'>(() => {
    try {
      const saved = localStorage.getItem('pos_receipt_format');
      if (saved === '80mm') return '80mm';
    } catch { }
    return '58mm';
  });

  const toggleAutoPrint = useCallback(() => {
    setIsAutoPrintEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('pos_auto_print_receipt', JSON.stringify(next));
      showToast(
        next
          ? '🖨️ Auto-Receipt Print: ON (Every sale will print)'
          : '🖨️ Auto-Receipt Print: OFF (Selective mode - print on demand)',
        'info'
      );
      return next;
    });
  }, [showToast]);

  const handleReprintLastReceipt = useCallback(async () => {
    const saleToPrint = lastCompletedSale || getLastSale();
    if (!saleToPrint) {
      showToast('⚠️ No completed sale to print', 'info');
      return;
    }
    try {
      showToast(`🖨️ Printing Receipt #${saleToPrint.invoiceNo}...`, 'info');
      await printFullReceipt({
        invoiceNo: saleToPrint.invoiceNo,
        items: (saleToPrint.items || []).map((it: any) => ({
          name: it.name,
          nameAr: it.nameAr || it.name_ar,
          qty: it.qty ?? it.quantity ?? 1,
          price: it.price ?? it.sellingPrice ?? 0,
          vatRate: it.vatRate,
          is_weighed_item: it.is_weighed_item || it.isScaleItem,
          scaleWeight: it.scaleWeight
        })),
        subtotal: saleToPrint.subtotal,
        vat: (saleToPrint as any).totalVat ?? (saleToPrint as any).vat ?? 0,
        total: saleToPrint.total,
        paymentMode: saleToPrint.paymentMode,
        cashTendered: saleToPrint.cashTendered,
        changeDue: saleToPrint.changeDue,
        customerName: (saleToPrint as any).customerName,
        customerCardUid: (saleToPrint as any).customerCardUid || (saleToPrint as any).cardUid,
        previousBalance: (saleToPrint as any).previousBalance,
        newBalance: (saleToPrint as any).newBalance,
        cashierName: saleToPrint.cashierName || 'Register 01',
        isReprint: true // 🏷️ NBR Duplicate Watermark
      });
      showToast(`✅ Receipt #${saleToPrint.invoiceNo} Printed`, 'success');
    } catch (e) {
      console.error('Failed to print last receipt:', e);
      showToast('❌ Failed to print receipt', 'error');
    }
  }, [lastCompletedSale, showToast]);

  // Quick Products State & Dynamic Fetching
  const normalizeCategories = (rawCats: any[]): QuickCategory[] => {
    if (!Array.isArray(rawCats) || rawCats.length === 0) return DEFAULT_CATEGORIES;
    return rawCats.map((c) => {
      if (typeof c === 'string') {
        const id = c.trim().toUpperCase();
        const matched = DEFAULT_CATEGORIES.find((dc) => dc.id === id);
        return matched || { id, label: id === 'ALL' ? 'All Items' : (c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()), color: 'slate' };
      }
      if (c && typeof c === 'object') {
        const id = String(c.id || c.name || c.category || 'ESSENTIALS').trim().toUpperCase();
        const label = String(c.label || c.name || id);
        return { id, label, color: c.color || 'slate' };
      }
      return { id: 'ESSENTIALS', label: 'Essentials', color: 'slate' };
    });
  };

  const [quickProducts, setQuickProducts] = useState<any[]>([]);
  const [selectedQuickCategory, setSelectedQuickCategory] = useState<string>('ALL');
  const [quickCategories, setQuickCategories] = useState<QuickCategory[]>(() => {
    try {
      const saved = localStorage.getItem('pos_quick_categories');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return normalizeCategories(parsed);
      }
    } catch (e) {
      console.warn('Failed to parse cached quick categories', e);
    }
    return DEFAULT_CATEGORIES;
  });
  const [showEditTabsModal, setShowEditTabsModal] = useState(false);

  // Gated Edit Mode State (Prevents accidental edits during fast checkout)
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingQuickProduct, setEditingQuickProduct] = useState<Product | null>(null);
  const [showAddQuickModal, setShowAddQuickModal] = useState(false);

  // 5. Tap-to-Edit Price & Line-Item Discount Modal State (Sunmi UX Rule 5)
  const [priceOverrideItem, setPriceOverrideItem] = useState<{
    index: number;
    product: Product;
  } | null>(null);

  // Hard Credit Limit POS Blocking State (Idea 2)
  const [creditLimitBlockedInfo, setCreditLimitBlockedInfo] = useState<{
    customer: Customer;
    currentBalance: number;
    saleAmount: number;
    projectedBalance: number;
    creditLimit: number;
    exceededBy: number;
  } | null>(null);

  const handleAuthorizeCreditOverride = async (pin: string): Promise<boolean> => {
    const managerPin = getManagerPin();
    if (pin.trim() !== managerPin) {
      return false;
    }
    const info = creditLimitBlockedInfo;
    setCreditLimitBlockedInfo(null);
    if (info) {
      showToast(`🔓 Manager Override Authorized for ${info.customer.name}`, 'success');
      await processCheckout('CREDIT', true);
    }
    return true;
  };

  // Weighed Produce Item Manual Numpad Modal State (Sunmi D2 Mini)
  const [selectedWeighedItem, setSelectedWeighedItem] = useState<Product | null>(null);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [showFreshProduceGrid, setShowFreshProduceGrid] = useState(false);
  const [showPluModal, setShowPluModal] = useState(false);
  const [showOmniPadModal, setShowOmniPadModal] = useState(false);
  const [rightPaneMode, setRightPaneMode] = useState<'GRID' | 'OMNIPAD'>('GRID');

  // Dynamic Sovereign Produce Items (100% in sync with PIM, Daily Produce & Veggies, and 60-Sec Price Commander)
  const [produceItems, setProduceItems] = useState<OmniItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('askar_produce_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch { }
    }
    return [];
  });

  // Helper: Determine rich emoji icon for produce, grains, and meats
  const getProduceIcon = (name: string): string => {
    const lower = (name || '').toLowerCase();
    if (lower.includes('tomato')) return '🍅';
    if (lower.includes('cucumber') || lower.includes('cucab')) return '🥒';
    if (lower.includes('chicken') || lower.includes('poultry')) return '🍗';
    if (lower.includes('potato')) return '🥔';
    if (lower.includes('onion')) return '🧅';
    if (lower.includes('banana')) return '🍌';
    if (lower.includes('apple')) return '🍎';
    if (lower.includes('orange')) return '🍊';
    if (lower.includes('carrot') || lower.includes('carat')) return '🥕';
    if (lower.includes('lemon') || lower.includes('iemon')) return '🍋';
    if (lower.includes('chilly') || lower.includes('chilli') || lower.includes('pepper')) return '🌶️';
    if (lower.includes('ginger') || lower.includes('ginjar')) return '🧄';
    if (lower.includes('garlic')) return '🧄';
    if (lower.includes('eggplant') || lower.includes('baigan')) return '🍆';
    if (lower.includes('cabbage') || lower.includes('cabaj') || lower.includes('lettuce')) return '🥬';
    if (lower.includes('flower') || lower.includes('cauli') || lower.includes('broccoli')) return '🥦';
    if (lower.includes('ladyfinger') || lower.includes('ladey') || lower.includes('okra') || lower.includes('bhindi')) return '🫛';
    if (lower.includes('kerala') || lower.includes('karela')) return '🥒';
    if (lower.includes('moringa') || lower.includes('muriga') || lower.includes('stick')) return '🌿';
    if (lower.includes('mutton') || lower.includes('meat') || lower.includes('beef') || lower.includes('lamb')) return '🥩';
    if (lower.includes('fish') || lower.includes('seafood') || lower.includes('prawn')) return '🐟';
    if (lower.includes('rice') || lower.includes('biryani') || lower.includes('matta')) return '🍚';
    if (lower.includes('atta') || lower.includes('flour') || lower.includes('sudi') || lower.includes('grain')) return '🌾';
    if (lower.includes('dal') || lower.includes('chena') || lower.includes('rajma') || lower.includes('lentil') || lower.includes('beans')) return '🫘';
    if (lower.includes('sweet') || lower.includes('halwa') || lower.includes('mithai')) return '🍬';
    if (lower.includes('papaya')) return '🥭';
    if (lower.includes('grape')) return '🍇';
    if (lower.includes('melon') || lower.includes('water')) return '🍉';
    return '⚖️';
  };

  // Fetch only weighed produce scale items from PIM (single source of truth with Daily Produce & 60s Price Change)
  const fetchProduceItems = useCallback(async () => {
    const url = await resolveApiBase();
    const candidateUrls = [
      url,
      DEFAULT_EDGE_API_URL,
      CLOUD_GATEWAY_URL,
      'http://localhost:3000'
    ].filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i);

    for (const base of candidateUrls) {
      try {
        const res = await fetch(`${base}/api/products/produce?t=${Date.now()}`, {
          signal: AbortSignal.timeout(3000)
        });
        if (res.ok) {
          const data = await res.json();
          const rawItems = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
          if (rawItems.length > 0) {
            // Strictly weighed produce items with is_weighed_item = 1
            const weighedOnly = rawItems.filter(
              (p: any) => p && (p.is_weighed_item === 1 || p.is_weighed_item === true || p.is_weighed_item === '1')
            );

            const mapped: OmniItem[] = weighedOnly.map((p: any) => {
              const explicitPlu = String(p.plu_code || p.pluCode || '').trim();
              const plu = explicitPlu || (p.barcode && /^\d{1,4}$/.test(p.barcode) ? p.barcode.trim() : '');
              return {
                code: plu,
                name: p.name,
                nameAr: p.name_ar || p.nameAr,
                pricePerKg: Number(p.sellingPrice || p.price || 0),
                icon: getProduceIcon(p.name),
                imageUrl: p.image_url || p.imageUrl || null,
                barcode: p.barcode,
                productId: p.id,
                category: p.category || 'PRODUCE',
                isPopular: ['10', '11', '12', '13', '14', '15', '18', '20', '22', '24', '26', '28', '32', '34', '35', '36', '38', '42', '45', '46', '77'].includes(plu)
              };
            });

            // Fallback unique short code only for produce items without explicit PLU
            const usedCodes = new Set<string>(mapped.map(m => m.code).filter(Boolean));
            let autoCode = 50;
            mapped.forEach(m => {
              if (!m.code) {
                while (usedCodes.has(String(autoCode))) {
                  autoCode++;
                }
                m.code = String(autoCode++);
                usedCodes.add(m.code);
              }
            });

            // Sort with PLU codes first
            mapped.sort((a, b) => {
              const numA = parseInt(a.code, 10) || 9999;
              const numB = parseInt(b.code, 10) || 9999;
              if (numA !== numB) return numA - numB;
              return a.name.localeCompare(b.name);
            });

            setProduceItems(mapped);
            try {
              localStorage.setItem('askar_produce_cache', JSON.stringify(mapped));
            } catch { }
            return;
          }
        }
      } catch { }
    }
  }, [resolveApiBase]);

  // Dynamic Omni-Pad Items (Strictly Synchronized with PIM & Daily Produce & Veggies)
  const omniItemsList = useMemo<OmniItem[]>(() => {
    // 1. Authoritative produce list from /api/products/produce (in sync with PIM & Daily Produce & Veggies)
    if (produceItems.length > 0) {
      return produceItems;
    }

    // 2. Strict fallback: Only products with explicit is_weighed_item === 1 (NEVER loose categories or regex)
    const weighedOnly = (catalog || []).filter(
      (p: any) => p && (p.is_weighed_item === 1 || p.is_weighed_item === true || p.is_weighed_item === '1')
    );

    if (weighedOnly.length === 0) {
      return DEFAULT_OMNI_ITEMS;
    }

    const mapped: OmniItem[] = weighedOnly.map((p: any) => {
      const explicitPlu = String(p.plu_code || p.pluCode || '').trim();
      const plu = explicitPlu || (p.barcode && /^\d{1,4}$/.test(p.barcode) ? p.barcode.trim() : '');
      return {
        code: plu,
        name: p.name,
        nameAr: p.name_ar || p.nameAr,
        pricePerKg: Number(p.sellingPrice || p.price || 0),
        icon: getProduceIcon(p.name),
        imageUrl: p.image_url || p.imageUrl || null,
        barcode: p.barcode,
        productId: p.id,
        category: p.category || 'PRODUCE',
        isPopular: ['10', '11', '12', '13', '14', '15', '18', '20', '22', '24', '26', '28', '32', '34', '35', '36', '38', '42', '45', '46', '77'].includes(plu)
      };
    });

    const usedCodes = new Set<string>(mapped.map(m => m.code).filter(Boolean));
    let autoCode = 50;
    mapped.forEach(m => {
      if (!m.code) {
        while (usedCodes.has(String(autoCode))) {
          autoCode++;
        }
        m.code = String(autoCode++);
        usedCodes.add(m.code);
      }
    });

    mapped.sort((a, b) => {
      const numA = parseInt(a.code, 10) || 9999;
      const numB = parseInt(b.code, 10) || 9999;
      if (numA !== numB) return numA - numB;
      return a.name.localeCompare(b.name);
    });

    return mapped;
  }, [produceItems, catalog]);

  const handleOmniAddToCart = (item: OmniItem, weight: number, totalAmt: number, keepOpen?: boolean) => {
    const matchedProduct = catalog.find((p: Product) =>
      (item.productId && p.id === item.productId) ||
      (item.barcode && p.barcode === item.barcode) ||
      p.barcode === item.code ||
      p.id === item.code ||
      p.name.toLowerCase() === item.name.toLowerCase()
    ) || {
      id: item.productId || item.barcode || 'omni_' + item.code,
      name: item.name,
      nameAr: item.nameAr,
      barcode: item.barcode || item.code,
      price: item.pricePerKg,
      unitCost: item.pricePerKg * 0.7,
      vatRate: 0,
      stockQuantity: 999,
      isScaleItem: true
    };

    const productToCart: Product = {
      ...matchedProduct,
      price: item.pricePerKg > 0 ? item.pricePerKg : matchedProduct.price,
      isScaleItem: true
    };

    addToCart(productToCart as Product, weight);
    showToast(`⚖️ ${item.name} (#${item.code}): ${weight.toFixed(3)} kg added (BD ${totalAmt.toFixed(3)})`, 'success');
    setSelectedWeighedItem(null);
    if (!keepOpen) {
      setShowOmniPadModal(false);
      setShowFreshProduceGrid(false);
      setShowPluModal(false);
      setIsWeightModalOpen(false);
    }
  };

  const handleItemSelection = (item: Product) => {
    // Unlimited Stock Mode: Stock check bypassed for high-speed Khata onboarding
    if (item.isScaleItem || (item as any).is_weighed_item) {
      // Intercept and open the Numpad Modal
      setSelectedWeighedItem(item);
      setIsWeightModalOpen(true);
    } else {
      // Standard 1-quantity addition
      const added = addToCart(item, 1);
      if (added) {
        showToast(`+1 ${item.name}`, 'info');
      }
    }
  };

  // Massive F12 Full Inventory Search Overlay State
  const [showF12SearchModal, setShowF12SearchModal] = useState(false);
  const [lastScannedProductId, setLastScannedProductId] = useState<string | null>(null);

  // Card-to-Card Position Reordering & Swap Mode State
  const [isPositionSwapActive, setIsPositionSwapActive] = useState(false);
  const [swapSourceProduct, setSwapSourceProduct] = useState<Product | null>(null);

  // Strictly respect the user's explicit quick products state (including empty array [])
  const activeQuickProducts = useMemo(() => {
    if (Array.isArray(quickProducts)) {
      return quickProducts;
    }
    return [];
  }, [quickProducts]);

  const displayedQuickProducts = useMemo(() => {
    if (selectedQuickCategory === 'ALL') return activeQuickProducts;
    return activeQuickProducts.filter((p) => (p.category || 'ESSENTIALS') === selectedQuickCategory);
  }, [activeQuickProducts, selectedQuickCategory]);

  // Helper to persist quick products to state and localStorage immediately (Local-First Guarantee)
  const updateQuickProductsLocally = useCallback((newItems: any[]) => {
    setQuickProducts(newItems);
    writeQuickCache(newItems);
  }, []);

  // 1. Swap Product with another catalog item in-place
  const handleSwapQuickProduct = useCallback((oldProduct: Product, newProduct: Product, newCategory?: string) => {
    const currentList = Array.isArray(activeQuickProducts) ? [...activeQuickProducts] : [];
    const oldIndex = currentList.findIndex((p) => p.id === oldProduct.id || (p.barcode && oldProduct.barcode && p.barcode === oldProduct.barcode));

    const targetCategory = newCategory || oldProduct.category || (selectedQuickCategory !== 'ALL' ? selectedQuickCategory : 'ESSENTIALS');
    const formattedNew: any = {
      ...newProduct,
      category: targetCategory,
      isQuickProduct: true,
    };

    if (oldIndex !== -1) {
      currentList[oldIndex] = formattedNew;
    } else {
      currentList.push(formattedNew);
    }

    updateQuickProductsLocally(currentList);
  }, [activeQuickProducts, selectedQuickCategory, updateQuickProductsLocally]);

  // 2. Change category/color of a quick product
  const handleUpdateQuickProductColor = useCallback((product: Product, newCategory: string) => {
    const currentList = Array.isArray(activeQuickProducts) ? [...activeQuickProducts] : [];
    const index = currentList.findIndex((p) => p.id === product.id || (p.barcode && product.barcode && p.barcode === product.barcode));

    if (index !== -1) {
      currentList[index] = {
        ...currentList[index],
        category: newCategory,
      };
      updateQuickProductsLocally(currentList);
    }
  }, [activeQuickProducts, updateQuickProductsLocally]);

  // 3. Remove quick product from grid
  const handleRemoveQuickProduct = useCallback((product: Product) => {
    const currentList = Array.isArray(activeQuickProducts) ? [...activeQuickProducts] : [];
    const updated = currentList.filter((p) => p.id !== product.id && (!product.barcode || p.barcode !== product.barcode));
    updateQuickProductsLocally(updated);
  }, [activeQuickProducts, updateQuickProductsLocally]);

  // 4. Add product to grid
  const handleAddQuickProduct = useCallback((product: Product, category: string) => {
    const currentList = Array.isArray(activeQuickProducts) ? [...activeQuickProducts] : [];
    const exists = currentList.some((p) => p.id === product.id || (p.barcode && product.barcode && p.barcode === product.barcode));
    if (!exists) {
      currentList.push({
        ...product,
        category: category || (selectedQuickCategory !== 'ALL' ? selectedQuickCategory : 'ESSENTIALS'),
        isQuickProduct: true,
      });
      updateQuickProductsLocally(currentList);
    }
  }, [activeQuickProducts, selectedQuickCategory, updateQuickProductsLocally]);

  // 5. Swap positions of two cards in the grid
  const handleSwapPosition = useCallback((sourceProduct: Product, targetProduct: Product) => {
    const currentList = Array.isArray(activeQuickProducts) ? [...activeQuickProducts] : [];
    const sourceIdx = currentList.findIndex((p) => p.id === sourceProduct.id || (p.barcode && sourceProduct.barcode && p.barcode === sourceProduct.barcode));
    const targetIdx = currentList.findIndex((p) => p.id === targetProduct.id || (p.barcode && targetProduct.barcode && p.barcode === targetProduct.barcode));

    if (sourceIdx !== -1 && targetIdx !== -1 && sourceIdx !== targetIdx) {
      const temp = currentList[sourceIdx];
      currentList[sourceIdx] = currentList[targetIdx];
      currentList[targetIdx] = temp;
      updateQuickProductsLocally(currentList);
      showToast(`🔄 Swapped positions: "${sourceProduct.name}" ⇄ "${targetProduct.name}"`, 'success');
    }
  }, [activeQuickProducts, updateQuickProductsLocally, showToast]);

  // 6. Move card position left/right by 1 step
  const handleMovePosition = useCallback((product: Product, direction: 'left' | 'right') => {
    const currentList = Array.isArray(activeQuickProducts) ? [...activeQuickProducts] : [];
    const index = currentList.findIndex((p) => p.id === product.id || (p.barcode && product.barcode && p.barcode === product.barcode));
    if (index === -1) return;

    const newIndex = direction === 'left' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= currentList.length) return;

    const temp = currentList[index];
    currentList[index] = currentList[newIndex];
    currentList[newIndex] = temp;
    updateQuickProductsLocally(currentList);
    showToast(`↔️ Moved "${product.name}" ${direction === 'left' ? 'left' : 'right'}`, 'info');
  }, [activeQuickProducts, catalog, updateQuickProductsLocally, showToast]);

  // Intercept Quick Product clicks: In Edit Mode supports position swapping or editing; otherwise checkout
  const handleQuickItemClick = (item: Product) => {
    if (isEditMode) {
      if (isPositionSwapActive) {
        if (!swapSourceProduct) {
          setSwapSourceProduct(item);
          showToast(`1️⃣ Selected "${item.name}". Tap another card to swap positions.`, 'info');
        } else if (swapSourceProduct.id === item.id) {
          setSwapSourceProduct(null);
          showToast('Deselected card', 'info');
        } else {
          handleSwapPosition(swapSourceProduct, item);
          setSwapSourceProduct(null);
          setIsPositionSwapActive(false);
        }
        return;
      }
      setEditingQuickProduct(item);
    } else {
      handleItemSelection(item);
    }
  };

  const getCategoryTheme = (cat?: string) => {
    const raw = (cat || 'ESSENTIALS').toUpperCase();
    const matched = quickCategories.find((c) => (c?.id || '').toUpperCase() === raw);
    const color = matched?.color || (
      raw === 'PRODUCE' ? 'emerald' :
        raw === 'BAKERY' ? 'amber' :
          raw === 'DAIRY' ? 'sky' :
            raw === 'MEAT' ? 'rose' :
              raw === 'PROMO' ? 'purple' : 'slate'
    );
    const label = matched?.label || (cat ? cat.charAt(0) + cat.slice(1).toLowerCase() : 'Essentials');

    switch (color) {
      case 'emerald':
        return {
          card: 'bg-emerald-50/90 hover:bg-emerald-100 border-emerald-200 text-emerald-950',
          badge: 'bg-emerald-200/80 text-emerald-800',
          label,
        };
      case 'amber':
        return {
          card: 'bg-amber-50/90 hover:bg-amber-100 border-amber-200 text-amber-950',
          badge: 'bg-amber-200/80 text-amber-800',
          label,
        };
      case 'sky':
        return {
          card: 'bg-sky-50/90 hover:bg-sky-100 border-sky-200 text-sky-950',
          badge: 'bg-sky-200/80 text-sky-800',
          label,
        };
      case 'rose':
        return {
          card: 'bg-rose-50/90 hover:bg-rose-100 border-rose-200 text-rose-950',
          badge: 'bg-rose-200/80 text-rose-800',
          label,
        };
      case 'purple':
        return {
          card: 'bg-purple-50/90 hover:bg-purple-100 border-purple-200 text-purple-950',
          badge: 'bg-purple-200/80 text-purple-800',
          label,
        };
      case 'teal':
        return {
          card: 'bg-teal-50/90 hover:bg-teal-100 border-teal-200 text-teal-950',
          badge: 'bg-teal-200/80 text-teal-800',
          label,
        };
      default:
        return {
          card: 'bg-slate-100/90 hover:bg-slate-200/80 border-slate-200 text-slate-900',
          badge: 'bg-slate-200 text-slate-700',
          label,
        };
    }
  };

  // Quick Add Product Form State
  const [showPosAddModal, setShowPosAddModal] = useState(false);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentModalMethod, setPaymentModalMethod] = useState<'CASH' | 'BENEFIT_PAY' | 'CARD'>('BENEFIT_PAY');
  const [pendingBenefitPayment, setPendingBenefitPayment] = useState<any>(null);

  // Secondary Customer Display State
  const [customerScreenReady, setCustomerScreenReady] = useState(false);




  // Customer Statement Modal State & Handlers
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [customerStatementList, setCustomerStatementList] = useState<any[]>([]);
  const [isLoadingStatement, setIsLoadingStatement] = useState(false);
  const [statementFilter, setStatementFilter] = useState<'ALL' | 'CHARGES' | 'PAYMENTS'>('ALL');
  const [statementStartDate, setStatementStartDate] = useState('');
  const [statementEndDate, setStatementEndDate] = useState('');

  const setStatementQuickRange = (preset: 'TODAY' | 'THIS_MONTH' | 'LAST_MONTH' | 'ALL') => {
    const now = new Date();
    if (preset === 'ALL') {
      setStatementStartDate('');
      setStatementEndDate('');
    } else if (preset === 'TODAY') {
      const todayStr = now.toISOString().slice(0, 10);
      setStatementStartDate(todayStr);
      setStatementEndDate(todayStr);
    } else if (preset === 'THIS_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const todayStr = now.toISOString().slice(0, 10);
      setStatementStartDate(firstDay);
      setStatementEndDate(todayStr);
    } else if (preset === 'LAST_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      setStatementStartDate(firstDay);
      setStatementEndDate(lastDay);
    }
  };

  const filteredCustomerStatement = useMemo(() => {
    if (!customerStatementList || !Array.isArray(customerStatementList)) return [];
    return customerStatementList.filter((item) => {
      if (statementFilter === 'CHARGES') {
        const isCharge = item.type === 'SALE' || item.type === 'CHARGE' || Number(item.amount) > 0;
        if (!isCharge) return false;
      }
      if (statementFilter === 'PAYMENTS') {
        const isPayment = item.type === 'PAYMENT' || item.type === 'WRITE_OFF' || Number(item.amount) < 0;
        if (!isPayment) return false;
      }

      if (!statementStartDate && !statementEndDate) return true;
      const dateStr = item.created_at || item.timestamp || item.createdAt;
      if (!dateStr) return true;
      const txDate = new Date(dateStr);
      const start = statementStartDate ? new Date(statementStartDate) : new Date('2000-01-01');
      const end = statementEndDate ? new Date(statementEndDate) : new Date('2100-01-01');
      if (statementEndDate) end.setHours(23, 59, 59, 999);
      return txDate >= start && txDate <= end;
    });
  }, [customerStatementList, statementFilter, statementStartDate, statementEndDate]);

  const filteredCustomerDebitTotal = useMemo(() => {
    return filteredCustomerStatement.reduce((acc, item) => {
      const isCharge = item.type === 'SALE' || item.type === 'CHARGE' || Number(item.amount) > 0;
      return isCharge ? acc + Math.abs(Number(item.amount || item.total || 0)) : acc;
    }, 0);
  }, [filteredCustomerStatement]);

  const filteredCustomerCreditTotal = useMemo(() => {
    return filteredCustomerStatement.reduce((acc, item) => {
      const isPayment = item.type === 'PAYMENT' || item.type === 'WRITE_OFF' || Number(item.amount) < 0;
      return isPayment ? acc + Math.abs(Number(item.amount || item.total || 0)) : acc;
    }, 0);
  }, [filteredCustomerStatement]);

  const openCustomerStatement = async (cust: Customer) => {
    setStatementCustomer(cust);
    setIsLoadingStatement(true);
    setStatementFilter('ALL');
    setStatementStartDate('');
    setStatementEndDate('');

    const candidates = [
      apiBase,
      getApiBaseUrl(),
      DEFAULT_EDGE_API_URL
    ].filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i);

    let loaded = false;
    for (const url of candidates) {
      try {
        const res = await fetch(`${url}/api/customers/${cust.id}/statement`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.statement)) {
            setCustomerStatementList(data.statement);
            loaded = true;
            break;
          }
        }
      } catch { }
    }

    if (!loaded) {
      try {
        const localRows = await db.execute({
          sql: `SELECT * FROM KhataLedger WHERE customerId = ? ORDER BY timestamp DESC`,
          args: [cust.id]
        });
        if (localRows.rows && localRows.rows.length > 0) {
          setCustomerStatementList(localRows.rows as any[]);
          loaded = true;
        }
      } catch (err) {
        console.warn('Local ledger read error', err);
      }
    }

    if (!loaded) {
      showToast('⚠️ Could not load statement records from server.', 'error');
      setCustomerStatementList([]);
    }
    setIsLoadingStatement(false);
  };

  const handlePrintStatement = () => {
    if (!statementCustomer) return;
    const formattedStatement = filteredCustomerStatement.map((item) => ({
      id: item.id,
      amount: Number(item.amount || item.total || 0),
      type: item.type === 'SALE' || item.type === 'CHARGE' ? 'SALE' : 'PAYMENT',
      reference: item.reference || item.invoiceNo || 'Store Purchase',
      formattedDate: item.formattedDate || (item.created_at || item.timestamp ? new Date(item.created_at || item.timestamp).toLocaleDateString() : ''),
      formattedTime: item.formattedTime || (item.created_at || item.timestamp ? new Date(item.created_at || item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''),
      runningBalance: Number(item.running_balance ?? item.runningBalance ?? 0)
    }));

    printKhataStatement({
      shopName: "ASKAR STORE - KHATA STATEMENT",
      customerName: statementCustomer.name,
      customerPhone: statementCustomer.phone,
      customerCpr: statementCustomer.cpr,
      statement: formattedStatement,
      currentBalance: Number(statementCustomer.currentBalance ?? statementCustomer.balance ?? 0),
      dateRange: (statementStartDate || statementEndDate)
        ? `${statementStartDate || 'Start'} to ${statementEndDate || 'Today'}`
        : undefined
    });
    showToast(`🖨️ Printing 58mm statement slip for ${statementCustomer.name}...`, 'info');
  };

  // Unified Single-Pipeline NFC Reader State
  const [lastDetectedUid, setLastDetectedUid] = useState<string | null>(null);
  const clearScan = useCallback(() => setLastDetectedUid(null), []);
  const hardwareSupported = true;

  // Connect & Save Master Server IP Address
  const handleSaveMasterIp = async (targetIp: string) => {
    let clean = targetIp.trim();
    if (!clean) return;
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }
    if (!clean.includes(':', 7)) {
      clean = `${clean}:3000`;
    }
    showToast(`🌐 Connecting to Master Server at ${clean}...`, 'info');
    try {
      const res = await fetch(`${clean}/products`);
      if (res.ok) {
        localStorage.setItem('master_server_url', clean);
        localStorage.setItem('server_ip', clean.replace(/^https?:\/\//, '').replace(/:[0-9]+.*$/, '').replace(/\/.*$/, ''));
        setApiBase(clean);
        // Also inform the local sync engine if running
        fetch(`http://localhost:3000/api/config/master-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ masterUrl: clean })
        }).catch(() => { });
        showToast(`✅ Connected to Master Back-Office: ${clean}!`, 'success');
        setShowServerConfigModal(false);
        fetchCatalog();
        checkSyncStatus();
      } else {
        showToast(`⚠️ Server replied with status: ${res.status}`, 'error');
      }
    } catch {
      showToast(`❌ Cannot reach ${clean}. Verify Wi-Fi and firewall.`, 'error');
    }
  };

  // --------------------------------------------------------------------------
  // CACHE-FIRST PRODUCT LOADING (Sunmi optimized — 0ms cold start)
  // Products are cached in localStorage after first fetch.
  // On startup: serve from cache instantly, then refresh silently in background.
  // On barcode miss: call refreshCatalogNow() for targeted re-fetch.
  // Never polls in background — products don't change mid-transaction.
  // --------------------------------------------------------------------------
  const CATALOG_CACHE_KEY = 'askar_catalog_cache';
  const QUICK_PRODUCTS_CACHE_KEY = 'askar_quick_products_v2';
  const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes stale threshold

  const readCatalogCache = (): Product[] | null => {
    try {
      let catalogList: Product[] = [];
      const raw = localStorage.getItem(CATALOG_CACHE_KEY);
      if (raw) {
        const { data } = JSON.parse(raw);
        if (Array.isArray(data) && data.length > 0) catalogList = data;
      }
      // Merge with askar_local_db_cache_Product so locally added products are never lost
      const localDbRaw = localStorage.getItem('askar_local_db_cache_Product');
      if (localDbRaw) {
        const localList = JSON.parse(localDbRaw);
        if (Array.isArray(localList) && localList.length > 0) {
          const existingIds = new Set(catalogList.map(p => p.id));
          const existingBarcodes = new Set(catalogList.map(p => p.barcode).filter(Boolean));
          for (const item of localList) {
            if (!existingIds.has(item.id) && (!item.barcode || !existingBarcodes.has(item.barcode))) {
              catalogList.unshift(mapDbRowToProduct(item));
            }
          }
        }
      }
      if (catalogList.length > 0) {
        reindexCatalog(catalogList);
        return catalogList;
      }
      return null;
    } catch { return null; }
  };

  const writeCatalogCache = (data: Product[]) => {
    try {
      localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
      reindexCatalog(data);
    } catch { }
  };

  const readQuickCache = (): any[] | null => {
    try {
      const raw = localStorage.getItem(QUICK_PRODUCTS_CACHE_KEY);
      if (!raw) return null;
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts < CATALOG_CACHE_TTL_MS && Array.isArray(data)) return data;
      return Array.isArray(data) ? data : null;
    } catch { return null; }
  };

  const writeQuickCache = (data: any[]) => {
    try { localStorage.setItem(QUICK_PRODUCTS_CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch { }
  };

  // Fetch fresh catalog from network (background, non-blocking) & purge deleted products
  const fetchCatalog = useCallback(async () => {
    const url = await resolveApiBase();
    if (!url) { setCatalog(prev => prev.length > 0 ? prev : DEFAULT_PRODUCTS); return; }
    try {
      let prodRes: any = null;
      try {
        prodRes = await fetch(`${url}/api/products`, { signal: AbortSignal.timeout(4000) });
        if (!prodRes.ok) throw new Error('not ok');
      } catch {
        prodRes = await fetch(`${url}/products`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
      }
      const delRes = await fetch(`${url}/api/products/deleted`, { signal: AbortSignal.timeout(3000) }).catch(() => null);

      const deletedIds = new Set<string>();
      const deletedBarcodes = new Set<string>();

      if (delRes && delRes.ok) {
        try {
          const delData = await delRes.json();
          const delList = delData?.deleted || [];
          for (const d of delList) {
            if (d.id) deletedIds.add(String(d.id));
            if (d.barcode) deletedBarcodes.add(String(d.barcode));
          }
        } catch { }
      }

      if (prodRes && prodRes.ok) {
        try {
          const data = await prodRes.json();
          const rawList = Array.isArray(data) ? data : (data?.products || data?.data || []);
          if (Array.isArray(rawList) && rawList.length > 0) {
            const activeList = rawList.filter((p: any) => {
              const id = String(p.id || '');
              const barcode = String(p.barcode || '');
              return !deletedIds.has(id) && (!barcode || !deletedBarcodes.has(barcode));
            });
            const mapped = activeList.map(mapDbRowToProduct);

            setCatalog(mapped);
            writeCatalogCache(mapped);
            try {
              localStorage.setItem('askar_local_db_cache_Product', JSON.stringify(mapped));
            } catch { }
          }
        } catch { }
      }
    } catch { }
  }, [resolveApiBase]);

  const fetchQuickProducts = useCallback(async () => {
    const configuredTarget = getApiBaseUrl();
    const candidates = [
      configuredTarget,
      CLOUD_GATEWAY_URL,
      DEFAULT_EDGE_API_URL,
      LAN_SERVER_URL
    ].filter((val, idx, arr): val is string => Boolean(val) && arr.indexOf(val) === idx);
    for (const url of candidates) {
      try {
        const res = await fetch(`${url}/api/quick-products`, { signal: AbortSignal.timeout(2500) });
        if (res.ok) {
          const data = await res.json();
          const qList = Array.isArray(data) ? data : (data?.products || data?.data || []);
          if (Array.isArray(qList)) {
            setQuickProducts(qList);
            writeQuickCache(qList);
            return;
          }
        }
      } catch { }
    }
  }, [apiBase]);

  const fetchQuickCategories = useCallback(async () => {
    const configuredTarget = getApiBaseUrl();
    const candidates = [configuredTarget, DEFAULT_EDGE_API_URL].filter(
      (val, idx, arr) => Boolean(val) && arr.indexOf(val) === idx
    );
    for (const url of candidates) {
      try {
        const res = await fetch(`${url}/api/quick-categories`, { signal: AbortSignal.timeout(2500) });
        if (res.ok) {
          const data = await res.json();
          if (data?.categories && Array.isArray(data.categories) && data.categories.length > 0) {
            const normalized = normalizeCategories(data.categories);
            setQuickCategories(normalized);
            try {
              localStorage.setItem('pos_quick_categories', JSON.stringify(normalized));
            } catch { }
            return;
          }
        }
      } catch { }
    }
  }, [apiBase]);

  const handleSaveCategories = async (newCategories: QuickCategory[]) => {
    setQuickCategories(newCategories);
    try {
      localStorage.setItem('pos_quick_categories', JSON.stringify(newCategories));
    } catch { }

    const configuredTarget = getApiBaseUrl();
    const candidates = [configuredTarget, DEFAULT_EDGE_API_URL].filter(
      (val, idx, arr) => Boolean(val) && arr.indexOf(val) === idx
    );
    for (const url of candidates) {
      try {
        const res = await fetch(`${url}/api/quick-categories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categories: newCategories }),
        });
        if (res.ok) break;
      } catch { }
    }
  };

  // Public: force a manual catalog refresh (called after barcode scan miss or manual sync)
  const refreshCatalogNow = useCallback(() => {
    fetchCatalog();
    fetchProduceItems();
    fetchQuickProducts();
    fetchQuickCategories();
  }, [fetchCatalog, fetchProduceItems, fetchQuickProducts, fetchQuickCategories]);

  // On mount: serve from cache INSTANTLY, then refresh in background (non-blocking)
  useEffect(() => {
    // 1. Serve from localStorage cache immediately (0ms)
    const cachedCatalog = readCatalogCache();
    if (cachedCatalog && cachedCatalog.length > 0) setCatalog(cachedCatalog);
    else setCatalog(DEFAULT_PRODUCTS);

    const cachedQuick = readQuickCache();
    if (Array.isArray(cachedQuick)) setQuickProducts(cachedQuick);

    try {
      const cachedTabs = localStorage.getItem('pos_quick_categories');
      if (cachedTabs) {
        const parsed = JSON.parse(cachedTabs);
        if (Array.isArray(parsed) && parsed.length > 0) setQuickCategories(normalizeCategories(parsed));
      }
    } catch { }

    // 2. Background refresh — does NOT block or re-render above
    fetchCatalog();
    fetchProduceItems();
    fetchQuickProducts();
    fetchQuickCategories();

    // 3. Refresh every 30 seconds for live continuous multi-device catalog sync
    const catInterval = setInterval(() => {
      fetchCatalog();
      fetchProduceItems();
      fetchQuickProducts();
      fetchQuickCategories();
    }, 30 * 1000);
    return () => clearInterval(catInterval);
  }, [fetchProduceItems]);

  // Auto-refresh produce items whenever cashier opens Omni-Pad or switches to Omni-Pad pane
  useEffect(() => {
    if (showOmniPadModal || showFreshProduceGrid || showPluModal || isWeightModalOpen || rightPaneMode === 'OMNIPAD') {
      fetchProduceItems();
    }
  }, [showOmniPadModal, showFreshProduceGrid, showPluModal, isWeightModalOpen, rightPaneMode, fetchProduceItems]);

  // Real-time catalog broadcast receiver via Master WebSocket bus
  useEffect(() => {
    const handleWsCatalogUpdate = (e: any) => {
      const data = e?.detail;
      if (!data) return;

      if (data.type === 'PRODUCE_PRICES_UPDATED') {
        if (Array.isArray(data.updates)) {
          const updateMap = new Map<string, any>(data.updates.map((u: any) => [String(u.id), u]));

          // Update produceItems directly for instantaneous UI sync in Omni-Pad
          setProduceItems((prev) => {
            const nextList = prev
              .filter((p) => {
                const upd: any = updateMap.get(String(p.productId || p.barcode));
                if (upd && (upd.is_weighed_item === 0 || upd.is_weighed_item === false)) {
                  return false; // Removed from Daily Produce!
                }
                return true;
              })
              .map((p) => {
                const upd: any = updateMap.get(String(p.productId || p.barcode));
                if (!upd) return p;
                const newSellingPrice = Number(upd.sellingPrice ?? p.pricePerKg);
                const pluVal = upd.plu_code !== undefined ? (upd.plu_code ? String(upd.plu_code).trim() : p.code) : p.code;
                const imgVal = upd.image_url !== undefined ? upd.image_url : p.imageUrl;
                const arNameVal = upd.name_ar !== undefined ? upd.name_ar : p.nameAr;
                return {
                  ...p,
                  pricePerKg: newSellingPrice,
                  code: pluVal,
                  imageUrl: imgVal,
                  nameAr: arNameVal
                };
              });
            try { localStorage.setItem('askar_produce_cache', JSON.stringify(nextList)); } catch { }
            return nextList;
          });

          setCatalog((prev) => {
            const nextList = prev.map((p) => {
              const upd: any = updateMap.get(String(p.id));
              if (!upd) return p;
              const newSellingPrice = Number(upd.sellingPrice ?? p.sellingPrice ?? p.price);
              const newUnitCost = Number(upd.purchasePrice ?? upd.unitCost ?? p.purchasePrice ?? p.unitCost);
              const pluVal = upd.plu_code !== undefined ? (upd.plu_code ? String(upd.plu_code).trim() : null) : (p as any).plu_code;
              const imgVal = upd.image_url !== undefined ? (upd.image_url ? String(upd.image_url).trim() : null) : (p as any).image_url;
              const arNameVal = upd.name_ar !== undefined ? (upd.name_ar ? String(upd.name_ar).trim() : null) : (p as any).name_ar;
              const isWeighedVal = upd.is_weighed_item !== undefined ? Boolean(upd.is_weighed_item) : ((p as any).is_weighed_item !== undefined ? Boolean((p as any).is_weighed_item) : p.isScaleItem);

              return {
                ...p,
                price: newSellingPrice,
                sellingPrice: newSellingPrice,
                unitCost: newUnitCost,
                purchasePrice: newUnitCost,
                plu_code: pluVal,
                pluCode: pluVal,
                name_ar: arNameVal,
                nameAr: arNameVal,
                image_url: imgVal,
                imageUrl: imgVal,
                is_weighed_item: isWeighedVal ? 1 : 0,
                isScaleItem: isWeighedVal,
              };
            });
            writeCatalogCache(nextList);
            try {
              localStorage.setItem('askar_local_db_cache_Product', JSON.stringify(nextList));
            } catch { }
            return nextList;
          });
          showToast(`⚡ ${data.updates.length} Produce Prices Updated Live via Master Broadcast!`, 'info');
        }

        // Single item update or removal
        if (data.itemId) {
          const targetId = String(data.itemId);
          if (data.is_weighed_item === 0 || data.is_weighed_item === false) {
            setProduceItems((prev) => {
              const filtered = prev.filter(p => p.productId !== targetId && p.barcode !== targetId);
              try { localStorage.setItem('askar_produce_cache', JSON.stringify(filtered)); } catch { }
              return filtered;
            });
          }
        }

        fetchProduceItems();
        fetchCatalog();
      }

      if (data.type === 'CATALOG_UPDATED') {
        if (data.action === 'DELETE' && (data.deletedId || data.productId)) {
          const targetId = String(data.deletedId || data.productId);
          const targetBarcode = data.barcode ? String(data.barcode) : null;
          setProduceItems((prev) => {
            const filtered = prev.filter(p => p.productId !== targetId && (!targetBarcode || p.barcode !== targetBarcode));
            try { localStorage.setItem('askar_produce_cache', JSON.stringify(filtered)); } catch { }
            return filtered;
          });
          setCatalog((prev) => {
            const nextList = prev.filter(p => String(p.id) !== targetId && (!targetBarcode || String(p.barcode) !== targetBarcode));
            writeCatalogCache(nextList);
            try {
              localStorage.setItem('askar_local_db_cache_Product', JSON.stringify(nextList));
            } catch { }
            return nextList;
          });
        } else if (data.action === 'BULK_DELETE' && Array.isArray(data.deletedIds)) {
          const idSet = new Set(data.deletedIds.map(String));
          setProduceItems((prev) => {
            const filtered = prev.filter(p => !idSet.has(String(p.productId)));
            try { localStorage.setItem('askar_produce_cache', JSON.stringify(filtered)); } catch { }
            return filtered;
          });
          setCatalog((prev) => {
            const nextList = prev.filter(p => !idSet.has(String(p.id)));
            writeCatalogCache(nextList);
            try {
              localStorage.setItem('askar_local_db_cache_Product', JSON.stringify(nextList));
            } catch { }
            return nextList;
          });
        } else if (data.payload) {
          const prod = mapDbRowToProduct(data.payload);
          setCatalog((prev) => {
            const idx = prev.findIndex(p => p.id === prod.id || (p.barcode && prod.barcode && p.barcode === prod.barcode));
            let nextList: Product[];
            if (idx !== -1) {
              nextList = [...prev];
              nextList[idx] = prod;
            } else {
              nextList = [prod, ...prev];
            }
            writeCatalogCache(nextList);
            try {
              localStorage.setItem('askar_local_db_cache_Product', JSON.stringify(nextList));
            } catch { }
            return nextList;
          });
        }
      }

      if (data.type === 'KHATA_CUSTOMER_CREATED' || data.type === 'KHATA_CUSTOMER_DELETED' || data.type === 'KHATA_BALANCE_UPDATED') {
        loadCustomers();
      }
    };
    window.addEventListener('master-ws-message', handleWsCatalogUpdate);
    return () => window.removeEventListener('master-ws-message', handleWsCatalogUpdate);
  }, []);

  // Fetch all customers for enrollment list
  const loadCustomers = async () => {
    try {
      const headers = { 'x-pos-client': 'store-pos', 'x-manager-pin': '9999' };
      const targetBase = (apiBase && !apiBase.includes('askar-khata-pwa.vercel.app')) ? apiBase : getApiBaseUrl();
      const candidates = [
        targetBase,
        'http://192.168.8.7:3000',
        'http://localhost:3000',
        DEFAULT_EDGE_API_URL
      ].filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i);

      for (const url of candidates) {
        try {
          const res = await fetch(`${url}/api/customers`, { headers, signal: AbortSignal.timeout(4000) });
          if (res.ok) {
            const data = await res.json();
            const cList = Array.isArray(data) ? data : (data?.customers || data?.data || []);
            if (Array.isArray(cList) && cList.length > 0) {
              setCustomersList(cList);
              return;
            }
          }
        } catch { }

        try {
          const res2 = await fetch(`${url}/khata/ledger`, { headers, signal: AbortSignal.timeout(4000) });
          if (res2.ok) {
            const data = await res2.json();
            const cList = (data && data.customers) || (Array.isArray(data) ? data : []);
            if (Array.isArray(cList) && cList.length > 0) {
              setCustomersList(cList);
              return;
            }
          }
        } catch { }
      }
    } catch (e) {
      console.error("Failed to load customers:", e);
    }
  };

  // Eagerly pre-load customer directory on terminal startup
  useEffect(() => {
    loadCustomers();
  }, [apiBase]);

  // Check Outbox Sync Status
  const [syncInfo, setSyncInfo] = useState<{ pendingCount: number; syncedCount: number } | null>(null);

  const checkSyncStatus = async () => {
    try {
      const res = await fetch(`${apiBase}/api/sync/status`);
      if (res.ok) {
        const data = await res.json();
        setSyncInfo(data);
      }
    } catch { }
  };

  useEffect(() => {
    checkSyncStatus();
    // Reduced from 15s → 60s: sync status indicator doesn't need near-realtime updates on Sunmi
    const interval = setInterval(checkSyncStatus, 60000);
    return () => clearInterval(interval);
  }, [apiBase]);

  const handleManualSync = async () => {
    showToast("🔄 Syncing offline sales & pulling price updates...", 'info');
    try {
      const res = await fetch(`${apiBase}/api/sync/trigger`);
      const data = await res.json();
      if (data.status === 'success') {
        const parts = [];
        if (data.salesPushed > 0) parts.push(`Pushed ${data.salesPushed} sales`);
        if (data.productsPulled > 0) parts.push(`Pulled ${data.productsPulled} updated prices`);
        if (parts.length === 0) parts.push("Everything up to date with Master PC");
        showToast(`✅ ${parts.join(' & ')}!`, 'success');
      } else {
        showToast("⚠️ Master PC unreachable (running offline)", 'info');
      }
      checkSyncStatus();
      // refreshCatalogNow fetches both catalog and quick products, invalidating the cache
      refreshCatalogNow();
    } catch {
      showToast("⚠️ Master PC unreachable (running offline)", 'info');
    }
  };



  // Bind a scanned UID to a customer
  const handleBindCard = async (customerId: string, uidToBind: string) => {
    clearScan();
    try {
      const res = await fetch(`${apiBase}/api/customers/${customerId}/bind-card`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pos-client': 'store-pos'
        },
        body: JSON.stringify({ cardUid: uidToBind })
      });
      const data = await res.json();
      if (data && data.success) {
        showToast(`✅ Card [${uidToBind}] successfully bound to ${data.customer?.name || 'customer'}!`, 'success');
        setBindingCustomerId(null);
        loadCustomers();
      } else {
        showToast(`❌ Binding failed: ${data && data.error ? data.error : 'Unknown error'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast("❌ Error saving card binding to backend.", 'error');
    }
  };

  // Lookup customer by Card UID (Instant non-blocking response)
  const fetchCustomerByCard = async (uid: string) => {
    clearScan();
    try {
      const res = await fetch(`${apiBase}/api/customers/by-card/${encodeURIComponent(uid)}`, {
        headers: { 'x-pos-client': 'store-pos' }
      });
      if (res.ok) {
        const custData = await res.json();
        const activeCust = custData.customer || custData;
        setCustomer(activeCust);

        const bal = Number(activeCust.personalBalance ?? activeCust.currentBalance ?? activeCust.balance ?? 0);
        const rawLim = Number(activeCust.creditLimit ?? activeCust.credit_limit);
        const lim = rawLim > 0 ? rawLim : 30.0;

        if (bal > lim) {
          showToast(`⚠️ Warning: ${activeCust.name} has exceeded Khata limit (Owed: BD ${bal.toFixed(3)} / Limit: BD ${lim.toFixed(3)})`, 'error');
        } else if (activeCust.hasMessGroup && activeCust.isDual) {
          showToast(`💳 ${activeCust.name} (Personal) & 👥 ${activeCust.group_name} (${activeCust.members?.length || 0} members) linked!`, 'success');
        } else if (activeCust.isMess) {
          showToast(`👥 Linked to Mess Group: ${activeCust.group_name} (${activeCust.members?.length || 0} members)`, 'success');
        } else {
          showToast(`💳 Linked to ${activeCust.name} (Khata Balance: BD ${bal.toFixed(3)})`, 'success');
        }
      } else {
        showToast(`⚠️ Card [${uid}] is not linked to any customer.`, 'info');
      }
    } catch (err) {
      console.error("Card lookup failed:", err);
      showToast("❌ Could not reach backend server.", 'error');
    }
  };

  // ✅ Unified Single Authoritative NFC Pipeline Hook (Single network call & chime per tap)
  const handleKhataLookup = useCallback((cleanUid: string) => {
    console.log("📡 [Unified NFC Reader]:", cleanUid);
    setLastDetectedUid(cleanUid);

    // If Khata Hub is open, let Khata Hub handle the scan internally (enrollment or settlement)
    if (showKhataHub) {
      return;
    }

    // If Customer Drawer is open, attach scanned UID to new customer form
    if (showCustomersModal) {
      setNewCustCardUid(cleanUid);
      showToast(`💳 NFC Card Detected: ${cleanUid}`, 'info');
      return;
    }

    if (bindingCustomerId) {
      // FLOW 2: ENROLLMENT - Manager is binding card to customer
      handleBindCard(bindingCustomerId, cleanUid);
    } else {
      // FLOW 1: TAP-TO-PAY - Customer taps card at register
      fetchCustomerByCard(cleanUid);
    }
    // Do NOT stop scanning: keep NFC antenna continuously active
  }, [showKhataHub, showCustomersModal, bindingCustomerId, apiBase]);

  const handleNfcUnavailable = useCallback(() => {
    // Desktop / Laptop: Web NFC is mobile-only; cloud relay poller and USB wedge scanner run in background.
    console.info("ℹ️ [Desktop POS]: Physical Web NFC not present; Cloud Relay & USB Wedge active.");
  }, []);

  const { startScan: startNfcScan, stopScan: stopNfcScan, isScanning: isNfcReaderScanning, nfcError, secondsLeft } = useNfcReader(
    handleKhataLookup,
    handleNfcUnavailable
  );

  const simulateScan = useCallback((mockUid?: string) => {
    const uid = mockUid || '04A1B2C3D4';
    handleKhataLookup(uid);
  }, [handleKhataLookup]);

  const addToCart = (product: Product, quantity = 1): boolean => {
    // Unlimited Stock Mode: Stock limits bypassed for Khata transactions
    setLastScannedProductId(product.id);
    useCartStore.getState().addItem(product as any, quantity, isReturnMode);
    return true;
  };

  // Assign / Bind or Unbind Barcode to a Product
  const handleBindBarcode = async (productId: string, barcodeToBind: string) => {
    const cleanBarcode = barcodeToBind.trim();
    const product = catalog.find((p) => p.id === productId);
    try {
      const res = await fetch(`${apiBase}/api/products/${productId}/bind-barcode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-manager-pin': getManagerPin(),
          'x-pos-client': 'store-pos'
        },
        body: JSON.stringify({ barcode: cleanBarcode })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (!cleanBarcode) {
          showToast(`🗑️ Barcode unassigned from "${product?.name || 'product'}"`, 'info');
        } else {
          showToast(`✅ Barcode [${cleanBarcode}] assigned to "${data.product?.name || product?.name || 'product'}"!`, 'success');
        }
        setBindingProductId(null);
        setUnassignedBarcode(null);
        setManualBarcodeAssignInput('');
        await fetchCatalog();
      } else {
        showToast(`❌ ${data.error || 'Failed to assign barcode'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast("❌ Network error assigning barcode.", 'error');
    }
  };

  // Hardware Barcode Scan Handler (Triggered by the SUNMI 50ms speed trap or scanner input)
  const handleBarcodeScan = (scannedBarcode: string) => {
    const cleanCode = scannedBarcode.trim();
    if (!cleanCode) return;
    setLastScannedBarcode(cleanCode);

    // MODE 0: RECEIVING DRAWER BARCODE AUDIT
    if (showReceivingDrawer && receivingScanCallbackRef.current) {
      const handled = receivingScanCallbackRef.current(cleanCode);
      if (handled) return;
    }

    // If Refund Modal is already open, do not trigger main screen checkout interception
    if (showRefundModal) {
      return;
    }

    // MODE 1: BARCODE ASSIGNMENT MODE
    // Manager/cashier clicked "Assign Barcode" on a product and is now pulling the hardware scanner trigger
    if (bindingProductId) {
      handleBindBarcode(bindingProductId, cleanCode);
      return;
    }

    // MODE 1.5: AUTOMATED RETURN & REFUND BARCODE SCAN
    // Cashier scanned an NBR Receipt Code128 barcode (e.g., INV-005001 or INV-...)
    if (cleanCode.toUpperCase().startsWith('INV-') || cleanCode.toUpperCase().startsWith('REF-')) {
      const activeShift =
        shiftId ||
        (typeof localStorage !== 'undefined'
          ? localStorage.getItem('active_shift_id') || localStorage.getItem('askar_shift_id')
          : null);
      const confirmed = window.confirm(
        `🧾 Scanned Return Receipt: #${cleanCode}\n\nDo you want to process an automated refund for this transaction?`
      );
      if (confirmed) {
        const enteredPin = window.prompt("MANAGER AUTHORIZATION REQUIRED\nEnter PIN to process refund:");
        if (!enteredPin) {
          showToast("Refund cancelled: Manager PIN required.", "info");
          return;
        }

        processSecureRefund(cleanCode, enteredPin, {
          shiftId: activeShift,
          reason: 'CUSTOMER_RETURN',
          destination: 'CASH',
        }).then(async (res) => {
          await printRefundReceipt(cleanCode, res);
          showToast(`↩️ Refund processed for Invoice #${cleanCode}`, 'success');
        }).catch((err) => {
          showToast(`Refund Failed: ${err.message}`, 'error');
        });
      }
      return;
    }

    // MODE 2: CHECKOUT RING-UP MODE
    // 2A: Check for Scale/Deli Variable Measure Barcode (Prefixes 20, 21, 22)
    const scaleParsed = parseScaleBarcode(cleanCode, 3);
    if (scaleParsed.isScaleBarcode) {
      // Find matching item in catalog by 5-digit PLU or numeric PLU
      const matchedProduct = findProductByPLU(catalog, scaleParsed);

      if (matchedProduct) {
        let unitSellingPrice = matchedProduct.price ?? (matchedProduct as any).sellingPrice;
        let displayName = matchedProduct.name;
        let weightKg: number | undefined;

        if (scaleParsed.type === 'WEIGHT') {
          // Prefix 22: Value is weight in kg (3 decimals)
          weightKg = scaleParsed.extractedValue || 0;
          unitSellingPrice = Number(((weightKg) * (matchedProduct.price || (matchedProduct as any).sellingPrice || 1)).toFixed(3));
          displayName = `${matchedProduct.name} (${weightKg.toFixed(3)} kg)`;
        } else {
          // Prefix 20 or 21: Price-embedded barcode (fils divided by 1000)
          unitSellingPrice = scaleParsed.extractedValue || matchedProduct.price || (matchedProduct as any).sellingPrice;
          displayName = `${matchedProduct.name} (Scale Pack BD ${unitSellingPrice.toFixed(3)})`;
        }

        // Each weighed pack has a distinct price and weight, give it a unique cart instance ID
        const scaleCartItem: Product = {
          ...matchedProduct,
          id: `${matchedProduct.id}_scale_${cleanCode}`,
          productId: matchedProduct.id,
          name: displayName,
          price: unitSellingPrice,
          barcode: cleanCode,
          isScaleItem: true,
          scaleWeight: weightKg,
        };

        setLastScannedProductId(scaleCartItem.id);
        addToCart(scaleCartItem);
        setUnassignedBarcode(null);
        showToast(
          `🥩 Scale Item: ${displayName} [PLU: ${scaleParsed.plu}] -> BD ${unitSellingPrice.toFixed(3)}`,
          'success'
        );
        return;
      } else {
        // PLU not found in catalog - alert cashier and trigger quick add
        setUnassignedBarcode(cleanCode);
        showToast(
          `⚠️ Deli Scale PLU [${scaleParsed.plu}] (${scaleParsed.formattedValue} ${scaleParsed.type === 'WEIGHT' ? 'kg' : 'BD'}) not registered.`,
          'info'
        );
        setShowPosAddModal(true);
        return;
      }
    }

    // 2B: Standard Fixed-Price Barcode Lookup
    const product = catalog.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === cleanCode.toLowerCase()) ||
        p.id.toLowerCase() === cleanCode.toLowerCase() ||
        p.name.toLowerCase() === cleanCode.toLowerCase()
    );

    if (product) {
      setLastScannedProductId(product.id);
      handleItemSelection(product);
      setUnassignedBarcode(null);
      if (!product.isScaleItem && !(product as any).is_weighed_item) {
        showToast(`🏷️ Scanned: ${product.name} (BD ${(product.price ?? (product as any).sellingPrice).toFixed(3)})`, 'success');
      }
    } else {
      setUnassignedBarcode(cleanCode);
      showToast(`⚠️ Unassigned Barcode: [${cleanCode}]. Quick Add triggered.`, 'info');
      setShowPosAddModal(true);
    }
  };

  // Intercept events from headless useBarcodeWedge (Decoupled from top-level React render cycle)
  useEffect(() => {
    const handleScanSuccess = (e: any) => {
      const prod = e?.detail?.product;
      if (prod) {
        setLastScannedProductId(prod.id);
        setUnassignedBarcode(null);
        showToast(`🏷️ Scanned: ${prod.name} (BD ${Number(prod.price ?? prod.sellingPrice ?? 0).toFixed(3)})`, 'success');
      }
    };

    const handleScanMiss = async (e: any) => {
      const code = e?.detail?.scannedCode;
      if (!code) return;

      // 1. Check if the scanned code is a Customer / Khata / Mess NFC Card UID or Barcode
      try {
        const res = await fetch(`${apiBase}/api/customers/by-card/${encodeURIComponent(code)}`, {
          headers: { 'x-pos-client': 'store-pos' }
        });
        if (res.ok) {
          const custData = await res.json();
          const activeCust = custData.customer || custData;
          if (activeCust && (activeCust.id || activeCust.name)) {
            console.log("💳 [USB Reader / Scanner Intercepted Customer]:", code, activeCust.name);
            fetchCustomerByCard(code);
            return;
          }
        }
      } catch (err) {
        console.warn("Card check on scan miss error:", err);
      }

      // 2. Real product scan miss -> open Quick Add
      setUnassignedBarcode(code);
      showToast(`⚠️ Unassigned Barcode: [${code}]. Quick Add triggered.`, 'info');
      setShowPosAddModal(true);
    };

    const handleReceiptScan = (e: any) => {
      const cleanCode = e?.detail;
      if (!cleanCode) return;
      const activeShift =
        shiftId ||
        (typeof localStorage !== 'undefined'
          ? localStorage.getItem('active_shift_id') || localStorage.getItem('askar_shift_id')
          : null);
      const confirmed = window.confirm(
        `🧾 Scanned Return Receipt: #${cleanCode}\n\nDo you want to process an automated refund for this transaction?`
      );
      if (confirmed) {
        const enteredPin = window.prompt("MANAGER AUTHORIZATION REQUIRED\nEnter PIN to process refund:");
        if (!enteredPin) {
          showToast("Refund cancelled: Manager PIN required.", "info");
          return;
        }

        processSecureRefund(cleanCode, enteredPin, {
          shiftId: activeShift,
          reason: 'CUSTOMER_RETURN',
          destination: 'CASH',
        }).then(async (res) => {
          await printRefundReceipt(cleanCode, res);
          showToast(`↩️ Refund processed for Invoice #${cleanCode}`, 'success');
        }).catch((err) => {
          showToast(`Refund Failed: ${err.message}`, 'error');
        });
      }
    };

    const handleRawHardwareScan = (e: any) => {
      const cleanCode = e?.detail;
      if (!cleanCode) return;
      setLastScannedBarcode(cleanCode);

      // Check receiving drawer
      if (showReceivingDrawer && receivingScanCallbackRef.current) {
        const handled = receivingScanCallbackRef.current(cleanCode);
        if (handled) return;
      }

      // Check barcode assignment mode
      if (bindingProductId) {
        handleBindBarcode(bindingProductId, cleanCode);
      }
    };

    window.addEventListener('barcode-scan-success', handleScanSuccess);
    window.addEventListener('barcode-scan-miss', handleScanMiss);
    window.addEventListener('receipt-barcode-scanned', handleReceiptScan);
    window.addEventListener('hardware-barcode-scan', handleRawHardwareScan);

    return () => {
      window.removeEventListener('barcode-scan-success', handleScanSuccess);
      window.removeEventListener('barcode-scan-miss', handleScanMiss);
      window.removeEventListener('receipt-barcode-scanned', handleReceiptScan);
      window.removeEventListener('hardware-barcode-scan', handleRawHardwareScan);
    };
  }, [bindingProductId, showReceivingDrawer, shiftId, showToast, handleBindBarcode]);

  // Decoupled Hardware Barcode Scanner Hook: unified via useBarcodeWedge in App.tsx
  // (useBarcodeScanner removed to prevent duplicate event listeners and double item scans)


  // Bahrain NBR Compliant Cart Totals provided directly by useCheckoutProcessor
  const subtotal = cartTotals.subtotal;
  const vat = cartTotals.totalVat;
  const total = cartTotals.finalTotal;
  const totalSavings = cartTotals.totalSavings;

  // Unified Master Host resolution via Sovereign Cloudflare Edge
  const masterIp = getServerIp();

  // 📡 Decoupled Network & Offline Synchronization Hook with Cloud DR Fallback:
  // Handles WebSocket connection, 10s auto-sync polling loop, 60s outage watchdog, and CRDT Khata balance sync
  const {
    isServerOnline,
    showDrPrompt,
    isCloudModeActive,
    setIsCloudModeActive,
    activeApiBase
  } = useNetworkSync(masterIp, useCallback((data: any) => {
    if (data.type === 'KHATA_BALANCE_UPDATED' && data.customerId) {
      const delta = Number(data.delta) || 0;
      const directBalance = data.balance !== undefined ? Number(data.balance) : null;

      // 1. Update actively linked checkout customer
      setCustomer((prev) => {
        if (prev && prev.id === data.customerId) {
          const oldBal = Number(prev.currentBalance ?? prev.balance ?? 0);
          const newBal = directBalance !== null ? directBalance : Number((oldBal + delta).toFixed(3));
          return {
            ...prev,
            currentBalance: newBal,
            balance: newBal
          };
        }
        return prev;
      });

      // 2. Update cached customers list
      setCustomersList((prev) =>
        prev.map((c) => {
          if (c.id === data.customerId) {
            const oldBal = Number(c.currentBalance ?? c.balance ?? 0);
            const newBal = directBalance !== null ? directBalance : Number((oldBal + delta).toFixed(3));
            return { ...c, currentBalance: newBal, balance: newBal };
          }
          return c;
        })
      );
    }
  }, []));

  // Dynamically synchronize active API base when cloud mode toggles
  useEffect(() => {
    setApiBase(getApiBaseUrl());
  }, [isCloudModeActive, activeApiBase]);

  // Secondary Customer Display Initialization & Availability Check
  useEffect(() => {
    CustomerDisplay.isAvailable?.()
      .then((res) => setCustomerScreenReady(res.available))
      .catch(() => setCustomerScreenReady(false));
  }, []);

  // Project cart & running total to Customer Display on second screen
  useEffect(() => {
    const updateCustomerScreen = async () => {
      try {
        if (cart.length === 0) {
          await CustomerDisplay.updateDisplay({
            text: "Welcome to\nAskar Supermarket"
          });
        } else {
          // Show the last scanned item and running total (newest item is on top at cart[0])
          const lastItem = cart[0];
          await CustomerDisplay.updateDisplay({
            text: `${lastItem.name}\nBD ${(lastItem.price ?? (lastItem as any).sellingPrice ?? 0).toFixed(3)}\n\nTOTAL: BD ${total.toFixed(3)}`
          });
        }
      } catch {
        // Silently ignore on PC browsers or when secondary display is absent
      }
    };

    updateCustomerScreen();
  }, [cart, total]);

  // Checkout & Payment Processing
  const processCheckout = async (
    paymentMethod: 'CASH' | 'BENEFIT_PAY' | 'CARD' | 'CREDIT' | 'CREDIT_PERSONAL' | 'CREDIT_MESS',
    isManagerOverridden: boolean = false,
    cashTendered?: number
  ) => {
    if (cart.length === 0) {
      showToast("⚠️ Cart is empty!", 'info');
      return;
    }

    const activeTendered = cashTendered !== undefined ? cashTendered : total;
    const changeDue = activeTendered > total ? activeTendered - total : 0;

    let customerId: string | null = null;
    let customerName = "";
    let previousBalance = 0;
    let newBalance = 0;

    const isCreditPayment = paymentMethod === 'CREDIT' || paymentMethod === 'CREDIT_PERSONAL' || paymentMethod === 'CREDIT_MESS';

    if (isCreditPayment) {
      if (!customer) {
        CustomerDisplay.updateDisplay?.({
          text: `TOTAL: BD ${total.toFixed(3)}\n\nPlease tap your NFC Khata card now.`
        }).catch(() => { });
        showToast("⚠️ Please tap an NFC card or select a customer for Credit sale!", 'info');
        return;
      }

      // 🔒 Sovereign Khata Freeze Enforcement (Account Locked by Customer)
      const isCustFrozen = customer.is_active === 0 || (customer as any).isActive === false || (customer as any).isFrozen;
      if (isCustFrozen) {
        CustomerDisplay.updateDisplay?.({
          text: `${customer.name.toUpperCase()}\n\n🚫 KHATA ACCOUNT FROZEN!\nStore credit purchases are locked.`
        }).catch(() => { });
        showToast(`🚫 KHATA FROZEN: ${customer.name}'s account is locked. In-store credit purchases are disabled.`, 'error');
        return;
      }

      // Check RJ45 write-lock: Prevent concurrent adjustments from Sunmi if Laptop is editing this customer
      const bridgeLock = typeof window !== 'undefined' ? (window as any).__sunmiActiveLock : null;
      if (bridgeLock && (String(bridgeLock.customerId) === String(customer.id) || !bridgeLock.customerId)) {
        showToast(`🔒 Customer [${customer.name}] is currently being edited on Manager Laptop. Transaction paused.`, 'error');
        return;
      }

      customerId = customer.id;
      customerName = customer.name;
      previousBalance = customer.personalBalance ?? customer.currentBalance ?? 0;
      newBalance = previousBalance + total;

      // Hard Credit Limit Enforcement (Idea 2: POS Blocking)
      const rawLimit = Number(customer.creditLimit ?? customer.credit_limit);
      const limit = rawLimit > 0 ? rawLimit : 30.0;
      if (newBalance > limit && !isManagerOverridden && paymentMethod !== 'CREDIT_MESS') {
        CustomerDisplay.updateDisplay?.({
          text: `${customer.name.toUpperCase()}\n\nLIMIT EXCEEDED!\nLIMIT: BD ${limit.toFixed(3)}\nOWED: BD ${newBalance.toFixed(3)}`
        }).catch(() => { });

        setCreditLimitBlockedInfo({
          customer,
          currentBalance: previousBalance,
          saleAmount: total,
          projectedBalance: newBalance,
          creditLimit: limit,
          exceededBy: Number((newBalance - limit).toFixed(3))
        });
        return;
      }

      CustomerDisplay.updateDisplay?.({
        text: `${customer.name.toUpperCase()}\n\nCHARGE: BD ${total.toFixed(3)}\nBALANCE: BD ${newBalance.toFixed(3)}`
      }).catch(() => { });
    }

    // 1. If physical cash is handed over, pop the drawer immediately in background (non-blocking)
    if (paymentMethod === 'CASH') {
      openCashDrawer(changeDue).catch(() => { });
    }

    try {
      const configuredTerminalId = typeof window !== 'undefined'
        ? (localStorage.getItem('terminal_id') || localStorage.getItem('active_terminal_id') || 'T1')
        : 'T1';

      // 2. Build the sale payload with per-item frozen VAT rates and extracted VAT amounts
      const salePayload = {
        id: crypto.randomUUID(),
        tenantId: 'tenant_askar_01',
        terminalId: configuredTerminalId,
        storeId: 'store_askar_01',
        invoiceNo: `INV-${Date.now()}`,
        cart: [...cart],
        subtotal: cartTotals.subtotal,
        totalVat: cartTotals.totalVat,
        vatTotal: cartTotals.totalVat,
        vat: cartTotals.totalVat,
        total: cartTotals.finalTotal,
        totalAmount: cartTotals.finalTotal,
        paymentType: paymentMethod,
        cashTendered: paymentMethod === 'CASH' ? activeTendered : undefined,
        changeDue: paymentMethod === 'CASH' ? changeDue : undefined,
        customerId,
        shiftId: shiftId || localStorage.getItem('active_shift_id') || null,
        employeeId: localStorage.getItem('active_employee_id') || 'emp_cashier_1',
        items: cart.map((item) => {
          const qty = item.qty ?? (item as any).quantity ?? 1;
          const unitPrice = item.price ?? (item as any).sellingPrice ?? 0;
          const lineTotal = Number((unitPrice * qty).toFixed(3));
          const rate = item.vatRate !== undefined
            ? Number(item.vatRate)
            : ((item as any).taxRate !== undefined && (item as any).taxRate === 0 ? 0 : 10);
          const lineTax = rate === 10 ? Number((lineTotal - (lineTotal / 1.10)).toFixed(3)) : 0;
          const prodName = item.name || (item as any).productName || 'Item';
          return {
            id: item.id || `si_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            productId: item.productId || item.id,
            name: prodName,
            productName: prodName,
            barcode: item.barcode || item.productId || item.id,
            quantity: qty,
            qty,
            price: unitPrice,
            sellingPrice: unitPrice,
            priceAtSale: unitPrice,
            unitPrice: unitPrice,
            total_price: lineTotal,
            total: lineTotal,
            costAtSale: item.unitCost ?? (item as any).purchasePrice ?? 0,
            unitCost: item.unitCost ?? (item as any).purchasePrice ?? 0,
            vatRateAtSale: rate,
            vatRate: rate,
            vatAmount: lineTax,
          };
        }),
      };

      // Commit transaction to SQLite backend to guarantee strictly sequential, gapless NBR VAT invoice numbering
      let checkoutEndpoint = `${apiBase}/checkout`;
      let checkoutPayload: any = salePayload;

      const isMessCheckout = paymentMethod === 'CREDIT_MESS' || (paymentMethod === 'CREDIT' && (customer?.isMess || (customer?.hasMessGroup && !customer?.isDual)));

      if (isMessCheckout) {
        checkoutEndpoint = `${apiBase}/api/sales/mess-checkout`;
        checkoutPayload = {
          ...salePayload,
          paymentType: 'MESS_KHATA',
          messId: customer?.mess_id || customer?.messGroup?.id || customer?.id,
          cardUid: customer?.tag_id || customer?.cardUid || lastDetectedUid,
          shopperName: customer?.shopper?.name || customer?.name,
          shopperId: customer?.shopper?.id || customer?.id
        };
      } else if (paymentMethod === 'CREDIT_PERSONAL' || (paymentMethod === 'CREDIT' && customer)) {
        checkoutEndpoint = `${apiBase}/checkout`;
        checkoutPayload = {
          ...salePayload,
          paymentType: 'CREDIT',
          customerId: customer?.id || customerId
        };
      }

      let data: any = null;
      try {
        const reqHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-pos-client': 'store-pos'
        };
        const drSecret = typeof window !== 'undefined' ? localStorage.getItem('DR_SECRET') : null;
        if (drSecret) {
          reqHeaders['x-dr-secret'] = drSecret;
        }
        if (isCloudModeActive) {
          checkoutEndpoint = `${activeApiBase}/api/sales/sync`;
        }

        const res = await fetch(checkoutEndpoint, {
          method: 'POST',
          headers: reqHeaders,
          body: JSON.stringify(checkoutPayload),
          signal: AbortSignal.timeout(isCloudModeActive ? 4000 : 2500)
        });
        if (res.ok) {
          data = await res.json();
        } else {
          try { data = await res.json(); } catch { }
        }
      } catch (netErr) {
        console.warn("Primary checkout request failed (instant zero-block offline fallback):", netErr);
      }

      // Automatic high-availability failover: If primary failed, try Cloudflare Edge fallback
      if (!data || !data.success) {
        const altCandidates = [DEFAULT_EDGE_API_URL].filter(u => !checkoutEndpoint.startsWith(u));
        for (const altBase of altCandidates) {
          try {
            const altUrl = isMessCheckout ? `${altBase}/api/sales/mess-checkout` : `${altBase}/checkout`;
            const altRes = await fetch(altUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-pos-client': 'store-pos'
              },
              body: JSON.stringify(checkoutPayload),
              signal: AbortSignal.timeout(1800)
            });
            if (altRes.ok) {
              const altData = await altRes.json();
              if (altData && altData.success) {
                data = altData;
                setApiBase(altBase);
                localStorage.setItem('master_server_url', altBase);
                break;
              }
            }
          } catch (altErr) {
            console.warn("Alternative checkout host attempt failed:", altErr);
          }
        }
      }

      // ZERO-BLOCK RETAIL SAFEGUARD (Bahrain NBR Article 53 Compliant):
      // Even if master server is unreachable or reports a database error, complete the sale immediately,
      // record it for automatic synchronization, and GUARANTEE the physical receipt prints with a strictly sequential gapless number!
      const isOnlineSuccess = Boolean(data && data.success);
      let verifiedInvoiceNo = isOnlineSuccess
        ? (data.formattedInvoice || data.invoice || data.invoiceNo || '')
        : '';
      if (!verifiedInvoiceNo) {
        try {
          const { invoiceNo: seqNo } = await generateNextInvoiceNumber();
          verifiedInvoiceNo = seqNo;
        } catch {
          verifiedInvoiceNo = generateCompliantInvoiceNumber();
        }
      }

      if (!isOnlineSuccess) {
        try {
          await saveSaleOffline({
            ...checkoutPayload,
            id: checkoutPayload.id || verifiedInvoiceNo,
            invoiceNo: verifiedInvoiceNo,
            offlineTimestamp: new Date().toISOString()
          });
          await updateOfflinePendingCount();
        } catch (err) {
          console.warn('Offline save error:', err);
        }
      }

      // Update pole / customer display
      if (isMessCheckout) {
        CustomerDisplay.updateDisplay?.({
          text: `${(customer?.group_name || 'MESS').toUpperCase()}\n\nTOTAL: BD ${total.toFixed(3)}\nSPLIT: BD ${(data?.splitAmount || 0).toFixed(3)} / EA`
        }).catch(() => { });
      } else if (paymentMethod === 'CASH') {
        CustomerDisplay.updateDisplay?.({
          text: `THANK YOU!\n\nTOTAL: BD ${total.toFixed(3)}\nTENDER: BD ${activeTendered.toFixed(3)}\nCHANGE: BD ${changeDue.toFixed(3)}`
        }).catch(() => { });
      } else if ((paymentMethod === 'CREDIT' || paymentMethod === 'CREDIT_PERSONAL') && customer) {
        CustomerDisplay.updateDisplay?.({
          text: `THANK YOU, ${customer.name.toUpperCase()}!\n\nPAID: BD ${total.toFixed(3)}\nNEW BALANCE: BD ${newBalance.toFixed(3)}`
        }).catch(() => { });
      } else {
        const displayLabel = paymentMethod === 'BENEFIT_PAY' ? 'BENEFIT PAY' : paymentMethod;
        CustomerDisplay.updateDisplay?.({
          text: `THANK YOU!\nVISIT AGAIN\n\n${displayLabel}: BD ${total.toFixed(3)}`
        }).catch(() => { });
      }

      // SELECTIVE THERMAL PRINTING:
      // Only fire built-in 58mm printer automatically if isAutoPrintEnabled is ON
      if (isAutoPrintEnabled) {
        printFullReceipt({
          invoiceNo: verifiedInvoiceNo,
          items: [...cart],
          subtotal,
          vat,
          total,
          paymentMode: isMessCheckout ? 'MESS_KHATA' : paymentMethod,
          cashTendered: paymentMethod === 'CASH' ? activeTendered : undefined,
          changeDue: paymentMethod === 'CASH' ? changeDue : undefined,
          isMess: isMessCheckout,
          groupName: customer?.group_name || customer?.messGroup?.group_name,
          shopperName: isMessCheckout ? (customer?.shopper?.name || customer?.name) : undefined,
          members: data?.splits || customer?.members,
          cardUid: customer?.tag_id || customer?.cardUid || lastDetectedUid || undefined,
          customerId: customer?.id || (customer as any)?.customerId || undefined,
          customerUuid: customer?.id || (customer as any)?.customerId || undefined,
          customerName: isMessCheckout ? (customer?.group_name || customer?.messGroup?.group_name) : (customer?.name || customerName),
          customerCardUid: customer?.cardUid || customer?.tag_id || undefined,
          previousBalance: (!isMessCheckout && (paymentMethod === 'CREDIT' || paymentMethod === 'CREDIT_PERSONAL')) ? previousBalance : undefined,
          newBalance: (!isMessCheckout && (paymentMethod === 'CREDIT' || paymentMethod === 'CREDIT_PERSONAL')) ? newBalance : undefined,
          cashierName: "Register 01"
        }).catch((printErr) => console.warn("Background receipt printing warning:", printErr));
      }

      if (isMessCheckout) {
        const shopperInfo = customer?.name ? ` (Shopper: ${customer.name})` : '';
        showToast(`👥 Mess Bill BD ${total.toFixed(3)} charged & split across ${data?.memberCount || customer?.members?.length} members${shopperInfo}!`, 'success');
      } else if (paymentMethod === 'CREDIT_PERSONAL' || paymentMethod === 'CREDIT') {
        showToast(`📒 Sale BD ${total.toFixed(3)} charged to ${customer?.name}'s Personal Khata!`, 'success');
      } else {
        const formattedMethod = paymentMethod === 'BENEFIT_PAY' ? 'Benefit Pay' : paymentMethod;
        if (isOnlineSuccess) {
          showToast(`🧾 ${formattedMethod} Sale Recorded (#${verifiedInvoiceNo})${isAutoPrintEnabled ? ' & Printed' : ''}. Cart cleared.`, 'success');
        } else {
          showToast(`🧾 ${formattedMethod} Sale Saved Offline (#${verifiedInvoiceNo})${isAutoPrintEnabled ? ' & Printed' : ''}!`, 'success');
        }
      }

      // Professional retail audio greeting
      playThankYouVoice('SALE');

      // Flash Change Due prominently to eliminate cashier calculation mistakes
      if (paymentMethod === 'CASH') {
        setChangeFlashNotice({
          changeDue,
          tendered: activeTendered
        });
        if (changeFlashTimeoutRef.current) clearTimeout(changeFlashTimeoutRef.current);
        changeFlashTimeoutRef.current = setTimeout(() => {
          setChangeFlashNotice(null);
        }, 6000);
      }

      // Record immutable snapshot of completed sale for printable receipt & returns
      const completedSaleSnapshot = {
        invoiceNo: verifiedInvoiceNo,
        items: [...cart],
        subtotal,
        totalVat: vat,
        total,
        paymentMode: isMessCheckout ? 'MESS_KHATA' : paymentMethod,
        cashTendered: paymentMethod === 'CASH' ? activeTendered : undefined,
        changeDue: paymentMethod === 'CASH' ? changeDue : undefined,
        date: `${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`,
        cashierName: localStorage.getItem('active_shift_cashier') || 'Register 01',
        customerName: customer?.name
      };
      setLastCompletedSale(completedSaleSnapshot);
      try {
        saveRecentSale({
          invoiceNo: completedSaleSnapshot.invoiceNo,
          total: completedSaleSnapshot.total,
          subtotal: completedSaleSnapshot.subtotal,
          vat: completedSaleSnapshot.totalVat,
          items: completedSaleSnapshot.items.map((it) => ({
            name: it.name,
            nameAr: it.nameAr || it.name_ar,
            qty: it.qty ?? (it as any).quantity ?? 1,
            price: it.price ?? (it as any).sellingPrice ?? 0,
            vatRate: it.vatRate,
            is_weighed_item: it.is_weighed_item || it.isScaleItem,
            scaleWeight: it.scaleWeight
          })),
          paymentMode: completedSaleSnapshot.paymentMode,
          timestamp: new Date().toISOString(),
          customerName: customer?.name,
          customerPhone: customer?.phone || undefined,
          cashTendered: completedSaleSnapshot.cashTendered,
          changeDue: completedSaleSnapshot.changeDue,
          cashierName: completedSaleSnapshot.cashierName,
        });
      } catch (saveErr) {
        console.warn('Failed saving recent sale:', saveErr);
      }

      // Instantly reset checkout UI (non-blocking)
      clearActiveCart();

      // Refresh catalog, quick products, and customer balances
      fetchCatalog();
      fetchQuickProducts();
      loadCustomers();

      // Fire-and-forget background sync (never blocks cashier speed)
      setTimeout(() => {
        db.sync().catch(() => { });
      }, 500);
    } catch (err) {
      console.error("Checkout error:", err);
      showToast("❌ Error saving sale. Please try again.", 'error');
    }
  };

  // Dedicated Quick Pay Handler
  const handlePayment = (tender?: number) => {
    if (cart.length === 0) {
      showToast("⚠️ Cart is empty!", 'info');
      return;
    }
    if (tender !== undefined) {
      processCheckout('CASH', false, tender);
    } else {
      setPaymentModalMethod('CASH');
      setShowPaymentModal(true);
    }
  };

  // Adjust quantity of the most recently scanned item for +/- speed keys
  const adjustLastItemQty = (delta: 1 | -1) => {
    if (cart.length === 0) {
      showToast("⚠️ Cart is empty - scan an item first", 'info');
      return;
    }

    // Target the most recently scanned/added item or the top item in cart
    const targetItem =
      (lastScannedProductId && cart.find((p) => p.id === lastScannedProductId)) ||
      cart[0];

    if (!targetItem) return;

    const currentQty = targetItem.qty ?? (targetItem as any).quantity ?? 1;
    const newQty = currentQty + delta;

    if (newQty <= 0) {
      useCartStore.getState().removeItem(targetItem.id);
      showToast(`🗑️ Removed "${targetItem.name}" from cart`, 'info');
    } else {
      useCartStore.getState().updateQuantity(targetItem.id, newQty);
      showToast(`⚡ "${targetItem.name}" Qty: ${newQty} (${delta > 0 ? '+1' : '-1'})`, 'info');
    }
  };

  // Adjust quantity for a specific cart row index (Sunmi 60px touch steppers)
  const adjustItemQtyByIndex = (index: number, delta: number) => {
    const targetItem = cart[index];
    if (!targetItem) return;

    const currentQty = targetItem.qty ?? (targetItem as any).quantity ?? 1;
    const isWeighed = Boolean(targetItem.isScaleItem ?? (targetItem as any).is_weighed_item);
    const step = isWeighed ? 0.250 : 1;
    const newQty = Number((currentQty + delta * step).toFixed(3));

    useCartStore.getState().adjustItemQtyByIndex(index, delta, isReturnMode);

    if (newQty <= 0.001) {
      showToast(`🗑️ Removed "${targetItem.name}" from cart`, 'info');
    } else {
      showToast(`⚡ "${targetItem.name}" ${isWeighed ? 'Weight' : 'Qty'}: ${isWeighed ? `${newQty.toFixed(3)} kg` : newQty} (${delta > 0 ? `+${step}` : `-${step}`})`, 'info');
    }
  };

  // Line item price override or discount applicator (Rule 5: Tap-to-Edit Price)
  const applyPriceOverride = (indexOrId: number | string, newUnitPrice: number, discountLabel?: string) => {
    useCartStore.getState().applyPriceOverride(indexOrId as any, newUnitPrice, discountLabel);
    showToast(`💰 Applied ${discountLabel ? `${discountLabel} ` : ''}price: BD ${newUnitPrice.toFixed(3)}`, 'info');
    setPriceOverrideItem(null);

    // Immediately push discount update to customer pole display
    try {
      const activeItems = useCartStore.getState().items;
      const targetItem = typeof indexOrId === 'number' ? activeItems[indexOrId] : activeItems.find(i => i.id === indexOrId);
      const newTotals = calculateCartTotals(activeItems as any);
      if (targetItem) {
        CustomerDisplay.updateDisplay?.({
          text: `${targetItem.name}\n${discountLabel ? `[${discountLabel}] ` : ''}BD ${newUnitPrice.toFixed(3)}\n\nTOTAL: BD ${newTotals.finalTotalStr}`
        }).catch(() => { });
      }
    } catch { }
  };

  // Set explicit quantity for the most recently scanned item
  const setLastItemQty = (qty: number) => {
    if (cart.length === 0) {
      showToast("⚠️ Cart is empty - scan an item first", 'info');
      return;
    }
    const targetItem =
      (lastScannedProductId && cart.find((p) => p.id === lastScannedProductId)) ||
      cart[0];

    if (!targetItem) return;

    if (qty <= 0) {
      useCartStore.getState().removeItem(targetItem.id);
      showToast(`🗑️ Removed "${targetItem.name}" from cart`, 'info');
    } else {
      useCartStore.getState().updateQuantity(targetItem.id, qty);
      showToast(`⚡ "${targetItem.name}" Qty set to ${qty}`, 'info');
    }
  };

  // Dedicated Cashier Touch Numpad Handler
  const handleNumpadInput = (val: string) => {
    if (val === 'C') {
      setSearchQuery('');
    } else if (val === 'BACK') {
      setSearchQuery((prev) => prev.slice(0, -1));
    } else if (val === 'QTY') {
      const parsed = parseInt(searchQuery, 10);
      if (!isNaN(parsed) && parsed > 0) {
        setLastItemQty(parsed);
        setSearchQuery('');
      } else {
        showToast("⚠️ Type quantity number first, then press QTY", "info");
      }
    } else if (val === '+') {
      adjustLastItemQty(1);
    } else if (val === '-') {
      adjustLastItemQty(-1);
    } else {
      setSearchQuery((prev) => prev + val);
    }
  };

  // Global Keyboard Shortcuts Listener (Decoupled with ref to achieve 0ms render latency)
  const shortcutStateRef = useRef({
    viewMode,
    cart,
    customer,
    priceOverrideItem,
    showF12SearchModal,
    showKhataHub,
    showZReportModal,
    showCashOutModal,
    showPaymentModal,
    showRefundModal,
    showPosAddModal,
    showAddProductModal,
    showProductsModal,
    showCustomersModal,
    handlePayment,
    processCheckout,
    setShowKhataHub,
    loadCustomers,
    showToast,
    adjustLastItemQty,
    fetchCatalog,
    setShowF12SearchModal,
    setShowDevPanel,
    setRightPaneMode,
    showOmniPadModal,
    setShowOmniPadModal,
    showPreviousBillsModal,
    setShowPreviousBillsModal,
  });

  useEffect(() => {
    shortcutStateRef.current = {
      viewMode,
      cart,
      customer,
      priceOverrideItem,
      showF12SearchModal,
      showOmniPadModal,
      setShowOmniPadModal,
      showPreviousBillsModal,
      setShowPreviousBillsModal,
      showKhataHub,
      showZReportModal,
      showCashOutModal,
      showPaymentModal,
      showRefundModal,
      showPosAddModal,
      showAddProductModal,
      showProductsModal,
      showCustomersModal,
      handlePayment,
      processCheckout,
      setShowKhataHub,
      loadCustomers,
      showToast,
      adjustLastItemQty,
      fetchCatalog,
      setShowF12SearchModal,
      setShowDevPanel,
      setRightPaneMode,
    };
  });

  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      const s = shortcutStateRef.current;
      // Don't intercept shortcuts if not on the main POS checkout screen
      if (s.viewMode !== 'pos') return;

      // 1. F12: Open / Close Full Inventory Search Overlay
      if (e.key === 'F12' || e.code === 'F12') {
        e.preventDefault();
        s.fetchCatalog();
        s.setShowF12SearchModal((prev: boolean) => !prev);
        return;
      }

      // 1b. F8: Toggle Full-Screen Predictive Omni-Pad Mode
      if (e.key === 'F8' || e.code === 'F8') {
        e.preventDefault();
        s.setShowOmniPadModal((prev: boolean) => !prev);
        return;
      }

      // Escape: Close F12 Search Modal, Omni-Pad, or Previous Bills if open
      if (e.key === 'Escape') {
        if (s.showPreviousBillsModal) {
          e.preventDefault();
          s.setShowPreviousBillsModal(false);
          return;
        }
        if (s.showF12SearchModal) {
          e.preventDefault();
          s.setShowF12SearchModal(false);
          return;
        }
        if (s.showOmniPadModal) {
          e.preventDefault();
          s.setShowOmniPadModal(false);
          return;
        }
      }

      // Ctrl + Shift + D: Toggle Developer Diagnostics Panel
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        s.setShowDevPanel((prev: boolean) => !prev);
        return;
      }

      // Check if modal dialogs are open; don't trigger background checkouts
      const isAnyModalOpen =
        s.priceOverrideItem !== null ||
        s.showF12SearchModal ||
        s.showKhataHub ||
        s.showZReportModal ||
        s.showCashOutModal ||
        s.showPaymentModal ||
        s.showRefundModal ||
        s.showPosAddModal ||
        s.showAddProductModal ||
        s.showProductsModal ||
        s.showCustomersModal;

      if (isAnyModalOpen) return;

      // 2. F1: Trigger Cash Payment Modal & Tender Calculator
      if (e.key === 'F1') {
        e.preventDefault();
        s.handlePayment();
        return;
      }

      // 3. F2: Trigger Card Payment
      if (e.key === 'F2') {
        e.preventDefault();
        if (s.cart.length === 0) {
          s.showToast("⚠️ Cannot checkout: Cart is empty", 'info');
          return;
        }
        s.processCheckout('CARD');
        return;
      }

      // 4. F3: If customer attached to cart, execute Khata / Mess checkout. Otherwise open Khata Hub.
      if (e.key === 'F3') {
        e.preventDefault();
        if (s.cart.length > 0 && s.customer) {
          if (s.customer.hasMessGroup && s.customer.isDual) {
            s.processCheckout('CREDIT_MESS');
          } else if (s.customer.isMess) {
            s.processCheckout('CREDIT_MESS');
          } else {
            s.processCheckout('CREDIT');
          }
          return;
        }
        s.setShowKhataHub(true);
        s.loadCustomers();
        s.showToast("👥 Khata Hub opened [F3]", 'info');
        return;
      }

      // 4b. F9: Open Previous Bills & Reprints Modal
      if (e.key === 'F9' || e.code === 'F9') {
        e.preventDefault();
        s.setShowPreviousBillsModal(true);
        return;
      }

      // 4c. F10: Remote Cash Drawer Kick across network to Sunmi terminal
      if (e.key === 'F10' || e.code === 'F10') {
        e.preventDefault();
        openCashDrawer({ reason: 'HOTKEY_F10' });
        return;
      }

      // 5. + / - : Increment or decrement quantity of most recently scanned item
      const activeEl = document.activeElement;
      const isInputActive =
        activeEl &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName) ||
          activeEl.getAttribute('contenteditable') === 'true');

      if (!isInputActive) {
        if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
          e.preventDefault();
          s.adjustLastItemQty(1);
          return;
        }

        if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
          e.preventDefault();
          s.adjustLastItemQty(-1);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, []);

  // Real-time synchronization to Dual-Screen Customer Presentation Display via BroadcastChannel & LocalStorage
  useEffect(() => {
    const isBenefitPay = showPaymentModal && paymentModalMethod === 'BENEFIT_PAY';
    const currentBenefitConfig = getStoredBenefitPayConfig();
    const benefitQrString = isBenefitPay ? generateBenefitPayPayload(total, `CHECKOUT-${activeCartId}`, currentBenefitConfig) : undefined;

    const legacyPayload = {
      total,
      subtotal,
      vat,
      totalSavings,
      recentItems: cart.map((item) => ({
        id: item.id,
        name: item.name,
        sellingPrice: Number(item.sellingPrice ?? item.price ?? 0),
        price: Number(item.sellingPrice ?? item.price ?? 0),
        originalPrice: Number(item.originalPrice ?? item.sellingPrice ?? item.price ?? 0),
        discountNote: item.discountNote,
        total_price: Number(item.total_price ?? ((item.sellingPrice ?? item.price ?? 0) * (item.quantity ?? (item as any).qty ?? 1))),
        quantity: Number(item.quantity ?? (item as any).qty ?? 1),
        qty: Number(item.quantity ?? (item as any).qty ?? 1),
      })),
      isBenefitPay,
      qrPayload: benefitQrString,
      customerName: customer ? customer.name : undefined,
      customer,
    };

    // Sunmi D2 Mini Dual Screen Broadcast format
    const dualScreenPayload = {
      type: isBenefitPay ? 'SHOW_QR' : 'STATE_UPDATE',
      payload: isBenefitPay ? {
        url: benefitQrString || generateBenefitPayPayload(total, `CHECKOUT-${activeCartId}`, currentBenefitConfig),
        qrPayload: benefitQrString,
        total,
      } : {
        cart: cart.map((item) => ({
          id: item.id,
          name: item.name,
          price: Number(item.sellingPrice ?? item.price ?? 0),
          sellingPrice: Number(item.sellingPrice ?? item.price ?? 0),
          originalPrice: Number(item.originalPrice ?? item.sellingPrice ?? item.price ?? 0),
          discountNote: item.discountNote,
          total_price: Number(item.total_price ?? ((item.sellingPrice ?? item.price ?? 0) * (item.quantity ?? (item as any).qty ?? 1))),
          qty: Number(item.quantity ?? (item as any).qty ?? 1),
          quantity: Number(item.quantity ?? (item as any).qty ?? 1),
        })),
        total,
        subtotal,
        vat,
        totalSavings,
        customer,
      }
    };

    // Non-blocking off-main-thread dispatch for customer presentation display
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('askar_customer_display_state', JSON.stringify(legacyPayload));
        const channel1 = new BroadcastChannel('askar_customer_display_channel');
        channel1.postMessage(legacyPayload);
        channel1.close();

        const channel2 = new BroadcastChannel('sunmi_dual_screen');
        channel2.postMessage(dualScreenPayload);
        channel2.close();
      } catch {
        // ignore
      }
    }, 40);

    return () => clearTimeout(timer);
  }, [cart, total, subtotal, vat, customer, showPaymentModal, paymentModalMethod]);

  // ⚡ Broadcast counter cart to Store Manager Laptop over RJ45 bridge
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('sunmi-cart-broadcast', {
      detail: {
        cart,
        total,
        customer,
        activeCartId
      }
    }));
  }, [cart, total, customer, activeCartId]);

  // Live Cart & Total Reference to prevent stale closures in event listeners
  const liveCartTotalRef = useRef({ cart, total });
  useEffect(() => {
    liveCartTotalRef.current = { cart, total };
  }, [cart, total]);

  // ⚡ Remote Commands from Manager Laptop (:5175) & Cloudflare Webhook
  useEffect(() => {
    const handleRemoteDrawerKick = (e: any) => {
      console.log('⚡ [POS Terminal] Remote Drawer Kick triggered:', e?.detail);
      openCashDrawer(e?.detail?.saleTotal);
    };

    const handleRemoteClearCart = () => {
      console.log('🗑️ [POS Terminal] Remote Clear Cart triggered by Manager Laptop');
      clearActiveCart();
      showToast('🗑️ Cart cleared remotely by Store Manager', 'info');
    };

    const handleRemoteBenefitSuccess = (e: any) => {
      const detail = e?.detail || {};
      const amt = detail?.amount !== undefined && detail?.amount !== null ? Number(detail.amount) : null;
      console.log('⚡ [POS Terminal] Remote Fawri+ payment received on CheckoutScreen:', detail);
      const { cart: currentCart, total: currentTotal } = liveCartTotalRef.current;
      if (currentCart && currentCart.length > 0 && amt !== null && Math.abs(amt - currentTotal) < 0.005) {
        showToast(`⚡ Fawri+ Payment received (BHD ${amt.toFixed(3)})! Auto-settling...`, 'success');
        setPendingBenefitPayment(detail);
        setPaymentModalMethod('BENEFIT_PAY');
        setShowPaymentModal(true);
      }
    };

    window.addEventListener('sunmi-remote-drawer-kick', handleRemoteDrawerKick);
    window.addEventListener('sunmi-remote-clear-cart', handleRemoteClearCart);
    window.addEventListener('sunmi-remote-benefit-success', handleRemoteBenefitSuccess);

    return () => {
      window.removeEventListener('sunmi-remote-drawer-kick', handleRemoteDrawerKick);
      window.removeEventListener('sunmi-remote-clear-cart', handleRemoteClearCart);
      window.removeEventListener('sunmi-remote-benefit-success', handleRemoteBenefitSuccess);
    };
  }, [activeCartId]);

  // Gated Back-Office views on Sunmi terminal: Prompt for Manager PIN or redirect to Laptop Hub (:5175)
  if (viewMode !== 'pos' && !emergencyUnlocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen w-screen bg-slate-900 text-slate-100 p-6 select-none font-sans">
        <div className="max-w-md w-full bg-slate-800/90 border border-slate-700/80 rounded-3xl p-8 shadow-2xl backdrop-blur-xl text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-5 shadow-lg">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">Dedicated Cashier Terminal</h2>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">
            Askar Back-Office ERP, P&amp;L reports, and supplier inventory are managed on the Store Manager's Laptop at:
          </p>
          <div className="mt-3 py-2 px-4 bg-slate-900/80 rounded-xl border border-slate-700 font-mono text-xs text-emerald-400 font-bold flex items-center justify-center gap-2">
            <span>💻 http://localhost:5175/</span>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => {
                setViewMode('pos');
                if (typeof window !== 'undefined') {
                  const url = new URL(window.location.href);
                  url.searchParams.delete('view');
                  window.history.replaceState({}, '', url.toString());
                }
              }}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg transition active:scale-95 cursor-pointer text-sm"
            >
              ← Return to Fast Checkout Register
            </button>

            <a
              href="http://localhost:5175/"
              target="_blank"
              rel="noreferrer"
              className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-xl text-xs transition text-center"
            >
              Open Manager Laptop Hub (:5175) ↗
            </a>
          </div>

          {/* Emergency On-POS Unlock PIN */}
          <div className="mt-8 pt-6 border-t border-slate-700/60">
            <p className="text-xs text-slate-500 mb-3 font-semibold uppercase tracking-wider">
              Emergency Manager Override (Sunmi Local)
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                maxLength={4}
                value={emergencyPinInput}
                onChange={(e) => {
                  setEmergencyPinInput(e.target.value);
                  setEmergencyPinError(false);
                }}
                placeholder="PIN"
                className="flex-1 text-center font-mono text-lg py-2 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                onClick={() => {
                  if (emergencyPinInput.trim() === getManagerPin()) {
                    setEmergencyUnlocked(true);
                    setEmergencyPinError(false);
                  } else {
                    setEmergencyPinError(true);
                  }
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Unlock
              </button>
            </div>
            {emergencyPinError && (
              <p className="text-xs text-red-400 mt-2 font-semibold">Invalid PIN. Authorized manager PIN required.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'dashboard') {
    const dashboardUrl = `http://${typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'localhost'}:5177`;
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-8 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center mb-4 text-2xl font-black">
          👔
        </div>
        <h2 className="text-2xl font-bold mb-2">Manager Command Center</h2>
        <p className="text-slate-400 max-w-sm mb-6 text-xs">
          The back-office suite runs on the Master Laptop. Tap below to launch or return to the register.
        </p>
        <div className="flex gap-3">
          <a
            href={dashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition shadow-md"
          >
            Open Laptop Suite ↗
          </a>
          <button
            type="button"
            onClick={() => setViewMode('pos')}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs cursor-pointer"
          >
            Back to Cart
          </button>
        </div>
      </div>
    );
  }

  if (viewMode === 'stock') {
    return (
      <div style={{ height: '100vh', width: '100vw', backgroundColor: '#f8fafc', overflowY: 'auto' }}>
        <Suspense fallback={<div className="flex items-center justify-center h-screen w-screen bg-slate-50 text-slate-700 font-bold text-lg">Loading Stock & Inventory...</div>}>
          <StockManagement
            apiBase={apiBase}
            onBackToPos={() => setViewMode('pos')}
          />
        </Suspense>
      </div>
    );
  }

  if (viewMode === 'pnl') {
    return (
      <div style={{ height: '100vh', width: '100vw', backgroundColor: '#f8fafc', overflowY: 'auto' }}>
        <Suspense fallback={<div className="flex items-center justify-center h-screen w-screen bg-slate-50 text-slate-700 font-bold text-lg">Loading Financial Dashboard...</div>}>
          <FinancialDashboard
            apiBase={apiBase}
            onBackToPos={() => setViewMode('pos')}
          />
        </Suspense>
      </div>
    );
  }

  if (viewMode === 'master') {
    return (
      <div style={{ height: '100vh', width: '100vw', backgroundColor: '#f8fafc', overflowY: 'auto' }}>
        <Suspense fallback={<div className="flex items-center justify-center h-screen w-screen bg-slate-50 text-slate-700 font-bold text-lg">Loading Command Center...</div>}>
          <MasterReport
            apiBase={apiBase}
            onBackToPos={() => setViewMode('pos')}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-100 overflow-hidden font-sans select-none text-slate-900 relative">

      {/* Live Master Network Sync Status Indicator */}
      <div
        className={`absolute top-2 right-2 w-3 h-3 rounded-full z-50 transition-colors ${isServerOnline ? 'bg-green-500 shadow-xs shadow-green-500/50' : 'bg-red-500 shadow-xs shadow-red-500/50'}`}
        title={isServerOnline ? "Master PC Online (Real-Time Sync Active)" : "Master PC Offline (Standalone POS Mode)"}
      />

      {/* Instant Non-blocking Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-xl shadow-2xl font-bold text-sm flex items-center gap-2 text-white animate-in slide-in-from-top-2 ${toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-slate-800'
            }`}
        >
          {toast.message}
        </div>
      )}

      {/* Disaster Recovery 60s Outage Warning Banner */}
      {showDrPrompt && !isCloudModeActive && (
        <div className="bg-orange-500 text-white px-4 py-2.5 font-bold flex justify-between items-center z-50 shadow-md">
          <span className="text-xs sm:text-sm">⚠️ CRITICAL: Local Server is unresponsive (60s+ outage). Local offline sales active.</span>
          <button
            type="button"
            onClick={() => setIsCloudModeActive(true)}
            className="bg-red-700 hover:bg-red-800 text-white text-xs px-3 py-1.5 rounded-lg shadow-sm font-bold transition active:scale-95 cursor-pointer ml-3 shrink-0"
          >
            Activate Cloud Fallback Mode
          </button>
        </div>
      )}

      {/* Cloud Mode Active Indicator */}
      {isCloudModeActive && (
        <div className="bg-red-600 text-white p-2 text-center font-bold text-xs tracking-widest animate-pulse shadow-md flex items-center justify-center gap-3 z-50">
          <span>⚡ EMERGENCY CLOUD MODE ACTIVE ⚡</span>
          <button
            type="button"
            onClick={() => setIsCloudModeActive(false)}
            className="text-[11px] underline font-normal hover:text-red-200 cursor-pointer"
          >
            (Switch Back to Local Server)
          </button>
        </div>
      )}

      {/* TOP FULL-WIDTH HEADER */}
      <header className="h-14 bg-white border-b border-slate-200/90 flex items-center justify-between px-3 md:px-4 shrink-0 z-20 shadow-xs select-none">
        {/* Left: Brand & Status Capsule */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2">
            <h1
              onDoubleClick={() => setShowDevPanel((prev) => !prev)}
              className="font-black text-xl tracking-tight text-slate-800 cursor-pointer select-none whitespace-nowrap"
              title="Double-click to toggle Dev Tools (or Ctrl+Shift+D)"
            >
              Askar POS
            </h1>

            {/* Interactive Fleet Terminal Switcher */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTerminalMenu(!showTerminalMenu)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition border cursor-pointer shadow-xs ${currentTerminal === 'T1' ? 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100' :
                  currentTerminal === 'T2' ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100' :
                    currentTerminal === 'T4' ? 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100' :
                      currentTerminal === 'M1' || currentTerminal === 'M2' ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100' :
                        'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
                  }`}
                title="Click to switch active POS terminal (Sunmi / Handheld / Laptop / Mobile Phone)"
              >
                {currentTerminal === 'T1' ? <Monitor size={13} className="text-blue-600" /> :
                  currentTerminal === 'T2' ? <Smartphone size={13} className="text-amber-600" /> :
                    currentTerminal === 'T4' ? <Laptop size={13} className="text-teal-600" /> :
                      currentTerminal === 'M1' || currentTerminal === 'M2' ? <Smartphone size={13} className="text-emerald-600" /> :
                        <Laptop size={13} className="text-purple-600" />}
                <span className="font-mono text-[11px] font-black">
                  {currentTerminal === 'T1' ? 'T1: Sunmi' :
                    currentTerminal === 'T2' ? 'T2: F100' :
                      currentTerminal === 'T4' ? 'T4: Desktop 2' :
                        currentTerminal === 'M1' ? 'M1: Phone 1' :
                          currentTerminal === 'M2' ? 'M2: Phone 2' :
                            'T3: Desktop 1'}
                </span>
                <ChevronDown size={11} className="text-slate-500" />
              </button>

              {showTerminalMenu && (
                <div className="absolute top-full left-0 mt-1.5 w-64 bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl py-2 z-50 text-white animate-in fade-in zoom-in-95">
                  <div className="px-3 py-1.5 border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Active POS Terminal</span>
                    <span className="text-[9px] font-mono text-emerald-400">FLEET LINK</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSwitchTerminal('T1')}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold hover:bg-slate-800 transition cursor-pointer ${currentTerminal === 'T1' ? 'text-blue-400 bg-blue-950/40' : 'text-slate-200'}`}
                  >
                    <span className="flex items-center gap-2">
                      <Monitor size={14} className="text-blue-400" />
                      <span>Counter 1 (Sunmi D2 Mini)</span>
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">T1</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchTerminal('T2')}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold hover:bg-slate-800 transition cursor-pointer ${currentTerminal === 'T2' ? 'text-amber-400 bg-amber-950/40' : 'text-slate-200'}`}
                  >
                    <span className="flex items-center gap-2">
                      <Smartphone size={14} className="text-amber-400" />
                      <span>Counter 2 (Feitian F100)</span>
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">T2</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchTerminal('T3')}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold hover:bg-slate-800 transition cursor-pointer ${currentTerminal === 'T3' ? 'text-purple-400 bg-purple-950/40' : 'text-slate-200'}`}
                  >
                    <span className="flex items-center gap-2">
                      <Laptop size={14} className="text-purple-400" />
                      <span>Counter 3 (Desktop Web POS 1)</span>
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">T3</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchTerminal('T4')}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold hover:bg-slate-800 transition cursor-pointer ${currentTerminal === 'T4' ? 'text-teal-400 bg-teal-950/40' : 'text-slate-200'}`}
                  >
                    <span className="flex items-center gap-2">
                      <Laptop size={14} className="text-teal-400" />
                      <span>Counter 4 (Desktop Web POS 2)</span>
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">T4</span>
                  </button>
                  <div className="my-1 border-t border-slate-800" />
                  <button
                    type="button"
                    onClick={() => handleSwitchTerminal('M1')}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold hover:bg-slate-800 transition cursor-pointer ${currentTerminal === 'M1' ? 'text-emerald-400 bg-emerald-950/40' : 'text-slate-200'}`}
                  >
                    <span className="flex items-center gap-2">
                      <Smartphone size={14} className="text-emerald-400" />
                      <span>Floor Phone 1 (Mobile Web POS)</span>
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">M1</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchTerminal('M2')}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold hover:bg-slate-800 transition cursor-pointer ${currentTerminal === 'M2' ? 'text-emerald-400 bg-emerald-950/40' : 'text-slate-200'}`}
                  >
                    <span className="flex items-center gap-2">
                      <Smartphone size={14} className="text-emerald-400" />
                      <span>Floor Phone 2 (Mobile Web POS)</span>
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">M2</span>
                  </button>
                </div>
              )}
            </div>

            <span className="hidden sm:inline-block px-2 py-0.5 rounded-md text-[10px] font-black bg-slate-100 text-slate-600 uppercase tracking-wider border border-slate-200/60">
              Scan-First
            </span>
          </div>

          <div className="h-5 w-px bg-slate-200 mx-0.5"></div>

          {/* System Status Tray Capsule */}
          <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-50 border border-slate-200/80 rounded-xl text-slate-400">
            <span
              className={`w-2 h-2 rounded-full transition-colors ${isServerOnline ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50' : 'bg-red-500 shadow-xs shadow-red-500/50'}`}
              title={isServerOnline ? "Master Server Online (WebSocket Active)" : "Master Server Offline (Standalone Mode)"}
            />
            <span title={hardwareSupported ? "Wi-Fi & Hardware Online" : "Network Standalone"}>
              <Wifi size={14} className={hardwareSupported ? "text-emerald-500" : "text-slate-400"} />
            </span>
            <span title="Zero-Touch Scanner Hardware Ready (Listening globally)">
              <ScanLine size={14} className="text-emerald-500" />
            </span>
            <span title={syncInfo && syncInfo.pendingCount > 0 ? `${syncInfo.pendingCount} offline transactions queued` : "Local SQLite Database in Sync"}>
              <HardDrive size={14} className={syncInfo && syncInfo.pendingCount > 0 ? "text-amber-500" : "text-slate-400"} />
            </span>
            <button
              type="button"
              onClick={handleManualSync}
              className="p-0.5 hover:text-slate-700 transition-colors cursor-pointer"
              title="Push offline sales to Master PC"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* Right: Quick Actions & Navigation */}
        <div className="flex items-center gap-1.5">
          {/* F12 SEARCH TRIGGER BUTTON */}
          <button
            type="button"
            onClick={() => {
              fetchCatalog();
              setShowF12SearchModal(true);
            }}
            className="h-9 flex items-center gap-1.5 px-3 bg-blue-50/90 hover:bg-blue-100 active:scale-95 text-blue-700 font-bold rounded-xl text-xs border border-blue-200/80 transition-all cursor-pointer whitespace-nowrap shadow-xs"
            title="Manual item search overlay [F12]"
          >
            <Search size={14} className="text-blue-600" />
            <span>Search</span>
            <kbd className="bg-blue-200/80 px-1.5 py-0.5 rounded text-[10px] font-mono text-blue-900 leading-none">F12</kbd>
          </button>

          {/* AUTO-PRINT TOGGLE */}
          <button
            type="button"
            onClick={toggleAutoPrint}
            className={`h-9 flex items-center gap-1.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap shadow-xs active:scale-95 ${isAutoPrintEnabled
              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
              : 'bg-slate-50 text-slate-600 border-slate-200/90 hover:bg-slate-100'
              }`}
            title="Toggle between Auto-Print and Selective Print on Demand"
          >
            <Printer size={14} className={isAutoPrintEnabled ? 'text-emerald-600' : 'text-slate-400'} />
            <span>Print: {isAutoPrintEnabled ? 'ON' : 'OFF'}</span>
          </button>

          {/* RECEIPT ROLL FORMAT & PRINTER STYLING */}
          <button
            type="button"
            onClick={() => setShowPrinterStyleModal(true)}
            className="h-9 flex items-center gap-1.5 px-2.5 bg-sky-50 hover:bg-sky-100 active:scale-95 text-sky-900 font-bold rounded-xl text-xs border border-sky-300 transition-all cursor-pointer whitespace-nowrap shadow-xs"
            title="Configure Thermal Bill Receipt Styling & Sunmi Innerprinter Options"
          >
            <Settings size={13} className="text-sky-600" />
            <span className="text-[10px] px-1 py-0.5 rounded bg-sky-200/90 font-mono text-sky-950 font-black">
              {receiptFormat.toUpperCase()}
            </span>
            <span className="hidden sm:inline">Receipt Style</span>
          </button>

          {/* KHATA (F3) */}
          <button
            type="button"
            onClick={() => {
              setShowKhataHub(true);
              loadCustomers();
            }}
            className="h-9 flex items-center gap-1.5 px-3 bg-slate-50 hover:bg-slate-100 active:scale-95 text-slate-700 font-bold rounded-xl text-xs border border-slate-200/90 transition-all cursor-pointer whitespace-nowrap shadow-xs"
            title="Khata Hub & Customer Ledger [F3]"
          >
            <CreditCard size={14} className="text-indigo-600" />
            <span>Khata</span>
            <kbd className="bg-slate-200/80 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-700 leading-none">F3</kbd>
          </button>

          {/* NFC CARDS */}
          <button
            type="button"
            onClick={() => {
              setShowNfcManager(true);
            }}
            className="h-9 flex items-center gap-1.5 px-3 bg-emerald-50 hover:bg-emerald-100 active:scale-95 text-emerald-800 font-bold rounded-xl text-xs border border-emerald-300 transition-all cursor-pointer whitespace-nowrap shadow-xs"
            title="NFC Card Manager & Mess Groups"
          >
            <Radio size={14} className="text-emerald-600 animate-pulse" />
            <span>NFC Cards</span>
          </button>

          {/* 🧾 PREVIOUS BILLS & REPRINTS (F9) */}
          <button
            type="button"
            onClick={() => setShowPreviousBillsModal(true)}
            className="h-9 flex items-center gap-1.5 px-3 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-bold rounded-xl text-xs border border-slate-700 transition-all cursor-pointer whitespace-nowrap shadow-xs"
            title="Search & Reprint Previous Bills [F9]"
          >
            <Receipt size={14} className="text-green-400" />
            <span>Previous Bills</span>
            <kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-300 border border-slate-700 leading-none">F9</kbd>
          </button>

          {/* ⚡ CASH DRAWER TRIGGER (F10) */}
          <button
            type="button"
            onClick={async () => {
              await openCashDrawer({ reason: 'HEADER_TRIGGER' });
            }}
            className="h-9 flex items-center gap-1.5 px-3 bg-amber-50 hover:bg-amber-100 active:scale-95 text-amber-900 font-bold rounded-xl text-xs border border-amber-300 transition-all cursor-pointer whitespace-nowrap shadow-xs hover:border-amber-400"
            title="Kick Sunmi Cash Drawer Across Network [F10]"
          >
            <Coins size={14} className="text-amber-600" />
            <span>Open Drawer</span>
            <kbd className="bg-amber-200/80 px-1.5 py-0.5 rounded text-[10px] font-mono text-amber-900 leading-none">F10</kbd>
          </button>

          {/* ⚡ MANAGER & OPERATIONS TRAY (ALL 9 TOOLS 100% PRESERVED & TOUCH-FRIENDLY) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreActionsMenu(!showMoreActionsMenu)}
              className={`h-9 flex items-center gap-1.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap shadow-xs active:scale-95 border ${showMoreActionsMenu
                ? 'bg-slate-900 text-white border-slate-900 ring-2 ring-slate-400'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-300'
                }`}
              title="Manager Operations & Tools (Receiving, Receipts, Mess, Refund, Drawer, Cash Out, Shift, Financials, Settings)"
            >
              <span>⚡ More Actions</span>
              <span className="bg-amber-400 text-slate-950 font-black text-[10px] px-1.5 py-0.2 rounded-full">
                9
              </span>
              <ChevronDown size={12} className={`transition-transform duration-200 ${showMoreActionsMenu ? 'rotate-180' : ''}`} />
            </button>

            {showMoreActionsMenu && (
              <>
                {/* Backdrop to close on tap outside */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowMoreActionsMenu(false)}
                />

                {/* 9-Tool Grid Popover */}
                <div className="absolute top-full right-0 mt-2 w-80 bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl p-3 z-50 text-white animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-1 pb-2 mb-2 border-b border-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>⚡ Operations & Back-Office</span>
                    <span className="text-[9px] font-mono text-emerald-400">100% PRESERVED</span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {/* RECEIVING */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreActionsMenu(false);
                        setShowOrderHistoryDrawer(false);
                        setShowReceivingDrawer(true);
                      }}
                      className="flex items-center gap-2 p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-200 transition cursor-pointer text-left"
                    >
                      <Truck size={15} className="text-emerald-400 shrink-0" />
                      <span className="truncate">Receiving</span>
                    </button>

                    {/* RECEIPTS */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreActionsMenu(false);
                        setShowReceivingDrawer(false);
                        setShowOrderHistoryDrawer(true);
                      }}
                      className="flex items-center gap-2 p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-200 transition cursor-pointer text-left"
                    >
                      <Receipt size={15} className="text-blue-400 shrink-0" />
                      <span className="truncate">Receipts</span>
                    </button>

                    {/* MESS GROUPS */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreActionsMenu(false);
                        setShowMessModal(true);
                      }}
                      className="flex items-center gap-2 p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-200 transition cursor-pointer text-left"
                    >
                      <Users size={15} className="text-indigo-400 shrink-0" />
                      <span className="truncate">Mess Groups</span>
                    </button>

                    {/* REFUND */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreActionsMenu(false);
                        setIsReturnMode((prev) => !prev);
                        setShowRefundModal(true);
                      }}
                      className="flex items-center gap-2 p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-200 transition cursor-pointer text-left"
                    >
                      <RotateCcw size={15} className="text-rose-400 shrink-0" />
                      <span className="truncate">Refund</span>
                    </button>

                    {/* CASH DRAWER */}
                    <button
                      type="button"
                      onClick={async () => {
                        setShowMoreActionsMenu(false);
                        const storedPin = localStorage.getItem('manager_pin') || '9999';
                        const inputPin = window.prompt('🔒 Enter Manager PIN to open cash drawer (No-Sale):');
                        if (inputPin !== storedPin) {
                          if (inputPin !== null) {
                            showToast('❌ Invalid Manager PIN', 'error');
                          }
                          return;
                        }

                        const ok = await kickCashDrawer({ pin: inputPin, reason: 'MANAGER_OVERRIDE_NO_SALE' });
                        if (ok) {
                          showToast('⚡ Cash Drawer opened [Manager Override]', 'success');
                          try {
                            fetch(`${apiBase}/api/expenses`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                type: 'BUSINESS',
                                category: 'MISC_BUSINESS',
                                amount: 0,
                                description: `Manual No-Sale Drawer Kick by Cashier: ${localStorage.getItem('active_shift_cashier') || 'Staff'}`,
                                recordedBy: 'Manager'
                              })
                            }).catch(() => { });
                          } catch (_) { }
                        } else {
                          showToast('⚠️ Cash Drawer kick failed', 'error');
                        }
                      }}
                      className="flex items-center gap-2 p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-200 transition cursor-pointer text-left"
                    >
                      <Coins size={15} className="text-amber-400 shrink-0" />
                      <span className="truncate">Drawer Kick</span>
                    </button>

                    {/* CASH OUT */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreActionsMenu(false);
                        setShowCashOutModal(true);
                      }}
                      className="flex items-center gap-2 p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-200 transition cursor-pointer text-left"
                    >
                      <Banknote size={15} className="text-rose-400 shrink-0" />
                      <span className="truncate">Cash Out</span>
                    </button>

                    {/* CLOSE SHIFT */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreActionsMenu(false);
                        setShowBlindCloseModal(true);
                      }}
                      className="flex items-center gap-2 p-2 bg-amber-600/90 hover:bg-amber-600 rounded-xl text-xs font-bold text-white transition cursor-pointer text-left shadow-xs"
                    >
                      <Lock size={15} className="text-white shrink-0" />
                      <span className="truncate">Close Shift</span>
                    </button>

                    {/* FINANCIALS & P&L */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreActionsMenu(false);
                        const storedPin = getManagerPin();
                        const inputPin = window.prompt('🔒 Enter Manager PIN to view Financials & P&L Statement:');
                        if (inputPin !== storedPin) {
                          if (inputPin !== null) {
                            showToast('❌ Invalid Manager PIN', 'error');
                          }
                          return;
                        }
                        setEmergencyUnlocked(true);
                        setViewMode('pnl');
                      }}
                      className="flex items-center gap-2 p-2 bg-emerald-700/90 hover:bg-emerald-700 rounded-xl text-xs font-bold text-white transition cursor-pointer text-left shadow-xs"
                    >
                      <TrendingUp size={15} className="text-white shrink-0" />
                      <span className="truncate">Financials</span>
                    </button>

                    {/* ALL TRANSACTIONS (MASTER REPORT & DATE FILTER) */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreActionsMenu(false);
                        const storedPin = getManagerPin();
                        const inputPin = window.prompt('🔒 Enter Manager PIN to view Full Transaction History:');
                        if (inputPin !== storedPin) {
                          if (inputPin !== null) {
                            showToast('❌ Invalid Manager PIN', 'error');
                          }
                          return;
                        }
                        setEmergencyUnlocked(true);
                        setViewMode('master');
                      }}
                      className="flex items-center gap-2 p-2 bg-indigo-700/90 hover:bg-indigo-700 rounded-xl text-xs font-bold text-white transition cursor-pointer text-left shadow-xs"
                    >
                      <FileText size={15} className="text-white shrink-0" />
                      <span className="truncate">All Transactions</span>
                    </button>

                    {/* PREVIOUS BILLS & REPRINTS (NO MANAGER PIN NEEDED) */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreActionsMenu(false);
                        setShowPreviousBillsModal(true);
                      }}
                      className="flex items-center gap-2 p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-green-400 transition cursor-pointer text-left"
                    >
                      <Receipt size={15} className="text-green-400 shrink-0" />
                      <span className="truncate">Previous Bills [F9]</span>
                    </button>

                    {/* SUNMI INNERPRINTER & RECEIPT STYLING */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreActionsMenu(false);
                        setShowPrinterStyleModal(true);
                      }}
                      className="col-span-2 flex items-center justify-center gap-2 p-2 bg-sky-950/70 hover:bg-sky-900 border border-sky-700/70 rounded-xl text-xs font-bold text-sky-300 transition cursor-pointer text-center"
                    >
                      <Printer size={15} className="text-sky-400 shrink-0" />
                      <span>🖨️ Printer & Bill Receipt Style</span>
                    </button>

                    {/* DEV DIAGNOSTICS & SETTINGS */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreActionsMenu(false);
                        setShowDevPanel(true);
                      }}
                      className="col-span-2 flex items-center justify-center gap-2 p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 transition cursor-pointer text-center"
                    >
                      <Settings size={15} className="text-slate-400 shrink-0" />
                      <span>Diagnostics & Settings [Ctrl+Shift+D]</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* OFFLINE SALES QUEUE DRAIN BADGE */}
          {offlinePendingCount > 0 && (
            <button
              type="button"
              onClick={() => drainOfflineQueue()}
              disabled={isDrainingOfflineSales}
              className="h-9 flex items-center gap-1.5 px-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-xl font-bold text-xs transition-all shadow-xs cursor-pointer animate-pulse select-none"
              title="Offline sales queued in device memory. Tap to sync immediately."
            >
              <RefreshCw size={12} className={isDrainingOfflineSales ? "animate-spin" : ""} />
              <span>{offlinePendingCount} Queued</span>
            </button>
          )}

          {/* THE OFFLINE SYNC TRAFFIC LIGHT (TOP-RIGHT CORNER) */}
          <SyncTrafficLight
            status={syncStatus}
            lastSyncTime={lastSyncTime}
            offlineHours={offlineHours}
            onSyncNow={performSync}
            onBackupNow={exportDatabaseBackup}
            isExporting={isExporting}
            className="h-9 px-3 rounded-xl"
          />
        </div>
      </header>

      {/* Prolonged Offline Notice (Only if unsynced sales exist and not dismissed) */}
      {syncStatus === 'OFFLINE_WARNING' && (offlinePendingCount || 0) > 0 && !offlineBannerDismissed && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-900 dark:text-amber-200 px-4 py-2 text-xs font-medium flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-base">⚡</span>
            <span>
              Offline Mode ({offlinePendingCount} sale{offlinePendingCount > 1 ? 's' : ''} stored locally). Connect to Wi-Fi to sync with central database.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportDatabaseBackup()}
              className="px-2.5 py-1 bg-amber-600 text-white rounded text-[11px] font-bold hover:bg-amber-700 transition"
            >
              Export Backup
            </button>
            <button
              type="button"
              onClick={() => setOfflineBannerDismissed(true)}
              className="p-1 hover:bg-amber-500/20 rounded text-amber-800 dark:text-amber-300 font-bold text-sm leading-none"
              title="Dismiss notice"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Barcode Assigner Banner (Only when assigning barcode to product) */}
      {bindingProductId && (() => {
        const targetProduct = catalog.find((p) => p.id === bindingProductId);
        return (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between text-sm shrink-0">
            <span className="font-bold text-amber-900">
              📷 Barcode Assigner Active: <span className="underline">{targetProduct?.name || 'Selected Item'}</span>. Pull scanner trigger or type:
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Barcode..."
                value={manualBarcodeAssignInput}
                onChange={(e) => setManualBarcodeAssignInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && manualBarcodeAssignInput.trim()) {
                    handleBindBarcode(bindingProductId, manualBarcodeAssignInput.trim());
                  }
                }}
                className="px-2.5 py-1 bg-white border border-amber-300 rounded text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => {
                  if (manualBarcodeAssignInput.trim()) {
                    handleBindBarcode(bindingProductId, manualBarcodeAssignInput.trim());
                  }
                }}
                className="px-2.5 py-1 bg-amber-600 text-white rounded text-xs font-bold"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setBindingProductId(null);
                  setManualBarcodeAssignInput('');
                }}
                className="px-2 py-1 text-slate-500 text-xs hover:text-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      {/* Unassigned Scanned Barcode Alert */}
      {unassignedBarcode && !bindingProductId && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 flex items-center justify-between text-xs shrink-0">
          <span className="font-bold text-red-800">
            ⚠️ Unknown Barcode: <span className="font-mono bg-red-100 px-1.5 py-0.5 rounded text-red-900">{unassignedBarcode}</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowProductsModal(true);
                setManualBarcodeAssignInput(unassignedBarcode);
              }}
              className="px-2.5 py-1 bg-slate-800 text-white rounded font-bold hover:bg-slate-900"
            >
              Link to Product
            </button>
            <button
              type="button"
              onClick={() => {
                setShowProductsModal(true);
              }}
              className="px-2.5 py-1 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700"
            >
              Add as New
            </button>
            <button
              type="button"
              onClick={() => setUnassignedBarcode(null)}
              className="text-slate-400 hover:text-slate-600 px-1 font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* MAIN TWO-SECTION WORKSPACE */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* SECTION 1: THE ACTIVE RECEIPT (CART & NUMPAD & PAYMENTS) - LEFT SIDE */}
        <div className="w-[44%] min-w-[390px] max-w-[480px] bg-white border-r border-slate-200 flex flex-col h-full overflow-hidden shadow-xs">
          {/* Cart Header */}
          <div className="h-12 border-b border-slate-200 flex items-center justify-between px-3 shrink-0 bg-slate-50">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="flex items-center gap-1 font-bold text-slate-700 text-xs truncate">
                <ShoppingCart size={15} />
                <span>{activeCart.name}</span>
              </div>
              {/* Multi-cart switcher tabs */}
              {carts.length > 1 && (
                <div className="flex items-center gap-1 ml-0.5">
                  {carts.map((c, idx) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setActiveCartId(c.id)}
                      className={`h-5 px-1.5 rounded text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-0.5 ${c.id === activeCartId
                        ? 'bg-slate-800 text-white'
                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        }`}
                    >
                      <span>{idx + 1}</span>
                      {carts.length > 1 && (
                        <span
                          onClick={(e) => closeTab(c.id, e)}
                          className="text-slate-400 hover:text-red-400 ml-0.5 text-[10px]"
                          title="Close tab"
                        >
                          ×
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {carts.length < 4 && (
                <button
                  type="button"
                  onClick={addNewTab}
                  className="p-0.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                  title="Park active cart & open new tab"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {customer ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomer(null);
                      clearScan();
                    }}
                    className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border flex items-center gap-1 shadow-xs ${(customer.is_active === 0 || (customer as any).isActive === false || (customer as any).isFrozen)
                      ? 'bg-red-100 hover:bg-red-200 text-red-900 border-red-400 animate-pulse'
                      : customer.hasMessGroup && customer.isDual
                        ? 'bg-indigo-100 hover:bg-red-100 hover:text-red-700 text-indigo-900 border-indigo-300'
                        : customer.isMess
                          ? 'bg-emerald-100 hover:bg-red-100 hover:text-red-700 text-emerald-900 border-emerald-300'
                          : 'bg-emerald-50 hover:bg-red-100 hover:text-red-700 text-emerald-800 border-emerald-300'
                      }`}
                    title={
                      (customer.is_active === 0 || (customer as any).isActive === false || (customer as any).isFrozen)
                        ? `🚫 KHATA FROZEN: ${customer.name}'s account is locked by customer. Click to unlink.`
                        : customer.hasMessGroup && customer.isDual
                          ? `Dual Wallet: ${customer.name} (Personal: BD ${(customer.personalBalance ?? customer.currentBalance ?? customer.balance ?? 0).toFixed(3)}) + 👥 ${customer.group_name} (${customer.members?.length || 0} members). Click to unlink.`
                          : `Linked: ${customer.name || customer.group_name} (Khata Balance: BD ${Number(customer.currentBalance ?? customer.personalBalance ?? customer.balance ?? 0).toFixed(3)}). Click to unlink.`
                    }
                  >
                    <span>
                      {(customer.is_active === 0 || (customer as any).isActive === false || (customer as any).isFrozen)
                        ? `🔒 FROZEN: ${customer.name.slice(0, 10)}`
                        : customer.hasMessGroup && customer.isDual
                          ? `💳 ${customer.name.slice(0, 8)} | 👥 ${(customer.group_name || 'Mess').slice(0, 8)}`
                          : customer.isMess
                            ? `👥 ${(customer.group_name || customer.name).slice(0, 12)}`
                            : `👤 ${customer.name.slice(0, 10)} (BD ${Number(customer.currentBalance ?? customer.personalBalance ?? customer.balance ?? 0).toFixed(3)})`}
                    </span>
                    <span className="text-red-500 font-black ml-1">✕</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openCustomerStatement(customer)}
                    className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-xs active:scale-95 whitespace-nowrap"
                    title="View Customer Khata Statement Ledger"
                  >
                    <FileText size={13} />
                    <span>Statement</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    loadCustomers();
                    setShowCustomersModal(true);
                  }}
                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 active:scale-95 text-amber-800 border border-amber-300 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                  title="Link Khata Customer to Active Cart"
                >
                  <UserPlus size={13} />
                  <span>+ Khata</span>
                </button>
              )}
              <button
                type="button"
                onClick={clearActiveCart}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                title="Void / Clear Cart"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {/* Active Cart Line Items List (Decoupled Zustand Atomic Component) */}
          <CartTable
            onAdjustQty={adjustItemQtyByIndex}
            onRemoveItem={(index, item) => {
              useCartStore.getState().removeItem(index);
              showToast(`🗑️ Removed "${item.name}" from cart`, 'info');
            }}
            onPriceOverrideClick={(item, index) => {
              setPriceOverrideItem({ index, product: item as Product });
            }}
            onWeightEditClick={(item) => {
              setSelectedWeighedItem(item as Product);
              setIsWeightModalOpen(true);
            }}
          />

          {/* Bottom Totals & Numpad */}
          <div className="shrink-0 bg-slate-50 border-t border-slate-200">
            {/* PREDICTIVE OMNI-PAD FULLSCREEN TRIGGER BUTTON (On Top of On-Screen Numpad) */}
            <div className="p-2 bg-neutral-900 border-b border-neutral-800">
              <button
                type="button"
                data-testid="toggle-omni-pad-btn"
                onClick={() => {
                  setSelectedWeighedItem(null);
                  setShowOmniPadModal(true);
                }}
                className="w-full py-2.5 px-3.5 bg-gradient-to-r from-black via-neutral-900 to-black hover:from-neutral-900 hover:to-neutral-800 active:scale-[0.98] text-white rounded-xl border-2 border-neutral-700 hover:border-green-500 shadow-lg flex items-center justify-between cursor-pointer group transition-all select-none"
                title="Launch Full-Screen Predictive Omni-Pad (PLU Code & Loose Item Scale) [F8]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-lg bg-green-500/20 text-green-400 border border-green-500/40 flex items-center justify-center text-lg font-black group-hover:scale-110 group-hover:bg-green-500 group-hover:text-black transition-all shrink-0">
                    ⚡
                  </span>
                  <div className="text-left min-w-0">
                    <div className="text-xs font-black tracking-wide text-white flex items-center gap-1.5 truncate">
                      <span>PREDICTIVE OMNI-PAD</span>
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-green-500 text-black uppercase tracking-wider shrink-0 shadow-xs">
                        FULL SCREEN
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-400 font-medium truncate">
                      PLU Short Codes & Scale Weight • Press <kbd className="font-mono text-zinc-300 font-bold bg-neutral-800 px-1 py-0.2 rounded border border-neutral-700">F8</kbd>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-zinc-400 group-hover:text-green-400 transition-colors shrink-0 ml-2">
                  <Maximize2 size={16} strokeWidth={2.5} />
                </div>
              </button>
            </div>

            {/* Numpad Toggle Bar & Grid */}
            <div className="border-b border-slate-200 bg-slate-100">
              <button
                type="button"
                onClick={() => setShowNumpad(!showNumpad)}
                className="w-full px-3 py-1.5 flex items-center justify-between text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer select-none"
                title="Toggle on-screen numpad"
              >
                <span className="flex items-center gap-1.5">
                  <span>⌨️ On-Screen Numpad</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-black">
                    {showNumpad ? 'Hide ▲' : 'Show ▼'}
                  </span>
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {cart.length > 0 ? `${cart.length} in cart` : 'Ready'}
                </span>
              </button>

              {showNumpad && (
                <div className="p-2 grid grid-cols-4 gap-1.5 border-t border-slate-200 bg-slate-100 animate-in slide-in-from-top-1 duration-150">
                  {[
                    { label: '7', val: '7' },
                    { label: '8', val: '8' },
                    { label: '9', val: '9' },
                    { label: 'QTY', val: 'QTY', style: 'bg-blue-600 hover:bg-blue-700 text-white' },
                    { label: '4', val: '4' },
                    { label: '5', val: '5' },
                    { label: '6', val: '6' },
                    { label: '+', val: '+', style: 'bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold' },
                    { label: '1', val: '1' },
                    { label: '2', val: '2' },
                    { label: '3', val: '3' },
                    { label: '-', val: '-', style: 'bg-amber-600 hover:bg-amber-700 text-white font-extrabold' },
                    { label: 'C', val: 'C', style: 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-black' },
                    { label: '0', val: '0' },
                    { label: '.', val: '.' },
                    { label: '⌫', val: 'BACK', style: 'bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold' },
                  ].map((btn, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleNumpadInput(btn.val)}
                      className={`h-9 rounded-md shadow-xs font-bold text-sm active:scale-95 transition-all flex items-center justify-center cursor-pointer ${btn.style || 'bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Financial Breakdown */}
            <div className="p-2.5 space-y-0.5">
              <div className="flex justify-between text-slate-500 text-xs font-bold">
                <span>Subtotal</span>
                <span className="font-mono">BD {subtotal.toFixed(3)}</span>
              </div>
              {totalSavings > 0 && (
                <div className="flex justify-between text-emerald-700 text-xs font-black bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                  <span className="flex items-center gap-1">
                    <Tag size={12} className="text-emerald-600" /> Total Discount
                  </span>
                  <span className="font-mono">-BD {totalSavings.toFixed(3)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-500 text-xs font-bold">
                <span>VAT (10%)</span>
                <span className="font-mono">BD {vat.toFixed(3)}</span>
              </div>
              <div className="flex justify-between items-end pt-0.5">
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-0.5">Total Due</span>
                <span className="text-2xl font-black text-slate-900 tracking-tighter font-mono">BD {total.toFixed(3)}</span>
              </div>
            </div>

            {/* Selective Print Bar & Last Receipt Quick Action */}
            <div className="px-2.5 pb-2 flex items-center justify-between gap-1.5">
              <button
                type="button"
                onClick={toggleAutoPrint}
                className={`flex-1 py-1 px-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer active:scale-95 ${isAutoPrintEnabled
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                  }`}
                title="Toggle automatic receipt printing"
              >
                <Printer size={13} className={isAutoPrintEnabled ? 'text-emerald-600' : 'text-slate-500'} />
                <span>Receipt: <strong className={isAutoPrintEnabled ? 'text-emerald-700' : 'text-slate-700'}>{isAutoPrintEnabled ? 'ON' : 'OFF'}</strong></span>
              </button>

              <button
                type="button"
                onClick={() => setShowPrinterStyleModal(true)}
                className="py-1 px-2 bg-slate-100 hover:bg-sky-100 hover:text-sky-800 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                title="Configure Sunmi Innerprinter & Receipt Style (58mm/80mm, Density, Layout)"
              >
                <Settings size={11} className="text-slate-500" />
                <span className="text-[10px] font-mono font-black">{receiptFormat}</span>
              </button>

              {lastCompletedSale && (
                <button
                  type="button"
                  onClick={handleReprintLastReceipt}
                  className="py-1 px-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1 active:scale-95 transition-transform cursor-pointer"
                  title={`Print receipt for #${lastCompletedSale.invoiceNo}`}
                >
                  <Receipt size={13} className="text-blue-600" />
                  <span>Last (#{lastCompletedSale.invoiceNo.slice(-4)})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowPreviousBillsModal(true)}
                className="py-1 px-2.5 bg-slate-900 hover:bg-slate-800 text-white border border-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 active:scale-95 transition-transform cursor-pointer"
                title="Browse & Reprint Previous Bills [F9]"
              >
                <Receipt size={13} className="text-green-400" />
                <span>Bills [F9]</span>
              </button>
            </div>

            {/* Primary Payment Actions */}
            <div className="p-2.5 pt-0 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handlePayment()}
                disabled={cart.length === 0}
                className="h-14 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black text-base flex flex-col items-center justify-center active:scale-95 transition-all shadow-md disabled:opacity-50 cursor-pointer"
              >
                <span className="text-[10px] opacity-80 mb-0.5 font-normal">[F1] Tender</span>
                PAY CASH
              </button>
              <button
                type="button"
                onClick={() => {
                  if (cart.length === 0) {
                    showToast("⚠️ Cart is empty!", 'info');
                    return;
                  }
                  setPaymentModalMethod('BENEFIT_PAY');
                  setShowPaymentModal(true);
                }}
                disabled={cart.length === 0}
                className="h-14 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-base flex flex-col items-center justify-center active:scale-95 transition-all shadow-md disabled:opacity-50 cursor-pointer"
              >
                <span className="text-[10px] opacity-80 mb-0.5 font-normal">Fawri+</span>
                BENEFIT
              </button>
              <button
                type="button"
                onClick={() => processCheckout('CARD')}
                disabled={cart.length === 0}
                className="h-14 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-black text-base flex flex-col items-center justify-center active:scale-95 transition-all shadow-md disabled:opacity-50 cursor-pointer"
              >
                <span className="text-[10px] opacity-80 mb-0.5 font-normal">[F2]</span>
                CARD
              </button>
            </div>

            {/* Optional Khata Credit Buttons */}
            {customer && (
              <div className="px-2.5 pb-2.5">
                {(customer.is_active === 0 || (customer as any).isActive === false || (customer as any).isFrozen) ? (
                  <div className="w-full py-2.5 px-3 rounded-xl bg-red-500/10 border-2 border-red-500/40 text-red-700 font-bold text-xs flex items-center justify-center gap-2 text-center shadow-xs">
                    <Lock size={15} className="text-red-600 shrink-0" />
                    <span>🚫 KHATA FROZEN: In-store credit locked by customer</span>
                  </div>
                ) : customer.hasMessGroup && customer.isDual ? (
                  // DUAL-WALLET BUTTONS: Cashier chooses Personal Khata vs Shared Mess Split
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => processCheckout('CREDIT_PERSONAL')}
                      disabled={cart.length === 0}
                      className="py-2.5 px-1 bg-amber-500 hover:bg-amber-600 active:scale-95 transition-transform rounded-xl font-bold text-xs text-white shadow-sm shadow-amber-500/20 disabled:opacity-50 cursor-pointer flex flex-col items-center justify-center leading-tight"
                      title={`Charge entirely to ${customer.name}'s Personal Khata (Balance: BD ${(customer.personalBalance ?? customer.currentBalance).toFixed(3)})`}
                    >
                      <span className="text-[10px] opacity-90 font-normal">Personal [F1]</span>
                      <span className="truncate w-full text-center">👤 {customer.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => processCheckout('CREDIT_MESS')}
                      disabled={cart.length === 0}
                      className="py-2.5 px-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-transform rounded-xl font-bold text-xs text-white shadow-sm shadow-emerald-600/20 disabled:opacity-50 cursor-pointer flex flex-col items-center justify-center leading-tight"
                      title={`Split equally across ${customer.group_name} (${customer.members?.length || 0} members) with ${customer.name} as shopper`}
                    >
                      <span className="text-[10px] opacity-90 font-normal">Split Mess [F3]</span>
                      <span className="truncate w-full text-center">👥 {customer.group_name || 'Mess'}</span>
                    </button>
                  </div>
                ) : (
                  // SINGLE WALLET (Pure Mess or Pure Personal)
                  <button
                    type="button"
                    onClick={() => processCheckout('CREDIT')}
                    disabled={cart.length === 0}
                    className={`w-full py-2.5 rounded-xl font-bold text-xs active:scale-95 transition-transform flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50 text-white ${customer.isMess
                      ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                      : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20'
                      }`}
                  >
                    <span>
                      {customer.isMess
                        ? `👥 Charge & Split Mess (${(customer.group_name || customer.name).slice(0, 16)}) [F3]`
                        : `📒 Charge to Khata (${customer.name.slice(0, 16)}) [F3]`}
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* Pay with Khata (NFC Reader trigger - Strict On-Demand with 5-min Auto-Off) */}
            {!customer && (
              <div className="px-2.5 pb-2.5">
                <button
                  type="button"
                  onClick={isNfcReaderScanning ? stopNfcScan : startNfcScan}
                  className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs text-white shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 ${isNfcReaderScanning
                    ? 'bg-emerald-600 animate-pulse ring-2 ring-emerald-400'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'
                    }`}
                  title={isNfcReaderScanning ? "Click to cancel NFC scan" : "Click to activate NFC reader for 5 minutes"}
                >
                  <span>
                    {isNfcReaderScanning
                      ? `📡 Tap Khata Card Now... (${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')})`
                      : '💳 Pay with Khata (NFC)'}
                  </span>
                </button>
                {nfcError && <div className="text-red-500 text-[11px] font-bold mt-1 text-center">{nfcError}</div>}
              </div>
            )}
          </div>
        </div>

        {/* SECTION 2: THE QUICK PRODUCTS GRID (RIGHT SIDE) */}
        <div className="flex-1 bg-slate-50 flex flex-col h-full overflow-hidden">
          {/* Quick Header & Category Selector */}
          <div className="h-12 border-b border-slate-200 bg-white flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              <span className="text-xs font-black text-slate-800 flex items-center gap-1.5 shrink-0 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                ⚡ Quick Items
              </span>

              <div className="flex items-center gap-1 overflow-x-auto max-w-[650px] scrollbar-hide py-0.5">
                {quickCategories.map((cat) => {
                  const catId = (cat?.id || (typeof cat === 'string' ? cat : '') || 'ALL').toUpperCase();
                  const count = catId === 'ALL'
                    ? activeQuickProducts.length
                    : activeQuickProducts.filter((p) => (p?.category || 'ESSENTIALS').toUpperCase() === catId).length;
                  return (
                    <button
                      key={cat?.id || catId}
                      type="button"
                      onClick={() => setSelectedQuickCategory(cat?.id || catId)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${selectedQuickCategory === (cat?.id || catId)
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                      <span>{cat?.label || catId}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${selectedQuickCategory === (cat?.id || catId) ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                        }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {rightPaneMode !== 'OMNIPAD' && isEditMode && (
                <button
                  type="button"
                  onClick={() => setShowEditTabsModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all cursor-pointer active:scale-95"
                  title="Rename tabs, reorder, change colors, or add custom category tabs"
                >
                  <span>✏️ Edit Tabs</span>
                </button>
              )}

              {rightPaneMode !== 'OMNIPAD' && (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditMode((prev) => {
                      const next = !prev;
                      showToast(
                        next ? '✏️ Edit Mode UNLOCKED: Tap any card to swap, recolor, or remove' : '🔒 Quick Grid LOCKED: Fast checkout active',
                        next ? 'info' : 'success'
                      );
                      return next;
                    });
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${isEditMode
                    ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md ring-2 ring-amber-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                    }`}
                  title={isEditMode ? "Exit Edit Mode" : "Unlock Quick Grid to customize items"}
                >
                  {isEditMode ? (
                    <>
                      <Unlock size={14} className="text-white" />
                      <span>Done Editing</span>
                    </>
                  ) : (
                    <>
                      <Lock size={14} className="text-slate-500" />
                      <span>Edit Grid</span>
                    </>
                  )}
                </button>
              )}

              {rightPaneMode !== 'OMNIPAD' && (
                <button
                  type="button"
                  onClick={() => {
                    setUnassignedBarcode(null);
                    setShowPosAddModal(true);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap active:scale-95"
                  title="Quick Add Product to Catalog [Sunmi Touch]"
                >
                  <PlusCircle size={13} className="text-amber-600" />
                  <span>+ Product</span>
                </button>
              )}

              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Zero-Touch Scanner Ready
              </span>
            </div>
          </div>

          {/* Quick Items Grid View OR Predictive Omni-Pad (Right Pane Mode) */}
          {rightPaneMode === 'OMNIPAD' ? (
            <div className="flex-1 bg-black overflow-hidden flex flex-col">
              <PredictiveOmniPad
                customItems={omniItemsList}
                initialItem={selectedWeighedItem ? {
                  code: selectedWeighedItem.barcode || selectedWeighedItem.id,
                  name: selectedWeighedItem.name,
                  nameAr: selectedWeighedItem.nameAr || (selectedWeighedItem as any).name_ar,
                  pricePerKg: Number((selectedWeighedItem as any).sellingPrice || selectedWeighedItem.price || 0),
                  icon: selectedWeighedItem.name.toLowerCase().includes('tomato') ? '🍅' :
                    selectedWeighedItem.name.toLowerCase().includes('chicken') ? '🍗' :
                      selectedWeighedItem.name.toLowerCase().includes('cucumber') ? '🥒' :
                        selectedWeighedItem.name.toLowerCase().includes('banana') ? '🍌' :
                          selectedWeighedItem.name.toLowerCase().includes('potato') ? '🥔' :
                            selectedWeighedItem.name.toLowerCase().includes('onion') ? '🧅' :
                              selectedWeighedItem.name.toLowerCase().includes('sweet') ? '🍬' :
                                selectedWeighedItem.name.toLowerCase().includes('rice') ? '🍚' : '⚖️',
                  barcode: selectedWeighedItem.barcode
                } : null}
                onResetItem={() => setSelectedWeighedItem(null)}
                onAddToCart={handleOmniAddToCart}
                onTenderCash={() => handlePayment()}
                onTenderBenefit={() => {
                  if (cart.length === 0) {
                    showToast("⚠️ Cart is empty!", 'info');
                    return;
                  }
                  setPaymentModalMethod('BENEFIT_PAY');
                  setShowPaymentModal(true);
                }}
                onTenderKhata={() => {
                  if (cart.length === 0) {
                    showToast("⚠️ Cart is empty!", 'info');
                    return;
                  }
                  setShowKhataHub(true);
                }}
              />
            </div>
          ) : (
            <div className={`flex-1 overflow-y-auto p-3.5 scroll-zone transition-colors ${isEditMode ? 'bg-amber-50/20' : ''
              }`}>
              {/* Edit Mode Alert Banner */}
              {isEditMode && (
                <div className="bg-amber-100 border border-amber-300 rounded-2xl px-3.5 py-2.5 mb-3 flex flex-wrap items-center justify-between text-amber-950 text-xs shadow-xs animate-in fade-in gap-2">
                  <div className="flex items-center gap-2 font-bold">
                    <span className="text-base">🛠️</span>
                    <span>
                      {swapSourceProduct
                        ? `🔄 Swapping: Tap a 2nd card to swap position with "${swapSourceProduct.name}"`
                        : isPositionSwapActive
                          ? '👉 Tap 1st card, then tap 2nd card to swap positions'
                          : 'Edit Mode: Tap card to customize/replace, or tap "⇄ Reorder Cards" to swap positions'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (swapSourceProduct) {
                          setSwapSourceProduct(null);
                          showToast('Cancelled card selection', 'info');
                        } else {
                          setIsPositionSwapActive((prev) => !prev);
                          if (!isPositionSwapActive) {
                            showToast('👉 Tap 1st card, then tap 2nd card to swap positions!', 'info');
                          }
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${isPositionSwapActive || swapSourceProduct
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50'
                        }`}
                    >
                      {swapSourceProduct ? 'Cancel' : isPositionSwapActive ? 'Exit Reorder' : '⇄ Reorder Cards'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsEditMode(false);
                        setIsPositionSwapActive(false);
                        setSwapSourceProduct(null);
                        showToast('🔒 Quick Grid LOCKED: Fast checkout active', 'success');
                      }}
                      className="px-3.5 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl font-bold text-xs shadow-xs cursor-pointer active:scale-95"
                    >
                      Done Editing
                    </button>
                  </div>
                </div>
              )}

              <QuickProductGrid
                products={displayedQuickProducts}
                catalog={catalog}
                onProductClick={handleQuickItemClick}
                isEditMode={isEditMode}
                isPositionSwapActive={isPositionSwapActive}
                swapSourceProduct={swapSourceProduct}
                onAddQuickProduct={() => setShowAddQuickModal(true)}
                onSelectAllCategory={() => setSelectedQuickCategory('ALL')}
                getCategoryTheme={getCategoryTheme}
              />
            </div>
          )}

          {/* Quick Shortcuts Bar */}
          <div className="px-4 py-2 border-t border-slate-200 bg-white/80 flex items-center justify-between text-[11px] text-slate-500 font-medium shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedWeighedItem(null);
                  setShowOmniPadModal(true);
                }}
                className="hover:text-green-600 transition-colors cursor-pointer flex items-center gap-1 font-semibold"
              >
                Press <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono font-bold text-slate-700">F8</kbd> for Omni-Pad
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowF12SearchModal(true);
                }}
                className="hover:text-blue-600 transition-colors cursor-pointer flex items-center gap-1 font-semibold"
              >
                Press <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono font-bold text-slate-700">F12</kbd> for Full Search
              </button>
              <span><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono font-bold text-slate-700">F1</kbd> Cash</span>
              <span><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono font-bold text-slate-700">F2</kbd> Card</span>
              <span><kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono font-bold text-slate-700">F3</kbd> Khata</span>
            </div>
            <span className="text-slate-400">⚡ High-Volume Scan-First POS</span>
          </div>
        </div>

      </div>

      {/* MASSIVE F12 FULL INVENTORY SEARCH OVERLAY */}
      {showF12SearchModal && (
        <F12SearchOverlay
          isOpen={showF12SearchModal}
          onClose={() => setShowF12SearchModal(false)}
          catalog={catalog}
          apiBase={apiBase}
          onSelectItem={(item) => handleItemSelection(item)}
        />
      )}

      {/* QUICK PRODUCT EDIT MODAL */}
      {Boolean(editingQuickProduct) && (
        <QuickProductEditModal
          isOpen={Boolean(editingQuickProduct)}
          onClose={() => setEditingQuickProduct(null)}
          product={editingQuickProduct}
          catalog={catalog}
          apiBase={apiBase}
          onSwapProduct={handleSwapQuickProduct}
          onUpdateColor={handleUpdateQuickProductColor}
          onRemoveProduct={handleRemoveQuickProduct}
          onMovePosition={handleMovePosition}
          onProductUpdated={() => {
            fetchQuickProducts();
            fetchCatalog();
          }}
          showToast={showToast}
          categories={quickCategories}
        />
      )}

      {/* ADD QUICK PRODUCT MODAL */}
      {showAddQuickModal && (
        <AddQuickProductModal
          isOpen={showAddQuickModal}
          onClose={() => setShowAddQuickModal(false)}
          catalog={catalog}
          currentQuickIds={new Set(activeQuickProducts.map((p) => p.id))}
          apiBase={apiBase}
          onAddProduct={handleAddQuickProduct}
          onProductAdded={() => {
            fetchQuickProducts();
            fetchCatalog();
          }}
          showToast={showToast}
          categories={quickCategories}
        />
      )}

      {/* EDIT QUICK TABS MODAL */}
      {showEditTabsModal && (
        <EditQuickTabsModal
          isOpen={showEditTabsModal}
          onClose={() => setShowEditTabsModal(false)}
          categories={quickCategories}
          onSaveCategories={handleSaveCategories}
          showToast={showToast}
        />
      )}

      {/* DEVELOPER & HARDWARE DIAGNOSTICS MODAL */}
      {showDevPanel && (
        <DeveloperDiagnosticsModal
          isOpen={showDevPanel}
          onClose={() => setShowDevPanel(false)}
          apiBase={apiBase}
          onOpenServerConfig={() => setShowServerConfigModal(true)}
          onOpenBenefitPayConfig={() => setShowBenefitPayConfigModal(true)}
          onOpenPrinterStyleConfig={() => setShowPrinterStyleModal(true)}
          hardwareSupported={Boolean(hardwareSupported)}
          isScanning={isNfcReaderScanning}
          customerScreenReady={Boolean(customerScreenReady)}
          lastDetectedUid={lastDetectedUid}
          simulateScan={simulateScan}
          lastScannedBarcode={lastScannedBarcode}
          handleBarcodeScan={handleBarcodeScan}
          onOpenCashOut={() => setShowCashOutModal(true)}
          onOpenPnl={() => {
            setShowDevPanel(false);
            setEmergencyUnlocked(true);
            setViewMode('pnl');
          }}
          onOpenMaster={() => {
            setShowDevPanel(false);
            setEmergencyUnlocked(true);
            setViewMode('master');
          }}
          onOpenZReport={() => {
            setShowDevPanel(false);
            setShowZReportModal(true);
          }}
        />
      )}

      {/* CUSTOMER ENROLLMENT & KHATA MODAL */}
      {showCustomersModal && (
        <CustomerEnrollmentModal
          isOpen={showCustomersModal}
          onClose={() => setShowCustomersModal(false)}
          customersList={customersList}
          onSelectCustomer={(c) => setCustomer(c)}
          onCreateCustomer={async (name, cardUid, previousBalance) => {
            try {
              const res = await fetch(`${apiBase}/api/customers`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-pos-client': 'store-pos'
                },
                body: JSON.stringify({
                  name,
                  cardUid: cardUid || undefined,
                  previousBalance: Number(previousBalance) || 0
                })
              });
              const data = await res.json();
              if (res.ok && (data.success || data.id)) {
                const balNotice = Number(previousBalance) > 0 ? ` with opening balance BD ${Number(previousBalance).toFixed(3)}` : '';
                showToast(`✅ Customer "${name}" created${balNotice}${cardUid ? ' & NFC linked' : ''}!`, 'success');
                setNewCustCardUid('');
                await loadCustomers();
              } else {
                showToast(`❌ ${data.error || 'Failed to create customer'}`, 'error');
              }
            } catch (e) {
              console.error(e);
              showToast("❌ Error creating customer", 'error');
            }
          }}
          onBindCard={handleBindCard}
          lastDetectedUid={lastDetectedUid}
          bindingCustomerId={bindingCustomerId}
          setBindingCustomerId={setBindingCustomerId}
          newCustCardUid={newCustCardUid}
          setNewCustCardUid={setNewCustCardUid}
        />
      )}

      {/* PRODUCTS & BARCODES ASSIGNMENT MODAL */}
      {showProductsModal && (
        <ProductBarcodeModal
          isOpen={showProductsModal}
          onClose={() => setShowProductsModal(false)}
          catalog={catalog}
          onReloadCatalog={fetchCatalog}
          onOpenPosAddModal={() => setShowPosAddModal(true)}
          onSaveProduct={async (name, sellingPrice, costPrice, barcode) => {
            try {
              const res = await fetch(`${apiBase}/products`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name,
                  sellingPrice,
                  purchasePrice: costPrice,
                  stockQuantity: 100,
                  barcode: barcode || undefined
                })
              });
              if (res.ok) {
                showToast(`✅ Product "${name}" created!`, 'success');
                await fetchCatalog();
              } else {
                const err = await res.json();
                showToast(`❌ ${err.error || 'Failed to create product'}`, 'error');
              }
            } catch (e) {
              console.error(e);
              showToast("❌ Error creating product", 'error');
            }
          }}
          onBindBarcode={handleBindBarcode}
          lastScannedBarcode={lastScannedBarcode}
          unassignedBarcode={unassignedBarcode}
          bindingProductId={bindingProductId}
          setBindingProductId={setBindingProductId}
        />
      )}

      {/* MASTER BACK-OFFICE SERVER IP CONFIGURATION MODAL */}
      {showServerConfigModal && (
        <ServerConfigModal
          isOpen={showServerConfigModal}
          onClose={() => setShowServerConfigModal(false)}
          activeServerIp={apiBase}
          onSaveServerIp={(ip) => handleSaveMasterIp(ip)}
        />
      )}

      {/* BENEFITPAY OWNER ACCOUNT CONFIGURATION MODAL */}
      {showBenefitPayConfigModal && (
        <BenefitPayConfigModal
          isOpen={showBenefitPayConfigModal}
          onClose={() => setShowBenefitPayConfigModal(false)}
          apiBase={apiBase}
        />
      )}

      {/* SUNMI INNERPRINTER & RECEIPT STYLE CONFIGURATION MODAL */}
      {showPrinterStyleModal && (
        <PrinterStyleConfigModal
          isOpen={showPrinterStyleModal}
          onClose={() => setShowPrinterStyleModal(false)}
        />
      )}

      {/* KHATA HUB MODAL */}
      {showKhataHub && (
        <KhataHubModal
          onClose={() => setShowKhataHub(false)}
          apiBase={apiBase}
          lastScannedCardUid={lastDetectedUid}
          onCustomerUpdated={() => {
            loadCustomers();
          }}
          onSelectCustomerForCart={(selected) => {
            setCustomer(selected);
            showToast(`💳 Linked ${selected.name} to active cart (Balance: BD ${Number(selected.currentBalance ?? selected.balance ?? 0).toFixed(3)})`, 'success');
          }}
          showToast={showToast}
        />
      )}

      {/* NFC CARD MANAGER MODAL */}
      {showNfcManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-6xl max-h-[92vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-3.5 bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <Radio className="text-emerald-400 animate-pulse" size={18} />
                <span className="font-bold text-sm tracking-wide">NFC Smart Card & Mess Group Manager</span>
              </div>
              <button
                onClick={() => setShowNfcManager(false)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Suspense fallback={<div className="flex items-center justify-center h-64 text-slate-500 font-bold text-sm">Loading NFC Card Manager...</div>}>
                <NfcManager
                  apiBase={apiBase}
                  initialTab="CARDS"
                  onSelectCustomerForCart={(selected) => {
                    setCustomer(selected);
                    setShowNfcManager(false);
                    showToast(`💳 Linked ${selected.group_name || selected.name} to active cart`, 'success');
                  }}
                  onNavigateToKhata={() => {
                    setShowNfcManager(false);
                    setShowKhataHub(true);
                  }}
                  onOpenCustomerStatement={(cust) => {
                    setShowNfcManager(false);
                    openCustomerStatement(cust);
                  }}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* MESS GROUPS MODAL (CAMP DINING SPLIT-BILLING) */}
      {showMessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-6xl max-h-[92vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-3.5 bg-indigo-950 text-white">
              <div className="flex items-center gap-2.5">
                <Users className="text-indigo-400" size={20} />
                <span className="font-bold text-sm tracking-wide">Mess Groups & Labor Camp Dining Split-Billing</span>
              </div>
              <button
                onClick={() => setShowMessModal(false)}
                className="p-1 hover:bg-indigo-900 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Suspense fallback={<div className="flex items-center justify-center h-64 text-slate-500 font-bold text-sm">Loading Mess Groups...</div>}>
                <NfcManager
                  apiBase={apiBase}
                  initialTab="MESS_GROUPS"
                  onSelectCustomerForCart={(selectedMess) => {
                    setCustomer(selectedMess);
                    setShowMessModal(false);
                    showToast(`👥 Linked to Mess Group: ${selectedMess.group_name || selectedMess.name} (${selectedMess.members?.length || selectedMess.memberCount || 0} members) - Ready for Split Bill [F3]`, 'success');
                  }}
                  onNavigateToKhata={() => {
                    setShowMessModal(false);
                    setShowKhataHub(true);
                  }}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* BLIND CLOSEOUT SHIFT MODAL (ENTERPRISE CASH RECONCILIATION) */}
      {showBlindCloseModal && (
        <BlindCloseShiftModal
          shiftId={shiftId || localStorage.getItem('active_shift_id') || localStorage.getItem('askar_shift_id') || ''}
          cashierName={localStorage.getItem('active_shift_cashier') || 'Cashier 1'}
          apiBase={apiBase}
          onSuccess={(reconciliation) => {
            setShowBlindCloseModal(false);
            showToast(`✅ Shift Closed: Declared BHD ${reconciliation.actualCash?.toFixed(3) || '0.000'}`, 'success');
            if (onLockTerminal) onLockTerminal();
          }}
          onCancel={() => setShowBlindCloseModal(false)}
        />
      )}

      {/* END OF DAY Z-REPORT MODAL */}
      {showZReportModal && (
        <ZReportModal
          onClose={() => setShowZReportModal(false)}
          apiBase={apiBase}
          shiftId={shiftId}
          onShiftClosed={() => {
            if (onLockTerminal) onLockTerminal();
          }}
        />
      )}

      {/* CASH OUT / EXPENSE RECORDING MODAL */}
      {showCashOutModal && (
        <CashOutModal
          onClose={() => setShowCashOutModal(false)}
          apiBase={apiBase}
          onExpenseRecorded={() => {
            showToast("💸 Expense recorded! Cash drawer updated.", 'success');
          }}
        />
      )}

      {/* ADD PRODUCT MODAL (DISTRIBUTOR BINDING) */}
      {showAddProductModal && (
        <AddProductModal
          onClose={() => setShowAddProductModal(false)}
          onSuccess={() => {
            fetchCatalog();
            showToast("Product added and linked to distributor!", "success");
          }}
          apiBase={apiBase}
        />
      )}

      {/* POS QUICK ADD PRODUCT MODAL (TOUCH-OPTIMIZED FOR SUNMI TERMINAL) */}
      {showPosAddModal && (
        <PosAddProductModal
          onClose={() => setShowPosAddModal(false)}
          initialBarcode={unassignedBarcode || lastScannedBarcode || ''}
          apiBase={apiBase}
          categories={quickCategories}
          catalog={catalog}
          onProductAdded={(newProduct, andAddToCart = true) => {
            const price = Number(newProduct.sellingPrice || newProduct.price || 0);
            const cost = Number(newProduct.unitCost || newProduct.purchasePrice || 0);
            const prodToAdd: Product = {
              id: newProduct.id,
              name: newProduct.name,
              price,
              unitCost: cost,
              barcode: newProduct.barcode || newProduct.id,
              category: newProduct.category,
              isScaleItem: Boolean(newProduct.isScaleItem ?? newProduct.is_weighed_item),
              vatRate: Number(newProduct.vatRate ?? 0),
              stockQuantity: Number(newProduct.stockQuantity ?? 0),
            };
            if (andAddToCart) {
              addToCart(prodToAdd);
            }
            setUnassignedBarcode(null);
            setCatalog((prev) => {
              const existingIdx = prev.findIndex(p => p.id === prodToAdd.id || (p.barcode && p.barcode === prodToAdd.barcode));
              let nextList: Product[];
              if (existingIdx !== -1) {
                nextList = [...prev];
                nextList[existingIdx] = prodToAdd;
              } else {
                nextList = [prodToAdd, ...prev];
              }
              writeCatalogCache(nextList);
              try {
                localStorage.setItem('askar_local_db_cache_Product', JSON.stringify(nextList));
              } catch { }
              return nextList;
            });
            refreshCatalogNow();
            showToast(`✅ "${newProduct.name}" saved to catalog${andAddToCart ? ' and added to cart' : ''}!`, 'success');
          }}
        />
      )}

      {/* CUSTOMER KHATA STATEMENT MODAL (TOUCH-OPTIMIZED FOR SUNMI CASHIER) */}
      {statementCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black leading-tight">{statementCustomer.name}</h3>
                  <p className="text-xs text-slate-400 flex items-center gap-2">
                    {statementCustomer.phone && <span>📞 {statementCustomer.phone}</span>}
                    {statementCustomer.cpr && <span>🆔 CPR: {statementCustomer.cpr}</span>}
                    <span>• Balance: <strong className="text-amber-400 font-mono">BD {Number(statementCustomer.currentBalance ?? statementCustomer.balance ?? 0).toFixed(3)}</strong></span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintStatement}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer"
                  title="Print 58mm Thermal Statement Slip on Sunmi"
                >
                  <Printer size={14} />
                  <span>Print (58mm)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatementCustomer(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Filter Tabs & Date to Date Filter Bar */}
            <div className="bg-slate-100 p-3 border-b border-slate-200 space-y-2 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {(['ALL', 'CHARGES', 'PAYMENTS'] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setStatementFilter(filter)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${statementFilter === filter
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                      {filter === 'ALL' ? 'All Transactions' : filter === 'CHARGES' ? 'Purchases (+)' : 'Payments (-)'}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-slate-500 font-bold font-mono">
                  {filteredCustomerStatement.length} of {customerStatementList.length} items
                </span>
              </div>

              {/* Date to Date Filter Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-300 shadow-2xs">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">FROM</span>
                    <input
                      type="date"
                      value={statementStartDate}
                      onChange={(e) => setStatementStartDate(e.target.value)}
                      className="text-xs font-bold text-slate-800 outline-none bg-transparent cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-300 shadow-2xs">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">TO</span>
                    <input
                      type="date"
                      value={statementEndDate}
                      onChange={(e) => setStatementEndDate(e.target.value)}
                      className="text-xs font-bold text-slate-800 outline-none bg-transparent cursor-pointer"
                    />
                  </div>

                  {/* Quick Presets */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setStatementQuickRange('TODAY')}
                      className={`px-2 py-1 rounded-md font-bold text-[11px] transition-all cursor-pointer ${statementStartDate && statementStartDate === statementEndDate && statementStartDate === new Date().toISOString().slice(0, 10)
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-200'
                        }`}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatementQuickRange('THIS_MONTH')}
                      className="px-2 py-1 bg-white hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-md font-bold text-[11px] transition-all cursor-pointer"
                    >
                      This Month
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatementQuickRange('LAST_MONTH')}
                      className="px-2 py-1 bg-white hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-md font-bold text-[11px] transition-all cursor-pointer"
                    >
                      Last Month
                    </button>
                    {(statementStartDate || statementEndDate || statementFilter !== 'ALL') && (
                      <button
                        type="button"
                        onClick={() => { setStatementStartDate(''); setStatementEndDate(''); setStatementFilter('ALL'); }}
                        className="px-2 py-1 text-red-600 hover:bg-red-50 rounded-md font-bold text-[11px] transition-all cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Filtered Range Totals */}
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span className="text-rose-600 font-bold">
                    Charges: +BD {filteredCustomerDebitTotal.toFixed(3)}
                  </span>
                  <span className="text-emerald-600 font-bold">
                    Payments: -BD {filteredCustomerCreditTotal.toFixed(3)}
                  </span>
                </div>
              </div>
            </div>

            {/* Statement Items List */}
            <div className="flex-1 overflow-y-auto p-4 divide-y divide-slate-100">
              {isLoadingStatement ? (
                <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-2">
                  <RefreshCw size={24} className="animate-spin text-blue-500" />
                  <span className="text-sm font-bold">Loading statement records...</span>
                </div>
              ) : filteredCustomerStatement.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <p className="text-sm font-bold">
                    {customerStatementList.length === 0 ? 'No ledger records found for this account.' : 'No transactions match the selected date filter.'}
                  </p>
                </div>
              ) : (
                filteredCustomerStatement
                  .map((item, idx) => {
                    const isPayment = item.type === 'PAYMENT' || item.type === 'WRITE_OFF' || Number(item.amount) < 0;
                    const displayAmt = Math.abs(Number(item.amount || item.total || 0));
                    const dateStr = item.formattedDate || (item.created_at || item.timestamp ? new Date(item.created_at || item.timestamp).toLocaleDateString() : '');
                    const timeStr = item.formattedTime || (item.created_at || item.timestamp ? new Date(item.created_at || item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

                    return (
                      <div key={item.id || idx} className="py-2.5 flex items-center justify-between text-xs">
                        <div className="min-w-0 pr-3">
                          <p className="font-bold text-slate-800 truncate">
                            {item.reference || item.invoiceNo || (isPayment ? 'Cash Payment Received' : 'Store Purchase')}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {dateStr} {timeStr}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`font-mono font-bold ${isPayment ? 'text-emerald-600' : 'text-slate-800'}`}>
                            {isPayment ? '-' : '+'}BD {displayAmt.toFixed(3)}
                          </span>
                          {item.runningBalance !== undefined && (
                            <p className="text-[10px] text-slate-400 font-mono">
                              Bal: BD {Number(item.runningBalance).toFixed(3)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Footer Summary & Close */}
            <div className="bg-slate-50 border-t border-slate-200 p-3 px-4 flex items-center justify-between shrink-0">
              <div>
                <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Current Balance:</span>
                <p className="text-base font-black font-mono text-slate-900">
                  BD {Number(statementCustomer.currentBalance ?? statementCustomer.balance ?? 0).toFixed(3)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintStatement}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Print Slip</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatementCustomer(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RETURN & REFUND MODAL */}
      {showRefundModal && (
        <RefundModal
          onClose={() => setShowRefundModal(false)}
          apiBase={apiBase}
          onSuccess={(data) => {
            fetchCatalog();
            loadCustomers();
            showToast(`✅ Credit Note ${data.creditNoteNo} processed successfully!`, 'success');
          }}
        />
      )}

      {/* PIN-LOCKED RECEIVING DRAWER (IN-TRANSIT POS & BARCODE AUDITING) */}
      {showReceivingDrawer && (
        <ReceivingDrawer
          isOpen={showReceivingDrawer}
          onClose={() => setShowReceivingDrawer(false)}
          apiBase={apiBase}
          onCatalogRefresh={fetchCatalog}
          registerScanListener={handleRegisterReceivingScanListener}
        />
      )}

      {/* PIN-LOCKED ORDER HISTORY & NBR VOID DRAWER */}
      {showOrderHistoryDrawer && (
        <OrderHistoryDrawer
          isOpen={showOrderHistoryDrawer}
          onClose={() => setShowOrderHistoryDrawer(false)}
          apiBase={apiBase}
          onCatalogRefresh={fetchCatalog}
        />
      )}

      {/* HARD CREDIT LIMIT POS BLOCKING MODAL */}
      {creditLimitBlockedInfo && (
        <HardCreditLimitModal
          info={creditLimitBlockedInfo}
          onClose={() => setCreditLimitBlockedInfo(null)}
          onAuthorizeOverride={handleAuthorizeCreditOverride}
          onOpenKhataHub={() => setShowKhataHub(true)}
        />
      )}

      {/* TAP-TO-EDIT PRICE & DISCOUNT OVERRIDE MODAL */}
      {priceOverrideItem && (
        <TapToEditDiscountModal
          key={priceOverrideItem ? `${priceOverrideItem.index}-${priceOverrideItem.product.id}` : 'closed'}
          item={priceOverrideItem}
          onClose={() => setPriceOverrideItem(null)}
          onApplyOverride={applyPriceOverride}
          onShowToast={showToast}
          onRemoveItem={(indexOrId) => {
            useCartStore.getState().removeItem(indexOrId as any);
            showToast('🗑️ Removed item from cart', 'info');
            setPriceOverrideItem(null);
          }}
        />
      )}

      {/* UNIFIED PREDICTIVE OMNI-PAD FULLSCREEN MODAL (SUNMI TERMINAL HIGH-SPEED TIKTOK-STYLE WORKFLOW) */}
      {(showOmniPadModal || showFreshProduceGrid || showPluModal || isWeightModalOpen) && (
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col animate-in fade-in duration-150">
          <PredictiveOmniPad
            customItems={omniItemsList}
            isFullscreen={true}
            cartCount={cart.length}
            cartTotal={total}
            initialItem={selectedWeighedItem ? {
              code: selectedWeighedItem.barcode || selectedWeighedItem.id,
              name: selectedWeighedItem.name,
              nameAr: selectedWeighedItem.nameAr || (selectedWeighedItem as any).name_ar,
              pricePerKg: Number((selectedWeighedItem as any).sellingPrice || selectedWeighedItem.price || 0),
              icon: selectedWeighedItem.name.toLowerCase().includes('tomato') ? '🍅' :
                selectedWeighedItem.name.toLowerCase().includes('chicken') ? '🍗' :
                  selectedWeighedItem.name.toLowerCase().includes('cucumber') ? '🥒' :
                    selectedWeighedItem.name.toLowerCase().includes('banana') ? '🍌' :
                      selectedWeighedItem.name.toLowerCase().includes('potato') ? '🥔' :
                        selectedWeighedItem.name.toLowerCase().includes('onion') ? '🧅' :
                          selectedWeighedItem.name.toLowerCase().includes('sweet') ? '🍬' :
                            selectedWeighedItem.name.toLowerCase().includes('rice') ? '🍚' : '⚖️',
              barcode: selectedWeighedItem.barcode
            } : null}
            onClose={() => {
              setShowOmniPadModal(false);
              setShowFreshProduceGrid(false);
              setShowPluModal(false);
              setIsWeightModalOpen(false);
              setSelectedWeighedItem(null);
            }}
            onResetItem={() => setSelectedWeighedItem(null)}
            onAddToCart={handleOmniAddToCart}
            onTenderCash={() => {
              setShowOmniPadModal(false);
              setShowFreshProduceGrid(false);
              setShowPluModal(false);
              setIsWeightModalOpen(false);
              setSelectedWeighedItem(null);
              handlePayment();
            }}
            onTenderBenefit={() => {
              setShowOmniPadModal(false);
              setShowFreshProduceGrid(false);
              setShowPluModal(false);
              setIsWeightModalOpen(false);
              setSelectedWeighedItem(null);
              if (cart.length === 0) {
                showToast("⚠️ Cart is empty!", 'info');
                return;
              }
              setPaymentModalMethod('BENEFIT_PAY');
              setShowPaymentModal(true);
            }}
            onTenderKhata={() => {
              setShowOmniPadModal(false);
              setShowFreshProduceGrid(false);
              setShowPluModal(false);
              setIsWeightModalOpen(false);
              setSelectedWeighedItem(null);
              if (cart.length === 0) {
                showToast("⚠️ Cart is empty!", 'info');
                return;
              }
              setShowKhataHub(true);
            }}
          />
        </div>
      )}

      {/* BENEFITPAY & POS PAYMENT MODAL */}
      {showPaymentModal && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setPendingBenefitPayment(null);
          }}
          totalAmount={total}
          subtotal={subtotal}
          vat={vat}
          cart={cart}
          customer={customer}
          apiBase={apiBase}
          initialMethod={paymentModalMethod}
          initialBenefitPayment={pendingBenefitPayment}
          autoPrintReceipt={isAutoPrintEnabled}
          onToggleAutoPrint={(enabled) => setIsAutoPrintEnabled(enabled)}
          receiptFormat={receiptFormat}
          onReceiptFormatChange={(format) => setReceiptFormat(format)}
          onSuccess={(receiptData) => {
            setShowPaymentModal(false);
            setPendingBenefitPayment(null);
            if (receiptData) {
              setLastCompletedSale({
                invoiceNo: receiptData.invoiceNo,
                items: [...cart],
                subtotal,
                totalVat: vat,
                total,
                paymentMode: receiptData.paymentMethod || 'BENEFIT_PAY',
                cashTendered: receiptData.cashTendered,
                changeDue: receiptData.changeDue,
                date: `${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`,
                cashierName: localStorage.getItem('active_shift_cashier') || 'Register 01'
              });
            }
            if (receiptData?.paymentMethod === 'CASH' && receiptData?.cashTendered !== undefined) {
              const tendered = Number(receiptData.cashTendered);
              const change = receiptData.changeDue !== undefined ? Number(receiptData.changeDue) : (tendered > total ? tendered - total : 0);
              setChangeFlashNotice({ changeDue: change, tendered });
              if (changeFlashTimeoutRef.current) clearTimeout(changeFlashTimeoutRef.current);
              changeFlashTimeoutRef.current = setTimeout(() => {
                setChangeFlashNotice(null);
              }, 6000);
            }
            clearActiveCart();
            showToast(`🧾 ${receiptData?.paymentMethod === 'BENEFIT_PAY' ? 'BenefitPay' : (receiptData?.paymentMethod || 'Payment')} Confirmed!`, 'success');
          }}
        />
      )}

      {/* PREVIOUS BILLS & REPRINTS MODAL [F9] */}
      {showPreviousBillsModal && (
        <PreviousBillsModal
          isOpen={showPreviousBillsModal}
          onClose={() => setShowPreviousBillsModal(false)}
        />
      )}

      {/* CASH CHANGE TO RETURN FLASH BANNER */}
      {changeFlashNotice && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-5 animate-in slide-in-from-top duration-200 border-2 border-emerald-300">
          <div className="p-3 bg-white/20 rounded-xl flex items-center justify-center">
            <Banknote size={36} className="text-white" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-100">
              Change to Return to Customer
            </div>
            <div className="font-mono text-4xl font-black tracking-tight">
              BD {changeFlashNotice.changeDue.toFixed(3)}
            </div>
            <div className="text-xs text-emerald-200 font-mono mt-0.5">
              Customer Handed: BD {changeFlashNotice.tendered.toFixed(3)}
            </div>
          </div>
          {lastCompletedSale && (
            <button
              type="button"
              onClick={handleReprintLastReceipt}
              className="ml-2 px-3 py-1.5 bg-white text-emerald-800 hover:bg-emerald-50 rounded-lg text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
              title="Print thermal receipt on customer request"
            >
              <Printer size={14} />
              <span>Print Receipt</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setChangeFlashNotice(null)}
            className="ml-2 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 rounded-lg text-xs font-bold cursor-pointer transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* NBR-COMPLIANT SIMPLIFIED TAX INVOICE PRINT STRIP (58mm / 80mm Thermal Receipt - Nesto/NBB Style) */}
      <div className={`hidden print:block print-receipt format-${receiptFormat} bg-white text-black font-mono`}>
        {/* HEADER */}
        <div className="center bold large">ASKAR SUPERMARKET</div>
        <div className="center bold">أسواق عسكر المركزية</div>
        <div className="center" style={{ fontSize: '9px' }}>Simplified Tax Invoice</div>
        <div className="center" style={{ fontSize: '9px' }}>فاتورة ضريبية مبسطة</div>
        <div className="center" style={{ fontSize: '9px' }}>VAT No: 200012345678901</div>
        <div className="center" style={{ fontSize: '9px' }}>Tel: +973 1700 0000</div>

        <div className="divider" />

        {/* META INFO (Strict Alignment) */}
        <div className="row"><span>Inv:</span> <span className="bold">{lastCompletedSale?.invoiceNo || `INV-${Date.now().toString().slice(-6)}`}</span></div>
        <div className="row"><span>Date:</span> <span>{lastCompletedSale?.date || `${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`}</span></div>
        <div className="row"><span>Staff:</span> <span>{lastCompletedSale?.cashierName || 'Register 01'}</span></div>
        <div className="row"><span>Mode:</span> <span>{lastCompletedSale?.paymentMode || 'CASH'}</span></div>

        <div className="divider" />

        {/* ITEMS HEADER */}
        <div className="item-row bold">
          <div className="item-name">Item</div>
          <div className="item-qty">Qty</div>
          <div className="item-amt">Amt(BD)</div>
        </div>

        <div className="divider" />

        {/* ITEMS LIST */}
        {(lastCompletedSale?.items || cart).map((item) => {
          const qty = item.qty ?? (item as any).quantity ?? 1;
          const rate = item.vatRate !== undefined ? Number(item.vatRate) : ((item as any).taxRate === 0 ? 0 : 10);
          const isTaxable = rate === 10;
          const unitPrice = item.price ?? (item as any).sellingPrice ?? 0;
          return (
            <div key={item.id} className="item-row">
              <div className="item-name">{item.name} {isTaxable ? '*' : ''}</div>
              <div className="item-qty">{item.isScaleItem || (item as any).is_weighed_item ? `${qty.toFixed(3)}kg` : qty}</div>
              <div className="item-amt">{(unitPrice * qty).toFixed(3)}</div>
            </div>
          );
        })}

        <div className="divider" />

        {/* TOTALS */}
        <div className="row"><span>Subtotal:</span> <span>BD {lastCompletedSale ? lastCompletedSale.subtotal.toFixed(3) : cartTotals.subtotalStr}</span></div>
        <div className="row"><span>VAT (10%):</span> <span>BD {lastCompletedSale ? lastCompletedSale.totalVat.toFixed(3) : cartTotals.totalVatStr}</span></div>

        {/* Highlighted Total */}
        <div className="divider" />
        <div className="row bold large">
          <span>TOTAL:</span>
          <span>BD {lastCompletedSale ? lastCompletedSale.total.toFixed(3) : cartTotals.finalTotalStr}</span>
        </div>
        <div className="divider" />

        <div className="center bold" style={{ marginTop: '4px' }}>
          *** PAID VIA {lastCompletedSale?.paymentMode || 'CASH'} ***
        </div>

        {(lastCompletedSale?.cashTendered !== undefined || changeFlashNotice) && (
          <>
            <div className="row" style={{ marginTop: '2px' }}>
              <span>Cash Tendered:</span> <span>BD {(lastCompletedSale?.cashTendered ?? changeFlashNotice?.tendered ?? 0).toFixed(3)}</span>
            </div>
            <div className="row">
              <span>Change:</span> <span>BD {(lastCompletedSale?.changeDue ?? changeFlashNotice?.changeDue ?? 0).toFixed(3)}</span>
            </div>
          </>
        )}

        {/* FOOTER & BARCODE */}
        <div className="barcode-container">
          <div style={{ letterSpacing: '2px', fontWeight: 700, fontSize: '11px', lineHeight: 1 }}>
            |||| | ||||| |||| || |||||||
          </div>
          <div style={{ fontSize: '9px', marginTop: '2px', fontWeight: 700 }}>{lastCompletedSale?.invoiceNo || `INV-${Date.now().toString().slice(-6)}`}</div>
        </div>

        <div className="center" style={{ marginTop: '6px', fontSize: '8.5px', lineHeight: 1.2 }}>
          * Item includes 10% VAT<br />
          Thank You For Shopping!<br />
          Please retain invoice for returns.
        </div>

        {/* Khata QR Code */}
        <div className="flex flex-col items-center justify-center mt-2 pt-1 border-t border-dashed border-black">
          <QRCodeSVG
            value={customer?.id ? `https://askar-khata-pwa.vercel.app/tab/${customer.id}` : `https://askar-khata-pwa.vercel.app`}
            size={receiptFormat === '80mm' ? 82 : 68}
            level="M"
          />
          <p className="text-[8px] font-bold text-center mt-1">SCAN FOR LIVE STATEMENT & BENEFITPAY</p>
        </div>
      </div>

    </div>
  );
}