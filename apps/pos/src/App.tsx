import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Search, 
  UserPlus, 
  Send, 
  Calendar, 
  Printer, 
  X, 
  LayoutDashboard, 
  Receipt, 
  ShoppingBag, 
  BarChart3, 
  Settings, 
  Plus, 
  TrendingUp, 
  DollarSign, 
  AlertTriangle,
  Clock,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Paperclip,
  LineChart,
  FolderOpen
} from 'lucide-react';
import { api } from './api';

type TabType = 'DASHBOARD' | 'PARTIES' | 'INVOICES' | 'PURCHASES' | 'REPORTS' | 'SETTINGS' | 'SALE_SCREEN' | 'PAYMENT_IN_SCREEN';

interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  currentDue: number;
  transactions?: any[];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('DASHBOARD');

  // Business Profile (Bahrain Default)
  const [storeSettings, setStoreSettings] = useState({
    name: 'LAYALI COLD STORE',
    phone: '+973 3912 3456',
    address: 'Seef Mall, Ground Floor, Manama, Kingdom of Bahrain',
    crNumber: 'CR-104928-1',
    benefitPayNumber: '+973 3912 3456'
  });

  // Global Data States
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalReceivable, setTotalReceivable] = useState(0);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>({
    totalReceivable: 0,
    totalSales: 0,
    totalPurchases: 0,
    customerCount: 0,
    invoiceCount: 0,
    recentTxns: [],
  });

  // Parties Tab States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'DUE' | 'ADVANCE'>('ALL');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Calendar / Date-to-Date Ledger Filter States
  const [ledgerStartDate, setLedgerStartDate] = useState('');
  const [ledgerEndDate, setLedgerEndDate] = useState('');

  // Quick Party Modal State
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '' });

  // Ledger Entry Modal
  const [txnModalOpen, setTxnModalOpen] = useState(false);
  const [txnType] = useState<'YOU_GAVE' | 'YOU_GOT'>('YOU_GAVE');
  const [txnAmount, setTxnAmount] = useState('');
  const [txnNote, setTxnNote] = useState('');

  // Payment-In Screen States
  const [piCustomerId, setPiCustomerId] = useState('');
  const [piPartyName, setPiPartyName] = useState('');
  const [piPaymentType, setPiPaymentType] = useState('Cash');
  const [piAmount, setPiAmount] = useState('');
  const [piDescription, setPiDescription] = useState('');
  const [piReceiptNo, setPiReceiptNo] = useState('11572');
  const [piCustomerSearch, setPiCustomerSearch] = useState('');
  const [piDropdownOpen, setPiDropdownOpen] = useState(false);
  const piDropdownRef = useRef<HTMLDivElement>(null);

  // Vyapar Manual Sale Screen States
  const [saleTabs, setSaleTabs] = useState<string[]>(['Sale #1']);
  const [activeSaleTab, setActiveSaleTab] = useState('Sale #1');
  const [invPaymentType, setInvPaymentType] = useState<'CASH' | 'CREDIT'>('CASH');
  const [invPartyName, setInvPartyName] = useState('');
  const [invPartyPhone, setInvPartyPhone] = useState('');
  const [invCustomerId, setInvCustomerId] = useState('');
  const [manualBillTotal, setManualBillTotal] = useState('');
  const [billRemarks, setBillRemarks] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('327587');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceTime] = useState('09:34 AM');
  const [paymentTerms, setPaymentTerms] = useState('Due on Receipt');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [termsText, setTermsText] = useState('Thanks for doing business with us!');
  const [noOfCopies, setNoOfCopies] = useState('1');

  // Refs for shortcuts (Alt+T for total, Alt+N for saving)
  const totalInputRef = useRef<HTMLInputElement>(null);
  const saleSaveRef = useRef<HTMLButtonElement>(null);
  const paymentInSaveRef = useRef<HTMLButtonElement>(null);

  // Customer Combobox State
  const [customerSearchInput, setCustomerSearchInput] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Modals & Last Invoice State for Alt+P
  const [createPurchaseOpen, setCreatePurchaseOpen] = useState(false);
  const [newPurchase, setNewPurchase] = useState({ vendorName: '', amount: '', billNo: '', note: '' });
  const [viewInvoice, setViewInvoice] = useState<any | null>(null);
  const [lastInvoice, setLastInvoice] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  // Backup Trigger State Ref (prevents multiple runs per session)
  const autoBackupAttempted = useRef<boolean>(false);

  // Currency Formatter Helper (3 decimal places for Fils)
  const formatBHD = (val: number | string) => {
    const num = Number(val) || 0;
    return `BD ${num.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setCustomerDropdownOpen(false);
      }
      if (piDropdownRef.current && !piDropdownRef.current.contains(event.target as Node)) {
        setPiDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global Shortcuts: Alt + S (Sale), Alt + I (Payment-In), Alt + T (Total Focus), Alt + N (Save), Alt + P (Print Receipt)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        setActiveTab('SALE_SCREEN');
      }
      if (e.altKey && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        setActiveTab('PAYMENT_IN_SCREEN');
      }
      if (e.altKey && (e.key === 't' || e.key === 'T')) {
        if (activeTab === 'SALE_SCREEN' && totalInputRef.current) {
          e.preventDefault();
          totalInputRef.current.focus();
        }
      }
      if (e.altKey && (e.key === 'n' || e.key === 'N')) {
        if (activeTab === 'SALE_SCREEN' && saleSaveRef.current) {
          e.preventDefault();
          saleSaveRef.current.click();
        } else if (activeTab === 'PAYMENT_IN_SCREEN' && paymentInSaveRef.current) {
          e.preventDefault();
          paymentInSaveRef.current.click();
        }
      }
      if (e.altKey && (e.key === 'p' || e.key === 'P')) {
        if (activeTab === 'SALE_SCREEN' || activeTab === 'PAYMENT_IN_SCREEN') {
          e.preventDefault();
          window.print();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab]);

  // Daily Ledger Snapshot Auto-Backup Logic
  const handleAutoBackupCheck = async (partiesList: any[], recentActivities: any[]) => {
    if (autoBackupAttempted.current || !partiesList || partiesList.length === 0) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const lastSaved = localStorage.getItem('last_ledger_backup_date');

    if (lastSaved === todayStr) return;

    if ((window as any).backupAPI?.saveDailyBackup) {
      autoBackupAttempted.current = true;
      try {
        const result = await (window as any).backupAPI.saveDailyBackup({
          dateKey: todayStr,
          payload: {
            exportedAt: new Date().toISOString(),
            store: storeSettings.name,
            partiesLedger: partiesList,
            recentActivities: recentActivities,
          },
        });

        if (result?.success) {
          localStorage.setItem('last_ledger_backup_date', todayStr);
          console.log('[AutoBackup] Saved daily snapshot to:', result.filePath);
        } else {
          autoBackupAttempted.current = false;
        }
      } catch (err) {
        console.error('[AutoBackup] Error saving file:', err);
        autoBackupAttempted.current = false;
      }
    }
  };

  // Sync Data with Central Backend
  const refreshAllData = async () => {
    try {
      const [ovRes, custRes, invRes, purRes, profileRes] = await Promise.all([
        api.get('/analytics/overview').catch(() => ({ data: { recentTxns: [] } })),
        api.get('/customers').catch(() => ({ data: { customers: [], totalReceivable: 0 } })),
        api.get('/invoices').catch(() => ({ data: [] })),
        api.get('/purchases').catch(() => ({ data: [] })),
        api.get('/store-profile').catch(() => null),
      ]);

      const loadedCustomers = Array.isArray(custRes.data?.customers) ? custRes.data.customers : Array.isArray(custRes.data) ? custRes.data : [];
      const loadedActivities = Array.isArray(ovRes.data?.recentTxns) ? ovRes.data.recentTxns : Array.isArray(ovRes.data) ? ovRes.data : [];

      setAnalytics(ovRes.data || { totalReceivable: 0, totalSales: 0, totalPurchases: 0, customerCount: 0, invoiceCount: 0, recentTxns: [] });
      setCustomers(loadedCustomers);
      setTotalReceivable(custRes.data?.totalReceivable || 0);
      setInvoices(Array.isArray(invRes.data) ? invRes.data : []);
      setPurchases(Array.isArray(purRes.data) ? purRes.data : []);

      if (profileRes?.data) {
        setStoreSettings((prev) => ({
          ...prev,
          name: profileRes.data.name || prev.name,
          phone: profileRes.data.phone || prev.phone,
          address: profileRes.data.address || prev.address,
          crNumber: profileRes.data.gstin || prev.crNumber,
          benefitPayNumber: profileRes.data.upiId || prev.benefitPayNumber,
        }));
      }

      if (Array.isArray(invRes.data) && invRes.data.length > 0) {
        setInvoiceNumber(String(327580 + invRes.data.length + 1));
      }

      if (selectedCustomer) {
        const refreshedCust = await api.get(`/customers/${selectedCustomer.id}`).catch(() => null);
        if (refreshedCust?.data) {
          setSelectedCustomer(refreshedCust.data);
        }
      }

      // Check and write daily backup
      handleAutoBackupCheck(loadedCustomers, loadedActivities);
    } catch (err) {
      console.error('API Error connecting to backend', err);
    }
  };

  useEffect(() => {
    refreshAllData();
  }, []);

  const handleSelectCustomer = async (c: Customer) => {
    try {
      const res = await api.get(`/customers/${c.id}`);
      setSelectedCustomer(res.data);
      setLedgerStartDate('');
      setLedgerEndDate('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectSaleCustomer = (c: Customer) => {
    setInvCustomerId(c.id);
    setInvPartyName(c.name);
    setInvPartyPhone(c.phone);
    setCustomerSearchInput(c.name);
    setCustomerDropdownOpen(false);
  };

  const handleSelectPaymentInCustomer = (c: Customer) => {
    setPiCustomerId(c.id);
    setPiPartyName(c.name);
    setPiCustomerSearch(c.name);
    setPiDropdownOpen(false);
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/customers', newCustomer);
      const created = res.data?.customer;
      setNewCustomer({ name: '', phone: '', address: '' });
      setAddCustomerOpen(false);
      await refreshAllData();

      if (created) {
        handleSelectSaleCustomer(created);
        handleSelectPaymentInCustomer(created);
      }
    } catch (err) {
      alert('Error creating party');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !txnAmount) return;
    setLoading(true);
    try {
      await api.post('/transactions', {
        customerId: selectedCustomer.id,
        type: txnType,
        amount: Number(txnAmount),
        note: txnNote,
      });
      setTxnAmount('');
      setTxnNote('');
      setTxnModalOpen(false);
      refreshAllData();
    } catch (err) {
      alert('Transaction error');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePaymentIn = async () => {
    const amountNum = Number(piAmount);
    if (!piCustomerId) {
      return alert('Please select a party/customer.');
    }
    if (!piAmount || isNaN(amountNum) || amountNum <= 0) {
      return alert('Please enter a valid received amount (BD).');
    }

    setLoading(true);
    try {
      await api.post('/transactions', {
        customerId: piCustomerId,
        type: 'YOU_GOT',
        amount: amountNum,
        note: piDescription ? `Payment-In (${piPaymentType}): ${piDescription}` : `Payment-In (${piPaymentType})`,
      });
      alert('Payment-In recorded successfully!');
      setPiAmount('');
      setPiDescription('');
      setPiCustomerId('');
      setPiPartyName('');
      setPiCustomerSearch('');
      setActiveTab('DASHBOARD');
      refreshAllData();
    } catch (err) {
      alert('Failed to record payment-in');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveManualSaleInvoice = async () => {
    const parsedTotal = Number(manualBillTotal);
    if (!manualBillTotal || isNaN(parsedTotal) || parsedTotal <= 0) {
      return alert('Please enter a valid Total Amount (BD).');
    }
    if (invPaymentType === 'CREDIT' && !invCustomerId) {
      return alert('Customer account is required for Credit (Udhar) transactions.');
    }

    setLoading(true);
    try {
      const res = await api.post('/invoices', {
        partyName: invPartyName || (invPaymentType === 'CREDIT' ? 'Credit Party' : 'Cash Customer'),
        partyPhone: invPartyPhone,
        customerId: invCustomerId || undefined,
        items: [{ name: billRemarks || 'General Counter Sale', qty: 1, price: parsedTotal, total: parsedTotal }],
        subtotal: parsedTotal,
        tax: 0,
        grandTotal: parsedTotal,
        paymentType: invPaymentType,
      });

      alert('Sale invoice generated successfully!');
      
      // Store last invoice for Alt+P thermal printing
      setLastInvoice(res.data.invoice);

      // Reset billing workspace for the next customer
      setManualBillTotal('');
      setBillRemarks('');
      setInvPartyName('');
      setInvPartyPhone('');
      setInvCustomerId('');
      setCustomerSearchInput('');
      setInvPaymentType('CASH');

      const todayStr = new Date().toISOString().split('T')[0];
      setInvoiceDate(todayStr);
      setDueDate(todayStr);
      setInvoiceNumber((prev) => String(Number(prev) + 1));

      await refreshAllData();
    } catch (err) {
      alert('Failed to process sale invoice');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/purchases', newPurchase);
      setNewPurchase({ vendorName: '', amount: '', billNo: '', note: '' });
      setCreatePurchaseOpen(false);
      refreshAllData();
    } catch (err) {
      alert('Failed saving purchase');
    } finally {
      setLoading(false);
    }
  };

  const sendWhatsAppReminder = (c: Customer, tone: 'GENTLE' | 'FIRM' = 'GENTLE') => {
    const amount = Math.abs(Number(c.currentDue)).toFixed(3);
    const cleanPhone = c.phone.replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.length === 8 ? '973' + cleanPhone : cleanPhone;

    let message = '';
    if (tone === 'GENTLE') {
      message =
        'Dear ' + c.name + ',\n\n' +
        'Greetings from *' + storeSettings.name + '* (Bahrain)!\n\n' +
        'This is a friendly reminder regarding your pending credit ledger balance of *BD ' + amount + '*.\n\n' +
        'Kindly settle via BenefitPay at your convenience:\n' +
        '📲 *BenefitPay Mobile:* ' + storeSettings.benefitPayNumber + '\n\n' +
        'Thank you for choosing Layali!';
    } else {
      message =
        '⚠️ *URGENT PAYMENT REMINDER — ' + storeSettings.name.toUpperCase() + '*\n\n' +
        'Dear ' + c.name + ',\n\n' +
        'This is an urgent notice regarding your overdue credit balance of *BD ' + amount + '*. Please arrange payment today to maintain an active credit account.\n\n' +
        '📲 *BenefitPay Mobile:* ' + storeSettings.benefitPayNumber + '\n\n' +
        'Please share the transfer screenshot once done. Thank you!';
    }

    window.open('https://wa.me/' + formattedPhone + '?text=' + encodeURIComponent(message), '_blank');
  };

  const safeCustomers = Array.isArray(customers) ? customers : [];
  const safeInvoices = Array.isArray(invoices) ? invoices : [];
  const safePurchases = Array.isArray(purchases) ? purchases : [];

  const filtered = safeCustomers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery);
    if (!matchesSearch) return false;

    if (filterType === 'DUE') return Number(c.currentDue) > 0;
    if (filterType === 'ADVANCE') return Number(c.currentDue) < 0;
    return true;
  });

  const saleComboboxMatches = safeCustomers.filter(
    (c) =>
      c.name.toLowerCase().includes(customerSearchInput.toLowerCase()) ||
      c.phone.includes(customerSearchInput)
  );

  const piComboboxMatches = safeCustomers.filter(
    (c) =>
      c.name.toLowerCase().includes(piCustomerSearch.toLowerCase()) ||
      c.phone.includes(piCustomerSearch)
  );

  // Calendar Date-to-Date filtered transactions for selected customer
  const rawTransactions = Array.isArray(selectedCustomer?.transactions) ? selectedCustomer.transactions : [];
  const filteredTransactions = rawTransactions.filter((t) => {
    const tDateOnly = t.createdAt.split('T')[0];
    if (ledgerStartDate && tDateOnly < ledgerStartDate) return false;
    if (ledgerEndDate && tDateOnly > ledgerEndDate) return false;
    return true;
  });

  const periodTotalGave = filteredTransactions
    .filter((t) => t.type === 'YOU_GAVE')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const periodTotalGot = filteredTransactions
    .filter((t) => t.type === 'YOU_GOT')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const safeRecentTxns = Array.isArray(analytics?.recentTxns) ? analytics.recentTxns : [];

  return (
    <div className="h-screen w-screen bg-slate-100 flex overflow-hidden font-sans text-slate-800 antialiased selection:bg-rose-600 selection:text-white">
      
      {/* GLOBAL 58MM THERMAL PRINTER STYLING */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #print-receipt-container, #print-receipt-container * {
            visibility: visible !important;
          }
          #print-receipt-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 58mm !important;
            margin: 0 !important;
            padding: 2mm !important;
            font-family: 'Courier New', Courier, monospace !important;
            font-size: 11px !important;
            line-height: 1.2 !important;
            color: #000 !important;
            background: #fff !important;
          }
          @page {
            size: 58mm auto;
            margin: 0mm;
          }
        }
      `}</style>

      {/* HIDDEN THERMAL RECEIPT CONTAINER FOR ALT+P PRINTING */}
      <div id="print-receipt-container" className="hidden print:block bg-white text-black p-2 font-mono text-[11px] space-y-2">
        <div className="text-center pb-1 border-b border-black">
          <div className="font-bold text-sm">{storeSettings.name}</div>
          <div>{storeSettings.address}</div>
          <div>Tel: {storeSettings.phone} | CR: {storeSettings.crNumber}</div>
        </div>

        {activeTab === 'PAYMENT_IN_SCREEN' ? (
          <>
            <div className="text-center font-bold text-xs uppercase py-1">--- PAYMENT-IN RECEIPT ---</div>
            <div className="flex justify-between text-[10px]">
              <span>Receipt #: {piReceiptNo}</span>
              <span>{invoiceDate}</span>
            </div>
            <div>Customer: {piPartyName || safeCustomers.find(c => c.id === piCustomerId)?.name || 'Walk-in Customer'}</div>
            <div>Mode: {piPaymentType}</div>
            {piDescription && <div>Note: {piDescription}</div>}
            <div className="border-t border-b border-black py-1 my-1 flex justify-between font-bold text-xs">
              <span>AMOUNT RECEIVED:</span>
              <span>{formatBHD(piAmount)}</span>
            </div>
          </>
        ) : activeTab === 'PARTIES' && selectedCustomer ? (
          <>
            <div className="text-center font-bold text-xs uppercase py-1">--- PARTY LEDGER STATEMENT ---</div>
            <div>Party: {selectedCustomer.name}</div>
            <div>Phone: {selectedCustomer.phone}</div>
            {ledgerStartDate && ledgerEndDate && (
              <div className="text-[10px]">Period: {ledgerStartDate} to {ledgerEndDate}</div>
            )}
            <div className="border-t border-b border-black py-1 my-1 space-y-1">
              {filteredTransactions.map((t, idx) => (
                <div key={idx} className="text-[10px]">
                  <div className="flex justify-between">
                    <span>{new Date(t.createdAt).toLocaleDateString()} ({t.type === 'YOU_GAVE' ? 'SALE' : 'PAY'})</span>
                    <span className={t.type === 'YOU_GAVE' ? 'font-bold' : ''}>{t.type === 'YOU_GAVE' ? '-' : '+'}{formatBHD(t.amount)}</span>
                  </div>
                  {t.note && <div className="text-[9px] text-gray-600 truncate">Ref: {t.note}</div>}
                </div>
              ))}
            </div>
            <div className="text-[10px] space-y-0.5 pt-1">
              <div className="flex justify-between"><span>Total Given (Debit):</span><span>{formatBHD(periodTotalGave)}</span></div>
              <div className="flex justify-between"><span>Total Got (Credit):</span><span>{formatBHD(periodTotalGot)}</span></div>
              <div className="flex justify-between font-bold border-t border-black pt-1">
                <span>NET BALANCE DUE:</span>
                <span>{formatBHD(selectedCustomer.currentDue)}</span>
              </div>
            </div>
          </>
        ) : lastInvoice ? (
          <>
            <div className="flex justify-between text-[10px]">
              <span>Bill #: {lastInvoice.invoiceNo}</span>
              <span>{new Date(lastInvoice.createdAt).toLocaleDateString()}</span>
            </div>
            <div>Customer: {lastInvoice.partyName}</div>
            <div>Type: {lastInvoice.paymentType === 'CREDIT' ? 'Credit (Udhar)' : 'Cash'}</div>

            <div className="border-t border-b border-black py-1 my-1 space-y-1">
              {JSON.parse(lastInvoice.itemsJson || '[]').map((it: any, i: number) => (
                <div key={i} className="flex justify-between">
                  <span className="truncate max-w-[32mm]">{it.name}</span>
                  <span>{formatBHD(it.total)}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between font-bold text-xs pt-1">
              <span>TOTAL:</span>
              <span>{formatBHD(lastInvoice.grandTotal)}</span>
            </div>
          </>
        ) : (
          <div className="text-center py-4">No active record to print.</div>
        )}

        <div className="text-center pt-2 text-[10px] border-t border-black space-y-1">
          <div>BenefitPay: {storeSettings.benefitPayNumber}</div>
          <div>Thank you for choosing Layali!</div>
        </div>
      </div>

      {/* 1. LEFT NAVIGATION RAIL */}
      <aside className="w-60 bg-slate-950 flex flex-col justify-between text-slate-300 border-r border-slate-800 flex-shrink-0 print:hidden">
        <div>
          <div className="h-16 px-4 bg-slate-950 flex items-center gap-3 border-b border-slate-800/80">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-700 to-rose-500 flex items-center justify-center font-black text-white text-lg tracking-wider shadow-md shadow-rose-950/60">
              L
            </div>
            <div className="min-w-0">
              <div className="font-black text-sm text-white tracking-widest uppercase truncate flex items-center gap-1.5">
                LAYALI <span className="text-[11px] text-rose-400 font-serif">ليالي</span>
              </div>
              <div className="text-[10px] text-slate-400 tracking-tight">Bahrain Retail & Ledger Suite</div>
            </div>
          </div>

          <nav className="p-3 space-y-1 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('DASHBOARD')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition cursor-pointer ${
                activeTab === 'DASHBOARD' ? 'bg-rose-600 text-white font-bold shadow-md' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <LayoutDashboard size={17} /> Dashboard
            </button>

            <button
              onClick={() => setActiveTab('SALE_SCREEN')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition cursor-pointer ${
                activeTab === 'SALE_SCREEN' ? 'bg-blue-600 text-white font-bold shadow-md' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <Receipt size={17} />
              <span>Sale Billing</span>
            </button>

            <button
              onClick={() => setActiveTab('PAYMENT_IN_SCREEN')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition cursor-pointer ${
                activeTab === 'PAYMENT_IN_SCREEN' ? 'bg-emerald-600 text-white font-bold shadow-md' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <ArrowDownLeft size={17} className={activeTab === 'PAYMENT_IN_SCREEN' ? 'text-white' : 'text-emerald-400'} />
              <span>Payment-In</span>
            </button>

            <button
              onClick={() => setActiveTab('PARTIES')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition cursor-pointer ${
                activeTab === 'PARTIES' ? 'bg-rose-600 text-white font-bold shadow-md' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <Users size={17} /> Parties (Ledger)
            </button>

            <button
              onClick={() => setActiveTab('INVOICES')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition cursor-pointer ${
                activeTab === 'INVOICES' ? 'bg-rose-600 text-white font-bold shadow-md' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <FileText size={17} /> Invoices List
            </button>

            <button
              onClick={() => setActiveTab('PURCHASES')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition cursor-pointer ${
                activeTab === 'PURCHASES' ? 'bg-rose-600 text-white font-bold shadow-md' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <ShoppingBag size={17} /> Purchases / Bills
            </button>

            <button
              onClick={() => setActiveTab('REPORTS')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition cursor-pointer ${
                activeTab === 'REPORTS' ? 'bg-rose-600 text-white font-bold shadow-md' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <BarChart3 size={17} /> Financial Reports
            </button>
          </nav>
        </div>

        <div className="p-3 border-t border-slate-800/80">
          <button
            onClick={() => setActiveTab('SETTINGS')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'SETTINGS' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <Settings size={16} /> Store Profile & Settings
          </button>
        </div>
      </aside>

      {/* 2. MAIN WORKSPACE */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {activeTab === 'SALE_SCREEN' ? (
          <div className="flex-1 flex flex-col h-full bg-[#f1f3f6] overflow-y-auto">
            
            {/* Top Tab Strip */}
            <div className="h-10 bg-[#e4e7ec] border-b border-slate-300 flex items-center px-2 gap-1.5 flex-shrink-0 select-none">
              {saleTabs.map((tab) => (
                <div
                  key={tab}
                  className={`h-8 px-4 flex items-center gap-3 text-xs font-medium rounded-t-md cursor-pointer border-t border-x ${
                    activeSaleTab === tab
                      ? 'bg-white border-slate-300 text-slate-800 font-bold shadow-2xs'
                      : 'bg-[#d8dce2] border-transparent text-slate-600 hover:bg-[#e0e4ea]'
                  }`}
                >
                  <span>{tab}</span>
                  <X size={13} className="text-slate-400 hover:text-slate-700" />
                </div>
              ))}

              <button
                onClick={() => {
                  const nextId = `Sale #${saleTabs.length + 1}`;
                  setSaleTabs([...saleTabs, nextId]);
                  setActiveSaleTab(nextId);
                }}
                className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition shadow-xs cursor-pointer ml-1"
                title="Open New Sale Tab"
              >
                <Plus size={15} />
              </button>
            </div>

            {/* Sub-Header */}
            <div className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-6">
                <h2 className="text-lg font-bold text-slate-900">Sale</h2>

                {/* Pill Switch */}
                <div className="flex items-center gap-3 select-none">
                  <span
                    onClick={() => setInvPaymentType('CREDIT')}
                    className={`text-sm font-semibold cursor-pointer transition ${
                      invPaymentType === 'CREDIT' ? 'text-blue-600 font-bold' : 'text-slate-500'
                    }`}
                  >
                    Credit
                  </span>

                  <div
                    role="switch"
                    aria-checked={invPaymentType === 'CASH'}
                    onClick={() => setInvPaymentType((prev) => (prev === 'CREDIT' ? 'CASH' : 'CREDIT'))}
                    className="relative w-12 h-6 bg-blue-100 rounded-full p-0.5 cursor-pointer transition-colors flex items-center"
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-blue-600 shadow-sm transform transition-transform duration-200 ${
                        invPaymentType === 'CASH' ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </div>

                  <span
                    onClick={() => setInvPaymentType('CASH')}
                    className={`text-sm font-semibold cursor-pointer transition ${
                      invPaymentType === 'CASH' ? 'text-blue-600 font-bold' : 'text-slate-500'
                    }`}
                  >
                    Cash
                  </span>
                </div>
              </div>

              {/* Store Selector */}
              <div className="flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-blue-200 text-blue-800 font-bold flex items-center justify-center text-xs">
                  {storeSettings.name.slice(0, 1)}
                </div>
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  {storeSettings.name}
                </span>
                <ChevronDown size={14} className="text-slate-500" />
              </div>
            </div>

            {/* Main Sheet Body */}
            <div className="p-6 space-y-6 max-w-7xl mx-auto w-full flex-1">
              
              <div className="grid grid-cols-12 gap-8 items-start">
                
                {/* Left Customer Combobox */}
                <div className="col-span-7 flex gap-3">
                  <div className="flex-1 relative" ref={customerDropdownRef}>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-3 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search by Name/Phone *"
                        value={customerSearchInput}
                        onFocus={() => setCustomerDropdownOpen(true)}
                        onChange={(e) => {
                          setCustomerSearchInput(e.target.value);
                          setCustomerDropdownOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && saleComboboxMatches.length > 0) {
                            e.preventDefault();
                            handleSelectSaleCustomer(saleComboboxMatches[0]);
                          }
                        }}
                        className={`w-full bg-white border rounded-md pl-9 pr-8 py-2 text-xs text-slate-800 shadow-2xs focus:outline-none focus:border-blue-500 ${
                          invPaymentType === 'CREDIT' && !invCustomerId
                            ? 'border-amber-400 ring-1 ring-amber-300'
                            : 'border-slate-300'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setCustomerDropdownOpen(!customerDropdownOpen)}
                        className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>

                    {customerDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            setCustomerDropdownOpen(false);
                            if (customerSearchInput.trim()) {
                              setNewCustomer((prev) => ({ ...prev, name: customerSearchInput }));
                            }
                            setAddCustomerOpen(true);
                          }}
                          className="w-full px-3.5 py-2.5 text-left text-xs font-bold text-blue-600 hover:bg-blue-50 flex items-center gap-2 transition cursor-pointer bg-blue-50/50"
                        >
                          <UserPlus size={14} />
                          <span>+ Add New Party {customerSearchInput ? `"${customerSearchInput}"` : ''}</span>
                        </button>

                        {saleComboboxMatches.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-400">
                            No parties match "{customerSearchInput}". Click above to add.
                          </div>
                        ) : (
                          saleComboboxMatches.map((c) => {
                            const isSelected = invCustomerId === c.id;
                            return (
                              <div
                                key={c.id}
                                onClick={() => handleSelectSaleCustomer(c)}
                                className={`px-3.5 py-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 text-xs transition ${
                                  isSelected ? 'bg-blue-50/70 font-semibold' : ''
                                }`}
                              >
                                <div>
                                  <div className="font-bold text-slate-800">{c.name}</div>
                                  <div className="text-[11px] text-slate-400">{c.phone}</div>
                                </div>
                                <div className="text-right">
                                  <div className="font-mono text-xs font-bold text-slate-700">
                                    {formatBHD(c.currentDue)}
                                  </div>
                                  <span className="text-[10px] uppercase text-slate-400">
                                    {Number(c.currentDue) > 0 ? 'Due' : 'Clear'}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="Billing Name(Optional)"
                      value={invPartyName}
                      onChange={(e) => setInvPartyName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-700 shadow-2xs focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="Phone No."
                      value={invPartyPhone}
                      onChange={(e) => setInvPartyPhone(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-700 shadow-2xs focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Right Metadata with Interactive Calendars */}
                <div className="col-span-5 space-y-2 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Invoice Number</span>
                    <input
                      type="text"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className="w-48 bg-transparent text-right font-medium text-slate-900 border-b border-slate-300 focus:outline-none focus:border-blue-500 pb-0.5"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Invoice Date</span>
                    <div className="flex items-center gap-2 w-48 justify-end">
                      <input
                        type="date"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        className="text-right bg-transparent border-b border-slate-300 text-slate-900 focus:outline-none pb-0.5 cursor-pointer font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Time</span>
                    <div className="flex items-center gap-2 w-48 justify-end">
                      <span className="text-slate-900">{invoiceTime}</span>
                      <Clock size={14} className="text-slate-400" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Payment Terms</span>
                    <div className="flex items-center gap-1.5 w-48 justify-end">
                      <select
                        value={paymentTerms}
                        onChange={(e) => setPaymentTerms(e.target.value)}
                        className="bg-transparent text-slate-900 focus:outline-none cursor-pointer text-right"
                      >
                        <option value="Due on Receipt">Due on Receipt</option>
                        <option value="Net 7 Days">Net 7 Days</option>
                        <option value="Net 15 Days">Net 15 Days</option>
                        <option value="Net 30 Days">Net 30 Days</option>
                      </select>
                      <ChevronDown size={13} className="text-slate-500" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Due Date</span>
                    <div className="flex items-center gap-2 w-48 justify-end">
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="text-right bg-transparent border-b border-slate-300 text-slate-900 focus:outline-none pb-0.5 cursor-pointer font-mono"
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* Bill Notes */}
              <div className="bg-white border border-slate-300 rounded-md p-3 shadow-2xs">
                <input
                  type="text"
                  placeholder="Optional Bill Notes / Reference..."
                  value={billRemarks}
                  onChange={(e) => setBillRemarks(e.target.value)}
                  className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
                />
              </div>

              {/* Bottom Cards & Manual Total Input */}
              <div className="grid grid-cols-12 gap-8 items-start pt-4">
                
                <div className="col-span-4 bg-white border border-slate-300 rounded-md p-4 space-y-3 shadow-2xs">
                  <h4 className="text-xs font-bold text-slate-800">Terms & Conditions</h4>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Title</label>
                    <div className="border border-slate-300 rounded px-2.5 py-1.5 flex justify-between items-center text-xs text-slate-700">
                      <span>Sale Invoice</span>
                      <ChevronDown size={13} className="text-slate-500" />
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    value={termsText}
                    onChange={(e) => setTermsText(e.target.value)}
                    className="w-full border border-slate-300 rounded p-2 text-xs text-slate-700 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>

                <div className="col-span-4 space-y-3 pt-2">
                  <div className="flex gap-3">
                    <button className="flex-1 py-2 px-3 border border-slate-300 rounded bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 flex items-center justify-center gap-1.5 shadow-2xs">
                      <FileText size={13} className="text-slate-400" /> + ADD DESCRIPTION
                    </button>
                    
                    <div className="flex-1 relative">
                      <select
                        value={noOfCopies}
                        onChange={(e) => setNoOfCopies(e.target.value)}
                        className="w-full py-2 px-3 border border-slate-300 rounded bg-white text-[11px] font-semibold text-slate-600 shadow-2xs focus:outline-none cursor-pointer"
                      >
                        <option value="1">No. of copies: 1</option>
                        <option value="2">No. of copies: 2</option>
                        <option value="3">No. of copies: 3</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button className="flex-1 py-2 px-3 border border-slate-300 rounded bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 flex items-center justify-center gap-1.5 shadow-2xs">
                      <ImageIcon size={13} className="text-slate-400" /> + ADD IMAGE
                    </button>
                    <button className="flex-1 py-2 px-3 border border-slate-300 rounded bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 flex items-center justify-center gap-1.5 shadow-2xs">
                      <Paperclip size={13} className="text-slate-400" /> + ADD DOCUMENT
                    </button>
                  </div>
                </div>

                {/* Manual Total Input */}
                <div className="col-span-4 flex justify-end items-center gap-4 pt-4">
                  <span className="text-base font-bold text-slate-800">Total (BD)</span>
                  <div className="relative">
                    <input
                      ref={totalInputRef}
                      type="number"
                      step="0.001"
                      autoFocus
                      placeholder="0.000"
                      value={manualBillTotal}
                      onChange={(e) => setManualBillTotal(e.target.value)}
                      className="w-60 h-12 bg-white border-2 border-blue-600 rounded-md text-right pr-4 pl-3 text-2xl font-black font-mono text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                </div>

              </div>

            </div>

            {/* Footer Toolbar */}
            <div className="h-16 bg-white border-t border-slate-200 px-6 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('DASHBOARD')}
                  className="p-2 border border-slate-300 rounded-md text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                  title="View Analytics"
                >
                  <LineChart size={18} />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex border border-slate-300 rounded-md overflow-hidden bg-white hover:bg-slate-50">
                  <button
                    onClick={() => window.print()}
                    className="px-4 py-2 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer border-r border-slate-200"
                  >
                    Print (Alt+P)
                  </button>
                  <button className="px-2 py-2 text-slate-500 cursor-pointer">
                    <ChevronDown size={14} />
                  </button>
                </div>

                <button
                  ref={saleSaveRef}
                  onClick={handleSaveManualSaleInvoice}
                  disabled={loading}
                  className="px-9 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save (Alt+N)'}
                </button>
              </div>
            </div>

          </div>
        ) : activeTab === 'PAYMENT_IN_SCREEN' ? (
          <div className="flex-1 flex flex-col h-full bg-[#f1f3f6] overflow-y-auto">
            
            {/* Top Bar */}
            <div className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-bold text-slate-900">Payment-In</h2>
              <div className="flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-blue-200 text-blue-800 font-bold flex items-center justify-center text-xs">
                  {storeSettings.name.slice(0, 1)}
                </div>
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  {storeSettings.name}
                </span>
                <ChevronDown size={14} className="text-slate-500" />
              </div>
            </div>

            {/* Main Form Body */}
            <div className="p-8 max-w-5xl mx-auto w-full flex-1 space-y-6">
              <div className="bg-white border border-slate-300 rounded-xl p-8 shadow-sm grid grid-cols-12 gap-10">
                
                {/* Left Column */}
                <div className="col-span-7 space-y-5">
                  
                  {/* Party Combobox */}
                  <div className="relative" ref={piDropdownRef}>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Party *</label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Select or search party..."
                        value={piCustomerSearch}
                        onFocus={() => setPiDropdownOpen(true)}
                        onChange={(e) => {
                          setPiCustomerSearch(e.target.value);
                          setPiDropdownOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && piComboboxMatches.length > 0) {
                            e.preventDefault();
                            handleSelectPaymentInCustomer(piComboboxMatches[0]);
                          }
                        }}
                        className="w-full bg-white border border-slate-300 rounded-md pl-3 pr-8 py-2 text-xs text-slate-800 shadow-2xs focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setPiDropdownOpen(!piDropdownOpen)}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>

                    {piDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-56 overflow-y-auto divide-y divide-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            setPiDropdownOpen(false);
                            if (piCustomerSearch.trim()) {
                              setNewCustomer((prev) => ({ ...prev, name: piCustomerSearch }));
                            }
                            setAddCustomerOpen(true);
                          }}
                          className="w-full px-3.5 py-2.5 text-left text-xs font-bold text-blue-600 hover:bg-blue-50 flex items-center gap-2 transition cursor-pointer bg-blue-50/50"
                        >
                          <UserPlus size={14} />
                          <span>+ Add New Party {piCustomerSearch ? `"${piCustomerSearch}"` : ''}</span>
                        </button>

                        {piComboboxMatches.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-400">
                            No parties match "{piCustomerSearch}".
                          </div>
                        ) : (
                          piComboboxMatches.map((c) => (
                            <div
                              key={c.id}
                              onClick={() => handleSelectPaymentInCustomer(c)}
                              className="px-3.5 py-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 text-xs transition"
                            >
                              <div>
                                <div className="font-bold text-slate-800">{c.name}</div>
                                <div className="text-[11px] text-slate-400">{c.phone}</div>
                              </div>
                              <div className="text-right font-mono text-xs font-bold text-slate-700">
                                {formatBHD(c.currentDue)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Payment Type */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Payment Type</label>
                    <select
                      value={piPaymentType}
                      onChange={(e) => setPiPaymentType(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="Cash">Cash</option>
                      <option value="BenefitPay">BenefitPay</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Cheque">Cheque</option>
                    </select>
                  </div>

                  <div className="pt-2">
                    <button className="px-4 py-2 border border-slate-300 rounded bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 flex items-center gap-2 shadow-2xs cursor-pointer">
                      <FileText size={14} className="text-slate-400" /> + ADD DESCRIPTION
                    </button>
                    <input
                      type="text"
                      placeholder="Optional note / receipt remarks..."
                      value={piDescription}
                      onChange={(e) => setPiDescription(e.target.value)}
                      className="w-full mt-2 bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-800 focus:outline-none"
                    />
                  </div>

                </div>

                {/* Right Column with Interactive Calendar */}
                <div className="col-span-5 space-y-4 text-xs text-slate-600 pt-2 border-l border-slate-100 pl-8">
                  
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Receipt No</span>
                    <input
                      type="text"
                      value={piReceiptNo}
                      onChange={(e) => setPiReceiptNo(e.target.value)}
                      className="w-36 bg-transparent text-right font-medium text-slate-900 border-b border-slate-300 focus:outline-none pb-0.5"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Date</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        className="text-right bg-transparent border-b border-slate-300 text-slate-900 focus:outline-none pb-0.5 cursor-pointer font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Time</span>
                    <div className="flex items-center gap-2">
                      <span>{invoiceTime}</span>
                      <Clock size={14} className="text-slate-400" />
                    </div>
                  </div>

                  {/* Received Amount Input */}
                  <div className="pt-10">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2">Received (BD)</label>
                    <input
                      type="number"
                      step="0.001"
                      autoFocus
                      placeholder="0.000"
                      value={piAmount}
                      onChange={(e) => setPiAmount(e.target.value)}
                      className="w-full h-12 bg-white border-2 border-emerald-600 rounded-md text-right pr-4 pl-3 text-2xl font-black font-mono text-emerald-700 shadow-sm focus:outline-none"
                    />
                  </div>

                </div>

              </div>
            </div>

            {/* Footer Toolbar */}
            <div className="h-16 bg-white border-t border-slate-200 px-6 flex items-center justify-between flex-shrink-0">
              <div className="flex border border-slate-300 rounded-md overflow-hidden bg-white hover:bg-slate-50">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer border-r border-slate-200"
                >
                  Print (Alt+P)
                </button>
                <button className="px-2 py-2 text-slate-500 cursor-pointer">
                  <ChevronDown size={14} />
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setActiveTab('DASHBOARD')}
                  className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-md text-xs font-bold cursor-pointer hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  ref={paymentInSaveRef}
                  onClick={handleSavePaymentIn}
                  disabled={loading}
                  className="px-9 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save (Alt+N)'}
                </button>
              </div>
            </div>

          </div>
        ) : (
          /* ================= REGULAR WORKSPACE VIEWS ================= */
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-xs print:hidden">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-slate-900 tracking-wide uppercase">
                  {activeTab === 'DASHBOARD' && 'Business Overview'}
                  {activeTab === 'PARTIES' && 'Parties / Customer Khata'}
                  {activeTab === 'INVOICES' && 'Sales Invoices & Billing'}
                  {activeTab === 'PURCHASES' && 'Purchase Inward & Expenses'}
                  {activeTab === 'REPORTS' && 'Financial Reports & Profit'}
                  {activeTab === 'SETTINGS' && 'Store Configuration'}
                </span>
                <span className="text-xs bg-rose-50 border border-rose-200 text-rose-700 px-3 py-1 rounded-full font-bold font-mono">
                  Receivables: {formatBHD(totalReceivable)}
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setActiveTab('PAYMENT_IN_SCREEN')}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <ArrowDownLeft size={14} /> Payment-In
                </button>
                <button
                  onClick={() => setActiveTab('SALE_SCREEN')}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <Plus size={14} /> Sale Invoice
                </button>
                <button
                  onClick={() => setAddCustomerOpen(true)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <UserPlus size={14} className="text-rose-600" /> + Add Party
                </button>
                <button
                  onClick={() => setCreatePurchaseOpen(true)}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Plus size={14} /> + Add Purchase
                </button>
              </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
              {/* DASHBOARD TAB */}
              {activeTab === 'DASHBOARD' && (
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                      <div className="flex justify-between text-slate-500 text-xs font-bold uppercase">
                        <span>Total Sales</span>
                        <TrendingUp size={16} className="text-emerald-600" />
                      </div>
                      <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
                        {formatBHD(analytics.totalSales)}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">{analytics.invoiceCount} invoices generated</div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                      <div className="flex justify-between text-slate-500 text-xs font-bold uppercase">
                        <span>Total Receivable (Udhar)</span>
                        <ArrowUpRight size={16} className="text-rose-600" />
                      </div>
                      <div className="text-2xl font-black text-rose-600 mt-2 font-mono">
                        {formatBHD(analytics.totalReceivable)}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">Across {analytics.customerCount} parties</div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                      <div className="flex justify-between text-slate-500 text-xs font-bold uppercase">
                        <span>Total Purchases</span>
                        <ShoppingBag size={16} className="text-indigo-600" />
                      </div>
                      <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
                        {formatBHD(analytics.totalPurchases)}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">Vendor supplies & stock</div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                      <div className="flex justify-between text-slate-500 text-xs font-bold uppercase">
                        <span>Estimated Net Profit</span>
                        <DollarSign size={16} className="text-emerald-600" />
                      </div>
                      <div className="text-2xl font-black text-emerald-600 mt-2 font-mono">
                        {formatBHD(Number(analytics.totalSales) - Number(analytics.totalPurchases))}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">Sales minus purchases</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-6">
                    <div className="col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                      <h3 className="font-bold text-sm text-slate-900 mb-4">Recent Ledger Activity</h3>
                      <div className="divide-y divide-slate-100">
                        {(!Array.isArray(safeRecentTxns) || safeRecentTxns.length === 0) ? (
                          <div className="py-12 text-center text-slate-400 text-xs">No activity yet.</div>
                        ) : (
                          safeRecentTxns.map((t: any) => (
                            <div key={t.id} className="py-3 flex justify-between items-center text-xs">
                              <div>
                                <span className="font-bold text-slate-800">{t.customer?.name}</span>
                                <span className="text-slate-400 ml-2">({new Date(t.createdAt).toLocaleDateString()})</span>
                                <div className="text-[11px] text-slate-500">{t.note || 'No notes'}</div>
                              </div>
                              <div className={`font-black text-sm font-mono ${t.type === 'YOU_GAVE' ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {t.type === 'YOU_GAVE' ? '-' : '+'}{formatBHD(t.amount)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                      <div>
                        <h3 className="font-bold text-sm text-slate-900 mb-2">Quick Shortcuts</h3>
                        <div className="space-y-2">
                          <button
                            onClick={() => setActiveTab('PAYMENT_IN_SCREEN')}
                            className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl text-xs flex items-center justify-between px-4 cursor-pointer"
                          >
                            <span className="flex items-center gap-2"><ArrowDownLeft size={15} /> Record Payment-In</span>
                          </button>
                          <button
                            onClick={() => setActiveTab('SALE_SCREEN')}
                            className="w-full py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl text-xs flex items-center gap-2 px-4 cursor-pointer"
                          >
                            <Receipt size={15} /> Open Sale Terminal
                          </button>
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl text-xs text-slate-600 space-y-1">
                        <div><b>Store:</b> {storeSettings.name}</div>
                        <div><b>BenefitPay:</b> {storeSettings.benefitPayNumber}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* PARTIES TAB WITH INTERACTIVE CALENDAR FILTER */}
              {activeTab === 'PARTIES' && (
                <div className="flex-1 flex overflow-hidden">
                  <section className="w-80 md:w-96 bg-white border-r border-slate-200 flex flex-col h-full">
                    <div className="p-3.5 border-b border-slate-200 space-y-2.5 bg-slate-50/70">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 uppercase">Parties List</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => (window as any).backupAPI?.openBackupFolder()}
                            className="p-1 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-200 transition"
                            title="Open Local Ledger Backups Folder"
                          >
                            <FolderOpen size={14} />
                          </button>
                          <button
                            onClick={() => setAddCustomerOpen(true)}
                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <UserPlus size={13} /> + Add Party
                          </button>
                        </div>
                      </div>

                      <div className="relative">
                        <Search size={14} className="absolute left-3.5 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search customer name or mobile..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-rose-600"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-1 bg-slate-200/70 p-1 rounded-xl text-[11px] font-semibold text-center text-slate-600">
                        <button onClick={() => setFilterType('ALL')} className={`py-1 rounded-lg ${filterType === 'ALL' ? 'bg-white text-slate-900 font-bold' : ''}`}>All</button>
                        <button onClick={() => setFilterType('DUE')} className={`py-1 rounded-lg ${filterType === 'DUE' ? 'bg-white text-rose-600 font-bold' : ''}`}>To Receive</button>
                        <button onClick={() => setFilterType('ADVANCE')} className={`py-1 rounded-lg ${filterType === 'ADVANCE' ? 'bg-white text-emerald-600 font-bold' : ''}`}>Advance</button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                      {filtered.map((c) => {
                        const due = Number(c.currentDue);
                        const isSelected = selectedCustomer?.id === c.id;
                        return (
                          <div
                            key={c.id}
                            onClick={() => handleSelectCustomer(c)}
                            className={`p-3.5 flex justify-between items-center cursor-pointer border-l-4 ${isSelected ? 'bg-rose-50/60 border-rose-600' : 'hover:bg-slate-50 border-transparent'}`}
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-slate-900 truncate">{c.name}</div>
                              <div className="text-[11px] text-slate-500 truncate">{c.phone}</div>
                            </div>
                            <div className="text-right">
                              <div className={`text-xs font-black font-mono ${due > 0 ? 'text-rose-600' : due < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                {formatBHD(Math.abs(due))}
                              </div>
                              <div className="text-[10px] uppercase font-bold text-slate-400">
                                {due > 0 ? 'Receivable' : due < 0 ? 'Advance' : 'Settled'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <main className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
                    {selectedCustomer ? (
                      <>
                        <div className="p-5 bg-white border-b border-slate-200 flex justify-between items-center shadow-xs">
                          <div>
                            <h2 className="text-base font-bold text-slate-900">{selectedCustomer.name}</h2>
                            <div className="text-xs text-slate-500">{selectedCustomer.phone} • {selectedCustomer.address || 'Kingdom of Bahrain'}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => window.print()} className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                              <Printer size={13} /> Print 58mm Thermal (Alt+P)
                            </button>
                            {Number(selectedCustomer.currentDue) > 0 && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => sendWhatsAppReminder(selectedCustomer, 'GENTLE')}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition cursor-pointer"
                                >
                                  <Send size={12} /> WhatsApp Friendly
                                </button>
                                <button
                                  onClick={() => sendWhatsAppReminder(selectedCustomer, 'FIRM')}
                                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition cursor-pointer"
                                >
                                  <AlertTriangle size={12} /> WhatsApp Urgent
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* FULLY INTERACTIVE DATE-TO-DATE CALENDAR FILTER BAR WITH PRESETS */}
                        <div className="px-5 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-4 text-xs">
                          <div className="flex items-center gap-2.5">
                            <span className="font-bold text-slate-700 flex items-center gap-1.5">
                              <Calendar size={14} className="text-blue-600" /> Filter Range:
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 text-[11px]">From</span>
                              <input
                                type="date"
                                value={ledgerStartDate}
                                onChange={(e) => setLedgerStartDate(e.target.value)}
                                className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer font-mono"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 text-[11px]">To</span>
                              <input
                                type="date"
                                value={ledgerEndDate}
                                onChange={(e) => setLedgerEndDate(e.target.value)}
                                className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer font-mono"
                              />
                            </div>

                            {/* Quick Presets */}
                            <button
                              onClick={() => {
                                const today = new Date().toISOString().split('T')[0];
                                setLedgerStartDate(today);
                                setLedgerEndDate(today);
                              }}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-bold cursor-pointer"
                            >
                              Today
                            </button>
                            <button
                              onClick={() => {
                                const now = new Date();
                                const year = now.getFullYear();
                                const month = String(now.getMonth() + 1).padStart(2, '0');
                                const firstDay = `${year}-${month}-01`;
                                const today = now.toISOString().split('T')[0];
                                setLedgerStartDate(firstDay);
                                setLedgerEndDate(today);
                              }}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-bold cursor-pointer"
                            >
                              This Month
                            </button>

                            {(ledgerStartDate || ledgerEndDate) && (
                              <button
                                onClick={() => { setLedgerStartDate(''); setLedgerEndDate(''); }}
                                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-md text-[11px] font-bold cursor-pointer"
                              >
                                Clear
                              </button>
                            )}
                          </div>

                          {/* Range Activity Summary Pill */}
                          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1 font-mono text-[11px]">
                            <span className="text-rose-600 font-bold">Given: {formatBHD(periodTotalGave)}</span>
                            <span className="text-slate-300">|</span>
                            <span className="text-emerald-600 font-bold">Got: {formatBHD(periodTotalGot)}</span>
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5">
                          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                                <tr>
                                  <th className="p-3 pl-4">Type</th>
                                  <th className="p-3">Date</th>
                                  <th className="p-3">Reference / Note</th>
                                  <th className="p-3 text-right">Debit (You Gave)</th>
                                  <th className="p-3 text-right pr-4">Credit (You Got)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {filteredTransactions.length === 0 ? (
                                  <tr>
                                    <td colSpan={5} className="text-center py-16 text-slate-400 text-xs">
                                      No transactions found for the selected calendar range.
                                    </td>
                                  </tr>
                                ) : (
                                  filteredTransactions.map((t) => (
                                    <tr key={t.id} className="hover:bg-slate-50">
                                      <td className="p-3 pl-4">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.type === 'YOU_GAVE' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                          {t.type === 'YOU_GAVE' ? 'SALE / GAVE' : 'PAYMENT IN'}
                                        </span>
                                      </td>
                                      <td className="p-3 text-slate-600 font-mono text-[11px]">{new Date(t.createdAt).toLocaleDateString()}</td>
                                      <td className="p-3 text-slate-800 font-medium">{t.note || '—'}</td>
                                      <td className="p-3 text-right font-black font-mono text-rose-600">{t.type === 'YOU_GAVE' ? formatBHD(t.amount) : '-'}</td>
                                      <td className="p-3 text-right pr-4 font-black font-mono text-emerald-600">{t.type === 'YOU_GOT' ? formatBHD(t.amount) : '-'}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="p-4 bg-white border-t border-slate-200 flex justify-end gap-3 px-6">
                          <button onClick={() => { setActiveTab('PAYMENT_IN_SCREEN'); }} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer">
                            <ArrowDownLeft size={16} /> PAYMENT-IN
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs space-y-3">
                        <Users size={40} className="opacity-20" />
                        <span>Select a customer from the left or add a new party.</span>
                      </div>
                    )}
                  </main>
                </div>
              )}

              {/* INVOICES LIST TAB */}
              {activeTab === 'INVOICES' && (
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
                    <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                      <h3 className="font-bold text-sm text-slate-900">Tax & Retail Invoices (BHD)</h3>
                      <button onClick={() => setActiveTab('SALE_SCREEN')} className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer">
                        <Plus size={14} /> Open Sale Terminal
                      </button>
                    </div>

                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-3 pl-4">Invoice #</th>
                          <th className="p-3">Customer / Party</th>
                          <th className="p-3">Date</th>
                          <th className="p-3">Payment Mode</th>
                          <th className="p-3 text-right">Grand Total</th>
                          <th className="p-3 text-right pr-4">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {safeInvoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-slate-50">
                            <td className="p-3 pl-4 font-mono font-bold text-rose-600">{inv.invoiceNo}</td>
                            <td className="p-3 font-semibold text-slate-900">{inv.partyName}</td>
                            <td className="p-3 text-slate-500 font-mono text-[11px]">{new Date(inv.createdAt).toLocaleDateString()}</td>
                            <td className="p-3">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                inv.paymentType === 'CREDIT' 
                                  ? 'bg-blue-50 text-blue-600 border border-blue-200' 
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}>
                                {inv.paymentType === 'CREDIT' ? 'Credit' : 'Cash'}
                              </span>
                            </td>
                            <td className="p-3 text-right font-black font-mono text-slate-900">{formatBHD(inv.grandTotal)}</td>
                            <td className="p-3 text-right pr-4">
                              <button onClick={() => setViewInvoice(inv)} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-semibold text-xs cursor-pointer">
                                View Bill
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* PURCHASES TAB */}
              {activeTab === 'PURCHASES' && (
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
                    <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                      <h3 className="font-bold text-sm text-slate-900">Purchase Bills & Expenses (BHD)</h3>
                      <button onClick={() => setCreatePurchaseOpen(true)} className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer">
                        <Plus size={14} /> Record Purchase
                      </button>
                    </div>

                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-3 pl-4">Bill #</th>
                          <th className="p-3">Vendor Name</th>
                          <th className="p-3">Date</th>
                          <th className="p-3">Payment Mode</th>
                          <th className="p-3">Note</th>
                          <th className="p-3 text-right pr-4">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {safePurchases.map((p) => (
                          <tr key={p.id}>
                            <td className="p-3 pl-4 font-mono font-bold text-slate-700">{p.billNo}</td>
                            <td className="p-3 font-semibold text-slate-900">{p.vendorName}</td>
                            <td className="p-3 text-slate-500 font-mono text-[11px]">{new Date(p.createdAt).toLocaleDateString()}</td>
                            <td className="p-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100">{p.paymentMode}</span></td>
                            <td className="p-3 text-slate-500">{p.note || '—'}</td>
                            <td className="p-3 text-right pr-4 font-black font-mono text-rose-600">{formatBHD(p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* REPORTS TAB */}
              {activeTab === 'REPORTS' && (
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-5 bg-white border border-slate-200 rounded-2xl">
                      <div className="text-xs font-bold text-slate-400 uppercase">Gross Revenue</div>
                      <div className="text-2xl font-black text-slate-900 mt-1 font-mono">{formatBHD(analytics.totalSales)}</div>
                    </div>
                    <div className="p-5 bg-white border border-slate-200 rounded-2xl">
                      <div className="text-xs font-bold text-slate-400 uppercase">Operating Expenses</div>
                      <div className="text-2xl font-black text-rose-600 mt-1 font-mono">{formatBHD(analytics.totalPurchases)}</div>
                    </div>
                    <div className="p-5 bg-white border border-slate-200 rounded-2xl">
                      <div className="text-xs font-bold text-slate-400 uppercase">Net Realized Profit</div>
                      <div className="text-2xl font-black text-emerald-600 mt-1 font-mono">
                        {formatBHD(Number(analytics.totalSales) - Number(analytics.totalPurchases))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SETTINGS TAB */}
              {activeTab === 'SETTINGS' && (
                <div className="flex-1 overflow-y-auto p-6 max-w-2xl">
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                      <h3 className="font-bold text-base text-slate-900">Store Configuration (Bahrain)</h3>
                      <button
                        type="button"
                        onClick={() => (window as any).backupAPI?.openBackupFolder()}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg flex items-center gap-1.5 transition"
                      >
                        <FolderOpen size={14} /> Open Backups Folder
                      </button>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">STORE / BUSINESS NAME</label>
                      <input
                        type="text"
                        value={storeSettings.name}
                        onChange={(e) => setStoreSettings({ ...storeSettings, name: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">PHONE NUMBER (BAHRAIN)</label>
                      <input
                        type="text"
                        value={storeSettings.phone}
                        onChange={(e) => setStoreSettings({ ...storeSettings, phone: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">STORE ADDRESS</label>
                      <input
                        type="text"
                        value={storeSettings.address}
                        onChange={(e) => setStoreSettings({ ...storeSettings, address: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">COMMERCIAL REGISTRATION (CR) / VAT ID</label>
                      <input
                        type="text"
                        value={storeSettings.crNumber}
                        onChange={(e) => setStoreSettings({ ...storeSettings, crNumber: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">BENEFITPAY MOBILE NUMBER / IBAN</label>
                      <input
                        type="text"
                        value={storeSettings.benefitPayNumber}
                        onChange={(e) => setStoreSettings({ ...storeSettings, benefitPayNumber: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-mono"
                      />
                    </div>
                    <button
                      onClick={() => alert('Settings Saved!')}
                      className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-sm cursor-pointer"
                    >
                      Save Store Profile
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

      </div>

      {/* MODAL: VIEW / PRINT INVOICE */}
      {viewInvoice && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 print:hidden">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <span className="font-bold text-sm text-slate-900">Tax Invoice / Bill</span>
              <button onClick={() => setViewInvoice(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl text-xs space-y-3 font-mono">
              <div className="text-center pb-2 border-b border-dashed border-slate-300">
                <div className="font-black text-sm text-slate-900">{storeSettings.name}</div>
                <div className="text-[10px] text-slate-500">{storeSettings.address}</div>
                <div className="text-[10px] text-slate-500">Tel: {storeSettings.phone} | CR: {storeSettings.crNumber}</div>
              </div>

              <div className="flex justify-between text-[11px]">
                <span>Bill: <b>{viewInvoice.invoiceNo}</b></span>
                <span>{new Date(viewInvoice.createdAt).toLocaleDateString()}</span>
              </div>
              <div>Customer: <b>{viewInvoice.partyName}</b> ({viewInvoice.paymentType === 'CREDIT' ? 'Credit' : 'Cash'})</div>

              <div className="border-t border-dashed border-slate-300 pt-2 flex justify-between font-bold text-sm text-slate-900">
                <span>GRAND TOTAL:</span>
                <span>{formatBHD(viewInvoice.grandTotal)}</span>
              </div>

              <div className="text-center pt-2 text-[10px] text-slate-500">
                BenefitPay: {storeSettings.benefitPayNumber}<br />
                Thank you for choosing Layali!
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setViewInvoice(null)} className="flex-1 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl cursor-pointer">
                Close
              </button>
              <button onClick={() => window.print()} className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 cursor-pointer">
                <Printer size={14} /> Print Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD PARTY */}
      {addCustomerOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 print:hidden">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <UserPlus size={16} className="text-rose-600" /> Create New Customer Account
              </h3>
              <button onClick={() => setAddCustomerOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateCustomer} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">PARTY NAME *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Tariq Al-Mansoor"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">PHONE NUMBER (BAHRAIN) *</label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 39123456"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddCustomerOpen(false)}
                  className="flex-1 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  {loading ? 'Saving...' : 'Save Party'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RECORD PURCHASE */}
      {createPurchaseOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 print:hidden">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">Record Inward Purchase</h3>
              <button onClick={() => setCreatePurchaseOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreatePurchase} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">VENDOR / SUPPLIER NAME *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Arabian Oud Wholesalers"
                  value={newPurchase.vendorName}
                  onChange={(e) => setNewPurchase({ ...newPurchase, vendorName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">PURCHASE AMOUNT (BD) *</label>
                <input
                  type="number"
                  step="0.001"
                  required
                  placeholder="BD 0.000"
                  value={newPurchase.amount}
                  onChange={(e) => setNewPurchase({ ...newPurchase, amount: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-base font-bold font-mono text-rose-600"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setCreatePurchaseOpen(false)} className="flex-1 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl cursor-pointer">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer">Save Bill</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TRANSACTION ENTRY */}
      {txnModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 print:hidden">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">{txnType === 'YOU_GAVE' ? 'Record Sale (You Gave)' : 'Record Payment (You Got)'}</h3>
              <button onClick={() => setTxnModalOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer"><X size={18} /></button>
            </div>
            <form onSubmit={handleAddTransaction} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">AMOUNT (BD) *</label>
                <input
                  type="number"
                  step="0.001"
                  required
                  autoFocus
                  placeholder="BD 0.000"
                  value={txnAmount}
                  onChange={(e) => setTxnAmount(e.target.value)}
                  className="w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-2xl font-black font-mono text-rose-600"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">NOTE</label>
                <input type="text" placeholder="Bill reference / Note" value={txnNote} onChange={(e) => setTxnNote(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setTxnModalOpen(false)} className="flex-1 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl cursor-pointer">Cancel</button>
                <button type="submit" className={`flex-1 py-2 text-white text-xs font-bold rounded-xl cursor-pointer ${txnType === 'YOU_GAVE' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>Confirm</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}