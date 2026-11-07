import React, { useState, useMemo } from 'react';
import { Search, Trash2, ArrowLeftRight, Palette, X, Check } from 'lucide-react';
import { QuickCategory } from './EditQuickTabsModal';
import { Product as BaseProduct } from '../types/pos';

export interface Product extends BaseProduct {
  quickColor?: string | null;
}

interface QuickProductEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  catalog: Product[];
  apiBase: string;
  onProductUpdated?: () => void;
  onSwapProduct?: (oldProduct: Product, newProduct: Product, category: string) => void;
  onUpdateColor?: (product: Product, category: string) => void;
  onRemoveProduct?: (product: Product) => void;
  onMovePosition?: (product: Product, direction: 'left' | 'right') => void;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
  categories?: QuickCategory[];
}

const CATEGORY_SWATCHES = [
  { key: 'PRODUCE', label: 'Produce', bg: 'bg-emerald-100 text-emerald-950 border-emerald-300', dot: 'bg-emerald-500' },
  { key: 'BAKERY', label: 'Bakery', bg: 'bg-amber-100 text-amber-950 border-amber-300', dot: 'bg-amber-500' },
  { key: 'DAIRY', label: 'Dairy', bg: 'bg-sky-100 text-sky-950 border-sky-300', dot: 'bg-sky-500' },
  { key: 'MEAT', label: 'Meat / Deli', bg: 'bg-rose-100 text-rose-950 border-rose-300', dot: 'bg-rose-500' },
  { key: 'ESSENTIALS', label: 'Essentials', bg: 'bg-slate-200 text-slate-900 border-slate-300', dot: 'bg-slate-500' },
  { key: 'PROMO', label: 'Special / Promo', bg: 'bg-purple-100 text-purple-950 border-purple-300', dot: 'bg-purple-500' },
];

