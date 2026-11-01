import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Truck, 
  X, 
  Barcode, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Plus, 
  Minus, 
  Check, 
  ChevronRight, 
  ArrowLeft,
  PackageCheck,
  ShieldCheck,
  Delete
} from 'lucide-react';

export interface POItem {
  id: string;
  name: string;
  barcode?: string;
  unitCost: number;
  reorderQuantity: number;
  received_qty?: number;
  expected_qty?: number;
}

export interface PurchaseOrder {
  id: string;
  supplierName: string;
  status: string;
  estimatedCost: number;
  whatsappNumber?: string;
  itemsJson: string | POItem[];
  createdAt: string;
}

export interface ReceivingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
  onCatalogRefresh?: () => void;
  registerScanListener?: (callback: ((barcode: string) => boolean) | null) => void;
}

export default function ReceivingDrawer({
  isOpen,
  onClose,
  apiBase,
  onCatalogRefresh,
  registerScanListener
}: ReceivingDrawerProps) {
  // Manager PIN Security State
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // Deliveries State
  const [transitOrders, setTransitOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [auditedItems, setAuditedItems] = useState<POItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);

  // Keep refs to avoid stale closure or effect re-trigger loops
  const auditedItemsRef = useRef<POItem[]>([]);
  auditedItemsRef.current = auditedItems;

  const selectedPORef = useRef<PurchaseOrder | null>(null);
  selectedPORef.current = selectedPO;

  const isUnlockedRef = useRef(false);
  isUnlockedRef.current = isUnlocked;

  const isOpenRef = useRef(false);
  isOpenRef.current = isOpen;

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

  // Fetch In-Transit POs (strictly updates order list, NEVER wipes active audited items)
  const fetchTransitPOs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/purchase-orders/transit`);
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.orders)) {
        setTransitOrders(data.orders);
      }
    } catch (err) {
      console.warn('Failed to load in-transit purchase orders:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  // Seed sample in-transit PO if list is empty
  const handleSeedDemoPO = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/purchase-orders/seed-transit`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage({ text: '🚚 Almarai delivery order generated!', type: 'success' });
        await fetchTransitPOs();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Only run when isOpen toggles
  useEffect(() => {
    if (isOpen) {
      setPinInput('');
      setPinError(false);
      fetchTransitPOs();
    } else {
      setIsUnlocked(false);
      setSelectedPO(null);
      setAuditedItems([]);
      setStatusMessage(null);
      setLastScannedCode(null);
    }
  }, [isOpen, fetchTransitPOs]);

  // When user taps on a PO to receive, unpack its items ONCE into state
  const handleSelectPO = (po: PurchaseOrder) => {
    setSelectedPO(po);
    setStatusMessage(null);
    let rawItems: POItem[] = [];
    try {
      rawItems = typeof po.itemsJson === 'string'
        ? JSON.parse(po.itemsJson)
        : (po.itemsJson || []);
    } catch {
      rawItems = [];
    }

    const initial = rawItems.map((item) => ({
      ...item,
      received_qty: typeof item.received_qty === 'number' ? item.received_qty : 0
    }));

    setAuditedItems(initial);
  };

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

  // Barcode Scan Handler for Drawer Auditing
  const handleReceivingScan = useCallback((scannedBarcode: string): boolean => {
    if (!isOpenRef.current || !isUnlockedRef.current || !selectedPORef.current) return false;

    const clean = scannedBarcode.trim().toLowerCase();
    setLastScannedCode(scannedBarcode.trim());

    const currentItems = auditedItemsRef.current;
    const index = currentItems.findIndex((item) => {
      const b = (item.barcode || '').toLowerCase();
      const id = (item.id || '').toLowerCase();
      return b === clean || id === clean;
    });

    if (index !== -1) {
      const target = currentItems[index];
      const nextQty = (target.received_qty || 0) + 1;
      
      setAuditedItems((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], received_qty: nextQty };
        return next;
      });

      playBeep(true);
      const expected = target.reorderQuantity || target.expected_qty || 0;
      setStatusMessage({
        text: `✓ Verified: ${target.name} (${nextQty}/${expected})`,
        type: 'success'
      });
      return true; // Intercepted: Do NOT add to customer checkout cart!
    } else {
      playBeep(false);
      setStatusMessage({
        text: `⚠️ Item [${scannedBarcode}] not found in this delivery manifest!`,
        type: 'error'
      });
      return true; // Intercepted: keep scanner isolated inside drawer
    }
  }, [playBeep]);

  // Register scan listener with CheckoutScreen
  useEffect(() => {
    if (!registerScanListener) return;

    if (isOpen && isUnlocked && selectedPO) {
      registerScanListener(handleReceivingScan);
    } else {
      registerScanListener(null);
    }

    return () => {
      registerScanListener(null);
    };
  }, [isOpen, isUnlocked, selectedPO, registerScanListener, handleReceivingScan]);

  // Manual quantity adjust
  const handleAdjustQty = (index: number, delta: number) => {
    setAuditedItems((prev) => {
      const next = [...prev];
      const current = Number(next[index].received_qty || 0);
      next[index] = { ...next[index], received_qty: Math.max(0, current + delta) };
      return next;
    });
  };

  // Mark all as verified in 1-tap
  const handleVerifyAll = () => {
    setAuditedItems((prev) =>
      prev.map((item) => {
        const expected = Number(item.reorderQuantity || item.expected_qty || 1);
        return {
          ...item,
          received_qty: expected
        };
      })
    );
    playBeep(true);
    setStatusMessage({ text: 'All items marked as fully received.', type: 'info' });
  };

  // Metrics
  const auditMetrics = useMemo(() => {
    let totalExpected = 0;
    let totalReceived = 0;
    for (const item of auditedItems) {
      const exp = Number(item.reorderQuantity || item.expected_qty || 0);
      const rec = Number(item.received_qty || 0);
      totalExpected += exp;
      totalReceived += rec;
    }
    const percent = totalExpected > 0 ? Math.min(100, Math.round((totalReceived / totalExpected) * 100)) : 0;
    return { totalExpected, totalReceived, percent };
  }, [auditedItems]);

  // Finalize Receipt: Commit to SQLite and Update Inventory
  const handleApproveAndReceive = async () => {
    if (!selectedPO) return;
    setSubmitting(true);
    setStatusMessage(null);

    try {
      // If user hasn't verified individual units, default to receiving full expected quantities
      const itemsToIngest = auditedItems.map((i) => {
        const expected = Number(i.reorderQuantity || i.expected_qty || 1);
        const received = typeof i.received_qty === 'number' && i.received_qty > 0 ? i.received_qty : expected;
        return {
          id: i.id,
          barcode: i.barcode,
          qty: received,
          name: i.name
        };
      });

      const payload = { receivedItems: itemsToIngest };

      const res = await fetch(`${apiBase}/api/purchase-orders/${selectedPO.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        playBeep(true);
        setStatusMessage({ text: `🎉 Delivery received! SQLite stock updated.`, type: 'success' });
        if (onCatalogRefresh) onCatalogRefresh();

        setTimeout(() => {
          setSelectedPO(null);
          fetchTransitPOs();
          onClose();
        }, 900);
      } else {
        setStatusMessage({ text: data.error || 'Failed to update inventory', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Network error updating stock', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`fixed inset-y-0 right-0 w-full sm:w-2/3 lg:w-1/2 bg-slate-900 text-white z-40 transform transition-transform duration-300 ease-in-out shadow-2xl flex flex-col border-l border-slate-700/80 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {/* DRAWER TOP HEADER */}
      <div className="h-14 bg-slate-950 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <Truck size={18} />
          </div>
          <div>
            <h2 className="text-sm font-black tracking-wide text-white flex items-center gap-2">
              RECEIVING DRAWER
              {isUnlocked && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  MANAGER VERIFIED
                </span>
              )}
            </h2>
            <p className="text-[11px] text-slate-400">Front-Counter Delivery & Barcode Verification</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          title="Close Receiving Drawer"
        >
          <X size={18} />
        </button>
      </div>

      {/* BODY CONTENT */}
      <div className="flex-1 overflow-y-auto flex flex-col p-4">
        {/* VIEW 1: PIN AUTHENTICATION REQUIRED */}
        {!isUnlocked ? (
          <div className="flex-1 flex flex-col items-center justify-center max-w-xs mx-auto py-4">
            <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 text-amber-400 flex items-center justify-center mb-3">
              <ShieldCheck size={28} />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Manager PIN Required</h3>
            <p className="text-xs text-slate-400 text-center mb-6">
              Enter 4-digit Manager PIN (9999) to unlock delivery receiving & stock ingestion.
            </p>

            {/* PIN Dots */}
            <div className={`flex items-center gap-3 mb-6 ${pinError ? 'animate-bounce text-red-400' : ''}`}>
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border transition-all ${
                    pinInput.length > idx
                      ? 'bg-emerald-400 border-emerald-300 scale-110 shadow-xs shadow-emerald-500'
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
        ) : !selectedPO ? (
          /* VIEW 2: IN-TRANSIT PURCHASE ORDERS LIST */
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                In-Transit Shipments ({transitOrders.length})
              </span>
              <button
                type="button"
                onClick={fetchTransitPOs}
                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-bold cursor-pointer"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {transitOrders.length === 0 ? (
              <div className="bg-slate-800/60 border border-dashed border-slate-700 rounded-xl p-8 text-center my-6 flex flex-col items-center">
                <Truck size={36} className="text-slate-500 mb-2" />
                <h4 className="text-sm font-bold text-slate-300 mb-1">No In-Transit Deliveries</h4>
                <p className="text-xs text-slate-400 mb-4 max-w-xs">
                  There are currently no supplier shipments marked as IN_TRANSIT or APPROVED.
                </p>
                <button
                  type="button"
                  onClick={handleSeedDemoPO}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Plus size={14} /> Create Test Delivery (Almarai Milk)
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {transitOrders.map((po) => {
                  let itemsCount = 0;
                  try {
                    const parsed = typeof po.itemsJson === 'string' ? JSON.parse(po.itemsJson) : po.itemsJson;
                    itemsCount = Array.isArray(parsed) ? parsed.length : 0;
                  } catch (_) {}

                  return (
                    <div
                      key={po.id}
                      onClick={() => handleSelectPO(po)}
                      className="bg-slate-800/90 hover:bg-slate-750 border border-slate-700/80 hover:border-emerald-500/50 rounded-xl p-4 transition-all cursor-pointer flex items-center justify-between group shadow-xs"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mt-0.5 shrink-0">
                          <Truck size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-black text-white group-hover:text-emerald-300 transition-colors">
                              {po.supplierName}
                            </h4>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              {po.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            PO #{po.id.slice(0, 8).toUpperCase()} • {itemsCount} items expected
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Est. Value: BD {Number(po.estimatedCost || 0).toFixed(3)} • {new Date(po.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-emerald-400 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                          Receive <ChevronRight size={16} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* VIEW 3: PO ITEM AUDIT & BARCODE SCANNING */
          <div className="flex-1 flex flex-col">
            {/* Top Back & Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedPO(null)}
                className="text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft size={14} /> Back to Shipments
              </button>

              <button
                type="button"
                onClick={handleVerifyAll}
                className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20 active:scale-95 transition-all"
              >
                <CheckCircle2 size={13} /> Verify All Expected
              </button>
            </div>

            {/* Active PO Banner */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5 my-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-black text-white">{selectedPO.supplierName}</h3>
                  <p className="text-[11px] text-slate-400">PO #{selectedPO.id.slice(0, 8).toUpperCase()}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-emerald-400">
                    {auditMetrics.totalReceived} / {auditMetrics.totalExpected} Units
                  </span>
                  <div className="text-[10px] text-slate-400">{auditMetrics.percent}% Verified</div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${auditMetrics.percent}%` }}
                />
              </div>
            </div>

            {/* Scanner Active Banner */}
            <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-lg px-3 py-2 mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-emerald-300 font-bold">
                <Barcode size={16} className="animate-pulse text-emerald-400" />
                <span>Pull SUNMI Scanner trigger on incoming boxes</span>
              </div>
              {lastScannedCode && (
                <span className="text-[10px] font-mono bg-emerald-900/60 px-2 py-0.5 rounded text-emerald-200 border border-emerald-500/30">
                  Last: {lastScannedCode}
                </span>
              )}
            </div>

            {/* Live Status Toast */}
            {statusMessage && (
              <div
                className={`text-xs font-bold px-3 py-2 rounded-lg mb-3 flex items-center gap-2 ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : statusMessage.type === 'error'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                }`}
              >
                {statusMessage.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
                <span>{statusMessage.text}</span>
              </div>
            )}

            {/* Items List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {auditedItems.map((item, idx) => {
                const expected = Number(item.reorderQuantity || item.expected_qty || 0);
                const received = Number(item.received_qty || 0);
                const isComplete = received >= expected && expected > 0;

                return (
                  <div
                    key={item.id || idx}
                    className={`p-3 rounded-xl border transition-all ${
                      isComplete
                        ? 'bg-emerald-950/30 border-emerald-500/40'
                        : 'bg-slate-800/80 border-slate-700/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {isComplete && <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />}
                          <h4 className="text-xs font-bold text-white truncate">{item.name}</h4>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-900 rounded text-slate-400 border border-slate-700">
                            {item.barcode || item.id}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Cost: BD {Number(item.unitCost || 0).toFixed(3)}
                          </span>
                        </div>
                      </div>

                      {/* Quantity Stepper */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleAdjustQty(idx, -1)}
                          className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-200 flex items-center justify-center cursor-pointer"
                        >
                          <Minus size={14} />
                        </button>
                        <div className="w-12 text-center">
                          <span className={`text-sm font-black ${isComplete ? 'text-emerald-400' : 'text-white'}`}>
                            {received}
                          </span>
                          <span className="text-[10px] text-slate-400 block -mt-1">/ {expected}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAdjustQty(idx, 1)}
                          className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white flex items-center justify-center cursor-pointer shadow-xs"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Finalize Button */}
            <div className="pt-3 border-t border-slate-800 mt-2">
              <button
                type="button"
                onClick={handleApproveAndReceive}
                disabled={submitting || auditedItems.length === 0}
                className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-black text-sm tracking-wide transition-all active:scale-[0.99] cursor-pointer shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2"
              >
                <PackageCheck size={18} />
                {submitting
                  ? 'Updating SQLite Inventory...'
                  : auditMetrics.totalReceived > 0
                  ? `Receive & Ingest Stock (${auditMetrics.totalReceived} units)`
                  : `Receive All Expected (${auditMetrics.totalExpected} units)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
