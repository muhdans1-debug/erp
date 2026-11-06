import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Camera as CameraIcon,
  Barcode as BarcodeIcon,
  Package,
  Coins,
  Percent,
  Truck,
  Building2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Scale,
  Mail,
  Phone,
  ChevronDown,
  ChevronUp,
  Sparkles,
  X,
  Plus,
  Minus,
  Layers,
  ShieldCheck,
  Tag,
  Database,
  Wifi,
  WifiOff,
  History,
  Settings,
  HardDrive,
  Printer as PrinterIcon,
  ScanLine,
  Keyboard,
  Lock,
  Unlock
} from 'lucide-react';
import { useF100Database } from './hooks/useF100Database';
import { SunmiPrinter, printF100ShelfTag } from './utils/printer';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { dataUrlToFile, compressImageFile } from './utils/imageCompressor';

/**
 * Feitian F100 Modern PIM & Stock Intake Terminal
 * Professional, thumb-friendly ergonomic layout tailored for high-speed warehouse data entry.
 * Powered by persistent offline-first native SQLite storage and Fastify automated sync.
 */

const DEFAULT_CATEGORIES = [
  'GROCERY',
  'DAIRY',
  'BEVERAGES',
  'SNACKS',
  'PRODUCE',
  'BAKERY',
  'FROZEN',
  'HOUSEHOLD',
  'PERSONAL CARE',
  'TOBACCO',
  'ESSENTIALS'
];

