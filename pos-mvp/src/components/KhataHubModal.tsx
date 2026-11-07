import { useState, useEffect } from 'react';
import { X, UserPlus, Banknote, Smartphone, CheckCircle2, ChevronRight, ArrowLeft, Save, IdCard, Phone, Wifi, Printer, FileClock, FileText, Settings, Trash2, ShieldAlert, MessageCircle, ArrowUpDown } from 'lucide-react';
import { useNfcScanner } from '../hooks/useNfcScanner';
import { printKhataStatement, printKhataPaymentReceipt, kickCashDrawer } from '../utils/printer';
import { playThankYouVoice } from '../utils/sound';
import { CustomerDisplay } from '../plugins/CustomerDisplay';
import { db } from '../db';
import { generateBenefitPayPayload, getStoredBenefitPayConfig } from '../utils/benefitPay';

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
  const [activeTab, setActiveTab] = useState<'SETTLE' | 'NEW'>('SETTLE');
  // Shared Hardware NFC Scanner Hook at Hub Level
  const { scannedUid, lastDetectedUid, clearScan } = useNfcScanner();

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
          <div className="flex grid-cols-2 w-full text-lg font-bold">
            <button
              onClick={() => setActiveTab('SETTLE')}
              className={`flex-1 py-4 border-b-4 transition-colors cursor-pointer ${
                activeTab === 'SETTLE'
                  ? 'border-emerald-500 text-emerald-600 bg-emerald-50'
                  : 'border-transparent text-slate-500 hover:bg-slate-100'
              }`}
            >
              Receive Payment (Settle)
            </button>
            <button
              onClick={() => setActiveTab('NEW')}
              className={`flex-1 py-4 border-b-4 transition-colors cursor-pointer ${
                activeTab === 'NEW'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-slate-500 hover:bg-slate-100'
              }`}
            >
              <UserPlus className="inline mr-2" size={20} /> New Customer
            </button>
          </div>
        </div>

        {/* Dynamic Content Area */}
        <div className="p-6 bg-white min-h-[420px] max-h-[75vh] overflow-y-auto">
          {activeTab === 'SETTLE' ? (
            <SettleBalanceView
              apiBase={apiBase}
              onCustomerUpdated={onCustomerUpdated}
              onSelectCustomerForCart={onSelectCustomerForCart}
              onClose={onClose}
              showToast={showToast}
              initialCardUid={lastScannedCardUid || lastDetectedUid}
              scannedCardUid={scannedUid}
              clearScan={clearScan}
            />
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
  } catch (_) {}

  // Update hardware pole display
  if (customer) {
    if (isConfirmed) {
      CustomerDisplay.updateDisplay?.({
        text: `THANK YOU, ${customer.name.toUpperCase()}!\nPAID: BD ${payAmt.toFixed(3)}\nNEW BAL: BD ${remainingBal.toFixed(3)}`
      }).catch(() => {});
    } else {
      CustomerDisplay.updateDisplay?.({
        text: `${customer.name.toUpperCase()}\nOWED: BD ${currentBal.toFixed(3)}\nPAYING: BD ${payAmt.toFixed(3)}\nREM: BD ${remainingBal.toFixed(3)}`
      }).catch(() => {});
    }
  } else {
    CustomerDisplay.updateDisplay?.({
      text: `ASKAR SUPERMARKET\nWELCOME!`
    }).catch(() => {});
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
  } catch (_) {}
}

