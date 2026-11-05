import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Search, X, Plus, Minus, Trash2, Tag, Percent, KeyRound, LogOut, Wifi, HardDrive, RefreshCw, ScanLine, ShoppingCart, UserX, Lock, Unlock, Truck, Receipt, ShieldAlert, Banknote } from 'lucide-react';
import { printFullReceipt, openCashDrawer, kickCashDrawer, processRefund } from '../utils/printer';
import { useNfcScanner } from '../hooks/useNfcScanner';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { useSunmiBridge } from '../hooks/useSunmiBridge';
import { parseScaleBarcode, findProductByPLU } from '../utils/scaleBarcodeParser';
import { CustomerDisplay } from '../plugins/CustomerDisplay';
// --- LAZY-LOADED BACK-OFFICE PAGES (never parsed on Sunmi in cashier mode) ---
const StockManagement = lazy(() => import('./StockManagement'));
const FinancialDashboard = lazy(() => import('./FinancialDashboard'));
const MasterReport = lazy(() => import('./MasterReport'));
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
import WeightInputModal from '../components/WeightInputModal';
import { db } from '../db.ts';
import POSGrid from '../components/POSGrid.tsx';
import { useDisasterRecovery } from '../hooks/useDisasterRecovery';
import SyncTrafficLight from '../components/SyncTrafficLight';
import { ASKAR_OFFLINE_SALES_KEY } from '../constants/storage';
import { useOfflineSync } from '../hooks/useOfflineSync';

interface Product {
  id: string;
  name: string;
  sellingPrice: number;
  price?: number;
  purchasePrice?: number;
  unitCost?: number;
  vatRate?: number; // 10 for standard, 0 for zero-rated basic foods
  taxRate?: number;
  barcode?: string;
  quantity?: number;
  stockQuantity?: number;
  productId?: string;
  isScaleItem?: boolean;
  scaleWeight?: number;
  category?: string;
  isQuickProduct?: boolean;
  originalPrice?: number;
  discountNote?: string;
  is_weighed_item?: boolean;
  total_price?: number;
}

interface CartTab {
  id: string;
  name: string;
  items: Product[];
}

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  cpr?: string | null;
  cardUid?: string | null;
  currentBalance: number;
  personalBalance?: number;
  creditLimit?: number;
  isStale?: boolean;
  isOverLimit?: boolean;
  daysSinceLastPayment?: number;
  // Mess Group & Dual-Wallet Extensions
  isMess?: boolean;
  hasMessGroup?: boolean;
  isDual?: boolean;
  card_type?: string;
  mess_id?: string;
  tag_id?: string;
  group_name?: string;
  messGroup?: {
    id: string;
    group_name: string;
    members: any[];
    memberCount: number;
    totalBalance?: number;
  };
  members?: any[];
  memberCount?: number;
  shopper?: {
    id: string;
    name: string;
  };
}

