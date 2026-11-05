import { useState, useEffect } from 'react';
import { Coins, CheckCircle, Calculator, Lock, AlertTriangle, Unlock } from 'lucide-react';
import { printShiftCloseout, kickCashDrawer } from '../utils/printer';
import { useSunmiBridge } from '../hooks/useSunmiBridge';
import { db } from '../db';

interface BlindCloseShiftModalProps {
  shiftId: string;
  cashierName: string;
  apiBase?: string;
  onSuccess: (reconciliation: any) => void;
  onCancel: () => void;
}

export default function BlindCloseShiftModal({
  shiftId,
  cashierName,
  apiBase: propApiBase,
  onSuccess,
  onCancel
}: BlindCloseShiftModalProps) {
  const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.();
  const getCandidateApiBases = (): string[] => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('master_server_url') : null;
    const host = typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'localhost';
    return [
      saved,
      propApiBase,
      isNative ? 'http://192.168.8.7:3000' : null,
      `http://${host}:3000`,
      'http://192.168.8.7:3000',
      'http://localhost:3000'
    ].filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i);
  };

  const [resolvedShiftId, setResolvedShiftId] = useState<string>(shiftId || '');
  const { broadcastShiftClosed } = useSunmiBridge();

  useEffect(() => {
    // Resolve true active shift from server across candidates
    const checkCurrentShift = async () => {
      const candidates = getCandidateApiBases();
      for (const base of candidates) {
        try {
          const res = await fetch(`${base}/api/shifts/current`);
          if (res.ok) {
            const data = await res.json();
            if (data.hasActiveShift && data.shift?.id) {
              setResolvedShiftId(data.shift.id);
              localStorage.setItem('active_shift_id', data.shift.id);
              localStorage.setItem('askar_shift_id', data.shift.id);
              return;
            }
          }
        } catch {}
      }
    };
    checkCurrentShift();
  }, []);

  // ⚡ Auto-pop hardware cash drawer so cashier can physically count notes and coins
  useEffect(() => {
    kickCashDrawer().catch(() => {});
  }, []);

  const [denominations, setDenominations] = useState<{ [key: string]: number }>({
    '20': 0,
    '10': 0,
    '5': 0,
    '1': 0,
    '0.500': 0,
    '0.100': 0,
    '0.050': 0,
    '0.025': 0,
  });

  const [manualCash, setManualCash] = useState<string>('');
  const [useDenominationPad, setUseDenominationPad] = useState(true);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute calculated cash from denominations
  const totalCountedFromDenominations = Object.entries(denominations).reduce((acc, [denom, count]) => {
    return acc + (parseFloat(denom) * (count || 0));
  }, 0);

  const parsedManual = parseFloat(manualCash);
  const actualCashTotal = useDenominationPad 
    ? totalCountedFromDenominations 
    : (isNaN(parsedManual) ? 0 : parsedManual);

  const updateCount = (denom: string, delta: number) => {
    setDenominations(prev => {
      const current = prev[denom] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [denom]: next };
    });
  };

  const handleSubmitBlindClose = async () => {
    if (actualCashTotal < 0 || (actualCashTotal === 0 && !window.confirm('Are you sure there is 0.000 BHD in the drawer?'))) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const payload = {
      actualCash: actualCashTotal,
      closingCash: actualCashTotal,
      shiftId: resolvedShiftId || shiftId || undefined,
      denominations: useDenominationPad ? denominations : null,
      notes: notes ? notes.trim() : null
    };

    try {
      const targetId = resolvedShiftId || shiftId;
      const candidates = getCandidateApiBases();
      let res: Response | null = null;
      let usedBase = candidates[0] || 'http://localhost:3000';

      for (const base of candidates) {
        try {
          const url = targetId && targetId !== 'shift_current' && targetId !== 'current'
            ? `${base}/api/shifts/${targetId}/close`
            : `${base}/api/shifts/close`;

          let attempt = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (attempt.status === 404 && url !== `${base}/api/shifts/close`) {
            attempt = await fetch(`${base}/api/shifts/close`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
          }

          if (attempt.ok) {
            res = attempt;
            usedBase = base;
            break;
          }
        } catch {}
      }

      // Also ensure offline local SQLite records the shift close
      try {
        const localShiftId = targetId || `shift_${Date.now().toString(36)}`;
        await db.execute({
          sql: `INSERT INTO ShiftSession (
                  id, tenantId, employee_id, opened_at, closed_at,
                  starting_cash, expected_cash, actual_cash, variance, status
                ) VALUES (?, 'tenant_1', 'emp_cashier_1', datetime('now'), CURRENT_TIMESTAMP, 50, 50, ?, 0, 'CLOSED')
                ON CONFLICT(id) DO UPDATE SET
                  closed_at = CURRENT_TIMESTAMP,
                  actual_cash = excluded.actual_cash,
                  variance = ROUND(excluded.actual_cash - COALESCE(ShiftSession.expected_cash, 50), 3),
                  status = 'CLOSED'`,
          args: [localShiftId, actualCashTotal]
        });
        await db.sync(usedBase);
      } catch (localErr) {
        console.warn('Local db shift session save notice:', localErr);
      }

      if (!res) {
        throw new Error('Could not reach POS server at any candidate endpoint.');
      }

      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.removeItem('active_shift_id');
        localStorage.removeItem('askar_shift_id');
        localStorage.removeItem('active_shift_cashier');
        localStorage.removeItem('active_shift_opening_cash');

        // 1. Force an immediate sync to the Turso cloud (Do not wait for 10-second loop)
        try {
          await db.sync(usedBase);
        } catch (syncErr) {
          console.warn('⚡ [Shift Close] Turso cloud sync notice:', syncErr);
        }

        // 2. Ping the Laptop across the RJ45 cable to refresh its screen instantly
        try {
          const shiftClosedPayload = {
            shiftId: data.shiftId || resolvedShiftId || shiftId,
            actualCash: actualCashTotal,
            reconciliation: data.reconciliation,
            timestamp: new Date().toISOString()
          };
          broadcastShiftClosed(shiftClosedPayload);

          // Direct socket ping fallback to host machine(s)
          const bridgeHost = typeof window !== 'undefined' 
            ? ((window as any).Capacitor?.isNativePlatform?.() ? '192.168.8.7' : (window.location.hostname || 'localhost')) 
            : '192.168.8.7';
          const candidateHosts = [bridgeHost, '192.168.8.7', 'localhost'].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);
          
          candidateHosts.forEach((host) => {
            try {
              const ws = new WebSocket(`ws://${host}:8080`);
              ws.onopen = () => {
                ws.send(JSON.stringify({ type: 'SHIFT_CLOSED', payload: shiftClosedPayload }));
                setTimeout(() => ws.close(), 1000);
              };
              ws.onerror = () => {};
            } catch {}
          });
        } catch (wsErr) {
          console.warn('⚡ [Shift Close] RJ45 WebSocket ping notice:', wsErr);
        }

        console.log("Shift closed and synced successfully.");

        // Physical 58mm thermal receipt print on Sunmi terminal
        try {
          const recon = data.reconciliation || {};
          await printShiftCloseout({
            shiftId: data.shiftId || resolvedShiftId || shiftId || 'SHIFT-CLOSE',
            cashierName: cashierName || 'Cashier 1',
            startingFloat: Number(recon.startingFloat || 0),
            cashSales: Number(recon.cashSales || 0),
            supplierPayouts: Number(recon.paidOuts || 0),
            expectedCash: Number(recon.expectedCash ?? actualCashTotal),
            actualCash: Number(recon.actualCash ?? actualCashTotal),
            variance: Number(recon.variance || 0),
            verdict: recon.verdict || (Number(recon.variance || 0) === 0 ? 'PERFECT' : (Number(recon.variance || 0) < 0 ? 'SHORT' : 'OVER')),
            denominations: useDenominationPad ? denominations : null,
            notes: notes ? notes.trim() : null
          });
        } catch (printErr) {
          console.warn('Physical print error:', printErr);
        }

        onSuccess(data.reconciliation || { actualCash: actualCashTotal });
      } else {
        setError(data.error || 'Failed to submit blind closeout.');
      }
    } catch (e: any) {
      setError(e?.message || 'Network error while submitting blind closeout.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col border border-slate-100 max-h-[95vh]">
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <h2 className="text-xl font-black tracking-tight">Blind Shift Closeout</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Cashier: <strong className="text-white">{cashierName}</strong> · Session: {shiftId}
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-amber-500/20 text-amber-300 px-3 py-1.5 rounded-xl border border-amber-500/30 text-xs font-bold font-mono">
            <Lock size={14} />
            <span>BLIND AUDIT</span>
          </div>
        </div>

        {/* Security Alert & Manual Drawer Trigger */}
        <div className="bg-amber-50 border-b border-amber-100 p-3.5 px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={18} className="text-amber-600 shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed font-medium">
              <strong>System Security Rule:</strong> Expected till balance is kept blind. Please physically count all coins and notes currently in the drawer and declare below.
            </p>
          </div>
          <button
            type="button"
            onClick={() => kickCashDrawer()}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer whitespace-nowrap"
            title="Re-open cash drawer"
          >
            <Unlock size={14} />
            <span>Pop Drawer</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Mode Switcher */}
          <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => setUseDenominationPad(true)}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                useDenominationPad ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Calculator size={15} />
              <span>Bahrain Denominations Pad</span>
            </button>
            <button
              type="button"
              onClick={() => setUseDenominationPad(false)}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                !useDenominationPad ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Coins size={15} />
              <span>Direct Amount Entry</span>
            </button>
          </div>

          {useDenominationPad ? (
            /* Bahrain Currency Denomination Grid */
            <div className="grid grid-cols-2 gap-3">
              {[
                { denom: '20', label: '20 BHD Note' },
                { denom: '10', label: '10 BHD Note' },
                { denom: '5', label: '5 BHD Note' },
                { denom: '1', label: '1 BHD Note' },
                { denom: '0.500', label: '500 Fils Note' },
                { denom: '0.100', label: '100 Fils Coin' },
                { denom: '0.050', label: '50 Fils Coin' },
                { denom: '0.025', label: '25 Fils Coin' },
              ].map(({ denom, label }) => {
                const count = denominations[denom] || 0;
                const sub = (parseFloat(denom) * count).toFixed(3);
                return (
                  <div key={denom} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-800">{label}</div>
                      <div className="text-[11px] font-mono text-slate-400">= {sub} BHD</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateCount(denom, -1)}
                        className="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm flex items-center justify-center cursor-pointer"
                      >
                        -
                      </button>
                      <span className="w-8 text-center font-black font-mono text-sm text-slate-900">
                        {count}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateCount(denom, 1)}
                        className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm flex items-center justify-center cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Manual Amount Entry */
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                Total Counted Cash in Drawer (BHD)
              </label>
              <input
                type="number"
                step="0.005"
                placeholder="0.000"
                value={manualCash}
                onChange={(e) => setManualCash(e.target.value)}
                className="w-full text-2xl font-black font-mono p-3 bg-white border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}

          {/* Grand Declared Total Box */}
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
            <span className="text-sm font-bold text-emerald-900 flex items-center gap-2">
              <Coins size={18} className="text-emerald-700" />
              Declared Actual Cash in Drawer:
            </span>
            <span className="text-2xl font-black font-mono text-emerald-700">
              BHD {actualCashTotal.toFixed(3)}
            </span>
          </div>

          {/* Handover Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
              Handover Notes / Discrepancy Comments (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g., Almarai delivery rep paid BHD 10 from till"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-200">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmitBlindClose}
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-md flex items-center gap-2 cursor-pointer transition"
          >
            {isSubmitting ? (
              <span>Submitting Blind Count...</span>
            ) : (
              <>
                <CheckCircle size={16} className="text-emerald-400" />
                <span>Confirm Blind Close & Print</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