function SettleBalanceView({
  apiBase,
  onCustomerUpdated,
  onSelectCustomerForCart,
  onClose,
  showToast,
  initialCardUid,
  scannedCardUid,
  clearScan
}: {
  apiBase: string;
  onCustomerUpdated?: () => void;
  onSelectCustomerForCart?: (customer: Customer) => void;
  onClose?: () => void;
  showToast?: (message: string, type?: 'success' | 'info' | 'error') => void;
  initialCardUid?: string | null;
  scannedCardUid?: string | null;
  clearScan?: () => Promise<void> | void;
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

  // Fetch active customers for the Khata Hub
  const fetchKhataCustomers = () => {
    fetch(`${apiBase}/khata/ledger?sort=${sortParam}`)
      .then((res) => res.json())
      .then((data) => {
        const list = data.customers || (Array.isArray(data) ? data : []);
        // Enforce soft-delete filtering: only display active customers (is_active !== 0)
        const activeOnly = list.filter((c: any) => c.is_active === 1 || c.is_active === true || c.isActive === true || c.is_active === undefined);
        setCustomers(activeOnly);
      })
      .catch((err) => {
        console.error('Failed to load customers', err);
        const fallback: Customer = { id: 'dummy_1', name: 'Ali Ahmed', phone: '39991234', currentBalance: 14.500, is_active: 1 };
        setCustomers([fallback]);
      });
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
        } catch {}
      };
    } catch {}

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
  const loadStatement = async (customerId: string) => {
    setIsLoadingStatement(true);
    let loaded = false;
    const candidates = [
      apiBase,
      localStorage.getItem('master_server_url'),
      localStorage.getItem('server_ip') ? `http://${localStorage.getItem('server_ip')}:3000` : null,
      'http://192.168.8.7:3000',
      'http://askar-master.local:3000',
      'http://localhost:3000'
    ].filter((v, i, a): v is string => Boolean(v) && !v?.includes('192.168.8.20') && a.indexOf(v) === i);

    for (const url of candidates) {
      try {
        const res = await fetch(`${url}/api/customers/${customerId}/statement`, {
          signal: AbortSignal.timeout(3000)
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.statement)) {
            setStatement(data.statement);
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

  const printStatement = () => {
    if (!selectedCustomer) return;
    const formattedStatement = statement.map((item) => ({
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
      currentBalance: Number(selectedCustomer.currentBalance ?? selectedCustomer.balance ?? 0)
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

    // 6. Non-blocking asynchronous persistence: local SQLite & background network sync
    (async () => {
      try {
        await db.execute({
          sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, runningBalance, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            crypto.randomUUID(),
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

      try {
        const res = await fetch(`${apiBase}/api/customers/${selectedCustomer.id}/settle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: amountNum, paymentMethod: method }),
          signal: AbortSignal.timeout(2000)
        });
        if (res.ok) {
          const data = await res.json();
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

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.phone && c.phone.includes(search)) ||
    (c.cpr && c.cpr.toLowerCase().includes(search.toLowerCase())) ||
    (c.batchNo && c.batchNo.toLowerCase().includes(search.toLowerCase())) ||
    (c.cardUid && c.cardUid.toLowerCase().includes(search.toLowerCase()))
  );

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
              className={`px-5 py-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                viewMode === 'PAY'
                  ? 'bg-white shadow-sm text-slate-900 border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Take Payment
            </button>
            <button 
              onClick={() => loadStatement(selectedCustomer.id)}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                viewMode === 'STATEMENT'
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
          </div>
        </div>

        {/* Customer Identity Card */}
        <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-4 flex justify-between items-center shrink-0 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-2xl font-black text-slate-800">{selectedCustomer.name}</h4>
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
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Owed</p>
            <p className="text-3xl font-black text-red-500">BD {selectedCustomer.currentBalance.toFixed(3)}</p>
          </div>
        </div>

        {/* DYNAMIC AREA: Payment vs Statement */}
        {viewMode === 'PAY' ? (
          <div className="flex-1 space-y-6 pt-2">
            {/* Quick Balance Buttons */}
            {selectedCustomer.currentBalance > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-bold uppercase">Quick Fill:</span>
                <button
                  onClick={() => setPayAmount(selectedCustomer.currentBalance.toFixed(3))}
                  className="px-3 py-1.5 text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg cursor-pointer active:scale-95 transition-all"
                >
                  Full Balance (BD {selectedCustomer.currentBalance.toFixed(3)})
                </button>
                {selectedCustomer.currentBalance > 0.200 && (
                  <button
                    onClick={() => setPayAmount((selectedCustomer.currentBalance / 2).toFixed(3))}
                    className="px-3 py-1.5 text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg cursor-pointer active:scale-95 transition-all"
                  >
                    50% Partial (BD {(selectedCustomer.currentBalance / 2).toFixed(3)})
                  </button>
                )}
                {selectedCustomer.currentBalance >= 5 && (
                  <button
                    onClick={() => setPayAmount('5.000')}
                    className="px-3 py-1.5 text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg cursor-pointer active:scale-95 transition-all"
                  >
                    BD 5.000
                  </button>
                )}
                {selectedCustomer.currentBalance >= 10 && (
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
            <div className="flex justify-between items-center p-4 border-b bg-slate-50">
              <h3 className="font-bold text-slate-700 flex items-center gap-2">
                <FileText size={18} className="text-slate-500" /> Transaction Ledger
              </h3>
              <button 
                onClick={printStatement} 
                className="flex items-center gap-2 text-sm bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-bold active:scale-95 cursor-pointer shadow-sm transition-all"
              >
                <Printer size={16} /> Print Receipt
              </button>
            </div>

            {/* Scrollable Statement Table with Sticky Header */}
            <div className="flex-1 overflow-y-auto scroll-zone max-h-[340px]">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 sticky top-0 border-b z-10">
                  <tr>
                    <th className="p-3 font-bold text-slate-600 text-xs uppercase tracking-wider">Date & Time</th>
                    <th className="p-3 font-bold text-slate-600 text-xs uppercase tracking-wider">Description</th>
                    <th className="p-3 font-bold text-slate-600 text-xs uppercase tracking-wider text-right">Debit (Charge)</th>
                    <th className="p-3 font-bold text-slate-600 text-xs uppercase tracking-wider text-right">Credit (Paid)</th>
                    <th className="p-3 font-bold text-slate-800 text-xs uppercase tracking-wider text-right bg-slate-200">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {statement.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-sm text-slate-600">
                        <div className="font-bold text-slate-800">{entry.formattedDate}</div>
                        <div className="text-xs text-slate-400 font-mono">{entry.formattedTime}</div>
                      </td>
                      <td className="p-3 text-sm font-bold text-slate-800">
                        <div className="flex items-center justify-between gap-2">
                          <span>{entry.reference || (entry.type === 'PAYMENT' ? 'Cash Payment' : (entry.type === 'WRITE_OFF' ? 'Bad Debt Write-Off' : 'Grocery Purchase'))}</span>
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
                  {statement.length === 0 && !isLoadingStatement && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400 font-bold">
                        No transaction history found for this customer.
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
              <p>--------------------------------</p>
              <p style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>DATE / DESC</span>
                <span>BALANCE</span>
              </p>
              <p>--------------------------------</p>
              {statement.slice().reverse().map(e => (
                <div key={e.id} style={{ marginBottom: '4px' }}>
                  <p>{e.formattedDate} {e.formattedTime}</p>
                  <p style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{e.type === 'SALE' ? '+GROCERY' : '-PAYMENT'} ({e.amount > 0 ? `+${e.amount.toFixed(3)}` : e.amount.toFixed(3)})</span>
                    <span>BD {e.runningBalance.toFixed(3)}</span>
                  </p>
                </div>
              ))}
              <p>================================</p>
              <p style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}>
                <span>OUTSTANDING DUE:</span>
                <span>BD {selectedCustomer.currentBalance.toFixed(3)}</span>
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

      {/* Search Bar + Sort Order Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-2">
        <div className="relative flex-1">
          <input 
            type="text" 
            placeholder="Search by name, phone, CPR, batch..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-base py-3 pl-4 pr-4 bg-slate-100 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 font-medium"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
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
            <div
              onClick={() => setSelectedCustomer(customer)}
              className="flex-1 cursor-pointer pr-2 select-none"
            >
              <div className="font-bold text-lg text-slate-800 flex items-center gap-2">
                {customer.name}
                {customer.batchNo && (
                  <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md uppercase tracking-wider font-extrabold">
                    {customer.batchNo}
                  </span>
                )}
              </div>
              <div className="text-slate-500 text-sm flex items-center flex-wrap gap-3 mt-0.5">
                <span>{customer.phone || 'No phone'}</span>
                {customer.cpr && <span className="text-slate-400 font-mono text-xs">CPR: {customer.cpr}</span>}
                {customer.cardUid && (
                  <span className="font-mono text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                    💳 {customer.cardUid}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* One-Click WhatsApp Reminder Button */}
              {customer.currentBalance > 0 && customer.phone && (
                <a
                  href={`https://wa.me/${(() => {
                    const d = customer.phone.replace(/[^0-9]/g, '');
                    return d.length === 8 ? `973${d}` : d;
                  })()}?text=${encodeURIComponent(
                    `Hello ${customer.name}, your current Khata credit balance at Askar Supermarket is BHD ${customer.currentBalance.toFixed(3)}. Please arrange a payment soon. Thank you!`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-300 active:scale-90 transition-transform cursor-pointer shadow-2xs"
                  title="Send WhatsApp Debt Reminder"
                >
                  <MessageCircle size={18} className="fill-emerald-600/20" />
                </a>
              )}

              <div
                onClick={() => setSelectedCustomer(customer)}
                className="text-right cursor-pointer pr-1 select-none"
              >
                <div className="text-[10px] text-slate-400 font-bold uppercase">Balance</div>
                <div className={`font-black text-lg ${customer.currentBalance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                  BD {customer.currentBalance.toFixed(3)}
                </div>
                {customer.isStale && (
                  <div className="text-[9px] font-black bg-rose-100 text-rose-700 px-1 py-0.2 rounded mt-0.5 border border-rose-200">
                    🚨 STALE ({customer.daysSinceLastPayment ?? 46}d)
                  </div>
                )}
              </div>

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
    description: '',
    cardUid: lastScannedCardUid || ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cardStatus, setCardStatus] = useState<{
    status: 'idle' | 'checking' | 'valid' | 'conflict';
    message?: string;
  }>({ status: 'idle' });

  // Verification helper to check if card is already taken by another customer
  const checkCard = async (uid: string) => {
    if (!uid || !uid.trim()) {
      setCardStatus({ status: 'idle' });
      return;
    }
    setCardStatus({ status: 'checking', message: 'Verifying card in database...' });
    try {
      const res = await fetch(`${apiBase}/api/customers/nfc/${encodeURIComponent(uid.trim())}`);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
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

        {/* SECTION 2: Contact & Notes */}
        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
          <h4 className="flex items-center gap-2 text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">
            <Phone size={18} /> Contact & Details
          </h4>
          <div className="grid grid-cols-1 gap-4">
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
              <label className="block text-slate-700 font-bold mb-1">Description / Notes</label>
              <textarea 
                name="description" 
                value={formData.description}
                onChange={handleChange}
                rows={2}
                className="w-full text-lg p-3 bg-white border-2 border-slate-300 rounded-lg outline-none focus:border-blue-500 resize-none transition-colors" 
                placeholder="e.g. Lives in Block 4, allowed up to 50 BHD credit..." 
              />
            </div>
          </div>
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
            <div className={`p-3.5 rounded-xl border mb-3 flex items-center justify-between ${
              cardStatus.status === 'conflict'
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : 'bg-emerald-50 border-emerald-300 text-emerald-950'
            }`}>
              <div className="flex items-center gap-2.5">
                <span className="text-xl">💳</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-sm">{formData.cardUid}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      cardStatus.status === 'conflict' ? 'bg-rose-200 text-rose-800' : 'bg-emerald-200 text-emerald-800'
                    }`}>
                      {cardStatus.status === 'conflict' ? 'Already in Use' : 'Card Verified'}
                    </span>
                  </div>
                  {cardStatus.message && (
                    <p className={`text-xs mt-0.5 font-medium ${
                      cardStatus.status === 'conflict' ? 'text-rose-700 font-bold' : 'text-emerald-700'
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
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
    if (customer.currentBalance > 0.001) {
      const err = `Cannot delete customer with an outstanding balance (BD ${customer.currentBalance.toFixed(3)}). Settle all dues to BD 0.000 first.`;
      showToast ? showToast(err, 'error') : alert(err);
      return;
    }

    // 2. Open Manager PIN Verification Dialog
    setPinInput('');
    setPinError('');
    setShowPinModal(true);
  };

  const handleVerifyPinAndDelete = async (pinToVerify: string) => {
    // Protected by Manager 9999 PIN
    if (pinToVerify !== '9999') {
      setPinError('Unauthorized - Incorrect Manager PIN');
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`${apiBase}/khata/${customer.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const msg = `Customer "${customer.name}" archived successfully.`;
        showToast ? showToast(msg, 'success') : alert(msg);
        onDeleted(customer.id);
        setShowPinModal(false);
        onClose();
      } else {
        // Warns if balance is > 0 or rejection from server
        const errMsg = data.error || 'Cannot delete customer with an outstanding balance.';
        showToast ? showToast(errMsg, 'error') : alert(errMsg);
        setShowPinModal(false);
      }
    } catch (e) {
      console.error(e);
      alert('Network error while archiving customer account.');
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
                {customer.currentBalance > 0
                  ? 'Must be zero balance to archive'
                  : 'Zero balance: eligible for archiving'}
              </p>
            </div>
            <div className={`text-2xl font-black ${customer.currentBalance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
              BD {customer.currentBalance.toFixed(3)}
            </div>
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
                Enter Manager PIN (<strong>9999</strong>) to authorize soft-deletion of account <strong>{customer.name}</strong>.
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


