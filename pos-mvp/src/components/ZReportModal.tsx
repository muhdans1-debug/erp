import { useState, useEffect } from 'react';
import { X, Printer, Lock, RefreshCw, AlertCircle, Coins, ArrowDownRight, ArrowUpRight, Copy } from 'lucide-react';
import { printZReport } from '../utils/printer';

interface ZReportData {
  date: string;
  time: string;
  shiftId?: string | null;
  cashierName?: string;
  shiftStatus?: string;
  openedAt?: string;
  closedAt?: string | null;
  openingCash?: number;
  totalSales: number;
  cashSales: number;
  benefitSales: number;
  cardSales: number;
  refunds: number;
  drawerCashOut?: number;
  supplierPayments?: number;
  expectedDrawerCash: number;
  transactionCount: number;
  shiftExpensesCount?: number;
}

interface ZReportModalProps {
  onClose: () => void;
  apiBase?: string;
  shiftId?: string | null;
  onShiftClosed?: () => void;
}

export default function ZReportModal({ 
  onClose, 
  apiBase = 'http://localhost:3000',
  shiftId: propShiftId,
  onShiftClosed 
}: ZReportModalProps) {
  const [report, setReport] = useState<ZReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const fetchReport = () => {
    setLoading(true);
    setError(null);

    const activeId = propShiftId || (typeof window !== 'undefined' ? localStorage.getItem('active_shift_id') : null);
    const endpoint = activeId 
      ? `${apiBase}/api/reports/z-report/${activeId}`
      : `${apiBase}/api/reports/z-report`;

    fetch(endpoint)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.report) {
          setReport(data.report);
        } else {
          setError(data.error || 'Failed to load report');
        }
      })
      .catch((err) => {
        console.error(err);
        const fallbackOpening = parseFloat(localStorage.getItem('active_shift_opening_cash') || '50');
        setReport({
          date: new Date().toLocaleDateString('en-GB'),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          shiftId: activeId,
          cashierName: localStorage.getItem('active_shift_cashier') || 'Cashier 1',
          openingCash: fallbackOpening,
          totalSales: 0,
          cashSales: 0,
          benefitSales: 0,
          cardSales: 0,
          refunds: 0,
          drawerCashOut: 0,
          supplierPayments: 0,
          expectedDrawerCash: fallbackOpening,
          transactionCount: 0,
        });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchReport();
  }, [apiBase, propShiftId]);

  const [isPrintingOnly, setIsPrintingOnly] = useState(false);

  const handlePrintOnly = async () => {
    if (!report) return;
    setIsPrintingOnly(true);
    try {
      await printZReport({
        ...report,
        date: report.date || new Date().toLocaleDateString('en-GB'),
        time: report.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cashierName: report.cashierName || localStorage.getItem('active_shift_cashier') || 'Cashier 1',
        expectedDrawerCash: report.expectedDrawerCash
      });
    } finally {
      setIsPrintingOnly(false);
    }
  };

  const handlePrintAndClose = async () => {
    setIsClosing(true);

    // 1. Dispatch formatted 58mm Z-Slip directly to Sunmi Thermal Printer
    if (report) {
      try {
        await printZReport({
          ...report,
          date: report.date || new Date().toLocaleDateString('en-GB'),
          time: report.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          cashierName: report.cashierName || localStorage.getItem('active_shift_cashier') || 'Cashier 1',
          expectedDrawerCash: report.expectedDrawerCash
        });
      } catch (err) {
        console.warn('Physical thermal print warning, attempting browser print:', err);
        window.print();
      }
    }

    const targetShiftId = report?.shiftId || localStorage.getItem('active_shift_id') || localStorage.getItem('askar_shift_id');

    try {
      const url = targetShiftId && targetShiftId !== 'shift_current' && targetShiftId !== 'current'
        ? `${apiBase}/api/shifts/${targetShiftId}/close`
        : `${apiBase}/api/shifts/close`;
        
      let res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closingCash: report?.expectedDrawerCash,
          notes: `Auto-closed from Z-Report. Expected Drawer Cash: BD ${report?.expectedDrawerCash.toFixed(3)}`
        })
      });

      if (res.status === 404 && url !== `${apiBase}/api/shifts/close`) {
        await fetch(`${apiBase}/api/shifts/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            closingCash: report?.expectedDrawerCash,
            notes: `Auto-closed from Z-Report. Expected Drawer Cash: BD ${report?.expectedDrawerCash.toFixed(3)}`
          })
        });
      }

      // Broadcast SHIFT_CLOSED to Bridge
      const bridgeHost = typeof window !== 'undefined' 
        ? ((window as any).Capacitor?.isNativePlatform?.() ? '192.168.8.7' : (window.location.hostname || 'localhost')) 
        : '192.168.8.7';
      const candidateHosts = [bridgeHost, '192.168.8.7', 'localhost'].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);
      
      candidateHosts.forEach((host) => {
        try {
          const ws = new WebSocket(`ws://${host}:8080`);
          ws.onopen = () => {
            ws.send(JSON.stringify({ 
              type: 'SHIFT_CLOSED', 
              payload: { shiftId: targetShiftId, actualCash: report?.expectedDrawerCash, timestamp: new Date().toISOString() } 
            }));
            setTimeout(() => ws.close(), 1000);
          };
          ws.onerror = () => {};
        } catch {}
      });
    } catch (e) {
      console.error('Failed to mark shift as closed on backend:', e);
    }

    localStorage.removeItem('active_shift_id');
    localStorage.removeItem('askar_shift_id');
    localStorage.removeItem('active_shift_cashier');
    localStorage.removeItem('active_shift_opening_cash');

    setTimeout(() => {
      setIsClosing(false);
      alert('Shift Officially Closed & Reconciled. Till ready for next shift.');
      if (onShiftClosed) onShiftClosed();
      onClose();
    }, 800);
  };

  const openingFloat = Number(report?.openingCash ?? 50.0);
  const supplierPayouts = Number(report?.supplierPayments ?? report?.drawerCashOut ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-slate-100 animate-in zoom-in-95 max-h-[92vh]">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <Lock size={22} />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight">End of Day (Z-Report)</h3>
              <p className="text-xs text-slate-400 font-medium">
                Till Reconciliation & Shift Closeout {report?.shiftId ? `• ${report.shiftId}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full active:scale-90 transition-transform cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {loading ? (
            <div className="py-16 text-center text-slate-500 font-bold flex flex-col items-center gap-3">
              <RefreshCw className="animate-spin text-emerald-600" size={36} />
              <span>Balancing accounts & shift ledger...</span>
            </div>
          ) : error && !report ? (
            <div className="py-8 text-center space-y-3">
              <AlertCircle className="mx-auto text-red-500" size={36} />
              <p className="text-red-600 font-bold">{error}</p>
              <button
                onClick={fetchReport}
                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm cursor-pointer"
              >
                Retry Calculation
              </button>
            </div>
          ) : report ? (
            <>
              {/* Shift Metadata Banner */}
              <div className="flex justify-between items-center bg-slate-50 p-3.5 rounded-2xl border border-slate-100 text-xs">
                <div>
                  <span className="font-bold text-slate-800 block text-sm">
                    {report.cashierName || 'Cashier 1'}
                  </span>
                  <span className="text-slate-400 font-mono">
                    {report.date} · {report.time}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-black text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                    {report.transactionCount} Orders
                  </span>
                </div>
              </div>

              {/* Master Accounting Formula Section */}
              <div className="space-y-2.5 bg-slate-50/80 p-4 rounded-2xl border border-slate-200">
                <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">
                  Physical Till Cash Reconciliation
                </div>

                {/* 1. Opening Float */}
                <div className="flex justify-between text-sm items-center">
                  <span className="text-slate-600 flex items-center gap-1.5 font-medium">
                    <Coins size={16} className="text-emerald-600" />
                    Opening Float (Starting Till):
                  </span>
                  <span className="font-bold font-mono text-emerald-700">
                    + BD {openingFloat.toFixed(3)}
                  </span>
                </div>

                {/* 2. Customer Cash Sales */}
                <div className="flex justify-between text-sm items-center">
                  <span className="text-slate-600 flex items-center gap-1.5 font-medium">
                    <ArrowUpRight size={16} className="text-emerald-600" />
                    Customer Cash Inflows:
                  </span>
                  <span className="font-bold font-mono text-slate-800">
                    + BD {report.cashSales.toFixed(3)}
                  </span>
                </div>

                {/* 3. Customer Cash Refunds */}
                {report.refunds > 0 && (
                  <div className="flex justify-between text-sm items-center text-red-600">
                    <span className="flex items-center gap-1.5 font-medium">
                      <ArrowDownRight size={16} className="text-red-500" />
                      Cash Returned (Refunds):
                    </span>
                    <span className="font-bold font-mono">
                      - BD {report.refunds.toFixed(3)}
                    </span>
                  </div>
                )}

                {/* 4. Cash Drawer Payouts / Supplier Payments */}
                {supplierPayouts > 0 && (
                  <div className="flex justify-between text-sm items-center text-amber-700">
                    <span className="flex items-center gap-1.5 font-medium">
                      <ArrowDownRight size={16} className="text-amber-600" />
                      Supplier Payouts (Almarai/Distributors):
                    </span>
                    <span className="font-bold font-mono">
                      - BD {supplierPayouts.toFixed(3)}
                    </span>
                  </div>
                )}

                {/* Master Expected Drawer Balance */}
                <div className="pt-3 border-t border-slate-200 mt-2 flex justify-between items-center">
                  <div>
                    <span className="block text-[11px] uppercase text-emerald-700 tracking-wider font-extrabold">
                      Reconciled Till Balance
                    </span>
                    <span className="text-base font-black text-slate-900">
                      Expected Drawer Cash:
                    </span>
                  </div>
                  <div className="text-2xl font-black text-emerald-600 font-mono">
                    BD {report.expectedDrawerCash.toFixed(3)}
                  </div>
                </div>
              </div>

              {/* Digital & Card Inflows */}
              <div className="space-y-2 text-sm pt-1 border-t border-slate-100">
                <div className="flex justify-between text-slate-600">
                  <span>Benefit Pay (Digital QR):</span>
                  <span className="font-bold font-mono text-slate-800">BD {report.benefitSales.toFixed(3)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Card Payments (Visa / Master):</span>
                  <span className="font-bold font-mono text-slate-800">BD {report.cardSales.toFixed(3)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-800 pt-1 border-t border-slate-100">
                  <span>Total All Channels Revenue:</span>
                  <span className="font-mono">BD {report.totalSales.toFixed(3)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 mt-4">
                <button
                  type="button"
                  onClick={handlePrintAndClose}
                  disabled={isClosing || isPrintingOnly}
                  className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-base rounded-2xl transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
                >
                  <Printer size={20} />
                  <span>{isClosing ? 'Finalizing Closeout & Printing...' : 'Print Z-Slip & Close Shift'}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintOnly}
                  disabled={isClosing || isPrintingOnly}
                  className="w-full h-11 bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 border border-slate-200"
                >
                  <Copy size={15} />
                  <span>{isPrintingOnly ? 'Sending to Thermal Printer...' : 'Print Z-Slip Copy (Keep Shift Open)'}</span>
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* --- HIDDEN THERMAL RECEIPT (Formatted for 58mm / 80mm Sunmi Thermal Paper) --- */}
      {report && (
        <div className="hidden print:block print-receipt">
          <div style={{ textAlign: 'center', marginBottom: '8px', borderBottom: '1px dashed black', paddingBottom: '6px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 2px 0' }}>ASKAR SUPERMARKET</h2>
            <p style={{ fontWeight: 'bold', margin: 0, fontSize: '13px' }}>END OF SHIFT Z-REPORT</p>
            <p style={{ margin: '2px 0 0 0', fontSize: '11px' }}>{report.date} {report.time}</p>
            <p style={{ margin: 0, fontSize: '10px' }}>Cashier: {report.cashierName || 'Cashier 1'} | Shift: {report.shiftId || 'DAY'}</p>
          </div>

          {/* Opening Float & Drawer Formula */}
          <div style={{ marginBottom: '8px', borderBottom: '1px dashed black', paddingBottom: '6px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>OPENING FLOAT:</span>
              <span>BD {openingFloat.toFixed(3)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>CASH SALES:</span>
              <span>+BD {report.cashSales.toFixed(3)}</span>
            </div>
            {report.refunds > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>REFUNDS:</span>
                <span>-BD {report.refunds.toFixed(3)}</span>
              </div>
            )}
            {supplierPayouts > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>SUPPLIER PAYOUTS:</span>
                <span>-BD {supplierPayouts.toFixed(3)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginTop: '4px', fontSize: '13px' }}>
              <span>EXPECTED CASH:</span>
              <span>BD {report.expectedDrawerCash.toFixed(3)}</span>
            </div>
          </div>

          {/* Sales Breakdown */}
          <div style={{ marginBottom: '8px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>BENEFIT PAY:</span>
              <span>BD {report.benefitSales.toFixed(3)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>CARD SALES:</span>
              <span>BD {report.cardSales.toFixed(3)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
              <span>TOTAL SALES:</span>
              <span>BD {report.totalSales.toFixed(3)}</span>
            </div>
          </div>

          <div style={{ textAlign: 'center', borderTop: '1px dashed black', paddingTop: '8px', fontSize: '11px' }}>
            <p style={{ margin: 0 }}>Total Transactions: {report.transactionCount}</p>
            <p style={{ margin: '4px 0 0 0', fontWeight: 'bold' }}>*** TILL BALANCED & CLOSED ***</p>
          </div>
        </div>
      )}
    </div>
  );
}
