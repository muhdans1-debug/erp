import { useState, useEffect, useMemo } from 'react';
import RawBarcode from 'react-barcode';
const Barcode = RawBarcode as any;
import { Printer, Tag, Sparkles, RefreshCw, CheckCircle2, Scale } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  sellingPrice: number;
  purchasePrice?: number;
  stockQuantity?: number;
  barcode?: string | null;
  isScaleItem?: boolean;
  is_weighed_item?: number | boolean;
}

interface BarcodeGeneratorProps {
  apiBase?: string;
}

/**
 * Standard GS1 / EAN-13 Modulo-10 Checksum Calculation
 */
export function computeEan13Checksum(digits12: string): number {
  if (!digits12 || digits12.length !== 12) return 0;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(digits12[i], 10);
    // In EAN-13: Odd indices (0, 2, 4...) have weight 1; Even indices (1, 3, 5...) have weight 3
    sum += (i % 2 === 0) ? digit : digit * 3;
  }
  const mod = sum % 10;
  return mod === 0 ? 0 : 10 - mod;
}

/**
 * Generates an in-store EAN-13 Variable Measure Barcode for supermarket weighing scales:
 * - Prefix '20': Price-embedded barcode (Total Price encoded on label)
 * - Prefix '22': Weight-embedded barcode (Weight in grams encoded on label)
 */
export function generateScaleEan13(
  prefix: '20' | '22',
  plu: string | number,
  val: number,
  decimals = 3
): { barcode: string; formattedVal: string; numericPlu: number } {
  const pfx = prefix === '20' ? '20' : '22';
  const numericPlu = parseInt(String(plu).replace(/\D/g, '') || '1', 10);
  const pluStr = String(numericPlu).padStart(5, '0').slice(-5);
  const multiplier = Math.pow(10, decimals);
  const intVal = Math.max(0, Math.round(val * multiplier));
  const valStr = String(intVal).padStart(5, '0').slice(-5);
  const first12 = `${pfx}${pluStr}${valStr}`;
  const checksum = computeEan13Checksum(first12);
  const barcode = `${first12}${checksum}`;
  return {
    barcode,
    formattedVal: val.toFixed(decimals),
    numericPlu
  };
}

