import { useState, useEffect } from 'react';
import { 
  Truck, ShoppingCart, MessageSquare, Plus, CheckCircle2, 
  AlertTriangle, Phone, ExternalLink, Calendar, DollarSign, PackageCheck, Send, Sparkles, Edit3 
} from 'lucide-react';
import ProcurementPanel from './ProcurementPanel';

const BAHRAIN_DISTRIBUTORS = [
  {
    id: 'dist_almarai',
    name: 'Almarai Bahrain W.L.L.',
    category: 'Fresh Dairy, Laban, Juices & Cheese',
    phone: '97339412840',
    repName: 'Hussain (Almarai Askar Route)',
    leadTimeDays: 1,
  },
  {
    id: 'dist_kdd',
    name: 'KDD Bahrain (Kuwait Food House)',
    category: 'Flavored Milk, Ice Cream, Tomato Paste',
    phone: '97338294410',
    repName: 'Rashid (Southern Van)',
    leadTimeDays: 2,
  },
  {
    id: 'dist_awal',
    name: 'Awal Dairy Company BSC',
    category: 'Fresh Full Cream Milk & Halloumi',
    phone: '97336501192',
    repName: 'Mustafa',
    leadTimeDays: 1,
  },
  {
    id: 'dist_delmon',
    name: 'Delmon Poultry Co. (Mazra’ati)',
    category: 'Fresh Chilled Chicken & Tray Cuts',
    phone: '97339628831',
    repName: 'Salman',
    leadTimeDays: 1,
  },
  {
    id: 'dist_local',
    name: 'Bin Mahmood Wholesale FMCG',
    category: 'Rice, Oil, Sugar, Spices & Dry Staples',
    phone: '97333149902',
    repName: 'Farooq (Bulk Wholesale)',
    leadTimeDays: 3,
  }
];

export default function ProcurementLogistics({ apiBase = 'http://localhost:3000' }) {
  const [activeView, setActiveView] = useState('predictive'); // 'predictive' | 'manual'
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDistributor, setSelectedDistributor] = useState(BAHRAIN_DISTRIBUTORS[0]);
  const [poNotes, setPoNotes] = useState('');
  const [newPoItems, setNewPoItems] = useState([
    { name: 'Fresh Laban 2L (Crates of 6)', qty: 4, unitCost: 3.600 },
    { name: 'Full Cream Milk 1L (Cartons of 12)', qty: 5, unitCost: 4.800 },
  ]);
  const [statusNotice, setStatusNotice] = useState('');

  const fetchDrafts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/purchase-orders/drafts`);
      const data = await res.json();
      if (data.success && Array.isArray(data.drafts)) {
        setDrafts(data.drafts);
      }
    } catch (err) {
      console.warn('Drafts fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrafts();
  }, [apiBase]);

  const addPoItem = () => {
    setNewPoItems([...newPoItems, { name: '', qty: 1, unitCost: 1.000 }]);
  };

  const removePoItem = (idx) => {
    setNewPoItems(newPoItems.filter((_, i) => i !== idx));
  };

  const updatePoItem = (idx, field, value) => {
    const updated = [...newPoItems];
    updated[idx][field] = value;
    setNewPoItems(updated);
  };

  const computePoTotal = () => {
    return newPoItems.reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.unitCost || 0)), 0);
  };

  // Generate 1-Click WhatsApp Message for Distributor Representative
  const sendWhatsAppPo = () => {
    const totalEst = computePoTotal().toFixed(3);
    const dateStr = new Date().toLocaleDateString('en-GB');

    const itemListText = newPoItems
      .filter((i) => i.name.trim().length > 0)
      .map((i, idx) => `${idx + 1}. ${i.name} - Qty: ${i.qty}`)
      .join('\n');

    const message = 
`*PURCHASE ORDER - Askar Supermarket*
📍 *Branch:* Askar Branch 01 (Coast Road)
🏢 *Distributor:* ${selectedDistributor.name}
👤 *Attn:* ${selectedDistributor.repName}
📅 *Date:* ${dateStr}

*Ordered Items:*
${itemListText}

${poNotes ? `*Special Notes:* ${poNotes}\n` : ''}
*Estimated Value:* BD ${totalEst}
*Delivery Requirement:* Morning Delivery Slot (8:00 AM - 11:00 AM)

