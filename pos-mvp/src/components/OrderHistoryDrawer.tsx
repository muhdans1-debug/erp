import { useState, useEffect, useCallback } from 'react';
import { 
  Receipt, 
  X, 
  AlertCircle, 
  RefreshCw, 
  CheckCircle2, 
  Printer as PrinterIcon, 
  ShieldCheck, 
  Delete,
  Ban,
  Clock
} from 'lucide-react';
import { printCreditNote } from '../utils/printer';

export interface SaleItem {
  id: string;
  name?: string;
  productName?: string;
  productId: string;
  barcode?: string;
  quantity: number;
  priceAtSale?: number;
  unitPrice?: number;
  vatAmount?: number;
}

export interface SaleRecord {
  id: string;
  invoiceNo: string;
  invoiceSeq?: number;
  total: number;
  totalAmount?: number;
  totalVat?: number;
  vatTotal?: number;
  subtotal?: number;
  paymentType: string;
  status: 'COMPLETED' | 'VOIDED' | string;
  createdAt: string;
  items?: SaleItem[];
}

export interface OrderHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
  onCatalogRefresh?: () => void;
}

export default function OrderHistoryDrawer({
  isOpen,
  onClose,
  apiBase,
  onCatalogRefresh
}: OrderHistoryDrawerProps) {
  // Manager PIN Security State
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // Sales State
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [voidingSaleId, setVoidingSaleId] = useState<string | null>(null);
  const [confirmSale, setConfirmSale] = useState<SaleRecord | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Beep feedback using Web Audio API
  const playBeep = useCallback((isSuccess = true) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isSuccess ? 'sine' : 'sawtooth';
      osc.frequency.setValueAtTime(isSuccess ? 880 : 320, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (_) {}
  }, []);

  // Fetch today's sales
  const fetchTodaySales = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/sales/today`);
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.sales)) {
        setSales(data.sales);
      }
    } catch (err) {
      console.warn('Failed to load today sales:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  // Handle drawer open/close
  useEffect(() => {
    if (isOpen) {
      setPinInput('');
      setPinError(false);
      fetchTodaySales();
    } else {
      setIsUnlocked(false);
      setConfirmSale(null);
      setStatusMessage(null);
    }
  }, [isOpen, fetchTodaySales]);

  // Handle PIN input digits
  const handlePinDigit = (digit: string) => {
    if (pinInput.length >= 4) return;
    const nextPin = pinInput + digit;
    setPinInput(nextPin);
    setPinError(false);

    if (nextPin.length === 4) {
      if (nextPin === '9999') {
        setIsUnlocked(true);
        playBeep(true);
      } else {
        setPinError(true);
        playBeep(false);
        setTimeout(() => setPinInput(''), 600);
      }
    }
  };

  const handlePinDelete = () => {
    setPinInput((prev) => prev.slice(0, -1));
    setPinError(false);
  };

  // Void Sale Action
  const handleExecuteVoid = async (sale: SaleRecord) => {
    setVoidingSaleId(sale.id);
    setStatusMessage(null);

    try {
      const res = await fetch(`${apiBase}/api/sales/${sale.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();

      if (res.ok && data.success) {
        playBeep(true);
        setStatusMessage({
          text: `🧾 Bill #${sale.invoiceNo} VOIDED. Credit Note issued & items returned to stock.`,
          type: 'success'
        });

        // Trigger thermal print of Bahrain NBR-compliant Credit Note
        printCreditNote({
          invoiceNo: sale.invoiceNo,
          creditNoteNo: data.creditNote?.creditNoteNo,
          totalAmount: Number(sale.totalAmount || sale.total || 0),
          vatAmount: Number(sale.totalVat || sale.vatTotal || 0),
          date: new Date().toISOString(),
          cashierName: 'Manager 9999 (Void & Re-ring)',
          items: sale.items || []
        }).catch((err) => console.warn('Credit note print error:', err));

        // Refresh sales list and catalog inventory
        await fetchTodaySales();
        if (onCatalogRefresh) onCatalogRefresh();
        setConfirmSale(null);
      } else {
        playBeep(false);
        setStatusMessage({
          text: data.error || 'Failed to void bill.',
          type: 'error'
        });
      }
    } catch (err: any) {
      playBeep(false);
      setStatusMessage({
        text: err.message || 'Network error executing void.',
        type: 'error'
      });
    } finally {
      setVoidingSaleId(null);
    }
  };

  return (
    <div
      className={`fixed inset-y-0 right-0 w-full sm:w-2/3 lg:w-1/2 bg-slate-900 text-white z-40 transform transition-transform duration-300 ease-in-out shadow-2xl flex flex-col border-l border-slate-700/80 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {/* DRAWER HEADER */}
      <div className="h-14 bg-slate-950 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
            <Receipt size={18} />
          </div>
          <div>
            <h2 className="text-sm font-black tracking-wide text-white flex items-center gap-2">
              TODAY'S TRANSACTIONS
              {isUnlocked && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  MANAGER VERIFIED
                </span>
              )}
            </h2>
            <p className="text-[11px] text-slate-400">Order History & NBR Void / Credit Notes</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          title="Close Drawer"
        >
          <X size={18} />
        </button>
      </div>

      {/* DRAWER BODY */}
      <div className="flex-1 overflow-y-auto flex flex-col p-4">
        {/* VIEW 1: PIN AUTHENTICATION REQUIRED */}
        {!isUnlocked ? (
          <div className="flex-1 flex flex-col items-center justify-center max-w-xs mx-auto py-4">
            <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 text-amber-400 flex items-center justify-center mb-3">
              <ShieldCheck size={28} />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Manager Access Required</h3>
            <p className="text-xs text-slate-400 text-center mb-6">
              Enter Manager PIN (9999) to view transaction history and authorize NBR invoice voids.
            </p>

            {/* PIN Dots */}
            <div className={`flex items-center gap-3 mb-6 ${pinError ? 'animate-bounce text-red-400' : ''}`}>
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border transition-all ${
                    pinInput.length > idx
                      ? 'bg-blue-400 border-blue-300 scale-110 shadow-xs shadow-blue-500'
                      : 'border-slate-600 bg-slate-800/80'
                  }`}
                />
              ))}
            </div>

            {pinError && (
              <p className="text-xs font-bold text-rose-400 mb-3 flex items-center gap-1">
                <AlertCircle size={14} /> Incorrect Manager PIN. Try 9999.
              </p>
            )}

            {/* Touch Keypad */}
            <div className="grid grid-cols-3 gap-2.5 w-full">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handlePinDigit(digit)}
                  className="h-14 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-xl font-black text-white active:scale-95 transition-all cursor-pointer shadow-xs"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPinInput('')}
                className="h-14 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-xs font-bold text-slate-400 border border-slate-700/60 active:scale-95 transition-all cursor-pointer"
              >
                CLEAR
              </button>
              <button
                type="button"
                onClick={() => handlePinDigit('0')}
                className="h-14 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-xl font-black text-white active:scale-95 transition-all cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={handlePinDelete}
                className="h-14 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 border border-slate-700/60 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              >
                <Delete size={20} />
              </button>
            </div>
          </div>
        ) : (
          /* VIEW 2: ORDER HISTORY & VOID BILL PANEL */
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Today's Receipts ({sales.length})
              </span>
              <button
                type="button"
                onClick={fetchTodaySales}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-bold cursor-pointer"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {/* Notification Banner */}
            {statusMessage && (
              <div
                className={`text-xs font-bold px-3 py-2.5 rounded-lg mb-3 flex items-center gap-2 ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}
              >
                {statusMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{statusMessage.text}</span>
              </div>
            )}

            {/* Confirmation Dialog Overlay */}
            {confirmSale && (
              <div className="bg-rose-950/80 border border-rose-600/80 rounded-xl p-4 mb-4 shadow-xl">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-rose-600/30 text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Ban size={22} />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-black text-white">Authorize Void & Issue Credit Note?</h4>
                    <p className="text-xs text-rose-200 mt-1">
                      Are you sure you want to void <strong className="text-white">#{confirmSale.invoiceNo}</strong> (BD {Number(confirmSale.totalAmount || confirmSale.total || 0).toFixed(3)})?
                    </p>
                    <p className="text-[11px] text-slate-300 mt-1">
                      This will legally reverse the 10% VAT, restore all items to physical inventory, and output a paper Credit Note on the thermal printer.
                    </p>
                    <div className="flex items-center gap-2 mt-3.5">
                      <button
                        type="button"
                        onClick={() => handleExecuteVoid(confirmSale)}
                        disabled={voidingSaleId === confirmSale.id}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-black text-xs rounded-lg transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                      >
                        <Ban size={14} />
                        {voidingSaleId === confirmSale.id ? 'Voiding in SQLite...' : 'Confirm & Void Bill'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmSale(null)}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sales List */}
            {sales.length === 0 ? (
              <div className="bg-slate-800/60 border border-dashed border-slate-700 rounded-xl p-8 text-center my-6 flex flex-col items-center">
                <Receipt size={36} className="text-slate-500 mb-2" />
                <h4 className="text-sm font-bold text-slate-300 mb-1">No Transactions Today</h4>
                <p className="text-xs text-slate-400 max-w-xs">
                  Ring up customer sales on the register to view receipt history and void bills here.
                </p>
              </div>
            ) : (
              <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                {sales.map((sale) => {
                  const isVoided = sale.status === 'VOIDED';
                  const total = Number(sale.totalAmount || sale.total || 0);
                  const vat = Number(sale.totalVat || sale.vatTotal || 0);
                  const itemCount = sale.items?.reduce((sum, i) => sum + (Number(i.quantity) || 1), 0) || 0;

                  return (
                    <div
                      key={sale.id}
                      className={`p-4 rounded-xl border transition-all ${
                        isVoided
                          ? 'bg-slate-900/60 border-slate-800 opacity-60'
                          : 'bg-slate-800/90 border-slate-700/80 shadow-xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-black text-white font-mono">
                              {sale.invoiceNo}
                            </h4>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wide uppercase border ${
                                isVoided
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              }`}
                            >
                              {isVoided ? 'VOIDED / REFUNDED' : 'COMPLETED'}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                              {sale.paymentType}
                            </span>
                          </div>

                          <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span>•</span>
                            <span>{itemCount} units</span>
                            <span>•</span>
                            <span>VAT: BD {vat.toFixed(3)}</span>
                          </p>

                          {/* Line items brief */}
                          {sale.items && sale.items.length > 0 && (
                            <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-1 italic">
                              {sale.items.map((i) => `${i.productName || i.name} (${i.quantity}x)`).join(', ')}
                            </p>
                          )}
                        </div>

                        {/* Amount & Void Button */}
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className={`text-base font-black ${isVoided ? 'line-through text-slate-500' : 'text-emerald-400'}`}>
                            BHD {total.toFixed(3)}
                          </span>

                          {!isVoided ? (
                            <button
                              type="button"
                              onClick={() => setConfirmSale(sale)}
                              disabled={voidingSaleId === sale.id}
                              className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-black text-xs cursor-pointer shadow-md transition-all flex items-center gap-1.5"
                              title="Void Bill & Restore Inventory (Manager PIN 9999)"
                            >
                              <Ban size={13} />
                              Void Bill
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                printCreditNote({
                                  invoiceNo: sale.invoiceNo,
                                  totalAmount: total,
                                  vatAmount: vat,
                                  date: sale.createdAt,
                                  items: sale.items || []
                                });
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-bold text-[11px] cursor-pointer transition-colors flex items-center gap-1"
                              title="Reprint Credit Note"
                            >
                              <PrinterIcon size={12} />
                              Reprint CN
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
