import { useState, useEffect } from 'react';
import Barcode from 'react-barcode';
import { Printer, Tag, Sparkles, RefreshCw, CheckCircle2 } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  sellingPrice: number;
  purchasePrice?: number;
  stockQuantity?: number;
  barcode?: string | null;
}

interface BarcodeGeneratorProps {
  apiBase?: string;
}

export default function BarcodeGenerator({ apiBase = 'http://localhost:3000' }: BarcodeGeneratorProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [stickerCount, setStickerCount] = useState<number>(24);
  const [loading, setLoading] = useState<boolean>(true);
  const [customText, setCustomText] = useState<string>('Askar Supermarket');
  const [includeStoreTag, setIncludeStoreTag] = useState<boolean>(true);

  // Fetch products from backend
  const fetchProducts = () => {
    setLoading(true);
    fetch(`${apiBase}/products`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProducts(data);
          // Auto-select first product if none selected
          if (!selectedProduct && data.length > 0) {
            setSelectedProduct(data[0]);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load products for barcode generator:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchProducts();
  }, [apiBase]);

  const handlePrint = () => {
    window.print();
  };

  const barcodeValue = selectedProduct ? (selectedProduct.barcode || selectedProduct.id) : '';

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-slate-900">
      {/* --- NON-PRINTABLE CONTROLS --- */}
      <div className="print:hidden max-w-4xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
        <div className="flex items-center justify-between pb-5 border-b border-slate-100 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <Tag size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Barcode Label Generator</h1>
              <p className="text-sm text-slate-500">
                Generate and print sticky labels for in-house bakery, fresh produce, and unbarcoded goods
              </p>
            </div>
          </div>
          <button
            onClick={fetchProducts}
            disabled={loading}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh Items</span>
          </button>
        </div>

        {/* Configuration Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Product Selector */}
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Select Product
            </label>
            <select
              value={selectedProduct?.id || ''}
              onChange={(e) => {
                const prod = products.find((p) => p.id === e.target.value);
                setSelectedProduct(prod || null);
              }}
              className="w-full border border-slate-300 rounded-xl p-3 bg-slate-50 text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all cursor-pointer"
            >
              <option value="">-- Choose an item --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — BD {Number(p.sellingPrice).toFixed(3)} {p.barcode ? `[Code: ${p.barcode}]` : `[ID: ${p.id}]`}
                </option>
              ))}
            </select>
          </div>

          {/* Sticker Count */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Number of Stickers
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={stickerCount}
                onChange={(e) => setStickerCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full border border-slate-300 rounded-xl p-3 bg-slate-50 text-slate-800 font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all"
                min="1"
                max="240"
              />
            </div>
          </div>
        </div>

        {/* Presets and Options */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Quick Presets:</span>
            {[12, 24, 30, 48].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setStickerCount(count)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  stickerCount === count
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {count} labels
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={includeStoreTag}
                onChange={(e) => setIncludeStoreTag(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
              />
              <span>Store Tag:</span>
            </label>
            {includeStoreTag && (
              <input
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Store Name"
                className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs bg-slate-50 text-slate-700 w-36 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            )}
          </div>
        </div>

        {/* Print Action Bar */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Sparkles size={14} className="text-amber-500" />
            <span>Formats standard A4 3-column sticker sheets (Avery 3x8 template compatible)</span>
          </div>

          <button
            onClick={handlePrint}
            disabled={!selectedProduct}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-8 rounded-xl flex items-center gap-2.5 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Printer size={18} />
            <span>Print Sticker Sheet ({stickerCount} Labels)</span>
          </button>
        </div>
      </div>

      {/* --- PRINTABLE STICKER GRID --- */}
      {selectedProduct ? (
        <div className="max-w-4xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-slate-200 print:shadow-none print:border-none print:p-0 print:max-w-none print:m-0">
          <div className="print:hidden flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <CheckCircle2 size={14} className="text-emerald-500" />
              <span>A4 Print Preview ({stickerCount} Labels)</span>
            </div>
            <div className="text-xs text-slate-400">
              Standard 3 x 8 Grid Layout
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 print:grid-cols-3 print:gap-2">
            {Array.from({ length: stickerCount }).map((_, idx) => (
              <div
                key={idx}
                className="flex flex-col items-center justify-center p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs print:border-dashed print:border-slate-300 print:rounded-lg print:p-2.5 print:shadow-none print:break-inside-avoid"
              >
                {includeStoreTag && (
                  <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-0.5 text-center">
                    {customText}
                  </span>
                )}

                <span className="font-bold text-sm text-slate-800 truncate w-full text-center leading-tight">
                  {selectedProduct.name}
                </span>

                {/* The Barcode SVG Component */}
                <div className="my-1.5 flex justify-center w-full overflow-hidden">
                  <Barcode
                    value={barcodeValue}
                    format="CODE128"
                    width={1.4}
                    height={46}
                    displayValue={false}
                    margin={2}
                  />
                </div>

                <div className="w-full flex items-center justify-between px-2 pt-1 border-t border-slate-100 print:border-slate-200">
                  <span className="text-[11px] font-mono text-slate-500 tracking-wider">
                    {barcodeValue}
                  </span>
                  <span className="font-bold text-sm text-emerald-600 tracking-tight">
                    BD {Number(selectedProduct.sellingPrice).toFixed(3)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto bg-white p-12 rounded-2xl border border-dashed border-slate-300 text-center text-slate-400">
          <Tag size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-semibold text-slate-600 mb-1">No Product Selected</p>
          <p className="text-sm">Select an item above to generate its printable barcode sheet.</p>
        </div>
      )}
    </div>
  );
}