Please confirm receipt and expected delivery invoice. Thank you!`;

    const encoded = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${selectedDistributor.phone}?text=${encoded}`;
    window.open(whatsappUrl, '_blank');

    setStatusNotice(`✅ WhatsApp Purchase Order dispatched to ${selectedDistributor.name}!`);
    setTimeout(() => setStatusNotice(''), 5000);
  };

  return (
    <div className="space-y-8 font-sans">
      
      {/* Title & Mode Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Truck className="w-6 h-6 text-amber-600" />
            Procurement &amp; Distributor Logistics
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Bahrain direct-store-delivery (DSD) purchasing, low stock reorders, and 1-click WhatsApp purchase orders
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200">
          <button
            onClick={() => setActiveView('predictive')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeView === 'predictive'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Predictive Auto-Replenishment</span>
          </button>

          <button
            onClick={() => setActiveView('manual')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeView === 'manual'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5 text-slate-500" />
            <span>Manual PO Composer</span>
          </button>
        </div>
      </div>

      {statusNotice && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-2xl flex items-center gap-2 font-bold text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* Render View */}
      {activeView === 'predictive' ? (
        <ProcurementPanel apiBase={apiBase} />
      ) : (
        /* Main 2-Column Workflow for Manual PO Composer */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Distributor Directory */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            Bahrain Wholesale Distributors
          </h3>

          <div className="space-y-3">
            {BAHRAIN_DISTRIBUTORS.map((dist) => {
              const isSelected = selectedDistributor.id === dist.id;
              return (
                <div
                  key={dist.id}
                  onClick={() => setSelectedDistributor(dist)}
                  className={`p-4 rounded-2xl border transition cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500 text-slate-900 shadow-sm ring-1 ring-amber-500'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">{dist.name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-600">
                      {dist.leadTimeDays}d lead
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{dist.category}</p>
                  
                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Rep: {dist.repName}</span>
                    <span className="font-mono text-emerald-600 font-bold">+{dist.phone}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 2 Columns: 1-Click Purchase Order Composer */}
        <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
          <div>
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div>
                <span className="text-xs font-mono uppercase text-amber-600 font-bold">Purchase Order Draft</span>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">
                  Draft PO for {selectedDistributor.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Direct dispatch to sales representative: <strong>{selectedDistributor.repName}</strong>
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-500">Estimated Total</span>
                <div className="text-2xl font-black font-mono text-amber-600">
                  BD {computePoTotal().toFixed(3)}
                </div>
              </div>
            </div>

            {/* Item Entry Table */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                <span className="w-1/2">Product Description / Case Pack</span>
                <span className="w-20 text-center">Cases / Units</span>
                <span className="w-28 text-right">Wholesale (BD)</span>
                <span className="w-10"></span>
              </div>

              {newPoItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updatePoItem(idx, 'name', e.target.value)}
                    placeholder="e.g. Almarai Laban 2L (Crates of 6)"
                    className="flex-1 text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  />

                  <input
                    type="number"
                    min="1"
                    value={item.qty}
                    onChange={(e) => updatePoItem(idx, 'qty', parseInt(e.target.value) || 1)}
                    className="w-20 text-center text-sm py-2 px-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono font-bold"
                  />

                  <input
                    type="number"
                    step="0.050"
                    value={item.unitCost}
                    onChange={(e) => updatePoItem(idx, 'unitCost', parseFloat(e.target.value) || 0)}
                    className="w-28 text-right text-sm py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono font-bold"
                  />

                  <button
                    onClick={() => removePoItem(idx)}
                    className="w-10 h-10 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition cursor-pointer"
                    title="Remove item"
                  >
                    ✕
                  </button>
                </div>
              ))}

              <button
                onClick={addPoItem}
                className="mt-2 text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-amber-50 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Another Line Item</span>
              </button>
            </div>

            {/* Special Instructions */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Special Delivery Notes / Timings
              </label>
              <textarea
                rows={2}
                value={poNotes}
                onChange={(e) => setPoNotes(e.target.value)}
                placeholder="e.g. Please deliver before 10 AM, stock for weekend rush."
                className="w-full text-sm p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

          </div>

          {/* Action Footer */}
          <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <Phone className="w-4 h-4 text-emerald-600" />
              <span>Direct rep WhatsApp: +{selectedDistributor.phone}</span>
            </div>

            <button
              onClick={sendWhatsAppPo}
              className="w-full sm:w-auto px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-lg transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer text-sm"
            >
              <Send className="w-4 h-4" />
              <span>Send 1-Click WhatsApp Purchase Order</span>
            </button>
          </div>

        </div>

      </div>
      )}

    </div>
  );
}

