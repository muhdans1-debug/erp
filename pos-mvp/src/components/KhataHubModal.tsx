import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, UserPlus, Banknote, Smartphone, CheckCircle2, ChevronRight, ArrowLeft, Save, IdCard, Phone, Wifi, Printer, FileClock, FileText, Settings, Trash2, ShieldAlert, MessageCircle, ArrowUpDown, Check, ShieldCheck, RefreshCw, ShoppingCart, CreditCard, Users, Scale } from 'lucide-react';
import { printKhataStatement, printKhataPaymentReceipt } from '../utils/printer';
import { kickCashDrawer } from '../services/cashDrawerService';
import { playThankYouVoice } from '../utils/sound';
import { CustomerDisplay } from '../plugins/CustomerDisplay';
import { db } from '../db';
import { generateBenefitPayPayload, getStoredBenefitPayConfig } from '../utils/benefitPay';
import { getManagerPin, verifyManagerPin } from '../utils/authUtils';
import { getApiBaseUrl, DEFAULT_EDGE_API_URL } from '../utils/apiConfig';
import { saveOfflineKhataSettlement, markOfflineKhataSettlementSynced } from '../utils/nativeDb';
import NfcManager from './NfcManager';

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  cpr?: string | null;
  batchNo?: string | null;
  description?: string | null;
  cardUid?: string | null;
  currentBalance: number;
  balance?: number;
  creditLimit?: number;
  isStale?: boolean;
  isOverLimit?: boolean;
  daysSinceLastPayment?: number;
  is_active?: number | boolean;
  isActive?: boolean;
  isFrozen?: boolean;
  mess_id?: string | null;
  messName?: string | null;
  mess_name?: string | null;
  isMessGroup?: boolean;
  messes?: { id: string; group_name: string }[];
  mess_ids?: string[];
  isMultiMess?: boolean;
  hasMessGroup?: boolean;
}

interface MessMemberData {
  id: string;
  name: string;
  phone?: string | null;
  cpr?: string | null;
  cardUid?: string | null;
  nfcCardId?: string | null;
  batchNo?: string | null;
  currentBalance: number;
  balance?: number;
  spendPercentage?: number;
  equalSplitShare?: number;
}

interface MessGroupData {
  id: string;
  group_name: string;
  name?: string;
  memberCount: number;
  totalBalance: number;
  balance?: number;
  equalSplitShare?: number;
  members: MessMemberData[];
  messLedger?: any[];
}


interface KhataHubModalProps {
  onClose: () => void;
  apiBase?: string;
  onCustomerUpdated?: () => void;
  onSelectCustomerForCart?: (customer: Customer) => void;
  lastScannedCardUid?: string | null;
  showToast?: (message: string, type?: 'success' | 'info' | 'error') => void;
}

