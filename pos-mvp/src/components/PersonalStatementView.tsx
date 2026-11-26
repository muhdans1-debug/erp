import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  FileText,
  Printer,
  MessageCircle,
  Banknote,
  Smartphone,
  ArrowLeft,
  CheckCircle2,
  User,
  RefreshCw,
  X,
  Lock,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Receipt,
  BookOpen
} from 'lucide-react';
import { getApiBaseUrl, DEFAULT_EDGE_API_URL } from '../utils/apiConfig';
import { getManagerPin } from '../utils/authUtils';
import { printKhataStatement, printKhataPaymentReceipt } from '../utils/printer';
import { kickCashDrawer } from '../services/cashDrawerService';
import { playThankYouVoice } from '../utils/sound';
import { AddCustomerBookBalanceModal } from './AddCustomerBookBalanceModal';

export interface CustomerStatementItem {
  id: string;
  name: string;
  phone?: string | null;
  cpr?: string | null;
  cardUid?: string | null;
  batchNo?: string | null;
  currentBalance?: number;
  balance?: number;
  personalBalance?: number;
  messShare?: number;
  mess_id?: string | null;
  messName?: string | null;
  mess_name?: string | null;
  messes?: { id: string; group_name: string }[];
  creditLimit?: number;
  is_active?: number | boolean;
  isFrozen?: boolean;
  card_deposit_amount?: number | null;
  card_deposit_status?: string | null;
  depositInCredit?: number;
}

interface PersonalStatementViewProps {
  apiBase: string;
  initialCustomer?: CustomerStatementItem | null;
  scannedCardUid?: string | null;
  onSelectCustomerForCart?: (customer: any) => void;
  onClose?: () => void;
  showToast?: (message: string, type?: 'success' | 'info' | 'error') => void;
  onCustomerUpdated?: () => void;
}