export default function F100Pim() {
  const initialFormState = {
    id: '',
    barcode: '',
    name: '',
    sellingPrice: '',
    purchasePrice: '',
    unitCost: '',
    currentStock: 0,
    intakeQty: 1,
    stockMode: 'ADD', // 'ADD' = Receive Delivery (+), 'SET' = Shelf Count Override (=)
    category: 'GROCERY',
    distributorId: '',
    supplierName: '',
    supplierEmail: '',
    vatRate: 10,
    is_weighed_item: false,
    minThreshold: 20,
    maxThreshold: 100,
    reason: 'F100 Handheld Stock Intake',
    image: null,
    imagePath: null,
    imageFormat: null
  };

  const [product, setProduct] = useState(initialFormState);
  const [existingProduct, setExistingProduct] = useState(null);
  const [isNewProduct, setIsNewProduct] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [distributors, setDistributors] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showServerModal, setShowServerModal] = useState(false);
  const [recentScans, setRecentScans] = useState([]);
  const [serverUrlInput, setServerUrlInput] = useState(() => {
    const saved = localStorage.getItem('master_server_url');
    if (!saved || saved.includes('192.168.8.20')) {
      try { localStorage.setItem('master_server_url', 'http://192.168.8.7:3000'); } catch { }
      return 'http://192.168.8.7:3000';
    }
    return saved;
  });
  const [isDecodingBarcode, setIsDecodingBarcode] = useState(false);
  const [isManualBarcodeEntry, setIsManualBarcodeEntry] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(() => {
    try {
      return localStorage.getItem('f100_auto_print') === 'true';
    } catch {
      return false;
    }
  });

  // Native SQLite / Local-First Database Hook
  const {
    isReady: isDbReady,
    isNative: isNativeSqlite,
    unsyncedCount,
    saveIntakeItem,
    getPendingItems,
    markItemsSynced,
    refreshUnsyncedCount,
    getRecentHistory
  } = useF100Database();

  const fileInputRef = useRef(null);
  const barcodeCameraInputRef = useRef(null);
  const barcodeBufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const barcodeInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const priceInputRef = useRef(null);
  const costInputRef = useRef(null);
  const qtyInputRef = useRef(null);

  // Seamless auto-focus chaining helper with text selection and smooth keyboard scroll
  const focusAndSelect = useCallback((ref, delay = 60) => {
    setTimeout(() => {
      if (ref && ref.current) {
        ref.current.focus();
        if (typeof ref.current.select === 'function') {
          try {
            ref.current.select();
          } catch { }
        }
        try {
          ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch { }
      }
    }, delay);
  }, []);

  // 'Sticky' Context Locks for Bulk Unpacking Mode (Retains Supplier, Category, or Cost)
  const [stickyLocks, setStickyLocks] = useState({
    category: false,
    supplier: false,
    cost: false
  });
  const stickyLocksRef = useRef(stickyLocks);
  useEffect(() => {
    stickyLocksRef.current = stickyLocks;
  }, [stickyLocks]);

  const toggleLock = (field) => {
    triggerHaptic(40);
    setStickyLocks((prev) => {
      const next = !prev[field];
      const updated = { ...prev, [field]: next };
      showToast(
        next ? `🔒 ${field.toUpperCase()} locked for bulk intake` : `🔓 ${field.toUpperCase()} unlocked`,
        'info'
      );
      return updated;
    });
  };

  const hasActiveLocks = stickyLocks.category || stickyLocks.supplier || stickyLocks.cost;

  // Sub-0.1s Zero-Latency UX Reset Loop with Sticky Context Locks
  const resetFormToDefaults = () => {
    const locks = stickyLocksRef.current;
    setProduct((prev) => ({
      ...initialFormState,
      category: locks.category ? prev.category : initialFormState.category,
      distributorId: locks.supplier ? prev.distributorId : initialFormState.distributorId,
      supplierName: locks.supplier ? prev.supplierName : initialFormState.supplierName,
      supplierEmail: locks.supplier ? prev.supplierEmail : initialFormState.supplierEmail,
      purchasePrice: locks.cost ? prev.purchasePrice : initialFormState.purchasePrice,
      unitCost: locks.cost ? prev.unitCost : initialFormState.unitCost,
      intakeQty: 1
    }));
    setExistingProduct(null);
    setIsNewProduct(true);
    focusAndSelect(barcodeInputRef, 60);
  };

  // Trigger haptic vibration pulse on F100 / Android
  const triggerHaptic = (duration = 40) => {
    try {
      if (window.navigator?.vibrate) {
        window.navigator.vibrate(duration);
      }
    } catch { }
  };

  const showToast = (msg, type = 'success') => {
    setFeedbackToast({ msg, type });
    setTimeout(() => setFeedbackToast(null), 2500);
  };

  // Dynamic API Base resolution (Defaults to Supermarket Back Office Laptop 192.168.8.7:3000)
  const getApiBase = () => {
    if (typeof window === 'undefined') return 'http://192.168.8.7:3000';
    const custom = localStorage.getItem('master_server_url');
    if (custom && !custom.includes('192.168.8.20')) return custom;
    try { localStorage.setItem('master_server_url', 'http://192.168.8.7:3000'); } catch { }
    const isNative = Boolean(window.Capacitor?.isNativePlatform?.());
    if (isNative) return 'http://192.168.8.7:3000';
    const host = window.location.hostname || '192.168.8.7';
    return `http://${host}:3000`;
  };

  // Unlock root/body scrolling for F100 PIM while preserving Sunmi POS locks on exit
  useEffect(() => {
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyOverflow = document.body.style.overflow;
    const rootEl = document.getElementById('root');
    const originalRootOverflow = rootEl ? rootEl.style.overflow : '';
    const originalRootHeight = rootEl ? rootEl.style.height : '';

    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'auto';
    if (rootEl) {
      rootEl.style.overflow = 'auto';
      rootEl.style.height = '100%';
    }

    return () => {
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overflow = originalBodyOverflow;
      if (rootEl) {
        rootEl.style.overflow = originalRootOverflow;
        rootEl.style.height = originalRootHeight;
      }
    };
  }, []);

  // Fetch Distributors list on mount
  useEffect(() => {
    const apiBase = getApiBase();
    fetch(`${apiBase}/api/distributors`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setDistributors(data);
          try {
            localStorage.setItem('f100_cached_distributors', JSON.stringify(data));
          } catch { }
        }
      })
      .catch(() => {
        try {
          const cached = localStorage.getItem('f100_cached_distributors');
          if (cached) setDistributors(JSON.parse(cached));
        } catch { }
      });
  }, []);

  // Lookup product in database or cache when barcode changes
  const lookupBarcode = async (scannedCode) => {
    const code = (scannedCode || '').trim();
    if (!code || code.length < 3) return;

    const apiBase = getApiBase();
    try {
      let found = null;
      // 1. Direct barcode endpoint lookup (Fastest & exact)
      try {
        const directRes = await fetch(`${apiBase}/api/products/barcode/${encodeURIComponent(code)}`);
        if (directRes.ok) {
          found = await directRes.json();
        }
      } catch { }

      // 2. Fallback search query
      if (!found) {
        const res = await fetch(`${apiBase}/api/products/search?q=${encodeURIComponent(code)}`);
        if (res.ok) {
          const results = await res.json();
          found = Array.isArray(results)
            ? results.find((p) => (p.barcode || '').trim().toLowerCase() === code.toLowerCase() || (p.id || '').trim().toLowerCase() === code.toLowerCase()) || results[0]
            : null;
        }
      }

      if (found) {
        setExistingProduct(found);
        setIsNewProduct(false);
        const currentCost = found.purchasePrice ?? found.unitCost ?? 0;
        const locks = stickyLocksRef.current;
        setProduct((prev) => ({
          ...prev,
          id: found.id || prev.id,
          barcode: found.barcode || code,
          name: found.name || prev.name,
          sellingPrice: found.sellingPrice !== undefined ? String(found.sellingPrice) : prev.sellingPrice,
          purchasePrice: locks.cost && prev.purchasePrice ? prev.purchasePrice : (currentCost > 0 ? String(currentCost) : prev.purchasePrice),
          unitCost: locks.cost && prev.unitCost ? prev.unitCost : (currentCost > 0 ? String(currentCost) : prev.unitCost),
          currentStock: Number(found.stockQuantity) || 0,
          intakeQty: 1,
          stockMode: 'ADD',
          category: locks.category && prev.category ? prev.category : (found.category || prev.category || 'GROCERY'),
          distributorId: locks.supplier && prev.distributorId ? prev.distributorId : (found.distributorId || prev.distributorId || ''),
          supplierName: locks.supplier && prev.supplierName ? prev.supplierName : (found.supplierName || found.distributor?.name || prev.supplierName || ''),
          supplierEmail: locks.supplier && prev.supplierEmail ? prev.supplierEmail : (found.supplierEmail || found.distributor?.contactEmail || prev.supplierEmail || ''),
          vatRate: found.vatRate !== undefined ? Number(found.vatRate) : 10,
          is_weighed_item: Boolean(found.is_weighed_item),
          minThreshold: found.minThreshold !== undefined ? Number(found.minThreshold) : 20,
          maxThreshold: found.maxThreshold !== undefined ? Number(found.maxThreshold) : 100
        }));
        showToast(`⚡ Restock Mode: "${found.name}" (Stock: ${found.stockQuantity || 0})`, 'info');
        triggerHaptic(70);
        // TRACK A: Existing Product Restock Workflow -> Jump directly past name and pricing, straight to Quantity
        focusAndSelect(qtyInputRef, 100);
        return;
      }
    } catch { }

    // TRACK B: Brand New Onboarding Workflow
    setExistingProduct(null);
    setIsNewProduct(true);
    setProduct((prev) => ({ ...prev, barcode: code }));
    showToast(`✨ New Catalog Onboarding: ${code}`, 'info');
    // Start the chain at the Product Name
    focusAndSelect(nameInputRef, 100);
  };

  // Direct Barcode Scan Result Callback
  const handleDirectBarcodeScan = (scannedCode) => {
    const code = (scannedCode || '').trim();
    if (!code) return;
    setProduct((p) => ({ ...p, barcode: code }));
    triggerHaptic(80);
    showToast(`✓ Scanned: ${code}`, 'success');
    lookupBarcode(code);
  };

  // Ultra-Fast Zero-Crash Native Android ML Kit Barcode Scanner
  const handleDirectBarcodeCamera = async () => {
    try {
      triggerHaptic(40);

      const isNative = Boolean(window.Capacitor?.isNativePlatform?.());

      if (isNative) {
        // Method 1: Google Code Scanner (Native Android UI with autofocus, flash & reticle)
        try {
          showToast('📷 Opening barcode scanner...', 'info');
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
            handleDirectBarcodeScan(barcodes[0].rawValue.trim());
            return;
          }
        } catch (scanErr) {
          if (scanErr.message && (scanErr.message.includes('User cancelled') || scanErr.message.includes('canceled') || scanErr.message.includes('cancel'))) {
            return;
          }
          console.warn('Google Code Scanner fallback to native MLKit file decoding:', scanErr);
        }

        // Method 2: Native Android ML Kit image decoding directly from file path (Zero WebView Canvas)
        showToast('📷 Snapping barcode...', 'info');
        const photo = await Camera.getPhoto({
          quality: 85,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Camera,
          width: 1000
        });

        if (photo && photo.path) {
          setIsDecodingBarcode(true);
          showToast('🔍 Analyzing barcode...', 'info');

          const { barcodes } = await BarcodeScanner.readBarcodesFromImage({
            path: photo.path,
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
            handleDirectBarcodeScan(barcodes[0].rawValue.trim());
            return;
          } else {
            showToast('⚠️ No barcode found in photo. Please point closer.', 'error');
          }
        }
      } else {
        // Web fallback (Browser development)
        setIsManualBarcodeEntry(true);
        showToast('⌨️ In browser mode. Enter barcode manually.', 'info');
      }
    } catch (err) {
      if (err.message && (err.message.includes('User cancelled') || err.message.includes('canceled') || err.message.includes('cancel'))) {
        return;
      }
      console.warn('Barcode decoding notice:', err);
      showToast('⚠️ Could not read barcode. Please type manually.', 'error');
    } finally {
      setIsDecodingBarcode(false);
    }
  };

  // Hardware Laser Scanner & Physical Volume Keys Listener for Feitian F100
  useEffect(() => {
    const handleKeyDown = (e) => {
      // 1. Feitian F100 Physical Hardware Volume Rocker Keys (One-Handed Quantity Hook)
      // Volume Up: keyCode 24, key: 'VolumeUp'
      if (e.keyCode === 24 || e.key === 'VolumeUp' || e.code === 'VolumeUp') {
        e.preventDefault();
        e.stopPropagation();
        triggerHaptic(35);
        setProduct((prev) => {
          const nextQty = (Number(prev.intakeQty) || 0) + 1;
          showToast(`📦 Qty: ${nextQty}`, 'info');
          return { ...prev, intakeQty: nextQty };
        });
        return;
      }
      // Volume Down: keyCode 25, key: 'VolumeDown'
      if (e.keyCode === 25 || e.key === 'VolumeDown' || e.code === 'VolumeDown') {
        e.preventDefault();
        e.stopPropagation();
        triggerHaptic(35);
        setProduct((prev) => {
          const nextQty = Math.max(1, (Number(prev.intakeQty) || 1) - 1);
          showToast(`📦 Qty: ${nextQty}`, 'info');
          return { ...prev, intakeQty: nextQty };
        });
        return;
      }

      const activeTag = document.activeElement?.tagName;
      const activeType = document.activeElement?.getAttribute('type');

      // Allow typing in text inputs without hijacking
      if (activeTag === 'INPUT' && activeType !== 'hidden' && document.activeElement?.name !== 'barcode') {
        if (e.key === 'Enter' && barcodeBufferRef.current.length > 3) {
          const code = barcodeBufferRef.current.trim();
          setProduct((p) => ({ ...p, barcode: code }));
          barcodeBufferRef.current = '';
          lookupBarcode(code);
        }
        return;
      }

      const now = Date.now();
      if (now - lastKeyTimeRef.current > 70) {
        barcodeBufferRef.current = '';
      }
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (barcodeBufferRef.current.length > 2) {
          const code = barcodeBufferRef.current.trim();
          setProduct((p) => ({ ...p, barcode: code }));
          triggerHaptic();
          barcodeBufferRef.current = '';
          lookupBarcode(code);
        }
      } else if (e.key.length === 1) {
        barcodeBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Live Profit Margin Calculation
  const marginStats = useMemo(() => {
    const sell = parseFloat(product.sellingPrice) || 0;
    const cost = parseFloat(product.purchasePrice || product.unitCost) || 0;
    if (sell <= 0) return { margin: 0, profit: 0, status: 'empty' };
    const profit = sell - cost;
    const margin = (profit / sell) * 100;
    return {
      margin: margin.toFixed(1),
      profit: profit.toFixed(3),
      status: profit < 0 ? 'loss' : margin >= 15 ? 'healthy' : 'low'
    };
  }, [product.sellingPrice, product.purchasePrice, product.unitCost]);

  // Calculated Final Stock Quantity based on mode
  const finalStockCalculated = useMemo(() => {
    const intake = Number(product.intakeQty) || 0;
    if (product.stockMode === 'ADD') {
      return (Number(product.currentStock) || 0) + intake;
    }
    return intake;
  }, [product.currentStock, product.intakeQty, product.stockMode]);

  // Selected distributor info
  const selectedDistributorInfo = useMemo(() => {
    if (!product.distributorId) return null;
    return distributors.find((d) => d.id === product.distributorId) || null;
  }, [product.distributorId, distributors]);

  // Handle Photo Capture (Safe native Android Camera writing directly to disk - Zero JS heap fragmentation)
  const handlePhotoSelect = async () => {
    try {
      showToast('📷 Opening camera...', 'info');
      const photo = await Camera.getPhoto({
        quality: 70,
        allowEditing: false,
        source: CameraSource.Camera,
        // 🟢 THE FIX: Never use DataUrl. Use Uri to keep the image out of JS memory.
        resultType: CameraResultType.Uri,
        width: 800
      });

      // photo.webPath is a direct bridge to the local file system. 
      // The WebView can render this natively without bloat.
      const localPath = photo.webPath || photo.path;
      if (localPath) {
        setProduct((prev) => ({
          ...prev,
          image: localPath,
          imagePath: localPath,
          imageFormat: photo.format
        }));
        triggerHaptic(40);
        showToast('📷 Photo Attached', 'success');
      }
    } catch (err) {
      if (err.message && (err.message.includes('User cancelled') || err.message.includes('canceled'))) {
        return;
      }
      console.warn('Native camera capture fallback:', err);
      fileInputRef.current?.click();
    }
  };

  // Convert local file URI into a Blob just in time and stream via FormData
  const uploadProductPhoto = async (imagePath, barcode) => {
    if (!imagePath) return null;
    try {
      const apiBase = getApiBase();
      // Read the file directly from disk into a Blob
      const response = await fetch(imagePath);
      const imageBlob = await response.blob();

      // Stream it via FormData rather than JSON
      const formData = new FormData();
      formData.append('file', imageBlob, `product_${barcode || Date.now()}.jpg`);
      formData.append('barcode', barcode || product.barcode || '');

      const uploadRes = await fetch(`${apiBase}/api/products/upload-photo`, {
        method: 'POST',
        body: formData
      });

      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        return uploadData.url || null;
      }
    } catch (uploadErr) {
      console.warn('📸 Product photo upload error:', uploadErr);
    }
    return null;
  };

  // Batch Push Sync Engine: reads unsynced rows from local SQLite and flushes to Laptop Master
  const runSyncPush = useCallback(
    async (isManual = false) => {
      if (isSyncing) return;
      setIsSyncing(true);

      try {
        const pending = await getPendingItems();
        if (!pending || pending.length === 0) {
          if (isManual) showToast('ℹ️ All scans are synced to Laptop', 'info');
          setIsSyncing(false);
          return;
        }

        const apiBase = getApiBase();
        const batch = pending.map((item) => {
          let parsedPayload = {};
          try {
            parsedPayload = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload;
          } catch {
            parsedPayload = {};
          }
          return {
            local_id: item.id,
            barcode: item.barcode,
            data: parsedPayload,
            image: item.image_base64
          };
        });

        // Stream any local photo URIs to Master server via FormData rather than JSON
        for (const b of batch) {
          if (b.image && typeof b.image === 'string' && (b.image.startsWith('http://localhost/_capacitor_file_') || b.image.startsWith('file://') || b.image.startsWith('blob:') || b.image.startsWith('capacitor://'))) {
            try {
              const uploadedUrl = await uploadProductPhoto(b.image, b.barcode);
              if (uploadedUrl) {
                b.image = uploadedUrl;
                if (b.data) b.data.imageUrl = uploadedUrl;
              }
            } catch (upErr) {
              console.warn('📸 Photo stream upload skipped:', upErr);
            }
          }
        }

        let isSynced = false;

        // Protocol 1: Native Fastify Batch Push (/api/sync/pim-push)
        try {
          const c1 = new AbortController();
          const t1 = setTimeout(() => c1.abort(), 4000);
          const res = await fetch(`${apiBase}/api/sync/pim-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batch }),
            signal: c1.signal
          });
          clearTimeout(t1);

          if (res.ok) {
            const data = await res.json();
            const syncedIds = data.syncedIds || pending.map((i) => i.id);
            await markItemsSynced(syncedIds);
            isSynced = true;
            if (isManual) {
              showToast(`🎉 Synced ${syncedIds.length} items to Back Office!`, 'success');
            }
          }
        } catch (e) {
          // Fall through to Protocol 2
        }

        // Protocol 2: Fallback to Universal /api/products/bulk-upsert
        if (!isSynced) {
          try {
            const c2 = new AbortController();
            const t2 = setTimeout(() => c2.abort(), 6000);
            const upsertPayload = {
              products: batch.map((b) => ({
                id: (b.data.id && typeof b.data.id === 'string' && b.data.id.startsWith('f100_')) ? b.data.id : (b.data.id || b.barcode || b.local_id),
                barcode: b.barcode,
                name: b.data.name || 'Product',
                category: b.data.category || 'GROCERY',
                purchasePrice: Number(b.data.purchasePrice || b.data.unitCost || 0),
                unitCost: Number(b.data.unitCost || b.data.purchasePrice || 0),
                sellingPrice: Number(b.data.sellingPrice || b.data.price || 0),
                stockQuantity: Number(b.data.stockQuantity ?? b.data.intakeQty ?? 1),
                minThreshold: Number(b.data.minThreshold || 20),
                maxThreshold: Number(b.data.maxThreshold || 100),
                supplierName: b.data.supplierName || 'Local Distributor',
                supplierEmail: b.data.supplierEmail || 'supplier@askar.bh',
                distributorId: b.data.distributorId || null,
                taxRate: Number(b.data.taxRate || ((b.data.vatRate ?? 10) / 100)),
                vatRate: Number(b.data.vatRate ?? 10),
                is_weighed_item: b.data.is_weighed_item ? 1 : 0
              }))
            };

            const bulkRes = await fetch(`${apiBase}/api/products/bulk-upsert`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(upsertPayload),
              signal: c2.signal
            });
            clearTimeout(t2);

            if (bulkRes.ok) {
              const allIds = pending.map((i) => i.id);
              await markItemsSynced(allIds);
              isSynced = true;
              if (isManual) {
                showToast(`🎉 Synced ${allIds.length} items to Back Office!`, 'success');
              }
            }
          } catch (bulkErr) { }
        }

        // Protocol 3: Individual Item Universal POST fallback
        if (!isSynced) {
          const syncedIds = [];
          for (const item of pending) {
            try {
              const payload = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload;
              const endpoint = `${apiBase}/api/products`;
              const c3 = new AbortController();
              const t3 = setTimeout(() => c3.abort(), 3000);
              const singleRes = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: c3.signal
              });
              clearTimeout(t3);
              if (singleRes.ok) {
                syncedIds.push(item.id);
              }
            } catch { }
          }

          if (syncedIds.length > 0) {
            await markItemsSynced(syncedIds);
            isSynced = true;
            if (isManual) {
              showToast(`🎉 Synced ${syncedIds.length} items to Back Office!`, 'success');
            }
          }
        }

        if (!isSynced && isManual) {
          showToast(`⚠️ Cannot reach Back Office at ${apiBase.replace(/^https?:\/\//, '')}. Check Wi-Fi & PC.`, 'error');
        }
      } catch (err) {
        if (isManual) {
          showToast('⚠️ Wi-Fi unreachable. Scans are safe in local SQLite.', 'error');
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [getPendingItems, markItemsSynced, isSyncing]
  );

  // Automated background sync loop every 10 seconds
  useEffect(() => {
    if (!isDbReady) return;
    const interval = setInterval(() => {
      if (navigator.onLine && !isSyncing) {
        runSyncPush(false);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isDbReady, isSyncing, runSyncPush]);

  // STEP 2: THE ZERO-LATENCY UX RESET LOOP (< 0.1s execution)
  const handleSaveAndNext = async () => {
    if (!product.barcode && !product.name && !product.sellingPrice) {
      showToast('⚠️ Scan or enter barcode/name first', 'error');
      return;
    }

    triggerHaptic(60);

    const costVal = parseFloat(product.purchasePrice || product.unitCost) || 0;
    const priceVal = parseFloat(product.sellingPrice) || 0;
    const finalSupplierName = product.supplierName || selectedDistributorInfo?.name || 'Local Distributor';
    const finalSupplierEmail = product.supplierEmail || selectedDistributorInfo?.contactEmail || 'supplier@askar.bh';

    // Construct full PIM + Stock record
    const itemToSave = {
      id: product.id?.trim() || existingProduct?.id || ('f100_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
      barcode: product.barcode.trim(),
      name: product.name.trim() || `Item ${product.barcode || 'Bulk'}`,
      purchasePrice: costVal,
      unitCost: costVal,
      price: priceVal,
      sellingPrice: priceVal,
      intakeQty: Number(product.intakeQty) || 1,
      stockMode: product.stockMode || 'ADD',
      currentStock: Number(product.currentStock) || 0,
      stockQuantity: finalStockCalculated,
      category: product.category || 'GROCERY',
      distributorId: product.distributorId || null,
      supplierName: finalSupplierName,
      supplierEmail: finalSupplierEmail,
      vatRate: Number(product.vatRate) || 10,
      taxRate: (Number(product.vatRate) || 10) / 100,
      minThreshold: Number(product.minThreshold) || 20,
      maxThreshold: Number(product.maxThreshold) || 100,
      is_weighed_item: Boolean(product.is_weighed_item),
      reason: product.reason || (existingProduct ? 'Stock Intake / Update' : 'New Catalog Onboarding'),
      changedBy: 'F100 Warehouse Staff',
      createdAt: new Date().toISOString(),
      syncStatus: 'PENDING',
      tenantId: 'tenant_askar_01',
      isUpdate: Boolean(existingProduct)
    };

    const imageToPersist = product.imagePath || product.image;

    // =========================================================================
    // INSTANT SUB-0.1s UX RESET (Preserves Sticky Context Locks for Bulk Intake)
    // =========================================================================
    resetFormToDefaults();
    showToast('💾 Saved to Local SQLite! Ready for next scan', 'success');

    // Auto-Focus Chain Reset: prepare for next product
    if (isManualBarcodeEntry) {
      focusAndSelect(barcodeInputRef, 80);
    } else {
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
    }

    // 1. Crash-proof local SQLite persistence
    try {
      await saveIntakeItem({
        barcode: itemToSave.barcode,
        name: itemToSave.name,
        payload: itemToSave,
        imageBase64: imageToPersist
      });
    } catch (saveErr) {
      console.error('Failed to write to local F100 database:', saveErr);
    }

    // 2. Opportunistic immediate push sync if connected
    if (navigator.onLine) {
      setTimeout(() => runSyncPush(false), 80);
    }

    // 3. Physical 58mm Thermal Shelf Tag Auto-Print (Asynchronous Non-Blocking)
    if (autoPrintEnabled) {
      printF100ShelfTag(itemToSave).catch((err) => console.warn('F100 auto-print notice:', err));
    }
  };

  // Manual Trigger to Print 58mm Thermal Shelf Tag
  const handleManualPrint = async () => {
    if (!product.barcode && !product.name && !product.sellingPrice) {
      showToast('⚠️ Scan or enter barcode/name first to print tag', 'error');
      return;
    }
    setIsPrinting(true);
    showToast('🖨️ Printing 58mm Shelf Tag...', 'info');
    triggerHaptic(50);
    try {
      const ok = await printF100ShelfTag(product);
      if (ok) {
        showToast('✅ 58mm Shelf Tag Printed!', 'success');
      } else {
        showToast('⚠️ Printer error: Check paper roll', 'error');
      }
    } catch (err) {
      console.error('F100 print error:', err);
      showToast('⚠️ Printer error: Check paper roll', 'error');
    } finally {
      setIsPrinting(false);
    }
  };

  // Manual Trigger from Header Sync Button
  const handleSyncToLaptop = () => {
    runSyncPush(true);
  };

  // Open Recent Scans History Drawer
  const handleOpenHistory = async () => {
    const list = await getRecentHistory(30);
    setRecentScans(list);
    setShowHistoryModal(true);
  };

  // Keep History Drawer real-time synced with SQLite state
  useEffect(() => {
    if (showHistoryModal) {
      getRecentHistory(30).then((list) => {
        if (Array.isArray(list)) setRecentScans(list);
      });
    }
  }, [showHistoryModal, unsyncedCount, getRecentHistory]);

  return (
    // Fixed viewport container with non-overlapping flex layout (Header, Scroll Zone, Footer Action)
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#f1f5f9',
        zIndex: 20,
        boxSizing: 'border-box',
        overflow: 'hidden',
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      {/* 1. Header & Sync Bar (Pinned Top) */}
      <header
        style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '10px 14px',
          backgroundColor: '#0f172a',
          color: 'white',
          position: 'sticky',
          top: 0,
          zIndex: 60,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem('f100_default_mode');
                } catch { }
                const url = new URL(window.location.href);
                url.searchParams.delete('view');
                if (url.pathname.includes('/f100') || url.pathname.includes('/pim')) {
                  url.pathname = '/';
                }
                window.location.href = url.toString();
              }}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#e2e8f0',
                fontSize: '12px',
                fontWeight: 700,
                padding: '6px 10px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              ← POS
            </button>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '15px', fontWeight: 900, letterSpacing: '-0.3px', color: '#ffffff' }}>
                  F100 Inventory
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: '6px',
                    backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: isOnline ? '#34d399' : '#f87171',
                    border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                  }}
                >
                  {isOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <span style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                <HardDrive size={10} color="#38bdf8" />
                {isNativeSqlite ? 'Android SQLite Native' : 'Local-First DB Active'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* History Button */}
            <button
              type="button"
              onClick={handleOpenHistory}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#cbd5e1',
                borderRadius: '8px',
                padding: '7px 9px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <History size={13} />
              <span>History</span>
            </button>

            {/* Sync Button */}
            <button
              type="button"
              onClick={handleSyncToLaptop}
              disabled={isSyncing}
              style={{
                backgroundColor: unsyncedCount > 0 ? '#f59e0b' : '#334155',
                color: unsyncedCount > 0 ? '#1e1b4b' : '#94a3b8',
                fontWeight: 800,
                border: 'none',
                padding: '7px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                boxShadow: unsyncedCount > 0 ? '0 2px 8px rgba(245, 158, 11, 0.35)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
              <span>{isSyncing ? 'Syncing...' : `Sync (${unsyncedCount})`}</span>
            </button>
          </div>
        </div>

        {/* Subheader: Server Connection & IP Status Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            borderRadius: '6px',
            padding: '4px 8px',
            fontSize: '11px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#94a3b8' }}>
            <span style={{ color: '#cbd5e1', fontWeight: 600 }}>Master Laptop:</span>
            <span style={{ color: '#38bdf8', fontFamily: 'monospace', fontWeight: 700 }}>
              {getApiBase().replace(/^https?:\/\//, '')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowServerModal(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#fbbf24',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              padding: '2px 4px'
            }}
          >
            <Settings size={11} />
            <span>Change IP</span>
          </button>
        </div>
      </header>

      {/* 2. Middle Scrollable Work Area */}
      <div
        className="scroll-zone"
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          padding: '14px 16px 24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}
      >

        {/* Toast Notification Banner */}
        {feedbackToast && (
          <div
            style={{
              backgroundColor: feedbackToast.type === 'error' ? '#ef4444' : feedbackToast.type === 'info' ? '#3b82f6' : '#10b981',
              color: 'white',
              padding: '10px 14px',
              borderRadius: '10px',
              textAlign: 'center',
              fontWeight: 700,
              fontSize: '13px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {feedbackToast.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{feedbackToast.msg}</span>
          </div>
        )}

        {/* Existing Product Banner */}
        {existingProduct && (
          <div
            style={{
              background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
              color: 'white',
              padding: '12px 14px',
              borderRadius: '12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: '0 4px 12px rgba(6, 95, 70, 0.25)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: '6px', borderRadius: '8px' }}>
                <CheckCircle2 size={20} color="#a7f3d0" />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 900 }}>{existingProduct.name}</div>
                <div style={{ fontSize: '11px', color: '#a7f3d0', fontWeight: 600 }}>
                  Live Stock: <strong style={{ color: '#ffffff' }}>{existingProduct.stockQuantity ?? 0} units</strong> • BD {Number(existingProduct.sellingPrice || 0).toFixed(3)}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setExistingProduct(null);
                setIsNewProduct(true);
                focusAndSelect(barcodeInputRef, 60);
                setProduct(initialFormState);
              }}
              style={{
                backgroundColor: 'rgba(255,255,255,0.18)',
                border: 'none',
                color: 'white',
                fontWeight: 700,
                fontSize: '12px',
                padding: '6px 10px',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Reset ✕
            </button>
          </div>
        )}

        {/* Bulk Unpacking Sticky Context Indicator */}
        {hasActiveLocks && (
          <div
            style={{
              backgroundColor: '#fffbeb',
              border: '1.5px solid #f59e0b',
              borderRadius: '12px',
              padding: '10px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.15)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ backgroundColor: '#fef3c7', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Lock size={15} color="#b45309" />
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 900, color: '#92400e' }}>
                  Bulk Unpacking Mode Active
                </div>
                <div style={{ fontSize: '11px', color: '#b45309', fontWeight: 600, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {stickyLocks.category && <span>• Category: <strong>{product.category}</strong></span>}
                  {stickyLocks.supplier && <span>• Supplier: <strong>{product.supplierName || 'Locked'}</strong></span>}
                  {stickyLocks.cost && <span>• Cost: <strong>BD {product.purchasePrice || '0.000'}</strong></span>}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setStickyLocks({ category: false, supplier: false, cost: false });
                triggerHaptic(40);
                showToast('🔓 Cleared all sticky locks', 'info');
              }}
              style={{
                backgroundColor: '#fef3c7',
                border: '1px solid #f59e0b',
                color: '#92400e',
                fontSize: '11px',
                fontWeight: 800,
                padding: '5px 8px',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Unlock All
            </button>
          </div>
        )}

        {/* 2. Photo Viewfinder Box */}
        <div
          onClick={handlePhotoSelect}
          style={{
            height: '160px',
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: (product.imagePath || product.image) ? '2px solid #10b981' : '2px dashed #cbd5e1',
            cursor: 'pointer',
            overflow: 'hidden',
            position: 'relative',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            transition: 'all 0.15s ease'
          }}
        >
          {(product.imagePath || product.image) ? (
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              <img
                src={product.imagePath || product.image}
                alt="Product thumbnail"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: '8px',
                  right: '8px',
                  backgroundColor: 'rgba(15, 23, 42, 0.85)',
                  backdropFilter: 'blur(4px)',
                  color: 'white',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <CameraIcon size={13} /> Tap to Retake
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: '#64748b' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CameraIcon size={24} color="#3b82f6" />
              </div>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>Tap to Snap Photo</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>F100 Rear Hardware Camera</span>
            </div>
          )}
        </div>

        {/* CARD 1: Identification (Barcode & Product Name) */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}
        >
          {/* Barcode Input & Direct Scan Zone */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#334155', fontSize: '13px' }}>
                <BarcodeIcon size={16} color="#2563eb" />
                <span>Barcode (EAN-13 / SKU)</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {product.barcode ? (
                  !isNewProduct ? (
                    <span style={{ color: '#0369a1', fontWeight: 800, fontSize: '11px', backgroundColor: '#e0f2fe', padding: '2px 8px', borderRadius: '4px', border: '1px solid #7dd3fc' }}>
                      ⚡ RESTOCK
                    </span>
                  ) : (
                    <span style={{ color: '#7c3aed', fontWeight: 800, fontSize: '11px', backgroundColor: '#f5f3ff', padding: '2px 8px', borderRadius: '4px', border: '1px solid #ddd6fe' }}>
                      ✨ NEW ITEM
                    </span>
                  )
                ) : (
                  <span style={{ color: '#0284c7', fontSize: '11px', fontWeight: 700, backgroundColor: '#f0f9ff', padding: '2px 6px', borderRadius: '4px' }}>
                    Direct Scan
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setIsManualBarcodeEntry(!isManualBarcodeEntry)}
                  style={{
                    background: isManualBarcodeEntry ? '#e0e7ff' : '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: isManualBarcodeEntry ? '#4338ca' : '#475569',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {isManualBarcodeEntry ? <ScanLine size={12} /> : <Keyboard size={12} />}
                  <span>{isManualBarcodeEntry ? 'Scan Mode' : 'Type'}</span>
                </button>
              </div>
            </div>

            {!isManualBarcodeEntry ? (
              /* Tactile Direct Tap-To-Scan Zone (No soft keyboard popup!) */
              <div
                onClick={handleDirectBarcodeCamera}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: product.barcode ? '2px solid #10b981' : '2px dashed #0284c7',
                  backgroundColor: product.barcode ? '#f0fdf4' : '#f0f9ff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      backgroundColor: product.barcode ? '#dcfce7' : '#e0f2fe',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <ScanLine size={22} color={product.barcode ? '#15803d' : '#0284c7'} />
                  </div>
                  <div>
                    {product.barcode ? (
                      <>
                        <div style={{ fontSize: '18px', fontWeight: 900, fontFamily: 'monospace', color: '#0f172a' }}>
                          {product.barcode}
                        </div>
                        <div style={{ fontSize: '11px', color: '#15803d', fontWeight: 700 }}>
                          Tap to Scan Again 📷
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: '15px', fontWeight: 900, color: '#0284c7' }}>
                          {isDecodingBarcode ? 'Decoding Barcode... ⏳' : 'Tap to Scan Barcode Directly 📷'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          Point camera at item • Laser trigger also active
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <span
                  style={{
                    backgroundColor: product.barcode ? '#10b981' : '#0284c7',
                    color: 'white',
                    fontWeight: 800,
                    fontSize: '12px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
                  }}
                >
                  <CameraIcon size={14} />
                  <span>{isDecodingBarcode ? 'READING...' : 'SCAN'}</span>
                </span>
              </div>
            ) : (
              /* Manual Text Entry Input for Damaged Barcodes */
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  ref={barcodeInputRef}
                  name="barcode"
                  enterKeyHint="next"
                  placeholder="Enter barcode numbers manually..."
                  value={product.barcode}
                  onChange={(e) => {
                    const val = e.target.value;
                    setProduct({ ...product, barcode: val });
                    if (val.length >= 8) lookupBarcode(val);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (product.barcode && product.barcode.trim()) {
                        lookupBarcode(product.barcode.trim());
                      } else {
                        focusAndSelect(nameInputRef, 50);
                      }
                    }
                  }}
                  autoFocus
                  style={{
                    flex: 1,
                    boxSizing: 'border-box',
                    fontSize: '17px',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: product.barcode ? '2px solid #10b981' : '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    fontWeight: 800,
                    fontFamily: 'monospace',
                    color: '#0f172a'
                  }}
                />
                <button
                  type="button"
                  onClick={handleDirectBarcodeCamera}
                  style={{
                    backgroundColor: '#0284c7',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '0 14px',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <CameraIcon size={16} />
                  <span>Scan</span>
                </button>
              </div>
            )}
          </div>

          {/* Product Name Input with Auto-Focus Chaining to Price */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 800, color: '#334155', fontSize: '13px' }}>
              Product Name *
            </label>
            <input
              ref={nameInputRef}
              enterKeyHint="next"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  focusAndSelect(costInputRef, 50);
                }
              }}
              placeholder="e.g. Almarai Fresh Milk 1L"
              value={product.name}
              onChange={(e) => setProduct({ ...product, name: e.target.value })}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                fontSize: '16px',
                padding: '13px 14px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                fontWeight: 600,
                color: '#0f172a'
              }}
            />
          </div>

          {/* Category & SKU / Product Code Grid */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {/* Category Picker with Sticky Lock */}
            <div style={{ flex: 1.2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 800, color: '#334155', fontSize: '12px' }}>
                  <Layers size={13} color="#6366f1" />
                  <span>Category</span>
                </label>
                <button
                  type="button"
                  onClick={() => toggleLock('category')}
                  title={stickyLocks.category ? 'Category locked for bulk intake' : 'Click to lock Category'}
                  style={{
                    background: stickyLocks.category ? '#fef3c7' : '#f1f5f9',
                    border: stickyLocks.category ? '1px solid #f59e0b' : '1px solid #cbd5e1',
                    borderRadius: '5px',
                    padding: '2px 5px',
                    fontSize: '10px',
                    fontWeight: 800,
                    color: stickyLocks.category ? '#b45309' : '#64748b',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px'
                  }}
                >
                  {stickyLocks.category ? <Lock size={10} color="#b45309" /> : <Unlock size={10} />}
                  <span>{stickyLocks.category ? 'LOCKED' : 'LOCK'}</span>
                </button>
              </div>
              <select
                value={product.category}
                onChange={(e) => setProduct({ ...product, category: e.target.value })}
                style={{
                  width: '100%',
                  padding: '11px 10px',
                  borderRadius: '10px',
                  border: stickyLocks.category ? '1.5px solid #f59e0b' : '1px solid #cbd5e1',
                  fontSize: '13px',
                  backgroundColor: stickyLocks.category ? '#fffbeb' : '#ffffff',
                  fontWeight: 700,
                  color: '#0f172a'
                }}
              >
                {DEFAULT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* SKU / Product ID */}
            <div style={{ flex: 1 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 800, color: '#334155', fontSize: '12px', marginBottom: '6px' }}>
                <Tag size={13} color="#0284c7" />
                <span>SKU / Code</span>
              </label>
              <input
                type="text"
                placeholder="Auto SKU"
                value={product.id || ''}
                onChange={(e) => setProduct({ ...product, id: e.target.value })}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '11px 10px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  backgroundColor: '#ffffff',
                  fontWeight: 700,
                  color: '#334155'
                }}
              />
            </div>
          </div>
        </div>

        {/* CARD 2: Pricing, Live Margin & Bahrain NBR VAT */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#334155', fontSize: '13px' }}>
            <Coins size={16} color="#059669" />
            <span>Pricing, Cost & VAT</span>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            {/* Wholesale Cost with Sticky Lock Toggle */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ display: 'block', fontWeight: 700, color: '#475569', fontSize: '12px' }}>
                  Wholesale Cost
                </label>
                <button
                  type="button"
                  onClick={() => toggleLock('cost')}
                  title={stickyLocks.cost ? 'Cost price locked for bulk intake' : 'Click to lock cost price'}
                  style={{
                    background: stickyLocks.cost ? '#fef3c7' : '#f1f5f9',
                    border: stickyLocks.cost ? '1px solid #f59e0b' : '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '2px 6px',
                    fontSize: '10px',
                    fontWeight: 800,
                    color: stickyLocks.cost ? '#b45309' : '#64748b',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                >
                  {stickyLocks.cost ? <Lock size={10} color="#b45309" /> : <Unlock size={10} />}
                  <span>{stickyLocks.cost ? 'LOCKED' : 'LOCK'}</span>
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  ref={costInputRef}
                  enterKeyHint="next"
                  type="number"
                  step="0.005"
                  inputMode="decimal"
                  placeholder="0.000"
                  value={product.purchasePrice}
                  onChange={(e) => setProduct({ ...product, purchasePrice: e.target.value, unitCost: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      focusAndSelect(priceInputRef, 50);
                    }
                  }}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    fontSize: '18px',
                    padding: '12px 12px 12px 38px',
                    borderRadius: '10px',
                    border: stickyLocks.cost ? '1.5px solid #f59e0b' : '1px solid #cbd5e1',
                    backgroundColor: stickyLocks.cost ? '#fffbeb' : '#f8fafc',
                    fontWeight: 800,
                    color: '#334155',
                    fontFamily: 'monospace'
                  }}
                />
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', fontWeight: 800, color: '#94a3b8' }}>
                  BD
                </span>
              </div>
            </div>

            {/* Selling Price (Retail Price) */}
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 700, color: '#475569', fontSize: '12px' }}>
                Retail Price (BD) *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  ref={priceInputRef}
                  enterKeyHint="next"
                  type="number"
                  step="0.005"
                  inputMode="decimal"
                  placeholder="0.000"
                  value={product.sellingPrice}
                  onChange={(e) => setProduct({ ...product, sellingPrice: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      focusAndSelect(qtyInputRef, 50);
                    }
                  }}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    fontSize: '18px',
                    padding: '12px 12px 12px 38px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    fontWeight: 900,
                    color: '#059669',
                    fontFamily: 'monospace'
                  }}
                />
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', fontWeight: 800, color: '#94a3b8' }}>
                  BD
                </span>
              </div>
            </div>
          </div>

          {/* Live Profit Margin Badge */}
          {marginStats.status !== 'empty' && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: marginStats.status === 'healthy' ? '#ecfdf5' : marginStats.status === 'low' ? '#fffbeb' : '#fef2f2',
                color: marginStats.status === 'healthy' ? '#065f46' : marginStats.status === 'low' ? '#92400e' : '#991b1b',
                border: `1px solid ${marginStats.status === 'healthy' ? '#a7f3d0' : marginStats.status === 'low' ? '#fde68a' : '#fecaca'}`
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Percent size={14} />
                <span>
                  {marginStats.status === 'loss' ? 'Selling Below Cost (Loss)' : `${marginStats.margin}% Profit Margin`}
                </span>
              </div>
              <span>+BD {marginStats.profit} / unit</span>
            </div>
          )}

          {/* Bahrain NBR VAT Rate Selector */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 800, color: '#334155', fontSize: '12px' }}>
                <ShieldCheck size={14} color="#2563eb" />
                <span>Bahrain NBR VAT Rate</span>
              </label>
              <span style={{ fontSize: '10px', fontWeight: 700, color: product.vatRate === 10 ? '#2563eb' : '#059669' }}>
                {product.vatRate === 10 ? 'Standard 10%' : 'Basic Food Zero-Rated'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setProduct({ ...product, vatRate: 10 })}
                style={{
                  flex: 1,
                  padding: '10px 8px',
                  borderRadius: '8px',
                  border: product.vatRate === 10 ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  backgroundColor: product.vatRate === 10 ? '#eff6ff' : '#f8fafc',
                  color: product.vatRate === 10 ? '#1d4ed8' : '#64748b',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px'
                }}
              >
                <span>10% Standard VAT</span>
                {product.vatRate === 10 && <span>✓</span>}
              </button>
              <button
                type="button"
                onClick={() => setProduct({ ...product, vatRate: 0 })}
                style={{
                  flex: 1,
                  padding: '10px 8px',
                  borderRadius: '8px',
                  border: product.vatRate === 0 ? '2px solid #059669' : '1px solid #cbd5e1',
                  backgroundColor: product.vatRate === 0 ? '#ecfdf5' : '#f8fafc',
                  color: product.vatRate === 0 ? '#047857' : '#64748b',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px'
                }}
              >
                <span>0% Basic Food</span>
                {product.vatRate === 0 && <span>✓</span>}
              </button>
            </div>
          </div>
        </div>

        {/* CARD 3: 📦 Live Stock & Par Level Thresholds */}
        <div
          style={{
            backgroundColor: '#0f172a',
            borderRadius: '16px',
            padding: '16px',
            color: 'white',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 900, fontSize: '14px', color: '#f8fafc' }}>
              <Package size={17} color="#38bdf8" />
              <span>Stock & Par Thresholds</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                title="F100 Physical Volume Rocker buttons increment/decrement quantity"
                style={{
                  fontSize: '10px',
                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontWeight: 800,
                  letterSpacing: '0.2px'
                }}
              >
                Vol +/- Keys
              </span>
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                Live: <strong style={{ color: '#38bdf8' }}>{product.currentStock}</strong>
              </span>
            </div>
          </div>

          {/* Mode Switcher: Receive Delivery vs Physical Count */}
          <div
            style={{
              display: 'flex',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              padding: '4px',
              borderRadius: '10px',
              gap: '4px'
            }}
          >
            <button
              type="button"
              onClick={() => setProduct({ ...product, stockMode: 'ADD' })}
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: product.stockMode === 'ADD' ? '#10b981' : 'transparent',
                color: product.stockMode === 'ADD' ? '#ffffff' : '#94a3b8',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              ➕ Receive Delivery (+)
            </button>
            <button
              type="button"
              onClick={() => setProduct({ ...product, stockMode: 'SET' })}
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: product.stockMode === 'SET' ? '#3b82f6' : 'transparent',
                color: product.stockMode === 'SET' ? '#ffffff' : '#94a3b8',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              🔢 Shelf Count (=)
            </button>
          </div>

          {/* Giant Thumb Qty Selector */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              borderRadius: '12px',
              padding: '6px 14px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
          >
            <button
              type="button"
              onClick={() => {
                triggerHaptic(30);
                setProduct({ ...product, intakeQty: Math.max(1, product.intakeQty - 1) });
              }}
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                color: '#f87171',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 900
              }}
            >
              <Minus size={20} />
            </button>

            <div style={{ textAlign: 'center' }}>
              <input
                ref={qtyInputRef}
                enterKeyHint="done"
                inputMode="numeric"
                type="number"
                value={product.intakeQty}
                onChange={(e) => setProduct({ ...product, intakeQty: parseInt(e.target.value, 10) || 1 })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveAndNext();
                  }
                }}
                style={{
                  fontSize: '26px',
                  fontWeight: 900,
                  textAlign: 'center',
                  border: 'none',
                  width: '90px',
                  background: 'none',
                  color: '#ffffff',
                  fontFamily: 'monospace'
                }}
              />
              <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                {product.stockMode === 'ADD' ? 'Incoming Shipment Units' : 'New Verified Count'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                triggerHaptic(30);
                setProduct({ ...product, intakeQty: product.intakeQty + 1 });
              }}
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: 'rgba(16, 185, 129, 0.25)',
                color: '#34d399',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 900
              }}
            >
              <Plus size={20} />
            </button>
          </div>

          {/* Projected Live Stock Result */}
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '12px',
              fontWeight: 600,
              color: '#cbd5e1'
            }}
          >
            <span>Projected Resulting Stock:</span>
            <span style={{ fontSize: '13px', fontWeight: 900, color: finalStockCalculated <= product.minThreshold ? '#f87171' : '#34d399' }}>
              {finalStockCalculated} units {finalStockCalculated <= product.minThreshold ? '(⚠️ Low Stock Trigger)' : '(🟢 Healthy)'}
            </span>
          </div>

          {/* Reorder Par Thresholds (Min Danger Trigger & Max Restock Ceiling) */}
          <div
            style={{
              display: 'flex',
              gap: '10px',
              paddingTop: '6px',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)'
            }}
          >
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 800, color: '#f87171', fontSize: '11px' }}>
                Min Danger Trigger
              </label>
              <input
                type="number"
                value={product.minThreshold}
                onChange={(e) => setProduct({ ...product, minThreshold: parseInt(e.target.value, 10) || 5 })}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: '8px',
                  border: '1px solid rgba(248, 113, 113, 0.4)',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  fontWeight: 800,
                  color: '#fca5a5',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  fontFamily: 'monospace'
                }}
              />
              <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                Reorder trigger
              </span>
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 800, color: '#34d399', fontSize: '11px' }}>
                Max Par Level
              </label>
              <input
                type="number"
                value={product.maxThreshold}
                onChange={(e) => setProduct({ ...product, maxThreshold: parseInt(e.target.value, 10) || 50 })}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: '8px',
                  border: '1px solid rgba(52, 211, 153, 0.4)',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  fontWeight: 800,
                  color: '#86efac',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  fontFamily: 'monospace'
                }}
              />
              <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginTop: '2px' }}>
                Restock ceiling
              </span>
            </div>
          </div>
        </div>

        {/* CARD 4: 🚚 Supplier, Logistics & Scale */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            padding: '16px',
            border: stickyLocks.supplier ? '1.5px solid #f59e0b' : '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#334155', fontSize: '13px' }}>
              <Truck size={16} color="#2563eb" />
              <span>Supplier & Logistics</span>
            </div>
            {stickyLocks.supplier && (
              <span
                style={{
                  fontSize: '10px',
                  backgroundColor: '#fef3c7',
                  color: '#b45309',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px'
                }}
              >
                <Lock size={10} color="#b45309" />
                <span>Supplier Locked</span>
              </span>
            )}
          </div>

          {/* Supplier Name Input with Sticky Lock Toggle */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#334155', fontSize: '12px' }}>
                <Building2 size={14} color="#059669" />
                <span>Supplier / Vendor Name</span>
              </label>
              <button
                type="button"
                onClick={() => toggleLock('supplier')}
                title={stickyLocks.supplier ? 'Supplier locked for bulk intake' : 'Click to lock Supplier'}
                style={{
                  background: stickyLocks.supplier ? '#fef3c7' : '#f1f5f9',
                  border: stickyLocks.supplier ? '1px solid #f59e0b' : '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '2px 6px',
                  fontSize: '10px',
                  fontWeight: 800,
                  color: stickyLocks.supplier ? '#b45309' : '#64748b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px'
                }}
              >
                {stickyLocks.supplier ? <Lock size={10} color="#b45309" /> : <Unlock size={10} />}
                <span>{stickyLocks.supplier ? 'LOCKED' : 'LOCK'}</span>
              </button>
            </div>
            <input
              type="text"
              placeholder="e.g. Almarai Bahrain, Local Bakery, etc."
              value={product.supplierName}
              onChange={(e) => setProduct({ ...product, supplierName: e.target.value })}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: '8px',
                border: stickyLocks.supplier ? '1.5px solid #f59e0b' : '1px solid #cbd5e1',
                fontSize: '13px',
                boxSizing: 'border-box',
                backgroundColor: stickyLocks.supplier ? '#fffbeb' : '#ffffff',
                fontWeight: 600,
                color: '#0f172a'
              }}
            />
          </div>

          {/* Registered Distributor Entity Select */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#475569', fontSize: '11px' }}>
                <span>Bind to Registered Distributor</span>
              </label>
              {selectedDistributorInfo && (
                <span style={{ fontSize: '10px', color: '#059669', fontWeight: 800, backgroundColor: '#ecfdf5', padding: '2px 6px', borderRadius: '4px' }}>
                  MOV: BD {Number(selectedDistributorInfo.minimumOrderValue || 0).toFixed(3)}
                </span>
              )}
            </div>
            <select
              value={product.distributorId}
              onChange={(e) => {
                const distId = e.target.value;
                const match = distributors.find((d) => d.id === distId);
                setProduct({
                  ...product,
                  distributorId: distId,
                  supplierName: match?.name || product.supplierName,
                  supplierEmail: match?.contactEmail || product.supplierEmail
                });
              }}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                backgroundColor: '#f8fafc',
                fontWeight: 600,
                color: '#334155'
              }}
            >
              <option value="">-- Or Choose Existing Distributor --</option>
              {distributors.map((dist) => (
                <option key={dist.id} value={dist.id}>
                  {dist.name} (MOV: BD {Number(dist.minimumOrderValue || 0).toFixed(3)})
                </option>
              ))}
            </select>
            {selectedDistributorInfo?.whatsappNumber && (
              <span style={{ fontSize: '11px', color: '#047857', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                <Phone size={12} /> WhatsApp PO Link: +{selectedDistributorInfo.whatsappNumber}
              </span>
            )}
          </div>

          {/* Supplier Email (PO Destination) */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#334155', fontSize: '12px', marginBottom: '6px' }}>
              <Mail size={14} color="#0284c7" />
              <span>Supplier Email (PO Destination)</span>
            </label>
            <input
              type="email"
              placeholder="e.g. orders@distributor.bh"
              value={product.supplierEmail}
              onChange={(e) => setProduct({ ...product, supplierEmail: e.target.value })}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                boxSizing: 'border-box',
                backgroundColor: '#ffffff'
              }}
            />
          </div>

          {/* Weighed Item Checkbox Pill */}
          <div
            onClick={() => setProduct((p) => ({ ...p, is_weighed_item: !p.is_weighed_item }))}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderRadius: '8px',
              backgroundColor: product.is_weighed_item ? '#eff6ff' : '#f8fafc',
              border: `1.5px solid ${product.is_weighed_item ? '#3b82f6' : '#e2e8f0'}`,
              cursor: 'pointer'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Scale size={16} color={product.is_weighed_item ? '#2563eb' : '#64748b'} />
              <div>
                <span style={{ display: 'block', fontWeight: 800, color: '#1e293b', fontSize: '12px' }}>
                  Weighed Produce Item (Sold by KG)
                </span>
                <span style={{ fontSize: '10px', color: '#64748b' }}>
                  Barcode embeds weight from produce scales
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={product.is_weighed_item}
              onChange={() => { }}
              style={{ width: '18px', height: '18px', accentColor: '#2563eb' }}
            />
          </div>

          {/* Audit Reason / Note */}
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 800, color: '#334155', fontSize: '12px' }}>
              Stock Intake Note / Reason
            </label>
            <input
              type="text"
              value={product.reason}
              onChange={(e) => setProduct({ ...product, reason: e.target.value })}
              placeholder="e.g. Supplier DSD Intake, Inventory Audit"
              style={{
                width: '100%',
                padding: '9px 10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '12px',
                boxSizing: 'border-box',
                backgroundColor: '#ffffff'
              }}
            />
          </div>
        </div>

        {/* 4. Physical 58mm Thermal Printer Controls */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            padding: '14px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <PrinterIcon size={16} color="#0284c7" />
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                F100 58mm Thermal Printer
              </span>
            </div>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: '6px',
                backgroundColor: '#f0fdf4',
                color: '#15803d',
                border: '1px solid #bbf7d0'
              }}
            >
              READY
            </span>
          </div>

          {/* Manual Print Button */}
          <button
            type="button"
            onClick={handleManualPrint}
            disabled={isPrinting}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: '#f8fafc',
              color: '#1e293b',
              fontSize: '15px',
              fontWeight: 800,
              border: '1.5px solid #cbd5e1',
              borderRadius: '10px',
              cursor: isPrinting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              transition: 'all 0.15s ease'
            }}
          >
            <PrinterIcon size={18} color="#0284c7" />
            <span>{isPrinting ? 'Dispensing Label...' : '🖨️ PRINT SHELF TAG (58mm)'}</span>
          </button>

          {/* Auto-Print on Save Toggle */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 10px',
              backgroundColor: autoPrintEnabled ? '#eff6ff' : '#f8fafc',
              borderRadius: '8px',
              border: `1px solid ${autoPrintEnabled ? '#bfdbfe' : '#e2e8f0'}`
            }}
          >
            <div>
              <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>
                Auto-Print on "SAVE & NEXT"
              </span>
              <span style={{ fontSize: '10px', color: '#64748b' }}>
                Instantly dispenses label when saving new stock
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                const nextVal = !autoPrintEnabled;
                setAutoPrintEnabled(nextVal);
                try {
                  localStorage.setItem('f100_auto_print', String(nextVal));
                } catch { }
                triggerHaptic(40);
                showToast(nextVal ? '⚡ Auto-Print Enabled' : 'Auto-Print Disabled', 'info');
              }}
              style={{
                backgroundColor: autoPrintEnabled ? '#2563eb' : '#cbd5e1',
                color: 'white',
                border: 'none',
                borderRadius: '16px',
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'background-color 0.2s ease'
              }}
            >
              {autoPrintEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </div>

      {/* 3. Pinned Bottom Action Footer (Anchored for Natural Thumb Strike, Zero Content Overlap) */}
      <footer
        style={{
          flexShrink: 0,
          backgroundColor: '#ffffff',
          padding: '12px 16px',
          boxSizing: 'border-box',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.1)',
          zIndex: 100,
          borderTop: '1px solid #e2e8f0'
        }}
      >
        <button
          type="button"
          onClick={handleSaveAndNext}
          style={{
            width: '100%',
            padding: '16px',
            background: existingProduct
              ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
              : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: 'white',
            fontSize: '18px',
            fontWeight: 900,
            letterSpacing: '0.5px',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            boxShadow: existingProduct
              ? '0 6px 16px rgba(37, 99, 235, 0.35)'
              : '0 6px 16px rgba(16, 185, 129, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <span>{existingProduct ? 'UPDATE CATALOG & NEXT' : 'SAVE & NEXT'}</span>
          <ArrowRight size={20} />
        </button>
      </footer>

      {/* MODAL 1: Master Server IP Configuration */}
      {showServerModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              padding: '20px',
              width: '100%',
              maxWidth: '380px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={20} color="#2563eb" />
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                  Laptop Master Sync
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowServerModal(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.4 }}>
              Set the IP address of the Store Master PC running on your local Wi-Fi.
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Server Base URL
              </label>
              <input
                type="text"
                value={serverUrlInput}
                onChange={(e) => setServerUrlInput(e.target.value)}
                placeholder="http://192.168.8.7:3000"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Quick Preset Buttons */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['http://192.168.8.7:3000', 'http://192.168.8.12:3000', 'http://localhost:3000'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setServerUrlInput(preset)}
                  style={{
                    backgroundColor: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                    color: '#334155'
                  }}
                >
                  {preset.replace(/^https?:\/\//, '')}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => {
                  try {
                    const clean = serverUrlInput.trim().replace(/\/$/, '');
                    localStorage.setItem('master_server_url', clean);
                    setShowServerModal(false);
                    showToast('✅ Master Server URL Updated!', 'success');
                    runSyncPush(true);
                  } catch { }
                }}
                style={{
                  flex: 1,
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px',
                  fontWeight: 800,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Save & Connect
              </button>
              <button
                type="button"
                onClick={() => setShowServerModal(false)}
                style={{
                  backgroundColor: '#f1f5f9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Offline SQLite Scans Audit History */}
      {showHistoryModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              padding: '20px',
              width: '100%',
              maxWidth: '440px',
              maxHeight: '80vh',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxSizing: 'border-box'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HardDrive size={20} color="#059669" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                    F100 SQLite Database
                  </h3>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    Crash-Proof Local Audit ({recentScans.length} recent entries)
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={async () => {
                    const list = await getRecentHistory(30);
                    setRecentScans(list);
                    showToast('🔄 History Refreshed', 'info');
                  }}
                  title="Refresh Database View"
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#475569',
                    cursor: 'pointer',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 700
                  }}
                >
                  <RefreshCw size={13} />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(false)}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {recentScans.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: '#94a3b8' }}>
                  <span>No scans stored in local database yet.</span>
                </div>
              ) : (
                recentScans.map((item) => {
                  let payload = {};
                  try {
                    payload = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload;
                  } catch { }

                  const isSynced = item.sync_status === 1;

                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: isSynced ? '#f8fafc' : '#fffbeb',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>
                            {item.name || payload.name || 'Unnamed Product'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                          <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#64748b', fontWeight: 600 }}>
                            {item.barcode || 'NO-BARCODE'}
                          </span>
                          <span style={{ fontSize: '11px', color: '#059669', fontWeight: 700 }}>
                            {payload.sellingPrice ? `BD ${Number(payload.sellingPrice).toFixed(3)}` : ''}
                          </span>
                          <span style={{ fontSize: '11px', color: '#475569' }}>
                            Qty: {payload.intakeQty || 1} ({payload.stockMode === 'ADD' ? '+' : '='})
                          </span>
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: isSynced ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.2)',
                          color: isSynced ? '#059669' : '#d97706',
                          border: `1px solid ${isSynced ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                        }}
                      >
                        {isSynced ? 'SYNCED' : 'PENDING'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={async () => {
                  await runSyncPush(true);
                  const list = await getRecentHistory(30);
                  setRecentScans(list);
                }}
                disabled={isSyncing}
                style={{
                  flex: 1,
                  backgroundColor: '#f59e0b',
                  color: '#1e1b4b',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: isSyncing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                <span>{isSyncing ? 'Syncing with Back Office...' : 'Sync Pending Scans Now'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
