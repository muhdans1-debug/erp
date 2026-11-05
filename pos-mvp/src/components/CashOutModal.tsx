import { useState } from 'react';
import { MinusCircle, X, Banknote, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { kickCashDrawer } from '../utils/printer';

interface CashOutModalProps {
  onClose: () => void;
  apiBase?: string;
  onExpenseRecorded?: () => void;
}

export default function CashOutModal({ onClose, apiBase: propApiBase, onExpenseRecorded }: CashOutModalProps) {
  const apiBase = propApiBase || (typeof window !== 'undefined' ? localStorage.getItem('master_server_url') || 'http://localhost:3000' : 'http://localhost:3000');
  
  const [formData, setFormData] = useState({
    type: 'BUSINESS' as 'BUSINESS' | 'PERSONAL',
    category: 'RENT',
    amount: '',
    description: '',
    recordedBy: 'Manager'
  });

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(formData.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setFeedback({ type: 'error', message: 'Please enter a valid amount greater than 0.' });
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch(`${apiBase}/api/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          amount: numAmount,
        }),
      });

      const data = await res.json();
      if (data.success) {
        // ⚡ Pop cash drawer so cashier/manager can physically extract cash
        kickCashDrawer().catch((err) => console.warn('CashOut drawer kick error:', err));

        setFeedback({ type: 'success', message: 'Expense recorded! Cash drawer balance adjusted.' });
        if (onExpenseRecorded) onExpenseRecorded();
        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        setFeedback({ type: 'error', message: data.error || 'Failed to record expense.' });
      }
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Could not connect to back-office server.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 flex flex-col">
        {/* Header */}
        <div className="bg-red-50 p-4 flex justify-between items-center border-b border-red-100">
          <h3 className="text-xl font-bold text-red-700 flex items-center gap-2">
            <MinusCircle className="text-red-600" size={22} />
            <span>Record Cash Out (Drawer Payout)</span>
          </h3>
          <button 
            onClick={onClose} 
            className="text-red-500 hover:bg-red-100 p-2 rounded-full transition-colors cursor-pointer"
          >
            <X size={20}/>
          </button>
        </div>

        {feedback && (
          <div className={`p-3 text-xs font-bold flex items-center gap-2 ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
            <span>{feedback.message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Business vs Personal Toggle */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Account Classification
            </label>
            <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
              <button 
                type="button" 
                onClick={() => setFormData({ ...formData, type: 'BUSINESS', category: 'RENT' })} 
                className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                  formData.type === 'BUSINESS' ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                🏢 Business Expense
              </button>
              <button 
                type="button" 
                onClick={() => setFormData({ ...formData, type: 'PERSONAL', category: 'OWNER_DRAW' })} 
                className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                  formData.type === 'PERSONAL' ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                👤 Personal Draw
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {formData.type === 'BUSINESS' 
                ? 'Counts as shop operating cost against Gross Profit.' 
                : 'Tracks owner cash withdrawals without skewing business operating profit.'}
            </p>
          </div>

          {/* Category Dropdown */}
          <div>
            <label className="block font-bold text-slate-700 text-sm mb-1">Category</label>
            <select 
              value={formData.category} 
              onChange={e => setFormData({ ...formData, category: e.target.value })}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-red-500 focus:ring-1 focus:ring-red-400"
            >
              {formData.type === 'BUSINESS' ? (
                <>
                  <option value="RENT">Shop Rent</option>
                  <option value="ELECTRICITY">EWA / Electricity</option>
                  <option value="SALARY">Staff Salary</option>
                  <option value="MAINTENANCE">Shop Maintenance</option>
                  <option value="SUPPLIER">Supplier Cash Payment</option>
                  <option value="PACKAGING">Packaging & Bags</option>
                  <option value="MUNICIPAL">Municipal Fees</option>
                  <option value="MISC_BUSINESS">Miscellaneous Shop Expense</option>
                </>
              ) : (
                <>
                  <option value="OWNER_DRAW">Owner Cash Withdrawal</option>
                  <option value="HOME_RENT">Home Rent</option>
                  <option value="ELECTRICITY_HOME">Home Electricity / EWA</option>
                  <option value="GROCERIES">Personal Groceries</option>
                  <option value="FAMILY_EXPENSE">Family / Medical</option>
                  <option value="MISC_PERSONAL">Personal Other</option>
                </>
              )}
            </select>
          </div>

          {/* Amount in BD */}
          <div>
            <label className="block font-bold text-slate-700 text-sm mb-1">Amount (BD)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono text-lg">
                BD
              </span>
              <input 
                type="number" 
                step="0.001" 
                min="0.001" 
                required 
                value={formData.amount} 
                onChange={e => setFormData({ ...formData, amount: e.target.value })} 
                className="w-full text-2xl font-black pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-red-500 focus:ring-1 focus:ring-red-400 text-red-600 font-mono" 
                placeholder="0.000" 
              />
            </div>
          </div>

          {/* Optional Description */}
          <div>
            <label className="block font-bold text-slate-700 text-sm mb-1">Description / Notes</label>
            <input 
              type="text" 
              value={formData.description} 
              onChange={e => setFormData({ ...formData, description: e.target.value })} 
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-red-500" 
              placeholder="e.g. Home electricity bill for October" 
            />
          </div>

          {/* Submit Button */}
          <button 
            type="submit" 
            disabled={loading}
            className="w-full h-14 bg-red-600 hover:bg-red-700 text-white font-bold text-lg rounded-xl active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:opacity-50"
          >
            <Banknote size={22} />
            <span>{loading ? 'Recording...' : 'Take Cash from Drawer'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
