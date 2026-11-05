import React, { useState, useEffect, useMemo } from 'react';
import {
  Truck,
  Send,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Package,
  Layers,
  Phone,
  Calendar,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  FileCheck,
  Search,
  ShoppingCart
} from 'lucide-react';

export interface ReorderItem {
  productId: string;
  name: string;
  barcode: string;
  category: string;
  currentStock: number;
  unitsSold7d: number;
  dailyVelocity: number;
  leadTimeDays: number;
  safetyStock: number;
  rop: number;
  suggestedOrderQty: number;
  unitCost: number;
  lineTotal: number;
  distributorId: string;
  distributorName: string;
  distributorPhone: string;
}

export interface SupplierDraft {
  distributorId: string;
  distributorName: string;
  whatsappNumber: string;
  contactEmail: string;
  minimumOrderValue: number;
  totalCost: number;
  meetsMov: boolean;
  itemCount: number;
  whatsappUrl: string | null;
  messagePreview: string;
  items: ReorderItem[];
  savedPoId?: string;
}

interface ProcurementPanelProps {
  apiBase?: string;
}

export const ProcurementPanel: React.FC<ProcurementPanelProps> = ({
  apiBase = 'http://localhost:3000'
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calculatedAt, setCalculatedAt] = useState<string>('');
  const [supplierDrafts, setSupplierDrafts] = useState<SupplierDraft[]>([]);
  const [reorderList, setReorderList] = useState<ReorderItem[]>([]);
  const [expandedSuppliers, setExpandedSuppliers] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDistributorFilter, setSelectedDistributorFilter] = useState('ALL');
  const [savingPoFor, setSavingPoFor] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchForecast = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/procurement/auto-reorder`);
      if (!res.ok) {
        throw new Error(`API responded with HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to calculate auto-replenishment');
      }

      const draftsArray: SupplierDraft[] = data.supplierDraftsList || (
        Array.isArray(data.supplierDrafts)
          ? data.supplierDrafts
          : Object.entries(data.supplierDrafts || {}).map(([sName, s]: [string, any]) => ({
              distributorId: s.distributorId || sName,
              distributorName: s.distributorName || sName,
              whatsappNumber: s.phone || s.whatsappNumber || '',
              contactEmail: s.contactEmail || '',
              minimumOrderValue: s.minimumOrderValue || 0,
              totalCost: s.totalCost || 0,
              meetsMov: s.meetsMov ?? true,
              itemCount: (s.items || []).length,
              whatsappUrl: s.whatsappUrl || null,
              messagePreview: s.messagePreview || '',
              items: (s.items || []).map((it: any) => ({
                productId: it.productId || it.id || '',
                name: it.name,
                barcode: it.barcode || '',
                category: it.category || 'General',
                currentStock: it.currentStock ?? it.stockQuantity ?? 0,
                unitsSold7d: it.unitsSold7d || 0,
                dailyVelocity: it.dailyVelocity || 0,
                leadTimeDays: it.leadTimeDays || 2,
                safetyStock: it.safetyStock || 5,
                rop: it.rop ?? it.reorderPoint ?? 0,
                suggestedOrderQty: it.suggestedOrderQty ?? it.suggestedOrder ?? 1,
                unitCost: it.unitCost ?? it.unitPrice ?? 0,
                lineTotal: it.lineTotal ?? it.estimatedCost ?? 0,
                distributorId: it.distributorId || '',
                distributorName: it.distributorName || sName,
                distributorPhone: it.distributorPhone || s.phone || ''
              }))
            }))
      );

      setSupplierDrafts(draftsArray);
      setReorderList(data.reorderList || []);
      setCalculatedAt(data.calculatedAt || new Date().toISOString());

      // Expand all suppliers by default
      const initialExpanded: Record<string, boolean> = {};
      draftsArray.forEach((d: SupplierDraft) => {
        initialExpanded[d.distributorId] = true;
      });
      setExpandedSuppliers(initialExpanded);
    } catch (err: any) {
      console.error('Forecast error:', err);
      setError(err.message || 'Unable to connect to POS Master server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForecast();
  }, [apiBase]);

  const toggleSupplierExpand = (distId: string) => {
    setExpandedSuppliers((prev) => ({
      ...prev,
      [distId]: !prev[distId]
    }));
  };

  // 1-Click WhatsApp Order Link Dispatch
  const handleSendWhatsApp = (draft: SupplierDraft) => {
    if (!draft.whatsappUrl) {
      const rawPhone = draft.whatsappNumber.replace(/[^0-9]/g, '');
      const phone = rawPhone.startsWith('973') ? rawPhone : `973${rawPhone}`;
      const encodedMsg = encodeURIComponent(draft.messagePreview);
      const url = `https://wa.me/${phone}?text=${encodedMsg}`;
      window.open(url, '_blank');
    } else {
      window.open(draft.whatsappUrl, '_blank');
    }

    setNotification({
      type: 'success',
      text: `📱 WhatsApp order launched for ${draft.distributorName}!`
    });
    setTimeout(() => setNotification(null), 4000);
  };

  // Convert Auto-Replenishment Draft into official PO in database
  const handleCreateOfficialPo = async (draft: SupplierDraft) => {
    setSavingPoFor(draft.distributorId);
    try {
      const res = await fetch(`${apiBase}/api/procurement/auto-reorder/create-po`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distributorId: draft.distributorId })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save PO');
      }

      // Update state with saved PO id
      setSupplierDrafts((prev) =>
        prev.map((d) => (d.distributorId === draft.distributorId ? { ...d, savedPoId: data.poId } : d))
      );

      setNotification({
        type: 'success',
        text: `✅ Purchase Order #${data.poId?.slice(0, 8)} created in ERP system!`
      });
      setTimeout(() => setNotification(null), 5000);
    } catch (err: any) {
      setNotification({
        type: 'error',
        text: `❌ Error creating PO: ${err.message}`
      });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setSavingPoFor(null);
    }
  };

  // Summary Metrics
  const totalRestockCost = useMemo(() => {
    return supplierDrafts.reduce((sum, d) => sum + d.totalCost, 0);
  }, [supplierDrafts]);

  const filteredDrafts = useMemo(() => {
    return supplierDrafts
      .filter((d) => {
        if (selectedDistributorFilter !== 'ALL' && d.distributorId !== selectedDistributorFilter) {
          return false;
        }
        return true;
      })
      .map((d) => {
        if (!searchQuery.trim()) return d;
        const q = searchQuery.toLowerCase();
        const matchingItems = d.items.filter(
          (it) => it.name.toLowerCase().includes(q) || (it.barcode && it.barcode.toLowerCase().includes(q))
        );
        return {
          ...d,
          items: matchingItems
        };
      })
      .filter((d) => d.items.length > 0 || !searchQuery.trim());
  }, [supplierDrafts, selectedDistributorFilter, searchQuery]);

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner / Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 font-bold">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                Predictive Auto-Replenishment Engine
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Dynamic 7-Day Sales Velocity &bull; Reorder Point (ROP) Forecasting &bull; 1-Click WhatsApp Purchase Orders
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchForecast}
            disabled={loading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Recalculating...' : 'Refresh Forecast'}</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-2 text-sm font-bold shadow-sm transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{notification.text}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl text-rose-900 flex items-center gap-3 text-sm">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <div>
            <strong>Calculation Alert:</strong> {error}
          </div>
        </div>
      )}

      {/* Supply Chain KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">
            <span>Critical Stock Deficit</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-3xl font-black text-rose-600 font-mono">
            {reorderList.length} <span className="text-xs font-sans text-slate-400 font-normal">items</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Current stock at or below calculated ROP</p>
        </div>

        {/* Card 2 */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">
            <span>Suppliers to Order</span>
            <Package className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-3xl font-black text-slate-900 font-mono">
            {supplierDrafts.length} <span className="text-xs font-sans text-slate-400 font-normal">distributors</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Grouped orders ready for dispatch</p>
        </div>

        {/* Card 3 */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">
            <span>Total Restock Valuation</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-black text-emerald-600 font-mono">
            BD {totalRestockCost.toFixed(3)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Wholesale cost across all recommendations</p>
        </div>

        {/* Card 4 */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">
            <span>Forecasting Model</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-sm font-bold text-slate-800">
            Rolling 7-Day Velocity
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            ROP = (Velocity &times; Lead Time) + Buffer
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search replenishment list by item name or barcode..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-bold text-slate-500 shrink-0">Supplier:</span>
          <select
            value={selectedDistributorFilter}
            onChange={(e) => setSelectedDistributorFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
          >
            <option value="ALL">All Distributors ({supplierDrafts.length})</option>
            {supplierDrafts.map((d) => (
              <option key={d.distributorId} value={d.distributorId}>
                {d.distributorName} ({d.items.length} items)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Supplier Purchase Order Drafts */}
      {filteredDrafts.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-sm">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-lg font-black text-slate-800">Inventory Levels Optimal</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            All catalog products are currently above their predictive Reorder Points (ROP). No purchase orders required at this time.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredDrafts.map((draft) => {
            const isExpanded = !!expandedSuppliers[draft.distributorId];
            const movPercent =
              draft.minimumOrderValue > 0
                ? Math.min(100, Math.round((draft.totalCost / draft.minimumOrderValue) * 100))
                : 100;

            return (
              <div
                key={draft.distributorId}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"
              >
                {/* Distributor Card Header */}
                <div className="p-6 bg-slate-50/50 border-b border-slate-200">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <button
                        onClick={() => toggleSupplierExpand(draft.distributorId)}
                        className="mt-1 p-1 hover:bg-slate-200 rounded-lg text-slate-500 transition cursor-pointer"
                      >
                        {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      </button>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-black text-slate-900 tracking-tight">
                            {draft.distributorName}
                          </h3>
                          <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700">
                            {draft.items.length} items
                          </span>
                          {draft.savedPoId && (
                            <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                              <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                              PO #{draft.savedPoId.slice(0, 8)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-xs text-slate-500 mt-1.5 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-emerald-600" />
                            +{draft.whatsappNumber || 'N/A'}
                          </span>
                          {draft.contactEmail && (
                            <span>&bull; {draft.contactEmail}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Action / Cost Section */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:self-center">
                      <div className="text-left sm:text-right">
                        <span className="text-[11px] uppercase font-bold text-slate-400">Order Estimate</span>
                        <div className="text-2xl font-black font-mono text-slate-900">
                          BD {draft.totalCost.toFixed(3)}
                        </div>
                        {draft.minimumOrderValue > 0 && (
                          <div className="text-[11px] font-bold text-slate-500">
                            MOV: BD {draft.minimumOrderValue.toFixed(3)} (
                            <span className={draft.meetsMov ? 'text-emerald-600' : 'text-amber-600'}>
                              {draft.meetsMov ? 'Meets MOV ✅' : `${movPercent}% of MOV`}
                            </span>
                            )
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Save PO in ERP */}
                        <button
                          onClick={() => handleCreateOfficialPo(draft)}
                          disabled={savingPoFor === draft.distributorId}
                          className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          title="Save this order as an official DRAFT PO in the database"
                        >
                          <FileCheck className="w-4 h-4 text-slate-600" />
                          <span>{savingPoFor === draft.distributorId ? 'Saving...' : 'Draft PO'}</span>
                        </button>

                        {/* 1-Click WhatsApp Order */}
                        <button
                          onClick={() => handleSendWhatsApp(draft)}
                          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Send className="w-4 h-4" />
                          <span>1-Click WhatsApp Order</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* MOV Progress Bar */}
                  {draft.minimumOrderValue > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-200/60">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1">
                        <span>Minimum Order Value (MOV) Rule</span>
                        <span>
                          BD {draft.totalCost.toFixed(3)} / BD {draft.minimumOrderValue.toFixed(3)}
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            draft.meetsMov ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                          style={{ width: `${movPercent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Table of Recommended Items */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200">
                          <th className="py-3 px-4">Product Name</th>
                          <th className="py-3 px-4">Barcode</th>
                          <th className="py-3 px-3 text-center">Stock</th>
                          <th className="py-3 px-3 text-center">7d Velocity</th>
                          <th className="py-3 px-3 text-center">ROP</th>
                          <th className="py-3 px-3 text-center bg-amber-500/10 text-amber-900 font-extrabold">
                            Order Qty
                          </th>
                          <th className="py-3 px-3 text-right">Unit Cost</th>
                          <th className="py-3 px-4 text-right">Line Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {draft.items.map((item) => (
                          <tr key={item.productId} className="hover:bg-slate-50/50 transition">
                            <td className="py-3 px-4 font-bold text-slate-800 max-w-xs truncate">
                              {item.name}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                              {item.barcode || 'N/A'}
                            </td>
                            <td className="py-3 px-3 text-center font-mono font-bold">
                              <span
                                className={`px-2 py-0.5 rounded ${
                                  item.currentStock <= 0
                                    ? 'bg-rose-100 text-rose-700'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {item.currentStock}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-slate-600">
                              {item.dailyVelocity.toFixed(1)}/day
                              <div className="text-[10px] text-slate-400">({item.unitsSold7d} sold 7d)</div>
                            </td>
                            <td className="py-3 px-3 text-center font-mono font-bold text-slate-700">
                              {item.rop}
                            </td>
                            <td className="py-3 px-3 text-center font-mono font-black text-amber-700 bg-amber-500/5 text-sm">
                              +{item.suggestedOrderQty}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-slate-600">
                              BD {item.unitCost.toFixed(3)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                              BD {item.lineTotal.toFixed(3)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProcurementPanel;

