import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search,
  ScanLine,
  Camera,
  Trash2,
  Plus,
  Minus,
  CreditCard,
  Banknote,
  Zap,
  Users,
  RefreshCw,
  Printer,
  X,
  Package,
  ShieldAlert,
  History,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useCartStore, calculateCartTotals } from '../store/cartStore';
import { useBarcodeWedge } from '../hooks/useBarcodeWedge';
import { useNfcReader } from '../hooks/useNfcReader';
import { generateNextInvoiceNumber } from '../utils/nbrInvoice';
import { printFullReceipt } from '../utils/printer';
import { saveSaleOffline, getOfflineSales, markOfflineSalesSynced, saveOfflineKhataSettlement, markOfflineKhataSettlementSynced } from '../utils/nativeDb';
import { lookupProductFast, fetchProductByBarcode, getCachedCatalog, reindexCatalog } from '../services/localDb';
import { playThankYouVoice, playNfcChime } from '../utils/sound';
import { getApiBaseUrl } from '../utils/apiConfig';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { generateBenefitPayPayload, getStoredBenefitPayConfig } from '../utils/benefitPay';
import QRCode from 'qrcode';

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  cpr?: string | null;
  balance?: number;
  currentBalance?: number;
  creditLimit?: number;
  credit_limit?: number;
  cardUid?: string | null;
  nfcCardId?: string | null;
  isMess?: boolean;
  group_name?: string;
  messGroup?: {
    id: string;
    group_name: string;
    members?: any[];
  };
  members?: any[];
}

interface MobileKhataScreenProps {
  onSwitchToPim?: () => void;
}

// Fast moving Bahrain staples for instant rush-hour 1-tap addition
const QUICK_STAPLES = [
  { id: 'quick_khubz', name: 'Khubz Flatbread (5 pcs)', price: 0.100, sellingPrice: 0.100, vatRate: 0 },
  { id: 'quick_milk_1l', name: 'Almarai Fresh Milk 1L', price: 0.550, sellingPrice: 0.550, vatRate: 0 },
  { id: 'quick_milk_2l', name: 'Almarai Fresh Milk 2L', price: 1.050, sellingPrice: 1.050, vatRate: 0 },
  { id: 'quick_egg_30', name: 'Fresh White Eggs 30s', price: 1.800, sellingPrice: 1.800, vatRate: 0 },
  { id: 'quick_water', name: 'Bottled Water 500ml', price: 0.100, sellingPrice: 0.100, vatRate: 0 },
  { id: 'quick_tea', name: 'Karak Chai Cup', price: 0.150, sellingPrice: 0.150, vatRate: 10 },
  { id: 'quick_cigs', name: 'Marlboro Gold Box', price: 1.200, sellingPrice: 1.200, vatRate: 10 }
];

// Bahrain Non-Barcode & Loose Items Catalog presets (0ms offline ready)
const DEFAULT_NON_BARCODE_PRODUCTS = [
  // Produce / Fresh Veg & Fruits (0% VAT in Bahrain)
  { id: 'nb_tomatoes', name: 'Loose Red Tomatoes (1 kg)', nameAr: 'طماطم بالكيلو', price: 0.350, sellingPrice: 0.350, vatRate: 0, category: 'PRODUCE', isNonBarcode: true },
  { id: 'nb_onions', name: 'Red Onions (1 kg)', nameAr: 'بصل أحمر بالكيلو', price: 0.250, sellingPrice: 0.250, vatRate: 0, category: 'PRODUCE', isNonBarcode: true },
  { id: 'nb_potatoes', name: 'Fresh Potatoes (1 kg)', nameAr: 'بطاطس بالكيلو', price: 0.300, sellingPrice: 0.300, vatRate: 0, category: 'PRODUCE', isNonBarcode: true },
  { id: 'nb_cucumber', name: 'Green Cucumber (1 kg)', nameAr: 'خيار بالكيلو', price: 0.400, sellingPrice: 0.400, vatRate: 0, category: 'PRODUCE', isNonBarcode: true },
  { id: 'nb_lemon', name: 'Yellow Lemons (1 kg)', nameAr: 'ليمون أصفر بالكيلو', price: 0.500, sellingPrice: 0.500, vatRate: 0, category: 'PRODUCE', isNonBarcode: true },
  { id: 'nb_garlic', name: 'Garlic Pack', nameAr: 'ثوم كيس', price: 0.250, sellingPrice: 0.250, vatRate: 0, category: 'PRODUCE', isNonBarcode: true },
  { id: 'nb_ginger', name: 'Fresh Ginger (500g)', nameAr: 'زنجبيل طازج', price: 0.450, sellingPrice: 0.450, vatRate: 0, category: 'PRODUCE', isNonBarcode: true },
  { id: 'nb_bananas', name: 'Chiquita Bananas (1 kg)', nameAr: 'موز بالكيلو', price: 0.550, sellingPrice: 0.550, vatRate: 0, category: 'PRODUCE', isNonBarcode: true },
  { id: 'nb_apples', name: 'Royal Gala Apples (1 kg)', nameAr: 'تفاح أحمر بالكيلو', price: 0.650, sellingPrice: 0.650, vatRate: 0, category: 'PRODUCE', isNonBarcode: true },
  { id: 'nb_oranges', name: 'Valencia Oranges (1 kg)', nameAr: 'برتقال بالكيلو', price: 0.450, sellingPrice: 0.450, vatRate: 0, category: 'PRODUCE', isNonBarcode: true },

  // Bakery & Bread (0% VAT in Bahrain)
  { id: 'quick_khubz', name: 'Khubz Flatbread (5 pcs)', nameAr: 'خبز لبناني / بحريني', price: 0.100, sellingPrice: 0.100, vatRate: 0, category: 'BAKERY', isNonBarcode: true },
  { id: 'nb_tannoor', name: 'Tannoor Iranian Bread (4 pcs)', nameAr: 'خبز تنور إيراني', price: 0.100, sellingPrice: 0.100, vatRate: 0, category: 'BAKERY', isNonBarcode: true },
  { id: 'nb_roti', name: 'Paratha / Roti (Each)', nameAr: 'براتا / روتي', price: 0.100, sellingPrice: 0.100, vatRate: 0, category: 'BAKERY', isNonBarcode: true },
  { id: 'nb_samosa_plate', name: 'Samosa (4 pcs)', nameAr: 'سمبوسة حارة', price: 0.200, sellingPrice: 0.200, vatRate: 0, category: 'BAKERY', isNonBarcode: true },
  { id: 'nb_sliced_bread', name: 'White Sliced Sandwich Bread', nameAr: 'خبز توست أبيض', price: 0.400, sellingPrice: 0.400, vatRate: 0, category: 'BAKERY', isNonBarcode: true },
  { id: 'nb_burger_buns', name: 'Burger Buns 6s', nameAr: 'خبز برجر', price: 0.350, sellingPrice: 0.350, vatRate: 0, category: 'BAKERY', isNonBarcode: true },

  // Dairy & Eggs (0% VAT in Bahrain)
  { id: 'quick_milk_1l', name: 'Almarai Fresh Milk 1L', nameAr: 'حليب المراعي طازج 1 لتر', price: 0.550, sellingPrice: 0.550, vatRate: 0, category: 'DAIRY' },
  { id: 'quick_milk_2l', name: 'Almarai Fresh Milk 2L', nameAr: 'حليب المراعي 2 لتر', price: 1.050, sellingPrice: 1.050, vatRate: 0, category: 'DAIRY' },
  { id: 'nb_laban_1l', name: 'Almarai Fresh Laban 1L', nameAr: 'لبن المراعي 1 لتر', price: 0.550, sellingPrice: 0.550, vatRate: 0, category: 'DAIRY' },
  { id: 'quick_egg_30', name: 'Fresh White Eggs 30s', nameAr: 'بيض مائدة طازج 30 حبة', price: 1.800, sellingPrice: 1.800, vatRate: 0, category: 'DAIRY', isNonBarcode: true },
  { id: 'nb_cheese_feta', name: 'Turkish White Feta (500g)', nameAr: 'جبنة فيتا تركي', price: 1.200, sellingPrice: 1.200, vatRate: 0, category: 'DAIRY', isNonBarcode: true },
  { id: 'nb_paneer', name: 'Fresh Dairy Paneer (200g)', nameAr: 'جبن بانير طازج', price: 0.650, sellingPrice: 0.650, vatRate: 0, category: 'DAIRY', isNonBarcode: true },

  // Beverages & Cold Drinks (10% standard VAT / 0% water)
  { id: 'quick_tea', name: 'Karak Chai Hot Cup', nameAr: 'شاي كرك ساخن', price: 0.150, sellingPrice: 0.150, vatRate: 10, category: 'BEVERAGES', isNonBarcode: true },
  { id: 'nb_black_tea', name: 'Sulaimani / Black Tea Cup', nameAr: 'شاي أسود / سليماني', price: 0.100, sellingPrice: 0.100, vatRate: 10, category: 'BEVERAGES', isNonBarcode: true },
  { id: 'quick_water', name: 'Bottled Mineral Water 500ml', nameAr: 'ماء صحة صغير 500 مل', price: 0.100, sellingPrice: 0.100, vatRate: 0, category: 'BEVERAGES', isNonBarcode: true },
  { id: 'nb_water_15l', name: 'Bottled Mineral Water 1.5L', nameAr: 'ماء صحة كبير 1.5 لتر', price: 0.200, sellingPrice: 0.200, vatRate: 0, category: 'BEVERAGES', isNonBarcode: true },
  { id: 'nb_ice_bag', name: 'Ice Cube Bag 2kg', nameAr: 'كيس ثلج مكعبات 2 كغ', price: 0.350, sellingPrice: 0.350, vatRate: 10, category: 'BEVERAGES', isNonBarcode: true },

  // Butchery & Deli (0% VAT in Bahrain)
  { id: 'nb_mutton', name: 'Fresh Australian Mutton / Lamb (1 kg)', nameAr: 'لحم غنم أسترالي طازج بالكيلو', price: 3.800, sellingPrice: 3.800, vatRate: 0, category: 'MEAT', isNonBarcode: true },
  { id: 'nb_beef', name: 'Fresh Local Beef Cubes (1 kg)', nameAr: 'لحم بقري محلي بالكيلو', price: 3.200, sellingPrice: 3.200, vatRate: 0, category: 'MEAT', isNonBarcode: true },
  { id: 'nb_chicken_fresh', name: 'Fresh Local Whole Chicken (1000g)', nameAr: 'دجاج محلي مبرد', price: 1.450, sellingPrice: 1.450, vatRate: 0, category: 'MEAT', isNonBarcode: true },

  // Tobacco & General (10% VAT / Phone cards)
  { id: 'quick_cigs', name: 'Marlboro Gold Box', nameAr: 'سجائر مالبورو جولد', price: 1.200, sellingPrice: 1.200, vatRate: 10, category: 'TOBACCO' },
  { id: 'nb_loose_cig', name: 'Single Cigarette (Loose)', nameAr: 'سيجارة مفردة', price: 0.100, sellingPrice: 0.100, vatRate: 10, category: 'TOBACCO', isNonBarcode: true },
  { id: 'nb_batelco_1', name: 'Batelco Sim Refill BD 1.000', nameAr: 'بطاقة شحن بتلكو 1 دينار', price: 1.000, sellingPrice: 1.000, vatRate: 0, category: 'GENERAL', isNonBarcode: true },
  { id: 'nb_stc_1', name: 'stc Sim Refill BD 1.000', nameAr: 'بطاقة شحن إس تي سي 1 دينار', price: 1.000, sellingPrice: 1.000, vatRate: 0, category: 'GENERAL', isNonBarcode: true },
  { id: 'nb_zain_1', name: 'Zain Sim Refill BD 1.000', nameAr: 'بطاقة شحن زين 1 دينار', price: 1.000, sellingPrice: 1.000, vatRate: 0, category: 'GENERAL', isNonBarcode: true }
];

