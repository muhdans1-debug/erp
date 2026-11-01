import React, { useState, useEffect } from 'react';
import { Save, X, Barcode, Truck, Percent, Scale, AlertCircle } from 'lucide-react';
import { db } from '../db';

interface AddProductModalProps {
  onClose: () => void;
  onSuccess?: () => void;
  apiBase?: string;
}

export default function AddProductModal({ onClose, onSuccess, apiBase = 'http://localhost:3000' }: AddProductModalProps) {
  const [distributors, setDistributors] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    id: '', // Barcode / SKU
    name: '',
    sellingPrice: '',
    unitCost: '',
    stockQuantity: '10',
    minThreshold: '10',
    maxThreshold: '50',
    distributorId: '',
    vatRate: '10.0',
    is_weighed_item: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const getCandidateUrls = () => {
    const list = [
      apiBase,
      typeof localStorage !== 'undefined' ? localStorage.getItem('master_server_url') : null,
      'http://localhost:3000',
      'http://192.168.8.7:3000'
    ];
    return list.filter((val, idx, arr): val is string => Boolean(val) && arr.indexOf(val) === idx);
  };

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
        } catch {}
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

  const cost = parseFloat(formData.unitCost) || 0;
  const price = parseFloat(formData.sellingPrice) || 0;
  const profit = price > 0 && cost > 0 ? price - cost : 0;
  const marginPercent = price > 0 && cost > 0 ? ((profit / price) * 100) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!formData.name.trim()) {
      setErrorMessage("Product name is required.");
      return;
    }
    if (!formData.sellingPrice || parseFloat(formData.sellingPrice) <= 0) {
      setErrorMessage("Please enter a valid retail selling price.");
      return;
    }

    const cleanBarcode = (formData.id || crypto.randomUUID()).trim();
    const costPrice = parseFloat(formData.unitCost) || 0;
    const salePrice = parseFloat(formData.sellingPrice) || 0;
    const vat = parseFloat(formData.vatRate) || 10.0;

    const payload = {
      id: cleanBarcode,
      barcode: cleanBarcode,
      name: formData.name.trim(),
      sellingPrice: salePrice,
      purchasePrice: costPrice,
      unitCost: costPrice,
      stockQuantity: parseInt(formData.stockQuantity, 10) || 0,
      minThreshold: parseInt(formData.minThreshold, 10) || 10,
      maxThreshold: parseInt(formData.maxThreshold, 10) || 50,
      distributorId: formData.distributorId || null,
      vatRate: vat,
      taxRate: vat / 100.0,
      is_weighed_item: Boolean(formData.is_weighed_item)
    };

    setIsSubmitting(true);
    let success = false;
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
          sql: `INSERT OR REPLACE INTO Product (id, barcode, name, sellingPrice, unitCost, purchasePrice, stockQuantity, minThreshold, maxThreshold, vatRate, taxRate, is_weighed_item) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            payload.is_weighed_item ? 1 : 0
          ]
        });
        success = true;
      } catch (localErr: any) {
        console.warn('Local fallback save notice:', localErr);
      }
    }

    setIsSubmitting(false);

    if (success) {
      onSuccess?.();
      onClose();
    } else {
      setErrorMessage(errorDetail || "Failed to save product to inventory.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden max-h-[90vh] flex flex-col">
        
        <div className="bg-slate-950 p-5 border-b border-slate-800 flex justify-between items-center text-white">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Barcode size={22} className="text-emerald-400" /> Add Product (Enterprise PIM)
          </h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full transition-colors cursor-pointer"><X size={20}/></button>
        </div>

        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-300 rounded-xl flex items-center gap-2 text-rose-900 text-xs font-bold animate-in fade-in">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <span className="flex-1">{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto scroll-zone text-xs">
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-slate-700 font-bold mb-1">Barcode / SKU</label>
              <input type="text" name="id" value={formData.id} onChange={handleChange} className="w-full text-sm p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 font-mono font-bold" placeholder="Scan or auto..." />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-700 font-bold mb-1">Product Name *</label>
              <input type="text" name="name" required autoFocus value={formData.name} onChange={handleChange} className="w-full text-sm p-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold" placeholder="e.g. Almarai Fresh Milk 2L" />
            </div>
          </div>

          {/* Pricing Engine */}
          <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                <Percent size={13} /> PIM Pricing & Margin Engine
              </span>
              {price > 0 && cost > 0 && (
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  marginPercent < 0 ? 'bg-rose-100 text-rose-800' : marginPercent < 15 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {marginPercent.toFixed(1)}% Margin ({profit >= 0 ? `+BD ${profit.toFixed(3)}` : `-BD ${Math.abs(profit).toFixed(3)}`})
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Cost Price (BD)</label>
                <input type="number" step="0.001" name="unitCost" value={formData.unitCost} onChange={handleChange} className="w-full text-base p-2.5 bg-white border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 font-mono font-bold" placeholder="0.000" />
              </div>

              <div>
                <label className="block text-emerald-800 font-bold mb-1">Selling Price (BD) *</label>
                <input type="number" step="0.001" name="sellingPrice" required value={formData.sellingPrice} onChange={handleChange} className="w-full text-base p-2.5 bg-emerald-50 border-2 border-emerald-300 text-emerald-950 rounded-xl outline-none focus:border-emerald-500 font-mono font-bold" placeholder="0.000" />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <span className="text-slate-600 font-bold">VAT Rate:</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, vatRate: '10.0' }))}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    formData.vatRate === '10.0' ? 'bg-slate-900 text-white shadow-xs' : 'bg-white text-slate-600 border'
                  }`}
                >
                  Standard 10%
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, vatRate: '0.0' }))}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    formData.vatRate === '0.0' ? 'bg-emerald-700 text-white shadow-xs' : 'bg-white text-slate-600 border'
                  }`}
                >
                  0% Zero-Rated
                </button>
              </div>
            </div>
          </div>

          {/* Scale toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-center gap-2">
              <Scale size={16} className="text-slate-600" />
              <span className="font-bold text-slate-700">Item Sold by Weight (Scale PLU)?</span>
            </div>
            <input 
              type="checkbox" 
              name="is_weighed_item" 
              checked={formData.is_weighed_item} 
              onChange={handleChange} 
              className="w-4 h-4 text-emerald-600 rounded cursor-pointer" 
            />
          </div>

          {/* Supply Chain */}
          <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-200 space-y-3">
            <h4 className="font-bold text-blue-900 flex items-center gap-1.5"><Truck size={15} /> Restock & Distributor Automation</h4>
            
            <div>
              <label className="block text-blue-900 font-bold mb-1">Select Official Distributor</label>
              <select 
                name="distributorId" 
                value={formData.distributorId} 
                onChange={handleChange}
                className="w-full text-sm p-2.5 bg-white border-2 border-blue-200 rounded-xl outline-none focus:border-blue-500 font-bold text-slate-700 cursor-pointer"
              >
                <option value="">Direct / Local Cash Supplier</option>
                {distributors.map(dist => (
                  <option key={dist.id} value={dist.id}>{dist.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-1">
              <div>
                <label className="block text-blue-900 font-bold mb-1">Stock on Hand</label>
                <input type="number" name="stockQuantity" value={formData.stockQuantity} onChange={handleChange} className="w-full p-2.5 bg-white border-2 border-blue-200 rounded-xl outline-none focus:border-blue-500 font-bold font-mono" />
              </div>
              <div>
                <label className="block text-blue-900 font-bold mb-1">Min Par</label>
                <input type="number" name="minThreshold" value={formData.minThreshold} onChange={handleChange} className="w-full p-2.5 bg-white border-2 border-blue-200 rounded-xl outline-none focus:border-blue-500 font-bold font-mono text-red-600" />
              </div>
              <div>
                <label className="block text-blue-900 font-bold mb-1">Max Capacity</label>
                <input type="number" name="maxThreshold" value={formData.maxThreshold} onChange={handleChange} className="w-full p-2.5 bg-white border-2 border-blue-200 rounded-xl outline-none focus:border-blue-500 font-bold font-mono text-emerald-600" />
              </div>
            </div>
          </div>

          <button type="submit" disabled={isSubmitting} className="w-full h-14 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-base rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md mt-2">
            <Save size={18} /> {isSubmitting ? 'Saving to Database...' : 'Save Product (PIM Catalog)'}
          </button>
        </form>
      </div>
    </div>
  );
}