export default function BarcodeGenerator({ apiBase = 'http://localhost:3000' }: BarcodeGeneratorProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [stickerCount, setStickerCount] = useState<number>(24);
  const [labelFormat, setLabelFormat] = useState<'A4_SHEET' | 'THERMAL_ROLL' | 'SHELF_TALKER' | 'SCALE_STICKER'>('A4_SHEET');
  const [loading, setLoading] = useState<boolean>(true);
  const [customText, setCustomText] = useState<string>('Askar Supermarket');
  const [includeStoreTag, setIncludeStoreTag] = useState<boolean>(true);

  // Scale Produce & Butchery Settings
  const [scalePrefix, setScalePrefix] = useState<'20' | '22'>('22'); // 22 = Weight, 20 = Price
  const [scaleWeightKg, setScaleWeightKg] = useState<number>(1.250);
  const [scalePluOverride, setScalePluOverride] = useState<string>('');

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

  // Derive active PLU code
  const activePlu = useMemo(() => {
    if (scalePluOverride.trim()) return scalePluOverride.trim();
    if (!selectedProduct) return '101';
    const num = selectedProduct.barcode?.replace(/\D/g, '') || selectedProduct.id.replace(/\D/g, '');
    return num ? num.slice(-5) : '101';
  }, [selectedProduct, scalePluOverride]);

  // Derived price and weight calculations
  const unitPrice = selectedProduct ? Number(selectedProduct.sellingPrice || 0) : 0;
  const computedScalePrice = Number((unitPrice * scaleWeightKg).toFixed(3));

  // Determine active barcode value and barcode standard
  const scaleBarcodeInfo = useMemo(() => {
    const valToEncode = scalePrefix === '22' ? scaleWeightKg : computedScalePrice;
    return generateScaleEan13(scalePrefix, activePlu, valToEncode, 3);
  }, [scalePrefix, activePlu, scaleWeightKg, computedScalePrice]);

  const barcodeValue = labelFormat === 'SCALE_STICKER'
    ? scaleBarcodeInfo.barcode
    : (selectedProduct ? (selectedProduct.barcode || selectedProduct.id) : '');

  const barcodeStandard = labelFormat === 'SCALE_STICKER' ? 'EAN13' : 'CODE128';

  const packDateStr = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }, []);

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
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Barcode Label &amp; Scale Studio</h1>
              <p className="text-sm text-slate-500">
                Generate and print sticky labels for produce scales, shelf rails, thermal rolls, and A4 sticker sheets
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
                if (prod && (prod.isScaleItem || prod.is_weighed_item)) {
                  setLabelFormat('SCALE_STICKER');
                }
              }}
              className="w-full border border-slate-300 rounded-xl p-3 bg-slate-50 text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all cursor-pointer"
            >
              <option value="">-- Choose an item --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — BD {Number(p.sellingPrice).toFixed(3)} {p.barcode ? `[Code: ${p.barcode}]` : `[ID: ${p.id}]`} {Boolean(p.isScaleItem || p.is_weighed_item) ? '⚖️ (Scale Item)' : ''}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => { setLabelFormat('A4_SHEET'); setStickerCount(24); }}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                labelFormat === 'A4_SHEET'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="font-bold text-sm">📄 A4 Sheet (3×8)</div>
              <div className="text-xs text-slate-500 mt-0.5">24 labels/sheet, Avery style</div>
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
              <div className="font-bold text-sm">🏷️ Thermal Roll (50×30)</div>
              <div className="text-xs text-slate-500 mt-0.5">Continuous sticky roll</div>
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
              <div className="text-xs text-slate-500 mt-0.5">Large bold price for rails</div>
            </button>

            <button
              type="button"
              onClick={() => { setLabelFormat('SCALE_STICKER'); setStickerCount(1); }}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                labelFormat === 'SCALE_STICKER'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="font-bold text-sm flex items-center gap-1.5">
                <Scale size={16} className="text-emerald-600" />
                <span>Scale Produce Tag</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">EAN-13 variable weight / price</div>
            </button>
          </div>
        </div>

        {/* Specialized Produce / Deli Scale Controls */}
        {labelFormat === 'SCALE_STICKER' && (
          <div className="mb-6 p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-200/60">
              <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                <Scale size={15} />
                <span>Supermarket Weighing Scale Parameters (GS1 / EAN-13)</span>
              </span>
              <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                Barcode: {scaleBarcodeInfo.barcode}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Scale Barcode Standard</label>
                <select
                  value={scalePrefix}
                  onChange={(e) => setScalePrefix(e.target.value as '20' | '22')}
                  className="w-full border border-slate-300 rounded-lg p-2 bg-white text-xs font-medium focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="22">Prefix 22 (Weight-Embedded in Grams)</option>
                  <option value="20">Prefix 20 (Price-Embedded in Fils)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Net Weight (kg)
                </label>
                <input
                  type="number"
                  step="0.005"
                  min="0.010"
                  max="99.999"
                  value={scaleWeightKg}
                  onChange={(e) => setScaleWeightKg(Math.max(0.001, parseFloat(e.target.value) || 0.001))}
                  className="w-full border border-slate-300 rounded-lg p-2 bg-white text-xs font-bold text-slate-800 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">PLU Code (5 Digits)</label>
                <input
                  type="text"
                  maxLength={5}
                  value={scalePluOverride}
                  onChange={(e) => setScalePluOverride(e.target.value)}
                  placeholder={activePlu}
                  className="w-full border border-slate-300 rounded-lg p-2 bg-white text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between text-xs bg-white p-2.5 rounded-lg border border-emerald-200">
              <span className="text-slate-600">
                Unit Price: <strong className="text-slate-900 font-bold">BD {unitPrice.toFixed(3)} / kg</strong>
              </span>
              <span className="text-slate-600">
                Net Weight: <strong className="text-slate-900 font-bold">{scaleWeightKg.toFixed(3)} kg</strong>
              </span>
              <span className="text-emerald-700 font-black text-sm">
                Total Label Price: BD {computedScalePrice.toFixed(3)}
              </span>
            </div>
          </div>
        )}

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
              {labelFormat === 'SCALE_STICKER'
                ? 'Standard 58mm Thermal Produce & Deli scale format with embedded EAN-13'
                : 'Formatted for thermal label rolls, shelf rails, and standard A4 3x8 sticker sheets'}
            </span>
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
              <span>
                {labelFormat === 'A4_SHEET' && `A4 Sheet Preview (${stickerCount} Labels)`}
                {labelFormat === 'THERMAL_ROLL' && `Continuous Thermal Roll Preview (${stickerCount} Labels)`}
                {labelFormat === 'SHELF_TALKER' && `Shelf Edge Price Talker Preview (${stickerCount} Tags)`}
                {labelFormat === 'SCALE_STICKER' && `Scale Produce & Deli Label Preview (${stickerCount} Labels)`}
              </span>
            </div>
            <div className="text-xs text-slate-400">
              {labelFormat === 'A4_SHEET' && 'Standard 3 × 8 Grid (Avery Style)'}
              {labelFormat === 'THERMAL_ROLL' && '50mm × 30mm Roll Format (1 per page)'}
              {labelFormat === 'SHELF_TALKER' && 'Shelf Rail Format (Large Price BHD)'}
              {labelFormat === 'SCALE_STICKER' && '58mm Thermal Deli Tag (EAN-13 Variable Measure)'}
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
                      format={barcodeStandard}
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
                        format={barcodeStandard}
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

                  <div className="my-1.5 flex justify-center w-full overflow-hidden">
                    <Barcode
                      value={barcodeValue}
                      format={barcodeStandard}
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

          {/* Format 4: ⚖️ Scale Produce & Deli Tag (58mm Thermal, EAN-13 Variable Measure) */}
          {labelFormat === 'SCALE_STICKER' && (
            <div className="flex flex-col items-center gap-3 print:gap-0">
              {Array.from({ length: stickerCount }).map((_, idx) => (
                <div
                  key={idx}
                  className="w-[230px] p-3 bg-white border-2 border-slate-800 rounded-xl flex flex-col justify-between items-center text-center shadow-xs print:w-[58mm] print:border-none print:shadow-none print:p-1.5 print:break-after-page"
                >
                  {includeStoreTag && (
                    <span className="text-[10px] font-black tracking-widest uppercase text-slate-800 leading-none pb-1 border-b border-slate-200 w-full text-center">
                      {customText}
                    </span>
                  )}

                  <div className="py-1 w-full">
                    <h3 className="font-black text-sm text-slate-950 truncate leading-snug">
                      {selectedProduct.name}
                    </h3>
                    <div className="text-[10px] text-slate-500 flex justify-between px-1 pt-0.5">
                      <span>Packed: {packDateStr}</span>
                      <span>PLU: #{activePlu}</span>
                    </div>
                  </div>

                  <div className="w-full bg-slate-50 p-1.5 rounded-lg border border-slate-200 my-1 grid grid-cols-2 text-left text-[11px]">
                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase font-bold">Net Weight</span>
                      <strong className="text-slate-900 font-black">{scaleWeightKg.toFixed(3)} kg</strong>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 block text-[9px] uppercase font-bold">Unit Price</span>
                      <strong className="text-slate-900 font-bold">BD {unitPrice.toFixed(3)}/kg</strong>
                    </div>
                  </div>

                  <div className="w-full py-0.5 text-center">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Total Amount</span>
                    <div className="text-2xl font-black text-emerald-800 tracking-tight leading-none">
                      BD {computedScalePrice.toFixed(3)}
                    </div>
                  </div>

                  <div className="my-1 flex justify-center w-full overflow-hidden">
                    <Barcode
                      value={scaleBarcodeInfo.barcode}
                      format="EAN13"
                      width={1.3}
                      height={40}
                      displayValue={false}
                      margin={0}
                    />
                  </div>

                  <span className="text-[11px] font-mono font-bold text-slate-800 tracking-wider">
                    {scaleBarcodeInfo.barcode}
                  </span>
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
