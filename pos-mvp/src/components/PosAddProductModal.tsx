import React, { useState, useEffect, useMemo } from 'react';
import { PackagePlus, X, ScanBarcode, Truck, Percent, Scale, Tag, Layers, CheckCircle2, AlertCircle } from 'lucide-react';
import { db } from '../db';

export interface PosAddProductModalProps {
  onClose: () => void;
  onProductAdded: (product: any, addToCart?: boolean) => void;
  initialBarcode?: string;
  apiBase?: string;
  categories?: { id: string; label: string; color?: string }[];
}

export default function PosAddProductModal({
  onClose,
  onProductAdded,
  initialBarcode = '',
  apiBase = 'http://localhost:3000',
  categories = []
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

  // Sync barcode if changed
  useEffect(() => {
    if (initialBarcode && !formData.barcode) {
      setFormData(prev => ({ ...prev, barcode: initialBarcode }));
    }
  }, [initialBarcode]);

  // Network candidates resolution (prevents offline or IP mismatch failures)
  const getCandidateUrls = () => {
    const list = [
      apiBase,
      typeof localStorage !== 'undefined' ? localStorage.getItem('master_server_url') : null,
      typeof localStorage !== 'undefined' && localStorage.getItem('server_ip') ? `http://${localStorage.getItem('server_ip')}:3000` : null,
      'http://192.168.8.20:3000',
      'http://192.168.88.10:3000',
      'http://192.168.8.7:3000',
      'http://localhost:3000'
    ];
    return list.filter((val, idx, arr): val is string => Boolean(val) && arr.indexOf(val) === idx);
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

    const cleanBarcode = (formData.barcode || crypto.randomUUID()).trim();
    const costPrice = parseFloat(formData.purchasePrice) || 0;
    const salePrice = parseFloat(formData.sellingPrice) || 0;
    const vat = parseFloat(formData.vatRate) || 10.0;

    const payload = {
      id: cleanBarcode,
      barcode: cleanBarcode,
      name: formData.name.trim(),
      sellingPrice: salePrice,
      purchasePrice: costPrice,
      unitCost: costPrice,
      stockQuantity: parseInt(formData.stockQuantity, 10) || 1,
      minThreshold: parseInt(formData.minThreshold, 10) || 10,
      maxThreshold: parseInt(formData.maxThreshold, 10) || 50,
      distributorId: formData.distributorId || null,
      vatRate: vat,
      taxRate: vat / 100.0,
      is_weighed_item: Boolean(formData.is_weighed_item),
      category: formData.category || 'ESSENTIALS'
    };

    setIsSubmitting(true);
    let success = false;
    let savedProduct: any = null;
    let errorDetail = '';

    const candidates = getCandidateUrls();
    for (const url of candidates) {
      try {
        const res = await fetch(`${url}/api/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(3000)
        });
        const data = await res.json();
        if (res.ok && (data.success || data.id)) {
          success = true;
          savedProduct = data.product || data;
          break;
        } else {
          errorDetail = data.error || data.message || 'Server rejected product';
        }
      } catch (err: any) {
        errorDetail = err.message || 'Network timeout';
      }
    }

    // 0ms Offline Hardware Chip Fallback: If network unreachable, persist locally directly
    if (!success) {
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
        success = true;
        savedProduct = payload;
      } catch (localErr: any) {
        console.warn('Local fallback save notice:', localErr);
      }
    }

    setIsSubmitting(false);

    if (success && savedProduct) {
      onProductAdded({
        ...payload,
        ...savedProduct,
        price: salePrice,
        sellingPrice: salePrice
      }, andAddToCart);
      onClose();
    } else {
      setErrorMessage(errorDetail || "Could not reach POS server to save product.");
    }
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
        <div className="p-6 overflow-y-auto scroll-zone space-y-5 text-xs">
          
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
            </div>
          </div>

          {/* 2. PIM Pricing Engine (Cost, Sale Price, Live Margin %) */}
          <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                <Percent size={14} className="text-slate-500" /> Pricing & Profitability Engine
              </span>
              {price > 0 && cost > 0 && (
                <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                  marginPercent < 0 
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
                <div className={`w-full text-lg font-black p-2.5 rounded-xl border-2 flex items-center font-mono ${
                  profit < 0 
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
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    formData.vatRate === '10.0'
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Standard 10% VAT
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, vatRate: '0.0' }))}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    formData.vatRate === '0.0'
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
                  className={`rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer border ${
                    !formData.is_weighed_item
                      ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>📦 Unit / Piece</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, is_weighed_item: true }))}
                  className={`rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer border ${
                    formData.is_weighed_item
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
            Save to Catalog Only
          </button>

          <button 
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSave(true)}
            className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <CheckCircle2 size={18} />
            <span>{isSubmitting ? 'Saving...' : 'Save & Add to Cart (Checkout)'}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
