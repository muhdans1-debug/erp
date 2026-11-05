import { useState } from 'react';
import { Trash2, ScanBarcode, AlertTriangle, X } from 'lucide-react';

interface LogWastageModalProps {
  onClose: () => void;
  onSuccess?: () => void;
  apiBase?: string;
}

export default function LogWastageModal({ onClose, onSuccess, apiBase: propApiBase }: LogWastageModalProps) {
  const apiBase = propApiBase || (typeof window !== 'undefined' ? localStorage.getItem('master_server_url') || 'http://localhost:3000' : 'http://localhost:3000');
  const [formData, setFormData] = useState({
    barcode: '',
    quantity: '1',
    reason: 'EXPIRED'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const res = await fetch(`${apiBase}/api/inventory/wastage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          quantity: parseInt(formData.quantity) || 1
        })
      });
      
      const data = await res.json();
      if (data.success) {
        alert("Wastage recorded. Stock updated and P&L adjusted.");
        if (onSuccess) onSuccess();
        onClose();
      } else {
        alert(data.error || "Failed to log wastage.");
      }
    } catch (error) {
      alert("Failed to log wastage.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        
        <div className="bg-red-50 p-4 border-b border-red-100 flex justify-between items-center">
          <h3 className="text-xl font-bold text-red-700 flex items-center gap-2">
            <Trash2 size={20} /> Log Wastage & Spoilage
          </h3>
          <button 
            onClick={onClose} 
            className="p-2 text-red-500 hover:bg-red-100 rounded-full transition-colors cursor-pointer"
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          <div>
            <label className="block text-slate-700 font-bold mb-2">Scan Barcode</label>
            <div className="relative">
              <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={24} />
              <input 
                type="text" 
                autoFocus
                required
                value={formData.barcode}
                onChange={(e) => setFormData({...formData, barcode: e.target.value})}
                className="w-full text-xl p-4 pl-14 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-red-500 font-mono transition-colors" 
                placeholder="Scan item or type barcode..." 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-bold mb-2">Quantity Lost</label>
              <input 
                type="number" 
                required 
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                className="w-full text-2xl font-black p-4 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-red-500 transition-colors" 
              />
            </div>
            
            <div>
              <label className="block text-slate-700 font-bold mb-2">Reason</label>
              <select 
                value={formData.reason}
                onChange={(e) => setFormData({...formData, reason: e.target.value})}
                className="w-full text-lg p-4 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-red-500 font-bold text-slate-700 h-[68px]"
              >
                <option value="EXPIRED">Expired</option>
                <option value="DAMAGED">Damaged / Broken</option>
                <option value="STOLEN">Stolen / Missing</option>
              </select>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
            <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
            <p className="text-sm text-amber-800 font-medium">
              Logging this will permanently deduct the items from stock and register the wholesale cost as a financial loss on the P&L statement.
            </p>
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full h-16 bg-red-600 hover:bg-red-700 text-white font-bold text-xl rounded-xl active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Trash2 size={22} /> {isSubmitting ? 'Writing Off...' : 'Write Off Stock'}
          </button>
        </form>

      </div>
    </div>
  );
}
