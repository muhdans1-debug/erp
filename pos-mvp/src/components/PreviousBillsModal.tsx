// pos-mvp/src/components/PreviousBillsModal.tsx
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Printer, Search, X, Receipt, Eye, Clock, 
  FileText, RefreshCw, Calendar, ChevronDown, ChevronUp
} from 'lucide-react';
import { 
  RecentSale, 
  getRecentSales, 
  fetchRecentSalesFromDb,
  fetchSalesByDate,
  getSalesForDate
} from '../services/recentSalesService';
import { printFullReceipt, showToast } from '../utils/printer';
import { getRegionalParts } from '../utils/time';

interface PreviousBillsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type DateFilterPreset = 'ALL' | 'TODAY' | 'YESTERDAY' | 'CUSTOM';
type PaymentFilterPreset = 'ALL' | 'CASH' | 'BENEFIT' | 'KHATA';

export const PreviousBillsModal: React.FC<PreviousBillsModalProps> = ({ isOpen, onClose }) => {
  const [sales, setSales] = useState<RecentSale[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<PaymentFilterPreset>('ALL');
  const [dateFilter, setDateFilter] = useState<DateFilterPreset>('ALL');
  const [customDate, setCustomDate] = useState<string>('');
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [previewSale, setPreviewSale] = useState<RecentSale | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Regional Date Keys
  const todayKey = useMemo(() => getRegionalParts().dateOnly, []);
  const yesterdayKey = useMemo(() => getRegionalParts(Date.now() - 86400000).dateOnly, []);

  // Helper to extract YYYY-MM-DD from ISO or localized timestamp
  const getDateKey = useCallback((isoString?: string): string => {
    if (!isoString) return '';
    try {
      return getRegionalParts(isoString).dateOnly;
    } catch {
      return (isoString || '').substring(0, 10);
    }
  }, []);

  // Format date header for daily grouping
  const formatDayHeader = useCallback((dateKey: string) => {
    const isToday = dateKey === todayKey;
    const isYesterday = dateKey === yesterdayKey;

    try {
      const parts = dateKey.split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        const dateObj = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
        const dayNameEn = dateObj.toLocaleDateString('en-GB', { weekday: 'long' });
        const formattedEn = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

        let titleEn = `${dayNameEn}, ${formattedEn}`;
        let badgeText = '';
        let badgeColor = 'bg-neutral-800 text-zinc-300 border-neutral-700';

        if (isToday) {
          titleEn = `Today • ${dayNameEn}, ${formattedEn}`;
          badgeText = 'TODAY (اليوم)';
          badgeColor = 'bg-green-500/20 text-green-400 border-green-500/30';
        } else if (isYesterday) {
          titleEn = `Yesterday • ${dayNameEn}, ${formattedEn}`;
          badgeText = 'YESTERDAY (أمس)';
          badgeColor = 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        }

        return { titleEn, badgeText, badgeColor, isToday, isYesterday };
      }
    } catch {}

    return { 
      titleEn: dateKey || 'Past Bills', 
      badgeText: '', 
      badgeColor: 'bg-neutral-800 text-zinc-300 border-neutral-700', 
      isToday: false, 
      isYesterday: false 
    };
  }, [todayKey, yesterdayKey]);

  // Format date string for individual bill cards
  const formatBillDate = useCallback((isoString?: string): string => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return '';
    }
  }, []);

  // Format exact time for individual bill cards
  const formatBillTime = useCallback((isoString?: string): string => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return '';
    }
  }, []);

  // Helper to format date relative (e.g. 5m ago)
  const formatTimeAgo = useCallback((isoString?: string): string => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return '';
      const now = new Date();
      const diffSecs = Math.floor((now.getTime() - date.getTime()) / 1000);

      if (diffSecs < 60) return 'Just now';
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  }, []);

  // Initial load on open
  useEffect(() => {
    if (!isOpen) return;

    // 1. Instant synchronous read from localStorage
    const local = getRecentSales();
    if (local && local.length > 0) {
      setSales(local);
    }

    // 2. Fetch full historical bills from DB/API in background
    setLoading(true);
    fetchRecentSalesFromDb({ limit: 30, forceRefresh: true })
      .then((dbSales) => {
        if (Array.isArray(dbSales) && dbSales.length > 0) {
          setSales(dbSales);
        }
      })
      .finally(() => setLoading(false));

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

  // Handle selecting a Date Filter
  const handleSelectDateFilter = async (preset: DateFilterPreset, pickedCustomDate?: string) => {
    setDateFilter(preset);
    let targetDateKey: string | null = null;

    if (preset === 'ALL') {
      setLoading(true);
      try {
        const fetched = await fetchRecentSalesFromDb({ limit: 30, forceRefresh: true });
        if (fetched && fetched.length > 0) {
          setSales(fetched);
        }
      } catch (err) {
        console.warn('Failed to load all sales:', err);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (preset === 'TODAY') {
      targetDateKey = todayKey;
    } else if (preset === 'YESTERDAY') {
      targetDateKey = yesterdayKey;
    } else if (preset === 'CUSTOM') {
      const selected = pickedCustomDate || customDate || todayKey;
      setCustomDate(selected);
      targetDateKey = selected;
    }

    if (targetDateKey) {
      // Check if we already have sales for this date
      const existingForDay = getSalesForDate(targetDateKey, sales);
      if (existingForDay.length < 5) {
        setLoading(true);
        try {
          const fetched = await fetchSalesByDate(targetDateKey);
          if (fetched && fetched.length > 0) {
            setSales((prev) => {
              const prevMap = new Map<string, RecentSale>();
              for (const s of prev) if (s?.invoiceNo) prevMap.set(s.invoiceNo, s);
              for (const s of fetched) if (s?.invoiceNo) prevMap.set(s.invoiceNo, s);
              return Array.from(prevMap.values()).sort(
                (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
              );
            });
          }
        } catch (err) {
          console.warn('Failed to fetch sales for date:', targetDateKey, err);
        } finally {
          setLoading(false);
        }
      }
    }
  };

  // Manual refresh button
  const handleManualRefresh = async () => {
    setLoading(true);
    try {
      showToast('🔄 Refreshing previous bills...');
      let targetDate: string | undefined;
      if (dateFilter === 'TODAY') targetDate = todayKey;
      else if (dateFilter === 'YESTERDAY') targetDate = yesterdayKey;
      else if (dateFilter === 'CUSTOM' && customDate) targetDate = customDate;

      const freshSales = await fetchRecentSalesFromDb({ date: targetDate, limit: 30, forceRefresh: true });
      if (freshSales && freshSales.length > 0) {
        setSales(freshSales);
        showToast(`✅ Loaded ${freshSales.length} bills`);
      } else {
        showToast('ℹ️ No bills found');
      }
    } catch {
      showToast('❌ Refresh failed');
    } finally {
      setLoading(false);
    }
  };

  // Pagination: Load more historical bills on demand
  const handleLoadMore = async () => {
    setLoading(true);
    try {
      const nextLimit = sales.length + 30;
      let targetDate: string | undefined;
      if (dateFilter === 'TODAY') targetDate = todayKey;
      else if (dateFilter === 'YESTERDAY') targetDate = yesterdayKey;
      else if (dateFilter === 'CUSTOM' && customDate) targetDate = customDate;

      const more = await fetchRecentSalesFromDb({ date: targetDate, limit: nextLimit, forceRefresh: true });
      if (more && more.length > 0) {
        setSales(more);
        showToast(`✅ Loaded ${more.length} bills`);
      } else {
        showToast('ℹ️ No more bills available');
      }
    } catch {
      showToast('❌ Failed to load more bills');
    } finally {
      setLoading(false);
    }
  };

  // Filtered sales
  const filteredSales = useMemo(() => {
    const q = searchQuery.trim().toLowerCase().replace(/^#/, '').replace(/^inv-/, '');
    
    return sales.filter((s) => {
      // 1. Date Filter
      const saleDate = getDateKey(s.timestamp);
      if (dateFilter === 'TODAY' && saleDate !== todayKey) return false;
      if (dateFilter === 'YESTERDAY' && saleDate !== yesterdayKey) return false;
      if (dateFilter === 'CUSTOM' && customDate && saleDate !== customDate) return false;

      // 2. Payment filter
      if (filterMode === 'CASH' && !s.paymentMode?.toUpperCase().includes('CASH')) return false;
      if (filterMode === 'BENEFIT' && !s.paymentMode?.toUpperCase().includes('BENEFIT')) return false;
      if (filterMode === 'KHATA' && !['KHATA', 'CREDIT', 'CREDIT_PERSONAL'].includes(s.paymentMode?.toUpperCase())) return false;

      // 3. Query filter
      if (!q) return true;
      const invClean = (s.invoiceNo || '').toLowerCase().replace(/^#/, '').replace(/^inv-/, '');
      if (invClean.includes(q)) return true;
      if (s.customerName && s.customerName.toLowerCase().includes(q)) return true;
      if (s.paymentMode && s.paymentMode.toLowerCase().includes(q)) return true;
      if (saleDate.includes(q)) return true;
      
      // Also match item names
      if (s.items && s.items.some((it) => it.name && it.name.toLowerCase().includes(q))) return true;

      return false;
    });
  }, [sales, searchQuery, filterMode, dateFilter, customDate, todayKey, yesterdayKey, getDateKey]);

  // Total revenue of current filtered set
  const filteredTotalRevenue = useMemo(() => {
    return filteredSales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
  }, [filteredSales]);

  // Group filtered sales by day
  const groupedSales = useMemo(() => {
    const groups: Record<string, RecentSale[]> = {};
    for (const sale of filteredSales) {
      const key = getDateKey(sale.timestamp) || 'Other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(sale);
    }

    // Sort dates descending (newest day first)
    const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    return sortedKeys.map((key) => {
      const daySales = groups[key];
      const dayTotal = daySales.reduce((acc, it) => acc + (Number(it.total) || 0), 0);
      return {
        dateKey: key,
        sales: daySales,
        count: daySales.length,
        totalAmount: dayTotal,
        header: formatDayHeader(key)
      };
    });
  }, [filteredSales, getDateKey, formatDayHeader]);

  // Toggle Day collapse
  const toggleDayCollapse = (dateKey: string) => {
    setCollapsedDays((prev) => ({
      ...prev,
      [dateKey]: !prev[dateKey]
    }));
  };

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
        isReprint: true, // 🏷️ Tag as duplicate reprint
        previousBalance: sale.previousBalance,
        newBalance: sale.newBalance
      });

      showToast(`✅ Receipt #${sale.invoiceNo} Printed!`);
    } catch (err) {
      console.error('Failed to reprint receipt:', err);
      showToast('❌ Failed to reprint receipt');
    } finally {
      setTimeout(() => setPrintingId(null), 800);
    }
  };

  if (!isOpen) return null;

  const mostRecent = sales[0] || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-5xl h-[94vh] flex flex-col bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-black border-b border-neutral-800">
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
              <p className="text-xs text-zinc-400">سجل الفواتير السابقة وإعادة الطباعة حسب التاريخ</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-neutral-900 hover:bg-neutral-800 text-zinc-400 hover:text-white border border-neutral-800 active:scale-95 transition-all cursor-pointer"
            title="Close [ESC]"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Pinned Most Recent Bill Quick-Action (Zero-Search 1-Tap) */}
        {mostRecent && !searchQuery && dateFilter === 'ALL' && filterMode === 'ALL' && (
          <div className="bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-950 border-b border-neutral-800 px-6 py-2.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">LATEST BILL:</span>
                  <span className="text-sm font-black text-white">#{mostRecent.invoiceNo}</span>
                  <span className="text-xs text-green-400 font-bold">
                    {formatBillDate(mostRecent.timestamp)} • {formatBillTime(mostRecent.timestamp)}
                  </span>
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
              className="px-4 py-2 bg-green-500 hover:bg-green-400 text-black font-black rounded-xl text-xs flex items-center gap-2 active:scale-95 transition-all shadow-lg shrink-0 cursor-pointer disabled:opacity-50"
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

        {/* Search & Date Filter Bar */}
        <div className="p-4 bg-neutral-900/95 border-b border-neutral-800 space-y-3">
          
          {/* Row 1: Search Input */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search invoice digits (e.g. 5048), customer name, or item..."
              className="w-full h-11 pl-12 pr-10 bg-black border border-neutral-800 rounded-xl text-white placeholder-zinc-500 text-sm font-semibold focus:outline-none focus:border-green-500 transition-colors"
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

          {/* Row 2: Date Selector & Payment Method Filters */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            
            {/* Left: Date Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1 mr-1">
                <Calendar className="w-3.5 h-3.5 text-green-400" />
                Date:
              </span>
              
              <button
                onClick={() => handleSelectDateFilter('ALL')}
                className={`px-3.5 h-9 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                  dateFilter === 'ALL'
                    ? 'bg-green-500 text-black shadow-md'
                    : 'bg-neutral-800 text-zinc-300 hover:bg-neutral-700 border border-neutral-700'
                }`}
              >
                <span>All Dates</span>
                <span className="text-[10px] opacity-75">(الكل)</span>
              </button>

              <button
                onClick={() => handleSelectDateFilter('TODAY')}
                className={`px-3.5 h-9 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                  dateFilter === 'TODAY'
                    ? 'bg-green-500 text-black shadow-md'
                    : 'bg-neutral-800 text-zinc-300 hover:bg-neutral-700 border border-neutral-700'
                }`}
              >
                <span>Today</span>
                <span className="text-[10px] opacity-75">(اليوم)</span>
              </button>

              <button
                onClick={() => handleSelectDateFilter('YESTERDAY')}
                className={`px-3.5 h-9 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                  dateFilter === 'YESTERDAY'
                    ? 'bg-green-500 text-black shadow-md'
                    : 'bg-neutral-800 text-zinc-300 hover:bg-neutral-700 border border-neutral-700'
                }`}
              >
                <span>Yesterday</span>
                <span className="text-[10px] opacity-75">(أمس)</span>
              </button>

              {/* Pick Date Calendar Input */}
              <div className={`relative flex items-center rounded-xl border h-9 px-2 transition-all ${
                dateFilter === 'CUSTOM'
                  ? 'bg-green-500/10 border-green-500 text-white shadow'
                  : 'bg-neutral-800 border-neutral-700 text-zinc-300 hover:border-neutral-600'
              }`}>
                <Calendar className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleSelectDateFilter('CUSTOM', e.target.value);
                    }
                  }}
                  max={todayKey}
                  className="bg-transparent text-xs font-black text-white focus:outline-none cursor-pointer"
                  title="Choose a specific past date"
                />
                {dateFilter === 'CUSTOM' && (
                  <button
                    onClick={() => handleSelectDateFilter('ALL')}
                    className="ml-1 text-zinc-400 hover:text-white"
                    title="Clear date selection"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Right: Payment Mode Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {(['ALL', 'CASH', 'BENEFIT', 'KHATA'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={`px-3 h-8 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                    filterMode === mode
                      ? 'bg-white text-black shadow-md'
                      : 'bg-neutral-800/80 text-zinc-400 hover:bg-neutral-700 hover:text-zinc-200'
                  }`}
                >
                  {mode === 'BENEFIT' ? 'BENEFITPAY' : mode}
                </button>
              ))}
            </div>

          </div>
        </div>

        {/* Daily / Filtered Summary Bar */}
        <div className="px-6 py-2 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            <span className="font-bold text-zinc-300">
              {dateFilter === 'ALL' && 'All Dates (جميع التواريخ)'}
              {dateFilter === 'TODAY' && `Today: ${todayKey} (اليوم)`}
              {dateFilter === 'YESTERDAY' && `Yesterday: ${yesterdayKey} (أمس)`}
              {dateFilter === 'CUSTOM' && `Date: ${customDate}`}
            </span>
            <span>•</span>
            <span className="text-zinc-400">
              <strong className="text-white">{filteredSales.length}</strong> {filteredSales.length === 1 ? 'bill' : 'bills'}
            </span>
            <span>•</span>
            <span className="text-zinc-400">
              Total: <strong className="text-green-400 font-black">BD {filteredTotalRevenue.toFixed(3)}</strong>
            </span>
          </div>

          <button
            onClick={handleManualRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white cursor-pointer transition-colors text-xs font-semibold shrink-0"
            title="Refresh from SQLite / Server"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-green-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Main Body: List + Slip Preview */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          
          {/* Bills List Grouped By Date */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {loading && sales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-green-500" />
                <p className="text-sm font-semibold">Loading sales from database...</p>
              </div>
            ) : filteredSales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
                <FileText className="w-12 h-12 text-zinc-700" />
                <p className="text-base font-bold text-zinc-400">No transactions found</p>
                <p className="text-xs text-zinc-500 text-center max-w-sm">
                  {searchQuery 
                    ? `No sales match "${searchQuery}" for the chosen filters.` 
                    : dateFilter !== 'ALL'
                    ? 'No sales recorded for this date on this terminal.'
                    : 'No recent transactions recorded on this terminal.'}
                </p>
                {dateFilter !== 'ALL' && (
                  <button
                    onClick={() => handleSelectDateFilter('ALL')}
                    className="mt-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-zinc-200 text-xs font-bold rounded-xl border border-neutral-700 cursor-pointer"
                  >
                    View All Dates (عرض جميع التواريخ)
                  </button>
                )}
              </div>
            ) : (
              groupedSales.map((group) => {
                const isCollapsed = collapsedDays[group.dateKey] !== undefined ? collapsedDays[group.dateKey] : !group.header.isToday;

                return (
                  <div key={group.dateKey} className="space-y-2.5">
                    
                    {/* Day Group Header */}
                    <div 
                      onClick={() => toggleDayCollapse(group.dateKey)}
                      className="flex items-center justify-between px-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl shadow cursor-pointer select-none hover:border-neutral-700 transition-colors sticky top-0 z-10"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Calendar className="w-4 h-4 text-green-400 shrink-0" />
                        <span className="text-sm font-black text-white truncate">
                          {group.header.titleEn}
                        </span>
                        {group.header.badgeText && (
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded border shrink-0 ${group.header.badgeColor}`}>
                            {group.header.badgeText}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-neutral-900 text-zinc-300 border border-neutral-800">
                          {group.count} {group.count === 1 ? 'Bill' : 'Bills'}
                        </span>
                        <span className="text-sm font-black text-green-400">
                          BD {group.totalAmount.toFixed(3)}
                        </span>
                        {isCollapsed ? (
                          <ChevronDown className="w-4 h-4 text-zinc-400" />
                        ) : (
                          <ChevronUp className="w-4 h-4 text-zinc-400" />
                        )}
                      </div>
                    </div>

                    {/* Bills for this day */}
                    {!isCollapsed && (
                      <div className="space-y-2.5 pl-1 sm:pl-2">
                        {group.sales.map((sale, idx) => {
                          const isPrinting = printingId === sale.invoiceNo;
                          const isSelectedForPreview = previewSale?.invoiceNo === sale.invoiceNo;

                          return (
                            <div
                              key={`${sale.invoiceNo}-${idx}`}
                              className={`p-3.5 rounded-xl border transition-all ${
                                isSelectedForPreview
                                  ? 'bg-neutral-800/90 border-green-500 shadow-lg ring-1 ring-green-500/50'
                                  : 'bg-black/90 border-neutral-800 hover:border-neutral-700'
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                
                                {/* Left: Invoice, Date & Time, Meta */}
                                <div className="space-y-1.5 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-base font-black text-white tracking-wide">
                                      #{sale.invoiceNo}
                                    </span>
                                    
                                    {/* Payment Mode Badge */}
                                    <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider ${
                                      sale.paymentMode?.toUpperCase().includes('BENEFIT')
                                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                        : sale.paymentMode?.toUpperCase().includes('KHATA') || sale.paymentMode?.toUpperCase().includes('CREDIT')
                                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                        : 'bg-green-500/20 text-green-400 border border-green-500/30'
                                    }`}>
                                      {sale.paymentMode || 'CASH'}
                                    </span>

                                    {/* Date Badge */}
                                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-neutral-800 text-zinc-200 border border-neutral-700 flex items-center gap-1.5">
                                      <Calendar className="w-3.5 h-3.5 text-green-400" />
                                      {formatBillDate(sale.timestamp)}
                                    </span>

                                    {/* Exact Time Badge */}
                                    <span className="text-xs text-zinc-400 flex items-center gap-1 font-medium">
                                      <Clock className="w-3.5 h-3.5 text-zinc-500" />
                                      {formatBillTime(sale.timestamp)}
                                      <span className="text-zinc-500 font-normal">({formatTimeAgo(sale.timestamp)})</span>
                                    </span>
                                  </div>

                                  {/* Customer or Items Snippet */}
                                  <div className="text-xs text-zinc-300 truncate">
                                    {sale.customerName ? (
                                      <span className="font-bold text-amber-300 mr-2 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                        👤 {sale.customerName}
                                      </span>
                                    ) : null}
                                    <span className="text-zinc-400">
                                      {sale.items && sale.items.length > 0
                                        ? sale.items.map((it) => `${it.name}${it.qty > 1 ? ` (×${it.qty}${it.is_weighed_item ? 'kg' : ''})` : ''}`).join(', ')
                                        : 'Standard Sale'}
                                    </span>
                                  </div>
                                </div>

                                {/* Right: Total Amount & Action Buttons */}
                                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-900">
                                  <div className="text-right">
                                    <div className="text-[11px] text-zinc-400">Total</div>
                                    <div className="text-lg font-black text-green-400">
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
                                      <Eye className="w-4 h-4" />
                                    </button>

                                    {/* Print Button */}
                                    <button
                                      onClick={() => handleReprint(sale)}
                                      disabled={isPrinting}
                                      className="h-10 px-4 bg-green-500 hover:bg-green-400 text-black font-black rounded-xl text-xs flex items-center gap-1.5 active:scale-95 transition-all shadow cursor-pointer disabled:opacity-50"
                                      title="Reprint Bill"
                                    >
                                      {isPrinting ? (
                                        <>
                                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                          <span>PRINTING...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Printer className="w-3.5 h-3.5" />
                                          <span>PRINT</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>

                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                  </div>
                );
              })
            )}

            {sales.length >= 25 && !loading && (
              <div className="pt-2 pb-6 flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  className="px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-white font-bold text-xs rounded-xl border border-neutral-700 flex items-center gap-2 cursor-pointer transition-all shadow"
                >
                  <ChevronDown className="w-4 h-4 text-green-400" />
                  <span>Load More Bills (عرض المزيد من الفواتير)</span>
                </button>
              </div>
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

              {/* Scrollable Receipt Preview Paper (Shrunk Compact Professional) */}
              <div className="flex-1 overflow-y-auto p-3 bg-neutral-950 flex justify-center">
                <div className="w-full max-w-[320px] bg-white text-black p-3 rounded shadow-2xl font-mono text-xs select-text">
                  
                  {/* Shop Compact Header */}
                  <div className="text-center font-bold text-xs">LAYALI SUPERMARKET أسواق ليالي</div>
                  <div className="text-center text-[10px] text-gray-700">CR: 790614189 | VAT: 200012345678901</div>
                  <div className="text-center text-[10px] text-gray-700">Tel: +973 33843855</div>
                  
                  {/* Duplicate Notice */}
                  <div className="my-1 border-t border-b border-black py-0.5 text-center font-bold text-[10px]">
                    *** DUPLICATE / REPRINT COPY ***
                  </div>

                  {/* Meta */}
                  <div className="flex justify-between text-[10px] mt-1">
                    <span>INV: <strong>#{previewSale.invoiceNo}</strong></span>
                    <span>{formatBillDate(previewSale.timestamp)} {formatBillTime(previewSale.timestamp)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-700">
                    <span>Mode: <strong>{previewSale.paymentMode}</strong></span>
                    {previewSale.customerName && <span>Cust: <strong>{previewSale.customerName}</strong></span>}
                  </div>

                  <div className="border-t border-dashed border-black my-1.5" />

                  {/* Items */}
                  {(previewSale.items || []).map((it, idx) => (
                    <div key={idx} className="my-0.5">
                      <div className="flex justify-between text-[10px]">
                        <span className="truncate pr-1">{idx + 1}. {it.name}</span>
                        <span className="font-bold whitespace-nowrap">BD {(it.price * it.qty).toFixed(3)}*</span>
                      </div>
                      {(it.is_weighed_item || it.qty > 1) && (
                        <div className="text-[9px] text-gray-600 pl-3">
                          {it.qty}{it.is_weighed_item ? 'kg' : 'x'} @ BD {it.price.toFixed(3)}
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="border-t border-dashed border-black my-1.5" />

                  {/* Consolidated Subtotal & VAT */}
                  <div className="flex justify-between text-[10px] text-gray-700">
                    <span>Subtotal: BD {previewSale.subtotal.toFixed(3)}</span>
                    <span>VAT: BD {previewSale.vat.toFixed(3)}</span>
                  </div>
                  
                  {/* Clean Total */}
                  <div className="my-1 border-t-2 border-b-2 border-black py-1 flex justify-between items-baseline font-black">
                    <span className="text-xs">TOTAL / المجموع:</span>
                    <span className="text-sm">BD {previewSale.total.toFixed(3)}</span>
                  </div>

                  {previewSale.cashTendered !== undefined && (
                    <div className="flex justify-between text-[10px] text-gray-700 mt-0.5">
                      <span>Paid: BD {previewSale.cashTendered.toFixed(3)}</span>
                      <span>Change: <strong>BD {(previewSale.changeDue || 0).toFixed(3)}</strong></span>
                    </div>
                  )}

                  {/* Khata Balance */}
                  {previewSale.newBalance !== undefined && (
                    <div className="flex justify-between text-[10px] font-bold mt-1 p-1 bg-gray-100 rounded">
                      <span>BALANCE DUE:</span>
                      <span>BD {Number(previewSale.newBalance).toFixed(3)}</span>
                    </div>
                  )}

                  <div className="text-center text-[9px] mt-2 font-bold text-gray-800">
                    Thank You! شكراً لزيارتكم
                  </div>
                  <div className="text-center text-[8px] text-gray-600">
                    Return within 3 days with bill
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
        <div className="px-6 py-2.5 bg-black border-t border-neutral-800 flex items-center justify-between text-xs text-zinc-500">
          <div className="flex items-center gap-3">
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
