import React, { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { QuickCategory } from './EditQuickTabsModal';

interface Product {
  id: string;
  name: string;
  sellingPrice: number;
  purchasePrice?: number;
  unitCost?: number;
  vatRate?: number;
  taxRate?: number;
  barcode?: string;
  quantity?: number;
  stockQuantity?: number;
  productId?: string;
  isScaleItem?: boolean;
  scaleWeight?: number;
  category?: string;
  quickColor?: string | null;
  isQuickProduct?: boolean;
}

interface AddQuickProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: Product[];
  currentQuickIds: Set<string>;
  apiBase: string;
  onProductAdded: () => void;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
  categories?: QuickCategory[];
}

const CATEGORY_SWATCHES = [
  { key: 'PRODUCE', label: 'Produce', dot: 'bg-emerald-500' },
  { key: 'BAKERY', label: 'Bakery', dot: 'bg-amber-500' },
  { key: 'DAIRY', label: 'Dairy', dot: 'bg-sky-500' },
  { key: 'MEAT', label: 'Meat / Deli', dot: 'bg-rose-500' },
  { key: 'ESSENTIALS', label: 'Essentials', dot: 'bg-slate-500' },
  { key: 'PROMO', label: 'Special / Promo', dot: 'bg-purple-500' },
];

export const AddQuickProductModal: React.FC<AddQuickProductModalProps> = ({
  isOpen,
  onClose,
  catalog,
  currentQuickIds,
  apiBase,
  onProductAdded,
  showToast,
  categories,
}) => {
  const availableCategories = useMemo(() => {
    if (categories && categories.length > 0) {
      return categories
        .filter((c) => c.id !== 'ALL')
        .map((c) => {
          let dot = 'bg-slate-500';
          if (c.color === 'emerald') dot = 'bg-emerald-500';
          else if (c.color === 'amber') dot = 'bg-amber-500';
          else if (c.color === 'sky') dot = 'bg-sky-500';
          else if (c.color === 'rose') dot = 'bg-rose-500';
          else if (c.color === 'purple') dot = 'bg-purple-500';
          else if (c.color === 'teal') dot = 'bg-teal-500';
          return { key: c.id, label: c.label, dot };
        });
    }
    return CATEGORY_SWATCHES;
  }, [categories]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(() => availableCategories[0]?.key || 'PRODUCE');
  const [isSaving, setIsSaving] = useState(false);

  const availableProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = catalog.filter((p) => !currentQuickIds.has(p.id));
    if (!q) return filtered.slice(0, 15);
    return filtered
      .filter((p) => 
        p.name.toLowerCase().includes(q) || 
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        p.id.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [catalog, currentQuickIds, searchQuery]);

  if (!isOpen) return null;

  const handleAddProduct = async (product: Product) => {
    setIsSaving(true);
    try {
      const candidates = [apiBase, 'http://localhost:3000', 'http://192.168.8.7:3000'].filter(
        (val, idx, arr) => Boolean(val) && arr.indexOf(val) === idx
      );
      let success = false;
      for (const url of candidates) {
        try {
          const res = await fetch(`${url}/api/quick-products/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: product.id,
              barcode: product.barcode,
              category: selectedCategory,
              isQuickProduct: true,
            }),
          });
          if (res.ok) {
            success = true;
            break;
          }
        } catch (e) {
          // next candidate
        }
      }
      if (success) {
        showToast(`✅ Added ${product.name} to Quick Grid (${selectedCategory})`, 'success');
        onProductAdded();
        onClose();
      } else {
        showToast('⚠️ Added locally', 'info');
        onProductAdded();
        onClose();
      }
    } catch (e) {
      showToast('❌ Failed to add product', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-start justify-center pt-4 pb-24 px-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-xl bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 max-h-[85vh] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-100 text-blue-800 text-lg">➕</span>
            <div>
              <h3 className="font-black text-slate-800 text-base leading-tight">
                Add Product to Quick Grid
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Choose category color and tap any product to pin it
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg font-bold"
          >
            <X size={18} />
          </button>
        </div>

        {/* Category Pill Selector */}
        <div className="p-3 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto scroll-zone">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-1">
            Group:
          </span>
          {availableCategories.map((swatch) => (
            <button
              key={swatch.key}
              type="button"
              onClick={() => setSelectedCategory(swatch.key)}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                selectedCategory === swatch.key
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${swatch.dot}`}></span>
              <span>{swatch.label}</span>
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="p-3 border-b border-slate-200">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search product name, barcode, or PLU to add..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* Product List */}
        <div className="p-3 overflow-y-auto space-y-1.5 max-h-[50vh]">
          {availableProducts.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={isSaving}
              onClick={() => handleAddProduct(item)}
              className="w-full p-2.5 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 flex items-center justify-between text-left transition-all cursor-pointer group"
            >
              <div>
                <h5 className="font-bold text-xs text-slate-800 group-hover:text-emerald-700">
                  {item.name}
                </h5>
                <span className="text-[10px] font-mono text-slate-500">
                  {item.barcode || 'NO BARCODE'}
                </span>
              </div>
              <div className="text-right">
                <span className="font-bold text-xs font-mono text-slate-900">
                  BD {item.sellingPrice.toFixed(3)}
                </span>
                <span className="block text-[10px] font-bold text-emerald-600 group-hover:underline">
                  + Add to Grid ↵
                </span>
              </div>
            </button>
          ))}

          {availableProducts.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-xs">
              No matching products found
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