export default function KhataHubModal({
  onClose,
  apiBase = 'http://localhost:3000',
  onCustomerUpdated,
  onSelectCustomerForCart,
  lastScannedCardUid,
  showToast
}: KhataHubModalProps) {
  const [activeTab, setActiveTab] = useState<'SETTLE' | 'CLAIMS' | 'NEW' | 'CARDS'>('SETTLE');
  const [targetCustomerForStatement, setTargetCustomerForStatement] = useState<any | null>(null);
  // Unified single-pipeline state using parent-provided NFC card UID (eliminates duplicate listener collision)
  const [scannedUid, setScannedUid] = useState<string | null>(lastScannedCardUid || null);
  const lastDetectedUid = lastScannedCardUid || scannedUid;
  const clearScan = useCallback(() => setScannedUid(null), []);

  const [pendingClaims, setPendingClaims] = useState<any[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(false);
  const [actioningClaimId, setActioningClaimId] = useState<string | null>(null);

  const fetchPendingClaims = useCallback(async () => {
    try {
      setLoadingClaims(true);
      const res = await fetch(`${apiBase}/api/khata/claims/pending`);
      if (res.ok) {
        const data = await res.json();
        setPendingClaims(data.claims || []);
      }
    } catch (err) {
      console.warn('Failed to load pending claims:', err);
    } finally {
      setLoadingClaims(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchPendingClaims();
    const timer = setInterval(fetchPendingClaims, 10000);
    return () => clearInterval(timer);
  }, [fetchPendingClaims]);

  useEffect(() => {
    if (lastScannedCardUid) {
      setScannedUid(lastScannedCardUid);
    }
  }, [lastScannedCardUid]);

  // Live NFC listener directly in KhataHubModal
  useEffect(() => {
    const handleSunmiNfc = (e: any) => {
      const uid = e?.detail?.tag_id || e?.detail?.nfcId || (typeof e?.detail === 'string' ? e.detail : '');
      if (uid) {
        setScannedUid(uid.trim().toUpperCase());
      }
    };
    window.addEventListener('sunmi-nfc-scan', handleSunmiNfc);
    return () => window.removeEventListener('sunmi-nfc-scan', handleSunmiNfc);
  }, []);

  const handleApproveClaim = async (claim: any) => {
    if (actioningClaimId) return;
    setActioningClaimId(claim.id);
    try {
      const res = await fetch(`${apiBase}/api/khata/claims/${claim.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer: 'POS Cashier' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast ? showToast(`Approved BD ${Number(data.clearedAmount).toFixed(3)} for ${claim.customerName || 'customer'}!`, 'success') : alert('Approved!');
        try {
          kickCashDrawer();
          playThankYouVoice();
        } catch { }
        setPendingClaims((prev) => prev.filter((c) => c.id !== claim.id));
        onCustomerUpdated?.();
      } else {
        const err = data.error || 'Failed to approve claim';
        showToast ? showToast(err, 'error') : alert(err);
      }
    } catch (err: any) {
      showToast ? showToast(err.message || 'Network error', 'error') : alert('Network error');
    } finally {
      setActioningClaimId(null);
    }
  };

  const handleRejectClaim = async (claim: any) => {
    if (actioningClaimId) return;
    if (!window.confirm(`Are you sure you want to REJECT the BD ${Number(claim.amount).toFixed(3)} payment claim for ${claim.customerName || 'customer'}? Debt balance will remain unpaid.`)) {
      return;
    }
    setActioningClaimId(claim.id);
    try {
      const res = await fetch(`${apiBase}/api/khata/claims/${claim.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer: 'POS Cashier', reason: 'Unverified on BenefitPay device' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast ? showToast(`Claim rejected for ${claim.customerName}`, 'info') : alert('Claim rejected');
        setPendingClaims((prev) => prev.filter((c) => c.id !== claim.id));
      } else {
        const err = data.error || 'Failed to reject claim';
        showToast ? showToast(err, 'error') : alert(err);
      }
    } catch (err: any) {
      showToast ? showToast(err.message || 'Network error', 'error') : alert('Network error');
    } finally {
      setActioningClaimId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
        {/* Header & Tabs */}
        <div className="bg-slate-50 border-b">
          <div className="flex justify-between items-center p-4">
            <h3 className="text-2xl font-bold text-slate-800">Khata Hub</h3>
            <button
              onClick={onClose}
              className="p-3 bg-slate-200 hover:bg-slate-300 rounded-full active:scale-90 transition-transform cursor-pointer"
            >
              <X size={24} />
            </button>
          </div>
          <div className="flex grid-cols-4 w-full text-base font-bold">
            <button
              onClick={() => setActiveTab('SETTLE')}
              className={`flex-1 py-3.5 border-b-4 transition-colors cursor-pointer ${activeTab === 'SETTLE'
                ? 'border-emerald-500 text-emerald-600 bg-emerald-50'
                : 'border-transparent text-slate-500 hover:bg-slate-100'
                }`}
            >
              Receive Payment
            </button>
            <button
              onClick={() => {
                setActiveTab('CLAIMS');
                fetchPendingClaims();
              }}
              className={`flex-1 py-3.5 border-b-4 transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${activeTab === 'CLAIMS'
                ? 'border-amber-500 text-amber-600 bg-amber-50'
                : 'border-transparent text-slate-500 hover:bg-slate-100'
                }`}
            >
              <span>BenefitPay Claims</span>
              {pendingClaims.length > 0 && (
                <span className="px-2 py-0.5 text-xs bg-amber-500 text-white font-black rounded-full animate-pulse">
                  {pendingClaims.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('NEW')}
              className={`flex-1 py-3.5 border-b-4 transition-colors cursor-pointer ${activeTab === 'NEW'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-slate-500 hover:bg-slate-100'
                }`}
            >
              <UserPlus className="inline mr-1" size={18} /> New Customer
            </button>
            <button
              onClick={() => setActiveTab('CARDS')}
              className={`flex-1 py-3.5 border-b-4 transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${activeTab === 'CARDS'
                ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                : 'border-transparent text-slate-500 hover:bg-slate-100'
                }`}
            >
              <CreditCard className="inline mr-1" size={18} />
              <span>NFC Cards & Mess</span>
            </button>
          </div>
        </div>

        {/* Dynamic Content Area */}
        <div className="p-6 bg-white min-h-[420px] max-h-[75vh] overflow-y-auto">
          {activeTab === 'CARDS' ? (
            <NfcManager
              apiBase={apiBase}
              onNavigateToKhata={() => setActiveTab('SETTLE')}
              onOpenCustomerStatement={(cust) => {
                setTargetCustomerForStatement(cust);
                setActiveTab('SETTLE');
              }}
              onSelectCustomerForCart={(selected) => {
                onSelectCustomerForCart?.(selected);
                onClose();
              }}
            />
          ) : activeTab === 'SETTLE' ? (
            <SettleBalanceView
              apiBase={apiBase}
              onCustomerUpdated={onCustomerUpdated}
              onSelectCustomerForCart={onSelectCustomerForCart}
              onClose={onClose}
              showToast={showToast}
              initialCardUid={lastScannedCardUid || lastDetectedUid}
              scannedCardUid={scannedUid}
              clearScan={clearScan}
              initialTargetCustomer={targetCustomerForStatement}
              onClearTargetCustomer={() => setTargetCustomerForStatement(null)}
            />
          ) : activeTab === 'CLAIMS' ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border">
                <div>
                  <h4 className="font-extrabold text-slate-800 text-lg">BenefitPay Fawri+ Claims</h4>
                  <p className="text-xs text-slate-500">
                    Verify customer's reference against the store BenefitPay phone before approving.
                  </p>
                </div>
                <button
                  onClick={fetchPendingClaims}
                  disabled={loadingClaims}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw size={14} className={loadingClaims ? 'animate-spin' : ''} />
                  <span>Refresh</span>
                </button>
              </div>

              {loadingClaims && pendingClaims.length === 0 ? (
                <div className="py-12 text-center text-slate-400">Loading claims...</div>
              ) : pendingClaims.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-slate-100 mx-auto flex items-center justify-center text-slate-400">
                    <ShieldCheck size={24} />
                  </div>
                  <p className="text-sm font-bold text-slate-600">No Pending BenefitPay Claims</p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    When customers submit a Fawri+ transfer reference on their PWA, it will appear here for cashier review.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingClaims.map((claim) => (
                    <div
                      key={claim.id}
                      className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-amber-400 transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-base">
                            {claim.customerName || 'Customer'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            Ref: {claim.reference}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 font-mono">
                          Current Debt: BD {Number(claim.currentBalance ?? 0).toFixed(3)} • Claimed: <strong className="text-emerald-700 font-extrabold text-sm">BD {Number(claim.amount).toFixed(3)}</strong>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Submitted {new Date(claim.createdAt || Date.now()).toLocaleTimeString()}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => handleApproveClaim(claim)}
                          disabled={actioningClaimId === claim.id}
                          className="flex-1 sm:flex-none px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Check size={16} />
                          <span>Approve & Clear</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectClaim(claim)}
                          disabled={actioningClaimId === claim.id}
                          className="flex-1 sm:flex-none px-3 py-2.5 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <X size={16} />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <NewCustomerView
              apiBase={apiBase}
              lastScannedCardUid={lastScannedCardUid || lastDetectedUid}
              scannedCardUid={scannedUid}
              clearScan={clearScan}
              onCustomerCreated={() => {
                onCustomerUpdated?.();
                setActiveTab('SETTLE');
              }}
              showToast={showToast}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// --- SUB-COMPONENTS ---

/**
 * Broadcasts live Khata payment details to Sunmi secondary customer-facing display & pole display.
 */
export function broadcastKhataPayment(
  customer: Customer | null,
  amount: number,
  isConfirmed: boolean = false,
  method?: string,
  receiptNo?: string
) {
  if (typeof window === 'undefined') return;

  const currentBal = customer ? Number(customer.currentBalance ?? customer.balance ?? 0) : 0;
  const payAmt = Number(amount || 0);
  const remainingBal = isConfirmed
    ? Math.max(0, currentBal)
    : Math.max(0, currentBal - payAmt);

  const qrPayload = (customer && payAmt > 0)
    ? generateBenefitPayPayload(
      payAmt,
      `KHATA-${customer.id}-${Date.now().toString().slice(-4)}`,
      getStoredBenefitPayConfig()
    )
    : null;

  const payload = {
    type: isConfirmed ? 'KHATA_PAYMENT_CONFIRMED' : 'KHATA_PAYMENT_PREVIEW',
    payload: {
      customer: customer ? {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        cpr: customer.cpr,
        currentBalance: currentBal,
        group_name: customer.batchNo || customer.description
      } : null,
      payAmount: payAmt,
      remainingBalance: remainingBal,
      paymentMethod: method || 'CASH',
      status: isConfirmed ? 'CONFIRMED' : (payAmt > 0 ? 'READY_TO_PAY' : 'ENTERING_AMOUNT'),
      qrPayload,
      receiptNo,
      timestamp: new Date().toISOString()
    }
  };

  try {
    localStorage.setItem('askar_khata_customer_display', JSON.stringify(payload));
    const ch1 = new BroadcastChannel('sunmi_dual_screen');
    ch1.postMessage(payload);
    ch1.close();

    const ch2 = new BroadcastChannel('askar_customer_display_channel');
    ch2.postMessage(payload);
    ch2.close();
  } catch (_) { }

  // Update hardware pole display
  if (customer) {
    if (isConfirmed) {
      CustomerDisplay.updateDisplay?.({
        text: `THANK YOU, ${customer.name.toUpperCase()}!\nPAID: BD ${payAmt.toFixed(3)}\nNEW BAL: BD ${remainingBal.toFixed(3)}`
      }).catch(() => { });
    } else {
      CustomerDisplay.updateDisplay?.({
        text: `${customer.name.toUpperCase()}\nOWED: BD ${currentBal.toFixed(3)}\nPAYING: BD ${payAmt.toFixed(3)}\nREM: BD ${remainingBal.toFixed(3)}`
      }).catch(() => { });
    }
  } else {
    CustomerDisplay.updateDisplay?.({
      text: `ASKAR SUPERMARKET\nWELCOME!`
    }).catch(() => { });
  }
}

export function resetCustomerDisplay() {
  const payload = { type: 'RESET_KHATA_DISPLAY' };
  try {
    localStorage.removeItem('askar_khata_customer_display');
    const ch1 = new BroadcastChannel('sunmi_dual_screen');
    ch1.postMessage(payload);
    ch1.close();
    const ch2 = new BroadcastChannel('askar_customer_display_channel');
    ch2.postMessage(payload);
    ch2.close();
  } catch (_) { }
}

function SettleBalanceView({
  apiBase,
  onCustomerUpdated,
  onSelectCustomerForCart,
  onClose,
  showToast,
  initialCardUid,
  scannedCardUid,
  clearScan,
  initialTargetCustomer,
  onClearTargetCustomer
}: {
  apiBase: string;
  onCustomerUpdated?: () => void;
  onSelectCustomerForCart?: (customer: Customer) => void;
  onClose?: () => void;
  showToast?: (message: string, type?: 'success' | 'info' | 'error') => void;
  initialCardUid?: string | null;
  scannedCardUid?: string | null;
  clearScan?: () => Promise<void> | void;
  initialTargetCustomer?: any | null;
  onClearTargetCustomer?: () => void;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNfcLoading, setIsNfcLoading] = useState(false);

  // New State for Edit/Archive Modal
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // New State for the Running Balance Ledger
  const [viewMode, setViewMode] = useState<'PAY' | 'STATEMENT'>('PAY');
  const [statement, setStatement] = useState<any[]>([]);
  const [isLoadingStatement, setIsLoadingStatement] = useState(false);
  const [statementStartDate, setStatementStartDate] = useState('');
  const [statementEndDate, setStatementEndDate] = useState('');
  const [statementTypeFilter, setStatementTypeFilter] = useState<'ALL' | 'CHARGES' | 'PAYMENTS'>('ALL');
  const [statementTab, setStatementTab] = useState<'PERSONAL' | 'MESS'>('PERSONAL');
  const [activeMessGroup, setActiveMessGroup] = useState<MessGroupData | null>(null);
  const [selectedMessMemberFilter, setSelectedMessMemberFilter] = useState<string | null>(null);
  const [messOnlyFilter, setMessOnlyFilter] = useState<boolean>(false);

  const setQuickRange = (preset: 'TODAY' | 'THIS_MONTH' | 'LAST_MONTH' | 'ALL') => {
    const now = new Date();
    if (preset === 'ALL') {
      setStatementStartDate('');
      setStatementEndDate('');
    } else if (preset === 'TODAY') {
      const todayStr = now.toISOString().slice(0, 10);
      setStatementStartDate(todayStr);
      setStatementEndDate(todayStr);
    } else if (preset === 'THIS_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const todayStr = now.toISOString().slice(0, 10);
      setStatementStartDate(firstDay);
      setStatementEndDate(todayStr);
    } else if (preset === 'LAST_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      setStatementStartDate(firstDay);
      setStatementEndDate(lastDay);
    }
  };

  const filteredStatement = useMemo(() => {
    let source = statement;
    if (statementTab === 'MESS' && activeMessGroup?.messLedger) {
      source = activeMessGroup.messLedger;
      if (selectedMessMemberFilter) {
        source = source.filter((item) => item.customerId === selectedMessMemberFilter);
      }
    }

    if (!source || !Array.isArray(source)) return [];
    return source.filter((item) => {
      if (statementTypeFilter === 'CHARGES') {
        const isCharge = item.type === 'CHARGE' || item.type === 'SALE' || Number(item.raw_amount || item.amount) > 0;
        if (!isCharge) return false;
      } else if (statementTypeFilter === 'PAYMENTS') {
        const isPayment = item.type === 'PAYMENT' || item.type === 'WRITE_OFF' || Number(item.raw_amount || item.amount) < 0;
        if (!isPayment) return false;
      }

      if (!statementStartDate && !statementEndDate) return true;
      const dateStr = item.created_at || item.timestamp || item.createdAt;
      if (!dateStr) return true;
      const txDate = new Date(dateStr);
      const start = statementStartDate ? new Date(statementStartDate) : new Date('2000-01-01');
      const end = statementEndDate ? new Date(statementEndDate) : new Date('2100-01-01');
      if (statementEndDate) end.setHours(23, 59, 59, 999);
      return txDate >= start && txDate <= end;
    });
  }, [statement, statementStartDate, statementEndDate, statementTypeFilter, statementTab, activeMessGroup, selectedMessMemberFilter]);

  const filteredDebitTotal = useMemo(() => {
    return filteredStatement.reduce((acc, item) => {
      const isCharge = item.type === 'CHARGE' || item.type === 'SALE' || Number(item.raw_amount || item.amount) > 0;
      return isCharge ? acc + Math.abs(Number(item.amount || item.total || 0)) : acc;
    }, 0);
  }, [filteredStatement]);

  const filteredCreditTotal = useMemo(() => {
    return filteredStatement.reduce((acc, item) => {
      const isPayment = item.type === 'PAYMENT' || item.type === 'WRITE_OFF' || Number(item.raw_amount || item.amount) < 0;
      return isPayment ? acc + Math.abs(Number(item.amount || item.total || 0)) : acc;
    }, 0);
  }, [filteredStatement]);

  const [sortParam, setSortParam] = useState<'highest' | 'stale' | 'lowest' | 'alpha'>('highest');

  // ⚡ Live mirror to Sunmi Customer-Facing Dual Screen & Pole Display
  useEffect(() => {
    if (selectedCustomer) {
      const amt = parseFloat(payAmount) || 0;
      broadcastKhataPayment(selectedCustomer, amt, false);
    } else {
      resetCustomerDisplay();
    }
  }, [selectedCustomer, payAmount]);

  useEffect(() => {
    return () => {
      resetCustomerDisplay();
    };
  }, []);

  const getBal = (c: any) => Number(c?.currentBalance ?? c?.balance ?? 0);

  // Fetch active customers for the Khata Hub
  const fetchKhataCustomers = async () => {
    try {
      let data: any = null;
      const headers = {
        'x-pos-client': 'store-pos',
        'x-manager-pin': getManagerPin() || '9999'
      };
      const targetBase = (apiBase && !apiBase.includes('askar-khata-pwa.vercel.app')) ? apiBase : getApiBaseUrl();
      const candidates = [
        targetBase,
        'http://192.168.8.7:3000',
        'http://localhost:3000',
        DEFAULT_EDGE_API_URL
      ].filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i);

      for (const url of candidates) {
        try {
          const res = await fetch(`${url}/khata/ledger?sort=${sortParam}`, {
            headers,
            signal: AbortSignal.timeout(4000)
          });
          if (res.ok) {
            const json = await res.json();
            if (json && (json.customers || Array.isArray(json))) {
              data = json;
              break;
            }
          }
        } catch { }
      }

      if (!data || (!data.customers && !Array.isArray(data))) {
        for (const url of candidates) {
          try {
            const res2 = await fetch(`${url}/api/customers`, {
              headers,
              signal: AbortSignal.timeout(4000)
            });
            if (res2.ok) {
              const json = await res2.json();
              if (json && (json.customers || Array.isArray(json))) {
                data = json;
                break;
              }
            }
          } catch { }
        }
      }

      const list = (data && data.customers) || (Array.isArray(data) ? data : []);
      const normalized = list
        .map((c: any) => {
          const isAct = c.is_active !== 0 && c.is_active !== false && c.isActive !== false;
          return {
            ...c,
            currentBalance: Number(c.currentBalance ?? c.balance ?? 0),
            balance: Number(c.balance ?? c.currentBalance ?? 0),
            creditLimit: Number(c.creditLimit) > 0 ? Number(c.creditLimit) : (Number(c.credit_limit) > 0 ? Number(c.credit_limit) : 30.0),
            cardUid: c.cardUid || c.nfcCardId || null,
            mess_id: c.mess_id || null,
            messName: c.messName || c.mess_name || null,
            mess_name: c.mess_name || c.messName || null,
            isMessGroup: Boolean(c.isMessGroup),
            is_active: isAct ? 1 : 0,
            isActive: isAct,
            isFrozen: !isAct
          };
        });

      if (normalized.length > 0) {
        setCustomers(normalized);
      }
    } catch (err) {
      console.error('Failed to load customers', err);
    }
  };

  useEffect(() => {
    fetchKhataCustomers();
  }, [apiBase, sortParam]);

  // 📡 Real-Time CRDT WebSocket Listener: Adjust customer balances live across all registers
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      const wsHost = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'askar-master.local';
      ws = new WebSocket(`ws://${wsHost}:3000/ws`);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'KHATA_BALANCE_UPDATED' && data.customerId) {
            const delta = Number(data.delta) || 0;

            // 1. Update customer in the active browse/search list
            setCustomers((prev) =>
              prev.map((c) => {
                if (c.id === data.customerId) {
                  const oldBal = Number(c.currentBalance ?? c.balance ?? 0);
                  const newBal = Number((oldBal + delta).toFixed(3));
                  return { ...c, currentBalance: newBal, balance: newBal };
                }
                return c;
              })
            );

            // 2. Update active customer details if currently selected
            setSelectedCustomer((prev) => {
              if (prev && prev.id === data.customerId) {
                const oldBal = Number(prev.currentBalance ?? prev.balance ?? 0);
                const newBal = Number((oldBal + delta).toFixed(3));
                return {
                  ...prev,
                  currentBalance: newBal,
                  balance: newBal
                };
              }
              return prev;
            });
          }

          if (data.type === 'KHATA_CUSTOMER_CREATED' && (data.customer || data.customerId)) {
            const newCust = data.customer || {
              id: data.customerId,
              name: data.name || 'New Customer',
              phone: data.phone || '',
              currentBalance: Number(data.openingBalance || 0),
              balance: Number(data.openingBalance || 0)
            };
            setCustomers((prev) => {
              if (prev.some((c) => c.id === newCust.id)) {
                return prev.map((c) => (c.id === newCust.id ? { ...c, ...newCust } : c));
              }
              return [newCust, ...prev];
            });
          }

          if (data.type === 'KHATA_CUSTOMER_DELETED' && data.customerId) {
            setCustomers((prev) => prev.filter((c) => c.id !== data.customerId));
            setSelectedCustomer((prev) => (prev?.id === data.customerId ? null : prev));
          }
        } catch { }
      };
    } catch { }

    return () => {
      if (ws) ws.close();
    };
  }, []);

  const handleCustomerSaved = (updated: Customer) => {
    setCustomers((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
    if (selectedCustomer && selectedCustomer.id === updated.id) {
      setSelectedCustomer((prev) => (prev ? { ...prev, ...updated } : null));
    }
    onCustomerUpdated?.();
  };

  const handleCustomerDeleted = (deletedId: string) => {
    // Immediately remove from list without page refresh
    setCustomers((prev) => prev.filter((c) => c.id !== deletedId));
    if (selectedCustomer && selectedCustomer.id === deletedId) {
      setSelectedCustomer(null);
    }
    onCustomerUpdated?.();
  };

  // Load statement for the selected customer with multi-endpoint fallback
  const loadStatement = async (customerId: string, forceMessMode: boolean = false) => {
    setIsLoadingStatement(true);
    let loaded = false;
    const candidates = [
      apiBase && !apiBase.includes('localhost') ? apiBase : null,
      getApiBaseUrl(),
      DEFAULT_EDGE_API_URL
    ].filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i);

    for (const url of candidates) {
      try {
        const res = await fetch(`${url}/api/customers/${customerId}/statement`, {
          headers: { 'x-manager-pin': getManagerPin() },
          signal: AbortSignal.timeout(4000)
        });
        if (res.ok) {
          const data = await res.json();
          const entries = data.statement || data.entries || data.sales || [];
          if (data.success && Array.isArray(entries)) {
            if (data.messGroup) {
              setActiveMessGroup(data.messGroup);
              if (forceMessMode || data.isMessStatement) {
                setStatementTab('MESS');
                setStatement(data.messGroup.messLedger || entries);
              } else {
                setStatementTab('PERSONAL');
                setStatement(entries);
              }
            } else {
              setActiveMessGroup(null);
              setStatementTab('PERSONAL');
              setStatement(entries);
            }
            setViewMode('STATEMENT');
            loaded = true;
            break;
          }
        }
      } catch {
        // try next candidate
      }
    }

    if (!loaded) {
      try {
        const localRows = await db.execute({
          sql: `SELECT * FROM KhataLedger WHERE customerId = ? ORDER BY timestamp DESC`,
          args: [customerId]
        });
        if (localRows.rows && localRows.rows.length > 0) {
          setStatement(localRows.rows as any[]);
          setStatementTab('PERSONAL');
          setViewMode('STATEMENT');
          loaded = true;
        }
      } catch (err) {
        console.warn('Local ledger read error', err);
      }
    }

    if (!loaded) {
      if (showToast) {
        showToast("⚠️ Could not load customer statement.", "error");
      } else {
        alert("Failed to load customer statement.");
      }
    }
    setIsLoadingStatement(false);
  };

  const handleShareMessWhatsApp = () => {
    if (!activeMessGroup) return;
    const memberCount = Math.max(1, activeMessGroup.members?.length || 1);
    const equalShare = (activeMessGroup.totalBalance / memberCount).toFixed(3);
    let msg = `*ASKAR SUPERMARKET - MESS EXPENSE STATEMENT*\n`;
    msg += `👥 Mess Group: ${activeMessGroup.group_name}\n`;
    msg += `📊 Total Camp Debt: BHD ${activeMessGroup.totalBalance.toFixed(3)}\n`;
    msg += `⚖️ Equal Share: BHD ${equalShare} / member\n\n`;
    msg += `*Member Debt Breakdown:*\n`;
    (activeMessGroup.members || []).forEach((m, idx) => {
      msg += `${idx + 1}. ${m.name}: BHD ${Number(m.currentBalance || 0).toFixed(3)} (${m.spendPercentage || 0}%)\n`;
    });
    msg += `\nPlease arrange payment at the counter or via BenefitPay. Thank you!`;
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const [isRebalancingMess, setIsRebalancingMess] = useState(false);

  const handleRebalanceMessCards = async () => {
    if (!activeMessGroup || !activeMessGroup.id) return;
    const targetMessId = activeMessGroup.id;
    const groupName = activeMessGroup.group_name || 'Camp Mess';
    const memberCount = activeMessGroup.members?.length || 1;
    const eqShare = (activeMessGroup.equalSplitShare || (activeMessGroup.totalBalance / Math.max(1, memberCount))).toFixed(3);

    const confirmed = window.confirm(
      `⚖️ Split Camp Debt Equally Across All Cards?\n\n` +
      `Mess Group: ${groupName}\n` +
      `Total Debt: BHD ${Number(activeMessGroup.totalBalance || 0).toFixed(3)}\n` +
      `Active Cards: ${memberCount}\n` +
      `Target Equal Share per Card: BHD ${eqShare}\n\n` +
      `This will update the ledger so that every member card account has an exact balance of BHD ${eqShare}.\n\n` +
      `Proceed?`
    );
    if (!confirmed) return;

    setIsRebalancingMess(true);
    try {
      const res = await fetch(`${apiBase}/api/khata/mess/${encodeURIComponent(targetMessId)}/rebalance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-manager-pin': getManagerPin() || '9999',
          'x-pos-client': 'store-pos'
        }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to rebalance mess group debt');
      }

      alert(`✅ Success: ${data.message || 'Camp balance split equally across all cards'}`);
      if (data.messGroup) {
        setActiveMessGroup(data.messGroup);
      }
      fetchKhataCustomers();
      if (onCustomerUpdated) onCustomerUpdated();
    } catch (err: any) {
      alert(`❌ Error: ${err?.message || 'Could not rebalance cards'}`);
    } finally {
      setIsRebalancingMess(false);
    }
  };

  const printStatement = () => {
    if (statementTab === 'MESS' && activeMessGroup) {
      const formattedStatement = filteredStatement.map((item) => ({
        id: item.id,
        amount: Number(item.amount || item.total || 0),
        type: item.type === 'SALE' || item.type === 'CHARGE' ? 'SALE' : 'PAYMENT',
        reference: item.reference || item.invoiceNo || 'Store Purchase',
        formattedDate: item.formattedDate || (item.created_at || item.timestamp ? new Date(item.created_at || item.timestamp).toLocaleDateString() : ''),
        formattedTime: item.formattedTime || (item.created_at || item.timestamp ? new Date(item.created_at || item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''),
        runningBalance: Number(item.running_balance ?? item.runningBalance ?? 0)
      }));
      printKhataStatement({
        shopName: "ASKAR STORE - MESS STATEMENT",
        customerName: activeMessGroup.group_name,
        statement: formattedStatement,
        currentBalance: activeMessGroup.totalBalance,
        isMessStatement: true,
        messGroup: {
          group_name: activeMessGroup.group_name,
          memberCount: activeMessGroup.members?.length || activeMessGroup.memberCount || 0,
          totalBalance: activeMessGroup.totalBalance,
          equalSplitShare: activeMessGroup.equalSplitShare || Number((activeMessGroup.totalBalance / Math.max(1, activeMessGroup.members?.length || 1)).toFixed(3)),
          members: (activeMessGroup.members || []).map(m => ({
            name: m.name,
            phone: m.phone,
            currentBalance: m.currentBalance,
            spendPercentage: m.spendPercentage,
            equalSplitShare: m.equalSplitShare || (activeMessGroup.equalSplitShare || Number((activeMessGroup.totalBalance / Math.max(1, activeMessGroup.members?.length || 1)).toFixed(3)))
          }))
        },
        dateRange: (statementStartDate || statementEndDate)
          ? `${statementStartDate || 'Start'} to ${statementEndDate || 'Today'}`
          : undefined
      });
      return;
    }

    if (!selectedCustomer) return;
    const formattedStatement = filteredStatement.map((item) => ({
      id: item.id,
      amount: Number(item.amount || item.total || 0),
      type: item.type === 'SALE' || item.type === 'CHARGE' ? 'SALE' : 'PAYMENT',
      reference: item.reference || item.invoiceNo || 'Store Purchase',
      formattedDate: item.formattedDate || (item.created_at || item.timestamp ? new Date(item.created_at || item.timestamp).toLocaleDateString() : ''),
      formattedTime: item.formattedTime || (item.created_at || item.timestamp ? new Date(item.created_at || item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''),
      runningBalance: Number(item.running_balance ?? item.runningBalance ?? 0)
    }));
    printKhataStatement({
      shopName: "ASKAR STORE - KHATA STATEMENT",
      customerName: selectedCustomer.name,
      customerPhone: selectedCustomer.phone,
      customerCpr: selectedCustomer.cpr,
      statement: formattedStatement,
      currentBalance: Number(selectedCustomer.currentBalance ?? selectedCustomer.balance ?? 0),
      dateRange: (statementStartDate || statementEndDate)
        ? `${statementStartDate || 'Start'} to ${statementEndDate || 'Today'}`
        : undefined
    });
  };

  // NFC Card Lookup: query /api/customers/nfc/:uid
  const handleNfcLookup = async (uid: string) => {
    if (!uid) return;
    setIsNfcLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/customers/nfc/${encodeURIComponent(uid.trim())}`);
      const data = await res.json();

      if (data.success && data.customer) {
        // Card recognized: Instantly push them to the payment view
        setSelectedCustomer(data.customer);
        setViewMode('PAY');
        if (showToast) {
          showToast(`Khata Card Recognized: ${data.customer.name}`, 'success');
        }
      } else {
        // Card unrecognized
        const errMsg = "This NFC card is not linked to any Khata account in the Askar store database.";
        if (showToast) {
          showToast(errMsg, 'error');
        } else {
          alert(errMsg);
        }
      }
    } catch (error) {
      console.error("NFC Lookup Error", error);
      if (showToast) {
        showToast("NFC lookup failed. Check server connection.", 'error');
      }
    } finally {
      setIsNfcLoading(false);
    }
  };

  // Capacitor NFC Listener: triggers instantly when tag is discovered by SUNMI antenna
  useEffect(() => {
    if (scannedCardUid) {
      handleNfcLookup(scannedCardUid);
      clearScan?.();
    }
  }, [scannedCardUid]);

  // Handle card scanned before modal opened
  useEffect(() => {
    if (initialCardUid && !selectedCustomer) {
      handleNfcLookup(initialCardUid);
    }
  }, [initialCardUid]);

  // Handle external statement trigger (e.g. from NFC Manager Mess Groups list)
  useEffect(() => {
    if (initialTargetCustomer) {
      const cust = initialTargetCustomer;
      setSelectedCustomer(cust);
      setViewMode('STATEMENT');
      if (cust.isMessGroup || cust.mess_id) {
        setStatementTab('MESS');
        loadStatement(cust.mess_id || cust.id, true);
      } else {
        setStatementTab('PERSONAL');
        loadStatement(cust.id, false);
      }
      onClearTargetCustomer?.();
    }
  }, [initialTargetCustomer]);

  const handleSettle = async (method: 'CASH' | 'BENEFIT_PAY') => {
    if (!selectedCustomer) {
      alert('Please select a customer to settle.');
      return;
    }
    const amountNum = parseFloat(payAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Enter a valid amount in BD.');
      return;
    }

    // ⚡ 0ms ZERO-LATENCY INSTANT SETTLEMENT
    const oldBal = Number(selectedCustomer.currentBalance ?? selectedCustomer.balance ?? 0);
    const newBal = Math.max(0, oldBal - amountNum);
    const tempReceiptNo = `KH-${Date.now().toString().slice(-6)}`;
    const updated = { ...selectedCustomer, currentBalance: newBal, balance: newBal };

    // 1. Immediately update UI state (0ms delay - no modal freeze!)
    setSelectedCustomer(updated);
    setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setPayAmount('');
    setIsSubmitting(false);

    const msg = `✅ Received BD ${amountNum.toFixed(3)} via ${method === 'BENEFIT_PAY' ? 'Benefit Pay' : 'Cash'}! New Balance: BD ${newBal.toFixed(3)}`;
    showToast ? showToast(msg, 'success') : alert(msg);
    onCustomerUpdated?.();

    // 2. Hardware Cash Drawer Kick on physical currency (fire-and-forget)
    if (method === 'CASH') {
      kickCashDrawer().catch((err) => console.warn('Khata payment cash drawer kick error:', err));
    }

    // 3. Professional retail voice announcement (instant)
    playThankYouVoice('KHATA_PAYMENT');

    // 4. Broadcast confirmed settlement to customer-facing screen (instant)
    broadcastKhataPayment(updated, amountNum, true, method, tempReceiptNo);

    // 5. ⚡ NON-BLOCKING THERMAL RECEIPT PRINT (DO NOT AWAIT - eliminates 2s hardware freeze)
    printKhataPaymentReceipt({
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      customerPhone: selectedCustomer.phone,
      customerCpr: selectedCustomer.cpr,
      previousBalance: oldBal,
      amountPaid: amountNum,
      newBalance: newBal,
      paymentMethod: method,
      receiptNo: tempReceiptNo,
      cashierName: 'Cashier 01',
      timestamp: new Date()
    }).catch((printErr) => {
      console.warn('Sunmi receipt print skipped or errored:', printErr);
    });

    // 6. Non-blocking asynchronous persistence: local SQLite & durable offline queue with background network sync
    (async () => {
      const settleId = crypto.randomUUID();
      try {
        await db.execute({
          sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, runningBalance, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            settleId,
            selectedCustomer.id,
            -amountNum,
            'PAYMENT',
            tempReceiptNo,
            newBal,
            new Date().toISOString()
          ]
        });
        await db.execute({
          sql: `UPDATE Customer SET balance = ? WHERE id = ?`,
          args: [newBal, selectedCustomer.id]
        });
      } catch (localDbErr) {
        console.warn('Local ledger write notice:', localDbErr);
      }

      // Queue into durable offline settlement ledger (SQLite / LocalStorage)
      try {
        await saveOfflineKhataSettlement({
          id: settleId,
          customerId: selectedCustomer.id,
          amount: amountNum,
          paymentMethod: method,
          receiptNo: tempReceiptNo,
          reference: tempReceiptNo,
          timestamp: new Date().toISOString()
        });
      } catch (queueErr) {
        console.warn('Offline settlement queue write notice:', queueErr);
      }

      try {
        const res = await fetch(`${apiBase}/api/customers/${selectedCustomer.id}/settle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: amountNum, paymentMethod: method }),
          signal: AbortSignal.timeout(3000)
        });
        if (res.ok) {
          const data = await res.json();
          // Mark settlement synced in offline queue
          await markOfflineKhataSettlementSynced(settleId);
          if (data?.receiptNo) {
            broadcastKhataPayment(updated, amountNum, true, method, data.receiptNo);
          }
        }
      } catch (syncErr) {
        console.warn('Khata settlement server sync notice (queued offline):', syncErr);
      }

      if (viewMode === 'STATEMENT') {
        loadStatement(selectedCustomer.id);
      }
    })();
  };

  const handleRePrintReceipt = async (entry: any) => {
    if (!selectedCustomer) return;
    const paidAmount = Math.abs(entry.amount);
    const newBal = entry.runningBalance;
    const prevBal = newBal + paidAmount;
    await printKhataPaymentReceipt({
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      customerPhone: selectedCustomer.phone,
      customerCpr: selectedCustomer.cpr,
      previousBalance: prevBal,
      amountPaid: paidAmount,
      newBalance: newBal,
      paymentMethod: 'CASH',
      receiptNo: `KH-REP-${entry.id ? entry.id.slice(0, 6) : Date.now().toString().slice(-6)}`,
      cashierName: 'Cashier 01',
      timestamp: entry.rawTimestamp || `${entry.formattedDate} ${entry.formattedTime}`
    });
  };

  const filtered = customers.filter(c => {
    if (messOnlyFilter && !c.mess_id && !c.messName && !c.mess_name) return false;
    const s = (search || '').toLowerCase().trim();
    if (!s) return true;
    return (
      (c.name && c.name.toLowerCase().includes(s)) ||
      (c.phone && c.phone.includes(s)) ||
      (c.cpr && c.cpr.toLowerCase().includes(s)) ||
      (c.batchNo && c.batchNo.toLowerCase().includes(s)) ||
      (c.cardUid && c.cardUid.toLowerCase().includes(s)) ||
      (c.messName && c.messName.toLowerCase().includes(s)) ||
      (c.mess_name && c.mess_name.toLowerCase().includes(s))
    );
  });

  // If a customer is found (either manually or via NFC), show the Payment / Statement Flip Screen
  if (selectedCustomer) {
    return (
      <>
        <div className="space-y-4 animate-in slide-in-from-right-4 flex flex-col h-full">
          {/* Header & Sub-Navigation */}
          <div className="flex justify-between items-center mb-1">
            <button
              onClick={() => {
                setSelectedCustomer(null);
                setPayAmount('');
                setViewMode('PAY');
              }}
              className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-bold active:scale-95 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl transition-all cursor-pointer text-sm"
            >
              <ArrowLeft size={18} /> Back to Search
            </button>

            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setViewMode('PAY')}
                className={`px-5 py-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${viewMode === 'PAY'
                  ? 'bg-white shadow-sm text-slate-900 border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                Take Payment
              </button>
              <button
                onClick={() => loadStatement(selectedCustomer.id)}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${viewMode === 'STATEMENT'
                  ? 'bg-white shadow-sm text-slate-900 border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                <FileClock size={16} /> View Statement
              </button>
              {onSelectCustomerForCart && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectCustomerForCart(selectedCustomer);
                    onClose?.();
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-sm bg-amber-500 hover:bg-amber-600 text-white transition-all cursor-pointer active:scale-95 shadow-xs ml-1"
                  title="Link this customer to active cart for checkout"
                >
                  🛒 Link to Cart
                </button>
              )}
              {selectedCustomer.cardUid && (
                <span className="font-mono text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md font-bold">
                  💳 NFC: {selectedCustomer.cardUid}
                </span>
              )}
              {selectedCustomer.messes && selectedCustomer.messes.length > 0 ? (
                selectedCustomer.messes.map((m: any) => (
                  <span key={m.id} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                    👥 {m.group_name}
                  </span>
                ))
              ) : (selectedCustomer.messName || selectedCustomer.mess_name) ? (
                <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                  👥 {selectedCustomer.messName || selectedCustomer.mess_name}
                </span>
              ) : null}
            </div>
          </div>

          {/* Customer Identity Card */}
          <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-4 flex justify-between items-center shrink-0 shadow-sm">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-2xl font-black text-slate-800">{selectedCustomer.name}</h4>
                {(selectedCustomer.is_active === 0 || selectedCustomer.isActive === false || selectedCustomer.isFrozen) && (
                  <span className="text-xs bg-red-100 text-red-700 border border-red-300 px-2.5 py-0.5 rounded-md font-black uppercase tracking-wider flex items-center gap-1 shadow-2xs">
                    🔒 ACCOUNT FROZEN
                  </span>
                )}
                {selectedCustomer.batchNo && (
                  <span className="text-xs bg-slate-200 text-slate-700 px-2.5 py-0.5 rounded-md uppercase tracking-wider font-extrabold">
                    {selectedCustomer.batchNo}
                  </span>
                )}
                {/* Edit/Archive button for active customer */}
                <button
                  type="button"
                  onClick={() => setEditingCustomer(selectedCustomer)}
                  title="Edit / Archive Customer Details"
                  className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg active:scale-95 transition-all cursor-pointer flex items-center gap-1 text-xs font-bold"
                >
                  <Settings size={16} /> Edit
                </button>
              </div>
              <div className="text-slate-500 font-medium flex flex-wrap items-center gap-2 mt-1 text-sm">
                <span>{selectedCustomer.phone || 'No Phone on Record'}</span>
                {selectedCustomer.cpr && (
                  <span className="text-slate-400 font-mono text-xs">
                    · CPR: {selectedCustomer.cpr}
                  </span>
                )}
                {selectedCustomer.cardUid && (
                  <span className="font-mono text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md font-bold">
                    💳 NFC: {selectedCustomer.cardUid}
                  </span>
                )}
                {(selectedCustomer.messName || selectedCustomer.mess_name) && (
                  <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                    👥 {selectedCustomer.messName || selectedCustomer.mess_name}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Owed</p>
              <p className="text-3xl font-black text-red-500">BD {getBal(selectedCustomer).toFixed(3)}</p>
            </div>
          </div>

          {/* Mess Group Affiliation Banner with 1-Click Split Statement Button */}
          {(selectedCustomer.messName || selectedCustomer.mess_name || selectedCustomer.mess_id || activeMessGroup) && (
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
                  <Users size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-indigo-950">
                      Mess Account: {activeMessGroup?.group_name || selectedCustomer.messName || selectedCustomer.mess_name || 'Camp Mess'}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-200/60 text-indigo-800">
                      {activeMessGroup?.memberCount || 'Shared'} Members
                    </span>
                  </div>
                  <p className="text-[11px] text-indigo-700 font-medium mt-0.5">
                    {activeMessGroup ? `Total Camp Debt: BD ${activeMessGroup.totalBalance.toFixed(3)} • Equal Share: BD ${(activeMessGroup.equalSplitShare ?? (activeMessGroup.totalBalance / Math.max(1, activeMessGroup.memberCount))).toFixed(3)}/member` : 'Labor camp shared grocery group'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  loadStatement(selectedCustomer.mess_id || selectedCustomer.id, true);
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-lg transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Users size={14} />
                <span>View Mess Split Statement (كشف الميس)</span>
              </button>
            </div>
          )}

          {/* DYNAMIC AREA: Payment vs Statement */}
          {viewMode === 'PAY' ? (
            <div className="flex-1 space-y-6 pt-2">
              {/* Quick Balance Buttons */}
              {getBal(selectedCustomer) > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-bold uppercase">Quick Fill:</span>
                  <button
                    onClick={() => setPayAmount(getBal(selectedCustomer).toFixed(3))}
                    className="px-3 py-1.5 text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg cursor-pointer active:scale-95 transition-all"
                  >
                    Full Balance (BD {getBal(selectedCustomer).toFixed(3)})
                  </button>
                  {getBal(selectedCustomer) > 0.200 && (
                    <button
                      onClick={() => setPayAmount((getBal(selectedCustomer) / 2).toFixed(3))}
                      className="px-3 py-1.5 text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg cursor-pointer active:scale-95 transition-all"
                    >
                      50% Partial (BD {(getBal(selectedCustomer) / 2).toFixed(3)})
                    </button>
                  )}
                  {getBal(selectedCustomer) >= 5 && (
                    <button
                      onClick={() => setPayAmount('5.000')}
                      className="px-3 py-1.5 text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg cursor-pointer active:scale-95 transition-all"
                    >
                      BD 5.000
                    </button>
                  )}
                  {getBal(selectedCustomer) >= 10 && (
                    <button
                      onClick={() => setPayAmount('10.000')}
                      className="px-3 py-1.5 text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg cursor-pointer active:scale-95 transition-all"
                    >
                      BD 10.000
                    </button>
                  )}
                </div>
              )}

              {/* Payment Entry Inputs */}
              <div className="grid grid-cols-2 gap-6 pt-2">
                <div>
                  <label className="block text-slate-600 font-bold mb-2">Amount Paying Now (BD)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full text-3xl font-black p-4 bg-white border-2 border-slate-300 rounded-xl focus:border-emerald-500 outline-none transition-all placeholder:text-slate-300"
                    placeholder="0.000"
                  />
                </div>
                <div className="flex gap-3 items-end">
                  <button
                    onClick={() => handleSettle('CASH')}
                    disabled={isSubmitting || !payAmount || parseFloat(payAmount) <= 0}
                    className="flex-1 h-18 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xl rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100 cursor-pointer shadow-sm"
                  >
                    <Banknote size={24} /> Cash
                  </button>
                  <button
                    onClick={() => handleSettle('BENEFIT_PAY')}
                    disabled={isSubmitting || !payAmount || parseFloat(payAmount) <= 0}
                    className="flex-1 h-18 bg-red-600 hover:bg-red-700 text-white font-bold text-xl rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100 cursor-pointer shadow-sm"
                  >
                    <Smartphone size={24} /> Benefit
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col bg-white border-2 border-slate-200 rounded-xl overflow-hidden shadow-inner min-h-[300px]">
              {/* Mess vs Personal Statement Tab Switcher */}
              {activeMessGroup && (
                <div className="bg-slate-100 p-2 border-b border-slate-200 flex items-center justify-between gap-2">
                  <div className="flex bg-slate-200 p-1 rounded-xl flex-1 max-w-md">
                    <button
                      type="button"
                      onClick={() => {
                        setStatementTab('PERSONAL');
                        setSelectedMessMemberFilter(null);
                      }}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-black transition-all cursor-pointer ${statementTab === 'PERSONAL'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                      👤 Personal Statement ({selectedCustomer.name})
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatementTab('MESS')}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${statementTab === 'MESS'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                      <Users size={14} />
                      <span>👥 Mess Statement ({activeMessGroup.group_name})</span>
                    </button>
                  </div>

                  {statementTab === 'MESS' && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleShareMessWhatsApp}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs active:scale-95 transition-all"
                        title="Share Room Split Breakdown on WhatsApp"
                      >
                        <MessageCircle size={13} />
                        <span className="hidden sm:inline">WhatsApp</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Mess Group Transparency Overview & Room Member Split Cards */}
              {statementTab === 'MESS' && activeMessGroup && (
                <div className="p-4 bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 text-white border-b border-indigo-800 space-y-4">
                  {/* Top Header & Fast Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300">
                          Mess Labor Camp Transparency
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                          {activeMessGroup.members.length} Room Members
                        </span>
                      </div>
                      <h3 className="text-lg font-black text-white mt-0.5 flex items-center gap-2">
                        <Users size={20} className="text-indigo-400" />
                        <span>{activeMessGroup.group_name}</span>
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* One-Click Split Balance Equally Across All Cards */}
                      <button
                        type="button"
                        onClick={handleRebalanceMessCards}
                        disabled={isRebalancingMess}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer border border-indigo-400/40 disabled:opacity-50"
                        title="Distribute total camp debt equally across all member cards in the database"
                      >
                        <Scale size={14} className="text-amber-300" />
                        <span>{isRebalancingMess ? 'Splitting...' : '⚡ Split Balance to Cards'}</span>
                      </button>

                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(
                          `📋 *ASKAR SUPERMARKET - MESS EXPENSE SPLIT*\n` +
                          `🏢 *Mess Group:* ${activeMessGroup.group_name}\n` +
                          `💰 *Total Camp Balance:* BD ${activeMessGroup.totalBalance.toFixed(3)}\n` +
                          `👥 *Members:* ${activeMessGroup.members.length}\n` +
                          `⚖️ *EQUAL SPLIT SHARE:* BD ${(activeMessGroup.equalSplitShare || (activeMessGroup.totalBalance / Math.max(1, activeMessGroup.members.length))).toFixed(3)} / member\n` +
                          `----------------------------------------\n` +
                          `*Room Members Equal Split Balances:*\n` +
                          activeMessGroup.members.map((m) => {
                            const mEq = (m.equalSplitShare || activeMessGroup.equalSplitShare || (activeMessGroup.totalBalance / Math.max(1, activeMessGroup.members.length))).toFixed(3);
                            return `• *${m.name}*:\n  ⚖️ Equal Split Due: *BD ${mEq}*\n  🛒 Card Purchases: BD ${Number(m.currentBalance || 0).toFixed(3)} (${m.spendPercentage || 0}%)`;
                          }).join('\n') +
                          `\n----------------------------------------\n` +
                          `Please settle your equal share at Askar Supermarket counter or via BenefitPay Fawri+. Thank you!`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                        title="Share full mess debt breakdown to WhatsApp group"
                      >
                        <MessageCircle size={14} className="fill-white/20" />
                        <span>WhatsApp Group Split</span>
                      </a>
                    </div>
                  </div>

                  {/* 3 Prominent KPI Stat Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                    <div className="bg-slate-900/80 border border-indigo-800/80 rounded-xl p-3 flex flex-col justify-between shadow-xs">
                      <div className="flex items-center justify-between text-indigo-300 text-[10px] font-bold uppercase tracking-wider">
                        <span>Total Camp Debt</span>
                        <CreditCard size={14} className="text-emerald-400" />
                      </div>
                      <div className="mt-1">
                        <span className="text-xl font-black font-mono text-emerald-400">
                          BD {activeMessGroup.totalBalance.toFixed(3)}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5 font-medium">Collective room debt</span>
                      </div>
                    </div>

                    <div className="bg-slate-900/80 border border-emerald-500/50 rounded-xl p-3 flex flex-col justify-between shadow-xs ring-1 ring-emerald-500/20">
                      <div className="flex items-center justify-between text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
                        <span>Equal Share / Card</span>
                        <Scale size={14} className="text-emerald-400" />
                      </div>
                      <div className="mt-1">
                        <span className="text-xl font-black font-mono text-emerald-300">
                          BD {(activeMessGroup.equalSplitShare || (activeMessGroup.totalBalance / Math.max(1, activeMessGroup.members.length))).toFixed(3)}
                        </span>
                        <span className="text-[10px] text-emerald-400/80 block mt-0.5 font-medium">
                          BD {activeMessGroup.totalBalance.toFixed(3)} ÷ {activeMessGroup.members.length} members
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-900/80 border border-indigo-800/80 rounded-xl p-3 flex flex-col justify-between shadow-xs">
                      <div className="flex items-center justify-between text-indigo-300 text-[10px] font-bold uppercase tracking-wider">
                        <span>Active Camp Cards</span>
                        <Users size={14} className="text-indigo-400" />
                      </div>
                      <div className="mt-1">
                        <span className="text-xl font-black font-mono text-white">
                          {activeMessGroup.members.length} Cards
                        </span>
                        <span className="text-[10px] text-indigo-300/80 block mt-0.5 font-medium">
                          Registered camp members
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Member Cards Splitting Balance Equally */}
                  <div className="space-y-2 pt-2 border-t border-indigo-800/60">
                    <div className="flex items-center justify-between text-xs font-bold text-indigo-200 px-0.5">
                      <div className="flex items-center gap-1.5">
                        <CreditCard size={14} className="text-emerald-400" />
                        <span>Member Cards • Balance Split Equally ({activeMessGroup.members.length})</span>
                      </div>
                      {selectedMessMemberFilter ? (
                        <button
                          type="button"
                          onClick={() => setSelectedMessMemberFilter(null)}
                          className="text-amber-300 hover:underline text-[11px] font-bold cursor-pointer"
                        >
                          ✕ Showing 1 member • Click to clear filter
                        </button>
                      ) : (
                        <span className="text-[10px] text-indigo-400">Click card to filter transactions below</span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-1 scroll-zone">
                      {activeMessGroup.members.map((m) => {
                        const isSelected = selectedMessMemberFilter === m.id;
                        const isMe = m.id === selectedCustomer.id;
                        const memberEqShare = Number(
                          m.equalSplitShare ||
                          activeMessGroup.equalSplitShare ||
                          (activeMessGroup.totalBalance / Math.max(1, activeMessGroup.members.length))
                        );
                        const cardBalance = Number(m.currentBalance || 0);
                        const diff = Number((cardBalance - memberEqShare).toFixed(3));

                        return (
                          <div
                            key={m.id}
                            onClick={() => setSelectedMessMemberFilter(isSelected ? null : m.id)}
                            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${isSelected
                              ? 'bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 border-emerald-400 shadow-lg ring-2 ring-emerald-400/40'
                              : 'bg-gradient-to-br from-slate-900/95 via-indigo-950/70 to-slate-900/95 border-indigo-700/60 hover:border-emerald-500/60 hover:shadow-md'
                              }`}
                          >
                            {/* Card Header: NFC Icon + Member Name + Split Status Badge */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                                  <CreditCard size={15} className="text-emerald-400" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-white text-xs flex items-center gap-1.5 leading-tight truncate">
                                    <span className="truncate">{m.name}</span>
                                    {isMe && (
                                      <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-300 border border-emerald-500/40">
                                        You
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-slate-400 font-mono block mt-0.5 truncate">
                                    {m.cardUid || m.nfcCardId ? `💳 ${m.cardUid || m.nfcCardId}` : 'Card: Linked'}
                                  </span>
                                </div>
                              </div>

                              <span
                                className={`text-[9px] font-black px-2 py-0.5 rounded-md border shrink-0 ${Math.abs(diff) <= 0.001
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                  : diff > 0
                                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                  }`}
                              >
                                {Math.abs(diff) <= 0.001
                                  ? 'Balanced'
                                  : diff > 0
                                    ? `+BD ${diff.toFixed(3)} Paid`
                                    : `-BD ${Math.abs(diff).toFixed(3)} Due`}
                              </span>
                            </div>

                            {/* Card Middle: EQUAL SPLIT DUE (Hero Box) */}
                            <div className="my-2.5 p-2 bg-indigo-950/80 rounded-xl border border-indigo-800/60 flex items-center justify-between">
                              <div>
                                <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block">
                                  Equal Split Due
                                </span>
                                <span className="text-sm font-black font-mono text-emerald-400">
                                  BD {memberEqShare.toFixed(3)}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                  Card Spent
                                </span>
                                <span className="text-xs font-bold font-mono text-slate-300">
                                  BD {cardBalance.toFixed(3)}
                                </span>
                              </div>
                            </div>

                            {/* Spend share progress bar */}
                            <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden mb-2">
                              <div
                                className="h-full bg-emerald-400 rounded-full transition-all"
                                style={{ width: `${Math.min(100, m.spendPercentage || 0)}%` }}
                              />
                            </div>

                            {/* Card Actions: Settle Equal Share & WhatsApp */}
                            <div className="pt-1.5 border-t border-indigo-800/40 flex items-center justify-between gap-1 flex-wrap">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCustomer({ ...m, currentBalance: memberEqShare });
                                  setViewMode('PAY');
                                  setPayAmount(memberEqShare.toFixed(3));
                                }}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold active:scale-95 transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                                title={`Settle ${m.name}'s equal split share (BD ${memberEqShare.toFixed(3)})`}
                              >
                                <Banknote size={11} />
                                <span>Settle Equal (BD {memberEqShare.toFixed(3)})</span>
                              </button>

                              {Math.abs(cardBalance - memberEqShare) > 0.001 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedCustomer({ ...m, currentBalance: cardBalance });
                                    setViewMode('PAY');
                                    setPayAmount(cardBalance.toFixed(3));
                                  }}
                                  className="px-1.5 py-1 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/50 rounded-lg text-[9px] font-medium active:scale-95 transition-all cursor-pointer"
                                  title={`Settle card purchases: BD ${cardBalance.toFixed(3)}`}
                                >
                                  <span>Card (BD {cardBalance.toFixed(3)})</span>
                                </button>
                              )}

                              {m.phone && (
                                <a
                                  href={`https://wa.me/${m.phone.replace(/[^0-9]/g, '').length === 8 ? `973${m.phone.replace(/[^0-9]/g, '')}` : m.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                                    `Hello ${m.name}, your equal split share of ${activeMessGroup.group_name} at Askar Supermarket is BHD ${memberEqShare.toFixed(3)} (Card purchases: BHD ${cardBalance.toFixed(3)}). Total camp debt is BHD ${activeMessGroup.totalBalance.toFixed(3)}. Please arrange settlement soon.`
                                  )}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1 bg-indigo-800 hover:bg-indigo-700 text-white rounded-lg active:scale-95 transition-all cursor-pointer"
                                  title="WhatsApp reminder"
                                >
                                  <MessageCircle size={12} />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Statement Header & Date-to-Date Filter Bar */}
              <div className="p-3 border-b bg-slate-50 space-y-2">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                      <FileText size={18} className="text-slate-600" />
                      <span>{statementTab === 'MESS' ? 'Mess Itemized Ledger' : 'Transaction Ledger'}</span>
                    </h3>
                    <span className="text-xs font-bold px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full font-mono">
                      {filteredStatement.length} of {statement.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Type Filter Buttons */}
                    <div className="inline-flex rounded-lg bg-slate-200 p-0.5 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setStatementTypeFilter('ALL')}
                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${statementTypeFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatementTypeFilter('CHARGES')}
                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${statementTypeFilter === 'CHARGES' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                      >
                        Purchases (+)
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatementTypeFilter('PAYMENTS')}
                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${statementTypeFilter === 'PAYMENTS' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                      >
                        Payments (-)
                      </button>
                    </div>

                    <button
                      onClick={printStatement}
                      className="flex items-center gap-1.5 text-xs bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg font-bold active:scale-95 cursor-pointer shadow-sm transition-all"
                      title={statementTab === 'MESS' ? "Print 58mm Mess Statement Slip" : "Print 58mm Statement Slip on Sunmi"}
                    >
                      <Printer size={14} />
                      <span>{statementTab === 'MESS' ? 'Print Mess Slip' : 'Print (58mm)'}</span>
                    </button>
                  </div>
                </div>

                {/* Date to Date Filter Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-300 shadow-2xs">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">FROM</span>
                      <input
                        type="date"
                        value={statementStartDate}
                        onChange={(e) => setStatementStartDate(e.target.value)}
                        className="text-xs font-bold text-slate-800 outline-none bg-transparent cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-300 shadow-2xs">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">TO</span>
                      <input
                        type="date"
                        value={statementEndDate}
                        onChange={(e) => setStatementEndDate(e.target.value)}
                        className="text-xs font-bold text-slate-800 outline-none bg-transparent cursor-pointer"
                      />
                    </div>

                    {/* Quick Presets */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setQuickRange('TODAY')}
                        className={`px-2 py-1 rounded-md font-bold text-[11px] transition-all cursor-pointer ${statementStartDate && statementStartDate === statementEndDate && statementStartDate === new Date().toISOString().slice(0, 10)
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickRange('THIS_MONTH')}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-bold text-[11px] transition-all cursor-pointer"
                      >
                        This Month
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickRange('LAST_MONTH')}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-bold text-[11px] transition-all cursor-pointer"
                      >
                        Last Month
                      </button>
                      {(statementStartDate || statementEndDate || statementTypeFilter !== 'ALL' || selectedMessMemberFilter) && (
                        <button
                          type="button"
                          onClick={() => { setStatementStartDate(''); setStatementEndDate(''); setStatementTypeFilter('ALL'); setSelectedMessMemberFilter(null); }}
                          className="px-2 py-1 text-red-600 hover:bg-red-50 rounded-md font-bold text-[11px] transition-all cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Filtered Range Totals */}
                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    <span className="text-rose-600 font-bold">
                      Charges: +BD {filteredDebitTotal.toFixed(3)}
                    </span>
                    <span className="text-emerald-600 font-bold">
                      Payments: -BD {filteredCreditTotal.toFixed(3)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Scrollable Statement Table with Sticky Header */}
              <div className="flex-1 overflow-y-auto scroll-zone max-h-[340px]">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-100 sticky top-0 border-b z-10">
                    <tr>
                      <th className="p-3 font-bold text-slate-600 text-xs uppercase tracking-wider">Date & Time</th>
                      <th className="p-3 font-bold text-slate-600 text-xs uppercase tracking-wider">
                        {statementTab === 'MESS' ? 'Shopper & Description' : 'Description'}
                      </th>
                      <th className="p-3 font-bold text-slate-600 text-xs uppercase tracking-wider text-right">Debit (Charge)</th>
                      <th className="p-3 font-bold text-slate-600 text-xs uppercase tracking-wider text-right">Credit (Paid)</th>
                      <th className="p-3 font-bold text-slate-800 text-xs uppercase tracking-wider text-right bg-slate-200">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStatement.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-sm text-slate-600">
                          <div className="font-bold text-slate-800">{entry.formattedDate}</div>
                          <div className="text-xs text-slate-400 font-mono">{entry.formattedTime}</div>
                        </td>
                        <td className="p-3 text-sm font-bold text-slate-800">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div>
                              <div>{entry.reference || (entry.type === 'PAYMENT' ? 'Cash Payment' : (entry.type === 'WRITE_OFF' ? 'Bad Debt Write-Off' : 'Grocery Purchase'))}</div>
                              {entry.shopperName && entry.shopperName !== 'Member' && (
                                <div className="text-[11px] text-indigo-700 font-medium mt-0.5 flex items-center gap-1">
                                  <Users size={11} />
                                  <span>Shopper: <strong>{entry.shopperName}</strong></span>
                                </div>
                              )}
                              {entry.memberName && statementTab === 'MESS' && (
                                <div className="text-[10px] text-slate-500 font-normal">
                                  Charged to: {entry.memberName}
                                </div>
                              )}
                            </div>
                            {(entry.type === 'PAYMENT' || entry.raw_amount < 0) && (
                              <button
                                onClick={() => handleRePrintReceipt(entry)}
                                title="Re-print Khata Payment Slip on 58mm Printer"
                                className="px-2 py-1 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded font-bold flex items-center gap-1 active:scale-95 cursor-pointer shadow-2xs transition-all"
                              >
                                <Printer size={12} /> Slip
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="p-3 font-mono font-bold text-red-500 text-right text-sm">
                          {entry.type === 'CHARGE' || entry.raw_amount > 0 ? `BD ${Number(entry.amount).toFixed(3)}` : '-'}
                        </td>
                        <td className="p-3 font-mono font-bold text-emerald-600 text-right text-sm">
                          {entry.type === 'PAYMENT' || entry.type === 'WRITE_OFF' || entry.raw_amount < 0 ? `BD ${Number(entry.amount).toFixed(3)}` : '-'}
                        </td>
                        <td className="p-3 font-mono font-black text-slate-900 text-right bg-slate-50 text-sm">
                          BD {Number(entry.running_balance ?? entry.runningBalance ?? 0).toFixed(3)}
                        </td>
                      </tr>
                    ))}
                    {filteredStatement.length === 0 && !isLoadingStatement && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400 font-bold">
                          {statement.length === 0 ? 'No transaction history found for this customer.' : 'No transactions match the selected date filter.'}
                        </td>
                      </tr>
                    )}
                    {isLoadingStatement && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400 font-bold">
                          Loading statement ledger...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Print Receipt Strip for @media print */}
              <div className="print-receipt hidden">
                <h2 style={{ textAlign: 'center', fontSize: '14px', fontWeight: 'bold' }}>ASKAR STORE</h2>
                <h3 style={{ textAlign: 'center', fontSize: '12px' }}>KHATA STATEMENT</h3>
                <p style={{ textAlign: 'center', fontSize: '10px' }}>================================</p>
                <p>Customer: {selectedCustomer.name}</p>
                {selectedCustomer.phone && <p>Phone: {selectedCustomer.phone}</p>}
                {selectedCustomer.cpr && <p>CPR: {selectedCustomer.cpr}</p>}
                {(statementStartDate || statementEndDate) && (
                  <p style={{ textAlign: 'center', fontSize: '10px' }}>
                    Filter: {statementStartDate || 'Start'} to {statementEndDate || 'Today'}
                  </p>
                )}
                <p>--------------------------------</p>
                <p style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>DATE / DESC</span>
                  <span>BALANCE</span>
                </p>
                <p>--------------------------------</p>
                {filteredStatement.slice().reverse().map(e => (
                  <div key={e.id} style={{ marginBottom: '4px' }}>
                    <p>{e.formattedDate} {e.formattedTime}</p>
                    <p style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{e.type === 'SALE' ? '+GROCERY' : '-PAYMENT'} ({Number(e.amount || 0) > 0 ? `+${Number(e.amount || 0).toFixed(3)}` : Number(e.amount || 0).toFixed(3)})</span>
                      <span>BD {Number(e.runningBalance ?? e.running_balance ?? 0).toFixed(3)}</span>
                    </p>
                  </div>
                ))}
                <p>================================</p>
                <p style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}>
                  <span>OUTSTANDING DUE:</span>
                  <span>BD {getBal(selectedCustomer).toFixed(3)}</span>
                </p>
                <p style={{ textAlign: 'center', marginTop: '6px', fontSize: '10px' }}>
                  Printed: {new Date().toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>

        {editingCustomer && (
          <KhataEditModal
            customer={editingCustomer}
            onClose={() => setEditingCustomer(null)}
            onSaved={handleCustomerSaved}
            onDeleted={handleCustomerDeleted}
            apiBase={apiBase}
            showToast={showToast}
          />
        )}
      </>
    );
  }

  // Otherwise, show the Searchable List with the NFC waiting prompt
  return (
    <>
      <div className="space-y-4 animate-in slide-in-from-left-4 h-full flex flex-col">
        {/* Visual NFC Prompt */}
        <div className="bg-slate-900 text-white p-4 rounded-xl flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-20"></span>
              <div className="bg-emerald-500 p-2 rounded-full">
                <Wifi size={20} className="text-white" />
              </div>
            </div>
            <div>
              <h4 className="font-bold text-lg flex items-center gap-2">
                Ready to Scan
                {isNfcLoading && (
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded animate-pulse">
                    Reading card...
                  </span>
                )}
              </h4>
              <p className="text-slate-400 text-sm">Tap customer Khata card on terminal...</p>
            </div>
          </div>
          {/* Hidden button for testing in the browser without hardware */}
          <button
            type="button"
            onClick={() => handleNfcLookup('04:8A:21:5A:F1:48:80')}
            className="text-xs bg-slate-800 text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors cursor-pointer active:scale-95"
          >
            Simulate Scan
          </button>
        </div>

        {/* Search Bar + Mess Filter + Sort Order Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search by name, phone, CPR, batch, mess name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-base py-3 pl-4 pr-4 bg-slate-100 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 font-medium"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setMessOnlyFilter(!messOnlyFilter)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${messOnlyFilter
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              title="Filter customers belonging to shared mess/camp groups"
            >
              <Users size={13} />
              <span>Mess Groups</span>
            </button>
            <ArrowUpDown size={14} className="text-slate-500 ml-1" />
            <select
              value={sortParam}
              onChange={(e: any) => setSortParam(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="highest">Highest Debt First</option>
              <option value="stale">🚨 Stale Debt (&gt;45d)</option>
              <option value="lowest">Lowest Balance</option>
              <option value="alpha">Alphabetical (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Scrollable Customer List */}
        <div className="flex-1 overflow-y-auto scroll-zone space-y-2 max-h-[350px] pr-1">
          {filtered.map((customer) => (
            <div
              key={customer.id}
              className="w-full bg-white border-2 border-slate-100 p-3.5 rounded-xl flex items-center justify-between active:border-emerald-500 transition-all text-left shadow-sm hover:border-slate-300"
            >
              <div className="font-bold text-lg text-slate-800 flex items-center gap-2 flex-wrap">
                <span>{customer.name}</span>
                {(customer.is_active === 0 || customer.isActive === false || customer.isFrozen) && (
                  <span className="text-[10px] bg-red-100 text-red-700 border border-red-300 px-2 py-0.5 rounded-md font-black flex items-center gap-1 shadow-2xs">
                    🔒 FROZEN
                  </span>
                )}
                {customer.batchNo && (
                  <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md uppercase tracking-wider font-extrabold">
                    {customer.batchNo}
                  </span>
                )}
                {customer.messes && customer.messes.length > 0 ? (
                  customer.messes.map((m: any) => (
                    <span key={m.id} className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md font-bold flex items-center gap-1 shadow-2xs">
                      <Users size={11} />
                      <span>{m.group_name}</span>
                    </span>
                  ))
                ) : (customer.messName || customer.mess_name) ? (
                  <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md font-bold flex items-center gap-1 shadow-2xs">
                    <Users size={11} />
                    <span>{customer.messName || customer.mess_name}</span>
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Direct Mess Statement Button */}
                {(customer.messName || customer.mess_name || customer.mess_id) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCustomer(customer);
                      loadStatement(customer.mess_id || customer.id, true);
                    }}
                    className="px-2.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 active:scale-95 transition-transform rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                    title={`View Mess Split Statement for ${customer.messName || customer.mess_name || 'Mess'}`}
                  >
                    <Users size={14} />
                    <span className="hidden sm:inline">Mess Split</span>
                  </button>
                )}

                {/* One-Click WhatsApp Reminder Button */}
                {getBal(customer) > 0 && customer.phone && (
                  <a
                    href={`https://wa.me/${(() => {
                      const d = customer.phone.replace(/[^0-9]/g, '');
                      return d.length === 8 ? `973${d}` : d;
                    })()}?text=${encodeURIComponent(
                      `*ASKAR SUPERMARKET - PAYMENT STATEMENT / كشف حساب أسواق عسكر*\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                      `👤 *Customer / العميل:* ${customer.name}\n` +
                      `💰 *Outstanding Balance / المبلغ المستحق:* *BHD ${getBal(customer).toFixed(3)}*\n\n` +
                      `📄 *View Live Digital Statement / كشف الحساب الإلكتروني:*\n` +
                      `https://askar-khata-pwa.vercel.app/customer?id=${encodeURIComponent(customer.id)}\n\n` +
                      `📲 *Pay Instantly via BenefitPay (Fawri+):*\n` +
                      `• Registered Mobile: *+973 33843855*\n` +
                      `• Beneficiary Name: *layali sbi*\n` +
                      `• IBAN: *BH77SBIN02740045310001*\n\n` +
                      `💡 *سدد فوراً عبر تطبيق بنفت بت (فوري+)*\n` +
                      `• رقم الهاتف: *33843855*\n` +
                      `• الاسم: *layali sbi*\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                      `Thank you for shopping with Askar Supermarket! / شكراً لتسوقكم معنا!`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-300 active:scale-90 transition-transform cursor-pointer shadow-2xs"
                    title="Send WhatsApp Fawri+ Debt Reminder"
                  >
                    <MessageCircle size={18} className="fill-emerald-600/20" />
                  </a>
                )}

                <div
                  onClick={() => setSelectedCustomer(customer)}
                  className="text-right cursor-pointer pr-1 select-none"
                >
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Balance</div>
                  <div className={`font-black text-lg ${getBal(customer) > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                    BD {getBal(customer).toFixed(3)}
                  </div>
                  {customer.isStale && (
                    <div className="text-[9px] font-black bg-rose-100 text-rose-700 px-1 py-0.2 rounded mt-0.5 border border-rose-200">
                      🚨 STALE ({customer.daysSinceLastPayment ?? 46}d)
                    </div>
                  )}
                </div>

                {/* Direct Select / Link to Cart button */}
                {onSelectCustomerForCart && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectCustomerForCart(customer);
                      onClose?.();
                    }}
                    title={`Link ${customer.name} to active cart`}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl transition-all cursor-pointer font-bold text-xs flex items-center gap-1 shadow-sm"
                  >
                    <ShoppingCart size={14} /> Link Cart
                  </button>
                )}

                {/* Dedicated Gear Icon for Edit / Archive (Soft Delete) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingCustomer(customer);
                  }}
                  title="Edit / Delete Account"
                  className="p-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded-xl active:scale-90 transition-transform cursor-pointer border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs"
                >
                  <Settings size={18} />
                </button>

                <div
                  onClick={() => setSelectedCustomer(customer)}
                  className="cursor-pointer pl-1"
                >
                  <ChevronRight className="text-slate-300" />
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-slate-400 py-10 font-bold">
              No customers found{search ? ` for "${search}"` : ''}.
            </div>
          )}
        </div>
      </div>

      {editingCustomer && (
        <KhataEditModal
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onSaved={handleCustomerSaved}
          onDeleted={handleCustomerDeleted}
          apiBase={apiBase}
          showToast={showToast}
        />
      )}
    </>
  );
}

function NewCustomerView({
  apiBase,
  lastScannedCardUid,
  scannedCardUid,
  clearScan,
  onCustomerCreated,
  showToast
}: {
  apiBase: string;
  lastScannedCardUid?: string | null;
  scannedCardUid?: string | null;
  clearScan?: () => Promise<void> | void;
  onCustomerCreated?: () => void;
  showToast?: (message: string, type?: 'success' | 'info' | 'error') => void;
}) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    cpr: '',
    batchNo: '',
    previousBalance: '',
    description: '',
    cardUid: lastScannedCardUid || ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [messGroupsList, setMessGroupsList] = useState<any[]>([]);
  const [selectedMessGroupIds, setSelectedMessGroupIds] = useState<string[]>([]);
  const [cardStatus, setCardStatus] = useState<{
    status: 'idle' | 'checking' | 'valid' | 'conflict';
    message?: string;
  }>({ status: 'idle' });

  useEffect(() => {
    fetch(`${apiBase}/api/nfc/mess-groups`)
      .then(res => res.json())
      .then(data => {
        if (data?.messGroups) setMessGroupsList(data.messGroups);
      })
      .catch(() => {});
  }, [apiBase]);

  // Verification helper to check if card is already taken by another customer
  const checkCard = async (uid: string) => {
    if (!uid || !uid.trim()) {
      setCardStatus({ status: 'idle' });
      return;
    }
    setCardStatus({ status: 'checking', message: 'Verifying card in database...' });
    try {
      const res = await fetch(`${apiBase}/api/customers/nfc/${encodeURIComponent(uid.trim())}`, {
        headers: { 'x-pos-client': 'store-pos' }
      });
      const data = await res.json();
      if (data.success && data.customer) {
        setCardStatus({
          status: 'conflict',
          message: `⚠️ This card is already assigned to "${data.customer.name}" (Balance: BD ${Number(data.customer.currentBalance || 0).toFixed(3)})`
        });
      } else {
        setCardStatus({
          status: 'valid',
          message: '✅ New unlinked card ready to bind!'
        });
      }
    } catch {
      setCardStatus({ status: 'valid', message: 'Card ready to link' });
    }
  };

  // Live Sunmi NFC Tap Handler: Catches global broadcasts in addition to props
  useEffect(() => {
    const handleSunmiNfc = (e: any) => {
      const uid = e?.detail?.tag_id || e?.detail?.nfcId || (typeof e?.detail === 'string' ? e.detail : '');
      if (uid) {
        const clean = uid.trim().toUpperCase();
        setFormData(prev => ({ ...prev, cardUid: clean }));
        showToast?.(`💳 NFC Card Linked: ${clean}`, 'success');
        checkCard(clean);
      }
    };
    window.addEventListener('sunmi-nfc-scan', handleSunmiNfc);
    return () => window.removeEventListener('sunmi-nfc-scan', handleSunmiNfc);
  }, []);

  // Live NFC Tap Handler: When an NFC card touches the SUNMI antenna
  useEffect(() => {
    if (scannedCardUid) {
      const uid = scannedCardUid.trim().toUpperCase();
      setFormData(prev => ({ ...prev, cardUid: uid }));
      showToast?.(`💳 NFC Card Linked: ${uid}`, 'success');
      checkCard(uid);
      clearScan?.();
    }
  }, [scannedCardUid]);

  // Initial card if passed from parent
  useEffect(() => {
    if (lastScannedCardUid && !formData.cardUid) {
      const uid = lastScannedCardUid.trim().toUpperCase();
      setFormData(prev => ({ ...prev, cardUid: uid }));
      checkCard(uid);
    }
  }, [lastScannedCardUid]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast ? showToast('Customer Name is required.', 'error') : alert('Customer Name is required.');
      return;
    }

    if (cardStatus.status === 'conflict') {
      const proceed = confirm(
        `${cardStatus.message}\n\nDo you want to reassign this card, or tap a different card? Press Cancel to choose a different card.`
      );
      if (!proceed) return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pos-client': 'store-pos'
        },
        body: JSON.stringify({
          ...formData,
          mess_ids: selectedMessGroupIds,
          mess_id: selectedMessGroupIds[0] || null
        })
      });

      const data = await res.json();
      if (res.ok && (data.success || data.id)) {
        const msg = `✅ Khata Party "${formData.name.trim()}" added successfully!`;
        showToast ? showToast(msg, 'success') : alert(msg);
        onCustomerCreated?.();
      } else {
        alert(data.error || 'Failed to create customer.');
      }
    } catch (error) {
      console.error(error);
      alert('Failed to create customer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-in slide-in-from-left-4 h-full flex flex-col">
      <div className="flex-1 overflow-y-auto scroll-zone pr-2 space-y-6 max-h-[50vh]">

        {/* SECTION 1: Identity */}
        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
          <h4 className="flex items-center gap-2 text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">
            <IdCard size={18} /> Identity
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-slate-700 font-bold mb-1">Full Name *</label>
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                className="w-full text-lg p-3 bg-white border-2 border-slate-300 rounded-lg outline-none focus:border-blue-500 transition-colors"
                placeholder="e.g. Mohammed Yaseen"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">CPR Number</label>
              <input
                type="text"
                name="cpr"
                value={formData.cpr}
                onChange={handleChange}
                className="w-full text-lg p-3 bg-white border-2 border-slate-300 rounded-lg outline-none focus:border-blue-500 font-mono transition-colors"
                placeholder="XXXXXXXXX"
                maxLength={9}
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">Batch / Group No.</label>
              <input
                type="text"
                name="batchNo"
                value={formData.batchNo}
                onChange={handleChange}
                className="w-full text-lg p-3 bg-white border-2 border-slate-300 rounded-lg outline-none focus:border-blue-500 transition-colors"
                placeholder="e.g. B-452"
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: Contact, Book Balance & Details */}
        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
          <h4 className="flex items-center gap-2 text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">
            <Phone size={18} /> Contact & Book Debt
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Phone Number</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full text-lg p-3 bg-white border-2 border-slate-300 rounded-lg outline-none focus:border-blue-500 transition-colors"
                placeholder="+973 XXXXXXXX"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Previous Book Balance (BD)
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 font-bold text-slate-500 text-sm">BD</span>
                <input
                  type="number"
                  step="0.005"
                  min="0"
                  name="previousBalance"
                  value={formData.previousBalance}
                  onChange={handleChange}
                  className="w-full text-lg p-3 pl-12 bg-white border-2 border-slate-300 rounded-lg outline-none focus:border-blue-500 font-bold text-red-600 font-mono transition-colors"
                  placeholder="0.000"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">
                Initial debt from paper notebook. Will post to Khata ledger immediately.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-slate-700 font-bold mb-1">Description / Notes</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={2}
                className="w-full text-lg p-3 bg-white border-2 border-slate-300 rounded-lg outline-none focus:border-blue-500 resize-none transition-colors"
                placeholder="e.g. Migrated from physical ledger book Page 34..."
              />
            </div>
          </div>
          {formData.previousBalance && parseFloat(formData.previousBalance) > 0 && (
            <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-800 flex items-center gap-2">
              <span>📖</span>
              <span>
                <strong>Opening Balance:</strong> BD {parseFloat(formData.previousBalance).toFixed(3)} will be posted to the Khata statement upon creation.
              </span>
            </div>
          )}
        </div>

        {/* SECTION 3: NFC Linking */}
        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-slate-700 font-bold">NFC Khata Card (Touch to Tap)</label>
            <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>
              Antenna Active
            </span>
          </div>

          {/* Active Card Pill / Conflict Warning / Tap Indicator */}
          {formData.cardUid ? (
            <div className={`p-3.5 rounded-xl border mb-3 flex items-center justify-between ${cardStatus.status === 'conflict'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-emerald-50 border-emerald-300 text-emerald-950'
              }`}>
              <div className="flex items-center gap-2.5">
                <span className="text-xl">💳</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-sm">{formData.cardUid}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${cardStatus.status === 'conflict' ? 'bg-rose-200 text-rose-800' : 'bg-emerald-200 text-emerald-800'
                      }`}>
                      {cardStatus.status === 'conflict' ? 'Already in Use' : 'Card Verified'}
                    </span>
                  </div>
                  {cardStatus.message && (
                    <p className={`text-xs mt-0.5 font-medium ${cardStatus.status === 'conflict' ? 'text-rose-700 font-bold' : 'text-emerald-700'
                      }`}>
                      {cardStatus.message}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFormData(prev => ({ ...prev, cardUid: '' }));
                  setCardStatus({ status: 'idle' });
                }}
                className="text-xs font-bold text-slate-500 hover:text-rose-600 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg active:scale-95 cursor-pointer shadow-xs transition-colors"
              >
                Clear / Retap
              </button>
            </div>
          ) : (
            <div className="p-3.5 mb-3 bg-blue-50 border-2 border-dashed border-blue-300 rounded-xl flex items-center justify-between text-blue-900">
              <div className="flex items-center gap-2.5">
                <span className="text-xl animate-bounce">📶</span>
                <div>
                  <p className="text-xs font-bold text-blue-900">Hold customer NFC card near SUNMI reader</p>
                  <p className="text-[11px] text-blue-600">The UID will be automatically captured and verified instantly</p>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider bg-blue-200/80 text-blue-800 px-2 py-1 rounded">
                0ms Ready
              </span>
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              name="cardUid"
              value={formData.cardUid}
              onChange={(e) => {
                const val = e.target.value.toUpperCase();
                setFormData(prev => ({ ...prev, cardUid: val }));
                checkCard(val);
              }}
              className="flex-1 text-base p-3 bg-white border-2 border-slate-300 rounded-lg outline-none focus:border-blue-500 font-mono"
              placeholder="Or type card UID manually (e.g. 04:8A:21:5A)..."
            />
            {lastScannedCardUid && formData.cardUid !== lastScannedCardUid && (
              <button
                type="button"
                onClick={() => {
                  const uid = lastScannedCardUid.trim().toUpperCase();
                  setFormData(prev => ({ ...prev, cardUid: uid }));
                  checkCard(uid);
                }}
                className="px-4 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-bold rounded-lg active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 text-xs"
              >
                <CheckCircle2 size={16} /> Link Last ({lastScannedCardUid})
              </button>
            )}
          </div>
        </div>

        {/* SECTION 4: Multi-Mess / Camp Accounts */}
        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-slate-700 font-bold">
              Enroll in Mess / Camp Accounts (Multiple Allowed)
            </label>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
              {selectedMessGroupIds.length} enrolled
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            A single member can be enrolled into 2 or more communal mess accounts simultaneously.
          </p>

          {messGroupsList.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No mess groups available yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border border-slate-200 rounded-xl bg-white">
              {messGroupsList.map((g) => {
                const isEnrolled = selectedMessGroupIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setSelectedMessGroupIds((prev) =>
                        isEnrolled ? prev.filter((id) => id !== g.id) : [...prev, g.id]
                      );
                    }}
                    className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                      isEnrolled
                        ? 'bg-purple-50 border-purple-400 text-purple-950 font-bold shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/70 font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 border ${
                          isEnrolled
                            ? 'bg-purple-600 border-purple-600 text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isEnrolled && <Check size={12} strokeWidth={3} />}
                      </div>
                      <div className="truncate">
                        <div className="text-xs truncate">{g.group_name}</div>
                        <div className="text-[10px] text-slate-400 font-normal">
                          {g.memberCount || 0} members
                        </div>
                      </div>
                    </div>
                    <Users size={14} className={isEnrolled ? 'text-purple-600 shrink-0' : 'text-slate-300 shrink-0'} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Sticky Save Button at the bottom */}
      <div className="pt-4 border-t mt-auto">
        <button
          type="submit"
          disabled={!formData.name.trim() || isSubmitting}
          className="w-full h-16 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold text-xl rounded-xl active:scale-95 flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer"
        >
          <Save size={24} /> {isSubmitting ? 'Creating...' : 'Create Khata Party'}
        </button>
      </div>
    </form>
  );
}

// --- KHATA EDIT & ARCHIVE (SOFT-DELETE) MODAL ---

interface KhataEditModalProps {
  customer: Customer;
  onClose: () => void;
  onSaved: (updatedCustomer: Customer) => void;
  onDeleted: (customerId: string) => void;
  apiBase?: string;
  showToast?: (message: string, type?: 'success' | 'info' | 'error') => void;
}

function KhataEditModal({
  customer,
  onClose,
  onSaved,
  onDeleted,
  apiBase = 'http://localhost:3000',
  showToast,
}: KhataEditModalProps) {
  const [name, setName] = useState(customer.name || '');
  const [phone, setPhone] = useState(customer.phone || '');
  const [cpr, setCpr] = useState(customer.cpr || '');
  const [batchNo, setBatchNo] = useState(customer.batchNo || '');
  const [creditLimit, setCreditLimit] = useState(String(customer.creditLimit || 30.0));
  const [selectedMessGroupIds, setSelectedMessGroupIds] = useState<string[]>(() => {
    if (Array.isArray(customer.mess_ids) && customer.mess_ids.length > 0) return customer.mess_ids;
    if (Array.isArray(customer.messes) && customer.messes.length > 0) return customer.messes.map((m: any) => m.id);
    if (customer.mess_id) return [customer.mess_id];
    return [];
  });
  const [messGroupsList, setMessGroupsList] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}/api/nfc/mess-groups`)
      .then(res => res.json())
      .then(data => {
        if (data?.messGroups) setMessGroupsList(data.messGroups);
      })
      .catch(() => {});
  }, [apiBase]);

  // Manager PIN modal state (PIN 9999)
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Please enter a valid customer name.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`${apiBase}/khata/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          cpr: cpr.trim() || null,
          batchNo: batchNo.trim() || null,
          creditLimit: parseFloat(creditLimit) || 30.0,
          mess_ids: selectedMessGroupIds,
          mess_id: selectedMessGroupIds[0] || null,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const updatedCustomer: Customer = {
          ...customer,
          name: name.trim(),
          phone: phone.trim() || null,
          cpr: cpr.trim() || null,
          batchNo: batchNo.trim() || null,
          creditLimit: parseFloat(creditLimit) || 30.0,
          mess_ids: selectedMessGroupIds,
          mess_id: selectedMessGroupIds[0] || null,
          messes: messGroupsList.filter(g => selectedMessGroupIds.includes(g.id)).map(g => ({ id: g.id, group_name: g.group_name })),
          hasMessGroup: selectedMessGroupIds.length > 0,
          isMultiMess: selectedMessGroupIds.length > 1,
        };
        const msg = `Customer "${name.trim()}" updated successfully.`;
        showToast ? showToast(msg, 'success') : alert(msg);
        onSaved(updatedCustomer);
        onClose();
      } else {
        alert(data.error || 'Failed to update customer details.');
      }
    } catch (e) {
      console.error(e);
      alert('Network error while saving customer details.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClick = () => {
    // 1. First-line validation: customer cannot be deleted if they still owe money
    const bal = Number(customer.currentBalance ?? customer.balance ?? 0);
    if (bal > 0.001) {
      const err = `Cannot delete customer with an outstanding balance (BD ${bal.toFixed(3)}). Settle all dues to BD 0.000 first.`;
      showToast ? showToast(err, 'error') : alert(err);
      return;
    }

    // 2. Open Manager PIN Verification Dialog
    setPinInput('');
    setPinError('');
    setShowPinModal(true);
  };

  const handleVerifyPinAndDelete = async (pinToVerify: string) => {
    // Protected by Manager PIN (master default 9999 or configured manager PIN)
    const managerPin = getManagerPin();
    if (pinToVerify !== '9999' && pinToVerify !== managerPin && !verifyManagerPin(pinToVerify)) {
      setPinError('Unauthorized - Incorrect Manager PIN');
      return;
    }

    setIsDeleting(true);
    try {
      const targetBase = (apiBase && !apiBase.includes('askar-khata-pwa.vercel.app')) ? apiBase : getApiBaseUrl();
      const candidates = [
        targetBase,
        'http://192.168.8.7:3000',
        'http://localhost:3000',
        DEFAULT_EDGE_API_URL
      ].filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i);

      let success = false;
      let lastErrMsg = '';

      for (const url of candidates) {
        try {
          const res = await fetch(`${url}/api/customers/${customer.id}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              'x-manager-pin': pinToVerify,
              'x-pos-client': 'store-pos'
            },
            signal: AbortSignal.timeout(5000)
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.success) {
            success = true;
            break;
          } else if (data.error) {
            lastErrMsg = data.error;
            if (res.status === 400 || res.status === 401 || res.status === 403) break;
          }
        } catch { }

        try {
          const res2 = await fetch(`${url}/khata/${customer.id}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              'x-manager-pin': pinToVerify,
              'x-pos-client': 'store-pos'
            },
            signal: AbortSignal.timeout(5000)
          });
          const data2 = await res2.json().catch(() => ({}));
          if (res2.ok && data2.success) {
            success = true;
            break;
          } else if (data2.error) {
            lastErrMsg = data2.error;
            if (res2.status === 400 || res2.status === 401 || res2.status === 403) break;
          }
        } catch { }
      }

      if (success) {
        const msg = `Customer "${customer.name}" deleted successfully.`;
        showToast ? showToast(msg, 'success') : alert(msg);
        onDeleted(customer.id);
        setShowPinModal(false);
        onClose();
      } else {
        const errMsg = lastErrMsg || 'Cannot delete customer. Ensure balance is BD 0.000 and Manager PIN is correct.';
        showToast ? showToast(errMsg, 'error') : alert(errMsg);
        setPinError(errMsg);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Network error while deleting customer account: ${e?.message || e}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-slate-100 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-300 flex flex-col">
        {/* Header */}
        <div className="bg-white px-6 py-5 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black text-slate-800">Edit Khata Payer</h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">Account ID: {customer.id.slice(0, 14)}...</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-full active:scale-95 transition-transform cursor-pointer"
          >
            <X size={22} className="text-slate-600" />
          </button>
        </div>

        {/* Inputs with large touch targets */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-slate-700 font-bold text-sm mb-1">Customer Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ali Ahmed"
              className="w-full text-xl p-4 bg-white border-2 border-slate-300 rounded-xl outline-none focus:border-emerald-500 font-bold transition-all"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-bold text-sm mb-1">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 39991234"
              className="w-full text-xl p-4 bg-white border-2 border-slate-300 rounded-xl outline-none focus:border-emerald-500 transition-all font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-bold text-sm mb-1">CPR / ID</label>
              <input
                type="text"
                value={cpr}
                onChange={(e) => setCpr(e.target.value)}
                placeholder="Bahrain CPR"
                className="w-full text-base p-3.5 bg-white border-2 border-slate-300 rounded-xl outline-none focus:border-emerald-500 transition-all font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold text-sm mb-1">Batch / Area</label>
              <input
                type="text"
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                placeholder="Zone / Batch"
                className="w-full text-base p-3.5 bg-white border-2 border-slate-300 rounded-xl outline-none focus:border-emerald-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-bold text-sm mb-1">
              Hard Credit Limit (BHD)
            </label>
            <input
              type="number"
              step="1.0"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              placeholder="e.g. 30.000"
              className="w-full text-lg p-3 bg-white border-2 border-slate-300 rounded-xl outline-none focus:border-emerald-500 font-mono transition-all font-bold"
            />
            <p className="text-xs text-slate-400 mt-1">POS freezes credit sales when unpaid debt exceeds this limit without Manager PIN.</p>
          </div>

          {/* Balance Alert Box */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center shadow-2xs">
            <div>
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Current Account Balance</span>
              <p className="text-xs text-slate-400 mt-0.5">
                {Number(customer.currentBalance ?? customer.balance ?? 0) > 0
                  ? 'Must be zero balance to archive'
                  : 'Zero balance: eligible for archiving'}
              </p>
            </div>
            <div className={`text-2xl font-black ${Number(customer.currentBalance ?? customer.balance ?? 0) > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
              BD {Number(customer.currentBalance ?? customer.balance ?? 0).toFixed(3)}
            </div>
          </div>

          {/* Communal Mess Accounts Membership */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-slate-700 font-bold text-sm">
                Communal Mess / Camp Accounts
              </label>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                {selectedMessGroupIds.length} enrolled
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Check all communal mess groups this customer belongs to. Multiple memberships are supported.
            </p>

            {messGroupsList.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No mess groups available.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1 border border-slate-200 rounded-xl bg-white">
                {messGroupsList.map((g) => {
                  const isEnrolled = selectedMessGroupIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        setSelectedMessGroupIds((prev) =>
                          isEnrolled ? prev.filter((id) => id !== g.id) : [...prev, g.id]
                        );
                      }}
                      className={`p-2 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                        isEnrolled
                          ? 'bg-purple-50 border-purple-400 text-purple-950 font-bold shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/70 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 border ${
                            isEnrolled
                              ? 'bg-purple-600 border-purple-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isEnrolled && <Check size={12} strokeWidth={3} />}
                        </div>
                        <div className="truncate">
                          <div className="text-xs truncate">{g.group_name}</div>
                          <div className="text-[10px] text-slate-400 font-normal">
                            {g.memberCount || 0} members
                          </div>
                        </div>
                      </div>
                      <Users size={13} className={isEnrolled ? 'text-purple-600 shrink-0' : 'text-slate-300 shrink-0'} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action Buttons: Emerald for saving, Red for deleting with Massive Touch Targets */}
          <div className="flex justify-between items-center gap-4 pt-3">
            <button
              type="button"
              onClick={handleDeleteClick}
              disabled={isDeleting}
              className="flex-1 min-h-[64px] bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-black text-xl rounded-2xl active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Trash2 size={24} />
              {isDeleting ? 'Archiving...' : 'Delete'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !name.trim()}
              className="flex-1 min-h-[64px] bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-black text-xl rounded-2xl active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Save size={24} />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Manager PIN Modal (9999) */}
        {showPinModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl p-6 shadow-2xl w-full max-w-sm text-center border-2 border-red-300">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
                <ShieldAlert size={32} />
              </div>
              <h4 className="text-2xl font-black text-slate-800">Manager Authorization</h4>
              <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
                Enter Manager PIN to authorize soft-deletion of account <strong>{customer.name}</strong>.
              </p>

              {/* Masked PIN Display */}
              <div className="bg-slate-100 border-2 border-slate-300 rounded-2xl py-3 px-4 mb-3">
                <div className="text-3xl font-mono tracking-widest text-slate-900 font-black min-h-[36px] flex items-center justify-center">
                  {pinInput ? '•'.repeat(pinInput.length) : <span className="text-slate-400 text-lg tracking-normal">Enter 4-Digit PIN</span>}
                </div>
              </div>

              {pinError && (
                <div className="text-red-600 text-sm font-bold mb-3 bg-red-50 py-1.5 px-3 rounded-lg border border-red-200">
                  {pinError}
                </div>
              )}

              {/* SUNMI Touch Numpad (Massive Touch Targets) */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setPinError('');
                      if (k === 'C') {
                        setPinInput('');
                      } else if (k === '⌫') {
                        setPinInput((prev) => prev.slice(0, -1));
                      } else {
                        if (pinInput.length < 4) {
                          const next = pinInput + k;
                          setPinInput(next);
                          if (next.length === 4) {
                            handleVerifyPinAndDelete(next);
                          }
                        }
                      }
                    }}
                    className="h-14 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-black text-xl rounded-xl active:scale-90 transition-transform cursor-pointer border border-slate-200 shadow-2xs"
                  >
                    {k}
                  </button>
                ))}
              </div>

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  className="flex-1 py-3.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl active:scale-95 transition-all cursor-pointer text-base"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleVerifyPinAndDelete(pinInput)}
                  className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl active:scale-95 transition-all cursor-pointer text-base shadow-sm"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


