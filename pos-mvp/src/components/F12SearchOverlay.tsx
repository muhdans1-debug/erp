import React, { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import { Search, X } from 'lucide-react';
import { Product } from '../types/pos';
import { getApiBaseUrl, DEFAULT_EDGE_API_URL } from '../utils/apiConfig';

export interface F12SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: Product[];
  apiBase?: string;
  onSelectItem: (item: Product) => void;
}

// Cached local database helper to avoid repetitive JSON parsing on keypresses
let lastRawCache: string | null = null;
let parsedCacheItems: any[] = [];

function getCachedProducts(): any[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('askar_local_db_cache_Product') : null;
    if (!raw) return [];
    if (raw === lastRawCache) return parsedCacheItems;
    lastRawCache = raw;
    const parsed = JSON.parse(raw);
    parsedCacheItems = Array.isArray(parsed) ? parsed : [];
    return parsedCacheItems;
  } catch {
    return [];
  }
}

export const F12SearchOverlay: React.FC<F12SearchOverlayProps> = ({
  isOpen,
  onClose,
  catalog,
  apiBase,
  onSelectItem,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredQuery = useDeferredValue(searchQuery);
  const [serverResults, setServerResults] = useState<Product[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setServerResults([]);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const effectiveCatalog = useMemo(() => {
    try {
      const cached = getCachedProducts();
      if (cached.length > 0) {
        const catalogIds = new Set(catalog.map((p) => p.id));
        const catalogBarcodes = new Set(catalog.map((p) => p.barcode).filter(Boolean));
        const extra = cached
          .filter((c: any) => c && !catalogIds.has(c.id) && (!c.barcode || !catalogBarcodes.has(c.barcode)))
          .map((c: any) => ({
            id: c.id,
            name: c.name,
            price: Number(c.sellingPrice ?? c.price ?? 0),
            unitCost: Number(c.purchasePrice ?? c.unitCost ?? 0),
            barcode: c.barcode || c.id,
            category: c.category,
            isScaleItem: Boolean(c.is_weighed_item),
            vatRate: Number(c.vatRate ?? 0),
            stockQuantity: Number(c.stockQuantity ?? 100)
          }));
        if (extra.length > 0) {
          return [...extra, ...catalog];
        }
      }
    } catch { }
    return catalog;
  }, [catalog]);

  // Pre-indexed search index for instant single-pass matching with zero string conversions
  const searchIndex = useMemo(() => {
    return effectiveCatalog.map((p) => ({
      product: p,
      term: `${p.name} ${p.barcode || ''} ${p.id}`.toLowerCase()
    }));
  }, [effectiveCatalog]);

  const filteredCatalog = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return effectiveCatalog.slice(0, 16);
    const matches: Product[] = [];
    for (let i = 0; i < searchIndex.length; i++) {
      if (searchIndex[i].term.includes(q)) {
        matches.push(searchIndex[i].product);
        if (matches.length >= 16) break; // Perfect fit for Sunmi 1280x800 display without DOM lag
      }
    }
    return matches;
  }, [searchIndex, deferredQuery, effectiveCatalog]);

  // Live Server Fallback Search: Only query server if local matches are zero and user paused typing (800ms)
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || q.length < 3 || filteredCatalog.length > 0) {
      // Local matches already found products; zero network requests needed while typing
      setServerResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const candidates = [
        apiBase,
        getApiBaseUrl(),
        DEFAULT_EDGE_API_URL
      ].filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i);

      for (const base of candidates) {
        try {
          const res = await fetch(`${base}/api/products/search?q=${encodeURIComponent(q)}`, {
            signal: AbortSignal.timeout(2000)
          });
          if (res.ok) {
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data.products || data.data || []);
            if (Array.isArray(list) && list.length > 0) {
              setServerResults(list.slice(0, 16).map((p: any) => ({
                id: p.id,
                name: p.name,
                price: Number(p.sellingPrice ?? p.price ?? 0),
                unitCost: Number(p.purchasePrice ?? p.unitCost ?? 0),
                barcode: p.barcode || p.id,
                category: p.category,
                isScaleItem: Boolean(p.is_weighed_item),
                vatRate: Number(p.vatRate ?? 0),
                stockQuantity: Number(p.stockQuantity !== undefined ? p.stockQuantity : 100)
              })));
              break;
            }
          } else if (res.status === 429) {
            break;
          }
        } catch { }
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [searchQuery, apiBase, filteredCatalog.length]);

  // Merge local matches with server results ensuring zero duplicates
  const displayedProducts = useMemo(() => {
    const localMatches = filteredCatalog;
    const localIds = new Set(localMatches.map((p) => p.id));
    const extraServerMatches = serverResults.filter((p) => !localIds.has(p.id));
    return [...localMatches, ...extraServerMatches].slice(0, 16);
  }, [filteredCatalog, serverResults]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 z-[9999] flex flex-col items-center justify-start p-4 md:p-8 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[88vh] border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
          <Search size={28} className="text-slate-400 shrink-0 ml-2" />
          <input
            ref={inputRef}
            autoFocus
            type="text"
            placeholder="Search full inventory by name, barcode, or PLU... [Enter to add first]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onClose();
              } else if (e.key === 'Enter') {
                if (displayedProducts.length > 0) {
                  onClose();
                  onSelectItem(displayedProducts[0]);
                }
              }
            }}
            className="w-full text-2xl font-bold py-2 bg-transparent outline-none text-slate-800 placeholder-slate-400"
          />
          <div className="flex items-center gap-2 shrink-0">
            <kbd className="px-2 py-1 bg-slate-200 text-slate-600 rounded text-xs font-mono font-bold">Esc</kbd>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Search Results */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 scroll-zone">
          {displayedProducts.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Search size={48} className="mx-auto mb-3 opacity-20" />
              <p className="text-lg font-bold text-slate-600">No products match "{searchQuery}"</p>
              <p className="text-xs text-slate-400 mt-1">Try another keyword or scan the physical barcode.</p>
            </div>
          ) : (
            displayedProducts.map((prod) => {
              const stock = prod.stockQuantity !== undefined && prod.stockQuantity !== null ? Number(prod.stockQuantity) : 99999;
              const isOutOfStock = false; // Unlimited stock mode
              const isLowStock = false;

              return (
                <div
                  key={prod.id}
                  onClick={() => {
                    onClose();
                    onSelectItem(prod);
                  }}
                  className={`p-4 hover:bg-blue-50/70 transition-colors cursor-pointer flex justify-between items-center group ${isOutOfStock ? 'opacity-60 bg-slate-50' : ''
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
                      BD {(prod.price ?? (prod as any).sellingPrice ?? 0).toFixed(3)}
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
  );
};

export default F12SearchOverlay;