const DEFAULT_PRODUCTS: Product[] = [
  { id: '1', name: 'Arabian Perfume', sellingPrice: 25.500, purchasePrice: 15.0, barcode: '1', vatRate: 10, stockQuantity: 25 },
  { id: '2', name: 'Smart Watch', sellingPrice: 45.000, purchasePrice: 30.0, barcode: '2', vatRate: 10, stockQuantity: 10 },
  { id: '3', name: 'Wireless Earbuds', sellingPrice: 15.000, purchasePrice: 8.0, barcode: '3', vatRate: 10, stockQuantity: 15 },
  { id: '4', name: 'USB-C Cable', sellingPrice: 3.500, purchasePrice: 1.5, barcode: '4', vatRate: 10, stockQuantity: 50 },
  { id: '101', name: 'Fresh Australian Mutton / Lamb', sellingPrice: 3.800, purchasePrice: 2.5, barcode: '00101', vatRate: 0, stockQuantity: 40 },
  { id: '102', name: 'Fresh Local Beef Cubes', sellingPrice: 3.200, purchasePrice: 2.0, barcode: '00102', vatRate: 0, stockQuantity: 35 },
  { id: '103', name: 'Turkish White Feta Cheese', sellingPrice: 2.400, purchasePrice: 1.5, barcode: '00103', vatRate: 0, stockQuantity: 20 },
  { id: '104', name: 'Almarai Fresh Milk 2L', sellingPrice: 1.100, purchasePrice: 0.850, barcode: '00104', vatRate: 0, stockQuantity: 30 },
  { id: '105', name: 'White Sliced Bread', sellingPrice: 0.400, purchasePrice: 0.250, barcode: '00105', vatRate: 0, stockQuantity: 50 },
  { id: '107', name: 'Loose Red Tomatoes 1kg', sellingPrice: 0.350, purchasePrice: 0.200, barcode: '00107', vatRate: 0, is_weighed_item: true, stockQuantity: 100 },
  { id: '110', name: 'Red Onions 1kg', sellingPrice: 0.250, purchasePrice: 0.150, barcode: '00110', vatRate: 0, is_weighed_item: true, stockQuantity: 80 },
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

  const [catalog, setCatalog] = useState<Product[]>(DEFAULT_PRODUCTS);
  const [carts, setCarts] = useState<CartTab[]>([
    { id: '1', name: 'Cart 1', items: [] }
  ]);
  const [activeCartId, setActiveCartId] = useState('1');

  // Helper to get the currently visible active cart and items
  const activeCart = carts.find((c) => c.id === activeCartId) || carts[0];
  const cart = activeCart.items;

  // Tab Management Functions
  const addNewTab = () => {
    if (carts.length >= 4) {
      showToast("⚠️ Maximum 4 parked carts allowed.", "info");
      return;
    }
    const newId = crypto.randomUUID();
    setCarts((prev) => [...prev, { id: newId, name: `Cart ${prev.length + 1}`, items: [] }]);
    setActiveCartId(newId); // Auto-switch to the fresh cart
  };

  const closeTab = (idToClose: string, e?: React.MouseEvent) => {
    e?.stopPropagation(); // Prevent clicking tab underneath X
    if (carts.length === 1) {
      setCarts([{ id: activeCartId, name: 'Cart 1', items: [] }]);
      setCustomer(null);
      return;
    }
    const filtered = carts.filter((c) => c.id !== idToClose);
    setCarts(filtered);
    if (activeCartId === idToClose) {
      setActiveCartId(filtered[0].id);
    }
  };

  const clearActiveCart = () => {
    setCarts((prev) => prev.map((c) => (c.id === activeCartId ? { ...c, items: [] } : c)));
    setCustomer(null);
  };
  const [apiBase, setApiBase] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('master_server_url');
      if (saved && saved.trim()) return saved.trim();
      const isNative = (window as any).Capacitor?.isNativePlatform?.();
      if (isNative) return 'http://192.168.8.7:3000';
      const host = window.location.hostname || 'localhost';
      return `http://${host}:3000`;
    }
    return 'http://localhost:3000';
  });

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
  const [customServerIp, setCustomServerIp] = useState(() => {
    return localStorage.getItem('master_server_url') || import.meta.env.VITE_API_URL || 'http://192.168.8.7:3000';
  });

  // Active Linked Customer for Checkout
  const [customer, setCustomer] = useState<Customer | null>(null);

  // Customer Management & Enrollment State
  const [showCustomersModal, setShowCustomersModal] = useState(false);
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [bindingCustomerId, setBindingCustomerId] = useState<string | null>(null);
  const [newCustName, setNewCustName] = useState('');
  const [newCustCardUid, setNewCustCardUid] = useState('');
  const [manualUidInput, setManualUidInput] = useState('');

  // Hardware Barcode Scanner State
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null);

  // Barcode Assigner & Product Management State
  const [showProductsModal, setShowProductsModal] = useState(false);
  const [bindingProductId, setBindingProductId] = useState<string | null>(null);
  const [unassignedBarcode, setUnassignedBarcode] = useState<string | null>(null);
  const [manualBarcodeAssignInput, setManualBarcodeAssignInput] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isReturnMode, setIsReturnMode] = useState(false);
  const [showKhataHub, setShowKhataHub] = useState(false);
  const [showZReportModal, setShowZReportModal] = useState(false);
  const [showBlindCloseModal, setShowBlindCloseModal] = useState(false);
  const [showCashOutModal, setShowCashOutModal] = useState(false);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [showReceivingDrawer, setShowReceivingDrawer] = useState(false);
  const [showOrderHistoryDrawer, setShowOrderHistoryDrawer] = useState(false);
  const receivingScanCallbackRef = useRef<((barcode: string) => boolean) | null>(null);
  const handleRegisterReceivingScanListener = useCallback((cb: ((barcode: string) => boolean) | null) => {
    receivingScanCallbackRef.current = cb;
  }, []);

  // Quick Products State & Dynamic Fetching
  const [quickProducts, setQuickProducts] = useState<any[]>([]);
  const [selectedQuickCategory, setSelectedQuickCategory] = useState<string>('ALL');
  const [activeGridTab, setActiveGridTab] = useState<'quick' | 'full'>('quick');
  const [quickCategories, setQuickCategories] = useState<QuickCategory[]>(() => {
    try {
      const saved = localStorage.getItem('pos_quick_categories');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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
  const [discountTab, setDiscountTab] = useState<'discount' | 'override'>('discount');
  const [customDiscountPercent, setCustomDiscountPercent] = useState<string>('');
  const [overridePriceInput, setOverridePriceInput] = useState<string>('');
  const [managerPinInput, setManagerPinInput] = useState<string>('');
  const [overrideError, setOverrideError] = useState<string | null>(null);

  // Hard Credit Limit POS Blocking State (Idea 2)
  const [creditLimitBlockedInfo, setCreditLimitBlockedInfo] = useState<{
    customer: Customer;
    currentBalance: number;
    saleAmount: number;
    projectedBalance: number;
    creditLimit: number;
    exceededBy: number;
  } | null>(null);
  const [creditOverridePin, setCreditOverridePin] = useState('');
  const [creditOverrideError, setCreditOverrideError] = useState<string | null>(null);

  const handleAuthorizeCreditOverride = async () => {
    if (creditOverridePin.trim() !== '9999') {
      setCreditOverrideError('Invalid Manager PIN. Store default is 9999.');
      return;
    }
    const info = creditLimitBlockedInfo;
    setCreditLimitBlockedInfo(null);
    setCreditOverridePin('');
    setCreditOverrideError(null);
    if (info) {
      showToast(`🔓 Manager Override Authorized for ${info.customer.name}`, 'success');
      await processCheckout('CREDIT', true);
    }
  };

  // Weighed Produce Item Manual Numpad Modal State (Sunmi D2 Mini)
  const [selectedWeighedItem, setSelectedWeighedItem] = useState<Product | null>(null);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);

  const handleItemSelection = (item: Product) => {
    const catalogItem = catalog.find((p) => p.id === item.id);
    const availableStock = catalogItem?.stockQuantity !== undefined ? Number(catalogItem.stockQuantity) : (item.stockQuantity !== undefined ? Number(item.stockQuantity) : null);
    if (!isReturnMode && availableStock !== null && availableStock <= 0) {
      showToast(`❌ [Out of Stock]: "${item.name}" has 0 units available in inventory.`, 'error');
      return;
    }

    if (item.is_weighed_item) {
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

  // Intercept Quick Product clicks: In Edit Mode opens customize modal; otherwise checks for weighed item
  const handleQuickItemClick = (item: Product) => {
    if (isEditMode) {
      setEditingQuickProduct(item);
    } else {
      handleItemSelection(item);
    }
  };

  // Massive F12 Full Inventory Search Overlay State
  const [showF12SearchModal, setShowF12SearchModal] = useState(false);
  const [f12SearchQuery, setF12SearchQuery] = useState('');
  const f12InputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (showF12SearchModal) {
      const timer = setTimeout(() => {
        f12InputRef.current?.focus();
        f12InputRef.current?.select();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [showF12SearchModal]);

  const [lastScannedProductId, setLastScannedProductId] = useState<string | null>(null);

  // Filter products instantly for F12 search modal
  const f12FilteredCatalog = useMemo(() => {
    const q = f12SearchQuery.trim().toLowerCase();
    if (!q) return catalog.slice(0, 30);
    return catalog.filter((product) => {
      return (
        product.name.toLowerCase().includes(q) ||
        (product.barcode && product.barcode.toLowerCase().includes(q)) ||
        product.id.toLowerCase().includes(q)
      );
    });
  }, [catalog, f12SearchQuery]);

  // Dynamic quick products fallback if offline
  const activeQuickProducts = useMemo(() => {
    if (quickProducts && quickProducts.length > 0) {
      return quickProducts;
    }
    return catalog.slice(0, 15).map((p) => {
      const name = p.name.toLowerCase();
      let cat = 'ESSENTIALS';
      if (name.includes('tomato') || name.includes('cucumber') || name.includes('banana') || name.includes('potato') || name.includes('onion')) cat = 'PRODUCE';
      else if (name.includes('bread') || name.includes('khubz') || name.includes('samoli')) cat = 'BAKERY';
      else if (name.includes('milk') || name.includes('laban') || name.includes('feta') || name.includes('cheese')) cat = 'DAIRY';
      else if (name.includes('mutton') || name.includes('beef') || name.includes('meat')) cat = 'MEAT';
      return { ...p, category: cat };
    });
  }, [quickProducts, catalog]);

  const displayedQuickProducts = useMemo(() => {
    if (selectedQuickCategory === 'ALL') return activeQuickProducts;
    return activeQuickProducts.filter((p) => (p.category || 'ESSENTIALS') === selectedQuickCategory);
  }, [activeQuickProducts, selectedQuickCategory]);

  const getCategoryTheme = (cat?: string) => {
    const raw = (cat || 'ESSENTIALS').toUpperCase();
    const matched = quickCategories.find((c) => c.id.toUpperCase() === raw);
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
  const [showAddProductForm, setShowAddProductForm] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdPurchasePrice, setNewProdPurchasePrice] = useState('');
  const [newProdBarcode, setNewProdBarcode] = useState('');

  // Secondary Customer Display State
  const [customerScreenReady, setCustomerScreenReady] = useState(false);


  // In-app non-blocking toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 3500);
  };

  // Native NFC Scanner Hook
  const { scannedUid, lastDetectedUid, clearScan, isScanning, hardwareSupported, simulateScan } = useNfcScanner();

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
        setCustomServerIp(clean);
        // Also inform the local sync engine if running
        fetch(`http://localhost:3000/api/config/master-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ masterUrl: clean })
        }).catch(() => {});
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
  const QUICK_PRODUCTS_CACHE_KEY = 'askar_quick_products_cache';
  const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes stale threshold

  const readCatalogCache = (): Product[] | null => {
    try {
      const raw = localStorage.getItem(CATALOG_CACHE_KEY);
      if (!raw) return null;
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts < CATALOG_CACHE_TTL_MS && Array.isArray(data) && data.length > 0) return data;
      return data; // return stale data anyway — background refresh will update
    } catch { return null; }
  };

  const writeCatalogCache = (data: Product[]) => {
    try { localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch { }
  };

  const readQuickCache = (): any[] | null => {
    try {
      const raw = localStorage.getItem(QUICK_PRODUCTS_CACHE_KEY);
      if (!raw) return null;
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts < CATALOG_CACHE_TTL_MS && Array.isArray(data) && data.length > 0) return data;
      return data;
    } catch { return null; }
  };

  const writeQuickCache = (data: any[]) => {
    try { localStorage.setItem(QUICK_PRODUCTS_CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch { }
  };

  // Resolve working API base across candidates
  const resolveApiBase = useCallback(async (): Promise<string | null> => {
    const configuredTarget = localStorage.getItem('master_server_url') || apiBase;
    const candidates = [configuredTarget, 'http://localhost:3000', 'http://192.168.8.7:3000'].filter(
      (val, idx, arr) => Boolean(val) && arr.indexOf(val) === idx
    );
    for (const url of candidates) {
      try {
        const res = await fetch(`${url}/products`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) { setApiBase(url); return url; }
      } catch { }
    }
    return null;
  }, [apiBase]);

  // Fetch fresh catalog from network (background, non-blocking)
  const fetchCatalog = useCallback(async () => {
    const url = await resolveApiBase();
    if (!url) { setCatalog(prev => prev.length > 0 ? prev : DEFAULT_PRODUCTS); return; }
    try {
      const res = await fetch(`${url}/products`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setCatalog(data);
          writeCatalogCache(data);
        }
      }
    } catch { }
  }, [resolveApiBase]);

  const fetchQuickProducts = useCallback(async () => {
    const configuredTarget = localStorage.getItem('master_server_url') || apiBase;
    const candidates = [configuredTarget, 'http://localhost:3000', 'http://192.168.8.7:3000'].filter(
      (val, idx, arr) => Boolean(val) && arr.indexOf(val) === idx
    );
    for (const url of candidates) {
      try {
        const res = await fetch(`${url}/api/quick-products`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setQuickProducts(data);
            writeQuickCache(data);
            return;
          }
        }
      } catch { }
    }
  }, [apiBase]);

  const fetchQuickCategories = useCallback(async () => {
    const configuredTarget = localStorage.getItem('master_server_url') || apiBase;
    const candidates = [configuredTarget, 'http://localhost:3000', 'http://192.168.8.7:3000'].filter(
      (val, idx, arr) => Boolean(val) && arr.indexOf(val) === idx
    );
    for (const url of candidates) {
      try {
        const res = await fetch(`${url}/api/quick-categories`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const data = await res.json();
          if (data?.categories && Array.isArray(data.categories) && data.categories.length > 0) {
            setQuickCategories(data.categories);
            try {
              localStorage.setItem('pos_quick_categories', JSON.stringify(data.categories));
            } catch {}
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
    } catch {}

    const configuredTarget = localStorage.getItem('master_server_url') || apiBase;
    const candidates = [configuredTarget, 'http://localhost:3000', 'http://192.168.8.7:3000'].filter(
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
      } catch {}
    }
  };

  // Public: force a manual catalog refresh (called after barcode scan miss or manual sync)
  const refreshCatalogNow = useCallback(() => {
    fetchCatalog();
    fetchQuickProducts();
    fetchQuickCategories();
  }, [fetchCatalog, fetchQuickProducts, fetchQuickCategories]);

  // On mount: serve from cache INSTANTLY, then refresh in background (non-blocking)
  useEffect(() => {
    // 1. Serve from localStorage cache immediately (0ms)
    const cachedCatalog = readCatalogCache();
    if (cachedCatalog && cachedCatalog.length > 0) setCatalog(cachedCatalog);
    else setCatalog(DEFAULT_PRODUCTS);

    const cachedQuick = readQuickCache();
    if (cachedQuick && cachedQuick.length > 0) setQuickProducts(cachedQuick);

    try {
      const cachedTabs = localStorage.getItem('pos_quick_categories');
      if (cachedTabs) {
        const parsed = JSON.parse(cachedTabs);
        if (Array.isArray(parsed) && parsed.length > 0) setQuickCategories(parsed);
      }
    } catch {}

    // 2. Background refresh — does NOT block or re-render above
    fetchCatalog();
    fetchQuickProducts();
    fetchQuickCategories();

    // 3. Refresh every 3 minutes only (not every 20s) — products rarely change mid-shift
    const catInterval = setInterval(() => {
      fetchCatalog();
      fetchQuickProducts();
      fetchQuickCategories();
    }, 3 * 60 * 1000);
    return () => clearInterval(catInterval);
  }, []);

  useEffect(() => {
    if (showF12SearchModal) {
      setTimeout(() => {
        f12InputRef.current?.focus();
      }, 50);
    }
  }, [showF12SearchModal]);

  // Fetch all customers for enrollment list
  const loadCustomers = async () => {
    try {
      const res = await fetch(`${apiBase}/api/customers`);
      if (res.ok) {
        const data = await res.json();
        setCustomersList(data);
      }
    } catch (e) {
      console.error("Failed to load customers:", e);
    }
  };

  // Check Outbox Sync Status
  const [syncInfo, setSyncInfo] = useState<{ pendingCount: number; syncedCount: number } | null>(null);

  const checkSyncStatus = async () => {
    try {
      const res = await fetch(`${apiBase}/api/sync/status`);
      if (res.ok) {
        const data = await res.json();
        setSyncInfo(data);
      }
    } catch {}
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



  // React to NFC Hardware Scans
  useEffect(() => {
    if (!scannedUid) return;

    // If Khata Hub is open, let Khata Hub handle the scan internally (enrollment or settlement)
    if (showKhataHub) {
      return;
    }

    // If Customer Drawer is open, attach scanned UID to new customer form
    if (showCustomersModal) {
      setNewCustCardUid(scannedUid);
      showToast(`💳 NFC Card Detected: ${scannedUid}`, 'info');
      clearScan();
      return;
    }

    if (bindingCustomerId) {
      // FLOW 2: ENROLLMENT - Manager is binding card to customer
      handleBindCard(bindingCustomerId, scannedUid);
    } else {
      // FLOW 1: TAP-TO-PAY - Customer taps card at register
      fetchCustomerByCard(scannedUid);
    }
  }, [scannedUid, showKhataHub, showCustomersModal, bindingCustomerId]);

  // Lookup customer by Card UID (Instant non-blocking response)
  const fetchCustomerByCard = async (uid: string) => {
    clearScan();
    try {
      const res = await fetch(`${apiBase}/api/customers/by-card/${encodeURIComponent(uid)}`);
      if (res.ok) {
        const custData = await res.json();
        const activeCust = custData.customer || custData;
        setCustomer(activeCust);

        const bal = Number(activeCust.personalBalance ?? activeCust.currentBalance ?? activeCust.balance ?? 0);
        const lim = Number(activeCust.creditLimit ?? activeCust.credit_limit ?? 30.0);

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

  // Bind a scanned UID to a customer
  const handleBindCard = async (customerId: string, uidToBind: string) => {
    clearScan();
    try {
      const res = await fetch(`${apiBase}/api/customers/${customerId}/bind-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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


  // Add new customer in enrollment view
  const handleCreateCustomer = async () => {
    if (!newCustName.trim()) return alert("Enter customer name");
    try {
      const res = await fetch(`${apiBase}/api/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newCustName.trim(),
          cardUid: newCustCardUid.trim() || undefined
        })
      });
      const data = await res.json();
      if (res.ok && (data.success || data.id)) {
        showToast(`✅ Customer "${newCustName.trim()}" created${newCustCardUid ? ' & NFC card linked' : ''}!`, 'success');
        setNewCustName('');
        setNewCustCardUid('');
        loadCustomers();
      } else {
        showToast(data.error || 'Failed to create customer', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('Error creating customer', 'error');
    }
  };

  const addToCart = (product: Product, quantity = 1): boolean => {
    // 1. Resolve live stock from catalog
    const catalogItem = catalog.find(
      (p) => p.id === product.id || (p.barcode && product.barcode && p.barcode === product.barcode)
    );
    const availableStock = catalogItem?.stockQuantity !== undefined 
      ? Number(catalogItem.stockQuantity) 
      : (product.stockQuantity !== undefined ? Number(product.stockQuantity) : null);

    // 2. Strict Stock Guard (Prevent Out-of-Stock and Over-Billing)
    if (!isReturnMode && availableStock !== null) {
      if (availableStock <= 0) {
        showToast(`❌ [Out of Stock]: "${product.name}" has 0 units available in inventory. Billing blocked.`, 'error');
        return false;
      }

      // Check current quantity in active cart
      const currentItemInCart = activeCart.items.find((p) => p.id === product.id);
      const currentCartQty = currentItemInCart ? (currentItemInCart.quantity ?? 1) : 0;
      const targetQty = currentCartQty + quantity;

      if (targetQty > availableStock) {
        showToast(
          `⚠️ [Stock Limit Exceeded]: Only ${availableStock} units of "${product.name}" in store. (Cart already has ${currentCartQty})`,
          'error'
        );
        return false;
      }
    }

    const unitPrice = product.sellingPrice ?? product.price ?? 0;
    const totalPrice = unitPrice * quantity;
    setLastScannedProductId(product.id);
    setCarts((prevCarts) =>
      prevCarts.map((c) => {
        if (c.id !== activeCartId) return c; // Ignore other tabs

        const existing = c.items.find((p) => p.id === product.id);
        const qtyModifier = isReturnMode ? -Math.abs(quantity) : quantity;

        if (existing) {
          const newQty = Number(((existing.quantity ?? 1) + qtyModifier).toFixed(3));
          if (newQty <= 0) {
            return { ...c, items: c.items.filter((p) => p.id !== product.id) };
          }
          return {
            ...c,
            items: c.items.map((p) =>
              p.id === product.id ? { ...p, quantity: newQty } : p
            )
          };
        }

        return {
          ...c,
          items: [...c.items, { ...product, quantity: qtyModifier, price: unitPrice, total_price: totalPrice, stockQuantity: availableStock ?? product.stockQuantity }]
        };
      })
    );
    return true;
  };

  // Assign / Bind or Unbind Barcode to a Product
  const handleBindBarcode = async (productId: string, barcodeToBind: string) => {
    const cleanBarcode = barcodeToBind.trim();
    const product = catalog.find((p) => p.id === productId);
    try {
      const res = await fetch(`${apiBase}/api/products/${productId}/bind-barcode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // Quick Add New Product to SQLite
  const handleCreateProduct = async () => {
    if (!newProdName.trim()) {
      showToast("⚠️ Enter product name", 'info');
      return;
    }
    const price = parseFloat(newProdPrice);
    if (isNaN(price) || price <= 0) {
      showToast("⚠️ Enter a valid selling price", 'info');
      return;
    }
    const cost = parseFloat(newProdPurchasePrice) || price * 0.6;
    try {
      const res = await fetch(`${apiBase}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProdName.trim(),
          sellingPrice: price,
          purchasePrice: cost,
          stockQuantity: 100,
          barcode: newProdBarcode.trim() || undefined
        })
      });
      if (res.ok) {
        showToast(`✅ Product "${newProdName.trim()}" created!`, 'success');
        setNewProdName('');
        setNewProdPrice('');
        setNewProdPurchasePrice('');
        setNewProdBarcode('');
        setShowAddProductForm(false);
        await fetchCatalog();
      } else {
        const err = await res.json();
        showToast(`❌ ${err.error || 'Failed to create product'}`, 'error');
      }
    } catch (e) {
      console.error(e);
      showToast("❌ Error creating product", 'error');
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
        processRefund(cleanCode, activeShift).then((res) => {
          if (res.success) {
            showToast(`↩️ Refund processed for Invoice #${cleanCode}`, 'success');
          } else if (res.error) {
            showToast(res.error, 'error');
          }
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
        let unitSellingPrice = matchedProduct.sellingPrice;
        let displayName = matchedProduct.name;
        let weightKg: number | undefined;

        if (scaleParsed.type === 'WEIGHT') {
          // Prefix 22: Value is weight in kg (3 decimals)
          weightKg = scaleParsed.extractedValue || 0;
          unitSellingPrice = Number(((weightKg) * (matchedProduct.sellingPrice || 1)).toFixed(3));
          displayName = `${matchedProduct.name} (${weightKg.toFixed(3)} kg)`;
        } else {
          // Prefix 20 or 21: Price-embedded barcode (fils divided by 1000)
          unitSellingPrice = scaleParsed.extractedValue || matchedProduct.sellingPrice;
          displayName = `${matchedProduct.name} (Scale Pack BD ${unitSellingPrice.toFixed(3)})`;
        }

        // Each weighed pack has a distinct price and weight, give it a unique cart instance ID
        const scaleCartItem: Product = {
          ...matchedProduct,
          id: `${matchedProduct.id}_scale_${cleanCode}`,
          productId: matchedProduct.id,
          name: displayName,
          sellingPrice: unitSellingPrice,
          barcode: cleanCode,
          isScaleItem: true,
          scaleWeight: weightKg,
          quantity: 1,
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
      if (!product.is_weighed_item) {
        showToast(`🏷️ Scanned: ${product.name} (BD ${product.sellingPrice.toFixed(3)})`, 'success');
      }
    } else {
      setUnassignedBarcode(cleanCode);
      showToast(`⚠️ Unassigned Barcode: [${cleanCode}]. Quick Add triggered.`, 'info');
      setShowPosAddModal(true);
    }
  };

  // Attach global high-speed hardware barcode scanner listener
  useBarcodeScanner(handleBarcodeScan);


  // Bahrain NBR Compliant Cart Calculation (Per-Item Inclusive 10% vs 0% Zero-Rated)
  const calculateCartTotals = (cartItems: Product[]) => {
    let subtotal = 0;
    let totalVat = 0;
    let finalTotal = 0;

    cartItems.forEach((item) => {
      const qty = item.quantity ?? 1;
      const lineTotal = item.sellingPrice * qty;
      finalTotal += lineTotal;

      // In Bahrain, standard is 10%, basic food items (milk, bread, produce, meat) are 0% (Zero-Rated)
      const rate = item.vatRate !== undefined
        ? Number(item.vatRate)
        : (item.taxRate !== undefined && item.taxRate === 0 ? 0 : 10);

      // If item is 10% VAT, extract the tax amount from the inclusive price
      // Formula: Price - (Price / 1.10)
      if (rate === 10) {
        const lineTax = lineTotal - (lineTotal / 1.10);
        totalVat += lineTax;
        subtotal += (lineTotal - lineTax);
      } else {
        // 0% VAT (Basic Foods)
        subtotal += lineTotal;
      }
    });

    return { 
      subtotal: Number(subtotal.toFixed(3)), 
      totalVat: Number(totalVat.toFixed(3)), 
      finalTotal: Number(finalTotal.toFixed(3)),
      subtotalStr: subtotal.toFixed(3),
      totalVatStr: totalVat.toFixed(3),
      finalTotalStr: finalTotal.toFixed(3)
    };
  };

  const cartTotals = useMemo(() => calculateCartTotals(cart), [cart]);
  const subtotal = cartTotals.subtotal;
  const vat = cartTotals.totalVat;
  const total = cartTotals.finalTotal;

  // 📡 Live WebSocket LAN Bridge: Stream active cart to Manager's Laptop (Register Spy)
  useSunmiBridge(cart, total, customer);

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
          // Show the last scanned item and running total
          const lastItem = cart[cart.length - 1];
          await CustomerDisplay.updateDisplay({
            text: `${lastItem.name}\nBD ${lastItem.sellingPrice.toFixed(3)}\n\nTOTAL: BD ${total.toFixed(3)}`
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
    isManagerOverridden: boolean = false
  ) => {
    if (cart.length === 0) {
      showToast("⚠️ Cart is empty!", 'info');
      return;
    }

    let customerId: string | null = null;
    let customerName = "";
    let previousBalance = 0;
    let newBalance = 0;

    const isCreditPayment = paymentMethod === 'CREDIT' || paymentMethod === 'CREDIT_PERSONAL' || paymentMethod === 'CREDIT_MESS';

    if (isCreditPayment) {
      if (!customer) {
        CustomerDisplay.updateDisplay?.({
          text: `TOTAL: BD ${total.toFixed(3)}\n\nPlease tap your NFC Khata card now.`
        }).catch(() => {});
        showToast("⚠️ Please tap an NFC card or select a customer for Credit sale!", 'info');
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
      const limit = Number(customer.creditLimit !== undefined && customer.creditLimit !== null ? customer.creditLimit : 30.0);
      if (newBalance > limit && !isManagerOverridden && paymentMethod !== 'CREDIT_MESS') {
        CustomerDisplay.updateDisplay?.({
          text: `${customer.name.toUpperCase()}\n\nLIMIT EXCEEDED!\nLIMIT: BD ${limit.toFixed(3)}\nOWED: BD ${newBalance.toFixed(3)}`
        }).catch(() => {});

        setCreditLimitBlockedInfo({
          customer,
          currentBalance: previousBalance,
          saleAmount: total,
          projectedBalance: newBalance,
          creditLimit: limit,
          exceededBy: Number((newBalance - limit).toFixed(3))
        });
        setCreditOverridePin('');
        setCreditOverrideError(null);
        return;
      }

      CustomerDisplay.updateDisplay?.({
        text: `${customer.name.toUpperCase()}\n\nCHARGE: BD ${total.toFixed(3)}\nBALANCE: BD ${newBalance.toFixed(3)}`
      }).catch(() => {});
    }

    // 1. If physical cash is handed over, pop the drawer immediately in background (non-blocking)
    if (paymentMethod === 'CASH') {
      kickCashDrawer().catch(() => {});
    }

    try {
      // 2. Build the sale payload with per-item frozen VAT rates and extracted VAT amounts
      const salePayload = {
        id: crypto.randomUUID(),
        tenantId: 'askar_main',
        invoiceNo: `INV-${Date.now()}`,
        cart: [...cart],
        subtotal: cartTotals.subtotal,
        totalVat: cartTotals.totalVat,
        vatTotal: cartTotals.totalVat,
        vat: cartTotals.totalVat,
        total: cartTotals.finalTotal,
        totalAmount: cartTotals.finalTotal,
        paymentType: paymentMethod,
        customerId,
        shiftId: shiftId || localStorage.getItem('active_shift_id') || null,
        employeeId: localStorage.getItem('active_employee_id') || 'emp_cashier_1',
        items: cart.map((item) => {
          const qty = item.quantity ?? 1;
          const lineTotal = item.sellingPrice * qty;
          const rate = item.vatRate !== undefined
            ? Number(item.vatRate)
            : (item.taxRate !== undefined && item.taxRate === 0 ? 0 : 10);
          const lineTax = rate === 10 ? Number((lineTotal - (lineTotal / 1.10)).toFixed(3)) : 0;
          return {
            productId: item.productId || item.id,
            quantity: qty,
            priceAtSale: item.sellingPrice,
            costAtSale: item.purchasePrice || 0,
            vatRateAtSale: rate,
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
          messId: customer?.mess_id || customer?.messGroup?.id,
          cardUid: customer?.tag_id || scannedUid,
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
        const res = await fetch(checkoutEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(checkoutPayload),
          signal: AbortSignal.timeout(3500)
        });
        if (res.ok) {
          data = await res.json();
        } else {
          try { data = await res.json(); } catch {}
        }
      } catch (netErr) {
        console.warn("Primary checkout request failed:", netErr);
      }

      // Automatic high-availability failover: If primary failed or threw database error, try alternative candidate
      if (!data || !data.success) {
        const altCandidates = ['http://192.168.8.7:3000', 'http://localhost:3000'].filter(u => !checkoutEndpoint.startsWith(u));
        for (const altBase of altCandidates) {
          try {
            const altUrl = isMessCheckout ? `${altBase}/api/sales/mess-checkout` : `${altBase}/checkout`;
            const altRes = await fetch(altUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(checkoutPayload),
              signal: AbortSignal.timeout(3000)
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

      // ZERO-BLOCK RETAIL SAFEGUARD:
      // Even if master server is unreachable or reports a database error, complete the sale immediately,
      // record it for automatic synchronization, and GUARANTEE the physical receipt prints!
      const isOnlineSuccess = Boolean(data && data.success);
      const verifiedInvoiceNo = isOnlineSuccess
        ? (data.formattedInvoice || data.invoice || data.invoiceNo || 'INV-000001')
        : `INV-OFF-${Date.now().toString().slice(-6)}`;

      if (!isOnlineSuccess) {
        try {
          const offlineQueue = JSON.parse(localStorage.getItem(ASKAR_OFFLINE_SALES_KEY) || '[]');
          offlineQueue.push({
            ...checkoutPayload,
            invoiceNo: verifiedInvoiceNo,
            offlineTimestamp: new Date().toISOString()
          });
          localStorage.setItem(ASKAR_OFFLINE_SALES_KEY, JSON.stringify(offlineQueue));
          updateOfflinePendingCount();
          if (offlineQueue.length > 100) {
            console.warn("⚠️ Offline queue exceeds 100 items. Connect to Wi-Fi soon.");
          }
        } catch {}
      }

      // Update pole / customer display
      if (isMessCheckout) {
        CustomerDisplay.updateDisplay?.({
          text: `${(customer?.group_name || 'MESS').toUpperCase()}\n\nTOTAL: BD ${total.toFixed(3)}\nSPLIT: BD ${(data?.splitAmount || 0).toFixed(3)} / EA`
        }).catch(() => {});
      } else if (paymentMethod === 'CASH') {
        CustomerDisplay.updateDisplay?.({
          text: `THANK YOU!\nVISIT AGAIN\n\nCASH: BD ${total.toFixed(3)}`
        }).catch(() => {});
      } else if ((paymentMethod === 'CREDIT' || paymentMethod === 'CREDIT_PERSONAL') && customer) {
        CustomerDisplay.updateDisplay?.({
          text: `THANK YOU, ${customer.name.toUpperCase()}!\n\nPAID: BD ${total.toFixed(3)}\nNEW BALANCE: BD ${newBalance.toFixed(3)}`
        }).catch(() => {});
      } else {
        const displayLabel = paymentMethod === 'BENEFIT_PAY' ? 'BENEFIT PAY' : paymentMethod;
        CustomerDisplay.updateDisplay?.({
          text: `THANK YOU!\nVISIT AGAIN\n\n${displayLabel}: BD ${total.toFixed(3)}`
        }).catch(() => {});
      }

      // FIRE-AND-FORGET PRINTING:
      // Pass verified sequential invoice number directly to physical printer formatting
      printFullReceipt({
        invoiceNo: verifiedInvoiceNo,
        items: [...cart],
        subtotal,
        vat,
        total,
        paymentMode: isMessCheckout ? 'MESS_KHATA' : paymentMethod,
        isMess: isMessCheckout,
        groupName: customer?.group_name || customer?.messGroup?.group_name,
        shopperName: isMessCheckout ? (customer?.shopper?.name || customer?.name) : undefined,
        members: data?.splits || customer?.members,
        cardUid: customer?.tag_id || scannedUid || undefined,
        customerId: customer?.id || (customer as any)?.customerId || undefined,
        customerUuid: customer?.id || (customer as any)?.customerId || undefined,
        customerName: isMessCheckout ? (customer?.group_name || customer?.messGroup?.group_name) : (customer?.name || customerName),
        customerCardUid: customer?.cardUid || customer?.tag_id || undefined,
        previousBalance: (!isMessCheckout && (paymentMethod === 'CREDIT' || paymentMethod === 'CREDIT_PERSONAL')) ? previousBalance : undefined,
        newBalance: (!isMessCheckout && (paymentMethod === 'CREDIT' || paymentMethod === 'CREDIT_PERSONAL')) ? newBalance : undefined,
        cashierName: "Register 01"
      }).catch((printErr) => console.warn("Background receipt printing warning:", printErr));

      if (isMessCheckout) {
        const shopperInfo = customer?.name ? ` (Shopper: ${customer.name})` : '';
        showToast(`👥 Mess Bill BD ${total.toFixed(3)} charged & split across ${data?.memberCount || customer?.members?.length} members${shopperInfo}!`, 'success');
      } else if (paymentMethod === 'CREDIT_PERSONAL' || paymentMethod === 'CREDIT') {
        showToast(`📒 Sale BD ${total.toFixed(3)} charged to ${customer?.name}'s Personal Khata!`, 'success');
      } else {
        const formattedMethod = paymentMethod === 'BENEFIT_PAY' ? 'Benefit Pay' : paymentMethod;
        if (isOnlineSuccess) {
          showToast(`🧾 ${formattedMethod} Sale Recorded (#${verifiedInvoiceNo}). Cart cleared.`, 'success');
        } else {
          showToast(`🧾 ${formattedMethod} Sale Saved Offline (#${verifiedInvoiceNo}) & Printed!`, 'success');
        }
      }
      
      // Instantly reset checkout UI (non-blocking)
      clearActiveCart();

      // Refresh catalog and quick products to reflect updated inventory stock levels
      fetchCatalog();
      fetchQuickProducts();

      // Fire-and-forget background sync (never blocks cashier speed)
      setTimeout(() => {
        db.sync().catch(() => {});
      }, 500);
    } catch (err) {
      console.error("Checkout error:", err);
      showToast("❌ Error saving sale. Please try again.", 'error');
    }
  };

  // Dedicated Quick Pay Handler matching user's Step 2 specifications
  const handlePayment = async (_cartTotal: number) => {
    return processCheckout('CASH');
  };

  // Adjust quantity of the most recently scanned item for +/- speed keys
  const adjustLastItemQty = (delta: 1 | -1) => {
    if (cart.length === 0) {
      showToast("⚠️ Cart is empty - scan an item first", 'info');
      return;
    }

    // Target the most recently scanned/added item or the last item in cart
    const targetItem =
      (lastScannedProductId && cart.find((p) => p.id === lastScannedProductId)) ||
      cart[cart.length - 1];

    if (!targetItem) return;

    const currentQty = targetItem.quantity ?? 1;
    const newQty = currentQty + delta;

    if (!isReturnMode && delta > 0) {
      const catalogItem = catalog.find(
        (p) => p.id === targetItem.id || (p.barcode && targetItem.barcode && p.barcode === targetItem.barcode)
      );
      const availableStock = catalogItem?.stockQuantity !== undefined 
        ? Number(catalogItem.stockQuantity) 
        : (targetItem.stockQuantity !== undefined ? Number(targetItem.stockQuantity) : null);

      if (availableStock !== null && newQty > availableStock) {
        showToast(
          `⚠️ [Stock Limit]: Only ${availableStock} units of "${targetItem.name}" in inventory. Cannot add more.`,
          'error'
        );
        return;
      }
    }

    setCarts((prevCarts) =>
      prevCarts.map((c) => {
        if (c.id !== activeCartId) return c;

        if (newQty <= 0) {
          return {
            ...c,
            items: c.items.filter((p) => p.id !== targetItem.id),
          };
        }

        return {
          ...c,
          items: c.items.map((p) =>
            p.id === targetItem.id ? { ...p, quantity: newQty } : p
          ),
        };
      })
    );

    if (newQty <= 0) {
      showToast(`🗑️ Removed "${targetItem.name}" from cart`, 'info');
    } else {
      showToast(`⚡ "${targetItem.name}" Qty: ${newQty} (${delta > 0 ? '+1' : '-1'})`, 'info');
    }
  };

  // Adjust quantity for a specific cart row index (Sunmi 60px touch steppers)
  const adjustItemQtyByIndex = (index: number, delta: number) => {
    const targetItem = cart[index];
    if (!targetItem) return;

    const currentQty = targetItem.quantity ?? 1;
    const isWeighed = Boolean(targetItem.is_weighed_item);
    const step = isWeighed ? 0.250 : 1;
    const newQty = Number((currentQty + delta * step).toFixed(3));

    if (!isReturnMode && delta > 0) {
      const catalogItem = catalog.find(
        (p) => p.id === targetItem.id || (p.barcode && targetItem.barcode && p.barcode === targetItem.barcode)
      );
      const availableStock = catalogItem?.stockQuantity !== undefined 
        ? Number(catalogItem.stockQuantity) 
        : (targetItem.stockQuantity !== undefined ? Number(targetItem.stockQuantity) : null);

      if (availableStock !== null && newQty > availableStock) {
        showToast(
          `⚠️ [Stock Limit]: Only ${availableStock} units of "${targetItem.name}" in inventory. Cannot exceed stock.`,
          'error'
        );
        return;
      }
    }

    setCarts((prevCarts) =>
      prevCarts.map((c) => {
        if (c.id !== activeCartId) return c;
        if (newQty <= 0.001) {
          return {
            ...c,
            items: c.items.filter((_, i) => i !== index),
          };
        }
        return {
          ...c,
          items: c.items.map((p, i) =>
            i === index ? { ...p, quantity: newQty } : p
          ),
        };
      })
    );

    if (newQty <= 0.001) {
      showToast(`🗑️ Removed "${targetItem.name}" from cart`, 'info');
    } else {
      showToast(`⚡ "${targetItem.name}" ${isWeighed ? 'Weight' : 'Qty'}: ${isWeighed ? `${newQty.toFixed(3)} kg` : newQty} (${delta > 0 ? `+${step}` : `-${step}`})`, 'info');
    }
  };

  // Line item price override or discount applicator (Rule 5: Tap-to-Edit Price)
  const applyPriceOverride = (index: number, newUnitPrice: number, discountLabel?: string) => {
    setCarts((prevCarts) =>
      prevCarts.map((c) => {
        if (c.id !== activeCartId) return c;
        return {
          ...c,
          items: c.items.map((p, i) => {
            if (i !== index) return p;
            return {
              ...p,
              sellingPrice: Number(newUnitPrice.toFixed(3)),
              originalPrice: p.originalPrice ?? p.sellingPrice,
              discountNote: discountLabel,
            };
          }),
        };
      })
    );
    showToast(`💰 Applied ${discountLabel ? `${discountLabel} ` : ''}price: BD ${newUnitPrice.toFixed(3)}`, 'info');
    setPriceOverrideItem(null);
  };

  // Set explicit quantity for the most recently scanned item
  const setLastItemQty = (qty: number) => {
    if (cart.length === 0) {
      showToast("⚠️ Cart is empty - scan an item first", 'info');
      return;
    }
    const targetItem =
      (lastScannedProductId && cart.find((p) => p.id === lastScannedProductId)) ||
      cart[cart.length - 1];

    if (!targetItem) return;

    if (!isReturnMode && qty > 0) {
      const catalogItem = catalog.find(
        (p) => p.id === targetItem.id || (p.barcode && targetItem.barcode && p.barcode === targetItem.barcode)
      );
      const availableStock = catalogItem?.stockQuantity !== undefined 
        ? Number(catalogItem.stockQuantity) 
        : (targetItem.stockQuantity !== undefined ? Number(targetItem.stockQuantity) : null);

      if (availableStock !== null && qty > availableStock) {
        showToast(
          `⚠️ [Stock Limit]: Only ${availableStock} units of "${targetItem.name}" in inventory. Cannot set to ${qty}.`,
          'error'
        );
        return;
      }
    }

    setCarts((prevCarts) =>
      prevCarts.map((c) => {
        if (c.id !== activeCartId) return c;
        if (qty <= 0) {
          return {
            ...c,
            items: c.items.filter((p) => p.id !== targetItem.id),
          };
        }
        return {
          ...c,
          items: c.items.map((p) =>
            p.id === targetItem.id ? { ...p, quantity: qty } : p
          ),
        };
      })
    );

    if (qty <= 0) {
      showToast(`🗑️ Removed "${targetItem.name}" from cart`, 'info');
    } else {
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

  // Global Keyboard Shortcuts Listener
  // F12: Focus barcode search input
  // F1: Trigger Exact Cash Payment completion
  // F2: Trigger Card Payment completion
  // F3: Open Khata Credit Modal (Khata Hub)
  // + / -: Increment / decrement quantity of most recently scanned item
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      // Don't intercept shortcuts if not on the main POS checkout screen
      if (viewMode !== 'pos') return;

      // 1. F12: Open massive search modal
      if (e.key === 'F12') {
        e.preventDefault();
        setShowF12SearchModal((prev) => !prev);
        setF12SearchQuery('');
        return;
      }

      // Escape: Close F12 Search Modal if open
      if (e.key === 'Escape' && showF12SearchModal) {
        e.preventDefault();
        setShowF12SearchModal(false);
        return;
      }

      // Ctrl + Shift + D: Toggle Developer Diagnostics Panel
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setShowDevPanel((prev) => !prev);
        return;
      }

      // F12: Open / Close Full Inventory Search Overlay
      if (e.key === 'F12' || e.code === 'F12') {
        e.preventDefault();
        setShowF12SearchModal((prev) => {
          if (!prev) setF12SearchQuery('');
          return !prev;
        });
        return;
      }

      // Check if modal dialogs are open; don't trigger background checkouts
      const isAnyModalOpen =
        priceOverrideItem !== null ||
        showF12SearchModal ||
        showKhataHub ||
        showZReportModal ||
        showCashOutModal ||
        showPaymentModal ||
        showRefundModal ||
        showPosAddModal ||
        showAddProductModal ||
        showProductsModal ||
        showCustomersModal;

      if (isAnyModalOpen) return;

      // 2. F1: Trigger Exact Cash Payment
      if (e.key === 'F1') {
        e.preventDefault();
        if (cart.length === 0) {
          showToast("⚠️ Cannot checkout: Cart is empty", 'info');
          return;
        }
        processCheckout('CASH');
        return;
      }

      // 3. F2: Trigger Card Payment
      if (e.key === 'F2') {
        e.preventDefault();
        if (cart.length === 0) {
          showToast("⚠️ Cannot checkout: Cart is empty", 'info');
          return;
        }
        processCheckout('CARD');
        return;
      }

      // 4. F3: If customer attached to cart, execute Khata / Mess checkout. Otherwise open Khata Hub.
      if (e.key === 'F3') {
        e.preventDefault();
        if (cart.length > 0 && customer) {
          if (customer.hasMessGroup && customer.isDual) {
            processCheckout('CREDIT_MESS');
          } else if (customer.isMess) {
            processCheckout('CREDIT_MESS');
          } else {
            processCheckout('CREDIT');
          }
          return;
        }
        setShowKhataHub(true);
        loadCustomers();
        showToast("👥 Khata Hub opened [F3]", 'info');
        return;
      }

      // 5. + / - : Increment or decrement quantity of most recently scanned item
      // Ensure we do NOT interfere if cashier or scanner is typing in an active input element
      const activeEl = document.activeElement;
      const isInputActive =
        activeEl &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName) ||
          activeEl.getAttribute('contenteditable') === 'true');

      if (!isInputActive) {
        if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
          e.preventDefault();
          adjustLastItemQty(1);
          return;
        }

        if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
          e.preventDefault();
          adjustLastItemQty(-1);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [
    viewMode,
    cart,
    activeCartId,
    lastScannedProductId,
    total,
    subtotal,
    vat,
    customer,
    apiBase,
    showKhataHub,
    showZReportModal,
    showCashOutModal,
    showPaymentModal,
    showRefundModal,
    showPosAddModal,
    showAddProductModal,
    showProductsModal,
    showCustomersModal,
    showF12SearchModal,
  ]);

  // Real-time synchronization to Dual-Screen Customer Presentation Display via BroadcastChannel & LocalStorage
  useEffect(() => {
    const isBenefitPay = showPaymentModal && paymentModalMethod === 'BENEFIT_PAY';
    const legacyPayload = {
      total,
      subtotal,
      vat,
      recentItems: cart.map((item) => ({
        id: item.id,
        name: item.name,
        sellingPrice: item.sellingPrice,
        price: item.sellingPrice,
        quantity: item.quantity ?? 1,
        qty: item.quantity ?? 1,
      })),
      isBenefitPay,
      customerName: customer ? customer.name : undefined,
      customer,
    };

    // Sunmi D2 Mini Dual Screen Broadcast format
    const dualScreenPayload = {
      type: isBenefitPay ? 'SHOW_QR' : 'STATE_UPDATE',
      payload: isBenefitPay ? {
        url: `BH-BENEFIT-FAWRI:TOTAL=${total.toFixed(3)}:MERCHANT=97300182`,
        total,
      } : {
        cart: cart.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.sellingPrice,
          sellingPrice: item.sellingPrice,
          qty: item.quantity ?? 1,
          quantity: item.quantity ?? 1,
        })),
        total,
        customer,
      }
    };

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

  // ⚡ Remote Commands from Manager Laptop (:5175)
  useEffect(() => {
    const handleRemoteDrawerKick = () => {
      console.log('⚡ [POS Terminal] Remote Drawer Kick triggered by Manager Laptop');
      openCashDrawer();
      showToast('⚡ Cash Drawer opened remotely by Store Manager', 'info');
    };

    const handleRemoteClearCart = () => {
      console.log('🗑️ [POS Terminal] Remote Clear Cart triggered by Manager Laptop');
      clearActiveCart();
      showToast('🗑️ Cart cleared remotely by Store Manager', 'info');
    };

    window.addEventListener('sunmi-remote-drawer-kick', handleRemoteDrawerKick);
    window.addEventListener('sunmi-remote-clear-cart', handleRemoteClearCart);

    return () => {
      window.removeEventListener('sunmi-remote-drawer-kick', handleRemoteDrawerKick);
      window.removeEventListener('sunmi-remote-clear-cart', handleRemoteClearCart);
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
                  if (emergencyPinInput === '9999') {
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
              <p className="text-xs text-red-400 mt-2 font-semibold">Invalid PIN. Store default is 9999.</p>
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
    <div className="flex flex-col h-screen w-screen bg-slate-100 overflow-hidden font-sans select-none text-slate-900">
      
      {/* Instant Non-blocking Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-xl shadow-2xl font-bold text-sm flex items-center gap-2 text-white animate-in slide-in-from-top-2 ${
            toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-slate-800'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* TOP FULL-WIDTH HEADER */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-3 md:px-4 shrink-0 z-20 shadow-xs">
        {/* Left: Brand & Status Tray */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <h1 
              onDoubleClick={() => setShowDevPanel((prev) => !prev)}
              className="font-black text-xl tracking-tight text-slate-800 cursor-pointer select-none whitespace-nowrap"
              title="Double-click to toggle Dev Tools (or Ctrl+Shift+D)"
            >
              Askar POS
            </h1>
            <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase tracking-wider">
              Scan-First
            </span>
          </div>

          <div className="h-5 w-px bg-slate-300 mx-1"></div>

          {/* System Status Tray */}
          <div className="flex items-center gap-2 text-slate-400">
            <span title={hardwareSupported ? "Wi-Fi & Hardware Online" : "Network Standalone"}>
              <Wifi size={16} className={hardwareSupported ? "text-emerald-500" : "text-slate-400"} />
            </span>
            <span title="Zero-Touch Scanner Hardware Ready (Listening globally)">
              <ScanLine size={16} className="text-emerald-500" />
            </span>
            <span title={syncInfo && syncInfo.pendingCount > 0 ? `${syncInfo.pendingCount} offline transactions queued` : "Local SQLite Database in Sync"}>
              <HardDrive size={16} className={syncInfo && syncInfo.pendingCount > 0 ? "text-amber-500" : "text-slate-400"} />
            </span>
            <button
              type="button"
              onClick={handleManualSync}
              className="p-1 hover:text-slate-600 transition-colors cursor-pointer"
              title="Push offline sales to Master PC"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* Right: Quick Actions & Navigation */}
        <div className="flex items-center gap-1.5">
          {/* MASSIVE F12 SEARCH TRIGGER BUTTON */}
          <button
            type="button"
            onClick={() => {
              setShowF12SearchModal(true);
              setF12SearchQuery('');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-xs border border-blue-200 transition-all cursor-pointer whitespace-nowrap shadow-xs"
            title="Manual item search overlay [F12]"
          >
            <Search size={14} className="text-blue-600" />
            <span>Search Catalog</span>
            <kbd className="bg-blue-200/80 px-1.5 py-0.2 rounded text-[10px] font-mono text-blue-900">F12</kbd>
          </button>

          <button 
            type="button"
            onClick={() => {
              setShowOrderHistoryDrawer(false);
              setShowReceivingDrawer(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-lg text-xs border border-emerald-200 transition-all cursor-pointer whitespace-nowrap shadow-xs"
            title="Open Delivery Receiving Drawer [Manager PIN 9999]"
          >
            <Truck size={14} className="text-emerald-600" />
            <span>Receiving</span>
          </button>

          <button 
            type="button"
            onClick={() => {
              setShowReceivingDrawer(false);
              setShowOrderHistoryDrawer(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold rounded-lg text-xs border border-blue-200 transition-all cursor-pointer whitespace-nowrap shadow-xs"
            title="Today's Receipts & Void Bill [Manager PIN 9999]"
          >
            <Receipt size={14} className="text-blue-600" />
            <span>Receipts</span>
          </button>

          <button 
            type="button"
            onClick={() => {
              setShowKhataHub(true);
              loadCustomers();
            }}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap"
            title="Khata Hub [F3]"
          >
            Khata (F3)
          </button>
          <button 
            type="button"
            onClick={() => {
              setIsReturnMode((prev) => !prev);
              setShowRefundModal(true);
            }}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap"
          >
            Refund
          </button>
          <button 
            type="button"
            onClick={async () => {
              const ok = await kickCashDrawer();
              if (ok) {
                showToast('⚡ Cash Drawer kicked successfully', 'success');
              } else {
                showToast('⚠️ Cash Drawer kick failed', 'error');
              }
            }}
            className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap shadow-xs"
            title="Manual Cash Drawer Kick [No Sale]"
          >
            Drawer
          </button>
          <button 
            type="button"
            onClick={() => setShowCashOutModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap shadow-xs"
            title="Record Cash Out: Business Operating Expenses & Owner Personal Withdrawals"
          >
            <Banknote size={14} className="text-rose-600" />
            <span>Cash Out</span>
          </button>
          <button 
            type="button"
            onClick={() => setShowBlindCloseModal(true)}
            className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap shadow-xs"
            title="Perform Blind End-of-Shift Cash Reconciliation"
          >
            🔒 Close Shift
          </button>

          {/* Dev Tools Quick Icon */}
          <button
            type="button"
            onClick={() => setShowDevPanel((prev) => !prev)}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer text-xs"
            title="Diagnostics & Simulators [Ctrl+Shift+D]"
          >
            ⚙️
          </button>

          {/* OFFLINE SALES QUEUE DRAIN BADGE */}
          {offlinePendingCount > 0 && (
            <button
              type="button"
              onClick={() => drainOfflineQueue()}
              disabled={isDrainingOfflineSales}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-full font-bold text-xs transition-all shadow-xs cursor-pointer animate-pulse select-none"
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
          />

          {onLockTerminal && (
            <button 
              type="button"
              onClick={onLockTerminal}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-lg font-bold text-xs transition-all shadow-xs cursor-pointer whitespace-nowrap ml-1"
              title="Lock terminal for shift change"
            >
              <LogOut size={13} /> Lock Register
            </button>
          )}
        </div>
      </header>

      {/* 24-HOUR OFFLINE WARNING BANNER */}
      {syncStatus === 'OFFLINE_WARNING' && (
        <div className="bg-amber-400 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between border-b border-amber-500 shadow-sm shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-base animate-bounce">⚠️</span>
            <span>
              DISASTER PROTOCOL WARNING: Terminal offline for {offlineHours || 24}+ hours. Sales are safely saved on motherboard local.db, but please check your Wi-Fi router so customer Khata balances can sync!
            </span>
          </div>
          <button
            type="button"
            onClick={() => exportDatabaseBackup()}
            className="px-3 py-1 bg-slate-900 text-white rounded-md text-[11px] font-bold hover:bg-slate-800 transition"
          >
            Backup to SD Card / USB
          </button>
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
                setShowAddProductForm(true);
                setNewProdBarcode(unassignedBarcode);
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
                      className={`h-5 px-1.5 rounded text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-0.5 ${
                        c.id === activeCartId 
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

            <div className="flex items-center gap-1 shrink-0">
              {customer && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomer(null);
                    clearScan();
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer border ${
                    customer.hasMessGroup && customer.isDual
                      ? 'bg-indigo-100 hover:bg-red-100 hover:text-red-700 text-indigo-900 border-indigo-300'
                      : customer.isMess
                      ? 'bg-emerald-100 hover:bg-red-100 hover:text-red-700 text-emerald-900 border-emerald-300'
                      : 'bg-slate-200 hover:bg-red-100 hover:text-red-700 text-slate-700 border-slate-300'
                  }`}
                  title={
                    customer.hasMessGroup && customer.isDual
                      ? `Dual Wallet: ${customer.name} (Personal: BD ${(customer.personalBalance ?? customer.currentBalance).toFixed(3)}) + 👥 ${customer.group_name} (${customer.members?.length || 0} members). Click to unlink.`
                      : `Linked: ${customer.group_name || customer.name} ${customer.isMess ? `(${customer.members?.length || 0} members)` : ''}. Click to unlink.`
                  }
                >
                  {customer.hasMessGroup && customer.isDual
                    ? `💳 ${customer.name.slice(0, 8)} | 👥 ${(customer.group_name || 'Mess').slice(0, 10)} ✕`
                    : customer.isMess 
                    ? `👥 ${(customer.group_name || customer.name).slice(0, 14)} ✕` 
                    : `👤 ${customer.name.slice(0, 8)} ✕`}
                </button>
              )}
              <button 
                type="button"
                onClick={clearActiveCart}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                title="Void / Clear Cart"
              >
                <UserX size={16} />
              </button>
            </div>
          </div>

          {/* Active Cart Line Items List (Sunmi Touch UX: Safe zone padding, 60px targets, right-aligned) */}
          <div className="flex-1 overflow-y-auto scrollbar-hide bg-white p-2.5 divide-y divide-slate-100 min-h-0 scroll-zone pr-[18px]">
            {cart.length === 0 ? (
              <div className="text-slate-400 text-center py-10 flex flex-col items-center justify-center">
                <ShoppingCart size={36} className="mb-2 opacity-25" />
                <p className="font-bold text-slate-600 text-sm">Receipt is empty</p>
                <p className="text-xs text-slate-400 mt-0.5">Ready to scan • Pull scanner trigger or tap Quick Items</p>
              </div>
            ) : (
              cart.map((item, index) => {
                const qty = item.quantity ?? 1;
                const isNegative = qty < 0;
                return (
                  <div 
                    key={index} 
                    className="flex justify-between items-center py-2.5 px-1 hover:bg-slate-50/90 rounded-xl transition-colors border-b border-slate-100/70 gap-2 min-h-[72px]"
                  >
                    {/* Far Left: Product Name, Barcode Pill, Unit Base Price, Discount Tag */}
                    <div className="min-w-0 flex-1 pr-1">
                      <p className="font-bold text-slate-800 text-sm truncate leading-tight">
                        {item.name} {(item.vatRate === 10 || (item.vatRate === undefined && item.taxRate !== 0)) ? '*' : ''}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {item.barcode && (
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-600 font-mono font-semibold">
                            {item.barcode}
                          </span>
                        )}
                        <p className="text-gray-400 text-xs font-mono">
                          {item.is_weighed_item 
                            ? `${(item.quantity ?? 1).toFixed(3)} kg @ BHD ${(item.price ?? item.sellingPrice ?? 0).toFixed(3)}/kg` 
                            : `Qty: ${item.quantity}`}
                        </p>
                        {item.discountNote && (
                          <span className="inline-flex items-center gap-0.5 bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            <Tag size={10} /> {item.discountNote}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Far Right Control Cluster: Tap-to-Edit Price + 60px Steppers */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* 5. Tap-to-Edit Price/Discount Touch Target */}
                      <button
                        type="button"
                        onClick={() => {
                          setPriceOverrideItem({ index, product: item });
                          setDiscountTab('discount');
                          setCustomDiscountPercent('');
                          setOverridePriceInput(item.sellingPrice.toFixed(3));
                          setManagerPinInput('');
                          setOverrideError(null);
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-amber-50 active:scale-95 transition-all border border-slate-200 hover:border-amber-400 text-right cursor-pointer flex flex-col justify-center items-end min-h-[60px]"
                        title="Tap to apply discount or price override"
                      >
                        <span className={`font-black font-mono text-sm tabular-nums leading-tight ${isNegative ? 'text-red-600' : 'text-slate-900'}`}>
                          BD {(item.sellingPrice * qty).toFixed(3)}
                        </span>
                        <span className="text-[10px] text-amber-700 font-semibold tracking-tight mt-0.5 flex items-center gap-0.5">
                          <Tag size={9} /> tap to edit
                        </span>
                      </button>

                      {/* Stepper Cluster: 60px Buttons & Quantity Readout */}
                      <div className="flex items-center gap-1">
                        {/* 1 & 3. Decrement / Trash Button: 60x60 with Dynamic Color Cue */}
                        <button
                          type="button"
                          onClick={() => adjustItemQtyByIndex(index, -1)}
                          className={`min-h-[60px] min-w-[60px] w-[60px] h-[60px] rounded-xl flex items-center justify-center active:scale-95 transition-all cursor-pointer font-black shadow-xs ${
                            (item.is_weighed_item ? qty <= 0.25 : qty === 1)
                              ? 'bg-rose-600 hover:bg-rose-700 text-white border-2 border-rose-700'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-900 border-2 border-slate-300'
                          }`}
                          title={(item.is_weighed_item ? qty <= 0.25 : qty === 1) ? `Remove "${item.name}" from cart` : `Decrease quantity`}
                        >
                          {(item.is_weighed_item ? qty <= 0.25 : qty === 1) ? (
                            <Trash2 size={24} className="stroke-[2.5]" />
                          ) : (
                            <Minus size={26} className="stroke-[3]" />
                          )}
                        </button>

                        {/* Quantity Readout */}
                        <div 
                          onClick={() => {
                            if (item.is_weighed_item) {
                              setSelectedWeighedItem(item);
                              setIsWeightModalOpen(true);
                            }
                          }}
                          className={`min-w-[42px] h-[60px] flex flex-col items-center justify-center bg-slate-50 border border-slate-200 rounded-xl px-1 ${
                            item.is_weighed_item ? 'cursor-pointer hover:bg-emerald-50 hover:border-emerald-300' : ''
                          }`}
                          title={item.is_weighed_item ? 'Tap to edit weight' : 'Quantity'}
                        >
                          <span className={`text-[8px] font-bold uppercase tracking-wider leading-none ${item.is_weighed_item ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {item.is_weighed_item ? 'KG' : 'QTY'}
                          </span>
                          <span className={`font-mono font-black text-slate-900 leading-tight ${item.is_weighed_item ? 'text-xs' : 'text-lg'}`}>
                            {item.is_weighed_item ? qty.toFixed(3) : qty}
                          </span>
                        </div>

                        {/* 1. Increment Button: 60x60 Rule */}
                        <button
                          type="button"
                          onClick={() => adjustItemQtyByIndex(index, 1)}
                          className="min-h-[60px] min-w-[60px] w-[60px] h-[60px] rounded-xl flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-900 border-2 border-slate-300 font-black active:scale-95 transition-all cursor-pointer shadow-xs"
                          title={`Increase quantity`}
                        >
                          <Plus size={26} className="stroke-[3]" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Totals & Numpad */}
          <div className="shrink-0 bg-slate-50 border-t border-slate-200">
            {/* Numpad */}
            <div className="p-2 grid grid-cols-4 gap-1.5 border-b border-slate-200 bg-slate-100">
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
                  className={`h-9 rounded-md shadow-xs font-bold text-sm active:scale-95 transition-all flex items-center justify-center cursor-pointer ${
                    btn.style || 'bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Financial Breakdown */}
            <div className="p-2.5 space-y-0.5">
              <div className="flex justify-between text-slate-500 text-xs font-bold">
                <span>Subtotal</span>
                <span className="font-mono">BD {subtotal.toFixed(3)}</span>
              </div>
              <div className="flex justify-between text-slate-500 text-xs font-bold">
                <span>VAT (10%)</span>
                <span className="font-mono">BD {vat.toFixed(3)}</span>
              </div>
              <div className="flex justify-between items-end pt-0.5">
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-0.5">Total Due</span>
                <span className="text-2xl font-black text-slate-900 tracking-tighter font-mono">BD {total.toFixed(3)}</span>
              </div>
            </div>

            {/* Primary Payment Actions */}
            <div className="p-2.5 pt-0 grid grid-cols-3 gap-2">
              <button 
                type="button"
                onClick={() => handlePayment(total)}
                disabled={cart.length === 0}
                className="h-14 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black text-base flex flex-col items-center justify-center active:scale-95 transition-all shadow-md disabled:opacity-50 cursor-pointer"
              >
                <span className="text-[10px] opacity-80 mb-0.5 font-normal">[F1] Instant</span>
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
                {customer.hasMessGroup && customer.isDual ? (
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
                    className={`w-full py-2.5 rounded-xl font-bold text-xs active:scale-95 transition-transform flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50 text-white ${
                      customer.isMess 
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
          </div>
        </div>

        {/* SECTION 2: THE QUICK PRODUCTS GRID (RIGHT SIDE) */}
        <div className="flex-1 bg-slate-50 flex flex-col h-full overflow-hidden">
          {/* Quick Header & Category Selector */}
          <div className="h-12 border-b border-slate-200 bg-white flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-2">
              {/* Tab Switcher: Quick Items vs Instant POS Grid */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveGridTab('quick')}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    activeGridTab === 'quick'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  ⚡ Quick Items
                </button>
                <button
                  type="button"
                  onClick={() => setActiveGridTab('full')}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                    activeGridTab === 'full'
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  📦 POS Grid (0ms Turso)
                </button>
              </div>

              {activeGridTab === 'quick' && (
                <div className="hidden md:flex items-center gap-1 ml-2 overflow-x-auto max-w-[460px] scrollbar-hide py-0.5">
                  {quickCategories.map((cat) => {
                    const count = cat.id === 'ALL'
                      ? activeQuickProducts.length
                      : activeQuickProducts.filter((p) => (p.category || 'ESSENTIALS').toUpperCase() === cat.id.toUpperCase()).length;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedQuickCategory(cat.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                          selectedQuickCategory === cat.id
                            ? 'bg-slate-800 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <span>{cat.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                          selectedQuickCategory === cat.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {activeGridTab === 'quick' && isEditMode && (
                <button
                  type="button"
                  onClick={() => setShowEditTabsModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all cursor-pointer active:scale-95"
                  title="Rename tabs, reorder, change colors, or add custom category tabs"
                >
                  <span>✏️ Edit Tabs</span>
                </button>
              )}

              {activeGridTab === 'quick' && (
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
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isEditMode
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

              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Zero-Touch Scanner Ready
              </span>
            </div>
          </div>

          {/* Full Instant POS Grid View (Step 1 Read from local.db) */}
          {activeGridTab === 'full' ? (
            <div className="flex-1 overflow-hidden">
              <POSGrid onSelectItem={handleItemSelection} categories={quickCategories} />
            </div>
          ) : (
            <div className={`flex-1 overflow-y-auto p-3.5 scroll-zone transition-colors ${
              isEditMode ? 'bg-amber-50/20' : ''
            }`}>
            {/* Edit Mode Alert Banner */}
            {isEditMode && (
              <div className="bg-amber-100 border border-amber-300 rounded-2xl px-3.5 py-2.5 mb-3 flex items-center justify-between text-amber-950 text-xs shadow-xs animate-in fade-in">
                <div className="flex items-center gap-2 font-bold">
                  <span className="text-base">🛠️</span>
                  <span>Edit Mode Active: Tap any card below to Swap, Recolor, or Remove. Tap "+" to add an item.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditMode(false);
                    showToast('🔒 Quick Grid LOCKED: Fast checkout active', 'success');
                  }}
                  className="px-3.5 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl font-bold text-xs shadow-xs cursor-pointer active:scale-95"
                >
                  Done Editing
                </button>
              </div>
            )}

            <div className="grid grid-cols-3 xl:grid-cols-4 gap-2.5">
              {displayedQuickProducts.map((prod) => {
                const theme = getCategoryTheme(prod.category);
                const catalogItem = catalog.find(
                  (p) => p.id === prod.id || (p.barcode && prod.barcode && p.barcode === prod.barcode)
                );
                const currentStock = catalogItem?.stockQuantity !== undefined 
                  ? Number(catalogItem.stockQuantity) 
                  : (prod.stockQuantity !== undefined ? Number(prod.stockQuantity) : null);
                const isOutOfStock = currentStock !== null && currentStock <= 0;
                const isLowStock = currentStock !== null && currentStock > 0 && currentStock <= (prod.minThreshold ?? 5);

                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => handleQuickItemClick(prod)}
                    className={`min-h-[85px] p-3 rounded-2xl flex flex-col justify-between border cursor-pointer active:scale-95 transition-all shadow-xs text-left relative ${
                      isEditMode
                        ? 'border-2 border-dashed border-amber-500 ring-2 ring-amber-300/60 bg-amber-50/80 hover:bg-amber-100 text-amber-950 shadow-md'
                        : isOutOfStock
                        ? 'bg-slate-100 border-slate-200 text-slate-400 opacity-60'
                        : theme.card
                    }`}
                  >
                    {isEditMode && (
                      <span className="absolute -top-2 -right-1.5 px-2 py-0.5 bg-amber-600 text-white text-[9px] rounded-full font-black uppercase shadow-xs tracking-wider border border-white">
                        ✏️ EDIT
                      </span>
                    )}
                    <div className="flex items-center justify-between gap-1 w-full">
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md uppercase tracking-wider ${theme.badge}`}>
                        {theme.label}
                      </span>
                      {isOutOfStock ? (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-600 text-white tracking-wider">
                          OUT OF STOCK
                        </span>
                      ) : isLowStock ? (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500 text-white tracking-wider">
                          {currentStock} LEFT
                        </span>
                      ) : prod.vatRate === 0 ? (
                        <span className="text-[9px] font-mono font-semibold opacity-75 text-emerald-800">
                          0% VAT
                        </span>
                      ) : null}
                    </div>
                    <div className="my-1">
                      <h4 className={`font-bold text-xs sm:text-sm leading-tight line-clamp-2 ${isOutOfStock && !isEditMode ? 'line-through text-slate-400' : ''}`}>
                        {prod.name}
                      </h4>
                    </div>
                    <div className="flex items-center justify-between w-full pt-1 border-t border-black/5">
                      <span className="font-black text-xs sm:text-sm font-mono tabular-nums">
                        BD {Number(prod.sellingPrice).toFixed(3)}
                      </span>
                      <span className={`text-[10px] font-bold ${
                        isEditMode 
                          ? 'text-amber-800 underline' 
                          : isOutOfStock 
                          ? 'text-red-600 font-extrabold' 
                          : isLowStock 
                          ? 'text-amber-700 font-bold' 
                          : 'opacity-60'
                      }`}>
                        {isEditMode ? 'Customize ⚙️' : isOutOfStock ? '0 in Stock' : currentStock !== null ? `${currentStock} in stock` : '+ Tap'}
                      </span>
                    </div>
                  </button>
                );
              })}

              {/* Add Quick Product Slot in Edit Mode */}
              {isEditMode && (
                <button
                  type="button"
                  onClick={() => setShowAddQuickModal(true)}
                  className="min-h-[85px] p-3 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-blue-400 bg-blue-50/60 hover:bg-blue-100/80 text-blue-700 cursor-pointer active:scale-95 transition-all shadow-xs"
                >
                  <Plus size={22} className="stroke-[3] mb-0.5" />
                  <span className="text-xs font-bold">Add Item to Grid</span>
                </button>
              )}
            </div>

            {displayedQuickProducts.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <p className="font-bold text-sm">No items in this category</p>
                <button
                  type="button"
                  onClick={() => setSelectedQuickCategory('ALL')}
                  className="mt-2 text-xs font-bold text-blue-600 underline cursor-pointer"
                >
                  View All Quick Items
                </button>
              </div>
            )}
          </div>
          )}

          {/* Quick Shortcuts Bar */}
          <div className="px-4 py-2 border-t border-slate-200 bg-white/80 flex items-center justify-between text-[11px] text-slate-500 font-medium shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowF12SearchModal(true);
                  setF12SearchQuery('');
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
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[9999] flex flex-col items-center justify-start p-4 md:p-8 animate-in fade-in duration-150"
          onClick={() => setShowF12SearchModal(false)}
        >
          <div 
            className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[88vh] border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Header */}
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
              <Search size={28} className="text-slate-400 shrink-0 ml-2" />
              <input
                ref={f12InputRef}
                autoFocus
                type="text"
                placeholder="Search full inventory by name, barcode, or PLU... [Enter to add first]"
                value={f12SearchQuery}
                onChange={(e) => setF12SearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowF12SearchModal(false);
                  } else if (e.key === 'Enter') {
                    const matches = f12FilteredCatalog;
                    if (matches.length > 0) {
                      setShowF12SearchModal(false);
                      handleItemSelection(matches[0]);
                    }
                  }
                }}
                className="w-full text-2xl font-bold py-2 bg-transparent outline-none text-slate-800 placeholder-slate-400"
              />
              <div className="flex items-center gap-2 shrink-0">
                <kbd className="px-2 py-1 bg-slate-200 text-slate-600 rounded text-xs font-mono font-bold">Esc</kbd>
                <button
                  type="button"
                  onClick={() => setShowF12SearchModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Search Results */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 scroll-zone">
              {f12FilteredCatalog.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <Search size={48} className="mx-auto mb-3 opacity-20" />
                  <p className="text-lg font-bold text-slate-600">No products match "{f12SearchQuery}"</p>
                  <p className="text-xs text-slate-400 mt-1">Try another keyword or scan the physical barcode.</p>
                </div>
              ) : (
                f12FilteredCatalog.map((prod) => {
                  const stock = prod.stockQuantity !== undefined && prod.stockQuantity !== null ? Number(prod.stockQuantity) : 0;
                  const isOutOfStock = stock <= 0;
                  const isLowStock = stock > 0 && stock <= 5;

                  return (
                    <div
                      key={prod.id}
                      onClick={() => {
                        setShowF12SearchModal(false);
                        handleItemSelection(prod);
                      }}
                      className={`p-4 hover:bg-blue-50/70 transition-colors cursor-pointer flex justify-between items-center group ${
                        isOutOfStock ? 'opacity-60 bg-slate-50' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2">
                          <h3 className={`font-bold text-lg text-slate-900 group-hover:text-blue-700 transition-colors ${isOutOfStock ? 'line-through text-slate-400' : ''}`}>
                            {prod.name}
                          </h3>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                            {prod.barcode || 'NO BARCODE'}
                          </span>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            {prod.vatRate === 0 ? '0% VAT (Basic)' : '10% VAT'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-slate-500">
                            Stock: <span className={`font-semibold ${isOutOfStock ? 'text-red-600 font-bold' : isLowStock ? 'text-amber-600 font-bold' : 'text-slate-700'}`}>{stock}</span> in store
                          </p>
                          {isOutOfStock && (
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-red-600 text-white tracking-wider">
                              OUT OF STOCK
                            </span>
                          )}
                          {isLowStock && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-white tracking-wider">
                              LOW STOCK
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-2xl font-black font-mono text-slate-900 group-hover:text-blue-700 transition-colors">
                          BD {prod.sellingPrice.toFixed(3)}
                        </div>
                        <span className={`inline-block mt-1 text-xs font-bold ${isOutOfStock ? 'text-red-500' : 'text-blue-600 group-hover:underline'}`}>
                          {isOutOfStock ? 'Out of Stock ✕' : 'Tap to add ↵'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* QUICK PRODUCT EDIT MODAL */}
      <QuickProductEditModal
        isOpen={Boolean(editingQuickProduct)}
        onClose={() => setEditingQuickProduct(null)}
        product={editingQuickProduct}
        catalog={catalog}
        apiBase={apiBase}
        onProductUpdated={() => {
          fetchQuickProducts();
          fetchCatalog();
        }}
        showToast={showToast}
        categories={quickCategories}
      />

      {/* ADD QUICK PRODUCT MODAL */}
      <AddQuickProductModal
        isOpen={showAddQuickModal}
        onClose={() => setShowAddQuickModal(false)}
        catalog={catalog}
        currentQuickIds={new Set(quickProducts.map((p) => p.id))}
        apiBase={apiBase}
        onProductAdded={() => {
          fetchQuickProducts();
          fetchCatalog();
        }}
        showToast={showToast}
        categories={quickCategories}
      />

      {/* EDIT QUICK TABS MODAL */}
      <EditQuickTabsModal
        isOpen={showEditTabsModal}
        onClose={() => setShowEditTabsModal(false)}
        categories={quickCategories}
        onSaveCategories={handleSaveCategories}
        showToast={showToast}
      />

      {/* DEVELOPER & HARDWARE DIAGNOSTICS MODAL (Hidden behind double-tap Askar POS or Ctrl+Shift+D) */}
      {showDevPanel && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛠️</span>
                <h3 className="font-black text-lg text-slate-800">Hardware & Diagnostic Wiring</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDevPanel(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-4 text-sm max-h-[70vh] overflow-y-auto">
              {/* Master Server IP */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-800">Master Server IP</p>
                  <p className="text-xs text-slate-500 font-mono">{apiBase}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowDevPanel(false);
                    setShowServerConfigModal(true);
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold"
                >
                  Configure IP
                </button>
              </div>

              {/* NFC Simulator */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <p className="font-bold text-slate-800 mb-1">NFC Status & Simulator</p>
                <p className="text-xs text-slate-500 mb-2">
                  Status: <span className="font-bold">{hardwareSupported ? '🟢 Antenna Active' : '🔴 Unavailable'}</span> {isScanning && <span className="text-emerald-600 font-bold">(Scanning)</span>} | Screen 2: <span className="font-bold">{customerScreenReady ? '🟢 Connected' : '⚪ Standalone'}</span> | Last UID: <span className="font-mono">{lastDetectedUid || 'None'}</span>
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => simulateScan('CARD123')}
                    className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded font-bold text-xs"
                  >
                    ⚡ Tap Ali (CARD123)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const b1 = Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
                      const b2 = Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
                      const b3 = Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
                      simulateScan(`08:${b1}:${b2}:${b3}`.toUpperCase());
                    }}
                    className="px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded font-bold text-xs"
                  >
                    📱 Tap iPhone (Random UID)
                  </button>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <input
                      type="text"
                      placeholder="Custom UID..."
                      value={manualUidInput}
                      onChange={(e) => setManualUidInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && manualUidInput.trim()) {
                          simulateScan(manualUidInput.trim());
                          setManualUidInput('');
                        }
                      }}
                      className="px-2 py-1 bg-white border border-slate-300 rounded text-xs w-28 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (manualUidInput.trim()) {
                          simulateScan(manualUidInput.trim());
                          setManualUidInput('');
                        }
                      }}
                      className="px-2 py-1 bg-slate-800 text-white rounded text-xs font-bold"
                    >
                      Simulate
                    </button>
                  </div>
                </div>
              </div>

              {/* Barcode Testing */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <p className="font-bold text-slate-800 mb-1">Test Barcodes (Scanner Bypass)</p>
                <p className="text-xs text-slate-500 mb-2">
                  Last Scanned: <span className="font-mono font-bold text-emerald-700">{lastScannedBarcode || 'None'}</span>
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleBarcodeScan('1')}
                    className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded text-xs font-bold"
                  >
                    Scan '1' (Perfume)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBarcodeScan('2')}
                    className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded text-xs font-bold"
                  >
                    Scan '2' (Watch)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBarcodeScan('2200102048003')}
                    className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded text-xs font-bold"
                  >
                    🥩 Scale Beef 1.5kg (BD 4.800)
                  </button>
                </div>
              </div>

              {/* Active Shift Float & Cash Out */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-800">Drawer Cash Float</p>
                  <p className="text-xs text-slate-500">
                    BD {Number(localStorage.getItem('active_shift_opening_cash') || 0).toFixed(3)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowDevPanel(false);
                    setShowCashOutModal(true);
                  }}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold"
                >
                  Record Cash Out
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
              <span>Shortcut: Double-click Askar POS or press Ctrl+Shift+D</span>
              <button
                type="button"
                onClick={() => setShowDevPanel(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold"
              >
                Close Diagnostic Panel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOMER ENROLLMENT & KHATA MODAL */}
      {showCustomersModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.65)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              width: '600px',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
                Customer Enrollment & Khata Cards
              </h3>
              <button
                onClick={() => {
                  setShowCustomersModal(false);
                  setBindingCustomerId(null);
                }}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
              {/* Add New Customer Form */}
              <div style={{ marginBottom: '20px' }}>
                {newCustCardUid ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>💳</span>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#065f46' }}>NFC Card Attached (Ready to Link)</div>
                        <div style={{ fontSize: '13px', fontFamily: 'monospace', fontWeight: 'bold', color: '#047857' }}>{newCustCardUid}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewCustCardUid('')}
                      style={{ fontSize: '11px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Clear Card
                    </button>
                  </div>
                ) : (
                  <div style={{ backgroundColor: '#eff6ff', border: '1px dashed #93c5fd', borderRadius: '8px', padding: '6px 12px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#1e40af' }}>
                    <span>📶</span>
                    <span><strong>NFC Ready:</strong> Tap card on terminal to auto-attach to this new customer</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="New customer name..."
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                  />
                  <button
                    onClick={handleCreateCustomer}
                    style={{ backgroundColor: '#2563eb', color: '#ffffff', padding: '10px 18px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Add Customer
                  </button>
                </div>
              </div>

              {/* Binding in Progress Banner */}
              {bindingCustomerId && (
                <div style={{ padding: '12px 16px', backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', marginBottom: '16px', color: '#92400e' }}>
                  ⏳ <strong>Tap customer card or phone now</strong> on the SUNMI reader to link it!
                  <button
                    onClick={() => setBindingCustomerId(null)}
                    style={{ marginLeft: '12px', textDecoration: 'underline', background: 'none', border: 'none', color: '#92400e', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Customer List Table */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                {customersList.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      padding: '14px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: '1px solid #f3f4f6',
                      backgroundColor: bindingCustomerId === c.id ? '#fefce8' : '#ffffff'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '16px' }}>{c.name}</div>
                      <div style={{ fontSize: '13px', color: '#6b7280' }}>
                        Card UID: <strong style={{ color: c.cardUid ? '#1d4ed8' : '#9ca3af' }}>{c.cardUid || 'None'}</strong>
                      </div>
                      <div style={{ fontSize: '13px', color: '#059669', fontWeight: 'bold' }}>
                        Khata Balance: BD {c.currentBalance.toFixed(3)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => {
                          setCustomer(c);
                          setShowCustomersModal(false);
                        }}
                        style={{
                          backgroundColor: '#f3f4f6',
                          color: '#374151',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid #d1d5db',
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        Select
                      </button>

                      {lastDetectedUid && (
                        <button
                          onClick={() => handleBindCard(c.id, lastDetectedUid)}
                          style={{
                            backgroundColor: '#059669',
                            color: '#ffffff',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: 'none',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                          }}
                          title={`Bind ${lastDetectedUid} to ${c.name}`}
                        >
                          Bind Last Read ({lastDetectedUid})
                        </button>
                      )}

                      <button
                        onClick={() => setBindingCustomerId(c.id)}
                        style={{
                          backgroundColor: bindingCustomerId === c.id ? '#d97706' : '#1f2937',
                          color: '#ffffff',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          fontSize: '13px',
                          fontWeight: 'bold',
                          cursor: 'pointer'
                        }}
                      >
                        {bindingCustomerId === c.id ? 'Waiting for Tap...' : 'Bind Card'}
                      </button>

                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRODUCTS & BARCODES ASSIGNMENT MODAL */}
      {showProductsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.65)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              width: '720px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
                  📦 Products & Barcode Assignment
                </h3>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>
                  Manage item barcodes for rapid hardware scanner checkout
                </span>
              </div>
              <button
                onClick={() => {
                  setShowProductsModal(false);
                  setBindingProductId(null);
                  setShowAddProductForm(false);
                }}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
              {/* Action Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <input
                  type="text"
                  placeholder="🔍 Search by product name or barcode..."
                  value={productSearchQuery}
                  onChange={(e) => setProductSearchQuery(e.target.value)}
                  style={{ flex: 1, padding: '9px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                />
                <button
                  onClick={() => setShowPosAddModal(true)}
                  style={{
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    padding: '9px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  ➕ Quick Add Item
                </button>
                <button
                  onClick={fetchCatalog}
                  style={{
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    padding: '9px 14px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                  title="Reload catalog"
                >
                  🔄
                </button>
              </div>

              {/* Add New Product Form */}
              {showAddProductForm && (
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
                  <div style={{ fontWeight: 'bold', color: '#166534', marginBottom: '12px', fontSize: '15px' }}>
                    Register New Product
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <input
                      type="text"
                      placeholder="Product Name (e.g. Al-Marai Milk 1L)"
                      value={newProdName}
                      onChange={(e) => setNewProdName(e.target.value)}
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                    />
                    <input
                      type="number"
                      step="0.001"
                      placeholder="Selling Price (BD)"
                      value={newProdPrice}
                      onChange={(e) => setNewProdPrice(e.target.value)}
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                    />
                    <input
                      type="number"
                      step="0.001"
                      placeholder="Cost Price (BD)"
                      value={newProdPurchasePrice}
                      onChange={(e) => setNewProdPurchasePrice(e.target.value)}
                      style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Barcode (or leave blank to assign later)"
                      value={newProdBarcode}
                      onChange={(e) => setNewProdBarcode(e.target.value)}
                      style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                    />
                    {lastScannedBarcode && (
                      <button
                        onClick={() => setNewProdBarcode(lastScannedBarcode)}
                        style={{
                          backgroundColor: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1px solid #bfdbfe',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          cursor: 'pointer'
                        }}
                      >
                        Use Last Scanned ({lastScannedBarcode})
                      </button>
                    )}
                    <button
                      onClick={handleCreateProduct}
                      style={{
                        backgroundColor: '#16a34a',
                        color: '#ffffff',
                        border: 'none',
                        padding: '8px 18px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      Save Product
                    </button>
                  </div>
                </div>
              )}

              {/* Barcode Binding In-Progress Banner */}
              {bindingProductId && (() => {
                const target = catalog.find((p) => p.id === bindingProductId);
                return (
                  <div
                    style={{
                      padding: '12px 16px',
                      backgroundColor: '#fef3c7',
                      border: '1px solid #fde68a',
                      borderRadius: '8px',
                      marginBottom: '16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <strong style={{ color: '#92400e' }}>⏳ Ready to Assign:</strong>{' '}
                      <span style={{ color: '#78350f' }}>
                        Pull the SUNMI barcode scanner trigger on any item to link to <strong>{target?.name}</strong>!
                      </span>
                    </div>
                    <button
                      onClick={() => setBindingProductId(null)}
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #d97706',
                        color: '#92400e',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                );
              })()}

              {/* Product Catalog & Barcode Assignment Table */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                {catalog
                  .filter((p) => {
                    if (!productSearchQuery.trim()) return true;
                    const q = productSearchQuery.toLowerCase();
                    return (
                      p.name.toLowerCase().includes(q) ||
                      (p.barcode && p.barcode.toLowerCase().includes(q)) ||
                      p.id.toLowerCase().includes(q)
                    );
                  })
                  .map((p) => {
                    const isBinding = bindingProductId === p.id;
                    return (
                      <div
                        key={p.id}
                        style={{
                          padding: '12px 16px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          borderBottom: '1px solid #f3f4f6',
                          backgroundColor: isBinding ? '#fefce8' : '#ffffff'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: '600', fontSize: '15px' }}>{p.name}</span>
                            <span style={{ fontSize: '13px', color: '#2563eb', fontWeight: 'bold' }}>
                              BD {p.sellingPrice.toFixed(3)}
                            </span>
                          </div>
                          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>Barcode:</span>
                            {p.barcode ? (
                              <strong style={{ fontFamily: 'monospace', color: '#166534', backgroundColor: '#dcfce7', padding: '1px 6px', borderRadius: '4px' }}>
                                {p.barcode}
                              </strong>
                            ) : (
                              <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>(None assigned)</span>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          {/* If unassigned barcode or last scanned barcode available, quick bind */}
                          {(unassignedBarcode || (lastScannedBarcode && lastScannedBarcode !== p.barcode)) && (
                            <button
                              onClick={() => handleBindBarcode(p.id, unassignedBarcode || lastScannedBarcode!)}
                              style={{
                                backgroundColor: '#f0fdf4',
                                color: '#166534',
                                border: '1px solid #bbf7d0',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                              }}
                              title={`Assign ${unassignedBarcode || lastScannedBarcode}`}
                            >
                              Bind [{unassignedBarcode || lastScannedBarcode}]
                            </button>
                          )}

                          {/* Clear Barcode button if one exists */}
                          {p.barcode && (
                            <button
                              onClick={() => handleBindBarcode(p.id, '')}
                              style={{
                                backgroundColor: '#fee2e2',
                                color: '#991b1b',
                                border: '1px solid #fecaca',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                cursor: 'pointer'
                              }}
                              title="Remove Barcode"
                            >
                              Clear
                            </button>
                          )}

                          {/* Trigger Scanner Assignment */}
                          <button
                            onClick={() => {
                              if (isBinding) {
                                setBindingProductId(null);
                              } else {
                                setBindingProductId(p.id);
                              }
                            }}
                            style={{
                              backgroundColor: isBinding ? '#d97706' : '#1f2937',
                              color: '#ffffff',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: 'none',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              cursor: 'pointer'
                            }}
                          >
                            {isBinding ? '⏳ Waiting for Scan...' : '📷 Assign Barcode'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Master Back-Office Server IP Configuration Modal */}
      {showServerConfigModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>
                  ⚙️ Master Back-Office IP Setup
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                  Point this SUNMI terminal to the store's central laptop
                </p>
              </div>
              <button
                onClick={() => setShowServerConfigModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>
                Master Server IPv4 Address & Port:
              </label>
              <input
                type="text"
                value={customServerIp}
                onChange={(e) => setCustomServerIp(e.target.value)}
                placeholder="e.g. http://192.168.8.7:3000"
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  width: '100%'
                }}
              />
              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                Currently active: <strong>{apiBase}</strong>
              </p>
            </div>

            {/* Quick Preset Buttons */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: '#64748b', alignSelf: 'center' }}>Presets:</span>
              <button
                onClick={() => setCustomServerIp('http://192.168.8.7:3000')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Wi-Fi LAN (192.168.8.7:3000)
              </button>
              <button
                onClick={() => setCustomServerIp('http://localhost:3000')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Localhost (3000)
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
              <button
                onClick={() => setShowServerConfigModal(false)}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveMasterIp(customServerIp)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Connect & Save
              </button>
            </div>
          </div>
        </div>
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
          showToast={showToast}
        />
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
          onProductAdded={(newProduct, andAddToCart = true) => {
            const price = Number(newProduct.sellingPrice || newProduct.price || 0);
            const cost = Number(newProduct.unitCost || newProduct.purchasePrice || 0);
            const prodToAdd: Product = {
              id: newProduct.id,
              name: newProduct.name,
              sellingPrice: price,
              purchasePrice: cost,
              barcode: newProduct.barcode || newProduct.id,
              category: newProduct.category,
              is_weighed_item: Boolean(newProduct.is_weighed_item),
              vatRate: newProduct.vatRate
            };
            if (andAddToCart) {
              addToCart(prodToAdd);
            }
            setUnassignedBarcode(null);
            refreshCatalogNow();
            showToast(`✅ "${newProduct.name}" saved to catalog${andAddToCart ? ' and added to cart' : ''}!`, 'success');
          }}
        />
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
      <ReceivingDrawer
        isOpen={showReceivingDrawer}
        onClose={() => setShowReceivingDrawer(false)}
        apiBase={apiBase}
        onCatalogRefresh={fetchCatalog}
        registerScanListener={handleRegisterReceivingScanListener}
      />

      {/* PIN-LOCKED ORDER HISTORY & NBR VOID DRAWER */}
      <OrderHistoryDrawer
        isOpen={showOrderHistoryDrawer}
        onClose={() => setShowOrderHistoryDrawer(false)}
        apiBase={apiBase}
        onCatalogRefresh={fetchCatalog}
      />

      {/* HARD CREDIT LIMIT POS BLOCKING MODAL (Idea 2) */}
      {creditLimitBlockedInfo && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border-2 border-red-500 w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-red-600 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                  <ShieldAlert size={28} className="text-white animate-bounce" />
                </div>
                <div>
                  <h3 className="text-xl font-black tracking-tight leading-none text-white">
                    Credit Limit Exceeded
                  </h3>
                  <p className="text-xs text-red-100 font-medium mt-1">
                    POS Frozen: Customer tab exceeds authorized store credit limit
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreditLimitBlockedInfo(null)}
                className="w-10 h-10 rounded-xl bg-red-700 hover:bg-red-800 text-white flex items-center justify-center font-bold text-lg cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Customer & Debt Overview */}
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-black text-slate-800">
                    {creditLimitBlockedInfo.customer.name}
                  </h4>
                  {creditLimitBlockedInfo.customer.phone && (
                    <span className="text-xs font-mono text-slate-500">
                      📞 {creditLimitBlockedInfo.customer.phone}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5 mt-3">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Current Debt</span>
                    <span className="text-base font-black font-mono text-slate-700">
                      BD {creditLimitBlockedInfo.currentBalance.toFixed(3)}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">This Ring-Up</span>
                    <span className="text-base font-black font-mono text-amber-600">
                      + BD {creditLimitBlockedInfo.saleAmount.toFixed(3)}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Hard Limit</span>
                    <span className="text-base font-black font-mono text-slate-800">
                      BD {creditLimitBlockedInfo.creditLimit.toFixed(3)}
                    </span>
                  </div>
                  <div className="bg-red-50 p-2.5 rounded-xl border border-red-200">
                    <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider block">Projected Total</span>
                    <span className="text-base font-black font-mono text-red-700">
                      BD {creditLimitBlockedInfo.projectedBalance.toFixed(3)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 py-2 px-3 bg-red-100/70 border border-red-300 rounded-xl flex items-center justify-between text-xs text-red-900 font-bold">
                  <span>Exceeded Limit By:</span>
                  <span className="font-mono text-sm font-black text-red-700">
                    BD {creditLimitBlockedInfo.exceededBy.toFixed(3)}
                  </span>
                </div>
              </div>

              {/* Policy Callout */}
              <div className="text-xs text-slate-600 leading-relaxed bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                <span className="text-base">⚠️</span>
                <span>
                  <strong>Store Policy:</strong> Ask the customer to make a partial payment via BenefitPay/Cash to lower their balance before releasing groceries, or enter Manager PIN to override.
                </span>
              </div>

              {/* Manager PIN Input Form */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center justify-between">
                  <span>Enter Manager PIN to Override</span>
                  <span className="text-[10px] font-normal text-slate-400">Default PIN: 9999</span>
                </label>
                <div className="relative">
                  <input
                    type="password"
                    inputMode="numeric"
                    autoFocus
                    value={creditOverridePin}
                    onChange={(e) => {
                      setCreditOverridePin(e.target.value);
                      setCreditOverrideError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAuthorizeCreditOverride();
                      }
                    }}
                    placeholder="Enter 4-digit PIN..."
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-300 rounded-xl font-mono text-center text-xl tracking-widest outline-none focus:border-red-500 focus:bg-white transition-all"
                  />
                </div>
                {creditOverrideError && (
                  <p className="text-xs font-bold text-red-600 animate-shake">
                    ❌ {creditOverrideError}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleAuthorizeCreditOverride}
                  className="py-3.5 px-4 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black rounded-xl text-sm transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <KeyRound size={16} />
                  <span>Authorize Override</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreditLimitBlockedInfo(null);
                    setShowKhataHub(true);
                  }}
                  className="py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black rounded-xl text-sm transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>Collect Payment 💳</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setCreditLimitBlockedInfo(null)}
                className="w-full py-2.5 text-slate-500 hover:text-slate-800 text-xs font-bold hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel / Switch Payment Method
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. TAP-TO-EDIT PRICE & DISCOUNT OVERRIDE MODAL (SUNMI UX RULE 5) */}
      {priceOverrideItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 font-bold text-xs uppercase tracking-wider">Line Item Adjustment</span>
                  {priceOverrideItem.product.barcode && (
                    <span className="bg-slate-800 text-slate-300 text-[10px] font-mono px-2 py-0.5 rounded">
                      {priceOverrideItem.product.barcode}
                    </span>
                  )}
                </div>
                <h3 className="font-black text-lg text-white leading-tight mt-0.5">
                  {priceOverrideItem.product.name}
                </h3>
                <p className="text-xs text-slate-300 font-mono mt-0.5">
                  Current: BD {priceOverrideItem.product.sellingPrice.toFixed(3)} × {priceOverrideItem.product.quantity ?? 1} = BD {((priceOverrideItem.product.sellingPrice) * (priceOverrideItem.product.quantity ?? 1)).toFixed(3)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPriceOverrideItem(null)}
                className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center font-bold text-xl cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 p-2 bg-slate-100 border-b border-slate-200 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setDiscountTab('discount');
                  setOverrideError(null);
                }}
                className={`py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  discountTab === 'discount'
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                <Percent size={18} className="text-amber-600" />
                <span>Quick Discount (%)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDiscountTab('override');
                  setOverrideError(null);
                }}
                className={`py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  discountTab === 'override'
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                <KeyRound size={18} className="text-blue-600" />
                <span>Price Override (PIN 9999)</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4">
              {discountTab === 'discount' ? (
                <div>
                  <p className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">
                    Select Quick Preset Discount:
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[5, 10, 15, 20, 25, 50].map((pct) => {
                      const basePrice = priceOverrideItem.product.originalPrice ?? priceOverrideItem.product.sellingPrice;
                      const discountedUnit = Math.max(0, basePrice * (1 - pct / 100));
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => {
                            applyPriceOverride(priceOverrideItem.index, discountedUnit, `${pct}% OFF`);
                          }}
                          className="h-16 rounded-xl border-2 border-slate-200 hover:border-amber-400 bg-slate-50 hover:bg-amber-50/70 flex flex-col items-center justify-center active:scale-95 transition-all cursor-pointer"
                        >
                          <span className="font-black text-base text-slate-900">{pct}% OFF</span>
                          <span className="text-[11px] font-mono text-slate-600 mt-0.5">
                            BD {discountedUnit.toFixed(3)}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom % input */}
                  <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Custom Discount (%)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={customDiscountPercent}
                        onChange={(e) => setCustomDiscountPercent(e.target.value)}
                        placeholder="e.g. 30"
                        className="flex-1 h-12 px-3 rounded-xl border-2 border-slate-300 focus:border-amber-500 font-mono font-black text-lg text-slate-900 outline-hidden bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const pct = parseFloat(customDiscountPercent);
                          if (isNaN(pct) || pct <= 0 || pct >= 100) {
                            showToast("⚠️ Enter valid percentage between 1 and 99", "info");
                            return;
                          }
                          const basePrice = priceOverrideItem.product.originalPrice ?? priceOverrideItem.product.sellingPrice;
                          const discountedUnit = Math.max(0, basePrice * (1 - pct / 100));
                          applyPriceOverride(priceOverrideItem.index, discountedUnit, `${pct}% OFF`);
                        }}
                        className="h-12 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm cursor-pointer active:scale-95 transition-all shadow-xs"
                      >
                        Apply %
                      </button>
                    </div>
                  </div>

                  {/* Restore Original Price Option */}
                  {priceOverrideItem.product.originalPrice && priceOverrideItem.product.originalPrice !== priceOverrideItem.product.sellingPrice && (
                    <button
                      type="button"
                      onClick={() => {
                        applyPriceOverride(priceOverrideItem.index, priceOverrideItem.product.originalPrice!, undefined);
                      }}
                      className="w-full mt-3 py-2.5 rounded-xl border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>↺ Restore Original Price (BD {priceOverrideItem.product.originalPrice.toFixed(3)})</span>
                    </button>
                  )}
                </div>
              ) : (
                /* Manager Price Override Tab */
                <div className="space-y-3">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-900">
                    <KeyRound size={18} className="shrink-0 text-amber-700 mt-0.5" />
                    <div>
                      <p className="font-bold">Manager PIN Authorization Required</p>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        Overriding product base selling price requires Manager PIN (9999).
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                        New Unit Price (BHD)
                      </label>
                      <input
                        type="number"
                        step="0.005"
                        min="0"
                        value={overridePriceInput}
                        onChange={(e) => setOverridePriceInput(e.target.value)}
                        placeholder="0.000"
                        className="w-full h-12 px-3 rounded-xl border-2 border-slate-300 focus:border-blue-600 font-mono font-black text-lg text-slate-900 outline-hidden bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                        Manager PIN
                      </label>
                      <input
                        type="password"
                        maxLength={6}
                        value={managerPinInput}
                        onChange={(e) => {
                          setManagerPinInput(e.target.value);
                          setOverrideError(null);
                        }}
                        placeholder="••••"
                        className="w-full h-12 px-3 rounded-xl border-2 border-slate-300 focus:border-blue-600 font-mono font-black text-lg text-slate-900 outline-hidden bg-white tracking-widest"
                      />
                    </div>
                  </div>

                  {overrideError && (
                    <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 p-2 rounded-lg">
                      ⚠️ {overrideError}
                    </p>
                  )}

                  {/* Numpad for on-screen touch typing */}
                  <div className="grid grid-cols-4 gap-1.5 pt-1">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '.'].map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          if (key === 'C') {
                            if (managerPinInput.length > 0) {
                              setManagerPinInput('');
                            } else {
                              setOverridePriceInput('');
                            }
                          } else {
                            if (managerPinInput.length < 4) {
                              setManagerPinInput((prev) => prev + key);
                            } else {
                              setOverridePriceInput((prev) => prev + key);
                            }
                          }
                        }}
                        className="h-11 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-base active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                      >
                        {key}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setPriceOverrideItem(null)}
                      className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const pin = managerPinInput.trim();
                        if (pin !== '9999') {
                          setOverrideError('Invalid Manager PIN. Default is 9999.');
                          return;
                        }
                        const val = parseFloat(overridePriceInput);
                        if (isNaN(val) || val < 0) {
                          setOverrideError('Please enter a valid price in BHD (>= 0.000).');
                          return;
                        }
                        applyPriceOverride(priceOverrideItem.index, val, 'Override');
                      }}
                      className="flex-1 h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm cursor-pointer shadow-md active:scale-95 transition-all"
                    >
                      Authorize & Apply
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MASSIVE POS NUMPAD MODAL (SUNMI D2 MINI WEIGHED PRODUCE ENTRY) */}
      <WeightInputModal
        item={selectedWeighedItem}
        isOpen={isWeightModalOpen}
        onClose={() => {
          setIsWeightModalOpen(false);
          setSelectedWeighedItem(null);
        }}
        onAdd={(item, weight) => {
          addToCart(item as Product, weight);
          showToast(`⚖️ ${item.name}: ${weight.toFixed(3)} kg added to cart`, 'success');
        }}
      />

      {/* BENEFITPAY & POS PAYMENT MODAL */}
      {showPaymentModal && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          totalAmount={total}
          subtotal={subtotal}
          vat={vat}
          cart={cart}
          customer={customer}
          apiBase={apiBase}
          initialMethod={paymentModalMethod}
          onSuccess={(receiptData) => {
            clearActiveCart();
            showToast(`🧾 ${receiptData.paymentMethod === 'BENEFIT_PAY' ? 'BenefitPay' : receiptData.paymentMethod} Payment Confirmed!`, 'success');
          }}
        />
      )}

      {/* NBR-COMPLIANT SIMPLIFIED TAX INVOICE PRINT STRIP (58mm Thermal Receipt) */}
      <div className="hidden print:block print-receipt bg-white text-black p-4 w-[58mm] text-xs font-mono">
        <div className="text-center mb-4">
          <h2 className="font-black text-lg">ASKAR SUPERMARKET</h2>
          <p>Simplified Tax Invoice</p>
          <p className="font-bold">VAT No: 200012345678901</p>
          <p>Invoice: #{`INV-${Date.now()}`}</p>
          <p>{new Date().toLocaleString()}</p>
        </div>

        <table className="w-full text-left mb-2 border-b border-black pb-2">
          <thead>
            <tr className="border-b border-black">
              <th>Item</th>
              <th>Qty</th>
              <th>Amt</th>
            </tr>
          </thead>
          <tbody>
            {cart.map((item) => {
              const qty = item.quantity ?? 1;
              const rate = item.vatRate !== undefined ? Number(item.vatRate) : (item.taxRate === 0 ? 0 : 10);
              return (
                <tr key={item.id}>
                  <td>{item.name} {rate === 10 ? '*' : ''}</td>
                  <td>{item.is_weighed_item ? `${qty.toFixed(3)}kg` : qty}</td>
                  <td>{(item.sellingPrice * qty).toFixed(3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex justify-between font-bold">
          <span>Subtotal:</span>
          <span>BD {cartTotals.subtotalStr}</span>
        </div>
        <div className="flex justify-between font-bold">
          <span>VAT (10%):</span>
          <span>BD {cartTotals.totalVatStr}</span>
        </div>
        <div className="flex justify-between text-lg font-black mt-1 border-t border-black pt-1">
          <span>TOTAL:</span>
          <span>BD {cartTotals.finalTotalStr}</span>
        </div>
        
        <div className="text-center mt-4 text-[10px]">
          <p>* Item includes 10% VAT</p>
        </div>

        <div className="flex flex-col items-center justify-center mt-4 pt-3 border-t border-dashed border-black">
          <QRCodeSVG
            value={customer?.id ? `https://askar-khata-pwa.vercel.app/tab/${customer.id}` : `https://askar-khata-pwa.vercel.app`}
            size={110}
            level="M"
          />
          <p className="text-[9px] font-bold text-center mt-1">SCAN FOR LIVE STATEMENT & BENEFITPAY</p>
          <p className="text-[8px] text-center text-slate-600">Askar Supermarket Cloud Ledger</p>
        </div>
      </div>

    </div>
  );
}