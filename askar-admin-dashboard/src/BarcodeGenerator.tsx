import { useState, useEffect } from 'react';
import Barcode from 'react-barcode';
import { Printer, Tag, Sparkles, RefreshCw, CheckCircle2 } from 'lucide-react';
import { getApiBaseUrl } from './utils/apiConfig';
import { fetchCatalogProducts } from './services/dataService';

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

export default function BarcodeGenerator({ apiBase: propApiBase }: BarcodeGeneratorProps) {
  const apiBase = propApiBase || getApiBaseUrl();
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [stickerCount, setStickerCount] = useState<number>(24);
  const [labelFormat, setLabelFormat] = useState<'A4_SHEET' | 'THERMAL_ROLL' | 'SHELF_TALKER'>('A4_SHEET');
  const [loading, setLoading] = useState<boolean>(true);
  const [customText, setCustomText] = useState<string>('Askar Supermarket');
  const [includeStoreTag, setIncludeStoreTag] = useState<boolean>(true);

  // Fetch products from backend or Turso cloud direct
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const list = await fetchCatalogProducts(apiBase);
      if (list.length > 0) {
        setProducts(list);
        if (!selectedProduct) {
          setSelectedProduct(list[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load products for barcode generator:', err);
    } finally {
      setLoading(false);
    }
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

        {/* Label Format Selector */}
        <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
            Printer &amp; Label Template
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => { setLabelFormat('A4_SHEET'); setStickerCount(24); }}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                labelFormat === 'A4_SHEET'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="font-bold text-sm">📄 A4 Sticker Sheet</div>
              <div className="text-xs text-slate-500 mt-0.5">3 × 8 (24 labels/sheet, Avery style)</div>
            </button>

            <button
              type="button"
              onClick={() => { setLabelFormat('THERMAL_ROLL'); setStickerCount(1); }}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                labelFormat === 'THERMAL_ROLL'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="font-bold text-sm">🏷️ Thermal Roll Sticker</div>
              <div className="text-xs text-slate-500 mt-0.5">50×30mm / 38×25mm (Xprinter roll)</div>
            </button>

            <button
              type="button"
              onClick={() => { setLabelFormat('SHELF_TALKER'); setStickerCount(6); }}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                labelFormat === 'SHELF_TALKER'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="font-bold text-sm">🔖 Shelf Price Talker</div>
              <div className="text-xs text-slate-500 mt-0.5">Large bold price for grocery shelf rails</div>
            </button>
          </div>
        </div>

        {/* Presets and Options */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Quick Presets:</span>
            {[1, 6, 12, 24, 48].map((count) => (
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
            <span>
              {labelFormat === 'A4_SHEET' && 'Formats standard A4 3-column sticker sheets (Avery 3x8 template compatible)'}
              {labelFormat === 'THERMAL_ROLL' && 'Direct thermal label print (continuous 50×30mm / 38×25mm rolls)'}
              {labelFormat === 'SHELF_TALKER' && 'High-contrast shelf tags with bold BHD pricing for shelf channel rails'}
            </span>
          </div>

          <button
            onClick={handlePrint}
            disabled={!selectedProduct}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-8 rounded-xl flex items-center gap-2.5 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Printer size={18} />
            <span>Print {labelFormat === 'A4_SHEET' ? 'Sheet' : 'Labels'} ({stickerCount} Items)</span>
          </button>
        </div>
      </div>

      {/* --- PRINTABLE STICKER GRID --- */}
      {selectedProduct ? (
        <div className="max-w-4xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-slate-200 print:shadow-none print:border-none print:p-0 print:max-w-none print:m-0">
          <div className="print:hidden flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <CheckCircle2 size={14} className="text-emerald-500" />
              <span>
                {labelFormat === 'A4_SHEET' && `A4 Sheet Preview (${stickerCount} Labels)`}
                {labelFormat === 'THERMAL_ROLL' && `Continuous Thermal Roll Preview (${stickerCount} Labels)`}
                {labelFormat === 'SHELF_TALKER' && `Shelf Edge Price Talker Preview (${stickerCount} Tags)`}
              </span>
            </div>
            <div className="text-xs text-slate-400">
              {labelFormat === 'A4_SHEET' && 'Standard 3 × 8 Grid (Avery Style)'}
              {labelFormat === 'THERMAL_ROLL' && '50mm × 30mm Roll Format (1 per page)'}
              {labelFormat === 'SHELF_TALKER' && 'Shelf Rail Format (Large Price BHD)'}
            </div>
          </div>

          {/* Format 1: Continuous Thermal Roll (50mm x 30mm) */}
          {labelFormat === 'THERMAL_ROLL' && (
            <div className="flex flex-col items-center gap-3 print:gap-0">
              {Array.from({ length: stickerCount }).map((_, idx) => (
                <div
                  key={idx}
                  className="w-[200px] h-[120px] p-2 bg-white border border-slate-300 rounded-lg flex flex-col justify-between items-center text-center shadow-xs print:w-[50mm] print:h-[30mm] print:border-none print:shadow-none print:p-1 print:break-after-page"
                >
                  {includeStoreTag && (
                    <span className="text-[9px] font-bold tracking-widest uppercase text-slate-500 leading-none">
                      {customText}
                    </span>
                  )}
                  <span className="font-bold text-xs text-slate-900 truncate w-full px-1">
                    {selectedProduct.name}
                  </span>
                  <div className="my-0.5 flex justify-center w-full overflow-hidden">
                    <Barcode
                      value={barcodeValue}
                      format="CODE128"
                      width={1.2}
                      height={34}
                      displayValue={false}
                      margin={0}
                    />
                  </div>
                  <div className="w-full flex items-center justify-between px-1 border-t border-slate-200 pt-0.5">
                    <span className="text-[10px] font-mono text-slate-600">{barcodeValue}</span>
                    <span className="font-black text-xs text-emerald-700">BD {Number(selectedProduct.sellingPrice).toFixed(3)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Format 2: Shelf Edge Talker (Large Price for Shelf Rails) */}
          {labelFormat === 'SHELF_TALKER' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print:grid-cols-2 print:gap-3">
              {Array.from({ length: stickerCount }).map((_, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-white border-2 border-slate-900 rounded-xl flex flex-col justify-between shadow-xs print:rounded-none print:border-slate-800 print:break-inside-avoid"
                >
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                    <span className="text-[10px] font-black tracking-widest uppercase text-slate-500">{customText}</span>
                    <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">SHELF TAG</span>
                  </div>
                  <div className="my-2">
                    <div className="font-black text-base text-slate-900 leading-tight line-clamp-2">{selectedProduct.name}</div>
                    <div className="text-3xl font-black text-emerald-700 tracking-tight mt-1">
                      BD {Number(selectedProduct.sellingPrice).toFixed(3)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                    <div className="overflow-hidden">
                      <Barcode
                        value={barcodeValue}
                        format="CODE128"
                        width={1.2}
                        height={30}
                        displayValue={false}
                        margin={0}
                      />
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-700">{barcodeValue}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Format 3: Standard A4 3x8 Sticker Grid */}
          {labelFormat === 'A4_SHEET' && (
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
          )}
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