export const QuickProductEditModal: React.FC<QuickProductEditModalProps> = ({
  isOpen,
  onClose,
  product,
  catalog,
  apiBase,
  onProductUpdated,
  onSwapProduct,
  onUpdateColor,
  onRemoveProduct,
  onMovePosition,
  showToast,
  categories,
}) => {
  const availableCategories = useMemo(() => {
    if (categories && categories.length > 0) {
      return categories
        .filter((c) => c.id !== 'ALL')
        .map((c) => {
          let dot = 'bg-slate-500';
          let bg = 'bg-slate-200 text-slate-900 border-slate-300';
          if (c.color === 'emerald') {
            dot = 'bg-emerald-500';
            bg = 'bg-emerald-100 text-emerald-950 border-emerald-300';
          } else if (c.color === 'amber') {
            dot = 'bg-amber-500';
            bg = 'bg-amber-100 text-amber-950 border-amber-300';
          } else if (c.color === 'sky') {
            dot = 'bg-sky-500';
            bg = 'bg-sky-100 text-sky-950 border-sky-300';
          } else if (c.color === 'rose') {
            dot = 'bg-rose-500';
            bg = 'bg-rose-100 text-rose-950 border-rose-300';
          } else if (c.color === 'purple') {
            dot = 'bg-purple-500';
            bg = 'bg-purple-100 text-purple-950 border-purple-300';
          } else if (c.color === 'teal') {
            dot = 'bg-teal-500';
            bg = 'bg-teal-100 text-teal-950 border-teal-300';
          }
          return { key: c.id, label: c.label, bg, dot };
        });
    }
    return CATEGORY_SWATCHES;
  }, [categories]);
  const [selectedCategory, setSelectedCategory] = useState<string>(product?.category || 'ESSENTIALS');
  const [swapQuery, setSwapQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'COLOR' | 'SWAP'>('COLOR');
  const [isSaving, setIsSaving] = useState(false);

  // Update category when product changes
  React.useEffect(() => {
    if (product) {
      setSelectedCategory(product.category || 'ESSENTIALS');
      setSwapQuery('');
      setActiveTab('COLOR');
    }
  }, [product?.id]);

  // Filter catalog for swapping
  const swapMatches = useMemo(() => {
    const q = swapQuery.trim().toLowerCase();
    if (!q) return catalog.filter((p) => p.id !== product?.id).slice(0, 15);
    return catalog
      .filter((p) => p.id !== product?.id)
      .filter((p) => 
        p.name.toLowerCase().includes(q) || 
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        p.id.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [catalog, swapQuery, product]);

  if (!isOpen || !product) return null;

  // 1. Save Category / Color Change (Instant Local-First + Background Sync)
  const handleSaveColor = async () => {
    setIsSaving(true);
    try {
      if (onUpdateColor) {
        onUpdateColor(product, selectedCategory);
      }

      // Background sync to server
      const candidates = [apiBase, 'http://localhost:3000', 'http://192.168.8.7:3000'].filter(
        (val, idx, arr) => Boolean(val) && arr.indexOf(val) === idx
      );
      for (const url of candidates) {
        try {
          fetch(`${url}/api/quick-products/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: product.id,
              barcode: product.barcode,
              category: selectedCategory,
              isQuickProduct: true,
            }),
          }).catch(() => {});
        } catch {}
      }

      showToast(`🎨 Updated ${product.name} to ${selectedCategory}`, 'success');
      onProductUpdated?.();
      onClose();
    } catch (e) {
      showToast('❌ Failed to update product', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // 2. Swap Item with Another Catalog Product (Instant Local-First + Background Sync)
  const handleSwapItem = async (newProduct: Product) => {
    setIsSaving(true);
    try {
      const targetCategory = selectedCategory || product.category || 'ESSENTIALS';

      // Immediate local swap (works instantly offline & online)
      if (onSwapProduct) {
        onSwapProduct(product, newProduct, targetCategory);
      }

      // Background sync to server if available
      const candidates = [apiBase, 'http://localhost:3000', 'http://192.168.8.7:3000'].filter(
        (val, idx, arr) => Boolean(val) && arr.indexOf(val) === idx
      );
      for (const url of candidates) {
        try {
          fetch(`${url}/api/quick-products/swap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              oldId: product.id,
              newId: newProduct.id,
              category: targetCategory,
            }),
          }).catch(() => {});
        } catch {}
      }

      showToast(`🔄 Swapped with ${newProduct.name}`, 'success');
      onProductUpdated?.();
      onClose();
    } catch (e) {
      showToast('❌ Swap request failed', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // 3. Remove Item from Quick Grid (Instant Local-First + Background Sync)
  const handleRemoveItem = async () => {
    setIsSaving(true);
    try {
      if (onRemoveProduct) {
        onRemoveProduct(product);
      }

      const candidates = [apiBase, 'http://localhost:3000', 'http://192.168.8.7:3000'].filter(
        (val, idx, arr) => Boolean(val) && arr.indexOf(val) === idx
      );
      for (const url of candidates) {
        try {
          fetch(`${url}/api/quick-products/remove`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: product.id,
              barcode: product.barcode,
            }),
          }).catch(() => {});
        } catch {}
      }

      showToast(`🗑️ Removed ${product.name} from Quick Grid`, 'info');
      onProductUpdated?.();
      onClose();
    } catch (e) {
      showToast('❌ Removal failed', 'error');
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
        className="w-full max-w-xl bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-amber-100 text-amber-800 text-lg">✏️</span>
            <div>
              <h3 className="font-black text-slate-800 text-base leading-tight">
                Customize Quick Button
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {product.name} • <span className="font-mono font-bold text-slate-700">BD {(product.price ?? (product as any).sellingPrice ?? 0).toFixed(3)}</span>
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

        {/* Tab Switcher: Color / Swap */}
        <div className="grid grid-cols-2 p-1.5 bg-slate-100 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('COLOR')}
            className={`py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'COLOR'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Palette size={14} />
            <span>Category & Pastel Color</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SWAP')}
            className={`py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'SWAP'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowLeftRight size={14} />
            <span>Swap Item with Another</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {activeTab === 'COLOR' ? (
            <div className="space-y-4">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                Select Peripheral Pastel Group
              </label>
              
              <div className="grid grid-cols-2 gap-2.5">
                {availableCategories.map((swatch) => {
                  const isSelected = selectedCategory.toUpperCase() === swatch.key.toUpperCase();
                  return (
                    <button
                      key={swatch.key}
                      type="button"
                      onClick={() => setSelectedCategory(swatch.key)}
                      className={`p-3 rounded-2xl border-2 flex items-center justify-between text-left transition-all cursor-pointer ${
                        isSelected
                          ? `${swatch.bg} ring-2 ring-slate-800 border-transparent shadow-xs font-black`
                          : `${swatch.bg} opacity-70 hover:opacity-100 border-transparent`
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${swatch.dot}`}></span>
                        <span className="text-xs font-bold">{swatch.label}</span>
                      </div>
                      {isSelected && <Check size={16} className="text-slate-900" />}
                    </button>
                  );
                })}
              </div>

              {/* Preview Box */}
              <div className="mt-4 p-3 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Card Live Preview
                </span>
                <div className={`p-3 rounded-xl border flex flex-col justify-between max-w-[220px] ${
                  availableCategories.find((s) => s.key.toUpperCase() === selectedCategory.toUpperCase())?.bg || 'bg-slate-100 text-slate-900'
                }`}>
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                    {selectedCategory}
                  </span>
                  <p className="font-bold text-xs line-clamp-1 my-1">{product.name}</p>
                  <span className="font-black text-xs font-mono">BD {(product.price ?? (product as any).sellingPrice ?? 0).toFixed(3)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                Search Catalog to Replace "{product.name}"
              </label>

              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Type product name, barcode, or PLU..."
                  value={swapQuery}
                  onChange={(e) => setSwapQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5 mt-2 max-h-[40vh] overflow-y-auto">
                {swapMatches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSwapItem(item)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 flex items-center justify-between text-left transition-all cursor-pointer group"
                  >
                    <div>
                      <h5 className="font-bold text-xs text-slate-800 group-hover:text-blue-700">
                        {item.name}
                      </h5>
                      <span className="text-[10px] font-mono text-slate-500">
                        {item.barcode || 'NO BARCODE'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-xs font-mono text-slate-900">
                        BD {(item.price ?? (item as any).sellingPrice ?? 0).toFixed(3)}
                      </span>
                      <span className="block text-[10px] font-bold text-blue-600 group-hover:underline">
                        Tap to Swap ↵
                      </span>
                    </div>
                  </button>
                ))}

                {swapMatches.length === 0 && (
                  <div className="text-center py-6 text-slate-400 text-xs">
                    No matching products found in catalog
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          {/* Action: Remove from Quick Grid & Reorder Position */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleRemoveItem}
              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs flex items-center gap-1 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <Trash2 size={13} />
              <span>Remove</span>
            </button>

            {onMovePosition && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onMovePosition(product, 'left')}
                  className="px-2.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs flex items-center gap-0.5 transition-all cursor-pointer active:scale-95 shadow-2xs"
                  title="Move card 1 slot earlier in grid"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={() => onMovePosition(product, 'right')}
                  className="px-2.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs flex items-center gap-0.5 transition-all cursor-pointer active:scale-95 shadow-2xs"
                  title="Move card 1 slot later in grid"
                >
                  ▶
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            {activeTab === 'COLOR' && (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveColor}
                className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <Check size={14} />
                <span>Save Color</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
