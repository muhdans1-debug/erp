import React, { useState, useEffect, useMemo } from 'react';
import { 
  Printer, 
  Check, 
  RotateCcw, 
  FileText, 
  QrCode, 
  Barcode, 
  Building2, 
  Sparkles,
  Sliders,
  X
} from 'lucide-react';
import { 
  getPrinterStyleConfig, 
  savePrinterStyleConfig, 
  resetPrinterStyleConfig, 
  type SunmiPrinterStyleConfig 
} from '../utils/printerConfig';
import { generateNBRReceiptHtml } from '../utils/receiptTemplate';
import { formatSaleReceiptText, printFullReceipt, showToast } from '../utils/printer';
import { generateNbrQrDataUrl } from '../utils/nbrQr';
import { generateBarcodeDataUrl } from '../utils/printer';

export interface PrinterStyleConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrinterStyleConfigModal: React.FC<PrinterStyleConfigModalProps> = ({
  isOpen,
  onClose
}) => {
  const [config, setConfig] = useState<SunmiPrinterStyleConfig>(getPrinterStyleConfig);
  const [activeTab, setActiveTab] = useState<'store' | 'hardware' | 'toggles' | 'footer'>('hardware');
  const [previewMode, setPreviewMode] = useState<'rendered' | 'monospaced'>('rendered');
  const [previewReceiptType, setPreviewReceiptType] = useState<'CASH' | 'CREDIT'>('CREDIT');
  const [isPrintingTest, setIsPrintingTest] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [previewQrUrl, setPreviewQrUrl] = useState<string>('');
  const [previewBarcodeUrl, setPreviewBarcodeUrl] = useState<string>('');

  // Sample data for realistic supermarket receipt preview
  const sampleItems = useMemo(() => [
    {
      name: 'Apple Royal Gala (Fresh)',
      nameAr: 'تفاح رويال جالا طازج',
      price: 1.200,
      qty: 1.000,
      is_weighed_item: true,
      vatRate: 10,
    },
    {
      name: 'Almarai Fresh Milk 2L',
      nameAr: 'حليب المراعي طازج ٢ لتر',
      price: 0.900,
      qty: 1,
      is_weighed_item: false,
      vatRate: 0, // Zero-rated basic staple
    },
    {
      name: 'Lipton Yellow Label 100s',
      nameAr: 'شاي ليبتون العلامة الصفراء',
      price: 1.450,
      qty: 1,
      is_weighed_item: false,
      vatRate: 10,
    }
  ], []);

  const sampleTotal = 3.550;
  const sampleInvoiceNo = 'INV-946639';

  // Load preview QR & barcode on mount / config change
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const qr = await generateNbrQrDataUrl({
          sellerName: config.shopNameEn,
          vatNumber: config.vatNumber,
          timestamp: new Date(),
          total: sampleTotal,
          vatAmount: 0.241
        }, 160);
        if (isMounted) setPreviewQrUrl(qr);
      } catch {}

      try {
        const bc = generateBarcodeDataUrl(sampleInvoiceNo);
        if (isMounted) setPreviewBarcodeUrl(bc);
      } catch {}
    })();
    return () => { isMounted = false; };
  }, [config.shopNameEn, config.vatNumber]);

  // Sync state when opened
  useEffect(() => {
    if (isOpen) {
      setConfig(getPrinterStyleConfig());
      setSaveSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleUpdate = <K extends keyof SunmiPrinterStyleConfig>(
    key: K, 
    value: SunmiPrinterStyleConfig[K]
  ) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    savePrinterStyleConfig(config);
    setSaveSuccess(true);
    showToast('✅ Printer & Receipt style saved!');
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleReset = () => {
    if (window.confirm('Reset all receipt style settings back to factory defaults?')) {
      const reset = resetPrinterStyleConfig();
      setConfig(reset);
      showToast('🔄 Restored default receipt settings');
    }
  };

  const handleTestPrint = async () => {
    setIsPrintingTest(true);
    try {
      // Temporarily save current draft to test with it
      savePrinterStyleConfig(config);

      const isCredit = previewReceiptType === 'CREDIT';
      const success = await printFullReceipt({
        shopName: config.shopNameEn,
        shopAddress: config.shopAddressEn,
        shopPhone: config.shopPhone,
        vatNumber: config.vatNumber,
        invoiceNo: sampleInvoiceNo,
        items: sampleItems,
        total: sampleTotal,
        subtotal: 3.309,
        vat: 0.241,
        paymentMode: isCredit ? 'CREDIT' : 'CASH',
        customerName: isCredit ? 'Ashraf (Nass Camp)' : undefined,
        customerCardUid: isCredit ? '04:36:66:32:D7:2A:81' : undefined,
        previousBalance: isCredit ? 30.825 : undefined,
        newBalance: isCredit ? 34.375 : undefined,
        cashTendered: isCredit ? undefined : 5.000,
        changeDue: isCredit ? undefined : 1.450,
        cashierName: 'POS-01 (Register 1)',
        saleDate: new Date(),
        styleConfig: config,
      });

      if (success) {
        showToast('🖨️ Physical test receipt sent to Sunmi Innerprinter!');
      } else {
        showToast('⚠️ Test print triggered (check printer or paper roll)');
      }
    } catch (e) {
      console.error('Test print error:', e);
      showToast('❌ Test print failed: ' + String(e));
    } finally {
      setIsPrintingTest(false);
    }
  };

  const isCreditPreview = previewReceiptType === 'CREDIT';

  // Generate live HTML string
  const renderedHtml = generateNBRReceiptHtml({
    invoiceNo: sampleInvoiceNo,
    shopName: config.shopNameEn,
    shopNameAr: config.shopNameAr,
    crNumber: config.crNumber,
    vatNumber: config.vatNumber,
    shopAddress: config.shopAddressEn,
    shopPhone: config.shopPhone,
    staffName: 'POS-01 (Register 1)',
    dateStr: new Date().toLocaleString('en-GB'),
    paymentMode: isCreditPreview ? 'CREDIT' : 'CASH',
    customerName: isCreditPreview ? 'Ashraf (Nass Camp)' : undefined,
    customerCardUid: isCreditPreview ? '04:36:66:32:D7:2A:81' : undefined,
    previousBalance: isCreditPreview ? 30.825 : undefined,
    newBalance: isCreditPreview ? 34.375 : undefined,
    cashTendered: isCreditPreview ? undefined : 5.000,
    changeDue: isCreditPreview ? undefined : 1.450,
    items: sampleItems,
    total: sampleTotal,
    subtotal: 3.309,
    vat: 0.241,
    qrCodeDataUrl: previewQrUrl,
    barcodeDataUrl: previewBarcodeUrl,
    styleConfig: config,
  });

  // Generate live monospaced raw text
  const monospacedText = formatSaleReceiptText({
    shopName: config.shopNameEn,
    shopAddress: config.shopAddressEn,
    shopPhone: config.shopPhone,
    vatNumber: config.vatNumber,
    invoiceNo: sampleInvoiceNo,
    items: sampleItems,
    total: sampleTotal,
    subtotal: 3.309,
    vat: 0.241,
    paymentMode: isCreditPreview ? 'CREDIT' : 'CASH',
    customerName: isCreditPreview ? 'Ashraf (Nass Camp)' : undefined,
    customerCardUid: isCreditPreview ? '04:36:66:32:D7:2A:81' : undefined,
    previousBalance: isCreditPreview ? 30.825 : undefined,
    newBalance: isCreditPreview ? 34.375 : undefined,
    cashTendered: isCreditPreview ? undefined : 5.000,
    changeDue: isCreditPreview ? undefined : 1.450,
    cashierName: 'POS-01 (Register 1)',
    saleDate: new Date(),
    styleConfig: config,
  }).replace(/<<\/?JUMBO_[A-Z]+>>/g, '');

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl h-[92vh] max-h-[820px] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        
        {/* HEADER BAR */}
        <div className="px-5 py-3.5 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-sky-500/20 text-white">
              <Printer size={22} />
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                Sunmi Innerprinter & Receipt Styling
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  Bahrain NBR Retail Standard
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Customize thermal layout, bilingual Arabic/English headers, CR/VAT numbers, and paper density
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestPrint}
              disabled={isPrintingTest}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
              title="Send a sample receipt to the physical Sunmi thermal printer"
            >
              <Printer size={14} className={isPrintingTest ? 'animate-pulse' : ''} />
              <span>{isPrintingTest ? 'Printing...' : 'Print Test Receipt'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* MAIN BODY (GRID: CONFIG CONTROLS ON LEFT, LIVE PREVIEW ON RIGHT) */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          
          {/* LEFT COLUMN: TABS & SETTINGS (7 COLS) */}
          <div className="md:col-span-7 flex flex-col border-r border-slate-700/60 bg-slate-900 overflow-hidden">
            
            {/* TABS HEADER */}
            <div className="flex border-b border-slate-700/70 bg-slate-850 px-2 pt-2 gap-1 shrink-0 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab('store')}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-t-xl transition cursor-pointer ${
                  activeTab === 'store'
                    ? 'bg-slate-900 text-sky-400 border-t-2 border-sky-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Building2 size={14} />
                <span>Store & Tax ID</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('hardware')}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-t-xl transition cursor-pointer ${
                  activeTab === 'hardware'
                    ? 'bg-slate-900 text-sky-400 border-t-2 border-sky-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Sliders size={14} />
                <span>Paper & Quality</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('toggles')}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-t-xl transition cursor-pointer ${
                  activeTab === 'toggles'
                    ? 'bg-slate-900 text-sky-400 border-t-2 border-sky-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Sparkles size={14} />
                <span>Layout & Toggles</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('footer')}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-t-xl transition cursor-pointer ${
                  activeTab === 'footer'
                    ? 'bg-slate-900 text-sky-400 border-t-2 border-sky-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <FileText size={14} />
                <span>Footer & Policy</span>
              </button>
            </div>

            {/* TAB CONTENTS (SCROLLABLE) */}
            <div className="flex-1 p-5 overflow-y-auto space-y-4">
              
              {/* TAB 1: STORE & TAX IDENTITY */}
              {activeTab === 'store' && (
                <div className="space-y-4">
                  <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-3 text-xs text-sky-200">
                    <p className="font-semibold mb-0.5">🇧🇭 Bahrain Ministry of Industry and Commerce & NBR Compliance</p>
                    <p className="text-slate-400 text-[11px]">
                      Under Article 53 of the Bahrain VAT Executive Regulations, simplified tax invoices must prominently display the official registered legal name, Commercial Registration (C.R. No.), and 15-digit VAT Account TRN.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        Store Name (English)
                      </label>
                      <input
                        type="text"
                        value={config.shopNameEn}
                        onChange={(e) => handleUpdate('shopNameEn', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm font-semibold text-white focus:outline-none focus:border-sky-500"
                        placeholder="ASKAR SUPERMARKET"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1 text-right">
                        Store Name (Arabic) / الاسم التجاري بالعربية
                      </label>
                      <input
                        type="text"
                        dir="rtl"
                        value={config.shopNameAr}
                        onChange={(e) => handleUpdate('shopNameAr', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm font-semibold text-white text-right focus:outline-none focus:border-sky-500"
                        placeholder="أسواق عسكر المركزية"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        C.R. Number (السجل التجاري)
                      </label>
                      <input
                        type="text"
                        value={config.crNumber}
                        onChange={(e) => handleUpdate('crNumber', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm font-mono font-semibold text-white focus:outline-none focus:border-sky-500"
                        placeholder="790614189"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        VAT Registration No (الرقم الضريبي 15-Digit)
                      </label>
                      <input
                        type="text"
                        value={config.vatNumber}
                        onChange={(e) => handleUpdate('vatNumber', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm font-mono font-semibold text-white focus:outline-none focus:border-sky-500"
                        placeholder="200012345678901"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Store Address (English)
                    </label>
                    <input
                      type="text"
                      value={config.shopAddressEn}
                      onChange={(e) => handleUpdate('shopAddressEn', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-sky-500"
                      placeholder="Building 123, Road 456, Block 951, Askar, Bahrain"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1 text-right">
                      Store Address (Arabic) / العنوان بالعربية
                    </label>
                    <input
                      type="text"
                      dir="rtl"
                      value={config.shopAddressAr}
                      onChange={(e) => handleUpdate('shopAddressAr', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white text-right focus:outline-none focus:border-sky-500"
                      placeholder="مبنى ١٢٣، طريق ٤٥٦، مجمع ٩٥١، عسكر، البحرين"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Store Telephone / WhatsApp Contact
                    </label>
                    <input
                      type="text"
                      value={config.shopPhone}
                      onChange={(e) => handleUpdate('shopPhone', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-sky-500"
                      placeholder="+973 33843855"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: HARDWARE & PAPER */}
              {activeTab === 'hardware' && (
                <div className="space-y-4">
                  {/* FEATURED: SENIOR & LABORER HIGH-LEGIBILITY MODE */}
                  <div className="bg-gradient-to-r from-emerald-950/60 to-slate-800 p-4 rounded-2xl border-2 border-emerald-500/50 shadow-lg flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-white">Senior & Laborer High-Legibility Mode</span>
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          Recommended
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">
                        نمط الخط العريض والواضح للعمال وكبار السن
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Deep thermal burn, ultra-bold font weights, and giant framed debt totals for older workers reading without glasses.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUpdate('seniorHighLegibility', !config.seniorHighLegibility)}
                      className={`w-14 h-7 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                        config.seniorHighLegibility ? 'bg-emerald-600 shadow-md shadow-emerald-600/30' : 'bg-slate-700'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white absolute top-1 transition-transform ${
                        config.seniorHighLegibility ? 'right-1' : 'left-1'
                      }`} />
                    </button>
                  </div>

                  {/* GRAND TOTAL PRICE DISPLAY SIZE */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Grand Total & Debt Amount Scale (حجم المجموع والرصيد)
                    </label>
                    <p className="text-[11px] text-slate-400 mb-2">
                      Scales the main Total Price and Khata Current Balance on printed thermal slips.
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {(['standard', 'extra_bold', 'jumbo'] as const).map((ts) => (
                        <button
                          key={ts}
                          type="button"
                          onClick={() => handleUpdate('totalBannerSize', ts)}
                          className={`py-2 px-3 rounded-xl border text-center font-bold text-xs capitalize transition cursor-pointer flex flex-col items-center justify-center ${
                            config.totalBannerSize === ts
                              ? 'bg-sky-500/20 border-sky-500 text-white'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                          }`}
                        >
                          <span>{ts === 'standard' ? 'Standard (20pt)' : (ts === 'extra_bold' ? 'Extra Bold (28pt)' : 'Jumbo (36pt)')}</span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            {ts === 'jumbo' ? 'Laborer High Legibility' : (ts === 'extra_bold' ? 'Compact Bold' : 'Standard ESC/POS')}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* PAPER WIDTH SELECTOR */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-2">
                      Thermal Paper Roll Width
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => handleUpdate('paperWidth', '58mm')}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                          config.paperWidth === '58mm'
                            ? 'bg-sky-500/20 border-sky-500 text-white shadow-md shadow-sky-500/10'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-black text-sm">58mm Roll (Standard)</span>
                          {config.paperWidth === '58mm' && <Check size={16} className="text-sky-400" />}
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Native internal thermal printer on Sunmi D2mini, V2, and compact POS terminals (32 columns).
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdate('paperWidth', '80mm')}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                          config.paperWidth === '80mm'
                            ? 'bg-sky-500/20 border-sky-500 text-white shadow-md shadow-sky-500/10'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-black text-sm">80mm Wide Roll</span>
                          {config.paperWidth === '80mm' && <Check size={16} className="text-sky-400" />}
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Wide rolls for external ESC/POS kitchen or checkout stations (48 columns).
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* FONT SIZE SELECTOR */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-2">
                      Typography Size on Thermal Paper
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['compact', 'standard', 'large'] as const).map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => handleUpdate('fontSize', sz)}
                          className={`py-2 px-3 rounded-xl border text-center font-bold text-xs capitalize transition cursor-pointer ${
                            config.fontSize === sz
                              ? 'bg-sky-500/20 border-sky-500 text-white'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                          }`}
                        >
                          {sz === 'compact' && 'Compact (18pt)'}
                          {sz === 'standard' && 'Standard (20pt)'}
                          {sz === 'large' && 'Large (24pt)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* PRINT DENSITY (HEAT DARKNESS) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-2">
                      Print Darkness & Thermal Burn Density
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdate('printDensity', 'normal')}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          config.printDensity === 'normal'
                            ? 'bg-sky-500/20 border-sky-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <div className="font-bold text-xs">Normal</div>
                        <div className="text-[10px] text-slate-400">Standard ESC/POS</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdate('printDensity', 'dark')}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          config.printDensity === 'dark'
                            ? 'bg-sky-500/20 border-sky-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <div className="font-bold text-xs">Dark</div>
                        <div className="text-[10px] text-slate-400">Emphasized Bold</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdate('printDensity', 'deep_burn')}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          config.printDensity === 'deep_burn'
                            ? 'bg-emerald-500/20 border-emerald-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <div className="font-bold text-xs text-emerald-400">Deep Burn (A+)</div>
                        <div className="text-[10px] text-slate-400">High Contrast Bold</div>
                      </button>
                    </div>
                  </div>

                  {/* FEED LINES & AUTO-CUT */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        Trailing Feed Lines: {config.feedLines}
                      </label>
                      <p className="text-[11px] text-slate-400 mb-2">
                        Feeds receipt past manual tear bar so barcode isn't clipped.
                      </p>
                      <div className="flex gap-2">
                        {[2, 4, 6, 8].map(lines => (
                          <button
                            key={lines}
                            type="button"
                            onClick={() => handleUpdate('feedLines', lines)}
                            className={`flex-1 py-1 rounded text-xs font-bold cursor-pointer ${
                              config.feedLines === lines
                                ? 'bg-sky-600 text-white'
                                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                          >
                            {lines}L
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex items-center justify-between">
                      <div>
                        <span className="block text-xs font-bold text-slate-300">Auto Paper Cut</span>
                        <span className="text-[11px] text-slate-400">
                          Trigger mechanical cutter if terminal has one
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUpdate('autoCut', !config.autoCut)}
                        className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                          config.autoCut ? 'bg-emerald-600' : 'bg-slate-700'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                          config.autoCut ? 'right-1' : 'left-1'
                        }`} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: LAYOUT & TOGGLES */}
              {activeTab === 'toggles' && (
                <div className="space-y-3">
                  <div className="text-xs text-slate-400 mb-2">
                    Enable or disable specific sections on printed receipts:
                  </div>

                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>Bilingual Store Header (Arabic + English)</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Prints store name and "فاتورة ضريبية مبسطة" in Arabic
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUpdate('showArabicHeader', !config.showArabicHeader)}
                      className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                        config.showArabicHeader ? 'bg-sky-600' : 'bg-slate-700'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                        config.showArabicHeader ? 'right-1' : 'left-1'
                      }`} />
                    </button>
                  </div>

                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white">Arabic Product Names</div>
                      <div className="text-[11px] text-slate-400">
                        Prints Arabic item translation when available in database
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUpdate('showArabicItems', !config.showArabicItems)}
                      className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                        config.showArabicItems ? 'bg-sky-600' : 'bg-slate-700'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                        config.showArabicItems ? 'right-1' : 'left-1'
                      }`} />
                    </button>
                  </div>

                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white">VAT Breakdown Table (10% vs 0%)</div>
                      <div className="text-[11px] text-slate-400">
                        Separate rows for Standard 10% VAT and Zero-Rated 0% basic food goods
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUpdate('showVatBreakdown', !config.showVatBreakdown)}
                      className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                        config.showVatBreakdown ? 'bg-sky-600' : 'bg-slate-700'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                        config.showVatBreakdown ? 'right-1' : 'left-1'
                      }`} />
                    </button>
                  </div>

                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <QrCode size={13} className="text-emerald-400" />
                        <span>NBR Tax QR Code (Article 53 TLV Base64)</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Required by Bahrain National Bureau for Revenue compliance
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUpdate('showNbrQr', !config.showNbrQr)}
                      className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                        config.showNbrQr ? 'bg-emerald-600' : 'bg-slate-700'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                        config.showNbrQr ? 'right-1' : 'left-1'
                      }`} />
                    </button>
                  </div>

                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Barcode size={13} className="text-sky-400" />
                        <span>Return Barcode (Code128)</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Scannable barcode for instantaneous invoice lookup during refunds
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUpdate('showReturnBarcode', !config.showReturnBarcode)}
                      className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                        config.showReturnBarcode ? 'bg-sky-600' : 'bg-slate-700'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                        config.showReturnBarcode ? 'right-1' : 'left-1'
                      }`} />
                    </button>
                  </div>

                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <QrCode size={13} className="text-purple-400" />
                        <span>Khata Live Statement QR (Credit Sales)</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Allows credit customers to scan and view ledger & pay via BenefitPay
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUpdate('showKhataQr', !config.showKhataQr)}
                      className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                        config.showKhataQr ? 'bg-purple-600' : 'bg-slate-700'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                        config.showKhataQr ? 'right-1' : 'left-1'
                      }`} />
                    </button>
                  </div>

                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>Framed Khata Debt Due Box (صندوق رصيد الآجل)</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Always prints previous debt, this bill addition, and massive bold new balance due on credit slips
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUpdate('showCreditBalanceBox', !config.showCreditBalanceBox)}
                      className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                        config.showCreditBalanceBox ? 'bg-emerald-600' : 'bg-slate-700'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                        config.showCreditBalanceBox ? 'right-1' : 'left-1'
                      }`} />
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 4: FOOTER & POLICY */}
              {activeTab === 'footer' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Return & Exchange Policy (English)
                    </label>
                    <textarea
                      rows={2}
                      value={config.footerPolicyEn}
                      onChange={(e) => handleUpdate('footerPolicyEn', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500 resize-none"
                      placeholder="Exchange or return accepted within 3 days with receipt"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1 text-right">
                      Return & Exchange Policy (Arabic) / سياسة الاستبدال والاسترجاع
                    </label>
                    <textarea
                      rows={2}
                      dir="rtl"
                      value={config.footerPolicyAr}
                      onChange={(e) => handleUpdate('footerPolicyAr', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white text-right focus:outline-none focus:border-sky-500 resize-none"
                      placeholder="الاستبدال والاسترجاع خلال ٣ أيام مع إحضار الفاتورة الأصلية"
                    />
                  </div>

                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 text-xs text-slate-400 space-y-1">
                    <p className="font-bold text-slate-200">Customer Gratitude Footer:</p>
                    <p>• THANK YOU FOR SHOPPING!</p>
                    <p>• شكراً لتسوقكم معنا!</p>
                  </div>
                </div>
              )}
            </div>

            {/* BOTTOM FOOTER BUTTONS */}
            <div className="p-4 bg-slate-850 border-t border-slate-700 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition cursor-pointer"
              >
                <RotateCcw size={14} />
                <span>Reset Defaults</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-black shadow-lg shadow-sky-600/30 transition cursor-pointer"
                >
                  <Check size={16} />
                  <span>{saveSuccess ? 'Saved!' : 'Save & Apply Style'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: LIVE THERMAL RECEIPT SIMULATOR (5 COLS) */}
          <div className="md:col-span-5 flex flex-col bg-slate-950 p-4 overflow-hidden">
            
            {/* SIMULATOR HEADER */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 shrink-0">
              <div className="flex items-center gap-1.5">
                <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setPreviewReceiptType('CREDIT')}
                    className={`px-2 py-1 text-[11px] font-bold rounded cursor-pointer transition ${
                      previewReceiptType === 'CREDIT' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Khata Credit
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewReceiptType('CASH')}
                    className={`px-2 py-1 text-[11px] font-bold rounded cursor-pointer transition ${
                      previewReceiptType === 'CASH' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Cash Bill
                  </button>
                </div>
              </div>

              {/* VIEW MODE TOGGLE */}
              <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                <button
                  type="button"
                  onClick={() => setPreviewMode('rendered')}
                  className={`px-2 py-1 text-[11px] font-bold rounded cursor-pointer transition ${
                    previewMode === 'rendered' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Visual Slip
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('monospaced')}
                  className={`px-2 py-1 text-[11px] font-bold rounded cursor-pointer transition ${
                    previewMode === 'monospaced' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Monospace
                </button>
              </div>
            </div>

            {/* SIMULATOR SCROLLABLE CANVAS (REALISTIC THERMAL PAPER) */}
            <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 p-3 overflow-y-auto flex justify-center items-start shadow-inner">
              
              {previewMode === 'rendered' ? (
                /* RENDERED HTML SLIP */
                <div 
                  className="bg-white text-black shadow-2xl rounded-sm p-3 relative transition-all"
                  style={{
                    width: config.paperWidth === '80mm' ? '300px' : '230px',
                    fontFamily: "'Roboto Mono', Consolas, monospace",
                  }}
                >
                  {/* Top jagged paper tear edge */}
                  <div className="absolute -top-1.5 left-0 right-0 h-1.5 bg-repeat-x opacity-30"
                    style={{
                      backgroundImage: 'radial-gradient(circle, transparent, transparent 50%, #fff 50%, #fff 100%)',
                      backgroundSize: '6px 6px'
                    }}
                  />

                  {/* Rendered iframe simulation */}
                  <iframe
                    srcDoc={renderedHtml}
                    title="Live Thermal Receipt Preview"
                    className="w-full border-none pointer-events-none"
                    style={{
                      height: '620px',
                      overflow: 'hidden'
                    }}
                  />

                  {/* Bottom jagged paper tear edge */}
                  <div className="absolute -bottom-1.5 left-0 right-0 h-1.5 bg-repeat-x opacity-30"
                    style={{
                      backgroundImage: 'radial-gradient(circle, transparent, transparent 50%, #fff 50%, #fff 100%)',
                      backgroundSize: '6px 6px'
                    }}
                  />
                </div>
              ) : (
                /* MONOSPACED RAW STREAM */
                <div 
                  className="bg-zinc-900 border border-zinc-700 text-emerald-400 p-4 rounded-lg font-mono text-xs whitespace-pre-wrap leading-tight shadow-xl"
                  style={{
                    width: config.paperWidth === '80mm' ? '320px' : '250px',
                  }}
                >
                  {monospacedText}
                </div>
              )}
            </div>

            {/* LIVE PREVIEW CAPTION */}
            <div className="mt-2 text-center text-[10px] text-slate-500 shrink-0">
              Matches Sunmi ESC/POS hardware buffer output. Tap "Print Test Receipt" to verify on paper.
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default PrinterStyleConfigModal;