export const PersonalStatementView: React.FC<PersonalStatementViewProps> = ({
  apiBase,
  initialCustomer = null,
  scannedCardUid,
  onSelectCustomerForCart,
  showToast,
  onCustomerUpdated
}) => {
  const [customers, setCustomers] = useState<CustomerStatementItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerStatementItem | null>(initialCustomer);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoadingList, setIsLoadingList] = useState<boolean>(false);
  const [showBookBalanceModal, setShowBookBalanceModal] = useState<boolean>(false);

  // Statement ledger entries state
  const [statementEntries, setStatementEntries] = useState<any[]>([]);
  const [isLoadingStatement, setIsLoadingStatement] = useState<boolean>(false);
  const [entryScope, setEntryScope] = useState<'PERSONAL' | 'ALL'>('PERSONAL');
  const [dateRangePreset, setDateRangePreset] = useState<'ALL' | 'THIS_MONTH' | 'LAST_MONTH' | 'TODAY'>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'CHARGES' | 'PAYMENTS'>('ALL');

  // Fast inline payment modal inside statement view
  const [showPayModal, setShowPayModal] = useState<boolean>(false);
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMethod, setPayMethod] = useState<'CASH' | 'BENEFIT_PAY'>('CASH');
  const [isSubmittingPay, setIsSubmittingPay] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  // Multi-endpoint fetch helper
  const fetchFromCandidates = useCallback(async (path: string, options: RequestInit = {}): Promise<Response | null> => {
    const candidates = [
      apiBase,
      DEFAULT_EDGE_API_URL,
      getApiBaseUrl(),
      'http://192.168.8.7:3000',
      'http://localhost:3000'
    ].filter((val, idx, arr): val is string => Boolean(val && val.trim()) && arr.indexOf(val) === idx);

    for (const base of candidates) {
      const cleanBase = base.trim().replace(/\/$/, '');
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      try {
        const res = await fetch(`${cleanBase}${cleanPath}`, {
          ...options,
          signal: AbortSignal.timeout(3500)
        });
        if (res.ok) return res;
      } catch { }
    }
    return null;
  }, [apiBase]);

  // Load Customers List
  const loadCustomers = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const res = await fetchFromCandidates('/khata/ledger?sort=highest', {
        headers: {
          'x-pos-client': 'store-pos',
          'x-manager-pin': getManagerPin()
        }
      });
      if (res) {
        const data = await res.json();
        const rawList = data?.customers || (Array.isArray(data) ? data : []);
        const sanitized: CustomerStatementItem[] = rawList.map((c: any) => {
          const isAct = c.is_active !== 0 && c.is_active !== false && c.isActive !== false;
          const currBal = Number(c.currentBalance ?? c.balance ?? 0);
          const mShare = Number(c.messShare ?? 0);
          const depInCred = Number(c.depositInCredit ?? ((c.card_deposit_status === 'IN_CREDIT' || c.card_deposit_status === 'DEFERRED_CREDIT' || c.card_deposit_status === 'DEFERRED_PAYDAY') ? (c.card_deposit_amount || 3) : 0));
          const pBal = c.personalBalance !== undefined ? Number(c.personalBalance) : Math.max(0, Number((currBal - mShare - depInCred).toFixed(3)));
          return {
            id: c.id,
            name: c.name || 'Unnamed Customer',
            phone: c.phone || null,
            cpr: c.cpr || null,
            cardUid: c.cardUid || c.nfcCardId || null,
            batchNo: c.batchNo || null,
            currentBalance: currBal,
            balance: currBal,
            personalBalance: pBal,
            messShare: mShare,
            mess_id: c.mess_id || null,
            messName: c.messName || c.mess_name || null,
            messes: c.messes || [],
            creditLimit: Number(c.creditLimit || c.credit_limit || 30.0),
            is_active: isAct ? 1 : 0,
            isFrozen: !isAct,
            card_deposit_amount: c.card_deposit_amount !== undefined ? Number(c.card_deposit_amount) : null,
            card_deposit_status: c.card_deposit_status || null,
            depositInCredit: depInCred
          };
        });
        setCustomers(sanitized);

        // If a customer was already selected, update their object
        if (selectedCustomer) {
          const updated = sanitized.find((c) => c.id === selectedCustomer.id);
          if (updated) setSelectedCustomer(updated);
        }
      }
    } catch (err: any) {
      console.warn('Error loading customers for statement:', err?.message);
    } finally {
      setIsLoadingList(false);
    }
  }, [fetchFromCandidates, selectedCustomer?.id]);

  useEffect(() => {
    loadCustomers();
  }, []);

  // Omni-Card Detection: when NFC card is punched, auto-select matching customer
  const handleCardPunched = useCallback((cardUidRaw: string) => {
    if (!cardUidRaw || !cardUidRaw.trim()) return;
    const cleanUid = cardUidRaw.trim().toUpperCase().replace(/[:\-]/g, '');

    for (const cust of customers) {
      const custCardClean = String(cust.cardUid || '').toUpperCase().replace(/[:\-]/g, '');
      if (custCardClean && custCardClean === cleanUid) {
        setSelectedCustomer(cust);
        if (showToast) showToast(`Card Recognized: ${cust.name}`, 'success');
        return;
      }
    }
  }, [customers, showToast]);

  useEffect(() => {
    if (scannedCardUid && customers.length > 0) {
      handleCardPunched(scannedCardUid);
    }
  }, [scannedCardUid, customers, handleCardPunched]);

  // Live Sunmi NFC Scan and Broadcast listeners
  useEffect(() => {
    const handleSunmiScan = (e: any) => {
      const tag = e?.detail?.tag_id || e?.detail?.nfcId || (typeof e?.detail === 'string' ? e.detail : '');
      if (tag) handleCardPunched(tag);
    };
    window.addEventListener('sunmi-nfc-scan', handleSunmiScan);
    window.addEventListener('sunmi-nfc-broadcast', handleSunmiScan);
    return () => {
      window.removeEventListener('sunmi-nfc-scan', handleSunmiScan);
      window.removeEventListener('sunmi-nfc-broadcast', handleSunmiScan);
    };
  }, [handleCardPunched]);

  // Load statement entries for selected customer
  const loadCustomerStatement = useCallback(async (customerId: string) => {
    setIsLoadingStatement(true);
    try {
      const res = await fetchFromCandidates(`/api/customers/${customerId}/statement`, {
        headers: {
          'x-pos-client': 'store-pos',
          'x-manager-pin': getManagerPin()
        }
      });
      if (res) {
        const data = await res.json();
        const entries = data.statement || data.entries || data.sales || [];
        setStatementEntries(Array.isArray(entries) ? entries : []);
      }
    } catch (err: any) {
      console.warn('Error loading statement entries:', err?.message);
    } finally {
      setIsLoadingStatement(false);
    }
  }, [fetchFromCandidates]);

  useEffect(() => {
    if (selectedCustomer?.id) {
      loadCustomerStatement(selectedCustomer.id);
    } else {
      setStatementEntries([]);
    }
  }, [selectedCustomer?.id, loadCustomerStatement]);

  // Date Presets Handler
  const applyDatePreset = (preset: 'ALL' | 'THIS_MONTH' | 'LAST_MONTH' | 'TODAY') => {
    setDateRangePreset(preset);
    const now = new Date();
    if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'TODAY') {
      const todayStr = now.toISOString().slice(0, 10);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'THIS_MONTH') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const todayStr = now.toISOString().slice(0, 10);
      setStartDate(first);
      setEndDate(todayStr);
    } else if (preset === 'LAST_MONTH') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const last = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      setStartDate(first);
      setEndDate(last);
    }
  };

  // Filtered & Chronologically Recomputed Statement Entries (Strictly Personal Tab vs All Card Swipes with Opening Balance)
  const filteredStatement = useMemo(() => {
    // 1. Isolate entries based on selected scope
    const baseEntries = entryScope === 'PERSONAL'
      ? statementEntries.filter((item) => !item.mess_id || item.mess_id === '')
      : statementEntries;

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    let openingBal = 0;
    const dateFiltered: any[] = [];

    // 2. Accumulate prior transactions into Opening Balance and filter active range
    baseEntries.forEach((item) => {
      const numAmt = Number(item.raw_amount !== undefined ? item.raw_amount : item.amount || 0);
      const isPayment = item.type === 'PAYMENT' || item.type === 'WRITE_OFF' || numAmt < 0;
      const isCharge = item.type === 'CHARGE' || item.type === 'SALE' || numAmt > 0;
      const amt = Number(item.raw_amount !== undefined ? item.raw_amount : (isPayment ? -Math.abs(item.amount) : Math.abs(item.amount)));

      const dateStr = item.created_at || item.timestamp || item.createdAt;
      const txDate = dateStr ? new Date(dateStr) : new Date(0);

      if (start && txDate < start) {
        openingBal += amt;
      } else if ((!start || txDate >= start) && (!end || txDate <= end)) {
        if (typeFilter === 'CHARGES' && !isCharge) return;
        if (typeFilter === 'PAYMENTS' && !isPayment) return;
        dateFiltered.push(item);
      }
    });

    // 3. Recompute running balance chronologically starting from Opening Balance
    const chronological = [...dateFiltered].sort(
      (a, b) => new Date(a.created_at || a.timestamp || 0).getTime() - new Date(b.created_at || b.timestamp || 0).getTime()
    );

    let runBal = openingBal;
    const recomputed = chronological.map((item) => {
      const isPayment = item.type === 'PAYMENT' || item.type === 'WRITE_OFF' || Number(item.raw_amount || 0) < 0;
      const amt = Number(item.raw_amount !== undefined ? item.raw_amount : (isPayment ? -Math.abs(item.amount) : Math.abs(item.amount)));
      runBal += amt;
      const d = new Date(item.created_at || item.timestamp || item.createdAt || Date.now());
      return {
        ...item,
        amount: Math.abs(amt),
        raw_amount: amt,
        running_balance: Number(runBal.toFixed(3)),
        runningBalance: Number(runBal.toFixed(3)),
        formattedDate: d.toLocaleDateString('en-GB'),
        formattedTime: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
    });

    // 4. Prepend explicit Opening Balance line if period is date-filtered and prior debt was non-zero
    if (start && Math.abs(openingBal) > 0.0001 && typeFilter === 'ALL') {
      const obRow = {
        id: `ob_${startDate}`,
        reference: 'Balance Brought Forward (Opening Balance)',
        type: 'OPENING_BALANCE',
        amount: Math.abs(openingBal),
        raw_amount: openingBal,
        running_balance: Number(openingBal.toFixed(3)),
        runningBalance: Number(openingBal.toFixed(3)),
        formattedDate: new Date(startDate).toLocaleDateString('en-GB'),
        formattedTime: '00:00',
        created_at: new Date(startDate).toISOString(),
        isOpeningBalanceRow: true
      };
      recomputed.unshift(obRow);
    }

    return recomputed.reverse();
  }, [statementEntries, entryScope, typeFilter, startDate, endDate]);

  // Aggregate Metrics for this customer
  const totalDebitPurchases = useMemo(() => {
    return filteredStatement.reduce((acc, item) => {
      const isCharge = item.type === 'CHARGE' || item.type === 'SALE' || Number(item.raw_amount || item.amount) > 0;
      return isCharge ? acc + Math.abs(Number(item.amount || 0)) : acc;
    }, 0);
  }, [filteredStatement]);

  const totalCreditPayments = useMemo(() => {
    return filteredStatement.reduce((acc, item) => {
      const isPayment = item.type === 'PAYMENT' || item.type === 'WRITE_OFF' || Number(item.raw_amount || item.amount) < 0;
      return isPayment ? acc + Math.abs(Number(item.amount || 0)) : acc;
    }, 0);
  }, [filteredStatement]);

  // Auto-select customer if search query matches exact NFC card UID
  useEffect(() => {
    const qClean = searchQuery.trim().toUpperCase().replace(/[:\-]/g, '');
    if (qClean.length >= 8 && !selectedCustomer) {
      handleCardPunched(qClean);
    }
  }, [searchQuery, selectedCustomer, handleCardPunched]);

  // Search Filter for Customer List
  const filteredCustomerList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;
    const qNoColon = q.replace(/[:\-]/g, '');
    return customers.filter((c) => {
      const cUid = String(c.cardUid || '').toLowerCase();
      const cUidNoColon = cUid.replace(/[:\-]/g, '');
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.cpr && c.cpr.toLowerCase().includes(q)) ||
        (c.batchNo && c.batchNo.toLowerCase().includes(q)) ||
        (cUid && (cUid.includes(q) || (qNoColon && cUidNoColon.includes(qNoColon))))
      );
    });
  }, [customers, searchQuery]);

  // Print 58mm Thermal Personal Statement
  const handlePrintStatement = async () => {
    if (!selectedCustomer) return;
    setIsPrinting(true);
    try {
      const dateLabel = startDate && endDate ? `${startDate} to ${endDate}` : (startDate ? `From ${startDate}` : 'All Time');
      await printKhataStatement({
        shopName: "LAYALI SUPERMARKET",
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone,
        customerCpr: selectedCustomer.cpr,
        statement: filteredStatement,
        currentBalance: Number(selectedCustomer.personalBalance ?? selectedCustomer.currentBalance ?? 0),
        dateRange: dateLabel,
        isMessStatement: false
      });
      if (showToast) showToast(`Statement printed for ${selectedCustomer.name}`, 'success');
    } catch (err: any) {
      console.warn('Print statement error:', err);
      if (showToast) showToast('Failed to print statement', 'error');
    } finally {
      setIsPrinting(false);
    }
  };

  // WhatsApp Statement Formatter
  const handleShareWhatsApp = () => {
    if (!selectedCustomer) return;
    const pBal = Number(selectedCustomer.personalBalance ?? selectedCustomer.currentBalance ?? 0).toFixed(3);
    const dateLabel = startDate && endDate ? `${startDate} to ${endDate}` : 'All Time';

    let msg = `*LAYALI SUPERMARKET - OFFICIAL STATEMENT*\n`;
    msg += `👤 *Customer:* ${selectedCustomer.name}\n`;
    if (selectedCustomer.phone) msg += `📞 *Phone:* ${selectedCustomer.phone}\n`;
    if (selectedCustomer.cpr) msg += `🆔 *CPR:* ${selectedCustomer.cpr}\n`;
    msg += `📅 *Period:* ${dateLabel}\n`;
    msg += `--------------------------------\n`;
    msg += `💰 *PERSONAL OUTSTANDING DUE:* BD ${pBal}\n`;
    if (Number(selectedCustomer.messShare || 0) > 0) {
      msg += `👥 *(Mess Group Share: BD ${Number(selectedCustomer.messShare).toFixed(3)} - Billed Separately)*\n`;
    }
    msg += `--------------------------------\n`;
    msg += `*Recent Personal Purchases:*\n`;

    filteredStatement.slice(0, 8).forEach((item, idx) => {
      const sign = item.type === 'PAYMENT' ? '[-] Payment' : '[+] Charge';
      msg += `${idx + 1}. ${item.formattedDate || ''}: ${sign} BD ${Number(item.amount).toFixed(3)} (Bal: BD ${Number(item.running_balance).toFixed(3)})\n`;
    });

    msg += `--------------------------------\n`;
    msg += `*Please settle payments at the Layali Supermarket counter or via BenefitPay Fawri+.* Thank you for shopping with us!\n`;

    const url = `https://wa.me/${selectedCustomer.phone ? selectedCustomer.phone.replace(/[^0-9]/g, '') : ''}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  // Handle Fast Personal Settle Submission
  const handleConfirmPayment = async () => {
    if (!selectedCustomer) return;
    const amountNum = parseFloat(payAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Please enter a valid BD amount.');
      return;
    }

    setIsSubmittingPay(true);
    try {
      const res = await fetchFromCandidates('/api/khata/settle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pos-client': 'store-pos',
          'x-manager-pin': getManagerPin()
        },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          amount: amountNum,
          amountPaid: amountNum,
          paymentMethod: payMethod,
          reference: `Personal Khata Payment - ${selectedCustomer.name}`
        })
      });

      if (res && res.ok) {
        if (payMethod === 'CASH') kickCashDrawer().catch(() => { });
        playThankYouVoice('KHATA_PAYMENT');

        const prevBal = Number(selectedCustomer.personalBalance ?? selectedCustomer.currentBalance ?? 0);
        const newBal = Math.max(0, prevBal - amountNum);

        printKhataPaymentReceipt({
          shopName: "LAYALI SUPERMARKET",
          customerName: selectedCustomer.name,
          customerPhone: selectedCustomer.phone,
          customerCpr: selectedCustomer.cpr,
          amountPaid: amountNum,
          previousBalance: prevBal,
          newBalance: newBal,
          paymentMethod: payMethod,
          receiptNo: `KP-${Date.now().toString().slice(-6)}`,
          timestamp: new Date().toISOString()
        }).catch(() => { });

        if (showToast) showToast(`✅ Received BD ${amountNum.toFixed(3)} for ${selectedCustomer.name}!`, 'success');
        onCustomerUpdated?.();
        setShowPayModal(false);
        setPayAmount('');
        // Reload customer statement and balances
        await loadCustomerStatement(selectedCustomer.id);
        await loadCustomers();
      } else {
        const errData = await res?.json().catch(() => ({}));
        alert(errData?.error || 'Payment failed');
      }
    } catch (err: any) {
      alert(`Network error: ${err?.message || err}`);
    } finally {
      setIsSubmittingPay(false);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Search & NFC Banner */}
      {!selectedCustomer ? (
        <div className="flex flex-col space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search customer by name, phone, CPR, batch number, or tap NFC card..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-base py-3 pl-10 pr-4 bg-slate-100 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <button
              onClick={loadCustomers}
              disabled={isLoadingList}
              className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 active:scale-95 transition-transform cursor-pointer flex items-center gap-1.5 font-bold text-sm shrink-0"
              title="Refresh customer balances"
            >
              <RefreshCw size={16} className={isLoadingList ? 'animate-spin text-emerald-600' : ''} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Omni-Scanner Status */}
          <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-semibold text-slate-300">
                Tap ANY customer's NFC card on Sunmi reader to open statement immediately
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">58mm Thermal Ready</span>
          </div>

          {/* Customer Directory List */}
          {isLoadingList ? (
            <div className="py-16 text-center text-slate-500 space-y-2">
              <RefreshCw className="animate-spin mx-auto text-emerald-500" size={32} />
              <p className="font-medium text-sm">Loading customer directory & personal balances...</p>
            </div>
          ) : filteredCustomerList.length === 0 ? (
            <div className="py-16 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 space-y-3">
              <User className="mx-auto text-slate-300" size={48} />
              <p className="font-bold text-slate-700 text-base">No customers found</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {searchQuery ? `No customer matches "${searchQuery}".` : 'No customers on record yet.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {filteredCustomerList.map((cust) => {
                const pBal = Number(cust.personalBalance ?? cust.currentBalance ?? 0);
                const hasDebt = pBal > 0;
                return (
                  <div
                    key={cust.id}
                    onClick={() => setSelectedCustomer(cust)}
                    className="bg-white border-2 border-slate-200 hover:border-emerald-500 p-3.5 rounded-2xl shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 text-base group-hover:text-emerald-700 transition-colors">
                          {cust.name}
                        </span>
                        {cust.cardUid && (
                          <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold border border-slate-200">
                            💳 {cust.cardUid}
                          </span>
                        )}
                        {cust.batchNo && (
                          <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold uppercase">
                            {cust.batchNo}
                          </span>
                        )}
                        {cust.messName && (
                          <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded font-bold">
                            👥 {cust.messName}
                          </span>
                        )}
                        {cust.card_deposit_status === 'IN_CREDIT' || cust.card_deposit_status === 'DEFERRED_CREDIT' || cust.card_deposit_status === 'DEFERRED_PAYDAY' || cust.depositInCredit ? (
                          <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-300 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                            IN CREDIT (DUE): BD {Number(cust.card_deposit_amount || 3).toFixed(3)}
                          </span>
                        ) : (Number(cust.card_deposit_amount || 0) > 0 || cust.card_deposit_status === 'HELD') ? (
                          <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                            HELD IN TRUST: BD {Number(cust.card_deposit_amount ?? 3).toFixed(3)}
                          </span>
                        ) : (
                          <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                            NO DEPOSIT
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{cust.phone || 'No phone'}</span>
                        {cust.cpr && <span>• CPR: {cust.cpr}</span>}
                        {Number(cust.messShare || 0) > 0 && (
                          <span className="text-indigo-600 font-semibold">
                            • Mess Share: BD {Number(cust.messShare).toFixed(3)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                          Personal Tab
                        </span>
                        <span className={`text-xl font-black ${hasDebt ? 'text-red-500' : 'text-slate-800'}`}>
                          BD {pBal.toFixed(3)}
                        </span>
                      </div>
                      <div className="p-2 bg-slate-100 group-hover:bg-emerald-50 text-slate-400 group-hover:text-emerald-600 rounded-xl transition-colors">
                        <ChevronRight size={18} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* DETAIL STATEMENT VIEW FOR SELECTED CUSTOMER */
        <div className="flex flex-col space-y-4 animate-in fade-in">
          {/* Top Bar with Back and Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedCustomer(null)}
                className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer flex items-center gap-1 font-bold text-sm"
              >
                <ArrowLeft size={18} />
                <span>All Customers</span>
              </button>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-2xl font-black text-slate-900">{selectedCustomer.name}</h4>
                  {selectedCustomer.cardUid && (
                    <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-mono font-bold border border-slate-200">
                      Card: {selectedCustomer.cardUid}
                    </span>
                  )}
                  {selectedCustomer.card_deposit_status === 'IN_CREDIT' || selectedCustomer.card_deposit_status === 'DEFERRED_CREDIT' || selectedCustomer.card_deposit_status === 'DEFERRED_PAYDAY' || selectedCustomer.depositInCredit ? (
                    <span className="text-xs bg-rose-50 text-rose-700 border border-rose-300 px-2 py-0.5 rounded-md font-black uppercase tracking-wider">
                      IN CREDIT (DUE): BD {Number(selectedCustomer.card_deposit_amount || 3).toFixed(3)}
                    </span>
                  ) : (Number(selectedCustomer.card_deposit_amount || 0) > 0 || selectedCustomer.card_deposit_status === 'HELD') ? (
                    <span className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-md font-black uppercase tracking-wider">
                      HELD IN TRUST: BD {Number(selectedCustomer.card_deposit_amount ?? 3).toFixed(3)}
                    </span>
                  ) : (
                    <span className="text-xs bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">
                      NO DEPOSIT
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 font-medium flex items-center gap-2 mt-0.5">
                  <span>{selectedCustomer.phone || 'No phone'}</span>
                  {selectedCustomer.cpr && <span>• CPR: {selectedCustomer.cpr}</span>}
                  {selectedCustomer.messName && (
                    <span className="text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded">
                      Enrolled in Mess: {selectedCustomer.messName}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setPayAmount(Number(selectedCustomer.personalBalance ?? selectedCustomer.currentBalance ?? 0).toFixed(3));
                  setShowPayModal(true);
                }}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer shadow-xs"
              >
                <Banknote size={16} />
                <span>Receive Payment</span>
              </button>

              <button
                type="button"
                onClick={handlePrintStatement}
                disabled={isPrinting}
                className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer shadow-xs"
                title="Print 58mm Thermal Personal Statement"
              >
                <Printer size={15} />
                <span>{isPrinting ? 'Printing...' : 'Print Statement'}</span>
              </button>

              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="px-3.5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer shadow-xs"
                title="Share Personal Statement on WhatsApp"
              >
                <MessageCircle size={15} />
                <span>WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => setShowBookBalanceModal(true)}
                className="px-3.5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer shadow-xs"
                title="Add previous physical paper book balance to this customer"
              >
                <BookOpen size={15} />
                <span>+ Book Balance</span>
              </button>

              {onSelectCustomerForCart && (
                <button
                  type="button"
                  onClick={() => onSelectCustomerForCart(selectedCustomer)}
                  className="px-3 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold active:scale-95 transition-transform cursor-pointer shadow-xs"
                  title="Link to checkout cart"
                >
                  🛒 Link Cart
                </button>
              )}
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {/* Personal Tab Debt */}
            <div className="bg-red-50 border-2 border-red-200/80 p-3 rounded-2xl">
              <div className="flex items-center justify-between text-red-700 text-[10px] font-bold uppercase tracking-wider">
                <span>Personal Balance Owed</span>
                <Lock size={12} className="text-red-400" />
              </div>
              <p className="text-2xl font-black text-red-950 mt-0.5">
                BD {Number(selectedCustomer.personalBalance ?? selectedCustomer.currentBalance ?? 0).toFixed(3)}
              </p>
              <span className="text-[10px] font-semibold text-red-600">Strictly private debt</span>
            </div>

            {/* Card Security Deposit (Dedicated Column) */}
            <div className={`border-2 p-3 rounded-2xl ${selectedCustomer.card_deposit_status === 'IN_CREDIT' || selectedCustomer.card_deposit_status === 'DEFERRED_CREDIT' || selectedCustomer.card_deposit_status === 'DEFERRED_PAYDAY' || selectedCustomer.depositInCredit
                ? 'bg-rose-50 border-rose-200/80'
                : (Number(selectedCustomer.card_deposit_amount || 0) > 0 || selectedCustomer.card_deposit_status === 'HELD')
                  ? 'bg-emerald-50 border-emerald-200/80'
                  : 'bg-slate-50 border-slate-200'
              }`}>
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                <span className={
                  selectedCustomer.card_deposit_status === 'IN_CREDIT' || selectedCustomer.card_deposit_status === 'DEFERRED_CREDIT' || selectedCustomer.card_deposit_status === 'DEFERRED_PAYDAY' || selectedCustomer.depositInCredit
                    ? 'text-rose-700'
                    : (Number(selectedCustomer.card_deposit_amount || 0) > 0 || selectedCustomer.card_deposit_status === 'HELD')
                      ? 'text-emerald-700'
                      : 'text-slate-600'
                }>Card Deposit</span>
              </div>
              <p className={`text-2xl font-black mt-0.5 ${selectedCustomer.card_deposit_status === 'IN_CREDIT' || selectedCustomer.card_deposit_status === 'DEFERRED_CREDIT' || selectedCustomer.card_deposit_status === 'DEFERRED_PAYDAY' || selectedCustomer.depositInCredit
                  ? 'text-rose-700'
                  : (Number(selectedCustomer.card_deposit_amount || 0) > 0 || selectedCustomer.card_deposit_status === 'HELD')
                    ? 'text-emerald-700'
                    : 'text-slate-400'
                }`}>
                BD {Number(selectedCustomer.card_deposit_amount || (selectedCustomer.depositInCredit ? 3 : 0)).toFixed(3)}
              </p>
              <span className={`text-[10px] font-black uppercase tracking-wider ${selectedCustomer.card_deposit_status === 'IN_CREDIT' || selectedCustomer.card_deposit_status === 'DEFERRED_CREDIT' || selectedCustomer.card_deposit_status === 'DEFERRED_PAYDAY' || selectedCustomer.depositInCredit
                  ? 'text-rose-700'
                  : (Number(selectedCustomer.card_deposit_amount || 0) > 0 || selectedCustomer.card_deposit_status === 'HELD')
                    ? 'text-emerald-700'
                    : 'text-slate-400'
                }`}>
                {selectedCustomer.card_deposit_status === 'IN_CREDIT' || selectedCustomer.card_deposit_status === 'DEFERRED_CREDIT' || selectedCustomer.card_deposit_status === 'DEFERRED_PAYDAY' || selectedCustomer.depositInCredit
                  ? 'IN CREDIT (DUE)'
                  : (Number(selectedCustomer.card_deposit_amount || 0) > 0 || selectedCustomer.card_deposit_status === 'HELD')
                    ? 'HELD IN TRUST'
                    : 'NO DEPOSIT'}
              </span>
            </div>

            {/* Total Charged (Purchases) */}
            <div className="bg-slate-50 border-2 border-slate-200 p-3 rounded-2xl">
              <div className="flex items-center justify-between text-slate-600 text-[10px] font-bold uppercase tracking-wider">
                <span>Total Purchases</span>
                <TrendingUp size={12} className="text-slate-400" />
              </div>
              <p className="text-2xl font-black text-slate-900 mt-0.5">
                BD {totalDebitPurchases.toFixed(3)}
              </p>
              <span className="text-[10px] font-semibold text-slate-500">Cigarettes, food, snacks</span>
            </div>

            {/* Total Paid (Payments) */}
            <div className="bg-emerald-50 border-2 border-emerald-200/80 p-3 rounded-2xl">
              <div className="flex items-center justify-between text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
                <span>Total Paid Back</span>
                <TrendingDown size={12} className="text-emerald-500" />
              </div>
              <p className="text-2xl font-black text-emerald-950 mt-0.5">
                BD {totalCreditPayments.toFixed(3)}
              </p>
              <span className="text-[10px] font-semibold text-emerald-600">Cash & BenefitPay</span>
            </div>

            {/* Credit Limit & Safety */}
            <div className="bg-slate-50 border-2 border-slate-200 p-3 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">Credit Limit</span>
              <p className="text-2xl font-black text-slate-900 mt-0.5">
                BD {Number(selectedCustomer.creditLimit || 30.0).toFixed(3)}
              </p>
              <span className="text-[10px] font-semibold text-slate-500">Authorized store limit</span>
            </div>
          </div>

          {/* Statement Filters & Date Range Controls */}
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            {/* Quick Date Presets */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => applyDatePreset('ALL')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${dateRangePreset === 'ALL'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
              >
                All Time
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('THIS_MONTH')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${dateRangePreset === 'THIS_MONTH'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('LAST_MONTH')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${dateRangePreset === 'LAST_MONTH'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
              >
                Last Month
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('TODAY')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${dateRangePreset === 'TODAY'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
              >
                Today
              </button>
            </div>

            {/* Type Filters (All / Charges / Payments) */}
            {/* Scope & Type Filters */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Scope Switcher: Personal vs All Card Swipes */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setEntryScope('PERSONAL')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${entryScope === 'PERSONAL'
                      ? 'bg-white text-slate-800 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                    }`}
                  title="Only view personal purchases"
                >
                  Personal ({statementEntries.filter((i) => !i.mess_id).length})
                </button>
                <button
                  type="button"
                  onClick={() => setEntryScope('ALL')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${entryScope === 'ALL'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                    }`}
                  title="View all purchases made on this card, including dining hall mess splits"
                >
                  All Swipes ({statementEntries.length})
                </button>
              </div>

              {/* Type Switcher: All / Charges / Payments */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setTypeFilter('ALL')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${typeFilter === 'ALL'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                >
                  All Entries
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter('CHARGES')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${typeFilter === 'CHARGES'
                      ? 'bg-slate-800 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                >
                  Charges Only
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter('PAYMENTS')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${typeFilter === 'PAYMENTS'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                >
                  Payments
                </button>
              </div>
            </div>
          </div>

          {/* Itemized Chronological Ledger Table */}
          <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-emerald-600" />
                <h5 className="font-black text-slate-800 text-sm">Personal Purchases & Settlement History</h5>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                Showing {filteredStatement.length} ledger transactions
              </span>
            </div>

            {isLoadingStatement ? (
              <div className="py-16 text-center text-slate-400 space-y-2">
                <RefreshCw className="animate-spin mx-auto text-emerald-500" size={28} />
                <p className="text-xs">Fetching personal ledger history...</p>
              </div>
            ) : filteredStatement.length === 0 ? (
              <div className="py-14 text-center text-slate-400 space-y-1">
                <Receipt size={36} className="mx-auto text-slate-300" />
                <p className="text-sm font-bold text-slate-600">No personal transactions in this period</p>
                <p className="text-xs text-slate-400">
                  {typeFilter !== 'ALL' ? 'Try switching filter back to "All Entries".' : 'Customer has zero personal purchases or payments.'}
                </p>
              </div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
                {filteredStatement.map((tx: any) => {
                  const isPayment = tx.type === 'PAYMENT' || tx.type === 'WRITE_OFF' || tx.raw_amount < 0;
                  return (
                    <div
                      key={tx.id}
                      className="p-3.5 hover:bg-slate-50/80 transition-colors flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-800 text-sm">
                            {tx.reference?.match(/(INV-[A-Za-z0-9_-]+)/i)?.[1] || tx.reference || (isPayment ? 'Payment Settle' : 'Grocery Purchase')}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${tx.type === 'DEPOSIT_DEFERRED' ? 'bg-rose-100 text-rose-800' :
                                tx.type === 'DEPOSIT_COLLECTED' ? 'bg-emerald-100 text-emerald-800' :
                                  tx.type === 'DEPOSIT_REFUND' ? 'bg-amber-100 text-amber-800' :
                                    isPayment ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'
                              }`}
                          >
                            {tx.type === 'DEPOSIT_DEFERRED' ? 'CARD DEPOSIT (IN CREDIT)' :
                              tx.type === 'DEPOSIT_COLLECTED' ? 'DEPOSIT COLLECTED' :
                                tx.type === 'DEPOSIT_REFUND' ? 'DEPOSIT REFUNDED' :
                                  isPayment ? 'PAYMENT RECEIVED' : 'PERSONAL CHARGE'}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-500 font-medium">
                            {tx.formattedDate} {tx.formattedTime}
                          </span>
                        </div>

                        <p className="text-slate-500 text-[11px] truncate max-w-md">
                          {tx.reference || 'Store credit transaction'}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`text-base font-black ${isPayment ? 'text-emerald-600' : 'text-slate-900'
                            }`}
                        >
                          {isPayment ? '-' : '+'}BD {Number(tx.amount || 0).toFixed(3)}
                        </span>
                        {tx.running_balance !== undefined && (
                          <span className="text-[10px] text-slate-400 block font-medium">
                            Bal: BD {Number(tx.running_balance).toFixed(3)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FAST PAYMENT MODAL INSIDE STATEMENT */}
      {showPayModal && selectedCustomer && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200">
            <div className="bg-emerald-600 text-white p-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase font-bold text-emerald-200 tracking-wider">Personal Khata Settlement</p>
                <h4 className="text-xl font-black">{selectedCustomer.name}</h4>
              </div>
              <button
                onClick={() => setShowPayModal(false)}
                className="p-2 text-emerald-200 hover:text-white rounded-lg cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Current Debt Card */}
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">Outstanding Personal Debt:</span>
                <span className="text-lg font-black text-red-600">
                  BD {Number(selectedCustomer.personalBalance ?? selectedCustomer.currentBalance ?? 0).toFixed(3)}
                </span>
              </div>

              {/* Amount to Settle */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Payment Amount to Settle (BHD):
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3.5 font-black text-slate-400 text-sm">BD</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full text-2xl font-black py-2.5 pl-12 pr-4 bg-slate-100 border-2 border-slate-200 rounded-xl focus:border-emerald-600 focus:bg-white outline-none"
                  />
                </div>
              </div>

              {/* Quick Fill Buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPayAmount(Number(selectedCustomer.personalBalance ?? selectedCustomer.currentBalance ?? 0).toFixed(3))}
                  className="px-2.5 py-1 text-xs bg-slate-200 hover:bg-slate-300 font-bold rounded-lg cursor-pointer text-slate-700"
                >
                  Full Amount
                </button>
                <button
                  type="button"
                  onClick={() => setPayAmount((Number(selectedCustomer.personalBalance ?? selectedCustomer.currentBalance ?? 0) / 2).toFixed(3))}
                  className="px-2.5 py-1 text-xs bg-slate-200 hover:bg-slate-300 font-bold rounded-lg cursor-pointer text-slate-700"
                >
                  50% Partial
                </button>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Payment Method:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayMethod('CASH')}
                    className={`p-3 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all ${payMethod === 'CASH'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <Banknote size={16} />
                    <span>💵 Cash</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayMethod('BENEFIT_PAY')}
                    className={`p-3 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all ${payMethod === 'BENEFIT_PAY'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <Smartphone size={16} />
                    <span>📱 BenefitPay</span>
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPayment}
                  disabled={isSubmittingPay}
                  className="flex-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-sm active:scale-95 transition-transform cursor-pointer shadow-sm flex items-center justify-center gap-2"
                >
                  {isSubmittingPay ? (
                    <RefreshCw className="animate-spin" size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  <span>Confirm Settlement</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Book Balance Modal */}
      {showBookBalanceModal && selectedCustomer && (
        <AddCustomerBookBalanceModal
          customer={selectedCustomer}
          apiBase={apiBase}
          onClose={() => setShowBookBalanceModal(false)}
          onSuccess={(updatedCustomer) => {
            setShowBookBalanceModal(false);
            loadCustomers();
            if (selectedCustomer) {
              setSelectedCustomer((prev: any) => prev ? {
                ...prev,
                balance: updatedCustomer.balance ?? prev.balance,
                personalBalance: updatedCustomer.balance ?? prev.personalBalance,
                currentBalance: updatedCustomer.balance ?? prev.currentBalance
              } : null);
              loadCustomerStatement(selectedCustomer.id);
            }
            onCustomerUpdated?.();
            showToast?.(`Added book balance to ${updatedCustomer.name || selectedCustomer.name}`, 'success');
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
};
