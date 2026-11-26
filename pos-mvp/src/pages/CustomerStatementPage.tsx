import { useState, useEffect } from 'react';
import {
  Store,
  ShieldCheck,
  CreditCard,
  ShoppingBag,
  ArrowDownLeft,
  Users,
  CheckCircle2,
  RefreshCw,
  Printer,
  MessageSquare,
  AlertCircle,
  X,
  Sparkles,
  Lock,
  KeyRound,
  Zap,
  Scale,
  ChevronDown,
  Receipt,
  Bell,
  BellOff,
  BookOpen
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { printKhataStatement } from '../utils/printer';
import { playThankYouVoice } from '../utils/sound';
import { generateBenefitPayPayload, getStoredBenefitPayConfig } from '../utils/benefitPay';
import { getApiBaseUrl } from '../utils/apiConfig';
import { getManagerPin } from '../utils/authUtils';
import { AddCustomerBookBalanceModal } from '../components/AddCustomerBookBalanceModal';
import {
  initPushNotifications,
  requestNotificationPermission,
  getNotificationPermissionStatus,
  showTransactionNotification,
  triggerTestTransactionNotification,
  subscribeCustomerToWebPush
} from '../utils/pushNotification';

interface LedgerEntry {
  id: string;
  customerId?: string;
  invoiceNo?: string;
  reference?: string;
  type: string;
  amount: number;
  total?: number;
  raw_amount?: number;
  running_balance?: number;
  runningBalance?: number;
  paymentType?: string;
  timestamp?: string;
  created_at?: string;
  formattedDate?: string;
  formattedTime?: string;
  memberName?: string;
  mess_id?: string | null;
  messName?: string | null;
  walletName?: string | null;
  group_total?: number | null;
  member_count?: number | null;
}

interface MessMember {
  id: string;
  name: string;
  phone?: string | null;
  cpr?: string | null;
  cardUid?: string | null;
  batchNo?: string | null;
  currentBalance: number;
  spendPercentage?: number;
  equalSplitShare?: number;
}

interface MessGroupData {
  id: string;
  group_name: string;
  memberCount: number;
  totalBalance: number;
  equalSplitShare?: number;
  members: MessMember[];
  messLedger?: LedgerEntry[];
}

interface DepositData {
  amount: number;
  status: string;
  isDeferred: boolean;
  isPaid: boolean;
  isNone: boolean;
}

interface WalletBreakdown {
  personal: number;
  deposit?: {
    amount: number;
    status: string;
    isDeferred: boolean;
  };
  messes: {
    id: string;
    name: string;
    memberShare: number;
    groupTotal: number;
    memberCount: number;
    equalSplitShare: number;
  }[];
}

interface CustomerData {
  id: string;
  name: string;
  phone?: string | null;
  cpr?: string | null;
  batchNo?: string | null;
  currentBalance: number;
  creditLimit?: number;
  mess_id?: string | null;
  messName?: string | null;
  mess_name?: string | null;
  isMessGroup?: boolean;
  description?: string | null;
  card_deposit_amount?: number | null;
  card_deposit_status?: string | null;
}

interface CustomerStatementPageProps {
  customerId?: string | null;
  apiBase?: string;
}

export default function CustomerStatementPage({
  customerId: initialCustomerId,
  apiBase = getApiBaseUrl()
}: CustomerStatementPageProps) {
  // Resolve customer ID from prop, URL search param (?id=...), path (/tab/:id), or persistent localStorage
  const [customerId] = useState<string>(() => {
    if (initialCustomerId) return initialCustomerId;
    if (typeof window !== 'undefined') {
      const searchId = new URLSearchParams(window.location.search).get('id') || new URLSearchParams(window.location.search).get('customerId');
      if (searchId) {
        localStorage.setItem('last_khata_customer_id', searchId);
        return searchId;
      }
      const pathParts = window.location.pathname.split('/');
      for (const prefix of ['tab', 'customer', 'khata', 'statement']) {
        const idx = pathParts.indexOf(prefix);
        if (idx !== -1 && pathParts[idx + 1]) {
          const pathId = pathParts[idx + 1].split('?')[0].split('#')[0];
          if (pathId) {
            localStorage.setItem('last_khata_customer_id', pathId);
            return pathId;
          }
        }
      }
      const savedId = localStorage.getItem('last_khata_customer_id');
      if (savedId) return savedId;
    }
    return 'cust_nfc_demo_01'; // Default demo customer
  });

  // 4-Digit Khata PIN & Device Trust State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      // 1. Direct bypass if logged in as Cashier or Manager on POS terminal
      const role = localStorage.getItem('askar_role');
      if (role === 'CASHIER' || role === 'MANAGER') return true;

      // 2. Direct bypass if running on native Sunmi / Android Capacitor app
      const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
      if (isNative) return true;

      // 3. Direct bypass if opened via POS interface flag
      const search = new URLSearchParams(window.location.search);
      if (search.get('pos') === 'true' || search.get('mode') === 'pos' || search.get('auth') === 'true' || search.get('cashier') === 'true') {
        return true;
      }

      // 4. Saved device token
      const token = localStorage.getItem(`khata_token_${customerId}`);
      return Boolean(token);
    }
    return false;
  });
  const [pin, setPin] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
  const [isVerifyingPin, setIsVerifyingPin] = useState<boolean>(false);

  // Dynamic API Base Resolver (Supports Cloudflare Edge, tunnels, custom domains)
  const resolveApiBase = (): string => {
    if (typeof window === 'undefined') return apiBase || getApiBaseUrl();

    // 1. Explicit override saved in query param (?tunnel= or ?api=)
    const urlApi = new URLSearchParams(window.location.search).get('api') || new URLSearchParams(window.location.search).get('tunnel');
    if (urlApi) {
      localStorage.setItem('khata_tunnel_api', urlApi);
      return urlApi.replace(/\/+$/, '');
    }

    // 2. Saved API override in localStorage (if it is a valid cloud/tunnel URL)
    const masterUrl = localStorage.getItem('master_server_url');
    if (masterUrl && masterUrl.trim() && !masterUrl.includes('localhost') && !masterUrl.includes('192.168.')) {
      return masterUrl.trim().replace(/\/+$/, '');
    }

    return getApiBaseUrl();
  };

  const handleVerifyPin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pin || pin.length !== 4) {
      setPinError('Please enter a 4-digit PIN');
      return;
    }
    setIsVerifyingPin(true);
    setPinError('');
    try {
      const resolvedApiBase = resolveApiBase();

      const res = await fetch(`${resolvedApiBase}/api/khata/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid: customerId, pin })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Incorrect PIN. Please try again.');
      }

      // Save trusted device token in localStorage
      localStorage.setItem(`khata_token_${customerId}`, data.deviceToken);
      setIsAuthenticated(true);
      fetchStatement();
    } catch (err: any) {
      setPinError(err.message || 'Incorrect PIN. Please try again.');
      setPin('');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleLockAccount = () => {
    localStorage.removeItem(`khata_token_${customerId}`);
    setIsAuthenticated(false);
    setPin('');
  };



  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [statement, setStatement] = useState<LedgerEntry[]>([]);
  const [messGroup, setMessGroup] = useState<MessGroupData | null>(null);
  const [messes, setMesses] = useState<MessGroupData[]>([]);
  const [wallets, setWallets] = useState<WalletBreakdown | null>(null);
  const [deposit, setDeposit] = useState<DepositData | null>(null);
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [flashCampaign, setFlashCampaign] = useState<any | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>('default');

  // Push notification permission & WebSocket live transaction listener
  useEffect(() => {
    initPushNotifications().catch(() => { });
    const perm = getNotificationPermissionStatus();
    setNotifPermission(perm);
    if (perm === 'granted') {
      subscribeCustomerToWebPush(customerId, customer?.name).catch(() => { });
    }

    const handleTxNotification = (e: any) => {
      const payload = e?.detail;
      if (!payload) return;

      // Filter: if targeted to this customer or if it's general
      const isTargeted = !payload.customerId || payload.customerId === customerId || (customer && payload.customerName === customer.name);
      if (isTargeted) {
        showTransactionNotification(payload).catch(() => { });
        // Refresh statement ledger automatically
        fetchStatement();
      }
    };

    window.addEventListener('pwa-transaction-notification', handleTxNotification);
    return () => window.removeEventListener('pwa-transaction-notification', handleTxNotification);
  }, [customerId, customer?.name]);

  const handleEnableNotifications = async () => {
    const res = await requestNotificationPermission();
    setNotifPermission(res);
    if (res === 'granted') {
      subscribeCustomerToWebPush(customerId, customer?.name).catch(() => { });
      showTransactionNotification({
        txType: 'SALE',
        title: 'Notifications Activated 🔔',
        message: 'You will receive real-time alerts on your phone whenever purchases or payments are recorded on your account.',
        amount: 0,
        formattedAmount: 'Active'
      });
    }
  };

  // View state & tabs
  const [activeTab, setActiveTab] = useState<'PERSONAL' | 'MESS'>('PERSONAL');
  const [selectedMemberFilter, setSelectedMemberFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'CHARGES' | 'PAYMENTS'>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const setQuickRange = (preset: 'TODAY' | 'THIS_MONTH' | 'LAST_MONTH' | 'ALL') => {
    const now = new Date();
    if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'TODAY') {
      const todayStr = now.toISOString().slice(0, 10);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'THIS_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const todayStr = now.toISOString().slice(0, 10);
      setStartDate(firstDay);
      setEndDate(todayStr);
    } else if (preset === 'LAST_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      setStartDate(firstDay);
      setEndDate(lastDay);
    }
  };

  // BenefitPay Payment Modal State
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [customPayAmount, setCustomPayAmount] = useState<string>('');
  const [isSubmittingPay, setIsSubmittingPay] = useState(false);
  const [showBookBalanceModal, setShowBookBalanceModal] = useState<boolean>(false);
  const [paymentSuccessToast, setPaymentSuccessToast] = useState<{
    show: boolean;
    amount: number;
    reference: string;
  } | null>(null);

  // Check if ?success=true is already present in URL from a redirect
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isSuccess = new URLSearchParams(window.location.search).get('success');
      if (isSuccess === 'true') {
        setPaymentSuccessToast({
          show: true,
          amount: 0,
          reference: 'BenefitPay Online Settlement'
        });
      }
    }
  }, []);

  // Expandable Itemized Transaction State ("Transaction of Each and Everything")
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [entryItemsMap, setEntryItemsMap] = useState<Record<string, any[]>>({});
  const [loadingItemsId, setLoadingItemsId] = useState<string | null>(null);

  const toggleExpandEntry = async (entry: LedgerEntry) => {
    if (expandedEntryId === entry.id) {
      setExpandedEntryId(null);
      return;
    }
    setExpandedEntryId(entry.id);

    const invoiceRef = entry.reference || entry.invoiceNo || entry.id;
    if (invoiceRef && !entryItemsMap[entry.id]) {
      try {
        setLoadingItemsId(entry.id);
        const resolvedApiBase = resolveApiBase();
        const res = await fetch(`${resolvedApiBase}/api/invoice/${encodeURIComponent(invoiceRef)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && (data.sale?.items || data.invoice?.items)) {
            setEntryItemsMap(prev => ({ ...prev, [entry.id]: data.sale?.items || data.invoice?.items }));
          }
        }
      } catch (e) {
        console.warn('Failed to fetch invoice items:', e);
      } finally {
        setLoadingItemsId(null);
      }
    }
  };

  // Fetch statement data
  const fetchStatement = async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      const resolvedApiBase = resolveApiBase();
      const token = localStorage.getItem(`khata_token_${customerId}`);
      const headers: Record<string, string> = {};
      if (token) {
        headers['x-khata-token'] = token;
      }

      const res = await fetch(`${resolvedApiBase}/api/customers/${customerId}/statement`, { headers });
      if (res.status === 401) {
        // Device token expired or invalidated by PIN change: force re-authentication
        localStorage.removeItem(`khata_token_${customerId}`);
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to load statement (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to retrieve account records');
      }

      const entries = data.statement || data.entries || data.sales || [];
      setCustomer(data.customer);
      setStatement(entries);
      setCurrentBalance(data.currentBalance ?? data.customer?.balance ?? data.customer?.currentBalance ?? 0);
      setMessGroup(data.messGroup || null);
      setMesses(data.messes || (data.messGroup ? [data.messGroup] : []));
      setWallets(data.wallets || null);

      const rawDeposit = data.deposit || data.wallets?.deposit || data.customer;
      const depStatus = String(rawDeposit?.status || data.customer?.card_deposit_status || 'NONE').toUpperCase();
      const depAmt = Number(rawDeposit?.amount ?? data.customer?.card_deposit_amount ?? 0);
      const isDeferred = depStatus === 'IN_CREDIT' || depStatus === 'DEFERRED_CREDIT' || depStatus === 'DEFERRED_PAYDAY' || Boolean(rawDeposit?.inCredit) || Boolean(data.customer?.depositInCredit);
      const isPaid = depStatus === 'HELD' || (depAmt > 0 && !isDeferred);
      const isNone = !isDeferred && !isPaid;

      setDeposit({
        amount: depAmt,
        status: depStatus,
        isDeferred,
        isPaid,
        isNone
      });

      // Auto-switch to MESS tab if requested by param, mess ID, or isMessStatement
      if (typeof window !== 'undefined') {
        const tabParam = new URLSearchParams(window.location.search).get('tab');
        if (tabParam === 'mess' || data.isMessStatement || data.isMessGroup || customerId.startsWith('mess_') || customerId.startsWith('mg_')) {
          setActiveTab('MESS');
        }
      } else if (data.isMessStatement || data.isMessGroup) {
        setActiveTab('MESS');
      }

      try {
        const fcRes = await fetch(`${resolvedApiBase}/api/khata/flash-recovery`);
        if (fcRes.ok) {
          const fcData = await fcRes.json();
          if (fcData.success && fcData.campaign?.isActive) {
            setFlashCampaign(fcData.campaign);
          }
        }
      } catch { }

      if (data.messGroup && !messGroup) {
        // Customer has a mess group available
      }
    } catch (err: any) {
      console.error('Statement fetch error:', err);
      setError(err?.message || 'Could not connect to Askar Khata API');
    } finally {
      setLoading(false);
    }
  };

  const [isRebalancingMess, setIsRebalancingMess] = useState(false);

  const handleRebalanceMessCards = async () => {
    if (!messGroup || !messGroup.id) return;
    const targetMessId = messGroup.id;
    const groupName = messGroup.group_name || 'Camp Mess';
    const memberCount = Math.max(1, Number(messGroup.members?.length || messGroup.memberCount || 1));
    const eqShare = (messGroup.equalSplitShare || (Number(messGroup.totalBalance || 0) / memberCount)).toFixed(3);

    const confirmed = window.confirm(
      `⚖️ Split Camp Debt Equally Across All Cards?\n\n` +
      `Mess Group: ${groupName}\n` +
      `Total Debt: BHD ${Number(messGroup.totalBalance || 0).toFixed(3)}\n` +
      `Active Cards: ${memberCount}\n` +
      `Target Equal Share per Card: BHD ${eqShare}\n\n` +
      `This will update the ledger so that every member card account has an exact balance of BHD ${eqShare}.\n\n` +
      `Proceed?`
    );
    if (!confirmed) return;

    setIsRebalancingMess(true);
    try {
      const resolvedBase = resolveApiBase();
      const res = await fetch(`${resolvedBase}/api/khata/mess/${encodeURIComponent(targetMessId)}/rebalance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-manager-pin': getManagerPin(),
          'x-pos-client': 'store-pos'
        }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to rebalance mess group debt');
      }

      alert(`✅ Success: ${data.message || 'Camp balance split equally across all cards'}`);
      fetchStatement();
    } catch (err: any) {
      alert(`❌ Error: ${err?.message || 'Could not rebalance cards'}`);
    } finally {
      setIsRebalancingMess(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchStatement();
    }
  }, [customerId, isAuthenticated]);

  // Handle BenefitPay instant settlement
  const handleBenefitPaySettlement = async (amount: number) => {
    if (!amount || amount <= 0 || !customer) return;
    setIsSubmittingPay(true);
    try {
      const resolvedApiBase = resolveApiBase();

      const res = await fetch(`${resolvedApiBase}/api/customers/${customer.id}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountPaid: amount,
          paymentMethod: 'BENEFIT_PAY',
          reference: activeTab === 'MESS' && messGroup ? `BenefitPay Mess Settlement (${messGroup.group_name})` : `BenefitPay Fawri+ Online Settlement`,
          mess_id: activeTab === 'MESS' && messGroup ? messGroup.id : null
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'BenefitPay settlement failed');
      }

      // Live update balance and add negative transaction entry
      const updatedBalance = data.newBalance !== undefined ? data.newBalance : Math.max(0, currentBalance - amount);
      setCurrentBalance(updatedBalance);
      if (customer) {
        setCustomer({ ...customer, currentBalance: updatedBalance });
      }

      const newEntry: LedgerEntry = {
        id: data.ledgerEntry?.id || `BP-${Date.now()}`,
        reference: 'BenefitPay Fawri+ Online Settlement',
        type: 'PAYMENT',
        paymentType: 'PAYMENT',
        amount: amount,
        raw_amount: -amount,
        running_balance: updatedBalance,
        runningBalance: updatedBalance,
        formattedDate: new Date().toLocaleDateString(),
        formattedTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date().toISOString()
      };

      setStatement((prev) => [newEntry, ...prev]);

      setIsPayModalOpen(false);
      setPaymentSuccessToast({
        show: true,
        amount: amount,
        reference: data.receiptNo || `BP-${Date.now().toString().slice(-6)}`
      });
      playThankYouVoice('KHATA_PAYMENT');

      // Update URL silently with ?success=true
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.set('success', 'true');
        window.history.replaceState({}, '', url.toString());
      }
    } catch (err: any) {
      alert(`Payment Error: ${err?.message || 'Transaction could not be processed'}`);
    } finally {
      setIsSubmittingPay(false);
    }
  };

  const creditLimit = customer?.creditLimit || 50.0;

  const isMessView = activeTab === 'MESS' && messGroup !== null;
  const messMemberCount = Math.max(1, messGroup?.members?.length || messGroup?.memberCount || 1);
  const messTotalBalance = Number(messGroup?.totalBalance ?? 0);
  const messEqualShare = Number(messGroup?.equalSplitShare ?? (messTotalBalance / messMemberCount));
  const personalOutstanding = Number((wallets?.personal !== undefined ? wallets.personal : ((customer as any)?.personalBalance ?? currentBalance)) || 0);

  const displayOutstanding = isMessView ? messTotalBalance : personalOutstanding;
  const displayLimit = isMessView ? ((messGroup as any)?.creditLimit || 500.0) : creditLimit;
  const displayUsagePercent = Math.min(100, Math.round((displayOutstanding / Math.max(1, displayLimit)) * 100));

  // Determine active transactions to display based on tab & filters
  const displayedTransactions = () => {
    let source: LedgerEntry[] = [];

    if (activeTab === 'MESS') {
      source = (messGroup?.messLedger && messGroup.messLedger.length > 0)
        ? messGroup.messLedger
        : statement.filter((item) => (item.mess_id && messGroup?.id ? item.mess_id === messGroup.id : (item.mess_id || (item.reference && item.reference.includes('Mess Split')))));
      if (selectedMemberFilter) {
        source = source.filter((item) => item.customerId === selectedMemberFilter);
      }
    } else {
      source = customer?.isMessGroup
        ? (messGroup?.messLedger || statement)
        : statement.filter((item) => !item.mess_id || item.mess_id === '');
    }

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    if (end) end.setHours(23, 59, 59, 999);

    let openingBal = 0;
    const dateFiltered: any[] = [];

    source.forEach((item) => {
      const isPayment = item.type === 'PAYMENT' || item.type === 'WRITE_OFF' || Number(item.raw_amount || 0) < 0;
      const isCharge = item.type === 'CHARGE' || item.type === 'SALE' || Number(item.raw_amount || item.amount || 0) > 0;
      const amt = Number(item.raw_amount !== undefined ? item.raw_amount : (isPayment ? -Math.abs(item.amount || item.total || 0) : Math.abs(item.amount || item.total || 0)));

      const dStr = item.created_at || item.timestamp || (item as any).createdAt;
      const txDate = dStr ? new Date(dStr) : new Date(0);

      if (start && txDate < start) {
        openingBal += amt;
      } else if ((!start || txDate >= start) && (!end || txDate <= end)) {
        if (typeFilter === 'CHARGES' && !isCharge) return;
        if (typeFilter === 'PAYMENTS' && !isPayment) return;
        dateFiltered.push(item);
      }
    });

    // Recompute running balance chronologically along the active tab's entries starting from Opening Balance
    const chronological = [...dateFiltered].sort(
      (a, b) => new Date(a.created_at || a.timestamp || 0).getTime() - new Date(b.created_at || b.timestamp || 0).getTime()
    );

    let runBal = openingBal;
    const recomputed = chronological.map((item) => {
      const isPayment = item.type === 'PAYMENT' || item.type === 'WRITE_OFF' || Number(item.raw_amount || 0) < 0;
      const amt = Number(item.raw_amount !== undefined ? item.raw_amount : (isPayment ? -Math.abs(item.amount || item.total || 0) : Math.abs(item.amount || item.total || 0)));
      runBal += amt;
      return {
        ...item,
        running_balance: Number(runBal.toFixed(3)),
        runningBalance: Number(runBal.toFixed(3))
      };
    });

    // If start date filter is active and opening balance != 0, show explicit Opening Balance row
    if (start && Math.abs(openingBal) > 0.0001 && typeFilter === 'ALL') {
      const obRow: LedgerEntry = {
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
        paymentType: 'OPENING_BALANCE'
      };
      recomputed.unshift(obRow);
    }

    return recomputed.reverse();
  };

  const filteredList = displayedTransactions();

  const filteredChargesTotal = filteredList.reduce((acc, item) => {
    const isCharge = item.type === 'CHARGE' || item.type === 'SALE' || Number(item.raw_amount || item.amount || 0) > 0;
    return isCharge ? acc + Number(item.amount || item.raw_amount || 0) : acc;
  }, 0);

  const filteredPaymentsTotal = filteredList.reduce((acc, item) => {
    const isPayment = item.type === 'PAYMENT' || item.type === 'WRITE_OFF' || Number(item.raw_amount || item.amount || 0) < 0;
    return isPayment ? acc + Number(item.amount || item.raw_amount || 0) : acc;
  }, 0);

  const handlePrintStatement = async () => {
    if (!customer) return;
    const isMess = activeTab === 'MESS' && Boolean(messGroup);
    const formattedStatement = filteredList.map((item) => ({
      id: item.id,
      amount: Number(item.amount || item.raw_amount || 0),
      type: item.type === 'SALE' || item.type === 'CHARGE' ? 'SALE' : 'PAYMENT',
      reference: item.reference || item.invoiceNo || 'Store Purchase',
      walletName: (item as any).walletName || (item as any).messName,
      messName: (item as any).messName,
      formattedDate: item.formattedDate || new Date(item.created_at || item.timestamp || Date.now()).toLocaleDateString(),
      formattedTime: item.formattedTime || new Date(item.created_at || item.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      runningBalance: Number(item.running_balance ?? item.runningBalance ?? 0)
    }));

    try {
      await printKhataStatement({
        shopName: isMess ? `ASKAR - MESS: ${messGroup!.group_name}` : "ASKAR STORE - KHATA STATEMENT",
        customerName: isMess ? messGroup!.group_name : customer.name,
        customerPhone: customer.phone,
        customerCpr: customer.cpr,
        statement: formattedStatement,
        currentBalance: isMess ? messGroup!.totalBalance : currentBalance,
        isMessStatement: isMess,
        messGroup: isMess ? (messGroup as any) : undefined,
        wallets: !isMess ? (wallets as any) : undefined,
        dateRange: (startDate || endDate)
          ? `${startDate || 'Start'} to ${endDate || 'Today'}`
          : undefined
      });
    } catch (e) {
      console.warn("Khata statement printing notice:", e);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // KHATA AUTH GATEWAY: 4-DIGIT PIN & DEVICE TRUST LOCK SCREEN
  // ──────────────────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-5 selection:bg-emerald-500 selection:text-slate-950 font-sans">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 text-center animate-in fade-in duration-300">
          {/* Brand Header */}
          <div className="flex flex-col items-center space-y-1.5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-950/60 mb-1">
              <Store className="w-7 h-7 text-slate-950 stroke-[2.5]" />
            </div>
            <div className="flex items-center gap-1.5 justify-center">
              <h2 className="text-lg font-black text-white">Layali Supermarket</h2>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                أسواق ليالي
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Authenticated Khata Financial Portal</p>
          </div>

          {/* Lock Icon & Title */}
          <div className="space-y-1 pt-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-black">
              <Lock className="w-3.5 h-3.5" />
              <span>Secure Khata Access • كشف حساب آمن</span>
            </div>
            <h3 className="text-sm font-bold text-slate-200">Enter Your 4-Digit PIN</h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              Enter the 4-digit PIN established by the supermarket manager to view this financial statement.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleVerifyPin} className="space-y-4">
            <div className="relative">
              <input
                type="password"
                maxLength={4}
                inputMode="numeric"
                pattern="[0-9]*"
                autoFocus
                value={pin}
                onChange={(e) => {
                  setPinError('');
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                }}
                placeholder="••••"
                className="w-full text-center text-4xl font-mono tracking-[0.5em] py-3.5 px-4 bg-slate-950 border-2 border-slate-700 focus:border-emerald-500 rounded-2xl text-white outline-none transition-all placeholder:text-slate-600 shadow-inner"
              />
            </div>

            {pinError && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-2.5 text-xs text-rose-300 font-bold flex items-center justify-center gap-1.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isVerifyingPin || pin.length !== 4}
              className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 active:scale-95 text-slate-950 font-black rounded-2xl text-sm shadow-xl shadow-emerald-950/60 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isVerifyingPin ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying PIN...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4 stroke-[2.5]" />
                  <span>Unlock Statement (فتح الحساب)</span>
                </>
              )}
            </button>
          </form>

          {/* Test Alert Directly from Lock Screen */}
          <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => triggerTestTransactionNotification({
                title: '🔔 Customer Alert Test',
                message: 'Phone notifications are working properly on this device!'
              })}
              className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5 text-emerald-400" />
              <span>Test Phone Alert Chime 🔔</span>
            </button>

            <div className="text-[11px] text-slate-400 space-y-1">
              <p className="flex items-center justify-center gap-1 text-slate-300 font-semibold">
                <span>Default PIN: </span>
                <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-emerald-400">0000</span>
              </p>
              <p className="flex items-center justify-center gap-1 text-slate-400 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Device Trust: Saves token to phone for 90 days</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <div className="relative mb-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center animate-ping absolute inset-0" />
          <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-emerald-500/40 flex items-center justify-center relative shadow-xl">
            <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          </div>
        </div>
        <h2 className="text-lg font-black text-white">Loading Khata Ledger...</h2>
        <p className="text-xs text-slate-400 mt-1">Connecting to Layali Supermarket Cloud</p>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-rose-400" />
        </div>
        <h2 className="text-xl font-black text-white mb-2">Account Not Found</h2>
        <p className="text-sm text-slate-400 max-w-sm mb-6 leading-relaxed">
          {error || `No registered Khata account was found matching ID: ${customerId}`}
        </p>
        <button
          onClick={fetchStatement}
          className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-bold rounded-xl text-sm transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16 selection:bg-emerald-500 selection:text-slate-950">
      {/* ──────────────────────────────────────────────────────────────────────────
          TOP STORE BRANDING & VERIFIED BADGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-slate-900/90 border-b border-slate-800 px-4 py-3.5">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-950/50">
              <Store className="w-5 h-5 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-base font-black text-white tracking-tight">Layali Supermarket</h1>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  أسواق ليالي
                </span>
              </div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                <span>Central Branch • Kingdom of Bahrain</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleEnableNotifications}
              title={notifPermission === 'granted' ? 'Push Notifications Active' : 'Enable Push Notifications on Phone'}
              className={`p-2 rounded-xl transition-all cursor-pointer ${notifPermission === 'granted'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                }`}
            >
              {notifPermission === 'granted' ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={handlePrintStatement}
              title="Print 58mm Thermal Statement Slip on Sunmi"
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print Slip</span>
            </button>
            <button
              type="button"
              onClick={() => setShowBookBalanceModal(true)}
              title="Add previous physical paper book balance"
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">+ Book Bal</span>
            </button>
            <button
              onClick={() => fetchStatement()}
              title="Refresh Ledger"
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/'; }}
              title="Return to Register POS"
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs active:scale-95 transition-all cursor-pointer"
            >
              ← POS
            </button>
            <button
              onClick={handleLockAccount}
              title="Lock Account"
              className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
            >
              <Lock className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN CONTENT CONTAINER (MOBILE CENTERED)
          ────────────────────────────────────────────────────────────────────────── */}
      <main className="max-w-md mx-auto p-4 space-y-4">
        {/* CUSTOMER PHONE PUSH NOTIFICATION & LIVE ALERTS SETUP */}
        <div className={`rounded-3xl p-5 shadow-2xl border flex flex-col gap-3.5 animate-in fade-in transition-all ${notifPermission === 'granted'
          ? 'bg-gradient-to-br from-emerald-950/90 via-slate-900 to-teal-950/90 border-emerald-500/50 shadow-emerald-950/50'
          : 'bg-gradient-to-br from-blue-950/90 via-slate-900 to-indigo-950/90 border-blue-500/50 shadow-blue-950/50'
          }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${notifPermission === 'granted'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                }`}>
                <Bell className="w-6 h-6 animate-pulse" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-white tracking-tight">
                    Customer Real-Time Alerts 🔔
                  </h3>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    LIVE POS
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 font-medium">
                  {customer?.name ? `Active for: ${customer.name}` : 'Instant alerts for every purchase and debt payment'}
                </p>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                  <span>Balance: <strong className="text-white">BD {Number(currentBalance || 0).toFixed(3)}</strong></span>
                  <span>•</span>
                  <span>Audio Chime: <strong className="text-emerald-400">ON 🔊</strong></span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 pt-2 border-t border-slate-700/60">
            {notifPermission === 'default' && (
              <button
                type="button"
                onClick={handleEnableNotifications}
                className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-xl active:scale-95 transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                <span>Turn On Phone Push</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => triggerTestTransactionNotification({
                customerId: customerId,
                customerName: customer?.name || 'Customer Account',
                amount: 2.500,
                formattedAmount: '2.500 BHD',
                txType: 'SALE'
              })}
              className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl active:scale-95 transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              title="Test real-time alert with sound & vibration on this phone"
            >
              <span>🧪 Test Alert on My Phone</span>
            </button>
          </div>
        </div>

        {/* FLASH RECOVERY SETTLEMENT INCENTIVE BANNER */}
        {flashCampaign?.isActive && Number(currentBalance || 0) > 0 && (
          <div className="bg-gradient-to-r from-amber-950/90 via-amber-900/80 to-orange-950/90 border border-amber-500/50 rounded-2xl p-4 shadow-xl relative overflow-hidden animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shrink-0 shadow-md shadow-amber-950/60">
                <Zap className="w-5 h-5 text-slate-950 stroke-[3]" />
              </div>
              <div className="flex-1 pr-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-amber-200 uppercase tracking-wide flex items-center gap-1.5">
                    <span>⚡ Flash Settlement Discount ({flashCampaign.discountPercent || 2}%)</span>
                  </h4>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 animate-pulse">
                    Save BD {(Number(currentBalance || 0) * (Number(flashCampaign.discountPercent || 2) / 100)).toFixed(3)}
                  </span>
                </div>
                <p className="text-[11px] text-amber-100/90 mt-1 leading-relaxed">
                  Settle today to pay <strong className="text-white underline decoration-amber-400 decoration-2">BD {(Number(currentBalance || 0) * (1 - Number(flashCampaign.discountPercent || 2) / 100)).toFixed(3)}</strong> instead of BD {Number(currentBalance || 0).toFixed(3)}.
                </p>
                <button
                  onClick={() => {
                    const discounted = (Number(currentBalance || 0) * (1 - Number(flashCampaign.discountPercent || 2) / 100)).toFixed(3);
                    setCustomPayAmount(discounted);
                    setIsPayModalOpen(true);
                  }}
                  className="mt-2.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs flex items-center gap-1.5 transition-all shadow-md"
                >
                  <span>Pay BD {(Number(currentBalance || 0) * (1 - Number(flashCampaign.discountPercent || 2) / 100)).toFixed(3)} Now</span>
                  <Zap className="w-3.5 h-3.5 stroke-[3]" />
                </button>
              </div>
            </div>
          </div>
        )}
        {paymentSuccessToast && (
          <div className="bg-gradient-to-r from-emerald-900/80 via-emerald-800/80 to-teal-900/80 border border-emerald-400/50 rounded-2xl p-4 shadow-2xl relative animate-in fade-in slide-in-from-top-4 duration-300">
            <button
              onClick={() => setPaymentSuccessToast(null)}
              className="absolute top-3 right-3 text-emerald-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow-md">
                <CheckCircle2 className="w-5 h-5 text-slate-950 stroke-[3]" />
              </div>
              <div className="pr-4">
                <h3 className="text-sm font-black text-emerald-200">
                  Payment Confirmed! تم استلام الدفعة بنجاح
                </h3>
                <p className="text-xs text-emerald-100/90 mt-0.5 leading-relaxed">
                  {paymentSuccessToast.amount > 0
                    ? `BD ${paymentSuccessToast.amount.toFixed(3)} settled via BenefitPay Fawri+. Your ledger has been immediately credited.`
                    : 'Your BenefitPay payment was confirmed and reconciled on the Askar cloud ledger.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* CUSTOMER PROFILE CARD */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  <ShieldCheck className="w-3 h-3" />
                  Verified Khata Customer
                </span>
                {customer.batchNo && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {customer.batchNo}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black text-white">{customer.name}</h2>
                {deposit && (
                  deposit.isDeferred ? (
                    <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded-md">
                      IN CREDIT (DUE): BD {deposit.amount.toFixed(3)}
                    </span>
                  ) : deposit.isPaid ? (
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                      HELD IN TRUST: BD {deposit.amount.toFixed(3)}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-md">
                      NO DEPOSIT
                    </span>
                  )
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {customer.phone || customer.cpr || 'Account: ' + customer.id.slice(0, 12)}
              </p>
            </div>

            {(messGroup || customer.messName || customer.mess_name) && (
              <div className="text-right flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab(activeTab === 'MESS' ? 'PERSONAL' : 'MESS');
                    setSelectedMemberFilter(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 cursor-pointer active:scale-95 transition-all shadow-xs"
                  title="Click to view shared Mess Camp Split Statement"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{messGroup?.group_name || customer.messName || customer.mess_name}</span>
                </button>
                <p className="text-[10px] text-slate-400 font-medium">
                  {messGroup ? `${messGroup.memberCount} Camp Members • Tap to split` : 'Camp Mess Member'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────────────────────
            BALANCE GAUGE & CREDIT LIMIT METER
            ────────────────────────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-b from-slate-900 to-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {isMessView ? `Camp Mess Total Outstanding (${messGroup?.group_name || 'Camp Mess'})` : `Personal Outstanding Balance (${customer?.name || 'Account'})`}
            </span>
            <span
              className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${displayOutstanding > 0
                ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                }`}
            >
              {displayOutstanding > 0 ? (isMessView ? 'Camp Group Debt' : 'Balance Due') : 'Account Cleared'}
            </span>
          </div>

          <div className="flex items-baseline gap-2 mb-2">
            <span
              className={`text-4xl sm:text-5xl font-black font-mono tracking-tight ${displayOutstanding > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
            >
              BD {displayOutstanding.toFixed(3)}
            </span>
            <span className="text-xs font-arabic text-slate-400">دينار بحريني</span>
          </div>

          {isMessView && (
            <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-bold">
              <span>👥 Your Equal Share:</span>
              <span className="font-mono text-white text-sm">BD {messEqualShare.toFixed(3)}</span>
              <span className="text-[10px] text-indigo-400">({messMemberCount} Members)</span>
            </div>
          )}

          {/* Credit Limit Progress Bar */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>{isMessView ? 'Group Credit Limit:' : 'Credit Limit:'} BD {displayLimit.toFixed(3)}</span>
              <span className={displayUsagePercent >= 90 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                {displayUsagePercent}% Used
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${displayUsagePercent >= 90
                  ? 'bg-rose-500'
                  : displayUsagePercent >= 70
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                  }`}
                style={{ width: `${displayUsagePercent}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 text-right">
              Remaining Credit:{' '}
              <span className="text-emerald-400 font-mono font-bold">
                BD {Math.max(0, displayLimit - displayOutstanding).toFixed(3)}
              </span>
            </p>
          </div>

          {/* ──────────────────────────────────────────────────────────────────────────
              ONE-CLICK BENEFITPAY SETTLEMENT BUTTON
              ────────────────────────────────────────────────────────────────────────── */}
          <div className="mt-5 pt-4 border-t border-slate-800/80">
            <button
              onClick={() => {
                const targetPay = isMessView
                  ? (messEqualShare > 0 ? messEqualShare.toFixed(3) : '5.000')
                  : (displayOutstanding > 0 ? displayOutstanding.toFixed(3) : '5.000');
                setCustomPayAmount(targetPay);
                setIsPayModalOpen(true);
              }}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 active:scale-[0.98] transition-all text-slate-950 font-black rounded-2xl text-base shadow-xl shadow-emerald-950/60 flex items-center justify-center gap-2.5"
            >
              <CreditCard className="w-5 h-5 stroke-[2.5]" />
              <span>{isMessView ? 'Pay My Share via BenefitPay (ادفع حصتي عبر بنفت بي)' : 'Pay via BenefitPay (ادفع عبر بنفت بي)'}</span>
              {(isMessView ? messEqualShare : displayOutstanding) > 0 && (
                <span className="bg-slate-950/20 px-2 py-0.5 rounded-lg text-xs font-mono font-bold text-slate-950">
                  BD {(isMessView ? messEqualShare : displayOutstanding).toFixed(3)}
                </span>
              )}
            </button>
            <p className="text-[10px] text-slate-400 text-center mt-2">
              Instant Fawri+ reconciliation • Zero supermarket checkout queuing
            </p>
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────────────────────
            SUB-LEDGER WALLET ATTRIBUTION PANEL (MULTI-MESS / PERSONAL BREAKDOWN)
            ────────────────────────────────────────────────────────────────────────── */}
        {wallets && (wallets.messes?.length > 0 || wallets.personal > 0 || (deposit && deposit.amount > 0)) && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-emerald-400" />
                Wallet Breakdown (تفاصيل الحسابات والجروبات)
              </span>
              <span className="text-[10px] font-bold text-slate-400 font-mono">
                {wallets.messes.length} Mess Group{wallets.messes.length > 1 ? 's' : ''} + Personal
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {/* Personal Tab */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-200 flex items-center gap-1">
                    <span>👤</span> Personal Tab (حساب شخصي)
                  </p>
                  <p className="text-[10px] text-slate-400">Direct purchases & snacks</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black font-mono text-emerald-400">
                    BD {Number(wallets.personal || 0).toFixed(3)}
                  </p>
                </div>
              </div>

              {/* Card Security Deposit */}
              {deposit && (
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-200 flex items-center gap-1">
                      <span>🛡️</span> Card Deposit (تأمين البطاقة)
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-wider">
                      {deposit.isDeferred ? (
                        <span className="text-rose-400">IN CREDIT (DUE)</span>
                      ) : deposit.isPaid ? (
                        <span className="text-emerald-400">HELD IN TRUST</span>
                      ) : (
                        <span className="text-slate-400">NO DEPOSIT</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-black font-mono ${deposit.isDeferred ? 'text-rose-400' : deposit.isPaid ? 'text-emerald-400' : 'text-slate-400'
                      }`}>
                      BD {Number(deposit.amount || 0).toFixed(3)}
                    </p>
                  </div>
                </div>
              )}

              {/* Mess Groups */}
              {wallets.messes.map((w) => (
                <div key={w.id} className="bg-slate-950/60 border border-indigo-950/60 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-indigo-300 flex items-center gap-1">
                      <span>🥘</span> {w.name}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Your Share • (Camp Total: BD {Number(w.groupTotal || 0).toFixed(3)} / {w.memberCount} members)
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black font-mono text-indigo-400">
                      BD {Number(w.memberShare || 0).toFixed(3)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────────────────────────────────────
            MESS GROUP TRANSPARENCY BREAKDOWN TAB SELECTOR (IF IN MESS)
            ────────────────────────────────────────────────────────────────────────── */}
        {(messes.length > 0 || messGroup) && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-1 flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => {
                setActiveTab('PERSONAL');
                setSelectedMemberFilter(null);
              }}
              className={`flex-1 min-w-[120px] py-2 rounded-xl text-xs font-black transition-all ${activeTab === 'PERSONAL'
                ? 'bg-emerald-600 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
                }`}
            >
              My Statement (حسابي)
            </button>
            {(messes.length > 0 ? messes : [messGroup!]).map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setMessGroup(m);
                  setActiveTab('MESS');
                }}
                className={`flex-1 min-w-[140px] py-2 px-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${activeTab === 'MESS' && messGroup?.id === m.id
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
                  }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span className="truncate">{m.group_name}</span>
              </button>
            ))}
          </div>
        )}

        {/* ──────────────────────────────────────────────────────────────────────────
            VIEW A: MESS GROUP TRANSPARENCY MODULE (CAMP EXPENSES AUDIT)
            ────────────────────────────────────────────────────────────────────────── */}
        {activeTab === 'MESS' && messGroup && (
          <div className="space-y-3 animate-in fade-in duration-200">
            {/* Mess Header Explainer */}
            {/* Mess Group Transparency Overview & Room Member Split Cards */}
            <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 border border-indigo-500/40 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      👥 Camp Mess Group Statement
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                      {messGroup.members.length} Members
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-400" />
                    <span>{messGroup.group_name}</span>
                  </h3>
                </div>

                {/* Action Buttons inside Mess Statement */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRebalanceMessCards}
                    disabled={isRebalancingMess}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer border border-indigo-400/40 disabled:opacity-50"
                    title="Split total camp debt equally across all member cards in the database"
                  >
                    <Scale className="w-3.5 h-3.5 text-amber-300" />
                    <span>{isRebalancingMess ? 'Splitting...' : '⚡ Split Balance to Cards'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrintStatement}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer border border-slate-700"
                    title="Print 58mm Mess Statement Slip"
                  >
                    <Printer className="w-3.5 h-3.5 text-indigo-300" />
                    <span>🖨️ Print (58mm)</span>
                  </button>

                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `📋 *LAYALI SUPERMARKET - MESS EXPENSE SPLIT*\n` +
                      `🏢 *Mess Group:* ${messGroup.group_name}\n` +
                      `💰 *Total Camp Balance:* BD ${messGroup.totalBalance.toFixed(3)}\n` +
                      `👥 *Room Members:* ${messGroup.members.length}\n` +
                      `⚖️ *EQUAL SPLIT SHARE:* BD ${(messGroup.equalSplitShare || (messGroup.totalBalance / Math.max(1, messGroup.members.length))).toFixed(3)} / member\n` +
                      `----------------------------------------\n` +
                      `*Room Members Equal Split Balances:*\n` +
                      messGroup.members.map((m) => {
                        const mEq = (m.equalSplitShare || messGroup.equalSplitShare || (messGroup.totalBalance / Math.max(1, messGroup.members.length))).toFixed(3);
                        return `• *${m.name}*:\n  ⚖️ Equal Split Due: *BD ${mEq}*\n  🛒 Card Purchases: BD ${Number(m.currentBalance || 0).toFixed(3)} (${m.spendPercentage || 0}%)`;
                      }).join('\n') +
                      `\n----------------------------------------\n` +
                      `Please settle your equal share at Layali Supermarket counter or via BenefitPay Fawri+. Thank you!`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                    title="Share full mess debt breakdown to WhatsApp group"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>📱 WhatsApp Split</span>
                  </a>
                </div>
              </div>

              {/* 3 Prominent KPI Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div className="bg-slate-900/80 border border-indigo-800/80 rounded-xl p-3 flex flex-col justify-between shadow-xs">
                  <div className="flex items-center justify-between text-indigo-300 text-[10px] font-bold uppercase tracking-wider">
                    <span>Total Camp Debt</span>
                    <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="mt-1">
                    <span className="text-xl font-black font-mono text-emerald-400">
                      BD {messGroup.totalBalance.toFixed(3)}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5 font-medium">Collective room debt</span>
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-emerald-500/50 rounded-xl p-3 flex flex-col justify-between shadow-xs ring-1 ring-emerald-500/20">
                  <div className="flex items-center justify-between text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
                    <span>Equal Share / Card</span>
                    <Scale className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="mt-1">
                    <span className="text-xl font-black font-mono text-emerald-300">
                      BD {(messGroup.equalSplitShare || (messGroup.totalBalance / Math.max(1, messGroup.members.length))).toFixed(3)}
                    </span>
                    <span className="text-[10px] text-emerald-400/80 block mt-0.5 font-medium">
                      BD {messGroup.totalBalance.toFixed(3)} ÷ {messGroup.members.length} members
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-indigo-800/80 rounded-xl p-3 flex flex-col justify-between shadow-xs">
                  <div className="flex items-center justify-between text-indigo-300 text-[10px] font-bold uppercase tracking-wider">
                    <span>Active Camp Cards</span>
                    <Users className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div className="mt-1">
                    <span className="text-xl font-black font-mono text-white">
                      {messGroup.members.length} Cards
                    </span>
                    <span className="text-[10px] text-indigo-300/80 block mt-0.5 font-medium">
                      Registered camp members
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Member Comparison Cards */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 px-1">
                <span>Room Member Cards • Balance Split Equally ({messGroup.members.length})</span>
                {selectedMemberFilter && (
                  <button
                    onClick={() => setSelectedMemberFilter(null)}
                    className="text-[11px] text-emerald-400 hover:underline cursor-pointer"
                  >
                    Clear Filter
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {messGroup.members.map((member) => {
                  const isSelected = selectedMemberFilter === member.id;
                  const isMe = member.id === customer.id;
                  const memberEqShare = Number(
                    member.equalSplitShare ||
                    messGroup.equalSplitShare ||
                    (messGroup.totalBalance / Math.max(1, messGroup.members.length))
                  );
                  const cardBalance = Number(member.currentBalance || 0);
                  const diff = Number((cardBalance - memberEqShare).toFixed(3));

                  return (
                    <div
                      key={member.id}
                      onClick={() =>
                        setSelectedMemberFilter(isSelected ? null : member.id)
                      }
                      className={`cursor-pointer border rounded-2xl p-4 transition-all flex flex-col justify-between ${isSelected
                        ? 'bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 border-emerald-400 shadow-lg ring-2 ring-emerald-400/40'
                        : 'bg-gradient-to-br from-slate-900/95 via-indigo-950/70 to-slate-900/95 border-slate-800 hover:border-emerald-500/60 hover:shadow-md'
                        }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${isMe
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              }`}
                          >
                            <CreditCard className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-sm font-bold text-white leading-tight">
                                {member.name}
                              </h4>
                              {isMe && (
                                <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  You
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 font-mono">
                              {member.phone ? `📱 ${member.phone}` : '💳 NFC Card Linked'}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`text-[9px] font-black px-2 py-0.5 rounded-md border shrink-0 ${Math.abs(diff) <= 0.001
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : diff > 0
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                            }`}
                        >
                          {Math.abs(diff) <= 0.001
                            ? 'Balanced'
                            : diff > 0
                              ? `+BD ${diff.toFixed(3)} Over Split`
                              : `-BD ${Math.abs(diff).toFixed(3)} Under Split`}
                        </span>
                      </div>

                      {/* Card Middle: Equal Split Hero */}
                      <div className="my-3 p-2.5 bg-indigo-950/80 rounded-xl border border-indigo-800/60 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block">
                            Equal Split Due
                          </span>
                          <span className="text-base font-black font-mono text-emerald-400">
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

                      {/* Spend Share Visual Bar */}
                      <div className="w-full h-1 bg-slate-950 rounded-full mb-3 overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 rounded-full transition-all"
                          style={{ width: `${member.spendPercentage || 0}%` }}
                        />
                      </div>

                      {/* Member Quick Actions: Settle Equal Share & Card Spent & WhatsApp */}
                      <div className="pt-2 border-t border-indigo-800/40 flex items-center justify-between gap-1.5 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCustomPayAmount(memberEqShare.toFixed(3));
                              setIsPayModalOpen(true);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                            title={`Settle ${member.name}'s equal split share (BD ${memberEqShare.toFixed(3)})`}
                          >
                            <CreditCard className="w-3 h-3" />
                            <span>Settle Equal (BD {memberEqShare.toFixed(3)})</span>
                          </button>

                          {Math.abs(cardBalance - memberEqShare) > 0.001 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCustomPayAmount(cardBalance.toFixed(3));
                                setIsPayModalOpen(true);
                              }}
                              className="px-2 py-1 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/50 active:scale-95 text-[10px] font-medium transition-all cursor-pointer"
                              title={`Settle actual card purchases: BD ${cardBalance.toFixed(3)}`}
                            >
                              <span>Card (BD {cardBalance.toFixed(3)})</span>
                            </button>
                          )}
                        </div>

                        {member.phone && (
                          <a
                            href={`https://wa.me/${member.phone.replace(/[^0-9]/g, '').length === 8 ? `973${member.phone.replace(/[^0-9]/g, '')}` : member.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                              `Hello ${member.name}, your equal split share of ${messGroup.group_name} at Layali Supermarket is BHD ${memberEqShare.toFixed(3)} (Card purchases: BHD ${cardBalance.toFixed(3)}). Total camp debt is BHD ${messGroup.totalBalance.toFixed(3)}. Please arrange settlement soon.`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 bg-indigo-800 hover:bg-indigo-700 text-white rounded-lg active:scale-95 transition-all cursor-pointer"
                            title="WhatsApp reminder"
                          >
                            <MessageSquare className="w-3 h-3" />
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

        {/* ──────────────────────────────────────────────────────────────────────────
            CHRONOLOGICAL LEDGER TIMELINE
            ────────────────────────────────────────────────────────────────────────── */}
        <div className="space-y-3 pt-2">
          {/* Header & Type Filter */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-white flex items-center gap-1.5">
              <span>Ledger Timeline</span>
              <span className="text-xs text-slate-400 font-normal">
                ({filteredList.length})
              </span>
            </h3>

            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-0.5 text-[11px] font-bold">
              <button
                onClick={() => setTypeFilter('ALL')}
                className={`px-2 py-1 rounded-lg transition-all ${typeFilter === 'ALL'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white'
                  }`}
              >
                All
              </button>
              <button
                onClick={() => setTypeFilter('CHARGES')}
                className={`px-2 py-1 rounded-lg transition-all ${typeFilter === 'CHARGES'
                  ? 'bg-slate-800 text-rose-300'
                  : 'text-slate-400 hover:text-white'
                  }`}
              >
                Groceries
              </button>
              <button
                onClick={() => setTypeFilter('PAYMENTS')}
                className={`px-2 py-1 rounded-lg transition-all ${typeFilter === 'PAYMENTS'
                  ? 'bg-slate-800 text-emerald-300'
                  : 'text-slate-400 hover:text-white'
                  }`}
              >
                Payments
              </button>
            </div>
          </div>

          {/* Date to Date Filter Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">FROM</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="text-xs font-bold text-white bg-transparent outline-none cursor-pointer"
                  />
                </div>

                <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">TO</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="text-xs font-bold text-white bg-transparent outline-none cursor-pointer"
                  />
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setQuickRange('TODAY')}
                    className={`px-2 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${startDate && startDate === endDate && startDate === new Date().toISOString().slice(0, 10)
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickRange('THIS_MONTH')}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold text-[11px] transition-all cursor-pointer"
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickRange('LAST_MONTH')}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold text-[11px] transition-all cursor-pointer"
                  >
                    Last Month
                  </button>
                  {(startDate || endDate || typeFilter !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => { setStartDate(''); setEndDate(''); setTypeFilter('ALL'); }}
                      className="px-2 py-1 text-red-400 hover:text-red-300 font-bold text-[11px] transition-all cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Filtered Range Debits & Credits Totals */}
              <div className="flex items-center gap-3 font-mono text-[11px]">
                <span className="text-rose-400 font-bold">
                  Charges: +BD {filteredChargesTotal.toFixed(3)}
                </span>
                <span className="text-emerald-400 font-bold">
                  Paid: -BD {filteredPaymentsTotal.toFixed(3)}
                </span>
              </div>
            </div>
          </div>

          {/* Filter Notice */}
          {selectedMemberFilter && (
            <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl px-3 py-2 flex items-center justify-between text-xs text-indigo-300">
              <span>
                Filtering by Member:{' '}
                <strong>
                  {messGroup?.members.find((m) => m.id === selectedMemberFilter)?.name}
                </strong>
              </span>
              <button
                onClick={() => setSelectedMemberFilter(null)}
                className="text-[11px] underline font-bold"
              >
                Reset
              </button>
            </div>
          )}

          {/* Timeline Feed */}
          {filteredList.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">
              No transactions found for the selected filter.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredList.map((entry) => {
                const isPayment =
                  entry.type === 'PAYMENT' ||
                  entry.paymentType === 'PAYMENT' ||
                  (entry.raw_amount !== undefined && entry.raw_amount < 0);

                const isWriteOff = entry.type === 'WRITE_OFF';
                const isExpanded = expandedEntryId === entry.id;
                const items = entryItemsMap[entry.id] || [];
                const isLoadingItems = loadingItemsId === entry.id;

                return (
                  <div
                    key={entry.id}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden transition-all shadow-xs"
                  >
                    <div
                      onClick={() => toggleExpandEntry(entry)}
                      className="p-3.5 flex items-center justify-between cursor-pointer select-none active:bg-slate-850"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isPayment
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : isWriteOff
                              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            }`}
                        >
                          {isPayment ? (
                            <ArrowDownLeft className="w-5 h-5" />
                          ) : isWriteOff ? (
                            <ShieldCheck className="w-5 h-5" />
                          ) : (
                            <ShoppingBag className="w-5 h-5" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-bold text-white truncate leading-tight">
                              {entry.reference || entry.invoiceNo || 'Store Purchase'}
                            </p>
                            {((entry as any).messName || (entry as any).walletName) && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                🥘 {(entry as any).messName || (entry as any).walletName}
                                {(entry as any).member_count ? ` (1/${(entry as any).member_count})` : ''}
                              </span>
                            )}
                            {(entry as any).group_total && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                                Total: BD {Number((entry as any).group_total).toFixed(3)}
                              </span>
                            )}
                            {entry.memberName && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                👤 Shopper: {entry.memberName}
                              </span>
                            )}
                            {entry.type === 'DEPOSIT_DEFERRED' && (
                              <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                CARD DEPOSIT (DUE)
                              </span>
                            )}
                            {entry.type === 'DEPOSIT_COLLECTED' && (
                              <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                DEPOSIT COLLECTED (HELD)
                              </span>
                            )}
                            {entry.type === 'DEPOSIT_REFUND' && (
                              <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                DEPOSIT REFUNDED
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {entry.formattedDate} • {entry.formattedTime}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex items-center gap-2">
                        <div>
                          <p
                            className={`text-sm font-black font-mono ${isPayment
                              ? 'text-emerald-400'
                              : isWriteOff
                                ? 'text-purple-400'
                                : 'text-rose-400'
                              }`}
                          >
                            {isPayment ? '-' : '+'}BD {entry.amount.toFixed(3)}
                          </p>
                          {entry.runningBalance !== undefined && (
                            <p className="text-[10px] text-slate-400 font-mono">
                              Bal: BD {entry.runningBalance.toFixed(3)}
                            </p>
                          )}
                        </div>
                        <div className={`w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180 bg-slate-700 text-white' : ''}`}>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>

                    {/* Expandable Itemized Breakdown Container ("Transaction of Each and Everything") */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 bg-slate-950/70 border-t border-slate-800 text-xs font-mono space-y-2.5 animate-in fade-in duration-200">
                        {!isPayment && !isWriteOff && (
                          <>
                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider pt-2 pb-1 border-b border-slate-800">
                              <span className="flex items-center gap-1 text-emerald-400">
                                <Receipt className="w-3.5 h-3.5" />
                                <span>Purchased Items & Quantities</span>
                              </span>
                              <span className="text-[10px] text-slate-500">NBR 10% VAT</span>
                            </div>

                            {isLoadingItems ? (
                              <div className="py-3 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
                                <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                                <span>Loading bill details...</span>
                              </div>
                            ) : items.length > 0 ? (
                              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                                {items.map((it, idx) => (
                                  <div key={it.id || idx} className="p-2 rounded-xl bg-slate-900 border border-slate-800 flex items-start justify-between gap-2">
                                    <div className="min-w-0 pr-2">
                                      <p className="font-bold text-white text-xs">{it.name || it.productName || 'Store Item'}</p>
                                      {it.nameAr && <p className="text-[10px] text-slate-400">{it.nameAr}</p>}
                                      <p className="text-[10px] text-slate-500 font-mono">
                                        {Number(it.quantity || it.qty || 1)}x @ BD {Number(it.price || it.priceAtSale || 0).toFixed(3)}
                                      </p>
                                    </div>
                                    <span className="font-bold text-emerald-400 text-xs">
                                      BD {Number(it.total || it.total_price || (Number(it.quantity || 1) * Number(it.price || 0))).toFixed(3)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs">
                                General Store Purchase • BD {entry.amount.toFixed(3)}
                              </div>
                            )}

                            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] space-y-1">
                              <div className="flex justify-between text-slate-400">
                                <span>Subtotal (Excl. VAT)</span>
                                <span>BD {(entry.amount / 1.10).toFixed(3)}</span>
                              </div>
                              <div className="flex justify-between text-slate-400">
                                <span>VAT (10%)</span>
                                <span>BD {(entry.amount - (entry.amount / 1.10)).toFixed(3)}</span>
                              </div>
                              <div className="flex justify-between font-bold text-white pt-1 border-t border-slate-800">
                                <span>Total Bill</span>
                                <span className="text-emerald-400">BD {entry.amount.toFixed(3)}</span>
                              </div>
                            </div>
                          </>
                        )}

                        {isPayment && (
                          <div className="pt-2 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>BenefitPay / Counter Settlement Verified</span>
                            </div>
                            <p className="text-[11px] text-slate-300">
                              Payment reference: #{entry.reference || entry.id}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ──────────────────────────────────────────────────────────────────────────
            CUSTOMER UTILITIES & ACTION BUTTONS
            ────────────────────────────────────────────────────────────────────────── */}
        <div className="pt-2 space-y-2">
          <button
            type="button"
            onClick={handlePrintStatement}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print 58mm Thermal Slip (طباعة كشف الحساب)</span>
          </button>

          <a
            href="https://wa.me/97333843855?text=Hello%20Askar%20Supermarket%2C%20I%20have%20a%20question%20regarding%20my%20Khata%20account."
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-4 bg-emerald-950/40 border border-emerald-500/30 hover:bg-emerald-900/40 active:scale-95 text-emerald-300 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Contact Store Cashier on WhatsApp (خدمة العملاء)</span>
          </a>
        </div>

        {/* FOOTER AUDIT NOTE */}
        <footer className="text-center pt-4 pb-8 space-y-1 text-[11px] text-slate-400">
          <p>Layali Supermarket Enterprise Cloud • Continuous Ledger Audit</p>
          <p className="font-mono text-[10px]">
            Encrypted Edge Ledger • Synced with Bahrain Fawri+ Payment Gateway
          </p>
        </footer>
      </main>

      {/* ──────────────────────────────────────────────────────────────────────────
          BENEFITPAY INSTANT SETTLEMENT MODAL SHEET
          ────────────────────────────────────────────────────────────────────────── */}
      {isPayModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom-6 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Settle with BenefitPay</h3>
                  <p className="text-[11px] text-slate-400 font-arabic">الدفع عبر تطبيق بنفت بي</p>
                </div>
              </div>
              <button
                onClick={() => setIsPayModalOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Amount Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Select Amount to Pay (دينار بحريني)
              </label>

              <div className="grid grid-cols-3 gap-2">
                {isMessView ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setCustomPayAmount(messEqualShare.toFixed(3))}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${customPayAmount === messEqualShare.toFixed(3)
                        ? 'bg-emerald-600 text-slate-950 border-emerald-400 shadow-md font-black'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                        }`}
                    >
                      My Share (BD {messEqualShare.toFixed(3)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomPayAmount(messTotalBalance.toFixed(3))}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${customPayAmount === messTotalBalance.toFixed(3)
                        ? 'bg-emerald-600 text-slate-950 border-emerald-400 shadow-md font-black'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                        }`}
                    >
                      Camp Full (BD {messTotalBalance.toFixed(3)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomPayAmount('10.000')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${customPayAmount === '10.000'
                        ? 'bg-emerald-600 text-slate-950 border-emerald-400 shadow-md font-black'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                        }`}
                    >
                      BD 10.000
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setCustomPayAmount(displayOutstanding.toFixed(3))}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${customPayAmount === displayOutstanding.toFixed(3)
                        ? 'bg-emerald-600 text-slate-950 border-emerald-400 shadow-md font-black'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                        }`}
                    >
                      Full (BD {displayOutstanding.toFixed(3)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomPayAmount('10.000')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${customPayAmount === '10.000'
                        ? 'bg-emerald-600 text-slate-950 border-emerald-400 shadow-md font-black'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                        }`}
                    >
                      BD 10.000
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomPayAmount('5.000')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${customPayAmount === '5.000'
                        ? 'bg-emerald-600 text-slate-950 border-emerald-400 shadow-md font-black'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                        }`}
                    >
                      BD 5.000
                    </button>
                  </>
                )}
              </div>

              {/* Custom Input */}
              <div className="relative mt-2">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                  BD
                </span>
                <input
                  type="number"
                  step="0.001"
                  min="0.1"
                  value={customPayAmount}
                  onChange={(e) => setCustomPayAmount(e.target.value)}
                  placeholder="Enter custom amount"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-white text-base font-mono font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Fawri+ QR Code for Scanning From Another Phone */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Or Scan with BenefitPay Fawri+
              </span>
              <div className="bg-white p-2.5 rounded-xl shadow-lg">
                <QRCodeSVG
                  value={generateBenefitPayPayload(
                    parseFloat(customPayAmount || '0'),
                    `KHATA-${customer.id}-${Date.now().toString().slice(-4)}`,
                    getStoredBenefitPayConfig()
                  )}
                  size={120}
                  level="M"
                />
              </div>
              <div className="text-center">
                <p className="text-[11px] font-bold text-white">
                  {getStoredBenefitPayConfig().merchantName || 'LAYALI SUPERMARKET'}
                </p>
                <p className="text-[10px] font-mono text-emerald-400">
                  {getStoredBenefitPayConfig().accountType === 'MOBILE_FAWRI'
                    ? `Fawri+ Mobile: ${getStoredBenefitPayConfig().mobileNumber || ''}`
                    : `Merchant ID: ${getStoredBenefitPayConfig().merchantId || ''}`}
                </p>
              </div>
              <p className="text-[10px] text-slate-400 font-arabic text-center">
                افتح تطبيق بنفت بي ووجّه الكاميرا لدفع المبلغ المحدد
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                disabled={isSubmittingPay || !parseFloat(customPayAmount)}
                onClick={() => handleBenefitPaySettlement(parseFloat(customPayAmount))}
                className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50 text-slate-950 font-black rounded-xl text-sm shadow-xl shadow-emerald-950/60 flex items-center justify-center gap-2 transition-all"
              >
                {isSubmittingPay ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Settlement...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 fill-slate-950" />
                    <span>
                      Confirm & Pay BD {parseFloat(customPayAmount || '0').toFixed(3)} Now
                    </span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsPayModalOpen(false)}
                className="w-full py-2 text-xs font-bold text-slate-400 hover:text-white transition-all text-center"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Book Balance Modal */}
      {showBookBalanceModal && customer && (
        <AddCustomerBookBalanceModal
          customer={{
            id: customer.id,
            name: customer.name,
            phone: customer.phone || undefined,
            cpr: customer.cpr || undefined,
            balance: Number(currentBalance || 0),
            currentBalance: Number(currentBalance || 0)
          }}
          apiBase={apiBase}
          onClose={() => setShowBookBalanceModal(false)}
          onSuccess={() => {
            setShowBookBalanceModal(false);
            fetchStatement();
          }}
        />
      )}
    </div>
  );
}
