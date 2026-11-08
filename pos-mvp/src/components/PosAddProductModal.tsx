import React, { useState, useEffect, useMemo } from 'react';
import { PackagePlus, X, ScanBarcode, Truck, Percent, Scale, Tag, Layers, CheckCircle2, AlertCircle, RotateCcw, ShoppingCart, Search, RefreshCw } from 'lucide-react';
import { db } from '../db';
import { mapDbRowToProduct } from '../services/productMapper';

export interface PosAddProductModalProps {
  onClose: () => void;
  onProductAdded: (product: any, addToCart?: boolean) => void;
  initialBarcode?: string;
  apiBase?: string;
  categories?: { id: string; label: string; color?: string }[];
  catalog?: any[];
}

export default function PosAddProductModal({
  onClose,
  onProductAdded,
  initialBarcode = '',
  apiBase = 'http://localhost:3000',
  categories = [],
  catalog = []
}: PosAddProductModalProps) {
  const [distributors, setDistributors] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    barcode: initialBarcode || '',
    name: '',
    sellingPrice: '',
    purchasePrice: '', // wholesale unit cost
    stockQuantity: '1', // assume at least 1 in hand at register
    minThreshold: '10', // safe low stock par level
    maxThreshold: '50', // target reorder capacity
    distributorId: '',
    vatRate: '10.0', // standard Bahrain VAT 10%
    is_weighed_item: false,
    category: 'ESSENTIALS'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [allProducts, setAllProducts] = useState<any[]>(catalog || []);
  const [isUpdateMode, setIsUpdateMode] = useState(false);
  const [dismissedExistingId, setDismissedExistingId] = useState<string | null>(null);

  // Sync catalog prop or load directly from local SQLite table Product
  useEffect(() => {
    if (catalog && catalog.length > 0) {
      setAllProducts(catalog);
    } else {
      db.execute('SELECT * FROM Product').then((res) => {
        if (res?.rows && Array.isArray(res.rows)) {
          setAllProducts(res.rows.map(mapDbRowToProduct));
        }
      }).catch(() => { });
    }
  }, [catalog]);

  // 1. Detect existing product by Barcode / ID
  const detectedByBarcode = useMemo(() => {
    const rawBarcode = formData.barcode.trim();
    if (!rawBarcode || rawBarcode.length < 2) return null;
    const target = rawBarcode.toLowerCase();
    return allProducts.find((p) => {
      const b = (p.barcode || '').trim().toLowerCase();
      const id = (p.id || '').trim().toLowerCase();
      return b === target || id === target;
    }) || null;
  }, [allProducts, formData.barcode]);

  // 2. Detect existing product by Exact Name (case-insensitive)
  const detectedByName = useMemo(() => {
    const rawName = formData.name.trim();
    if (!rawName || rawName.length < 2) return null;
    const target = rawName.toLowerCase();
    return allProducts.find((p) => {
      const n = (p.name || '').trim().toLowerCase();
      return n === target;
    }) || null;
  }, [allProducts, formData.name]);

  // Active detected existing product (prioritize barcode match, then exact name match)
  const existingProduct = useMemo(() => {
    const candidate = detectedByBarcode || detectedByName;
    if (!candidate) return null;
    if (dismissedExistingId && (candidate.id === dismissedExistingId || candidate.barcode === dismissedExistingId)) {
      return null;
    }
    return candidate;
  }, [detectedByBarcode, detectedByName, dismissedExistingId]);

  const matchReason: 'barcode' | 'name' | null = detectedByBarcode ? 'barcode' : detectedByName ? 'name' : null;

  // 3. Similar products by partial name match
  const similarByName = useMemo(() => {
    const rawName = formData.name.trim();
    if (!rawName || rawName.length < 3) return [];
    const target = rawName.toLowerCase();
    return allProducts
      .filter((p) => {
        const n = (p.name || '').trim().toLowerCase();
        if (existingProduct && (p.id === existingProduct.id || p.barcode === existingProduct.barcode)) return false;
        return n.includes(target) || target.includes(n);
      })
      .slice(0, 4);
  }, [allProducts, formData.name, existingProduct]);

  const handleLoadExistingDetails = (prod: any) => {
    setFormData({
      barcode: prod.barcode || prod.id,
      name: prod.name,
      sellingPrice: String(prod.sellingPrice || prod.price || ''),
      purchasePrice: String(prod.purchasePrice || prod.unitCost || ''),
      stockQuantity: String(prod.stockQuantity ?? '10'),
      minThreshold: String(prod.minThreshold ?? '10'),
      maxThreshold: String(prod.maxThreshold ?? '50'),
      distributorId: prod.distributorId || '',
      vatRate: String(prod.vatRate !== undefined ? prod.vatRate : '10.0'),
      is_weighed_item: Boolean(prod.is_weighed_item),
      category: prod.category || 'ESSENTIALS'
    });
    setIsUpdateMode(true);
    setDismissedExistingId(null);
  };

  const handleAddExistingToCart = (prod: any) => {
    onProductAdded({
      ...prod,
      sellingPrice: Number(prod.sellingPrice || prod.price || 0),
      purchasePrice: Number(prod.purchasePrice || prod.unitCost || 0),
      barcode: prod.barcode || prod.id,
      category: prod.category || 'ESSENTIALS'
    }, true);
    onClose();
  };

  // Sync barcode if changed
  useEffect(() => {
    if (initialBarcode && !formData.barcode) {
      setFormData(prev => ({ ...prev, barcode: initialBarcode }));
    }
  }, [initialBarcode]);

  // Network candidates resolution (prevents offline or IP mismatch failures)
  const getCandidateUrls = () => {
    const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
    const list = [
      apiBase && apiBase !== 'http://localhost:3000' ? apiBase : (isAndroid ? 'http://192.168.8.7:3000' : apiBase),
      typeof localStorage !== 'undefined' ? localStorage.getItem('master_server_url') : null,
      typeof localStorage !== 'undefined' && localStorage.getItem('server_ip') ? `http://${localStorage.getItem('server_ip')}:3000` : null,
      'http://192.168.8.7:3000',
      'http://askar-master.local:3000',
      'http://localhost:3000'
    ];
    return list
      .filter((val, idx, arr): val is string => Boolean(val) && !val?.includes('192.168.8.20') && arr.indexOf(val) === idx);
  };

  // Fetch official distributors
  useEffect(() => {
    const fetchDistributors = async () => {
      const candidates = getCandidateUrls();
      for (const url of candidates) {
        try {
          const res = await fetch(`${url}/api/distributors`, { signal: AbortSignal.timeout(2500) });
          if (res.ok) {
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data.distributors || []);
            setDistributors(list);
            if (list.length > 0) {
              setFormData(prev => ({ ...prev, distributorId: prev.distributorId || list[0].id }));
            }
            break;
          }
        } catch {
          // Try next
        }
      }
    };
    fetchDistributors();
  }, [apiBase]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // Live PIM Profit Margin Calculations
  const cost = parseFloat(formData.purchasePrice) || 0;
  const price = parseFloat(formData.sellingPrice) || 0;
  const profit = price > 0 && cost > 0 ? price - cost : 0;
  const marginPercent = price > 0 && cost > 0 ? ((profit / price) * 100) : 0;

  // Available categories list
  const activeCategories = useMemo(() => {
    if (categories && categories.length > 0) {
      return categories.filter(c => c.id !== 'ALL');
    }
    return [
      { id: 'PRODUCE', label: 'Produce 🥦' },
      { id: 'BAKERY', label: 'Bakery 🥖' },
      { id: 'DAIRY', label: 'Dairy 🥛' },
      { id: 'MEAT', label: 'Meat / Deli 🥩' },
      { id: 'ESSENTIALS', label: 'Essentials ⚡' },
      { id: 'PROMO', label: 'Special / Promo 🏷️' }
    ];
  }, [categories]);

  const handleSave = async (andAddToCart = true) => {
    setErrorMessage(null);
    if (!formData.name.trim()) {
      setErrorMessage("Please enter a product name.");
      return;
    }
    if (!formData.sellingPrice || parseFloat(formData.sellingPrice) <= 0) {
      setErrorMessage("Please enter a valid retail selling price.");
      return;
    }

    const existing = existingProduct || detectedByBarcode || detectedByName;
    const targetId = (existing ? existing.id : (formData.barcode || crypto.randomUUID())).trim();
    const cleanBarcode = (formData.barcode || (existing ? existing.barcode : targetId) || crypto.randomUUID()).trim();
    const costPrice = parseFloat(formData.purchasePrice) || 0;
    const salePrice = parseFloat(formData.sellingPrice) || 0;
    const vat = parseFloat(formData.vatRate) || 10.0;

    const enteredQty = parseInt(formData.stockQuantity, 10) || 1;
    const existingStock = existing ? (parseInt(existing.stockQuantity, 10) || 0) : 0;
    const finalStock = isUpdateMode ? enteredQty : (existing ? existingStock + enteredQty : enteredQty);

    const payload = {
      id: targetId,
      barcode: cleanBarcode,
      name: formData.name.trim(),
      sellingPrice: salePrice,
      purchasePrice: costPrice,
      unitCost: costPrice,
      stockQuantity: finalStock,
      minThreshold: parseInt(formData.minThreshold, 10) || 10,
      maxThreshold: parseInt(formData.maxThreshold, 10) || 50,
      distributorId: formData.distributorId || null,
      vatRate: vat,
      taxRate: vat / 100.0,
      is_weighed_item: Boolean(formData.is_weighed_item),
      category: formData.category || (existing?.category || 'ESSENTIALS')
    };

    setIsSubmitting(true);

    // ⚡ 0ms INSTANT OPTIMISTIC SAVE: Persist immediately to local embedded SQLite (<5ms)
    try {
      await db.execute({
        sql: `INSERT OR REPLACE INTO Product (id, barcode, name, sellingPrice, unitCost, purchasePrice, stockQuantity, minThreshold, maxThreshold, vatRate, taxRate, is_weighed_item, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          payload.id,
          payload.barcode,
          payload.name,
          payload.sellingPrice,
          payload.unitCost,
          payload.purchasePrice,
          payload.stockQuantity,
          payload.minThreshold,
          payload.maxThreshold,
          payload.vatRate,
          payload.taxRate,
          payload.is_weighed_item ? 1 : 0,
          payload.category
        ]
      });
    } catch (localErr: any) {
      console.warn('Local instant save notice:', localErr);
    }

    // Direct localStorage cache update for 0ms lookup
    try {
      const raw = localStorage.getItem('askar_local_db_cache_Product');
      const cachedList = raw ? JSON.parse(raw) : [];
      const updated = [
        { ...payload, price: salePrice, sellingPrice: salePrice },
        ...cachedList.filter((p: any) => p && p.id !== payload.id && (!payload.barcode || p.barcode !== payload.barcode))
      ];
      localStorage.setItem('askar_local_db_cache_Product', JSON.stringify(updated));

      // Also update general catalog cache
      const catRaw = localStorage.getItem('askar_catalog_cache');
      if (catRaw) {
        const catParsed = JSON.parse(catRaw);
        const list = Array.isArray(catParsed) ? catParsed : (catParsed?.data || []);
        const nextList = [
          { ...payload, price: salePrice, sellingPrice: salePrice },
          ...list.filter((p: any) => p && p.id !== payload.id && (!payload.barcode || p.barcode !== payload.barcode))
        ];
        localStorage.setItem('askar_catalog_cache', JSON.stringify({ data: nextList, ts: Date.now() }));
      }
    } catch { }

    const savedProduct = {
      ...payload,
      price: salePrice,
      sellingPrice: salePrice
    };

    // ⚡ Push to Master Server (await with 4s timeout so master DB receives it before catalog refresh)
    const candidates = getCandidateUrls();
    let pushedToServer = false;
    for (const url of candidates) {
      try {
        const res = await fetch(`${url}/api/products`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-manager-pin': '9999',
            'x-pos-client': 'store-pos'
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(4000)
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success || data.id) {
            console.log('✅ Product synced to master server successfully:', payload.name);
            pushedToServer = true;
            break;
          }
        }
      } catch {
        // Fall through to next candidate or leave in local DB
      }
    }

    if (!pushedToServer) {
      try {
        const pending = JSON.parse(localStorage.getItem('askar_pending_products') || '[]');
        pending.push({ payload, ts: Date.now() });
        localStorage.setItem('askar_pending_products', JSON.stringify(pending));
      } catch { }
    }

    // ⚡ UI UNBLOCK: Trigger callbacks and dismiss modal immediately
    onProductAdded(savedProduct, andAddToCart);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="bg-slate-950 px-6 py-4 flex justify-between items-center text-white border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
              <PackagePlus size={24} />
            </span>
            <div>
              <h3 className="text-xl font-black leading-tight">Quick Add Product (PIM)</h3>
              <p className="text-xs text-slate-400 font-medium">Instantly register SKU to database & inventory</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full active:scale-90 transition-transform cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-300 rounded-2xl flex items-center gap-2 text-rose-900 text-xs font-bold animate-in fade-in">
            <AlertCircle size={18} className="text-rose-600 shrink-0" />
            <span className="flex-1">{errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage(null)} className="text-rose-600 font-black">✕</button>
          </div>
        )}

        {/* Scrollable Form Body */}
        <div className="p-6 overflow-y-auto scroll-zone space-y-4 text-xs">

          {/* EXISTING ITEM DETECTED NOTIFICATION CARD */}
          {existingProduct && (
            <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl shadow-sm text-amber-950 animate-in fade-in space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-amber-200 text-amber-900 rounded-xl text-base">⚠️</span>
                  <div>
                    <h4 className="font-black text-sm text-amber-900 leading-tight">
                      Existing Product Detected in Catalog!
                    </h4>
                    <span className="text-[10px] font-bold text-amber-700 tracking-wide uppercase">
                      Recognized by {matchReason === 'barcode' ? `Barcode: [${existingProduct.barcode || existingProduct.id}]` : `Exact Name: "${existingProduct.name}"`}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedExistingId(existingProduct.id || existingProduct.barcode)}
                  className="text-amber-700 hover:text-amber-950 text-xs font-black p-1 cursor-pointer"
                  title="Dismiss warning"
                >
                  ✕
                </button>
              </div>

              {/* Snapshot of existing product */}
              <div className="bg-white p-3 rounded-xl border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <p className="font-black text-slate-800 text-sm">{existingProduct.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-slate-500 font-mono text-[11px]">
                    <span>Barcode: <strong className="text-slate-700">{existingProduct.barcode || existingProduct.id}</strong></span>
                    <span>•</span>
                    <span>Stock: <strong className="text-slate-700">{existingProduct.stockQuantity ?? 0} in store</strong></span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Retail Price</span>
                  <span className="font-mono font-black text-emerald-700 text-base">
                    BD {Number(existingProduct.sellingPrice || existingProduct.price || 0).toFixed(3)}
                  </span>
                </div>
              </div>

              {/* Quick Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleLoadExistingDetails(existingProduct)}
                  className="py-2.5 px-3 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-2xs"
                >
                  <RotateCcw size={14} />
                  <span>Load & Edit Details</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddExistingToCart(existingProduct)}
                  className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-md"
                >
                  <ShoppingCart size={14} />
                  <span>Add to Cart (BD {Number(existingProduct.sellingPrice || existingProduct.price || 0).toFixed(3)})</span>
                </button>
              </div>
            </div>
          )}

          {/* 1. Barcode & Product Name */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1">
                <ScanBarcode size={14} className="text-slate-500" /> Barcode / ID
              </label>
              <input
                type="text"
                name="barcode"
                value={formData.barcode}
                onChange={handleChange}
                className="w-full text-base p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-emerald-500 font-mono font-bold"
                placeholder="Scan or auto..."
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-slate-700 font-bold mb-1">Product Name *</label>
              <input
                type="text"
                name="name"
                required
                autoFocus
                value={formData.name}
                onChange={handleChange}
                className="w-full text-base p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-emerald-500 font-bold"
                placeholder="e.g. Almarai Fresh Milk 1L"
              />
              {/* Similar items recognized by partial name */}
              {similarByName.length > 0 && !existingProduct && (
                <div className="mt-1.5 p-2 bg-blue-50/80 border border-blue-200 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold text-blue-900">
                    <span className="flex items-center gap-1">
                      <Search size={11} /> Similar items already in store:
                    </span>
                    <span>{similarByName.length} found</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {similarByName.map((sim) => (
                      <button
                        key={sim.id}
                        type="button"
                        onClick={() => handleLoadExistingDetails(sim)}
                        className="px-2 py-1 bg-white hover:bg-blue-100 border border-blue-200 rounded-lg text-slate-800 text-[11px] font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <span className="font-bold">{sim.name}</span>
                        <span className="font-mono text-emerald-700 font-bold">BD {Number(sim.sellingPrice || sim.price || 0).toFixed(3)}</span>
                        <span className="text-[9px] text-slate-400 font-mono">({sim.barcode || sim.id})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 2. PIM Pricing Engine (Cost, Sale Price, Live Margin %) */}
          <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                <Percent size={14} className="text-slate-500" /> Pricing & Profitability Engine
              </span>
              {price > 0 && cost > 0 && (
                <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 ${marginPercent < 0
                    ? 'bg-rose-100 text-rose-800'
                    : marginPercent < 15
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                  <span>{marginPercent < 0 ? '⚠️ LOSS' : marginPercent < 15 ? '⚠️ LOW MARGIN' : '✅ HEALTHY'}</span>
                  <span>({marginPercent.toFixed(1)}%)</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-600 font-bold mb-1">Cost Price (BD)</label>
                <input
                  type="number"
                  step="0.001"
                  name="purchasePrice"
                  value={formData.purchasePrice}
                  onChange={handleChange}
                  className="w-full text-lg font-black p-2.5 bg-white border-2 border-slate-200 text-slate-800 rounded-xl outline-none focus:border-blue-500 font-mono"
                  placeholder="0.000"
                />
              </div>

              <div>
                <label className="block text-emerald-800 font-bold mb-1">Sale Price (BD) *</label>
                <input
                  type="number"
                  step="0.001"
                  name="sellingPrice"
                  required
                  value={formData.sellingPrice}
                  onChange={handleChange}
                  className="w-full text-lg font-black p-2.5 bg-emerald-50/70 border-2 border-emerald-300 text-emerald-950 rounded-xl outline-none focus:border-emerald-600 font-mono"
                  placeholder="0.000"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Gross Profit (BD)</label>
                <div className={`w-full text-lg font-black p-2.5 rounded-xl border-2 flex items-center font-mono ${profit < 0
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : profit > 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-slate-100 border-slate-200 text-slate-500'
                  }`}>
                  {profit ? `BD ${profit.toFixed(3)}` : 'BD 0.000'}
                </div>
              </div>
            </div>

            {/* VAT Rate Option */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-200">
              <span className="text-slate-600 font-bold">VAT Classification:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, vatRate: '10.0' }))}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${formData.vatRate === '10.0'
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                >
                  Standard 10% VAT
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, vatRate: '0.0' }))}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${formData.vatRate === '0.0'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                >
                  0% Zero-Rated (Basic Food)
                </button>
              </div>
            </div>
          </div>

          {/* 3. Category Department & Weighed Item Toggle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1">
                <Tag size={14} className="text-slate-500" /> Category Department
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="w-full text-sm p-3 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-emerald-500 font-bold text-slate-800 cursor-pointer"
              >
                {activeCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1">
                <Scale size={14} className="text-slate-500" /> Item Sold By
              </label>
              <div className="grid grid-cols-2 gap-2 h-11">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, is_weighed_item: false }))}
                  className={`rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer border ${!formData.is_weighed_item
                      ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                >
                  <span>📦 Unit / Piece</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, is_weighed_item: true }))}
                  className={`rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer border ${formData.is_weighed_item
                      ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                >
                  <span>⚖️ Scale Weighed</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4. Inventory Stock & Reorder Thresholds */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1">
                <Layers size={13} className="text-slate-500" /> Stock on Hand
              </label>
              <input
                type="number"
                name="stockQuantity"
                value={formData.stockQuantity}
                onChange={handleChange}
                className="w-full text-base font-bold p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Min Reorder Par</label>
              <input
                type="number"
                name="minThreshold"
                value={formData.minThreshold}
                onChange={handleChange}
                className="w-full text-base font-bold p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Max Capacity</label>
              <input
                type="number"
                name="maxThreshold"
                value={formData.maxThreshold}
                onChange={handleChange}
                className="w-full text-base font-bold p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          {/* 5. Distributor & Supplier Binding */}
          <div className="p-3.5 bg-blue-50/70 border-2 border-blue-100 rounded-2xl">
            <label className="flex items-center justify-between text-blue-900 font-bold mb-1.5 text-xs">
              <span className="flex items-center gap-1.5">
                <Truck size={15} /> Assigned Distributor (Restock Automation)
              </span>
              <span className="text-[10px] text-blue-600 font-semibold">Optional</span>
            </label>
            <select
              name="distributorId"
              value={formData.distributorId}
              onChange={handleChange}
              className="w-full text-sm p-2.5 bg-white border-2 border-blue-200 rounded-xl outline-none focus:border-blue-500 font-bold text-slate-800 cursor-pointer"
            >
              <option value="">Direct / Local Cash Supplier (No Restock Order)</option>
              {distributors.map(dist => (
                <option key={dist.id} value={dist.id}>
                  {dist.name} {dist.contactEmail ? `(${dist.contactEmail})` : ''}
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSave(false)}
            className="px-4 py-3 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer shadow-xs disabled:opacity-50"
          >
            {isUpdateMode ? 'Update Catalog Only' : 'Save to Catalog Only'}
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSave(true)}
            className={`flex-1 py-3.5 text-white font-bold text-sm rounded-xl active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 cursor-p  ointer disabled:opacity-50 ${isUpdateMode ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
          >
            {isUpdateMode ? <RefreshCw size={18} /> : <CheckCircle2 size={18} />}
            <span>{isSubmitting ? 'Saving...' : isUpdateMode ? 'Update Product & Add to Cart' : 'Save & Add to Cart (Checkout)'}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
