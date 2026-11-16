// pos-mvp/src/components/PreviousBillsModal.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Printer, Search, X, Receipt, Eye, Clock, 
  FileText, RefreshCw
} from 'lucide-react';
import { 
  RecentSale, 
  getRecentSales, 
  fetchRecentSalesFromDb
} from '../services/recentSalesService';
import { printFullReceipt, showToast } from '../utils/printer';

interface PreviousBillsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PreviousBillsModal: React.FC<PreviousBillsModalProps> = ({ isOpen, onClose }) => {
  const [sales, setSales] = useState<RecentSale[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'CASH' | 'BENEFIT' | 'KHATA'>('ALL');
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [previewSale, setPreviewSale] = useState<RecentSale | null>(null);
  const [loading, setLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load sales on open
  useEffect(() => {
    if (!isOpen) return;

    // 1. Instant synchronous read from localStorage
    const local = getRecentSales();
    setSales(local);

    // 2. If local cache has fewer than 10 records, fetch from SQLite replica
    if (local.length < 10) {
      setLoading(true);
      fetchRecentSalesFromDb(40)
        .then((dbSales) => {
          if (Array.isArray(dbSales) && dbSales.length > 0) {
            setSales(dbSales);
          }
        })
        .finally(() => setLoading(false));
    }

    // 3. Listen for any new sales completed reactively
    const handleUpdate = () => {
      setSales(getRecentSales());
    };
    window.addEventListener('askar-recent-sales-updated', handleUpdate);

    // Focus search input
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);

    return () => {
      window.removeEventListener('askar-recent-sales-updated', handleUpdate);
    };
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewSale) {
          setPreviewSale(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, previewSale, onClose]);

  // Filtered sales
  const filteredSales = useMemo(() => {
    const q = searchQuery.trim().toLowerCase().replace(/^#/, '').replace(/^inv-/, '');
    
    return sales.filter((s) => {
      // Payment filter
      if (filterMode === 'CASH' && !s.paymentMode?.toUpperCase().includes('CASH')) return false;
      if (filterMode === 'BENEFIT' && !s.paymentMode?.toUpperCase().includes('BENEFIT')) return false;
      if (filterMode === 'KHATA' && !['KHATA', 'CREDIT', 'CREDIT_PERSONAL'].includes(s.paymentMode?.toUpperCase())) return false;

      // Query filter
      if (!q) return true;
      const invClean = (s.invoiceNo || '').toLowerCase().replace(/^#/, '').replace(/^inv-/, '');
      if (invClean.includes(q)) return true;
      if (s.customerName && s.customerName.toLowerCase().includes(q)) return true;
      if (s.paymentMode && s.paymentMode.toLowerCase().includes(q)) return true;
      
      // Also match item names
      if (s.items && s.items.some((it) => it.name && it.name.toLowerCase().includes(q))) return true;

      return false;
    });
  }, [sales, searchQuery, filterMode]);

  // Handle reprint action
  const handleReprint = async (sale: RecentSale) => {
    const saleId = sale.invoiceNo;
    setPrintingId(saleId);
    try {
      showToast(`🖨️ Printing Receipt #${sale.invoiceNo}...`);

      const formattedItems = (sale.items || []).map((it) => ({
        id: it.name,
        name: it.name,
        nameAr: it.nameAr,
        qty: it.qty,
        price: it.price,
        vatRate: it.vatRate !== undefined ? it.vatRate : 10,
        is_weighed_item: it.is_weighed_item,
        scaleWeight: it.scaleWeight
      }));

      await printFullReceipt({
        invoiceNo: sale.invoiceNo,
        items: formattedItems as any,
        subtotal: sale.subtotal,
        vat: sale.vat,
        total: sale.total,
        paymentMode: sale.paymentMode,
        cashTendered: sale.cashTendered,
        changeDue: sale.changeDue,
        customerName: sale.customerName,
        customerCardUid: sale.customerCardUid,
        customerId: sale.customerId,
        cashierName: sale.cashierName || 'Register 01',
        transactionRef: sale.transactionRef,
        isReprint: true // 🏷️ Strictly tag as duplicate reprint
      });

      showToast(`✅ Receipt #${sale.invoiceNo} Printed!`);
    } catch (err) {
      console.error('Failed to reprint receipt:', err);
      showToast('❌ Failed to reprint receipt');
    } finally {
      setTimeout(() => setPrintingId(null), 800);
    }
  };

  // Helper to format date relative
  const formatTimeAgo = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;
      const now = new Date();
      const diffSecs = Math.floor((now.getTime() - date.getTime()) / 1000);

      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

      if (diffSecs < 60) return `Just now • ${timeStr}`;
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `${diffMins}m ago • ${timeStr}`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago • ${timeStr}`;

      return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} • ${timeStr}`;
    } catch {
      return '';
    }
  };

  if (!isOpen) return null;

  const mostRecent = sales[0] || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-4xl h-[92vh] flex flex-col bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-black border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-neutral-900 rounded-xl border border-neutral-800 text-green-400">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-wide flex items-center gap-2">
                PREVIOUS BILLS & REPRINTS
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-neutral-800 text-zinc-400 border border-neutral-700">
                  F9
                </span>
              </h2>
              <p className="text-xs text-zinc-400">سجل الفواتير السابقة وإعادة الطباعة</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-12 h-12 flex items-center justify-center rounded-xl bg-neutral-900 hover:bg-neutral-800 text-zinc-400 hover:text-white border border-neutral-800 active:scale-95 transition-all cursor-pointer"
            title="Close [ESC]"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Pinned Most Recent Bill Quick-Action (Zero-Search 1-Tap) */}
        {mostRecent && !searchQuery && filterMode === 'ALL' && (
          <div className="bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-950 border-b border-neutral-800 px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">LATEST BILL:</span>
                  <span className="text-sm font-black text-white">#{mostRecent.invoiceNo}</span>
                  <span className="text-xs text-zinc-400">({formatTimeAgo(mostRecent.timestamp)})</span>
                </div>
                <div className="text-xs text-zinc-300 truncate">
                  {mostRecent.items?.length || 0} items • {mostRecent.paymentMode} • <span className="font-bold text-green-400">BD {mostRecent.total.toFixed(3)}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => handleReprint(mostRecent)}
              disabled={printingId === mostRecent.invoiceNo}
              className="px-5 py-2.5 bg-green-500 hover:bg-green-400 text-black font-black rounded-xl text-sm flex items-center gap-2 active:scale-95 transition-all shadow-lg shrink-0 cursor-pointer disabled:opacity-50"
            >
              {printingId === mostRecent.invoiceNo ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>PRINTING...</span>
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4" />
                  <span>REPRINT LAST BILL</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="p-4 bg-neutral-900/90 border-b border-neutral-800 flex flex-col sm:flex-row gap-3">
          {/* Live Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search invoice digits (e.g. 5048), customer, or item..."
              className="w-full h-12 pl-12 pr-10 bg-black border border-neutral-800 rounded-xl text-white placeholder-zinc-500 text-base font-semibold focus:outline-none focus:border-green-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {(['ALL', 'CASH', 'BENEFIT', 'KHATA'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`px-4 h-12 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                  filterMode === mode
                    ? 'bg-white text-black shadow-md'
                    : 'bg-neutral-800 text-zinc-300 hover:bg-neutral-700'
                }`}
              >
                {mode === 'BENEFIT' ? 'BENEFITPAY' : mode}
              </button>
            ))}
          </div>
        </div>

        {/* Main Body: List + Slip Preview */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Bills List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading && sales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-green-500" />
                <p className="text-sm font-semibold">Loading recent sales from database...</p>
              </div>
            ) : filteredSales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-3">
                <FileText className="w-12 h-12 text-zinc-700" />
                <p className="text-base font-bold text-zinc-400">No transactions found</p>
                <p className="text-xs text-zinc-500">
                  {searchQuery ? `No sales match "${searchQuery}"` : 'No recent transactions recorded on this terminal.'}
                </p>
              </div>
            ) : (
              filteredSales.map((sale, idx) => {
                const isPrinting = printingId === sale.invoiceNo;
                const isSelectedForPreview = previewSale?.invoiceNo === sale.invoiceNo;

                return (
                  <div
                    key={`${sale.invoiceNo}-${idx}`}
                    className={`p-4 rounded-xl border transition-all ${
                      isSelectedForPreview
                        ? 'bg-neutral-800 border-green-500 shadow-lg'
                        : 'bg-black border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      
                      {/* Left: Invoice & Meta */}
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-lg font-black text-white">
                            #{sale.invoiceNo}
                          </span>
                          
                          {/* Payment Mode Badge */}
                          <span className={`text-[11px] font-black px-2 py-0.5 rounded uppercase ${
                            sale.paymentMode?.toUpperCase().includes('BENEFIT')
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : sale.paymentMode?.toUpperCase().includes('KHATA') || sale.paymentMode?.toUpperCase().includes('CREDIT')
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              : 'bg-green-500/20 text-green-400 border border-green-500/30'
                          }`}>
                            {sale.paymentMode || 'CASH'}
                          </span>

                          <span className="text-xs text-zinc-400 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {formatTimeAgo(sale.timestamp)}
                          </span>
                        </div>

                        {/* Customer or Items Snippet */}
                        <div className="text-xs text-zinc-300 truncate">
                          {sale.customerName ? (
                            <span className="font-bold text-white mr-2">👤 {sale.customerName}</span>
                          ) : null}
                          <span className="text-zinc-400">
                            {sale.items && sale.items.length > 0
                              ? sale.items.map((it) => `${it.name} (${it.qty}${it.is_weighed_item ? 'kg' : ''})`).join(', ')
                              : 'Standard Sale'}
                          </span>
                        </div>
                      </div>

                      {/* Right: Total Amount & Action Buttons */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-900">
                        <div className="text-right">
                          <div className="text-xs text-zinc-400">Total</div>
                          <div className="text-xl font-black text-green-400">
                            BD {sale.total.toFixed(3)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Preview Button */}
                          <button
                            onClick={() => setPreviewSale(isSelectedForPreview ? null : sale)}
                            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                              isSelectedForPreview
                                ? 'bg-zinc-200 text-black border-zinc-200'
                                : 'bg-neutral-900 hover:bg-neutral-800 text-zinc-300 border-neutral-700'
                            }`}
                            title="Preview Thermal Receipt"
                          >
                            <Eye className="w-5 h-5" />
                          </button>

                          {/* Print Button (Massive Target) */}
                          <button
                            onClick={() => handleReprint(sale)}
                            disabled={isPrinting}
                            className="h-11 px-4 bg-green-500 hover:bg-green-400 text-black font-black rounded-xl text-sm flex items-center gap-2 active:scale-95 transition-all shadow cursor-pointer disabled:opacity-50"
                            title="Reprint Bill"
                          >
                            {isPrinting ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span>PRINTING...</span>
                              </>
                            ) : (
                              <>
                                <Printer className="w-4 h-4" />
                                <span>PRINT</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Pane: Thermal Slip Live Preview */}
          {previewSale && (
            <div className="w-full md:w-80 lg:w-96 bg-black border-t md:border-t-0 md:border-l border-neutral-800 flex flex-col h-full">
              
              <div className="p-3 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-green-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    THERMAL SLIP PREVIEW
                  </span>
                </div>
                <button
                  onClick={() => setPreviewSale(null)}
                  className="p-1 rounded text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Receipt Preview Paper */}
              <div className="flex-1 overflow-y-auto p-4 bg-neutral-950 flex justify-center">
                <div className="w-full max-w-[340px] bg-white text-black p-4 rounded shadow-2xl font-mono text-xs select-text">
                  
                  {/* Shop Header */}
                  <div className="text-center font-bold text-sm">ASKAR SUPERMARKET</div>
                  <div className="text-center font-bold text-xs">أسواق عسكر المركزية</div>
                  <div className="text-center text-[10px]">Simplified Tax Invoice</div>
                  <div className="text-center text-[10px]">فاتورة ضريبية مبسطة</div>
                  <div className="text-center text-[10px]">TRN: 200012345678901</div>
                  <div className="text-center text-[10px]">Askar, Kingdom of Bahrain</div>
                  
                  {/* Duplicate Watermark */}
                  <div className="my-2 border-2 border-black p-1 text-center font-black text-xs uppercase tracking-wider">
                    *** DUPLICATE / REPRINT COPY ***<br />
                    <span className="text-[10px]">نسخة معاد طباعتها</span>
                  </div>

                  <div className="border-t border-dashed border-black my-2" />

                  {/* Meta */}
                  <div className="flex justify-between text-[11px]">
                    <span>Invoice:</span>
                    <span className="font-bold">#{previewSale.invoiceNo}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span>Date:</span>
                    <span>{new Date(previewSale.timestamp).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span>Mode:</span>
                    <span className="font-bold">{previewSale.paymentMode}</span>
                  </div>
                  {previewSale.customerName && (
                    <div className="flex justify-between text-[11px]">
                      <span>Customer:</span>
                      <span className="font-bold">{previewSale.customerName}</span>
                    </div>
                  )}

                  <div className="border-t border-dashed border-black my-2" />

                  {/* Items Header */}
                  <div className="flex justify-between font-bold text-[11px]">
                    <span>Item</span>
                    <span>Qty  Amt(BD)</span>
                  </div>
                  <div className="border-t border-dashed border-black my-1" />

                  {/* Items */}
                  {(previewSale.items || []).map((it, idx) => (
                    <div key={idx} className="my-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="truncate pr-2">{it.name}</span>
                        <span className="font-bold whitespace-nowrap">
                          {it.qty}{it.is_weighed_item ? 'kg' : ''} &nbsp; 
                          {(it.price * it.qty).toFixed(3)}
                        </span>
                      </div>
                      {it.nameAr && (
                        <div className="text-[10px] text-right text-gray-700">{it.nameAr}</div>
                      )}
                    </div>
                  ))}

                  <div className="border-t border-dashed border-black my-2" />

                  {/* Totals */}
                  <div className="flex justify-between text-[11px]">
                    <span>Subtotal:</span>
                    <span>BD {previewSale.subtotal.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span>VAT (10%):</span>
                    <span>BD {previewSale.vat.toFixed(3)}</span>
                  </div>
                  
                  <div className="border-t border-black my-1" />
                  
                  <div className="flex justify-between font-black text-sm my-1">
                    <span>TOTAL:</span>
                    <span>BD {previewSale.total.toFixed(3)}</span>
                  </div>

                  <div className="border-t border-black my-1" />

                  {previewSale.cashTendered !== undefined && (
                    <>
                      <div className="flex justify-between text-[11px] mt-1">
                        <span>Cash Tendered:</span>
                        <span>BD {previewSale.cashTendered.toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span>Change:</span>
                        <span>BD {(previewSale.changeDue || 0).toFixed(3)}</span>
                      </div>
                    </>
                  )}

                  {/* Barcode Mock */}
                  <div className="text-center font-mono font-bold tracking-widest text-xs mt-3">
                    |||| | ||||| |||| || |||||||
                  </div>
                  <div className="text-center text-[9px] font-bold">
                    #{previewSale.invoiceNo}
                  </div>

                  <div className="text-center text-[9px] mt-2 text-gray-700">
                    * Item includes 10% VAT<br />
                    THANK YOU FOR SHOPPING!
                  </div>
                </div>
              </div>

              {/* Bottom Print Button for Preview */}
              <div className="p-3 bg-neutral-950 border-t border-neutral-800">
                <button
                  onClick={() => handleReprint(previewSale)}
                  disabled={printingId === previewSale.invoiceNo}
                  className="w-full h-12 bg-green-500 hover:bg-green-400 text-black font-black rounded-xl text-base flex items-center justify-center gap-2 active:scale-95 transition-all shadow cursor-pointer disabled:opacity-50"
                >
                  {printingId === previewSale.invoiceNo ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>PRINTING...</span>
                    </>
                  ) : (
                    <>
                      <Printer className="w-5 h-5" />
                      <span>PRINT THIS BILL</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Footer Bar */}
        <div className="px-6 py-3 bg-black border-t border-neutral-800 flex items-center justify-between text-xs text-zinc-500">
          <div className="flex items-center gap-4">
            <span>Showing <strong className="text-white">{filteredSales.length}</strong> of {sales.length} transactions</span>
            <span>•</span>
            <span>Press <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-zinc-300 border border-neutral-700">ESC</kbd> to return</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-zinc-400">Sunmi Hardware Printer Ready</span>
          </div>
        </div>

      </div>
    </div>
  );
};
