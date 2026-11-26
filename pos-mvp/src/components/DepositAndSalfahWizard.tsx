import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, Banknote, X, ArrowLeft, CreditCard, Smartphone, 
  CheckCircle2, AlertTriangle, RefreshCw, Printer as PrinterIcon, 
  User, DollarSign, Calendar
} from 'lucide-react';
import { Customer } from '../types/pos';
import { 
  printCardDepositReceipt, 
  printCardDepositRefundVoucher, 
  printCashAdvanceReceipt 
} from '../utils/printer';

export interface DepositAndSalfahWizardProps {
  isOpen: boolean;
  onClose: () => void;
  customersList?: Customer[];
  initialCustomer?: Customer | null;
  initialMode?: 'SELECT' | 'DEPOSIT_COLLECT' | 'DEPOSIT_REFUND' | 'SALFAH_DISPENSE' | 'SALFAH_REPAY';
  onCustomerUpdated?: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type WizardMode = 
  | 'SELECT'
  | 'DEPOSIT_COLLECT'
  | 'DEPOSIT_REFUND'
  | 'SALFAH_DISPENSE'
  | 'SALFAH_REPAY';

const DEPOSIT_PRESETS = [1, 2, 3, 5, 0];
const SALFAH_PRESETS = [5, 10, 15, 20];
const PAYDAY_PRESETS = [25, 28, 30, 1];

export const DepositAndSalfahWizard: React.FC<DepositAndSalfahWizardProps> = ({
  isOpen,
  onClose,
  customersList = [],
  initialCustomer = null,
  initialMode = 'SELECT',
  onCustomerUpdated,
  showToast
}) => {
  const [mode, setMode] = useState<WizardMode>(initialMode);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(initialCustomer);
  const [searchQuery, setSearchQuery] = useState('');
  const [dynamicCustomers, setDynamicCustomers] = useState<Customer[]>(customersList || []);

  useEffect(() => {
    if (customersList && customersList.length > 0) {
      setDynamicCustomers(customersList);
    } else {
      fetch('/api/khata/customers')
        .then(r => r.json())
        .then(data => {
          if (data?.customers) setDynamicCustomers(data.customers);
        })
        .catch(() => {});
    }
  }, [customersList]);
  
  // Track A: Deposit State
  const [cardType, setCardType] = useState<'PHYSICAL_NFC' | 'DIGITAL_PASS'>('PHYSICAL_NFC');
  const [depositAmount, setDepositAmount] = useState('3.000');
  const [cardUidInput, setCardUidInput] = useState('');
  const [isDamagedCard, setIsDamagedCard] = useState(false);
  const [damageDeduction, setDamageDeduction] = useState('1.000');
  const [damageReason, setDamageReason] = useState('Card cracked/broken chip fee');

  // Track B: Salfah State
  const [salfahAmount, setSalfahAmount] = useState('10.000');
  const [paydayDay, setPaydayDay] = useState(28);
  const [salfahReason, setSalfahReason] = useState('Emergency Payday Cash Advance (Salfah)');
  const [isDualCopy, setIsDualCopy] = useState(true);
  
  // Salfah Repayment State
  const [repayAmount, setRepayAmount] = useState('');
  const [repayMethod, setRepayMethod] = useState<'CASH' | 'BENEFIT_PAY'>('CASH');

  // Operational State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<{ title: string; subtitle: string } | null>(null);

  // Sync initial customer when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedCustomer(initialCustomer);
      setMode(initialMode);
      setActionSuccess(null);
      if (initialCustomer) {
        if (initialCustomer.card_deposit_amount !== undefined) {
          setDepositAmount(Number(initialCustomer.card_deposit_amount || 3).toFixed(3));
        }
        if (initialCustomer.card_type === 'DIGITAL_PASS') {
          setCardType('DIGITAL_PASS');
        } else {
          setCardType('PHYSICAL_NFC');
        }
        if (initialCustomer.cardUid) {
          setCardUidInput(initialCustomer.cardUid);
        }
        if (initialCustomer.payday_day_of_month) {
          setPaydayDay(initialCustomer.payday_day_of_month);
        }
        if (initialCustomer.cash_advance_balance) {
          setRepayAmount(Number(initialCustomer.cash_advance_balance).toFixed(3));
        }
      }
    }
  }, [isOpen, initialCustomer, initialMode]);

  // NFC tap listener while wizard is open
  useEffect(() => {
    if (!isOpen) return;
    const handleNfc = (e: any) => {
      const uid = e?.detail?.tag_id || e?.detail?.nfcId || (typeof e?.detail === 'string' ? e.detail : '');
      if (uid) {
        const clean = uid.trim().toUpperCase();
        setCardUidInput(clean);

        // Find customer associated with this card
        const match = dynamicCustomers.find(c => {
          if (!c.cardUid) return false;
          const cUid = c.cardUid.trim().toUpperCase();
          return cUid === clean || cUid.replace(/:/g, '') === clean.replace(/:/g, '');
        });

        if (match) {
          setSelectedCustomer(match);
          if (match.payday_day_of_month) setPaydayDay(match.payday_day_of_month);
          if (match.cash_advance_balance) setRepayAmount(Number(match.cash_advance_balance).toFixed(3));
          showToast?.(`💳 NFC Card Detected: ${match.name}`, 'info');
        } else {
          showToast?.(`💳 Unbound Card Scanned: ${clean}`, 'info');
        }
      }
    };

    window.addEventListener('sunmi-nfc-scan', handleNfc);
    window.addEventListener('sunmi-nfc-broadcast', handleNfc);
    return () => {
      window.removeEventListener('sunmi-nfc-scan', handleNfc);
      window.removeEventListener('sunmi-nfc-broadcast', handleNfc);
    };
  }, [isOpen, dynamicCustomers, showToast]);

  // Filter customers for search
  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return dynamicCustomers.filter(c => 
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.cardUid && c.cardUid.toLowerCase().includes(q)) ||
      (c.cpr && c.cpr.includes(q))
    ).slice(0, 6);
  }, [customersList, searchQuery]);

  if (!isOpen) return null;

  // Helper to kick cash drawer
  const kickDrawer = () => {
    try {
      if ((window as any).electronAPI?.kickCashDrawer) {
        (window as any).electronAPI.kickCashDrawer();
      } else if ((window as any).Capacitor?.isNativePlatform?.()) {
        (window as any).SunmiPrinter?.openCashBox?.();
      }
    } catch (e) {
      console.warn("Could not kick drawer automatically:", e);
    }
  };

  // Grocery Debt of selected customer (isolated from advance)
  const groceryDebt = selectedCustomer 
    ? Math.max(0, Number((selectedCustomer.currentBalance || 0) - (selectedCustomer.cash_advance_balance || 0)))
    : 0;

  const currentDepositHeld = selectedCustomer ? Number(selectedCustomer.card_deposit_amount || 0) : 0;
  const currentSalfahOwed = selectedCustomer ? Number(selectedCustomer.cash_advance_balance || 0) : 0;

  // 1. Submit Collect / Bind Deposit
  const handleCollectDeposit = async () => {
    if (!selectedCustomer) {
      showToast?.('Please select or create a customer first.', 'error');
      return;
    }
    const amountNum = parseFloat(depositAmount);
    if (isNaN(amountNum) || amountNum < 0) {
      showToast?.('Please enter a valid deposit amount.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(selectedCustomer.id)}/deposit/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-pos-client': 'store-pos' },
        body: JSON.stringify({
          amount: amountNum,
          cardType,
          cardUid: cardType === 'PHYSICAL_NFC' ? (cardUidInput.trim() || null) : null
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to collect deposit');
      }

      kickDrawer();

      // Print Deposit Receipt if deposit > 0
      if (amountNum > 0) {
        printCardDepositReceipt({
          receiptNo: data.receiptNo || `DEP-${Date.now().toString().slice(-6)}`,
          customerName: selectedCustomer.name,
          customerPhone: selectedCustomer.phone,
          customerCpr: selectedCustomer.cpr,
          cardUid: cardType === 'PHYSICAL_NFC' ? cardUidInput : 'DIGITAL PASS',
          depositAmount: amountNum,
          cardType,
          cashierName: 'Cashier 1'
        }).catch(() => {});
      }

      setActionSuccess({
        title: `Security Deposit of BD ${amountNum.toFixed(3)} Recorded!`,
        subtitle: `Card [${cardUidInput || 'Digital'}] is active. Receipt printed & cash drawer opened.`
      });
      onCustomerUpdated?.();
    } catch (err: any) {
      showToast?.(err.message || 'Error collecting deposit', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Submit Deposit Refund
  const handleRefundDeposit = async () => {
    if (!selectedCustomer) return;
    if (groceryDebt > 0.001) {
      showToast?.(`Cannot refund: Customer has BD ${groceryDebt.toFixed(3)} unpaid grocery debt!`, 'error');
      return;
    }

    const deductionNum = isDamagedCard ? (parseFloat(damageDeduction) || 0) : 0;
    const netRefund = Math.max(0, currentDepositHeld - deductionNum);

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(selectedCustomer.id)}/deposit/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-pos-client': 'store-pos' },
        body: JSON.stringify({
          damageDeduction: deductionNum,
          damageReason: isDamagedCard ? damageReason : undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to process deposit refund');
      }

      kickDrawer();

      printCardDepositRefundVoucher({
        receiptNo: data.voucherNo || data.receiptNo || `REF-DEP-${Date.now().toString().slice(-6)}`,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone,
        customerCpr: selectedCustomer.cpr,
        cardUid: selectedCustomer.cardUid,
        refundAmount: data.refundAmount ?? netRefund,
        originalDeposit: currentDepositHeld,
        damageDeduction: deductionNum,
        damageReason: isDamagedCard ? damageReason : undefined,
        cashierName: 'Cashier 1'
      }).catch(() => {});

      setActionSuccess({
        title: `BD ${(data.refundAmount ?? netRefund).toFixed(3)} Cash Refund Authorized!`,
        subtitle: `Physical card unlinked. Refund voucher printed & cash drawer opened.`
      });
      onCustomerUpdated?.();
    } catch (err: any) {
      showToast?.(err.message || 'Error processing refund', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Submit Dispense Salfah
  const handleDispenseSalfah = async () => {
    if (!selectedCustomer) {
      showToast?.('Please select a customer first.', 'error');
      return;
    }
    const amountNum = parseFloat(salfahAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showToast?.('Please enter a valid cash advance amount.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(selectedCustomer.id)}/cash-advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-pos-client': 'store-pos' },
        body: JSON.stringify({
          amount: amountNum,
          reason: salfahReason,
          payday_day_of_month: paydayDay
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to dispense cash advance');
      }

      kickDrawer();

      printCashAdvanceReceipt({
        receiptNo: data.receiptNo || `ADV-${Date.now().toString().slice(-6)}`,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone,
        customerCpr: selectedCustomer.cpr,
        advanceAmount: amountNum,
        newAdvanceBalance: (currentSalfahOwed + amountNum),
        paydayDueDay: paydayDay,
        cashierName: 'Cashier 1',
        isDualCopy: isDualCopy
      }).catch(() => {});

      setActionSuccess({
        title: `Dispensed BD ${amountNum.toFixed(3)} Salfah from Till!`,
        subtitle: `Due on Payday (${paydayDay}th). ${isDualCopy ? 'Dual slips (Store & Customer)' : 'Slip'} printed.`
      });
      onCustomerUpdated?.();
    } catch (err: any) {
      showToast?.(err.message || 'Error dispensing advance', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Submit Settle Salfah
  const handleSettleSalfah = async () => {
    if (!selectedCustomer) return;
    const amountNum = parseFloat(repayAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showToast?.('Please enter a valid settlement amount.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(selectedCustomer.id)}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-pos-client': 'store-pos' },
        body: JSON.stringify({
          amount: amountNum,
          paymentMethod: repayMethod,
          paymentTarget: 'CASH_ADVANCE',
          target: 'CASH_ADVANCE'
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to settle cash advance');
      }

      if (repayMethod === 'CASH') kickDrawer();

      setActionSuccess({
        title: `BD ${amountNum.toFixed(3)} Salfah Repaid via ${repayMethod}!`,
        subtitle: `Customer advance balance cleared. New advance balance: BD ${Number(data.cash_advance_balance || 0).toFixed(3)}.`
      });
      onCustomerUpdated?.();
    } catch (err: any) {
      showToast?.(err.message || 'Error settling advance', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200">
        
        {/* TOP HEADER */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {mode !== 'SELECT' && !actionSuccess && (
              <button 
                onClick={() => setMode('SELECT')}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-wide flex items-center gap-2">
                <span>⚡ Touch Wizard: Deposit & Salfah</span>
                <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full font-sans">
                  معالج الأمانة والسلفة
                </span>
              </h2>
              <p className="text-xs text-slate-400">Sunmi POS Guided Quick Actions • Askar Terminal</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X size={22} />
          </button>
        </div>

        {/* CUSTOMER SELECTION STRIP (Visible when not in root select or when searching) */}
        <div className="bg-slate-100 border-b border-slate-200 px-5 py-3 shrink-0">
          {selectedCustomer ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center text-sm shrink-0">
                  {selectedCustomer.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-900 truncate flex items-center gap-2">
                    <span>{selectedCustomer.name}</span>
                    {selectedCustomer.cardUid && (
                      <span className="text-[11px] font-mono bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded border border-blue-200">
                        💳 {selectedCustomer.cardUid}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-3 mt-0.5 flex-wrap">
                    <span>Grocery Debt: <b className="text-slate-800 font-mono">BD {groceryDebt.toFixed(3)}</b></span>
                    <span>Deposit: <b className="text-emerald-700 font-mono">BD {currentDepositHeld.toFixed(3)}</b></span>
                    <span>Salfah: <b className="text-amber-700 font-mono">BD {currentSalfahOwed.toFixed(3)}</b></span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedCustomer(null);
                  setSearchQuery('');
                }}
                className="text-xs text-blue-600 hover:text-blue-800 font-bold shrink-0 underline"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <User size={14} className="text-blue-600" />
                  <span>Tap NFC Card or Search Customer:</span>
                </span>
                <span className="text-[11px] text-emerald-700 font-medium animate-pulse">
                  📡 Ready for NFC Tap on Sunmi Glass
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Type customer name, phone, or CPR..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-sm bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {filteredCustomers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden divide-y divide-slate-100">
                    {filteredCustomers.map(c => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setSearchQuery('');
                          if (c.card_deposit_amount) setDepositAmount(Number(c.card_deposit_amount).toFixed(3));
                          if (c.cardUid) setCardUidInput(c.cardUid);
                          if (c.payday_day_of_month) setPaydayDay(c.payday_day_of_month);
                          if (c.cash_advance_balance) setRepayAmount(Number(c.cash_advance_balance).toFixed(3));
                        }}
                        className="px-4 py-2.5 hover:bg-blue-50 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div>
                          <div className="font-bold text-sm text-slate-900">{c.name}</div>
                          <div className="text-xs text-slate-500">{c.phone || c.cpr || 'No Phone'}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-mono font-bold text-slate-700">Debt: BD {Number(c.currentBalance || 0).toFixed(3)}</div>
                          {Number(c.cash_advance_balance || 0) > 0 && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                              Salfah: BD {Number(c.cash_advance_balance).toFixed(3)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* BODY CONTENT AREA */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1">

          {/* ACTION SUCCESS SCREEN */}
          {actionSuccess && (
            <div className="text-center py-8 space-y-4 animate-scaleUp">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 size={36} />
              </div>
              <h3 className="text-xl font-black text-slate-900">{actionSuccess.title}</h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto">{actionSuccess.subtitle}</p>
              
              <div className="pt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActionSuccess(null);
                    setMode('SELECT');
                  }}
                  className="px-5 py-3 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition-colors"
                >
                  ⚡ Perform Another Action
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 transition-colors"
                >
                  Close Wizard
                </button>
              </div>
            </div>
          )}

          {/* 0. ROOT ACTION SELECTOR */}
          {!actionSuccess && mode === 'SELECT' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* TRACK A: SECURITY DEPOSIT CARD */}
              <div className="border-2 border-emerald-200 bg-emerald-50/40 rounded-2xl p-5 flex flex-col justify-between hover:border-emerald-400 transition-all shadow-xs">
                <div>
                  <div className="w-12 h-12 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-md mb-4">
                    <ShieldCheck size={26} />
                  </div>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <span>Card Security Deposit</span>
                  </h3>
                  <p className="text-xs font-medium text-emerald-800 mt-0.5">أمانة البطاقة المستردة (0% VAT)</p>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    Collect refundable deposit (Default 3 BD) or issue free digital pass. 100% refundable in cash upon card return.
                  </p>
                </div>

                <div className="mt-5 space-y-2">
                  <button
                    type="button"
                    onClick={() => setMode('DEPOSIT_COLLECT')}
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    <CreditCard size={18} />
                    <span>Collect Deposit / Issue Card</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('DEPOSIT_REFUND')}
                    className="w-full py-2.5 px-4 bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-300 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Banknote size={16} />
                    <span>Return Card & Refund Cash</span>
                  </button>
                </div>
              </div>

              {/* TRACK B: PAYDAY SALFAH CARD */}
              <div className="border-2 border-amber-200 bg-amber-50/40 rounded-2xl p-5 flex flex-col justify-between hover:border-amber-400 transition-all shadow-xs">
                <div>
                  <div className="w-12 h-12 bg-amber-600 text-white rounded-xl flex items-center justify-center shadow-md mb-4">
                    <Banknote size={26} />
                  </div>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <span>Payday Cash Advance</span>
                  </h3>
                  <p className="text-xs font-medium text-amber-800 mt-0.5">سلفة الراتب النقدية (Salfah)</p>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    Dispense emergency cash from the till to worker. Repayable on their company payday with automated salary date tracking.
                  </p>
                </div>

                <div className="mt-5 space-y-2">
                  <button
                    type="button"
                    onClick={() => setMode('SALFAH_DISPENSE')}
                    className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    <DollarSign size={18} />
                    <span>Dispense Salfah Cash</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('SALFAH_REPAY')}
                    className="w-full py-2.5 px-4 bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <CheckCircle2 size={16} />
                    <span>Settle Salfah Repayment</span>
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* 1. TRACK A1: COLLECT DEPOSIT */}
          {!actionSuccess && mode === 'DEPOSIT_COLLECT' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-black text-base text-slate-900">Step 1: Choose Card Type & Deposit</h3>
                  <p className="text-xs text-slate-500">Held in custodial trust • Never mixed into taxable grocery sales</p>
                </div>
                <span className="text-xs font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                  0% VAT أمانة
                </span>
              </div>

              {/* Card Type Toggle */}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-2 block uppercase tracking-wider">
                  Card Format:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setCardType('PHYSICAL_NFC');
                      if (depositAmount === '0.000') setDepositAmount('3.000');
                    }}
                    className={`py-3 px-4 rounded-xl font-black text-sm border-2 flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      cardType === 'PHYSICAL_NFC' 
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-xs' 
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <CreditCard size={18} />
                    <span>Physical NFC Card</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCardType('DIGITAL_PASS');
                      setDepositAmount('0.000');
                    }}
                    className={`py-3 px-4 rounded-xl font-black text-sm border-2 flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      cardType === 'DIGITAL_PASS' 
                        ? 'border-blue-600 bg-blue-50 text-blue-950 shadow-xs' 
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <Smartphone size={18} />
                    <span>Free Digital Pass (0 BD)</span>
                  </button>
                </div>
              </div>

              {/* Deposit Quick Preset Chips */}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-2 block uppercase tracking-wider">
                  Select Deposit Amount:
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {DEPOSIT_PRESETS.map((p) => {
                    const isSelected = parseFloat(depositAmount) === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setDepositAmount(p.toFixed(3))}
                        className={`py-3 rounded-xl font-black text-xs sm:text-sm border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-md scale-102'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {p === 0 ? 'FREE (0)' : `${p} BD`}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Or custom:</span>
                  <input
                    type="number"
                    step="0.500"
                    min="0"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-28 text-sm font-bold font-mono px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-800"
                  />
                  <span className="text-xs text-slate-500 font-mono">BHD</span>
                </div>
              </div>

              {/* NFC Card Assignment */}
              {cardType === 'PHYSICAL_NFC' && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span>NFC Card Serial UID:</span>
                    </label>
                    <span className="text-[11px] text-blue-700 font-bold">
                      {cardUidInput ? '✓ Card Assigned' : 'Tap Card to Assign'}
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder="Tap physical card on Sunmi reader..."
                    value={cardUidInput}
                    onChange={(e) => setCardUidInput(e.target.value.toUpperCase())}
                    className="w-full text-sm font-mono font-bold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>
              )}

              {/* Big Action Button */}
              <button
                type="button"
                disabled={isSubmitting || !selectedCustomer}
                onClick={handleCollectDeposit}
                className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-black text-base shadow-lg flex items-center justify-center gap-3 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <RefreshCw className="animate-spin" size={20} />
                ) : (
                  <>
                    <CreditCard size={22} />
                    <span>
                      Collect BD {parseFloat(depositAmount || '0').toFixed(3)} Deposit & Open Drawer
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* 2. TRACK A2: REFUND DEPOSIT */}
          {!actionSuccess && mode === 'DEPOSIT_REFUND' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-black text-base text-slate-900">Return Card & Refund Security Deposit</h3>
                  <p className="text-xs text-slate-500">Card returned to store inventory • Cash refunded from till</p>
                </div>
                <span className="text-xs font-mono font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                  Voucher Printed
                </span>
              </div>

              {/* INVARIANT SAFETY AUDIT */}
              <div className="space-y-2.5">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-700">Pre-Refund Audit:</div>
                
                {/* Check 1: Grocery Debt Check */}
                <div className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                  groceryDebt > 0.001 
                    ? 'bg-rose-50 border-rose-300 text-rose-950' 
                    : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                }`}>
                  {groceryDebt > 0.001 ? (
                    <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={20} />
                  ) : (
                    <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={20} />
                  )}
                  <div className="text-xs">
                    <div className="font-black">
                      {groceryDebt > 0.001 
                        ? `❌ Unsettled Grocery Debt: BD ${groceryDebt.toFixed(3)}` 
                        : '✓ All Grocery Debt Cleared (0.000 BD)'}
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      {groceryDebt > 0.001 
                        ? 'Under store policy, security deposit cannot be refunded while grocery credit is outstanding.'
                        : 'Customer has zero outstanding grocery credit. 100% eligible for cash refund.'}
                    </div>
                  </div>
                </div>

                {/* Check 2: Deposit Held Check */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-600">Custodial Deposit on File:</span>
                    <div className="font-black text-slate-900 text-sm">
                      BD {currentDepositHeld.toFixed(3)} {selectedCustomer?.card_deposit_status === 'HELD' ? '(HELD)' : ''}
                    </div>
                  </div>
                  {selectedCustomer?.cardUid && (
                    <span className="font-mono bg-white border border-slate-200 px-2 py-1 rounded text-slate-700">
                      Card: {selectedCustomer.cardUid}
                    </span>
                  )}
                </div>

                {/* Check 3: Physical Card Condition & Damage Fee */}
                <div className="border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Physical Card Condition:</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsDamagedCard(false)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
                          !isDamagedCard ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600'
                        }`}
                      >
                        ✓ Intact / Working
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsDamagedCard(true)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
                          isDamagedCard ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-600'
                        }`}
                      >
                        ⚠️ Broken / Damaged
                      </button>
                    </div>
                  </div>

                  {isDamagedCard && (
                    <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600">Replacement Card Fee:</span>
                        <input
                          type="number"
                          step="0.500"
                          min="0"
                          max={currentDepositHeld}
                          value={damageDeduction}
                          onChange={(e) => setDamageDeduction(e.target.value)}
                          className="w-20 font-bold font-mono px-2 py-1 border border-slate-300 rounded text-rose-700"
                        />
                        <span className="text-slate-500 font-mono">BHD</span>
                        <span className="text-[11px] text-slate-400 italic">Deducted from refund</span>
                      </div>
                      <input
                        type="text"
                        placeholder="Fee reason..."
                        value={damageReason}
                        onChange={(e) => setDamageReason(e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-700 bg-white"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Net Cash Refund Display */}
              <div className="bg-emerald-900 text-white rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-emerald-300 font-bold uppercase">Cash to Return to Customer:</div>
                  <div className="text-2xl font-black font-mono">
                    BD {Math.max(0, currentDepositHeld - (isDamagedCard ? (parseFloat(damageDeduction) || 0) : 0)).toFixed(3)}
                  </div>
                </div>
                <div className="text-right text-xs text-emerald-200">
                  <div>100% Cash Drawer Refund</div>
                  <div>Prints Voucher REF-DEP-...</div>
                </div>
              </div>

              {/* Big Action Button */}
              <button
                type="button"
                disabled={isSubmitting || !selectedCustomer || groceryDebt > 0.001 || currentDepositHeld <= 0}
                onClick={handleRefundDeposit}
                className="w-full py-4 px-6 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white rounded-xl font-black text-base shadow-lg flex items-center justify-center gap-3 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <RefreshCw className="animate-spin" size={20} />
                ) : (
                  <>
                    <Banknote size={22} />
                    <span>
                      {groceryDebt > 0.001 
                        ? 'Settle Grocery Debt First' 
                        : `Refund BD ${Math.max(0, currentDepositHeld - (isDamagedCard ? (parseFloat(damageDeduction) || 0) : 0)).toFixed(3)} Cash & Open Drawer`}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* 3. TRACK B1: DISPENSE SALFAH */}
          {!actionSuccess && mode === 'SALFAH_DISPENSE' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-black text-base text-slate-900">Dispense Payday Salfah (سلفة نقدية)</h3>
                  <p className="text-xs text-slate-500">Emergency salary cash advance from register till</p>
                </div>
                <span className="text-xs font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                  Dual Slip Print
                </span>
              </div>

              {/* Salfah Preset Amount Chips */}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-2 block uppercase tracking-wider">
                  Select Cash Advance Amount:
                </label>
                <div className="grid grid-cols-4 gap-2.5">
                  {SALFAH_PRESETS.map((p) => {
                    const isSelected = parseFloat(salfahAmount) === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setSalfahAmount(p.toFixed(3))}
                        className={`py-3.5 rounded-xl font-black text-sm border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-600 text-white border-amber-600 shadow-md scale-102'
                            : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {p} BD
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Custom advance:</span>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={salfahAmount}
                    onChange={(e) => setSalfahAmount(e.target.value)}
                    className="w-28 text-sm font-bold font-mono px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-800"
                  />
                  <span className="text-xs text-slate-500 font-mono">BHD</span>
                </div>
              </div>

              {/* Payday Due Date Chips */}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-2 block uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={14} className="text-amber-700" />
                  <span>Customer Salary Day (Payday Due Date):</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {PAYDAY_PRESETS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setPaydayDay(d)}
                      className={`py-2 px-3 rounded-lg font-bold text-xs border transition-colors cursor-pointer ${
                        paydayDay === d 
                          ? 'bg-slate-900 text-white border-slate-900' 
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {d === 28 ? `⭐ ${d}th (Std)` : `${d}th`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason / Memo */}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1.5 block uppercase tracking-wider">
                  Advance Memo / Reason:
                </label>
                <input
                  type="text"
                  value={salfahReason}
                  onChange={(e) => setSalfahReason(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                />
              </div>

              {/* Dual Print Toggle */}
              <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-amber-950 font-bold">
                  <PrinterIcon size={16} className="text-amber-700" />
                  <span>Print Dual Signature Slips (Store Copy & Customer Copy)</span>
                </div>
                <input
                  type="checkbox"
                  checked={isDualCopy}
                  onChange={(e) => setIsDualCopy(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                />
              </div>

              {/* Big Action Button */}
              <button
                type="button"
                disabled={isSubmitting || !selectedCustomer}
                onClick={handleDispenseSalfah}
                className="w-full py-4 px-6 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-black text-base shadow-lg flex items-center justify-center gap-3 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <RefreshCw className="animate-spin" size={20} />
                ) : (
                  <>
                    <Banknote size={22} />
                    <span>
                      Dispense BD {parseFloat(salfahAmount || '0').toFixed(3)} Salfah & Open Drawer
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* 4. TRACK B2: SETTLE SALFAH */}
          {!actionSuccess && mode === 'SALFAH_REPAY' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-black text-base text-slate-900">Settle Payday Salfah Repayment</h3>
                  <p className="text-xs text-slate-500">Repayment dedicated to cash advance without disturbing grocery tab</p>
                </div>
                <span className="text-xs font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                  Instant Clearance
                </span>
              </div>

              {/* Outstanding Salfah Balance Card */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-amber-800 font-bold uppercase">Total Salfah Due on Payday:</span>
                  <div className="text-2xl font-black font-mono text-amber-950">
                    BD {currentSalfahOwed.toFixed(3)}
                  </div>
                </div>
                <div className="text-right text-xs text-amber-700">
                  <div>Salary Day: <b>{selectedCustomer?.payday_day_of_month || 28}th</b></div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Separate from grocery debt</div>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-2 block uppercase tracking-wider">
                  Payment Received Via:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRepayMethod('CASH')}
                    className={`py-3 px-4 rounded-xl font-black text-sm border-2 flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      repayMethod === 'CASH' 
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-xs' 
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <Banknote size={18} />
                    <span>💵 Cash in Hand</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRepayMethod('BENEFIT_PAY')}
                    className={`py-3 px-4 rounded-xl font-black text-sm border-2 flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      repayMethod === 'BENEFIT_PAY' 
                        ? 'border-red-600 bg-red-50 text-red-950 shadow-xs' 
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <Smartphone size={18} />
                    <span>📱 BenefitPay App</span>
                  </button>
                </div>
              </div>

              {/* Amount to Repay */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Amount Paid:</label>
                  <button
                    type="button"
                    onClick={() => setRepayAmount(currentSalfahOwed.toFixed(3))}
                    className="text-xs text-blue-600 hover:text-blue-800 font-bold underline"
                  >
                    Full Balance (BD {currentSalfahOwed.toFixed(3)})
                  </button>
                </div>
                <input
                  type="number"
                  step="0.500"
                  min="0.100"
                  max={currentSalfahOwed}
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                  className="w-full text-base font-bold font-mono px-3.5 py-2.5 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Big Action Button */}
              <button
                type="button"
                disabled={isSubmitting || !selectedCustomer || currentSalfahOwed <= 0}
                onClick={handleSettleSalfah}
                className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl font-black text-base shadow-lg flex items-center justify-center gap-3 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <RefreshCw className="animate-spin" size={20} />
                ) : (
                  <>
                    <CheckCircle2 size={22} />
                    <span>
                      Complete BD {parseFloat(repayAmount || '0').toFixed(3)} Salfah Settlement
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