export default function MobileKhataScreen({ onSwitchToPim }: MobileKhataScreenProps) {
  // Ensure hardware barcode wedge runs in background
  useBarcodeWedge();

  const [apiBase] = useState(() => getApiBaseUrl());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // Cart Store State
  const cartItems = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const clearCart = useCartStore((state) => state.clearActiveCart);

  // Totals
  const { subtotal, totalVat, finalTotal } = useMemo(
    () => calculateCartTotals(cartItems),
    [cartItems]
  );

  // Customer Management
  const [customers, setCustomers] = useState<Customer[]>(() => {
    try {
      const cached = localStorage.getItem('f100_cached_customers');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Dynamic Handheld / Mobile Phone Terminal ID
  const [activeTerminalId, setActiveTerminalId] = useState<string>(() => {
    try {
      return localStorage.getItem('terminal_id') || 'T2';
    } catch {
      return 'T2';
    }
  });

  useEffect(() => {
    try {
      const existing = localStorage.getItem('terminal_id');
      const term = existing || 'T2';
      setActiveTerminalId(term);
      localStorage.setItem('terminal_id', term);
      if (!localStorage.getItem('REGISTER_PREFIX')) {
        localStorage.setItem('REGISTER_PREFIX', term);
      }
    } catch {}
  }, []);

  // ⚡ Broadcast Handheld / Phone Cart to Register Spy & Manager Dashboard
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('sunmi-cart-broadcast', {
      detail: {
        cart: cartItems,
        total: finalTotal,
        customer: selectedCustomer || null,
        activeCartId: `${activeTerminalId}-CART`,
        terminalId: activeTerminalId
      }
    }));
  }, [cartItems, finalTotal, selectedCustomer, activeTerminalId]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [isMessCheckout, setIsMessCheckout] = useState(false);

  // Scanner & Payment Modals
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [isBenefitModalOpen, setIsBenefitModalOpen] = useState(false);
  const [benefitQrUrl, setBenefitQrUrl] = useState<string | null>(null);

  // Khata Debt Collection / Settlement Modal
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMethod, setSettleMethod] = useState<'CASH' | 'BENEFIT_PAY'>('CASH');
  const [isSettling, setIsSettling] = useState(false);

  // Web Camera Barcode Scanner Modal (for standard mobile browsers without MLKit)
  const [isWebCameraOpen, setIsWebCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Over-limit Manager PIN Override Modal
  const [isOverLimitModalOpen, setIsOverLimitModalOpen] = useState(false);
  const [managerPinInput, setManagerPinInput] = useState('');
  const [managerPinError, setManagerPinError] = useState(false);

  // Auto-Print Toggle (Persisted)
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('f100_pos_autoprint');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  // Recent Invoices History Drawer
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [recentSales, setRecentSales] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('f100_recent_sales');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Manual Item Search & Non-Barcode Modal State
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [selectedProductCategory, setSelectedProductCategory] = useState<
    'NON-BARCODE' | 'ALL' | 'PRODUCE' | 'BAKERY' | 'DAIRY' | 'BEVERAGES' | 'MEAT' | 'CUSTOM'
  >('NON-BARCODE');
  const [catalogList, setCatalogList] = useState<any[]>(() => {
    try {
      const cached = getCachedCatalog();
      if (Array.isArray(cached) && cached.length > 0) return cached;
    } catch {}
    return [];
  });
  const [serverSearchLoading, setServerSearchLoading] = useState(false);
  const [serverSearchResults, setServerSearchResults] = useState<any[]>([]);

  // Quick Custom Non-Barcode Item State
  const [customNameInput, setCustomNameInput] = useState('');
  const [customPriceInput, setCustomPriceInput] = useState('');
  const [customVatRate, setCustomVatRate] = useState<0 | 10>(0);

  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showBanner = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setStatusBanner({ msg, type });
    setTimeout(() => setStatusBanner(null), 3500);
  };

  // 1b. Fetch catalog products on mount & poll every 25s (Local cache first, background API refresh + tombstone purge)
  const fetchCatalog = useCallback(async () => {
    try {
      const [prodRes, delRes] = await Promise.allSettled([
        fetch(`${apiBase}/products`, { signal: AbortSignal.timeout(4000) }),
        fetch(`${apiBase}/api/products/deleted`, { signal: AbortSignal.timeout(3000) })
      ]);

      const deletedIds = new Set<string>();
      const deletedBarcodes = new Set<string>();

      if (delRes.status === 'fulfilled' && delRes.value.ok) {
        try {
          const delData = await delRes.value.json();
          const delList = delData?.deleted || [];
          for (const d of delList) {
            if (d.id) deletedIds.add(String(d.id));
            if (d.barcode) deletedBarcodes.add(String(d.barcode));
          }
        } catch {}
      }

      if (prodRes.status === 'fulfilled' && prodRes.value.ok) {
        try {
          const data = await prodRes.value.json();
          const rawList = Array.isArray(data) ? data : (data?.products || data?.data || []);
          if (Array.isArray(rawList) && rawList.length > 0) {
            const activeList = rawList.filter((p: any) => {
              const id = String(p.id || '');
              const barcode = String(p.barcode || '');
              return !deletedIds.has(id) && (!barcode || !deletedBarcodes.has(barcode));
            });
            setCatalogList(activeList);
            reindexCatalog(activeList);
            try {
              localStorage.setItem('askar_catalog_cache', JSON.stringify(activeList));
              localStorage.setItem('askar_local_db_cache_Product', JSON.stringify(activeList));
            } catch {}
          }
        } catch {}
      }
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    try {
      const cached = getCachedCatalog();
      if (Array.isArray(cached) && cached.length > 0) {
        setCatalogList(cached);
      }
    } catch {}

    fetchCatalog();
    const catInterval = setInterval(fetchCatalog, 25 * 1000);
    return () => clearInterval(catInterval);
  }, [fetchCatalog]);

  // Refresh catalog immediately whenever manual item search modal opens
  useEffect(() => {
    if (isProductSearchOpen) {
      fetchCatalog();
    }
  }, [isProductSearchOpen, fetchCatalog]);

  // 1c. Debounced live server search fallback
  useEffect(() => {
    const q = productSearchQuery.trim();
    if (!q || q.length < 2) {
      setServerSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setServerSearchLoading(true);
      try {
        const res = await fetch(`${apiBase}/api/products/search?q=${encodeURIComponent(q)}`, {
          signal: AbortSignal.timeout(2500)
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setServerSearchResults(data.map((p: any) => ({
              id: String(p.id),
              name: p.name,
              nameAr: p.nameAr,
              price: Number(p.sellingPrice ?? p.price ?? 0),
              sellingPrice: Number(p.sellingPrice ?? p.price ?? 0),
              barcode: p.barcode || '',
              category: p.category || 'GENERAL',
              vatRate: Number(p.vatRate ?? 0),
              isScaleItem: Boolean(p.is_weighed_item),
              stockQuantity: p.stockQuantity
            })));
          }
        }
      } catch {} finally {
        setServerSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [productSearchQuery, apiBase]);

  // 1d. Merged products catalog (Bahrain Presets + Local Cache + Cloud API)
  const allMergedProducts = useMemo(() => {
    const map = new Map<string, any>();
    // Default Non-Barcode Bahrain presets
    for (const p of DEFAULT_NON_BARCODE_PRODUCTS) {
      map.set(p.id, p);
    }
    // Cached catalog
    for (const p of catalogList) {
      const key = String(p.id || p.barcode);
      if (key) {
        map.set(key, {
          ...p,
          price: Number(p.sellingPrice ?? p.price ?? 0),
          sellingPrice: Number(p.sellingPrice ?? p.price ?? 0),
          vatRate: p.vatRate !== undefined ? Number(p.vatRate) : 0,
          isNonBarcode: !p.barcode || Boolean(p.is_weighed_item || p.isScaleItem)
        });
      }
    }
    // Server search results
    for (const p of serverSearchResults) {
      const key = String(p.id || p.barcode);
      if (key && !map.has(key)) {
        map.set(key, p);
      }
    }
    return Array.from(map.values());
  }, [catalogList, serverSearchResults]);

  // 1e. Filtered Products for Manual Search
  const filteredProducts = useMemo(() => {
    const q = productSearchQuery.trim().toLowerCase();
    let list = allMergedProducts;

    if (selectedProductCategory === 'NON-BARCODE') {
      list = list.filter(p => !p.barcode || p.isNonBarcode || p.isScaleItem || p.is_weighed_item || p.category === 'PRODUCE' || p.category === 'BAKERY');
    } else if (selectedProductCategory !== 'ALL' && selectedProductCategory !== 'CUSTOM') {
      list = list.filter(p => (p.category || '').toUpperCase().includes(selectedProductCategory));
    }

    if (!q) return list.slice(0, 50);

    return list.filter(p => {
      const name = (p.name || '').toLowerCase();
      const ar = (p.nameAr || '').toLowerCase();
      const cat = (p.category || '').toLowerCase();
      const barcode = (p.barcode || '').toLowerCase();
      return name.includes(q) || ar.includes(q) || cat.includes(q) || barcode.includes(q);
    }).slice(0, 50);
  }, [allMergedProducts, productSearchQuery, selectedProductCategory]);

  const handleAddProductToCart = (prod: any) => {
    addItem({
      id: String(prod.id || Date.now()),
      name: prod.name,
      nameAr: prod.nameAr,
      price: Number(prod.sellingPrice ?? prod.price ?? 0),
      sellingPrice: Number(prod.sellingPrice ?? prod.price ?? 0),
      qty: 1,
      quantity: 1,
      vatRate: prod.vatRate !== undefined ? Number(prod.vatRate) : 0,
      barcode: prod.barcode || '',
      category: prod.category || 'GENERAL'
    });
    showBanner(`+ ${prod.name}`, 'info');
  };

  const handleAddCustomItem = () => {
    const price = parseFloat(customPriceInput);
    if (isNaN(price) || price <= 0) {
      showBanner('Please enter a valid price (e.g. 0.250)', 'error');
      return;
    }
    const name = customNameInput.trim() || (productSearchQuery.trim() ? productSearchQuery.trim() : 'Custom Item');
    const customProd = {
      id: `custom_${Date.now()}`,
      name: name,
      price: price,
      sellingPrice: price,
      qty: 1,
      quantity: 1,
      vatRate: customVatRate,
      barcode: '',
      category: 'CUSTOM'
    };
    addItem(customProd);
    setCustomPriceInput('');
    setCustomNameInput('');
    showBanner(`+ Added ${customProd.name} (BD ${price.toFixed(3)})`, 'info');
  };

  // 1. Fetch Customers from Cloudflare Edge / Central Turso
  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/khata/ledger?sort=highest`, {
        signal: AbortSignal.timeout(3500)
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.customers) ? data.customers : (Array.isArray(data) ? data : []);
        setCustomers(list);
        try {
          localStorage.setItem('f100_cached_customers', JSON.stringify(list));
        } catch {}
      }
    } catch (err) {
      console.warn('[F100 Mobile POS] Error fetching khata customers:', err);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchCustomers();
    const interval = setInterval(fetchCustomers, 30000);
    return () => clearInterval(interval);
  }, [fetchCustomers]);

  // 2. Measure Latency to Cloudflare Edge API
  useEffect(() => {
    const pingEdge = async () => {
      const start = Date.now();
      try {
        const res = await fetch(`${apiBase}/api/products/search?q=test&limit=1`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(3000)
        });
        if (res.ok) {
          setLatencyMs(Date.now() - start);
          setIsOnline(true);
        } else {
          setLatencyMs(null);
          setIsOnline(false);
        }
      } catch {
        setLatencyMs(null);
        setIsOnline(false);
      }
    };

    pingEdge();
    const pTimer = setInterval(pingEdge, 15000);
    return () => clearInterval(pTimer);
  }, [apiBase]);

  // 2b. Background Sales Queue Drainer: Synchronizes offline sales to Cloudflare Edge / Turso
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncingSales, setIsSyncingSales] = useState(false);
  const isSyncingSalesRef = useRef(false);

  const drainOfflineSales = useCallback(async (isManual = false) => {
    if (isSyncingSalesRef.current) return;
    isSyncingSalesRef.current = true;
    setIsSyncingSales(true);

    try {
      const pending = await getOfflineSales();
      setPendingSyncCount(pending.length);
      if (!pending || pending.length === 0) {
        if (isManual) showBanner('All sales synced with central dashboard', 'info');
        return;
      }

      console.log(`📡 [F100 Mobile POS] Draining ${pending.length} offline sales to ${apiBase}/api/sales/sync...`);
      const res = await fetch(`${apiBase}/api/sales/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pos-client': 'f100-mobile-pos',
          'x-manager-pin': '9999'
        },
        body: JSON.stringify(pending)
      });

      if (res.ok) {
        const syncedIds = pending.map((s: any) => s.id).filter(Boolean);
        await markOfflineSalesSynced(syncedIds);
        const remaining = await getOfflineSales();
        setPendingSyncCount(remaining.length);
        if (isManual) {
          showBanner(`Synced ${syncedIds.length} sales to Dashboard!`, 'success');
        }
        console.log(`✅ [F100 Mobile POS] Successfully synced ${syncedIds.length} sales to central database!`);
      } else {
        console.warn(`⚠️ [F100 Mobile POS] Sales sync HTTP ${res.status}`);
        if (isManual) showBanner(`Sync error HTTP ${res.status}`, 'error');
      }
    } catch (err: any) {
      console.warn('⚠️ [F100 Mobile POS] Sales sync deferred (network unreachable):', err);
      if (isManual) showBanner('Offline: Sales stored safely in local database', 'info');
    } finally {
      isSyncingSalesRef.current = false;
      setIsSyncingSales(false);
    }
  }, [apiBase]);

  // Periodic and Event-Driven Offline Sales Drain
  useEffect(() => {
    drainOfflineSales();
    const interval = setInterval(() => drainOfflineSales(), 10000);
    const handleOnline = () => {
      setIsOnline(true);
      drainOfflineSales();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [drainOfflineSales]);

  // Real-time Hot-Reload of Catalog when Intake is saved in Stock PIM
  useEffect(() => {
    const handleCatalogUpdate = (e: any) => {
      const p = e?.detail;
      console.log('🔄 [F100 POS] Real-time catalog intake event received:', p?.name);
      try {
        const cached = getCachedCatalog();
        if (Array.isArray(cached) && cached.length > 0) {
          setCatalogList(cached);
          reindexCatalog(cached);
        }
      } catch {}
      if (p) {
        setCatalogList((prev) => {
          const idx = prev.findIndex((x) => x.id === p.id || (x.barcode && x.barcode === p.barcode));
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], ...p };
            return next;
          }
          return [p, ...prev];
        });
        showBanner(`📦 Catalog updated: ${p.name}`, 'info');
      }
    };
    window.addEventListener('CATALOG_UPDATED', handleCatalogUpdate);
    return () => window.removeEventListener('CATALOG_UPDATED', handleCatalogUpdate);
  }, []);

  // 3. Hardware NFC Card Scanner Hook
  const handleNfcCardScanned = useCallback((uid: string) => {
    if (!uid) return;
    const cleanUid = uid.trim().toUpperCase();
    console.log(`📡 [F100 NFC] Customer Card Tapped: ${cleanUid}`);
    playNfcChime();

    const matched = customers.find(
      (c) => (c.cardUid && c.cardUid.toUpperCase() === cleanUid) ||
             (c.nfcCardId && c.nfcCardId.toUpperCase() === cleanUid)
    );

    if (matched) {
      setSelectedCustomer(matched);
      setIsMessCheckout(Boolean(matched.isMess || matched.messGroup));
      showBanner(`💳 Khata Card: ${matched.name} (BD ${Number(matched.currentBalance ?? matched.balance ?? 0).toFixed(3)})`, 'success');
    } else {
      showBanner(`Card UID [${cleanUid}] not linked to any Khata account`, 'error');
    }
  }, [customers]);

  useNfcReader(handleNfcCardScanned);

  useEffect(() => {
    const handleSunmiScan = (e: any) => {
      const uid = e?.detail?.nfcId || e?.detail?.tag_id;
      if (uid) handleNfcCardScanned(uid);
    };
    window.addEventListener('sunmi-nfc-scan', handleSunmiScan);
    return () => window.removeEventListener('sunmi-nfc-scan', handleSunmiScan);
  }, [handleNfcCardScanned]);

  useEffect(() => {
    const handleScanSuccess = (e: any) => {
      const prod = e?.detail?.product;
      if (prod) {
        showBanner(`+ ${prod.name} (BD ${Number(prod.sellingPrice || prod.price || 0).toFixed(3)})`, 'info');
      }
    };
    window.addEventListener('barcode-scan-success', handleScanSuccess);
    return () => window.removeEventListener('barcode-scan-success', handleScanSuccess);
  }, []);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.cpr && c.cpr.includes(q)) ||
        (c.cardUid && c.cardUid.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [customers, customerSearch]);

  // Settle Debt / Repayment Handlers
  const handleOpenSettleModal = (cust?: Customer) => {
    const target = cust || selectedCustomer;
    if (!target) {
      showBanner('Please select a customer first', 'error');
      return;
    }
    const bal = Number(target.currentBalance ?? target.balance ?? 0);
    if (bal <= 0) {
      showBanner(`${target.name} has no outstanding debt.`, 'info');
      return;
    }
    setSettleAmount(bal.toFixed(3));
    setIsSettleModalOpen(true);
  };

  const handleConfirmSettle = async () => {
    if (!selectedCustomer) return;
    const amountNum = parseFloat(settleAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showBanner('Enter a valid payment amount', 'error');
      return;
    }
    setIsSettling(true);
    const settleId = crypto.randomUUID();
    const tempReceiptNo = `KH-${Date.now().toString().slice(-6)}`;
    const curBal = Number(selectedCustomer.currentBalance ?? selectedCustomer.balance ?? 0);
    const newBal = Number(Math.max(0, curBal - amountNum).toFixed(3));

    // 1. Optimistic local update
    const updatedCustomer = {
      ...selectedCustomer,
      currentBalance: newBal,
      balance: newBal
    };
    setSelectedCustomer(updatedCustomer);
    setCustomers((prev) =>
      prev.map((c) => (c.id === updatedCustomer.id ? updatedCustomer : c))
    );
    try {
      const cached = localStorage.getItem('f100_cached_customers');
      if (cached) {
        const list = JSON.parse(cached);
        const updatedList = list.map((c: any) =>
          c.id === updatedCustomer.id ? { ...c, balance: newBal, currentBalance: newBal } : c
        );
        localStorage.setItem('f100_cached_customers', JSON.stringify(updatedList));
      }
    } catch {}

    // 2. Durable offline persistence (save locally first!)
    try {
      await saveOfflineKhataSettlement({
        id: settleId,
        customerId: selectedCustomer.id,
        amount: amountNum,
        paymentMethod: settleMethod,
        receiptNo: tempReceiptNo,
        reference: tempReceiptNo,
        timestamp: new Date().toISOString()
      });
    } catch (saveErr) {
      console.warn('Local offline settlement save notice:', saveErr);
    }

    // 3. Background network sync
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/customers/${selectedCustomer.id}/settle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: amountNum, paymentMethod: settleMethod, reference: tempReceiptNo }),
          signal: AbortSignal.timeout(3000)
        });
        if (res.ok) {
          await markOfflineKhataSettlementSynced(settleId);
        }
      } catch (err) {
        console.warn('Khata settlement queued for background sync:', err);
      }
    })();

    playThankYouVoice();
    showBanner(`✅ Payment received: BD ${amountNum.toFixed(3)} from ${selectedCustomer.name}`, 'success');
    setIsSettling(false);
    setIsSettleModalOpen(false);
  };

  // Web Camera Barcode Scanning (using HTML5 BarcodeDetector API for Mobile Safari / Chrome)
  const stopWebCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsWebCameraOpen(false);
  };

  const startWebCamera = async () => {
    try {
      setIsWebCameraOpen(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e']
        });

        const scanFrame = async () => {
          if (!videoRef.current || !streamRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              const code = barcodes[0].rawValue.trim();
              stopWebCamera();
              const fast = lookupProductFast(code);
              if (fast) {
                addItem(fast);
                showBanner(`+ ${fast.name}`, 'info');
              } else {
                const dbProd = await fetchProductByBarcode(code);
                if (dbProd) {
                  addItem(dbProd);
                  showBanner(`+ ${dbProd.name}`, 'info');
                } else {
                  showBanner(`Item not in catalog: ${code}`, 'error');
                }
              }
              return;
            }
          } catch {}
          if (streamRef.current) {
            requestAnimationFrame(scanFrame);
          }
        };

        requestAnimationFrame(scanFrame);
      }
    } catch (err: any) {
      console.warn('Web camera error:', err);
      showBanner(`Camera access: ${err?.message || 'Permission denied'}`, 'error');
      setIsWebCameraOpen(false);
    }
  };

  // Hybrid Barcode Scanning (Capacitor MLKit on Native Android / HTML5 Web Camera on Browser)
  const handleScanBarcode = async () => {
    try {
      const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
      if (isNative) {
        showBanner('📷 Opening native scanner...', 'info');
        const isGoogleAvailable = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
        if (!isGoogleAvailable.available) {
          await BarcodeScanner.installGoogleBarcodeScannerModule();
        }
        const { barcodes } = await BarcodeScanner.scan({
          formats: [
            BarcodeFormat.Ean13,
            BarcodeFormat.Ean8,
            BarcodeFormat.Code128,
            BarcodeFormat.Code39,
            BarcodeFormat.UpcA,
            BarcodeFormat.UpcE,
            BarcodeFormat.QrCode
          ]
        });
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          const code = barcodes[0].rawValue.trim();
          const fast = lookupProductFast(code);
          if (fast) {
            addItem(fast);
            showBanner(`+ ${fast.name}`, 'info');
            return;
          }
          const dbProd = await fetchProductByBarcode(code);
          if (dbProd) {
            addItem(dbProd);
            showBanner(`+ ${dbProd.name}`, 'info');
          } else {
            showBanner(`Item not in catalog: ${code}`, 'error');
          }
        }
      } else {
        // Launch web camera scanner for browsers!
        startWebCamera();
      }
    } catch (err: any) {
      if (!err?.message?.includes('cancel')) {
        console.warn('Barcode scanner notice:', err);
      }
    }
  };

  const handleToggleAutoPrint = () => {
    const nextVal = !autoPrintEnabled;
    setAutoPrintEnabled(nextVal);
    try {
      localStorage.setItem('f100_pos_autoprint', String(nextVal));
    } catch {}
    showBanner(`🖨️ Auto-Print: ${nextVal ? 'ON (Prints 58mm Receipt)' : 'OFF (Zero Paper)'}`, 'info');
  };

  const handleSwitchToPim = () => {
    try {
      localStorage.setItem('f100_active_mode', 'pim');
      localStorage.setItem('f100_default_mode', 'true');
    } catch {}
    if (onSwitchToPim) {
      onSwitchToPim();
    } else {
      window.location.href = '/pim';
    }
  };

  const handleExecuteCheckout = async (
    paymentType: 'CREDIT' | 'CASH' | 'BENEFIT_PAY' | 'MESS_KHATA',
    tenderAmount?: number,
    bypassLimitCheck: boolean = false
  ) => {
    if (cartItems.length === 0) {
      showBanner('Cart is empty! Scan items or tap quick items.', 'error');
      return;
    }

    if ((paymentType === 'CREDIT' || paymentType === 'MESS_KHATA') && !selectedCustomer) {
      showBanner('Tap customer NFC card or select customer first!', 'error');
      return;
    }

    const curBal = selectedCustomer ? Number(selectedCustomer.currentBalance ?? selectedCustomer.balance ?? 0) : 0;
    const creditLim = selectedCustomer ? Number(selectedCustomer.creditLimit ?? selectedCustomer.credit_limit ?? 30.0) : 30.0;
    const isOverLimit = (curBal + finalTotal) > creditLim;

    if ((paymentType === 'CREDIT' || paymentType === 'MESS_KHATA') && isOverLimit && !bypassLimitCheck) {
      setIsOverLimitModalOpen(true);
      return;
    }

    setIsCheckingOut(true);

    try {
      const { invoiceNo, invoiceSeq } = await generateNextInvoiceNumber(activeTerminalId);

      const oldBalance = curBal;
      const newBalance = (paymentType === 'CREDIT' || paymentType === 'MESS_KHATA')
        ? Number((oldBalance + finalTotal).toFixed(3))
        : oldBalance;

      const salePayload = {
        id: `sale_${invoiceNo.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        tenantId: 'tenant_askar_01',
        storeId: 'store_askar_01',
        terminalId: activeTerminalId,
        invoiceNo,
        invoiceSeq,
        total: finalTotal,
        subtotal,
        totalVat,
        vatTotal: totalVat,
        paymentType: isMessCheckout ? 'MESS_KHATA' : paymentType,
        status: 'COMPLETED',
        customerId: selectedCustomer?.id || null,
        cardUid: selectedCustomer?.cardUid || null,
        items: cartItems.map((item) => {
          const unitPrice = item.price ?? (item as any).sellingPrice ?? 0;
          const qty = item.qty ?? (item as any).quantity ?? 1;
          const lineTotal = Number((unitPrice * qty).toFixed(3));
          const rate = item.vatRate !== undefined ? item.vatRate : 10;
          const lineTax = rate === 10 ? Number((lineTotal - (lineTotal / 1.10)).toFixed(3)) : 0;
          return {
            productId: item.id,
            name: item.name,
            price: unitPrice,
            quantity: qty,
            total: lineTotal,
            vatRate: rate,
            vatAmount: lineTax
          };
        }),
        createdAt: new Date().toISOString()
      };

      await saveSaleOffline(salePayload);

      // Trigger immediate background drain to Edge API & Turso
      setTimeout(() => drainOfflineSales(), 60);

      if (selectedCustomer && (paymentType === 'CREDIT' || paymentType === 'MESS_KHATA')) {
        const updatedCust = {
          ...selectedCustomer,
          currentBalance: newBalance,
          balance: newBalance
        };
        setSelectedCustomer(updatedCust);
        setCustomers((prev) =>
          prev.map((c) => (c.id === updatedCust.id ? updatedCust : c))
        );
      }

      if (autoPrintEnabled) {
        const cashierTitle = activeTerminalId === 'T2' ? 'Terminal 02 (F100)' :
                             activeTerminalId.startsWith('M') ? `Mobile Phone (${activeTerminalId})` :
                             `Register (${activeTerminalId})`;
        printFullReceipt({
          invoiceNo,
          items: [...cartItems],
          subtotal,
          vat: totalVat,
          total: finalTotal,
          paymentMode: isMessCheckout ? 'MESS_KHATA' : paymentType,
          customerName: selectedCustomer?.name,
          customerCardUid: selectedCustomer?.cardUid || undefined,
          previousBalance: (paymentType === 'CREDIT' || paymentType === 'MESS_KHATA') ? oldBalance : undefined,
          newBalance: (paymentType === 'CREDIT' || paymentType === 'MESS_KHATA') ? newBalance : undefined,
          cashierName: cashierTitle,
          cashTendered: tenderAmount,
          changeDue: tenderAmount ? Number((tenderAmount - finalTotal).toFixed(3)) : undefined,
          isMess: isMessCheckout,
          groupName: selectedCustomer?.group_name || selectedCustomer?.messGroup?.group_name,
          members: selectedCustomer?.members
        }).catch((pErr) => console.warn('[F100] Printer dispatch warning:', pErr));
      }

      const saleSummary = {
        invoiceNo,
        total: finalTotal,
        paymentType: isMessCheckout ? 'MESS_KHATA' : paymentType,
        customerName: selectedCustomer?.name || 'Walk-in',
        time: new Date().toLocaleTimeString(),
        items: [...cartItems],
        subtotal,
        vat: totalVat,
        oldBalance,
        newBalance
      };
      setRecentSales((prev) => {
        const next = [saleSummary, ...prev.slice(0, 14)];
        try {
          localStorage.setItem('f100_recent_sales', JSON.stringify(next));
        } catch {}
        return next;
      });

      playThankYouVoice('SALE');

      clearCart();
      setIsCashModalOpen(false);
      setIsBenefitModalOpen(false);
      setIsOverLimitModalOpen(false);
      setManagerPinInput('');

      showBanner(
        `✅ Success! ${invoiceNo} • BD ${finalTotal.toFixed(3)} ${paymentType === 'CREDIT' ? `(New Bal: BD ${newBalance.toFixed(3)})` : ''}`,
        'success'
      );
    } catch (err: any) {
      console.error('[F100 Mobile POS] Checkout error:', err);
      showBanner(`Checkout Error: ${err.message || 'Check terminal state'}`, 'error');
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleManagerPinSubmit = () => {
    if (managerPinInput === '9999') {
      setIsOverLimitModalOpen(false);
      setManagerPinError(false);
      handleExecuteCheckout('CREDIT', undefined, true);
    } else {
      setManagerPinError(true);
    }
  };

  const handleOpenBenefitPay = async () => {
    if (cartItems.length === 0) {
      showBanner('Cart is empty!', 'error');
      return;
    }
    const ref = `T2-${Date.now().toString().slice(-6)}`;
    const config = getStoredBenefitPayConfig();
    const payload = generateBenefitPayPayload(finalTotal, ref, config);
    try {
      const qrDataUrl = await QRCode.toDataURL(payload, {
        width: 260,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      });
      setBenefitQrUrl(qrDataUrl);
      setIsBenefitModalOpen(true);
    } catch (err) {
      console.error('Failed to generate BenefitPay QR', err);
      showBanner('Failed to generate BenefitPay QR', 'error');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100%',
        backgroundColor: '#090d16',
        color: '#ffffff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: 'hidden',
        userSelect: 'none',
        boxSizing: 'border-box'
      }}
    >
      {/* 1. TOP HEADER */}
      <header
        style={{
          flexShrink: 0,
          backgroundColor: '#0f172a',
          borderBottom: '1px solid #1e293b',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 30,
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
        }}
      >
        {/* Terminal Badge & Online Latency */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 8px',
              borderRadius: '6px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#34d399',
              fontWeight: 800,
              fontSize: '11px',
              letterSpacing: '0.3px'
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: '#10b981'
              }}
            />
            <span>T2 KHATA LANE</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontFamily: 'monospace' }}>
            {isOnline ? (
              <span style={{ color: '#34d399', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Wifi size={12} />
                {latencyMs !== null ? `${latencyMs}ms` : 'ONLINE'}
              </span>
            ) : (
              <span style={{ color: '#f87171', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                <WifiOff size={12} />
                OFFLINE
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={handleToggleAutoPrint}
            title="Toggle Selective Auto-Printing"
            style={{
              padding: '5px 8px',
              borderRadius: '6px',
              border: autoPrintEnabled ? '1px solid #f59e0b' : '1px solid #334155',
              backgroundColor: autoPrintEnabled ? 'rgba(245, 158, 11, 0.18)' : '#1e293b',
              color: autoPrintEnabled ? '#fbbf24' : '#94a3b8',
              fontSize: '11px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer'
            }}
          >
            <Printer size={12} />
            <span>{autoPrintEnabled ? 'PRINT ON' : 'PRINT OFF'}</span>
          </button>

          {/* Cloud Dashboard Sync Button & Queue Counter */}
          <button
            type="button"
            onClick={() => drainOfflineSales(true)}
            title="Sync Bills with Back Office Dashboard"
            style={{
              padding: '5px 8px',
              borderRadius: '6px',
              border: pendingSyncCount > 0 ? '1px solid #06b6d4' : '1px solid #334155',
              backgroundColor: pendingSyncCount > 0 ? 'rgba(6, 182, 212, 0.2)' : '#1e293b',
              color: pendingSyncCount > 0 ? '#22d3ee' : '#94a3b8',
              fontSize: '11px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={12} style={{ animation: isSyncingSales ? 'spin 1s linear infinite' : 'none' }} />
            <span>{pendingSyncCount > 0 ? `${pendingSyncCount} QUEUED` : 'SYNC'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHistoryDrawer(true)}
            style={{
              padding: '6px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#cbd5e1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Recent Invoices"
          >
            <History size={14} />
          </button>

          <button
            type="button"
            onClick={handleSwitchToPim}
            style={{
              padding: '5px 9px',
              backgroundColor: '#2563eb',
              border: 'none',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.35)'
            }}
          >
            <Package size={12} />
            <span>STOCK PIM ↗</span>
          </button>
        </div>
      </header>

      {/* Floating Status Notification Banner */}
      {statusBanner && (
        <div
          style={{
            padding: '8px 12px',
            textAlign: 'center',
            fontSize: '12px',
            fontWeight: 800,
            backgroundColor:
              statusBanner.type === 'success'
                ? '#059669'
                : statusBanner.type === 'error'
                ? '#dc2626'
                : '#2563eb',
            color: '#ffffff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            zIndex: 40
          }}
        >
          {statusBanner.msg}
        </div>
      )}

      {/* 2. CUSTOMER & NFC SECTION (Top Hero) */}
      <section
        style={{
          flexShrink: 0,
          backgroundColor: '#0f172a',
          borderBottom: '1px solid #1e293b',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          zIndex: 20
        }}
      >
        {!selectedCustomer ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* NFC Tap Card Banner */}
            <div
              onClick={() => setIsSearchingCustomer(true)}
              style={{
                background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.45) 0%, rgba(49, 46, 129, 0.4) 100%)',
                border: '1.5px solid rgba(59, 130, 246, 0.45)',
                borderRadius: '12px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.05)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(59, 130, 246, 0.25)',
                    border: '1px solid rgba(96, 165, 250, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#60a5fa'
                  }}
                >
                  <CreditCard size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 900, color: '#93c5fd', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>TAP NFC CARD ON BACK</span>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    or tap to search customer by name / phone
                  </div>
                </div>
              </div>
              <Search size={16} color="#60a5fa" />
            </div>

            {/* Quick Customer Badges */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                overflowX: 'auto',
                paddingBottom: '2px'
              }}
            >
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', flexShrink: 0 }}>
                Quick:
              </span>
              {customers.slice(0, 5).map((cust) => (
                <button
                  key={cust.id}
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(cust);
                    setIsMessCheckout(Boolean(cust.isMess || cust.messGroup));
                    playNfcChime();
                  }}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    color: '#e2e8f0',
                    fontSize: '11px',
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span>{cust.name.split(' ')[0]}</span>
                  <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#fbbf24' }}>
                    BD {Number(cust.currentBalance ?? cust.balance ?? 0).toFixed(1)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ACTIVE CUSTOMER CARD */
          <div
            style={{
              backgroundColor: '#1e293b',
              border: '1.5px solid rgba(59, 130, 246, 0.5)',
              borderRadius: '12px',
              padding: '10px 12px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
              position: 'relative'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 900, fontSize: '14px', color: '#ffffff' }}>{selectedCustomer.name}</span>
                  {selectedCustomer.phone && (
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                      ({selectedCustomer.phone})
                    </span>
                  )}
                  {selectedCustomer.cardUid && (
                    <span
                      style={{
                        padding: '1px 5px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
                        color: '#93c5fd',
                        fontFamily: 'monospace',
                        fontSize: '9px',
                        border: '1px solid rgba(59, 130, 246, 0.3)'
                      }}
                    >
                      NFC
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                  <span style={{ color: '#94a3b8' }}>Balance:</span>
                  <span style={{ fontWeight: 900, fontFamily: 'monospace', color: '#fbbf24', fontSize: '13px' }}>
                    BD {Number(selectedCustomer.currentBalance ?? selectedCustomer.balance ?? 0).toFixed(3)}
                  </span>
                  <span style={{ color: '#475569' }}>•</span>
                  <span style={{ color: '#94a3b8' }}>Limit:</span>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#cbd5e1' }}>
                    BD {Number(selectedCustomer.creditLimit ?? selectedCustomer.credit_limit ?? 30.0).toFixed(3)}
                  </span>
                </div>

                {/* Quick Debt Repayment Action Button */}
                {Number(selectedCustomer.currentBalance ?? selectedCustomer.balance ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => handleOpenSettleModal()}
                    style={{
                      marginTop: '6px',
                      padding: '5px 10px',
                      backgroundColor: '#059669',
                      border: '1px solid #10b981',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(5, 150, 105, 0.3)'
                    }}
                  >
                    <Banknote size={13} />
                    <span>COLLECT PAYMENT (BD {Number(selectedCustomer.currentBalance ?? selectedCustomer.balance ?? 0).toFixed(3)})</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  backgroundColor: '#334155',
                  border: 'none',
                  color: '#cbd5e1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Mess Group Toggle */}
            {(selectedCustomer.isMess || selectedCustomer.messGroup) && (
              <div
                style={{
                  marginTop: '8px',
                  paddingTop: '8px',
                  borderTop: '1px solid rgba(51, 65, 85, 0.6)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontSize: '11px', color: '#a5b4fc', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Users size={12} />
                  <span>Mess: {selectedCustomer.group_name || selectedCustomer.messGroup?.group_name || 'Group'}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsMessCheckout(!isMessCheckout)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 800,
                    border: 'none',
                    backgroundColor: isMessCheckout ? '#4f46e5' : '#334155',
                    color: '#ffffff',
                    cursor: 'pointer'
                  }}
                >
                  {isMessCheckout ? '👥 Split Mode Active' : '👤 Personal Tab'}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. BARCODE SCAN TRIGGER & QUICK STAPLES */}
      <section
        style={{
          flexShrink: 0,
          backgroundColor: '#0b1120',
          borderBottom: '1px solid #1e293b',
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Direct Camera Barcode Scanner Button */}
          <button
            type="button"
            onClick={handleScanBarcode}
            style={{
              flex: 1,
              padding: '9px 8px',
              background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
              border: 'none',
              color: '#ffffff',
              borderRadius: '10px',
              fontWeight: 900,
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(5, 150, 105, 0.35)'
            }}
          >
            <Camera size={14} />
            <span>SCAN BARCODE</span>
          </button>

          {/* Dedicated Manual Search Non-Barcode Items Button */}
          <button
            type="button"
            onClick={() => {
              setSelectedProductCategory('NON-BARCODE');
              setIsProductSearchOpen(true);
            }}
            style={{
              flex: 1,
              padding: '9px 8px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              border: 'none',
              color: '#ffffff',
              borderRadius: '10px',
              fontWeight: 900,
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)'
            }}
          >
            <Search size={14} />
            <span>SEARCH ITEMS 🔍</span>
          </button>
        </div>

        {/* Quick Item Input / Search Launcher */}
        <div
          onClick={() => {
            setSelectedProductCategory('NON-BARCODE');
            setIsProductSearchOpen(true);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '8px 10px',
            cursor: 'pointer',
            gap: '8px'
          }}
        >
          <Search size={13} color="#60a5fa" />
          <span style={{ fontSize: '11px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Tap to search non-barcode (Tomato, Khubz, Milk, Chai)...
          </span>
        </div>
      </section>

      {/* Quick Common Grocery Staples */}
      <section
        style={{
          flexShrink: 0,
          backgroundColor: '#0b1120',
          padding: '4px 12px 8px 12px',
          borderBottom: '1px solid #1e293b'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflowX: 'auto',
            paddingBottom: '2px'
          }}
        >
          <button
            type="button"
            onClick={() => {
              setSelectedProductCategory('NON-BARCODE');
              setIsProductSearchOpen(true);
            }}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              backgroundColor: '#1e3a8a',
              border: '1px solid #3b82f6',
              color: '#93c5fd',
              fontSize: '11px',
              fontWeight: 900,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Search size={11} />
            <span>+ More Items...</span>
          </button>
          {QUICK_STAPLES.map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => {
                addItem(st as any);
                showBanner(`+ ${st.name}`, 'info');
              }}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: '#e2e8f0',
                fontSize: '11px',
                fontWeight: 800,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>{st.name.split(' ')[0]}</span>
              <span style={{ color: '#34d399', fontFamily: 'monospace' }}>BD {st.price.toFixed(3)}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 4. CART LINE ITEMS LIST */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          backgroundColor: '#090d16'
        }}
      >
        {cartItems.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
              gap: '8px',
              padding: '24px',
              textAlign: 'center'
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#475569'
              }}
            >
              <ScanLine size={28} />
            </div>
            <div style={{ fontSize: '14px', fontWeight: 900, color: '#cbd5e1' }}>
              Terminal 02 Cart is Empty
            </div>
            <p style={{ fontSize: '11px', color: '#64748b', maxWidth: '240px', lineHeight: 1.4 }}>
              Scan barcodes with laser or rear camera, or tap quick grocery items above.
            </p>
          </div>
        ) : (
          cartItems.map((item, idx) => {
            const unitPrice = item.price ?? (item as any).sellingPrice ?? 0;
            const qty = item.qty ?? (item as any).quantity ?? 1;
            const lineTotal = unitPrice * qty;
            const isLatest = idx === 0;

            return (
              <div
                key={item.id || idx}
                style={{
                  backgroundColor: isLatest ? '#132338' : '#0f172a',
                  border: isLatest ? '1px solid #0284c7' : '1px solid #1e293b',
                  borderRadius: '10px',
                  padding: '9px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ fontWeight: 800, fontSize: '12px', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </div>
                    {isLatest && (
                      <span style={{ backgroundColor: '#0284c7', color: '#ffffff', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', padding: '1px 5px', borderRadius: '4px' }}>
                        Top
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#94a3b8' }}>
                    BD {unitPrice.toFixed(3)} each {item.vatRate === 0 && <span style={{ color: '#34d399', fontWeight: 700 }}>(0% VAT)</span>}
                  </div>
                </div>

                {/* Qty Steppers */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.id, qty - 1)}
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '6px',
                      backgroundColor: '#1e293b',
                      border: 'none',
                      color: '#cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      cursor: 'pointer'
                    }}
                  >
                    <Minus size={12} />
                  </button>

                  <span style={{ width: '24px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 900, fontSize: '12px', color: '#ffffff' }}>
                    {qty}
                  </span>

                  <button
                    type="button"
                    onClick={() => updateQuantity(item.id, qty + 1)}
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '6px',
                      backgroundColor: '#1e293b',
                      border: 'none',
                      color: '#cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={12} />
                  </button>

                  <div style={{ width: '70px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 900, fontSize: '12px', color: '#34d399' }}>
                    BD {lineTotal.toFixed(3)}
                  </div>

                  <button
                    type="button"
                    onClick={() => updateQuantity(item.id, 0)}
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      border: 'none',
                      color: '#f87171',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      marginLeft: '2px'
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* 5. TOTALS & BAHRAIN NBR VAT BAR */}
      <footer
        style={{
          flexShrink: 0,
          backgroundColor: '#0f172a',
          borderTop: '1px solid #1e293b',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          zIndex: 20
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Items: <strong style={{ color: '#ffffff', fontFamily: 'monospace' }}>{cartItems.reduce((s, i) => s + (i.qty || (i as any).quantity || 1), 0)}</strong></span>
            <span>•</span>
            <span>Subtotal: <strong style={{ color: '#ffffff', fontFamily: 'monospace' }}>BD {subtotal.toFixed(3)}</strong></span>
            <span>•</span>
            <span>VAT (10%): <strong style={{ color: '#ffffff', fontFamily: 'monospace' }}>BD {totalVat.toFixed(3)}</strong></span>
          </div>

          {cartItems.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              style={{
                background: 'none',
                border: 'none',
                color: '#f87171',
                fontWeight: 700,
                fontSize: '11px',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Clear Cart
            </button>
          )}
        </div>

        {/* Large High-Contrast Total Display */}
        <div
          style={{
            backgroundColor: '#090d16',
            borderRadius: '10px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            border: '1.5px solid #1e293b'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 900, color: '#94a3b8', letterSpacing: '0.5px' }}>
            TOTAL DUE:
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, fontFamily: 'monospace', color: '#34d399', letterSpacing: '-0.5px' }}>
            BD {finalTotal.toFixed(3)}
          </div>
        </div>

        {/* 6. ONE-TAP RUSH HOUR CHECKOUT ACTIONS */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
          {/* Primary Khata Charge Button */}
          <button
            type="button"
            disabled={isCheckingOut || cartItems.length === 0}
            onClick={() => handleExecuteCheckout('CREDIT')}
            style={{
              padding: '12px 10px',
              borderRadius: '10px',
              fontWeight: 900,
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: (isCheckingOut || cartItems.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (isCheckingOut || cartItems.length === 0) ? 0.5 : 1,
              border: 'none',
              background: selectedCustomer && cartItems.length > 0
                ? 'linear-gradient(135deg, #2563eb 0%, #4338ca 100%)'
                : '#1e293b',
              color: '#ffffff',
              boxShadow: selectedCustomer && cartItems.length > 0 ? '0 4px 12px rgba(37, 99, 235, 0.35)' : 'none'
            }}
          >
            {isCheckingOut ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <CreditCard size={15} />
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedCustomer
                ? `CHARGE KHATA (${selectedCustomer.name.split(' ')[0]})`
                : 'SELECT KHATA CUSTOMER'}
            </span>
          </button>

          {/* Quick Cash Button */}
          <button
            type="button"
            disabled={isCheckingOut || cartItems.length === 0}
            onClick={() => setIsCashModalOpen(true)}
            style={{
              padding: '12px 10px',
              borderRadius: '10px',
              fontWeight: 900,
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: (isCheckingOut || cartItems.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (isCheckingOut || cartItems.length === 0) ? 0.5 : 1,
              border: 'none',
              backgroundColor: '#059669',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.35)'
            }}
          >
            <Banknote size={15} />
            <span>CASH</span>
          </button>
        </div>

        {/* BenefitPay QR Button */}
        <div>
          <button
            type="button"
            disabled={isCheckingOut || cartItems.length === 0}
            onClick={handleOpenBenefitPay}
            style={{
              width: '100%',
              padding: '7px',
              borderRadius: '8px',
              backgroundColor: '#1e293b',
              border: '1px solid rgba(244, 63, 94, 0.35)',
              color: '#fb7185',
              fontWeight: 800,
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              cursor: (isCheckingOut || cartItems.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (isCheckingOut || cartItems.length === 0) ? 0.5 : 1
            }}
          >
            <Zap size={13} color="#fb7185" />
            <span>BENEFITPAY FAWRI+ QR</span>
          </button>
        </div>
      </footer>

      {/* --- MODAL 1: MANUAL PRODUCT SEARCH & NON-BARCODE ITEMS --- */}
      {isProductSearchOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
            zIndex: 100,
            backgroundColor: '#020617',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid #1e293b',
              backgroundColor: '#0b1120',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  backgroundColor: '#1e3a8a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#60a5fa'
                }}
              >
                <Search size={16} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontWeight: 900, fontSize: '14px', color: '#ffffff' }}>
                  Search Catalog & Non-Barcode
                </h3>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                  {filteredProducts.length} items available • 1-tap add to cart
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsProductSearchOpen(false);
                setProductSearchQuery('');
              }}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                backgroundColor: '#1e293b',
                border: 'none',
                color: '#e2e8f0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 700
              }}
            >
              <X size={16} />
              <span>CLOSE</span>
            </button>
          </div>

          {/* Search Input Bar */}
          <div style={{ padding: '10px 14px', backgroundColor: '#0b1120', borderBottom: '1px solid #1e293b' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                autoFocus
                placeholder="Search item name (Tomato, Karak, Bread)..."
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 36px 10px 34px',
                  backgroundColor: '#0f172a',
                  border: '1.5px solid #3b82f6',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '13px',
                  outline: 'none',
                  fontWeight: 600
                }}
              />
              <Search
                size={16}
                color="#60a5fa"
                style={{ position: 'absolute', left: '10px', top: '12px' }}
              />
              {productSearchQuery && (
                <button
                  type="button"
                  onClick={() => setProductSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '8px',
                    padding: '4px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer'
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                overflowX: 'auto',
                marginTop: '10px',
                paddingBottom: '2px'
              }}
            >
              {[
                { id: 'NON-BARCODE', label: '⭐ Non-Barcode' },
                { id: 'ALL', label: '🌐 All Items' },
                { id: 'PRODUCE', label: '🥬 Produce / Veg' },
                { id: 'BAKERY', label: '🍞 Bakery & Bread' },
                { id: 'DAIRY', label: '🥛 Dairy & Eggs' },
                { id: 'BEVERAGES', label: '🥤 Tea & Cold' },
                { id: 'MEAT', label: '🥩 Butchery & Meat' },
                { id: 'CUSTOM', label: '➕ Custom Amount' }
              ].map((tab) => {
                const isActive = selectedProductCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedProductCategory(tab.id as any)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: isActive ? 900 : 700,
                      whiteSpace: 'nowrap',
                      border: isActive ? '1px solid #3b82f6' : '1px solid #334155',
                      backgroundColor: isActive ? '#1d4ed8' : '#1e293b',
                      color: isActive ? '#ffffff' : '#94a3b8',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Custom Non-Barcode Form (visible when CUSTOM selected or when search yields 0 items) */}
          {(selectedProductCategory === 'CUSTOM' || filteredProducts.length === 0) && (
            <div
              style={{
                margin: '10px 14px',
                padding: '12px',
                backgroundColor: '#111827',
                border: '1.5px dashed #f59e0b',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', fontWeight: 900, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Plus size={14} /> Add One-Off Non-Barcode Item
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setCustomVatRate(0)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontWeight: 800,
                      border: 'none',
                      backgroundColor: customVatRate === 0 ? '#059669' : '#1f2937',
                      color: customVatRate === 0 ? '#ffffff' : '#9ca3af',
                      cursor: 'pointer'
                    }}
                  >
                    0% Food
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomVatRate(10)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontWeight: 800,
                      border: 'none',
                      backgroundColor: customVatRate === 10 ? '#2563eb' : '#1f2937',
                      color: customVatRate === 10 ? '#ffffff' : '#9ca3af',
                      cursor: 'pointer'
                    }}
                  >
                    10% Standard
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Item Name (e.g. Loose Veg, Bakery)"
                  value={customNameInput}
                  onChange={(e) => setCustomNameInput(e.target.value)}
                  style={{
                    flex: 2,
                    padding: '8px 10px',
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
                <input
                  type="number"
                  step="0.050"
                  placeholder="Price BD (0.250)"
                  value={customPriceInput}
                  onChange={(e) => setCustomPriceInput(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#10b981',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    fontWeight: 900,
                    outline: 'none'
                  }}
                />
              </div>

              <button
                type="button"
                onClick={handleAddCustomItem}
                style={{
                  padding: '9px',
                  backgroundColor: '#059669',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: 'pointer'
                }}
              >
                <Plus size={14} />
                <span>+ ADD TO CART</span>
              </button>
            </div>
          )}

          {/* Product Items List */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '10px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            {serverSearchLoading && (
              <div style={{ textAlign: 'center', padding: '10px', color: '#60a5fa', fontSize: '11px' }}>
                Searching cloud catalog...
              </div>
            )}

            {filteredProducts.map((p) => {
              const inCartQty = cartItems.find((ci) => ci.id === String(p.id))?.quantity || 0;
              return (
                <div
                  key={p.id}
                  onClick={() => handleAddProductToCart(p)}
                  style={{
                    backgroundColor: '#0f172a',
                    border: inCartQty > 0 ? '1.5px solid #059669' : '1px solid #1e293b',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 900, fontSize: '13px', color: '#ffffff' }}>
                        {p.name}
                      </span>
                      {p.isNonBarcode && (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 900,
                            backgroundColor: '#78350f',
                            color: '#fef3c7',
                            padding: '2px 5px',
                            borderRadius: '4px'
                          }}
                        >
                          NON-BARCODE
                        </span>
                      )}
                      {inCartQty > 0 && (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 900,
                            backgroundColor: '#064e3b',
                            color: '#a7f3d0',
                            padding: '2px 5px',
                            borderRadius: '4px'
                          }}
                        >
                          {inCartQty} IN CART
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                      {p.nameAr && (
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          {p.nameAr}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#64748b',
                          fontFamily: 'monospace'
                        }}
                      >
                        {p.category || 'GENERAL'} • VAT {p.vatRate ?? 0}%
                      </span>
                    </div>
                  </div>

                  {/* Price & Add Button */}
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 900,
                        fontSize: '13px',
                        color: '#34d399',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      BD {Number(p.sellingPrice ?? p.price ?? 0).toFixed(3)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddProductToCart(p);
                      }}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: '#059669',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#ffffff',
                        fontWeight: 900,
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <Plus size={14} />
                      <span>ADD</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sticky Modal Footer */}
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#0b1120',
              borderTop: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Current Cart</div>
              <div style={{ fontSize: '13px', fontWeight: 900, color: '#ffffff', fontFamily: 'monospace' }}>
                {cartItems.length} items • <span style={{ color: '#34d399' }}>BD {finalTotal.toFixed(3)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsProductSearchOpen(false);
                setProductSearchQuery('');
              }}
              style={{
                padding: '10px 16px',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                border: 'none',
                borderRadius: '10px',
                color: '#ffffff',
                fontWeight: 900,
                fontSize: '12px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.4)'
              }}
            >
              DONE / RETURN TO POS →
            </button>
          </div>
        </div>
      )}

      {/* --- MODAL 2: CUSTOMER SEARCH OVERLAY MODAL --- */}
      {isSearchingCustomer && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
            zIndex: 50,
            backgroundColor: 'rgba(9, 13, 22, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            padding: '14px',
            boxSizing: 'border-box'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid #1e293b' }}>
            <h3 style={{ margin: 0, fontWeight: 900, fontSize: '14px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Search size={15} color="#60a5fa" />
              <span>Select Khata Customer</span>
            </h3>
            <button
              type="button"
              onClick={() => setIsSearchingCustomer(false)}
              style={{
                padding: '4px',
                borderRadius: '6px',
                backgroundColor: '#1e293b',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer'
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ padding: '10px 0' }}>
            <input
              type="text"
              autoFocus
              placeholder="Type name, phone, or CPR..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                backgroundColor: '#0f172a',
                border: '1.5px solid #3b82f6',
                borderRadius: '10px',
                color: '#ffffff',
                fontSize: '12px',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredCustomers.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                No matching customer found
              </div>
            ) : (
              filteredCustomers.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    setSelectedCustomer(c);
                    setIsMessCheckout(Boolean(c.isMess || c.messGroup));
                    setIsSearchingCustomer(false);
                    playNfcChime();
                  }}
                  style={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900, fontSize: '13px', color: '#ffffff' }}>{c.name}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                      Phone: {c.phone || 'N/A'} • CPR: {c.cpr || 'N/A'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontFamily: 'monospace', fontWeight: 900, color: '#fbbf24' }}>
                      BD {Number(c.currentBalance ?? c.balance ?? 0).toFixed(3)}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      Limit: BD {Number(c.creditLimit ?? c.credit_limit ?? 30.0).toFixed(0)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* --- MODAL 3: CASH TENDER MODAL --- */}
      {isCashModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
            zIndex: 50,
            backgroundColor: 'rgba(9, 13, 22, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            boxSizing: 'border-box'
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '320px',
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '14px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '8px' }}>
              <h4 style={{ margin: 0, fontWeight: 900, fontSize: '14px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Banknote size={16} color="#34d399" />
                <span>Cash Payment</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsCashModalOpen(false)}
                style={{ padding: '4px', borderRadius: '6px', backgroundColor: '#1e293b', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>TOTAL DUE</div>
              <div style={{ fontSize: '26px', fontWeight: 900, fontFamily: 'monospace', color: '#34d399' }}>
                BD {finalTotal.toFixed(3)}
              </div>
            </div>

            {/* Quick Bill Chips */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {[
                { label: 'Exact', amt: finalTotal },
                { label: 'BD 1', amt: 1.0 },
                { label: 'BD 5', amt: 5.0 },
                { label: 'BD 10', amt: 10.0 },
                { label: 'BD 20', amt: 20.0 }
              ]
                .filter((b) => b.amt >= finalTotal)
                .slice(0, 4)
                .map((b, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleExecuteCheckout('CASH', b.amt)}
                    style={{
                      padding: '8px 4px',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontFamily: 'monospace',
                      fontWeight: 800,
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    {b.label}
                  </button>
                ))}
            </div>

            <button
              type="button"
              onClick={() => handleExecuteCheckout('CASH', finalTotal)}
              style={{
                width: '100%',
                padding: '11px',
                backgroundColor: '#059669',
                border: 'none',
                borderRadius: '10px',
                color: '#ffffff',
                fontWeight: 900,
                fontSize: '12px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(5, 150, 105, 0.35)'
              }}
            >
              EXACT CASH (BD {finalTotal.toFixed(3)})
            </button>
          </div>
        </div>
      )}

      {/* --- MODAL 4: BENEFITPAY FAWRI+ QR MODAL --- */}
      {isBenefitModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
            zIndex: 50,
            backgroundColor: 'rgba(9, 13, 22, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            boxSizing: 'border-box'
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '280px',
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '14px',
              padding: '16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '8px' }}>
              <span style={{ fontWeight: 900, fontSize: '12px', color: '#fb7185', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Zap size={14} /> BenefitPay Fawri+
              </span>
              <button
                type="button"
                onClick={() => setIsBenefitModalOpen(false)}
                style={{ padding: '4px', borderRadius: '6px', backgroundColor: '#1e293b', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={15} />
              </button>
            </div>

            {benefitQrUrl && (
              <div style={{ padding: '8px', backgroundColor: '#ffffff', borderRadius: '10px', display: 'inline-block', margin: '0 auto' }}>
                <img src={benefitQrUrl} alt="BenefitPay QR" style={{ width: '190px', height: '190px', display: 'block' }} />
              </div>
            )}

            <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
              Total: <strong style={{ fontFamily: 'monospace', color: '#34d399', fontSize: '14px' }}>BD {finalTotal.toFixed(3)}</strong>
            </div>

            <button
              type="button"
              onClick={() => handleExecuteCheckout('BENEFIT_PAY')}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#e11d48',
                border: 'none',
                borderRadius: '10px',
                color: '#ffffff',
                fontWeight: 900,
                fontSize: '12px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(225, 29, 72, 0.35)'
              }}
            >
              CONFIRM BENEFITPAY PAYMENT
            </button>
          </div>
        </div>
      )}

      {/* --- MODAL 5: HARD CREDIT LIMIT MANAGER PIN MODAL --- */}
      {isOverLimitModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
            zIndex: 50,
            backgroundColor: 'rgba(9, 13, 22, 0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            boxSizing: 'border-box'
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '280px',
              backgroundColor: '#0f172a',
              border: '1.5px solid #f59e0b',
              borderRadius: '14px',
              padding: '16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 8px 24px rgba(245, 158, 11, 0.25)'
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#fbbf24',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto'
              }}
            >
              <ShieldAlert size={22} />
            </div>

            <div>
              <h4 style={{ margin: 0, fontWeight: 900, fontSize: '14px', color: '#ffffff' }}>Credit Limit Exceeded!</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#94a3b8' }}>
                Customer limit is BD {Number(selectedCustomer?.creditLimit ?? 30).toFixed(3)}.
                Total balance will be BD {(Number(selectedCustomer?.currentBalance ?? 0) + finalTotal).toFixed(3)}.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <input
                type="password"
                maxLength={4}
                autoFocus
                placeholder="Manager PIN (9999)"
                value={managerPinInput}
                onChange={(e) => {
                  setManagerPinInput(e.target.value);
                  setManagerPinError(false);
                }}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px',
                  textAlign: 'center',
                  backgroundColor: '#1e293b',
                  border: managerPinError ? '1.5px solid #ef4444' : '1.5px solid #f59e0b',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontFamily: 'monospace',
                  fontSize: '18px',
                  letterSpacing: '4px',
                  outline: 'none'
                }}
              />
              {managerPinError && (
                <div style={{ fontSize: '10px', color: '#f87171', fontWeight: 800 }}>Incorrect PIN</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setIsOverLimitModalOpen(false)}
                style={{
                  flex: 1,
                  padding: '9px',
                  backgroundColor: '#1e293b',
                  border: 'none',
                  color: '#94a3b8',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleManagerPinSubmit}
                style={{
                  flex: 1,
                  padding: '9px',
                  backgroundColor: '#f59e0b',
                  border: 'none',
                  color: '#090d16',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 900,
                  cursor: 'pointer'
                }}
              >
                Authorize
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 4B: KHATA DEBT COLLECTION / SETTLEMENT MODAL --- */}
      {isSettleModalOpen && selectedCustomer && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 60,
            backgroundColor: 'rgba(9, 13, 22, 0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            boxSizing: 'border-box'
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '340px',
              backgroundColor: '#0f172a',
              border: '1.5px solid #059669',
              borderRadius: '16px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 8px 30px rgba(5, 150, 105, 0.3)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: 'rgba(5, 150, 105, 0.2)', color: '#34d399' }}>
                  <Banknote size={18} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontWeight: 900, fontSize: '14px', color: '#ffffff' }}>Collect Payment</h4>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>{selectedCustomer.name}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSettleModalOpen(false)}
                style={{ padding: '4px', backgroundColor: '#1e293b', border: 'none', borderRadius: '6px', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Current Outstanding Debt Callout */}
            <div style={{ padding: '10px 12px', backgroundColor: '#1e293b', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Outstanding Debt:</span>
              <span style={{ fontSize: '14px', fontWeight: 900, fontFamily: 'monospace', color: '#fbbf24' }}>
                BD {Number(selectedCustomer.currentBalance ?? selectedCustomer.balance ?? 0).toFixed(3)}
              </span>
            </div>

            {/* Settle Amount Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Amount Tendered (BD)</label>
              <input
                type="number"
                step="0.050"
                min="0.100"
                autoFocus
                placeholder="0.000"
                value={settleAmount}
                onChange={(e) => setSettleAmount(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px',
                  backgroundColor: '#1e293b',
                  border: '1.5px solid #059669',
                  borderRadius: '10px',
                  color: '#ffffff',
                  fontSize: '18px',
                  fontFamily: 'monospace',
                  fontWeight: 900,
                  outline: 'none',
                  textAlign: 'center'
                }}
              />
            </div>

            {/* Quick Amount Suggestion Chips */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {[1, 5, 10].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setSettleAmount(amt.toFixed(3))}
                  style={{
                    flex: 1,
                    padding: '5px',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#e2e8f0',
                    fontSize: '10px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  +{amt} BD
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSettleAmount(Number(selectedCustomer.currentBalance ?? selectedCustomer.balance ?? 0).toFixed(3))}
                style={{
                  flex: 1.2,
                  padding: '5px',
                  backgroundColor: 'rgba(5, 150, 105, 0.2)',
                  border: '1px solid #059669',
                  borderRadius: '6px',
                  color: '#34d399',
                  fontSize: '10px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Clear All
              </button>
            </div>

            {/* Payment Method Selector */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setSettleMethod('CASH')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  border: settleMethod === 'CASH' ? '1.5px solid #059669' : '1px solid #334155',
                  backgroundColor: settleMethod === 'CASH' ? 'rgba(5, 150, 105, 0.2)' : '#1e293b',
                  color: settleMethod === 'CASH' ? '#34d399' : '#94a3b8',
                  fontSize: '11px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                }}
              >
                <Banknote size={14} />
                <span>CASH</span>
              </button>
              <button
                type="button"
                onClick={() => setSettleMethod('BENEFIT_PAY')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  border: settleMethod === 'BENEFIT_PAY' ? '1.5px solid #ef4444' : '1px solid #334155',
                  backgroundColor: settleMethod === 'BENEFIT_PAY' ? 'rgba(239, 68, 68, 0.2)' : '#1e293b',
                  color: settleMethod === 'BENEFIT_PAY' ? '#f87171' : '#94a3b8',
                  fontSize: '11px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                }}
              >
                <Zap size={14} />
                <span>BENEFITPAY</span>
              </button>
            </div>

            {/* Confirm Settle Button */}
            <button
              type="button"
              disabled={isSettling || !settleAmount || parseFloat(settleAmount) <= 0}
              onClick={handleConfirmSettle}
              style={{
                width: '100%',
                padding: '11px',
                background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
                border: 'none',
                borderRadius: '10px',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 900,
                cursor: isSettling ? 'wait' : 'pointer',
                opacity: (!settleAmount || parseFloat(settleAmount) <= 0) ? 0.5 : 1,
                boxShadow: '0 4px 12px rgba(5, 150, 105, 0.4)'
              }}
            >
              {isSettling ? 'Recording Settle...' : `CONFIRM PAYMENT (BD ${settleAmount || '0.000'})`}
            </button>
          </div>
        </div>
      )}

      {/* --- MODAL 4C: WEB CAMERA BARCODE SCANNER MODAL (FOR MOBILE PHONES ON WEB) --- */}
      {isWebCameraOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 60,
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 70 }}>
            <button
              type="button"
              onClick={stopWebCamera}
              style={{
                padding: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                borderRadius: '50%',
                color: '#ffffff',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>
          </div>

          <div style={{ position: 'relative', width: '100%', maxWidth: '360px', aspectRatio: '4/3', overflow: 'hidden', borderRadius: '16px', border: '2px solid #059669' }}>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {/* Viewfinder Reticle */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '75%',
                height: '40%',
                border: '2px dashed #34d399',
                borderRadius: '8px',
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
                pointerEvents: 'none'
              }}
            />
          </div>

          <div style={{ marginTop: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
            Center barcode within green reticle to scan
          </div>
        </div>
      )}

      {/* --- DRAWER 6: RECENT SALES & REPRINT DRAWER --- */}
      {showHistoryDrawer && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
            zIndex: 50,
            backgroundColor: 'rgba(9, 13, 22, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            padding: '14px',
            boxSizing: 'border-box'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid #1e293b' }}>
            <h3 style={{ margin: 0, fontWeight: 900, fontSize: '14px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <History size={16} color="#fbbf24" />
              <span>Terminal 02 Recent Sales</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowHistoryDrawer(false)}
              style={{ padding: '4px', borderRadius: '6px', backgroundColor: '#1e293b', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 0' }}>
            {recentSales.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                No sales recorded in this session
              </div>
            ) : (
              recentSales.map((s, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900, fontSize: '12px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{s.invoiceNo}</span>
                      <span style={{ fontSize: '10px', padding: '2px 5px', borderRadius: '4px', backgroundColor: '#1e293b', color: '#94a3b8', fontFamily: 'monospace' }}>
                        {s.paymentType}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {s.customerName} • {s.time}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 900, fontSize: '12px', color: '#34d399' }}>
                      BD {Number(s.total || 0).toFixed(3)}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        printFullReceipt({
                          invoiceNo: s.invoiceNo,
                          items: s.items || [],
                          subtotal: s.subtotal || 0,
                          vat: s.vat || 0,
                          total: s.total || 0,
                          paymentMode: s.paymentType,
                          customerName: s.customerName,
                          previousBalance: s.oldBalance,
                          newBalance: s.newBalance,
                          cashierName: 'Terminal 02 (F100)'
                        }).catch(console.warn);
                        showBanner(`Reprinted ${s.invoiceNo}`, 'info');
                      }}
                      style={{
                        padding: '6px',
                        backgroundColor: '#1e293b',
                        border: 'none',
                        color: '#cbd5e1',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Reprint 58mm slip"
                    >
                      <Printer size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
