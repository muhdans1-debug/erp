import { useState } from 'react';
import { Play, Coins, ShieldCheck, User } from 'lucide-react';

interface StartShiftModalProps {
  cashierName: string;
  employeeId?: string;
  onShiftStart: (shiftId: string, openingCash?: number) => void;
  onCancel?: () => void;
  apiBase?: string;
}

export default function StartShiftModal({ 
  cashierName, 
  employeeId,
  onShiftStart, 
  onCancel,
  apiBase = 'http://localhost:3000' 
}: StartShiftModalProps) {
  const [openingCash, setOpeningCash] = useState('50.000');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const presetFloats = [25, 50, 70, 100];

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    const floatAmount = parseFloat(openingCash);
    if (isNaN(floatAmount) || floatAmount < 0) {
      setError('Please enter a valid cash amount.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Send to Fastify backend to create a new "OPEN" shift
      const res = await fetch(`${apiBase}/api/shifts/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          cashierName: cashierName || 'Cashier',
          employeeId: employeeId || 'emp_cashier_1',
          openingCash: floatAmount 
        })
      });
      
      const data = await res.json();
      if (data.success && data.shiftId) {
        // Save shift ID in parent state and storage
        localStorage.setItem('active_shift_id', data.shiftId);
        localStorage.setItem('active_shift_cashier', cashierName);
        localStorage.setItem('active_shift_opening_cash', String(floatAmount));
        onShiftStart(data.shiftId, floatAmount);
      } else {
        setError(data.error || 'Failed to start shift');
      }
    } catch (err: any) {
      console.error('Error starting shift:', err);
      // Offline fallback
      const fallbackShiftId = `shift_${Date.now()}`;
      localStorage.setItem('active_shift_id', fallbackShiftId);
      localStorage.setItem('active_shift_cashier', cashierName);
      localStorage.setItem('active_shift_opening_cash', String(floatAmount));
      onShiftStart(fallbackShiftId, floatAmount);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden p-6 sm:p-8 border border-slate-100 animate-in zoom-in-95">
        
        {/* Header Icon */}
        <div className="flex items-center justify-between mb-4">
          <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center shadow-xs">
            <Coins size={30} />
          </div>
          <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-700 px-3 py-1 rounded-full">
            <User size={13} className="text-blue-600" />
            {cashierName || 'Terminal 1'}
          </span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Open Cash Register</h2>
        <p className="text-slate-500 font-medium text-sm mt-1 mb-6 leading-relaxed">
          Count the starting cash float left in the till. This baseline protects against cash discrepancies when paying delivery drivers.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold">
            {error}
          </div>
        )}
        
        <form onSubmit={handleStart} className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-600">
                Opening Float Till (BD)
              </label>
              <span className="text-xs text-slate-400 font-semibold">Petty Cash / Change</span>
            </div>

            <div className="relative">
              <input 
                type="number" 
                step="0.001" 
                min="0"
                required 
                autoFocus
                value={openingCash} 
                onChange={(e) => setOpeningCash(e.target.value)}
                className="w-full text-4xl font-black p-4 bg-slate-50 border-2 border-slate-200 focus:border-emerald-500 focus:bg-white rounded-2xl outline-none font-mono tracking-tight transition-all text-slate-900" 
                placeholder="50.000" 
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400 font-mono">
                BD
              </span>
            </div>
          </div>

          {/* Quick Preset Float Chips */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase">Presets:</span>
            {presetFloats.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setOpeningCash(amt.toFixed(3))}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all ${
                  parseFloat(openingCash) === amt 
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' 
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
              >
                BD {amt}
              </button>
            ))}
          </div>

          {/* Educational notice */}
          <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl flex items-start gap-2.5 text-xs text-blue-800">
            <ShieldCheck size={18} className="text-blue-600 shrink-0 mt-0.5" />
            <p className="leading-snug">
              When supplier deliveries (e.g. Almarai) arrive, tap <strong>Record Cash Out</strong> to pay drivers from this float. The final Z-Report will reconcile drawer balance automatically.
            </p>
          </div>
          
          <div className="flex gap-3 mt-3">
            {onCancel && (
              <button 
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="w-1/3 h-14 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-base rounded-2xl active:scale-98 transition-all cursor-pointer flex items-center justify-center"
              >
                Cancel
              </button>
            )}
            <button 
              type="submit" 
              disabled={loading}
              className={`${onCancel ? 'w-2/3' : 'w-full'} h-14 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-base rounded-2xl transition-all shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50`}
            >
              <Play fill="currentColor" size={18} /> 
              <span>{loading ? 'Starting...' : 'Accept & Start'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
