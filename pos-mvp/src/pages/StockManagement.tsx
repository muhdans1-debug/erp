import { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Clock, 
  Truck, 
  CheckCircle, 
  PackageCheck, 
  Settings, 
  RefreshCw,
  Play, 
  Upload, 
  X, 
  Save, 
  ShieldAlert, 
  Store,
  Building2,
  Plus,
  Coins,
  Calendar,
  ShieldCheck,
  Info,
  Trash2,
  Edit
} from 'lucide-react';
import AddProductModal from '../components/AddProductModal';
import POReviewModal from '../components/POReviewModal';
import LogWastageModal from '../components/LogWastageModal';
import { TableSkeleton } from '../components/Skeleton';

interface StockManagementProps {
  apiBase?: string;
  onBackToPos?: () => void;
  initialTab?: 'THRESHOLDS' | 'PENDING' | 'IN_TRANSIT' | 'DISTRIBUTORS';
}

export default function StockManagement({ apiBase: propApiBase, onBackToPos, initialTab = 'PENDING' }: StockManagementProps) {
  const apiBase = propApiBase || (typeof window !== 'undefined' ? localStorage.getItem('master_server_url') || 'http://localhost:3000' : 'http://localhost:3000');
  const [activeTab, setActiveTab] = useState<'THRESHOLDS' | 'PENDING' | 'IN_TRANSIT' | 'DISTRIBUTORS'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  
  // Data States
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [draftOrders, setDraftOrders] = useState<any[]>([]);
  const [transitOrders, setTransitOrders] = useState<any[]>([]);
  const [distributors, setDistributors] = useState<any[]>([]);
  const [skippedMovList, setSkippedMovList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isScanningCron, setIsScanningCron] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Threshold Editing Modal State
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editCost, setEditCost] = useState<number>(0);
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editStock, setEditStock] = useState<number>(0);
  const [editMinThreshold, setEditMinThreshold] = useState<number>(20);
  const [editMaxThreshold, setEditMaxThreshold] = useState<number>(100);
  const [editDistributorId, setEditDistributorId] = useState<string>('');
  const [editSupplierName, setEditSupplierName] = useState<string>('');
  const [editSupplierEmail, setEditSupplierEmail] = useState<string>('');
  const [isSavingThreshold, setIsSavingThreshold] = useState(false);

  // Distributor Editing / Creation Modal State
  const [editingDistributor, setEditingDistributor] = useState<any | null>(null);
  const [distName, setDistName] = useState('');
  const [distEmail, setDistEmail] = useState('');
  const [distMov, setDistMov] = useState<number>(50);
  const [distDays, setDistDays] = useState('MON,WED,FRI');
  const [distWhatsapp, setDistWhatsapp] = useState('97339000000');
  const [showAddDistModal, setShowAddDistModal] = useState(false);
  const [isSavingDistributor, setIsSavingDistributor] = useState(false);

  // Bulk CSV Onboarding Modal State
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [isImportingCsv, setIsImportingCsv] = useState(false);

  // Add Product Modal State
  const [showAddProductModal, setShowAddProductModal] = useState(false);

  // PO Review & Edit Modal State
  const [editingPO, setEditingPO] = useState<any | null>(null);

  // PO Discard / Removal Modal State
  const [poToDiscard, setPoToDiscard] = useState<any | null>(null);
  const [snoozeChoice, setSnoozeChoice] = useState<number>(0);
  const [isDiscarding, setIsDiscarding] = useState<boolean>(false);

  // Wastage Write-Off Modal State
  const [showWastageModal, setShowWastageModal] = useState(false);

  // Fetch data on load or tab change
  useEffect(() => {
    fetchDashboardData();
  }, [activeTab, apiBase]);

  const showNotification = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setFeedback({ text, type });
    setTimeout(() => {
      setFeedback(curr => (curr?.text === text ? null : curr));
    }, 5500);
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [productsRes, draftsRes, transitRes, distRes, cronRes] = await Promise.all([
        fetch(`${apiBase}/api/products`),
        fetch(`${apiBase}/api/purchase-orders/drafts`),
        fetch(`${apiBase}/api/purchase-orders/transit`),
        fetch(`${apiBase}/api/distributors`),
        fetch(`${apiBase}/api/cron/auto-restock`)
      ]);

      const products = await productsRes.json();
      if (Array.isArray(products)) {
        setLowStockItems(products.filter((p: any) => p.stockQuantity <= (p.minThreshold ?? 20)));
      }
      
      const drafts = await draftsRes.json();
      setDraftOrders(drafts.drafts || drafts.orders || []);

      const transit = await transitRes.json();
      setTransitOrders(transit.orders || []);

      const distData = await distRes.json();
      if (distData.distributors) {
        setDistributors(distData.distributors);
      }

      const cronData = await cronRes.json();
      if (cronData.skipped) {
        setSkippedMovList(cronData.skipped);
      }
    } catch (error) {
      console.error("Failed to fetch stock data", error);
      showNotification("Could not connect to back-office server. Verify server is running on port 3000.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Action: Trigger Smart Auto-Restock Engine On-Demand (with optional MOV bypass)
  const handleRunReorderScan = async (bypassMov = false, targetDistributorId?: string) => {
    setIsScanningCron(true);
    try {
      const url = `${apiBase}/api/cron/auto-restock?bypassMov=${bypassMov}${targetDistributorId ? `&distributorId=${targetDistributorId}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setSkippedMovList(data.skipped || []);
        if (data.draftCount > 0 && (data.skippedCount || 0) > 0) {
          showNotification(
            `Smart Engine complete: Created ${data.draftCount} bundled PO draft(s). ${data.skippedCount} supplier(s) held back below Minimum Order Value.`,
            'success'
          );
        } else if (data.draftCount > 0) {
          showNotification(
            `Smart Engine complete: Created ${data.draftCount} bundled PO draft(s)${bypassMov ? ' (MOV bypassed)' : ''}!`,
            'success'
          );
        } else if ((data.skippedCount || 0) > 0) {
          showNotification(
            `Items low in stock for ${data.skippedCount} supplier(s), but basket value is below Minimum Order Value. Click "Generate PO Anyway" to order now.`,
            'info'
          );
        } else {
          showNotification('All inventory levels are healthy. No items below minimum threshold.', 'success');
        }
        await fetchDashboardData();
        if (data.draftCount > 0) {
          setActiveTab('PENDING');
        }
      } else {
        showNotification(data.error || 'Automation check failed', 'error');
      }
    } catch (error) {
      showNotification("Failed to trigger reorder scan", "error");
    } finally {
      setIsScanningCron(false);
    }
  };

  // Action: Create Draft PO directly for a low-stock product's distributor
  const handleCreateDraftForProduct = async (product: any) => {
    setIsScanningCron(true);
    try {
      const distId = product.distributorId || 'dist_local';
      const supplier = product.supplierName || 'Distributor';
      const res = await fetch(`${apiBase}/api/cron/auto-restock?bypassMov=true&distributorId=${distId}`);
      const data = await res.json();
      if (data.success && data.draftCount > 0) {
        showNotification(`Draft Purchase Order created for "${supplier}"! Switching to Pending Approvals.`, 'success');
        await fetchDashboardData();
        setActiveTab('PENDING');
      } else {
        showNotification(data.error || 'Failed to generate PO draft.', 'error');
      }
    } catch (err) {
      showNotification('Failed to generate PO draft.', 'error');
    } finally {
      setIsScanningCron(false);
    }
  };

  // Action: Final Approve after Review & Edit
  const handleFinalApprove = async (poId: string, editedItems: any[], newTotalCost: number) => {
    try {
      const res = await fetch(`${apiBase}/api/purchase-orders/${poId}/approve`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemsJson: JSON.stringify(editedItems),
          estimatedCost: newTotalCost
        })
      });
      
      const data = await res.json();
      if (data.success) {
        showNotification(
          `Purchase Order approved & dispatched via WhatsApp to ${editingPO?.supplierName || 'supplier'}!`,
          'success'
        );
        setEditingPO(null);
        fetchDashboardData(); // Refresh the pending list
      } else {
        showNotification(data.error || "Failed to send order.", "error");
      }
    } catch (error) {
      showNotification("Failed to send order.", "error");
    }
  };

  // Action: Discard / Remove Draft Purchase Order (with optional distributor snooze)
  const handleDiscardPO = async (poId: string, supplierName: string, snoozeHours = 0) => {
    try {
      setIsDiscarding(true);
      const res = await fetch(`${apiBase}/api/purchase-orders/${poId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snoozeHours, reason: 'Store manager manual removal' })
      });
      const data = await res.json();
      if (data.success) {
        showNotification(
          snoozeHours > 0
            ? `Order for "${supplierName}" discarded. Restock scans will snooze this distributor for ${snoozeHours}h.`
            : `Draft order for "${supplierName}" removed successfully.`,
          'success'
        );
        setDraftOrders(prev => prev.filter(po => po.id !== poId));
        setPoToDiscard(null);
        setSnoozeChoice(0);
        fetchDashboardData();
      } else {
        showNotification(data.error || 'Failed to remove order.', 'error');
      }
    } catch (error) {
      showNotification('Network error while discarding order.', 'error');
    } finally {
      setIsDiscarding(false);
    }
  };

  // Action: Clear All Pending Draft Purchase Orders
  const handleClearAllDrafts = async () => {
    if (draftOrders.length === 0) return;
    if (!window.confirm(`Discard all ${draftOrders.length} pending draft purchase orders? This cannot be undone.`)) return;

    try {
      setIsDiscarding(true);
      const res = await fetch(`${apiBase}/api/purchase-orders/drafts/clear-all`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification(`All ${data.count || draftOrders.length} draft purchase orders cleared.`, 'success');
        setDraftOrders([]);
        fetchDashboardData();
      } else {
        showNotification(data.error || 'Failed to clear drafts.', 'error');
      }
    } catch (error) {
      showNotification('Failed to clear draft orders.', 'error');
    } finally {
      setIsDiscarding(false);
    }
  };

  // Action: Receive Delivery
  const handleReceive = async (id: string, supplierName: string) => {
    if (!window.confirm(`Confirm the delivery truck from "${supplierName}" has arrived and all items are accounted for?`)) return;

    try {
      const res = await fetch(`${apiBase}/api/purchase-orders/${id}/receive`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification(`Stock quantities updated successfully from ${supplierName} shipment!`, 'success');
        fetchDashboardData();
      } else {
        showNotification(data.error || "Failed to receive delivery.", "error");
      }
    } catch (error) {
      showNotification("Failed to receive delivery.", "error");
    }
  };

  // Action: Open Edit Threshold Modal
  const openEditThreshold = (item: any) => {
    setEditingProduct(item);
    setEditName(item.name || '');
    setEditCost(Number(item.purchasePrice ?? item.unitCost ?? 0));
    setEditPrice(Number(item.sellingPrice || 0));
    setEditStock(Number(item.stockQuantity || 0));
    setEditMinThreshold(item.minThreshold ?? 20);
    setEditMaxThreshold(item.maxThreshold ?? 100);
    setEditDistributorId(item.distributorId || '');
    setEditSupplierName(item.supplierName || 'Local Distributor');
    setEditSupplierEmail(item.supplierEmail || 'supplier@askar.bh');
  };

  // Action: When user changes distributor dropdown in threshold modal
  const handleSelectDistributor = (distId: string) => {
    setEditDistributorId(distId);
    const chosen = distributors.find(d => d.id === distId);
    if (chosen) {
      setEditSupplierName(chosen.name);
      setEditSupplierEmail(chosen.contactEmail);
    }
  };

  // Action: Save Threshold Changes
  const handleSaveThreshold = async () => {
    if (!editingProduct) return;
    setIsSavingThreshold(true);
    try {
      const res = await fetch(`${apiBase}/api/products/${editingProduct.id}/thresholds`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim() || editingProduct.name,
          purchasePrice: editCost,
          unitCost: editCost,
          sellingPrice: editPrice,
          stockQuantity: editStock,
          minThreshold: editMinThreshold,
          maxThreshold: editMaxThreshold,
          distributorId: editDistributorId || undefined,
          supplierName: editSupplierName,
          supplierEmail: editSupplierEmail,
          reason: 'Master product edit from Stock Management',
          changedBy: 'Manager'
        })
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Updated details & inventory rules for "${editName || editingProduct.name}"!`, 'success');
        setEditingProduct(null);
        fetchDashboardData();
      } else {
        showNotification(data.error || 'Failed to update product details', 'error');
      }
    } catch (err) {
      showNotification('Error updating product details', 'error');
    } finally {
      setIsSavingThreshold(false);
    }
  };

  // Action: Save Distributor (Create or Edit)
  const handleSaveDistributor = async () => {
    if (!distName.trim()) {
      showNotification('Distributor name is required', 'error');
      return;
    }
    setIsSavingDistributor(true);
    try {
      const isEdit = Boolean(editingDistributor);
      const url = isEdit 
        ? `${apiBase}/api/distributors/${editingDistributor.id}`
        : `${apiBase}/api/distributors`;
      
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: distName.trim(),
          whatsappNumber: distWhatsapp.trim(),
          contactEmail: distEmail.trim(),
          minimumOrderValue: distMov,
          deliveryDays: distDays.trim(),
        })
      });

      const data = await res.json();
      if (data.success) {
        showNotification(
          isEdit 
            ? `Updated ordering rules for "${distName}"!` 
            : `Registered new distributor "${distName}"!`,
          'success'
        );
        setEditingDistributor(null);
        setShowAddDistModal(false);
        fetchDashboardData();
      } else {
        showNotification(data.error || 'Failed to save distributor', 'error');
      }
    } catch (e: any) {
      showNotification('Failed to save distributor', 'error');
    } finally {
      setIsSavingDistributor(false);
    }
  };

  // Action: Delete Distributor
  const handleDeleteDistributor = async (dist: any) => {
    if (!window.confirm(`Are you sure you want to remove distributor "${dist.name}"?`)) return;

    try {
      const res = await fetch(`${apiBase}/api/distributors/${dist.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showNotification(data.message, 'success');
        fetchDashboardData();
      } else {
        showNotification(data.error || 'Failed to delete distributor', 'error');
      }
    } catch {
      showNotification('Failed to delete distributor', 'error');
    }
  };

  // Action: Open Edit Distributor Modal
  const openEditDistributorModal = (dist: any) => {
    setEditingDistributor(dist);
    setDistName(dist.name);
    setDistWhatsapp(dist.whatsappNumber || '97339000000');
    setDistEmail(dist.contactEmail || '');
    setDistMov(Number(dist.minimumOrderValue || 0));
    setDistDays(dist.deliveryDays || '');
  };

  // Action: Open Add Distributor Modal
  const openAddDistributorModal = () => {
    setEditingDistributor(null);
    setDistName('');
    setDistWhatsapp('97339000000');
    setDistEmail('');
    setDistMov(50);
    setDistDays('MON,WED,FRI');
    setShowAddDistModal(true);
  };

  // Action: Process Bulk CSV Import
  const handleCsvImport = async () => {
    if (!csvText.trim()) {
      showNotification("Please paste CSV data or choose a file first.", "error");
      return;
    }

    setIsImportingCsv(true);
    try {
      const lines = csvText.trim().split(/\r?\n/);
      if (lines.length < 2) {
        showNotification("CSV must have a header row and at least 1 item row.", "error");
        setIsImportingCsv(false);
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/["']/g, ''));
      const products: any[] = [];

      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (row.length < 2 || !row[0]) continue;

        const rowObj: any = {};
        headers.forEach((h, idx) => {
          rowObj[h] = row[idx];
        });

        products.push({
          id: rowObj.id || rowObj.barcode || crypto.randomUUID(),
          name: rowObj.name || rowObj.product || rowObj.title || 'Product',
          purchasePrice: parseFloat(rowObj.purchaseprice || rowObj.costprice || rowObj.cost || '0'),
          sellingPrice: parseFloat(rowObj.sellingprice || rowObj.price || '0'),
          stockQuantity: parseInt(rowObj.stockquantity || rowObj.stock || rowObj.qty || '0', 10),
          minThreshold: parseInt(rowObj.minthreshold || rowObj.min || '20', 10),
          maxThreshold: parseInt(rowObj.maxthreshold || rowObj.max || '100', 10),
          supplierName: rowObj.suppliername || rowObj.supplier || 'Local Distributor',
          supplierEmail: rowObj.supplieremail || rowObj.email || 'supplier@askar.bh',
          barcode: rowObj.barcode || null,
        });
      }

      const res = await fetch(`${apiBase}/api/products/bulk-upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products })
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Bulk onboarding complete! Added ${data.createdCount} new items, updated ${data.updatedCount} existing.`, 'success');
        setShowCsvModal(false);
        setCsvText('');
        fetchDashboardData();
      } else {
        showNotification(data.error || "Failed to import CSV", "error");
      }
    } catch (err: any) {
      showNotification(`CSV Import failed: ${err.message}`, "error");
    } finally {
      setIsImportingCsv(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto p-4 sm:p-6 text-slate-800">
      
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
              <Store size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Supply Chain Automation</h1>
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                  <ShieldCheck size={12} /> MOV Protected
                </span>
              </div>
              <p className="text-sm text-slate-500 font-medium">Askar Supermarket Closed-Loop Distributor & Inventory Engine</p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {onBackToPos && (
            <button
              onClick={onBackToPos}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition-colors text-sm"
            >
              ← Back to POS
            </button>
          )}

          <button
            onClick={() => setShowAddProductModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-sm transition-all shadow-sm cursor-pointer"
            title="Add new product linked to official distributor"
          >
            <Plus size={16} /> Add Product
          </button>

          <button
            onClick={() => setShowCsvModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors"
            title="Bulk CSV Onboarding"
          >
            <Upload size={16} /> Bulk CSV Import
          </button>

          <button
            onClick={() => fetchDashboardData()}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition-colors text-sm disabled:opacity-50"
            title="Refresh Stock & Distributor Data"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => handleRunReorderScan(false)}
            disabled={isScanningCron}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-sm transition-all shadow-sm disabled:opacity-50"
            title="Run smart distributor-grouped auto-restock scan enforcing Minimum Order Values"
          >
            <Play size={16} className={isScanningCron ? 'animate-spin' : ''} />
            <span>{isScanningCron ? 'Running Engine...' : 'Run Auto-Restock Scan'}</span>
          </button>

          <button
            onClick={() => setShowWastageModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-sm transition-all shadow-sm cursor-pointer"
            title="Write off expired or damaged stock"
          >
            <Trash2 size={16} />
            <span>Write-Off Stock</span>
          </button>
        </div>
      </div>

      {/* Floating Status Notification */}
      {feedback && (
        <div 
          className={`flex items-center justify-between p-4 rounded-xl border text-sm font-semibold transition-all shadow-sm ${
            feedback.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : feedback.type === 'error' 
              ? 'bg-red-50 text-red-800 border-red-200' 
              : 'bg-blue-50 text-blue-800 border-blue-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' && <CheckCircle size={18} className="text-emerald-600 shrink-0" />}
            {feedback.type === 'error' && <ShieldAlert size={18} className="text-red-600 shrink-0" />}
            {feedback.type === 'info' && <Info size={18} className="text-blue-600 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-700 ml-4">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Top Navigation Tabs */}
      <div className="flex gap-2 sm:gap-4 border-b border-slate-200 overflow-x-auto">
        <button 
          onClick={() => setActiveTab('PENDING')}
          className={`flex items-center gap-2 py-4 px-4 sm:px-6 font-bold text-base sm:text-lg border-b-4 transition-colors whitespace-nowrap ${
            activeTab === 'PENDING' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock size={20} /> Pending Approvals 
          {draftOrders.length > 0 && (
            <span className="bg-amber-100 text-amber-700 py-0.5 px-2 rounded-full text-xs sm:text-sm font-black">
              {draftOrders.length}
            </span>
          )}
        </button>

        <button 
          onClick={() => setActiveTab('IN_TRANSIT')}
          className={`flex items-center gap-2 py-4 px-4 sm:px-6 font-bold text-base sm:text-lg border-b-4 transition-colors whitespace-nowrap ${
            activeTab === 'IN_TRANSIT' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Truck size={20} /> In-Transit Deliveries
          {transitOrders.length > 0 && (
            <span className="bg-blue-100 text-blue-700 py-0.5 px-2 rounded-full text-xs sm:text-sm font-black">
              {transitOrders.length}
            </span>
          )}
        </button>

        <button 
          onClick={() => setActiveTab('THRESHOLDS')}
          className={`flex items-center gap-2 py-4 px-4 sm:px-6 font-bold text-base sm:text-lg border-b-4 transition-colors whitespace-nowrap ${
            activeTab === 'THRESHOLDS' ? 'border-red-500 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <AlertTriangle size={20} /> Low Stock Alerts
          {lowStockItems.length > 0 && (
            <span className="bg-red-100 text-red-700 py-0.5 px-2 rounded-full text-xs sm:text-sm font-black">
              {lowStockItems.length}
            </span>
          )}
        </button>

        <button 
          onClick={() => setActiveTab('DISTRIBUTORS')}
          className={`flex items-center gap-2 py-4 px-4 sm:px-6 font-bold text-base sm:text-lg border-b-4 transition-colors whitespace-nowrap ${
            activeTab === 'DISTRIBUTORS' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Building2 size={20} /> Distributors & MOV Rules
          <span className="bg-emerald-100 text-emerald-700 py-0.5 px-2 rounded-full text-xs sm:text-sm font-black">
            {distributors.length}
          </span>
        </button>
      </div>

      {/* TAB CONTENT: Pending Approvals */}
      {activeTab === 'PENDING' && (
        <div className="space-y-6 animate-in slide-in-from-left-4">
          
          {/* Smart MOV Protection Banner (if any distributors were skipped) */}
          {skippedMovList.length > 0 && (
            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-xl shrink-0 mt-0.5">
                  <Coins size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-amber-900">
                      Minimum Order Value (MOV) Rule Engaged — {skippedMovList.length} Order(s) Held Back
                    </h4>
                    <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                      Prevents Delivery Surcharges
                    </span>
                  </div>
                  <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                    The smart restock engine evaluated low-stock items for the following distributors, but did not draft a PO because the total basket value was below their required minimum delivery threshold. The system will hold reordering until more items drop below threshold.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                    {skippedMovList.map((sk: any, idx: number) => (
                      <div key={idx} className="bg-white p-3.5 rounded-xl border border-amber-200 text-xs shadow-xs flex flex-col justify-between">
                        <div>
                          <div className="font-bold text-slate-800">{sk.distributorName}</div>
                          <div className="text-slate-500 mt-0.5">{sk.lowStockCount} low-stock item(s)</div>
                          <div className="mt-2 flex justify-between text-[11px] font-mono">
                            <span className="text-amber-700 font-bold">Basket: BD {sk.totalOrderCost.toFixed(3)}</span>
                            <span className="text-slate-500">MOV: BD {sk.minimumOrderValue.toFixed(3)}</span>
                          </div>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 overflow-hidden">
                            <div 
                              className="bg-amber-500 h-full rounded-full" 
                              style={{ width: `${Math.min(100, (sk.totalOrderCost / (sk.minimumOrderValue || 1)) * 100)}%` }}
                            />
                          </div>
                          <div className="text-[10px] text-slate-400 mt-1">Needs +BD {sk.deficit.toFixed(3)} to meet MOV</div>
                        </div>
                        <button
                          onClick={() => handleRunReorderScan(true, sk.distributorId)}
                          disabled={isScanningCron}
                          className="mt-3 w-full py-1.5 px-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-lg font-bold text-[11px] transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                          title="Generate draft PO for this distributor now, bypassing the Minimum Order Value"
                        >
                          <Plus size={13} /> Draft PO Anyway
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <TableSkeleton rows={4} columns={4} />
          ) : (
            <div className="space-y-4">
              {draftOrders.length > 0 && (
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
                  <div>
                    <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                      <Clock size={18} className="text-amber-500" />
                      <span>Pending Orders Queue ({draftOrders.length} Distributor{draftOrders.length > 1 ? 's' : ''})</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Total commitment: <span className="font-mono font-bold text-slate-800">BD {draftOrders.reduce((sum, po) => sum + Number(po.estimatedCost || 0), 0).toFixed(3)}</span>. Review and dispatch to suppliers, or remove orders you do not wish to place.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleClearAllDrafts}
                      disabled={isDiscarding}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                      title="Discard all pending draft purchase orders"
                    >
                      <Trash2 size={15} /> Clear All Drafts
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {draftOrders.length === 0 ? (
                  lowStockItems.length > 0 ? (
                    <div className="col-span-1 md:col-span-2 p-8 bg-amber-50/70 border-2 border-dashed border-amber-300 rounded-2xl text-center">
                      <div className="inline-flex p-3 bg-amber-100 text-amber-700 rounded-2xl mb-3">
                        <AlertTriangle size={32} />
                      </div>
                      <h3 className="text-lg font-black text-amber-900">
                        {lowStockItems.length} Item(s) in Low Stock Alert — Order Held Back by Minimum Order Value
                      </h3>
                      <p className="text-sm text-amber-800 max-w-lg mx-auto mt-1 mb-5 leading-relaxed">
                        The restock engine identified low-stock items (such as <span className="font-bold text-slate-900">{lowStockItems.map(i => i.name).slice(0, 3).join(', ')}</span>), but did not auto-generate a draft PO because the order value hasn't met the distributor's minimum delivery threshold (MOV).
                      </p>
                      <div className="flex flex-wrap justify-center items-center gap-3">
                        <button
                          onClick={() => handleRunReorderScan(true)}
                          disabled={isScanningCron}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-sm transition-all shadow-sm cursor-pointer active:scale-95 disabled:opacity-50"
                        >
                          <Plus size={16} /> Generate PO Draft Now (Bypass MOV)
                        </button>
                        <button
                          onClick={() => setActiveTab('THRESHOLDS')}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-bold rounded-xl text-sm transition-all cursor-pointer"
                        >
                          View Low Stock Alerts ({lowStockItems.length}) →
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="col-span-1 md:col-span-2 text-center py-16 px-4 bg-white rounded-2xl border-2 border-dashed border-slate-200">
                      <Clock size={48} className="mx-auto text-slate-300 mb-3" />
                      <h3 className="text-lg font-bold text-slate-700">No pending purchase orders</h3>
                      <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-4">
                        The automated engine evaluates inventory nightly at 11:00 PM and bundles low-stock items by distributor if they meet the Minimum Order Value.
                      </p>
                      <button
                        onClick={() => handleRunReorderScan(false)}
                        disabled={isScanningCron}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm transition-all shadow-sm cursor-pointer"
                      >
                        <Play size={16} /> Run Auto-Restock Scan Now
                      </button>
                    </div>
                  )
                ) : (
                draftOrders.map(po => {
                  const items = typeof po.itemsJson === 'string' ? JSON.parse(po.itemsJson) : (po.itemsJson || []);
                  const distMatch = distributors.find(d => d.id === po.distributorId || d.name === po.supplierName);
                  const movVal = distMatch ? Number(distMatch.minimumOrderValue || 0) : 0;

                  return (
                    <div key={po.id} className="bg-white border-2 border-amber-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-black tracking-wide uppercase px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg">
                                Bundled PO Draft
                              </span>
                              {movVal > 0 && (
                                <span className="text-[11px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md flex items-center gap-1">
                                  <CheckCircle size={12} /> Met MOV: BD {movVal.toFixed(3)}
                                </span>
                              )}
                            </div>
                            <h3 className="text-xl font-black text-slate-900 mt-2">{po.supplierName}</h3>
                            <p className="text-xs text-emerald-700 font-bold mt-0.5 flex items-center gap-1">
                              📱 WhatsApp: <span className="font-mono text-slate-800">+{po.whatsappNumber || distMatch?.whatsappNumber || '97339000000'}</span>
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Created: {new Date(po.createdAt).toLocaleDateString()} at {new Date(po.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <div className="flex items-start gap-2">
                            <div className="text-right">
                              <div className="text-2xl font-black text-amber-600 font-mono">BD {Number(po.estimatedCost || 0).toFixed(3)}</div>
                              <div className="text-xs text-slate-500 font-bold">{items.length} items bundled</div>
                            </div>
                            <button
                              onClick={() => setPoToDiscard(po)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                              title={`Remove draft order for ${po.supplierName}`}
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-3.5 mb-6 max-h-48 overflow-y-auto border border-slate-100 text-sm">
                          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Restock Manifest</div>
                          {items.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center border-b border-slate-200/60 last:border-0 py-2">
                              <div>
                                <span className="font-bold text-slate-800">{item.reorderQuantity}x </span>
                                <span className="text-slate-700">{item.name}</span>
                                <span className="text-xs text-slate-400 block">Stock: {item.currentStock ?? 0} (Par: {item.maxThreshold ?? 100})</span>
                              </div>
                              <span className="text-slate-600 font-mono text-xs font-semibold">
                                BD {((item.reorderQuantity || 0) * (item.unitCost || 0)).toFixed(3)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <button 
                          onClick={() => setPoToDiscard(po)}
                          className="px-4 py-3.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer text-sm"
                          title={`Remove ${po.supplierName} order`}
                        >
                          <Trash2 size={16} /> Discard
                        </button>
                        <button 
                          onClick={() => setEditingPO(po)}
                          className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl flex justify-center items-center gap-2 transition-all shadow-md active:scale-95 text-sm cursor-pointer"
                        >
                          <Edit size={18} /> Review & Edit Order
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: In-Transit Deliveries */}
      {activeTab === 'IN_TRANSIT' && (
        loading ? (
          <TableSkeleton rows={3} columns={4} />
        ) : (
          <div className="grid grid-cols-1 gap-4 animate-in slide-in-from-left-4">
            {transitOrders.length === 0 ? (
              <div className="text-center py-16 px-4 bg-white rounded-2xl border-2 border-dashed border-slate-200">
                <Truck size={48} className="mx-auto text-slate-300 mb-3" />
                <h3 className="text-lg font-bold text-slate-700">No deliveries currently on the way</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
                  Approved purchase orders transition here. When the distributor delivery truck arrives at the store, click "Receive Delivery" to inject the restock count into inventory.
                </p>
              </div>
            ) : (
              transitOrders.map(po => {
                const items = typeof po.itemsJson === 'string' ? JSON.parse(po.itemsJson) : (po.itemsJson || []);
                return (
                  <div key={po.id} className="bg-white border-2 border-blue-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
                        <Truck size={36} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-black text-slate-900">{po.supplierName}</h3>
                          <span className="text-xs font-black uppercase px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md">
                            In Transit
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 font-medium mt-0.5">
                          Dispatched on {new Date(po.createdAt).toLocaleDateString()} at {new Date(po.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-xs text-slate-400">Recipient: {po.supplierEmail}</p>
                      </div>
                    </div>
                    
                    {/* Item Summary Chips */}
                    <div className="w-full md:w-auto md:flex-1 md:mx-6 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div className="text-xs font-bold text-slate-500 mb-1">Expected Manifest ({items.length} items):</div>
                      <div className="text-xs text-slate-700 max-h-16 overflow-y-auto">
                        {items.map((it: any, i: number) => (
                          <span key={i} className="inline-block bg-white px-2 py-1 rounded border border-slate-200 mr-1.5 mb-1 font-medium">
                            +{it.reorderQuantity} {it.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="text-left md:text-right w-full md:w-auto flex md:flex-col justify-between items-center md:items-end">
                      <div>
                        <div className="text-2xl font-black text-slate-800 font-mono">BD {Number(po.estimatedCost || 0).toFixed(3)}</div>
                        <div className="text-xs text-slate-400 font-bold">{items.length} items expected</div>
                      </div>

                      <button 
                        onClick={() => handleReceive(po.id, po.supplierName)}
                        className="mt-0 md:mt-3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-6 rounded-xl flex items-center gap-2 transition-all shadow-md active:scale-95 whitespace-nowrap"
                      >
                        <PackageCheck size={22} /> Receive Delivery
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )
      )}

      {/* TAB CONTENT: Low Stock & Thresholds */}
      {activeTab === 'THRESHOLDS' && (
        loading ? (
          <TableSkeleton rows={8} columns={7} />
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in slide-in-from-left-4">
            <div className="p-4 border-b border-red-100 bg-red-50 flex justify-between items-center flex-wrap gap-3">
              <div className="flex items-center gap-2 text-red-700 font-bold">
                <AlertTriangle size={20} />
                <span>Items in Danger Zone (Stock &le; Min Trigger)</span>
              </div>
              <div className="flex items-center gap-3">
                {lowStockItems.length > 0 && (
                  <button
                    onClick={() => handleRunReorderScan(true)}
                    disabled={isScanningCron}
                    className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Generate Draft Purchase Orders for all low-stock items immediately"
                  >
                    <Plus size={15} /> Generate PO Drafts for All Low Stock
                  </button>
                )}
                <div className="text-xs text-red-600 font-semibold font-mono hidden sm:block">
                  Grouped by Distributor entity & evaluated against Minimum Order Value rules
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 font-bold text-slate-600 text-sm">Product</th>
                    <th className="px-6 py-4 font-bold text-slate-600 text-sm">Distributor Entity</th>
                    <th className="px-6 py-4 font-bold text-slate-600 text-center text-sm">Current Stock</th>
                    <th className="px-6 py-4 font-bold text-slate-600 text-center text-sm">Min Trigger</th>
                    <th className="px-6 py-4 font-bold text-slate-600 text-center text-sm">Max Par Level</th>
                    <th className="px-6 py-4 font-bold text-slate-600 text-right text-sm">Cost / Price</th>
                    <th className="px-6 py-4 font-bold text-slate-600 text-center text-sm">Configure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lowStockItems.map((item) => {
                    const dist = distributors.find(d => d.id === item.distributorId) || item.distributor;
                    return (
                      <tr key={item.id} className="even:bg-slate-50/70 hover:bg-blue-50/70 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900">{item.name}</div>
                          {item.barcode && (
                            <div className="text-xs font-mono text-slate-400">Barcode: {item.barcode}</div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 font-bold text-slate-800">
                            <Building2 size={15} className="text-emerald-600" />
                            <span>{dist ? dist.name : (item.supplierName || 'Local Distributor')}</span>
                          </div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">
                            {dist ? dist.contactEmail : (item.supplierEmail || 'supplier@askar.bh')}
                          </div>
                          {dist && dist.minimumOrderValue > 0 && (
                            <span className="inline-block mt-1 text-[10px] font-bold uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                              MOV: BD {dist.minimumOrderValue.toFixed(3)}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="bg-red-100 text-red-700 font-black font-mono tabular-nums px-3 py-1 rounded-lg text-base">
                            {item.stockQuantity}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-slate-600 font-mono font-bold">{item.minThreshold ?? 20}</td>
                        <td className="px-6 py-4 text-center text-slate-600 font-mono font-bold">{item.maxThreshold ?? 100}</td>
                        <td className="px-6 py-4 text-right col-currency font-mono text-xs tabular-nums">
                          <div className="text-slate-500">Cost: BD {Number(item.purchasePrice || 0).toFixed(3)}</div>
                          <div className="font-bold text-slate-900">Sell: BD {Number(item.sellingPrice || 0).toFixed(3)}</div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button 
                              onClick={() => handleCreateDraftForProduct(item)}
                              disabled={isScanningCron}
                              title="Create Purchase Order Draft for this item's distributor"
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                            >
                              <Plus size={14} /> Draft PO
                            </button>
                            <button 
                              onClick={() => openEditThreshold(item)}
                              title="Assign distributor and edit stock thresholds"
                              className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            >
                              <Settings size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {lowStockItems.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center text-slate-500 font-bold">
                        <CheckCircle size={36} className="mx-auto text-emerald-500 mb-2" />
                        All inventory levels are healthy! No items currently below min threshold.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* TAB CONTENT: Distributors & Ordering Rules */}
      {activeTab === 'DISTRIBUTORS' && (
        <div className="space-y-6 animate-in slide-in-from-left-4">
          
          {/* Header Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Building2 size={24} className="text-emerald-600" />
                <h2 className="text-xl font-black text-slate-900">Distributor Entities & Ordering Rules</h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
                Strict foreign-key distributor relations eliminate duplicate supplier orders. Attached Minimum Order Values (MOV) guarantee the system never drafts micro-orders that incur delivery fees.
              </p>
            </div>

            <button
              onClick={openAddDistributorModal}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-all shadow-sm active:scale-95 whitespace-nowrap"
            >
              <Plus size={18} /> Add Distributor
            </button>
          </div>

          {/* Distributors Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {distributors.map((dist) => {
              const pendingVal = Number(dist.pendingReorderTotal || 0);
              const movVal = Number(dist.minimumOrderValue || 0);
              const meetsMov = dist.meetsMov;
              const pct = movVal > 0 ? Math.min(100, (pendingVal / movVal) * 100) : 100;

              return (
                <div 
                  key={dist.id} 
                  className="bg-white rounded-2xl p-6 border-2 border-slate-200 hover:border-emerald-200 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-black text-slate-900">{dist.name}</h3>
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {dist.id}
                          </span>
                        </div>
                        <p className="text-xs text-emerald-600 font-mono font-bold mt-0.5">
                          📱 +{dist.whatsappNumber || '97339000000'}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono">{dist.contactEmail}</p>
                      </div>

                      {meetsMov && pendingVal > 0 ? (
                        <span className="text-xs font-black uppercase px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg flex items-center gap-1">
                          <CheckCircle size={14} /> Ready for PO
                        </span>
                      ) : pendingVal > 0 ? (
                        <span className="text-xs font-black uppercase px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg flex items-center gap-1">
                          <Clock size={14} /> Below MOV
                        </span>
                      ) : (
                        <span className="text-xs font-bold uppercase px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg">
                          Stock Healthy
                        </span>
                      )}
                    </div>

                    {/* Rule Specs */}
                    <div className="grid grid-cols-2 gap-3 my-4 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                          Minimum Order Value
                        </span>
                        <span className="text-lg font-black font-mono text-slate-800">
                          BD {movVal.toFixed(3)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                          Delivery Schedule
                        </span>
                        <span className="text-sm font-bold text-slate-700 flex items-center gap-1 mt-0.5">
                          <Calendar size={14} className="text-slate-400" />
                          {dist.deliveryDays || 'Daily / Any'}
                        </span>
                      </div>
                    </div>

                    {/* Catalog & Low Stock Metrics */}
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-xs text-slate-600 font-medium">
                        <span>Catalog Items Assigned:</span>
                        <span className="font-bold text-slate-800">{dist.productCount || 0} product(s)</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-600 font-medium">
                        <span>Items at Low Stock Trigger:</span>
                        <span className={`font-bold ${(dist.lowStockCount || 0) > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                          {dist.lowStockCount || 0} item(s)
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-600 font-medium">
                        <span>Current Low-Stock Basket:</span>
                        <span className="font-bold font-mono text-slate-900">
                          BD {pendingVal.toFixed(3)}
                        </span>
                      </div>

                      {/* MOV Progress Bar */}
                      {movVal > 0 && pendingVal > 0 && (
                        <div className="pt-2">
                          <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1">
                            <span>Basket vs Minimum Order Rule</span>
                            <span>{pct.toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all ${meetsMov ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {!meetsMov && (
                            <p className="text-[10px] text-amber-600 font-medium mt-1">
                              Will hold order until +BD {dist.deficit.toFixed(3)} more items needed
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Action Buttons */}
                  <div className="flex gap-2 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => openEditDistributorModal(dist)}
                      className="flex-1 py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Settings size={14} /> Adjust MOV & Rules
                    </button>
                    {(dist.productCount === 0 || !dist.productCount) && (
                      <button
                        onClick={() => handleDeleteDistributor(dist)}
                        className="py-2 px-3 rounded-xl border border-red-200 hover:bg-red-50 text-red-600 text-xs font-bold transition-colors"
                        title="Delete distributor"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Threshold / Product Rules Edit Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95">
            <div className="flex justify-between items-start mb-4 border-b pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Adjust Inventory Rules</h3>
                <p className="text-xs text-slate-500 font-semibold">{editingProduct.name}</p>
              </div>
              <button 
                onClick={() => setEditingProduct(null)} 
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Product Name:
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Cost (BHD):
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={editCost}
                    onChange={(e) => setEditCost(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border rounded-xl text-sm font-bold text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Sale Price (BHD):
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={editPrice}
                    onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border rounded-xl text-sm font-bold text-emerald-600 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Current Stock:
                  </label>
                  <input
                    type="number"
                    value={editStock}
                    onChange={(e) => setEditStock(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 border rounded-xl text-sm font-bold text-blue-600 font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Min Danger Trigger:
                  </label>
                  <input
                    type="number"
                    value={editMinThreshold}
                    onChange={(e) => setEditMinThreshold(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 border rounded-xl text-sm font-bold text-red-600 focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                  <span className="text-[11px] text-slate-400">Reorder drafts when &le; this</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Max Target Par Level:
                  </label>
                  <input
                    type="number"
                    value={editMaxThreshold}
                    onChange={(e) => setEditMaxThreshold(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 border rounded-xl text-sm font-bold text-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <span className="text-[11px] text-slate-400">Restock shelf up to this</span>
                </div>
              </div>

              {/* Strict Distributor Entity Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Assigned Distributor Entity:
                </label>
                <select
                  value={editDistributorId}
                  onChange={(e) => handleSelectDistributor(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-sm font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  <option value="">-- Choose Distributor Entity --</option>
                  {distributors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} (MOV: BD {Number(d.minimumOrderValue || 0).toFixed(3)})
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-400 block mt-1">
                  Items from this distributor bundle automatically into one Purchase Order.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Supplier Email (PO Destination):
                </label>
                <input
                  type="email"
                  value={editSupplierEmail}
                  onChange={(e) => setEditSupplierEmail(e.target.value)}
                  placeholder="e.g. orders@distributor.bh"
                  className="w-full px-3 py-2 border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border text-xs text-slate-500">
                Current Live Stock: <strong>{editingProduct.stockQuantity} units</strong>. Next cron order will calculate:{' '}
                <strong>{Math.max(0, editMaxThreshold - editingProduct.stockQuantity)} units</strong> to order.
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-3 border-t">
              <button
                onClick={() => setEditingProduct(null)}
                className="px-4 py-2 border rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveThreshold}
                disabled={isSavingThreshold}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                <Save size={16} /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Distributor Edit / Create Modal */}
      {(editingDistributor || showAddDistModal) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95">
            <div className="flex justify-between items-start mb-4 border-b pb-3">
              <div>
                <h3 className="text-xl font-black text-slate-900">
                  {editingDistributor ? `Configure ${editingDistributor.name}` : 'Register New Distributor'}
                </h3>
                <p className="text-xs text-slate-500">Set ordering rules and Minimum Order Value</p>
              </div>
              <button 
                onClick={() => { setEditingDistributor(null); setShowAddDistModal(false); }}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Distributor Name:
                </label>
                <input
                  type="text"
                  value={distName}
                  onChange={(e) => setDistName(e.target.value)}
                  placeholder="e.g. PepsiCo Logistics, Almarai Dairy"
                  className="w-full px-3 py-2 border rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  WhatsApp Number (Click-to-Chat Orders):
                </label>
                <input
                  type="text"
                  value={distWhatsapp}
                  onChange={(e) => setDistWhatsapp(e.target.value)}
                  placeholder="e.g. 97339123456"
                  className="w-full px-3 py-2 border rounded-xl text-sm font-mono font-bold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Must include country code (e.g. 973 for Bahrain). PO Click-to-Chat protocol dispatches to this number.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Contact Email (Optional Backup):
                </label>
                <input
                  type="email"
                  value={distEmail}
                  onChange={(e) => setDistEmail(e.target.value)}
                  placeholder="e.g. orders@supplier.bh"
                  className="w-full px-3 py-2 border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Minimum Order Value (MOV in BD):
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={distMov}
                  onChange={(e) => setDistMov(parseFloat(e.target.value) || 0)}
                  placeholder="e.g. 50.0"
                  className="w-full px-3 py-2 border rounded-xl text-sm font-bold font-mono text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <span className="text-[11px] text-slate-400 block mt-1">
                  PO drafts will NOT be generated unless low-stock basket reaches at least BD {distMov.toFixed(3)}.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Delivery Days (comma separated):
                </label>
                <input
                  type="text"
                  value={distDays}
                  onChange={(e) => setDistDays(e.target.value)}
                  placeholder="e.g. SUN,TUE,THU"
                  className="w-full px-3 py-2 border rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-3 border-t">
              <button
                onClick={() => { setEditingDistributor(null); setShowAddDistModal(false); }}
                className="px-4 py-2 border rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDistributor}
                disabled={isSavingDistributor}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                <Save size={16} /> Save Distributor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk CSV Import Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95">
            <div className="flex justify-between items-start mb-4 border-b pb-3">
              <div>
                <h3 className="text-xl font-black text-slate-900">Rapid CSV Product Onboarding</h3>
                <p className="text-xs text-slate-500">Automatically links products to distributor entities</p>
              </div>
              <button onClick={() => setShowCsvModal(false)} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-slate-600">
                    Paste CSV Data:
                  </label>
                  <button
                    onClick={() => {
                      setCsvText(
                        `name,purchasePrice,sellingPrice,stockQuantity,minThreshold,maxThreshold,supplierName,supplierEmail,barcode\n` +
                        `Almarai Fresh Milk 2L,0.950,1.200,10,25,80,Almarai Dairy Co.,orders@almarai.bh,628100701\n` +
                        `Lurpak Butter 200g,1.100,1.450,15,20,60,Arla Foods Logistics,supply@arlafoods.bh,574090010\n` +
                        `Basmati Rice 5kg,3.800,4.900,8,15,40,Al Jameel Wholesalers,wholesale@aljameel.bh,890103001`
                      );
                    }}
                    className="text-xs font-bold text-emerald-600 hover:underline"
                  >
                    Load Sample CSV
                  </button>
                </div>
                <textarea
                  rows={8}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="name,purchasePrice,sellingPrice,stockQuantity,minThreshold,maxThreshold,supplierName,supplierEmail,barcode"
                  className="w-full p-3 border rounded-xl font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Upload CSV / TXT file:</label>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        setCsvText(String(event.target?.result || ''));
                      };
                      reader.readAsText(file);
                    }
                  }}
                  className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-3 border-t">
              <button
                onClick={() => setShowCsvModal(false)}
                className="px-4 py-2 border rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleCsvImport}
                disabled={isImportingCsv || !csvText.trim()}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                <Upload size={16} /> {isImportingCsv ? 'Importing...' : 'Start Upsert'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal (Supply Chain Automation) */}
      {showAddProductModal && (
        <AddProductModal
          onClose={() => setShowAddProductModal(false)}
          onSuccess={() => {
            fetchDashboardData();
            showNotification('Product successfully added and linked to distributor!', 'success');
          }}
          apiBase={apiBase}
        />
      )}

      {/* Interactive PO Order Pad (Enterprise Review & Edit Modal) */}
      {editingPO && (
        <POReviewModal
          po={editingPO}
          onClose={() => setEditingPO(null)}
          onFinalApprove={handleFinalApprove}
          onDiscard={handleDiscardPO}
          apiBase={apiBase}
        />
      )}

      {/* Discard & Snooze Purchase Order Confirmation Modal */}
      {poToDiscard && (
        <div className="fixed inset-0 z-70 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95">
            <div className="flex justify-between items-start mb-4 border-b pb-3">
              <div>
                <h3 className="text-lg font-black text-red-700 flex items-center gap-2">
                  <Trash2 size={20} /> Discard Purchase Order?
                </h3>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">{poToDiscard.supplierName}</p>
              </div>
              <button
                onClick={() => { setPoToDiscard(null); setSnoozeChoice(0); }}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                Are you sure you want to discard this pending draft order for <span className="font-bold text-slate-900">{poToDiscard.supplierName}</span>?
              </p>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs flex justify-between items-center">
                <div>
                  <span className="text-slate-500 font-medium">Manifest Value:</span>
                  <span className="font-mono font-bold text-slate-900 ml-1.5">BD {Number(poToDiscard.estimatedCost || 0).toFixed(3)}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Bundled Items:</span>
                  <span className="font-bold text-slate-900 ml-1.5">
                    {(typeof poToDiscard.itemsJson === 'string' ? JSON.parse(poToDiscard.itemsJson || '[]') : (poToDiscard.itemsJson || [])).length}
                  </span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-3 bg-amber-50/50">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Automated Reorder Snooze Option
                </label>
                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                    <input
                      type="radio"
                      name="snoozeChoice"
                      checked={snoozeChoice === 0}
                      onChange={() => setSnoozeChoice(0)}
                      className="text-red-600 focus:ring-red-500"
                    />
                    <span>Discard draft only (re-evaluate on next scan)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                    <input
                      type="radio"
                      name="snoozeChoice"
                      checked={snoozeChoice === 24}
                      onChange={() => setSnoozeChoice(24)}
                      className="text-red-600 focus:ring-red-500"
                    />
                    <span>Snooze {poToDiscard.supplierName} for 24h (already ordered offline)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                    <input
                      type="radio"
                      name="snoozeChoice"
                      checked={snoozeChoice === 48}
                      onChange={() => setSnoozeChoice(48)}
                      className="text-red-600 focus:ring-red-500"
                    />
                    <span>Snooze for 48 hours</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-3 border-t">
              <button
                onClick={() => { setPoToDiscard(null); setSnoozeChoice(0); }}
                disabled={isDiscarding}
                className="px-4 py-2 border rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDiscardPO(poToDiscard.id, poToDiscard.supplierName, snoozeChoice)}
                disabled={isDiscarding}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <Trash2 size={16} /> {isDiscarding ? 'Discarding...' : 'Confirm Discard'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wastage & Write-Off Modal */}
      {showWastageModal && (
        <LogWastageModal
          apiBase={apiBase}
          onClose={() => setShowWastageModal(false)}
          onSuccess={() => {
            fetchDashboardData();
            showNotification('Stock written off and financial loss recorded.', 'success');
          }}
        />
      )}

    </div>
  );
}
