import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../db.ts';
import { Scale, RefreshCw, Search, HardDrive, Sparkles } from 'lucide-react';
import { QuickCategory, DEFAULT_CATEGORIES } from './EditQuickTabsModal';
import { mapDbRowToProduct } from '../services/productMapper';

export interface ProductItem {
  id: string;
  name: string;
  sellingPrice: number;
  price?: number;
  barcode?: string;
  is_weighed_item?: boolean | number;
  stockQuantity?: number;
  category?: string;
}

export interface POSGridProps {
  onSelectItem?: (product: any) => void;
  className?: string;
  categories?: QuickCategory[];
}

export const POSGrid: React.FC<POSGridProps> = ({ onSelectItem, className = '', categories }) => {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string>('0ms Local Chip (Active)');

  const activeTabs = useMemo(() => {
    if (categories && categories.length > 0) return categories;
    try {
      const saved = localStorage.getItem('pos_quick_categories');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_CATEGORIES;
  }, [categories]);

  // Step 1: Load Products Instantly from the local embedded database (0ms Latency)
  const loadProducts = async () => {
    setLoading(true);
    try {
      // Reads directly from the local SUNMI chip - 0ms latency
      // LIMIT 500 prevents full-table dump into Android WebView memory on large catalogs
      const result = await db.execute('SELECT id, name, sellingPrice, barcode, is_weighed_item, stockQuantity, category FROM Product LIMIT 500');
      const rows = (result.rows || []).map(mapDbRowToProduct);
      setProducts(rows as any);
      setSyncStatus(`0ms Local Chip (${rows.length} Items Loaded)`);
    } catch (error) {
      console.error("Failed to load products from local embedded db:", error);
      setSyncStatus('Local read fallback');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  // Silent sync trigger to Turso cloud
  const handleCloudSync = async () => {
    setIsSyncing(true);
    try {
      const res: any = await db.sync();
      if (res && res.success !== false) {
        setSyncStatus('☁️ Synced to Turso AWS Cloud');
      } else {
        setSyncStatus('💾 Offline Mode - Local chip ready');
      }
      await loadProducts();
    } catch (err) {
      setSyncStatus('💾 Offline Mode - Local chip ready');
    } finally {
      setIsSyncing(false);
      setTimeout(() => {
        setSyncStatus(`0ms Local Chip (${products.length} Items)`);
      }, 3500);
    }
  };

  // Auto-categorize items if not explicitly tagged
  const categorizedProducts = useMemo(() => {
    return products.map((p) => {
      if (p.category) return p;
      const n = (p.name || '').toLowerCase();
      let cat = 'ESSENTIALS';
      if (p.is_weighed_item || n.includes('tomato') || n.includes('cucumber') || n.includes('banana') || n.includes('onion') || n.includes('potato') || n.includes('lemon')) {
        cat = 'PRODUCE';
      } else if (n.includes('bread') || n.includes('khubz') || n.includes('samoli') || n.includes('bun')) {
        cat = 'BAKERY';
      } else if (n.includes('milk') || n.includes('laban') || n.includes('cheese') || n.includes('butter')) {
        cat = 'DAIRY';
      } else if (n.includes('meat') || n.includes('beef') || n.includes('mutton') || n.includes('chicken')) {
        cat = 'MEAT';
      }
      return { ...p, category: cat };
    });
  }, [products]);

  // Filter products by category and live search query
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return categorizedProducts.filter((p) => {
      const matchesCategory = selectedCategory === 'ALL' || p.category === selectedCategory;
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [categorizedProducts, selectedCategory, searchQuery]);

  return (
    <div className={`flex flex-col h-full bg-slate-50 ${className}`}>
      {/* Top Bar: Title, Local/Cloud Status Pill, Search and Refresh */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base font-black text-slate-800 flex items-center gap-1.5">
            <Sparkles size={18} className="text-amber-500" /> Instant POS Grid
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <HardDrive size={12} className="text-emerald-600" /> {syncStatus}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-48 sm:w-64">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-100 hover:bg-slate-200/70 focus:bg-white text-xs font-semibold rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
            />
          </div>

          <button
            type="button"
            onClick={handleCloudSync}
            disabled={isSyncing}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            title="Sync local embedded replica with Turso cloud"
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin text-emerald-600' : ''} />
            <span className="hidden sm:inline">Sync Turso</span>
          </button>
        </div>
      </div>

      {/* Category Pills Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-hide shrink-0">
        {activeTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSelectedCategory(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              selectedCategory === tab.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Touch Grid (Sunmi D2 Mini 60px–80px touch targets) */}
      <div className="flex-1 p-3 overflow-y-auto">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-200/70 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="font-bold text-sm">No products found matching query</p>
            <p className="text-xs mt-1">Check search term or switch category</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filteredProducts.map((product) => {
              const isWeighed = Boolean(product.is_weighed_item);
              const priceDisplay = Number(product.price ?? product.sellingPrice ?? 0).toFixed(3);
              const stock = product.stockQuantity !== undefined && product.stockQuantity !== null ? Number(product.stockQuantity) : null;
              const isOutOfStock = stock !== null && stock <= 0;
              const isLowStock = stock !== null && stock > 0 && stock <= 5;

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onSelectItem?.(product)}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all active:scale-95 cursor-pointer shadow-xs min-h-[88px] relative ${
                    isOutOfStock
                      ? 'bg-slate-100 border-slate-200 text-slate-400 opacity-60'
                      : isWeighed
                      ? 'bg-emerald-50/90 hover:bg-emerald-100/90 border-emerald-200 text-emerald-950'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <span className={`font-extrabold text-xs sm:text-sm line-clamp-2 leading-tight ${isOutOfStock ? 'line-through text-slate-400' : ''}`}>
                        {product.name}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {isWeighed && (
                          <span className="bg-emerald-200 text-emerald-800 text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 uppercase tracking-wider">
                            <Scale size={10} /> KG
                          </span>
                        )}
                        {isOutOfStock ? (
                          <span className="bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                            OUT
                          </span>
                        ) : isLowStock ? (
                          <span className="bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                            {stock} LEFT
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-end justify-between mt-2 pt-1 border-t border-slate-100/60">
                    <span className={`text-[10px] font-mono ${isOutOfStock ? 'text-red-500 font-bold' : isLowStock ? 'text-amber-700 font-bold' : 'text-slate-400'}`}>
                      {isOutOfStock ? 'Out of stock' : stock !== null ? `${stock} in stock` : isWeighed ? 'Per Kg' : 'Unit'}
                    </span>
                    <span className="font-black font-mono text-xs sm:text-sm text-slate-900 tabular-nums">
                      BHD {priceDisplay}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default POSGrid;
