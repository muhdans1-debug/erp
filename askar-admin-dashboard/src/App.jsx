import { useState, useEffect, useMemo } from 'react';
import { adminDb } from './db';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell 
} from 'recharts';
import { 
  ShieldCheck, Lock, AlertTriangle, RefreshCw, Plus, Edit2, Check, 
  ExternalLink, Search, DollarSign, Users, Package, LogOut, Store, ArrowUpRight, Save, X, Server, Printer, CreditCard, Terminal,
  Eye, Truck, Receipt, Scale
} from 'lucide-react';
import DeveloperCockpit from './DeveloperCockpit';
import { useLaptopBridge } from './useLaptopBridge';
import NfcAssignmentModal from './NfcAssignmentModal';
import RegisterSpyWidget from './RegisterSpyWidget';
import FinancialsVatReturn from './FinancialsVatReturn';
import ProcurementLogistics from './ProcurementLogistics';
import ScaleLabelStudio from './ScaleLabelStudio';

const MANAGER_PIN = import.meta.env.VITE_MANAGER_PIN || '9999';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('askar_admin_auth') === 'true';
  });
  const [pinInput, setPinInput] = useState('');
  const [authError, setAuthError] = useState(false);

  // Active Tab: 'overview' | 'spy' | 'products' | 'financials' | 'khata' | 'logistics' | 'vat' | 'labels'
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');

  // Dashboard Data
  const [kpiData, setKpiData] = useState({
    totalDebt: 0,
    totalCustomers: 0,
    totalProducts: 0,
    totalInventoryValue: 0,
  });
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);

  // Search & Filters
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  // Inline editing state for product prices
  const [editingProductId, setEditingProductId] = useState(null);
  const [editPriceValue, setEditPriceValue] = useState('');

  // Modal States
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: '',
    barcode: '',
    sellingPrice: '',
    purchasePrice: '',
    stockQuantity: '100',
  });

  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    balance: '0.000',
  });

  const [adjustCustomer, setAdjustCustomer] = useState(null);
  const [adjustAmount, setAdjustAmount] = useState('');

  // NFC Card Assignment Modal State
  const [showNfcAssignmentModal, setShowNfcAssignmentModal] = useState(false);
  const [pendingNfcTagId, setPendingNfcTagId] = useState('');

  // Role & Port Routing:
  // Port 5176 -> Developer & Patch Control Cockpit (YOUR laptop Dev Plane)
  // Port 5175 -> Askar Store Manager Back-Office (Manager's laptop Hub)
  const [showDevCockpit, setShowDevCockpit] = useState(() => {
    if (typeof window !== 'undefined') {
      if (window.location.search.includes('view=dev')) return true;
      if (window.location.search.includes('view=manager')) return false;
      return window.location.port === '5176';
    }
    return false;
  });

  // Global Developer Shortcut: Ctrl + Shift + D toggles God-Mode Developer Cockpit
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setShowDevCockpit((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Local RJ45 UI Bridge: Receives real-time hardware NFC scans from Sunmi terminal
  const handleCustomerDetectedOnSunmi = (customer) => {
    setActiveTab('khata');
    setCustomerSearch(customer.name || customer.phone || '');
    setStatusMessage(`⚡ [RJ45 Bridge] Sunmi NFC Scanned: ${customer.name} (Balance: BD ${Number(customer.balance || 0).toFixed(3)})`);
  };

  const handleUnknownNfcScanned = (tagId) => {
    console.log(`💳 [App] Triggering NFC Assignment Modal for tag: ${tagId}`);
    setPendingNfcTagId(tagId);
    setShowNfcAssignmentModal(true);
    setStatusMessage(`💳 [Unregistered NFC Card Scanned]: Tag ${tagId} tapped on Sunmi. Assign to Personal or Mess Group.`);
  };

  const {
    isBridgeConnected,
    lockCustomerForEditing,
    releaseCustomerLock,
    sendPrintRequest,
    broadcastNfcAssigned,
    liveCounterCart,
    remoteDrawerKick,
    remoteClearCart,
    remoteLockRegister
  } = useLaptopBridge(handleCustomerDetectedOnSunmi, handleUnknownNfcScanned);

  // Authentication Handler
  const handlePinSubmit = (e) => {
    e?.preventDefault();
    if (pinInput === MANAGER_PIN) {
      setIsAuthenticated(true);
      sessionStorage.setItem('askar_admin_auth', 'true');
      setAuthError(false);
      setPinInput('');
    } else {
      setAuthError(true);
      setPinInput('');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('askar_admin_auth');
    setPinInput('');
  };

  // Master Data Fetcher from Turso Cloud
  const fetchAllData = async () => {
    try {
      setRefreshing(true);
      setDbError(null);

      // 1. Fetch Khata KPI & Customer Master
      const khataSumResult = await adminDb.execute(
        'SELECT SUM(balance) as totalDebt, COUNT(*) as totalCustomers FROM KhataCustomer'
      );
      const totalDebt = Number(khataSumResult.rows[0]?.totalDebt || 0);
      const totalCustomers = Number(khataSumResult.rows[0]?.totalCustomers || 0);

      const customerRows = await adminDb.execute(
        'SELECT id, access_token, name, balance, phone, updatedAt FROM KhataCustomer ORDER BY balance DESC'
      );
      setCustomers(customerRows.rows);

      // 2. Fetch Products
      const productRows = await adminDb.execute(
        'SELECT id, name, sellingPrice, purchasePrice, stockQuantity, barcode, updatedAt FROM Product ORDER BY name ASC'
      );
      setProducts(productRows.rows);

      // 3. Compute Product Inventory Valuation
      let inventoryVal = 0;
      for (const p of productRows.rows) {
        const qty = Number(p.stockQuantity) || 0;
        const price = Number(p.sellingPrice) || 0;
        inventoryVal += qty * price;
      }

      setKpiData({
        totalDebt,
        totalCustomers,
        totalProducts: productRows.rows.length,
        totalInventoryValue: inventoryVal,
      });

      setRefreshing(false);
    } catch (err) {
      console.error('Turso Cloud Query Failed:', err);
      setDbError(err.message || 'Failed to connect to Turso Cloud');
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (isAuthenticated) {
      Promise.resolve().then(() => {
        if (active) fetchAllData();
      });
    }
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  // Flash status message
  const showFlash = (msg) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(''), 4500);
  };

  // Update Product Price Directly in Turso Cloud
  const handleSavePrice = async (productId) => {
    const newPrice = parseFloat(editPriceValue);
    if (isNaN(newPrice) || newPrice < 0) {
      alert('Please enter a valid selling price.');
      return;
    }

    try {
      await adminDb.execute({
        sql: `UPDATE Product SET sellingPrice = ?, updatedAt = datetime('now') WHERE id = ?`,
        args: [newPrice, productId]
      });

      setEditingProductId(null);
      showFlash(`Price updated to BHD ${newPrice.toFixed(3)}! Will push to SUNMI terminal on next sync.`);
      fetchAllData();
    } catch (err) {
      alert(`Error updating product price: ${err.message}`);
    }
  };

  // Add New Barcode Product to Turso Cloud
  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.sellingPrice) {
      alert('Product Name and Selling Price are required.');
      return;
    }

    try {
      const id = 'prod_' + Date.now();
      const barcode = newProduct.barcode || 'BC' + Math.floor(100000000000 + Math.random() * 900000000000);
      const sellPrice = parseFloat(newProduct.sellingPrice) || 0;
      const purchPrice = parseFloat(newProduct.purchasePrice) || (sellPrice * 0.7);
      const stock = parseInt(newProduct.stockQuantity) || 50;

      await adminDb.execute({
        sql: `INSERT INTO Product (id, tenantId, name, barcode, sellingPrice, purchasePrice, stockQuantity, minThreshold, updatedAt)
              VALUES (?, 'tenant_1', ?, ?, ?, ?, ?, 10, datetime('now'))`,
        args: [id, newProduct.name, barcode, sellPrice, purchPrice, stock]
      });

      setShowAddProductModal(false);
      setNewProduct({ name: '', barcode: '', sellingPrice: '', purchasePrice: '', stockQuantity: '100' });
      showFlash(`Product "${newProduct.name}" added to cloud catalog!`);
      fetchAllData();
    } catch (err) {
      alert(`Error adding product: ${err.message}`);
    }
  };

  // Add New Khata Customer to Turso Cloud
  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomer.name) {
      alert('Customer Name is required.');
      return;
    }

    try {
      const id = 'kc_' + Date.now();
      // Generate clean UUID token for QR / statement
      const accessToken = Math.random().toString(36).substring(2, 6) + '-' + Math.random().toString(36).substring(2, 6);
      const initialBalance = parseFloat(newCustomer.balance) || 0;

      await adminDb.execute({
        sql: `INSERT INTO KhataCustomer (id, access_token, name, balance, phone, updatedAt)
              VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        args: [id, accessToken, newCustomer.name, initialBalance, newCustomer.phone || '']
      });

      setShowAddCustomerModal(false);
      setNewCustomer({ name: '', phone: '', balance: '0.000' });
      showFlash(`Khata Customer "${newCustomer.name}" registered with access token ${accessToken}!`);
      fetchAllData();
    } catch (err) {
      alert(`Error registering customer: ${err.message}`);
    }
  };

  // Adjust Customer Balance
  const handleAdjustBalance = async () => {
    if (!adjustCustomer) return;
    const amount = parseFloat(adjustAmount);
    if (isNaN(amount)) {
      alert('Please enter a valid balance adjustment amount.');
      return;
    }

    try {
      await adminDb.execute({
        sql: `UPDATE KhataCustomer SET balance = balance + ?, updatedAt = datetime('now') WHERE access_token = ?`,
        args: [amount, adjustCustomer.access_token]
      });

      setAdjustCustomer(null);
      setAdjustAmount('');
      releaseCustomerLock(adjustCustomer?.id);
      showFlash(`Updated Khata balance for ${adjustCustomer.name}.`);
      fetchAllData();
    } catch (err) {
      alert(`Error updating balance: ${err.message}`);
    }
  };

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const name = (p.name || '').toLowerCase();
      const barcode = (p.barcode || '').toLowerCase();
      const query = productSearch.toLowerCase();
      return name.includes(query) || barcode.includes(query);
    });
  }, [products, productSearch]);

  // Filtered Customers
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const name = (c.name || '').toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      const token = (c.access_token || '').toLowerCase();
      const query = customerSearch.toLowerCase();
      return name.includes(query) || phone.includes(query) || token.includes(query);
    });
  }, [customers, customerSearch]);

  // Chart Data for Khata Debt Distribution
  const chartData = useMemo(() => {
    return customers.slice(0, 7).map(c => ({
      name: c.name?.split(' ')[0] || c.access_token,
      debt: Number(c.balance) || 0,
    }));
  }, [customers]);

  // -------------------------------------------------------------
  // SCREEN 1: Manager Authentication Gate (PIN Pad)
  // -------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-8 text-center text-white">
          <div className="w-16 h-16 bg-red-600/20 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-red-500/30">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">
            Askar Supermarket
          </h1>
          <p className="text-sm font-medium text-slate-400 mt-1">
            Back-Office Command Center
          </p>
          <div className="mt-4 px-3 py-1.5 bg-slate-700/60 rounded-full inline-flex items-center gap-2 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Direct Edge Access to Turso Cloud (ap-south-1)
          </div>

          <form onSubmit={handlePinSubmit} className="mt-8">
            <label className="block text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">
              Enter 4-Digit Manager PIN
            </label>
            <input
              type="password"
              maxLength={4}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="••••"
              autoFocus
              className="w-full text-center text-3xl font-mono tracking-[0.5em] py-3.5 bg-slate-900 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-white placeholder-slate-600"
            />

            {authError && (
              <p className="text-red-400 text-sm mt-3 flex items-center justify-center gap-1.5 font-medium animate-pulse">
                <AlertTriangle className="w-4 h-4" />
                Invalid PIN. Default manager PIN is 9999.
              </p>
            )}

            {/* Quick On-Screen Number Keypad for Tablets / Mobile */}
            <div className="grid grid-cols-3 gap-2 mt-6">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'Clear', 0, 'Enter'].map((val, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => {
                    if (val === 'Clear') setPinInput('');
                    else if (val === 'Enter') handlePinSubmit();
                    else if (pinInput.length < 4) setPinInput(pinInput + val);
                  }}
                  className={`py-3 rounded-lg text-lg font-bold transition active:scale-95 ${
                    val === 'Enter'
                      ? 'bg-red-600 hover:bg-red-700 text-white col-span-1'
                      : val === 'Clear'
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm'
                      : 'bg-slate-700/80 hover:bg-slate-700 text-white'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>

            <button
              type="submit"
              className="mt-6 w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg transition active:scale-95"
            >
              Unlock Command Center
            </button>
          </form>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // DEVELOPER COCKPIT (God Mode Multi-Tenant & Patch Control)
  // -------------------------------------------------------------
  if (showDevCockpit) {
    return (
      <DeveloperCockpit
        isBridgeConnected={isBridgeConnected}
        broadcastNfcAssigned={broadcastNfcAssigned}
        activeStoreId="tenant_askar_01"
        onClose={() => {
          if (window.location.port === '5176') {
            setShowDevCockpit(false);
          } else {
            setShowDevCockpit(false);
          }
        }}
      />
    );
  }

  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // SCREEN 2: The Command Center (Authenticated)
  // Pinned Dark Sidebar with Emerald Green Accents (Beloved Back-Office Layout)
  // -------------------------------------------------------------
  return (
    <div className="flex h-screen w-screen bg-slate-50 text-slate-900 font-sans overflow-hidden select-none">
      {/* Pinned Fixed Sidebar Navigation (288px) */}
      <div className="fixed left-0 top-0 h-screen w-[288px] bg-slate-900 text-white flex flex-col shadow-xl z-30">
        
        {/* Brand Header */}
        <div className="p-6 border-b border-slate-800">
          <h2 className="text-xl font-bold text-emerald-400 m-0 tracking-tight">
            Askar Supermarket
          </h2>
          <p className="text-xs text-slate-400 mt-1">Back-Office Manager</p>
          <div className="flex items-center justify-between mt-3 text-xs">
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Turso Cloud
            </span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${isBridgeConnected ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-500'}`}>
              RJ45 {isBridgeConnected ? 'ACTIVE' : 'IDLE'}
            </span>
          </div>
        </div>

        {/* Sidebar Vertical Tabs */}
        <nav className="flex-1 p-3.5 space-y-1 overflow-y-auto scroll-zone text-sm font-semibold">
          <button
            onClick={() => setActiveTab('overview')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition cursor-pointer text-left ${
              activeTab === 'overview' ? 'bg-emerald-600 text-white font-bold shadow' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <DollarSign className="w-5 h-5 text-emerald-400" />
            <span>Overview & Analytics</span>
          </button>

          <button
            onClick={() => setActiveTab('spy')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition cursor-pointer text-left ${
              activeTab === 'spy' ? 'bg-emerald-600 text-white font-bold shadow' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <Eye className="w-5 h-5 text-cyan-400" />
              <span>Register Spy (Till)</span>
            </div>
            {liveCounterCart?.items?.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('products')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition cursor-pointer text-left ${
              activeTab === 'products' ? 'bg-emerald-600 text-white font-bold shadow' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-amber-400" />
              <span>Product Catalog (PIM)</span>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
              {products.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('financials')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition cursor-pointer text-left ${
              activeTab === 'financials' ? 'bg-emerald-600 text-white font-bold shadow' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Receipt className="w-5 h-5 text-emerald-400" />
            <span>Profit &amp; Loss (P&amp;L)</span>
          </button>

          <button
            onClick={() => setActiveTab('khata')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition cursor-pointer text-left ${
              activeTab === 'khata' ? 'bg-emerald-600 text-white font-bold shadow' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-blue-400" />
              <span>Khata Ledgers</span>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
              {customers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('logistics')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition cursor-pointer text-left ${
              activeTab === 'logistics' ? 'bg-emerald-600 text-white font-bold shadow' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Truck className="w-5 h-5 text-amber-500" />
            <span>WhatsApp Distributor POs</span>
          </button>

          <button
            onClick={() => setActiveTab('vat')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition cursor-pointer text-left ${
              activeTab === 'vat' ? 'bg-emerald-600 text-white font-bold shadow' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Receipt className="w-5 h-5 text-emerald-400" />
            <span>Bahrain NBR VAT Return</span>
          </button>

          <button
            onClick={() => setActiveTab('labels')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition cursor-pointer text-left ${
              activeTab === 'labels' ? 'bg-emerald-600 text-white font-bold shadow' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Scale className="w-5 h-5 text-indigo-400" />
            <span>Scale &amp; Produce Labels</span>
          </button>

          <button
            onClick={() => {
              setPendingNfcTagId('');
              setShowNfcAssignmentModal(true);
            }}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-emerald-400 transition cursor-pointer text-left"
          >
            <CreditCard className="w-5 h-5 text-emerald-400" />
            <span>NFC Card Manager</span>
          </button>
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={() => setShowDevCockpit(true)}
            className="text-[11px] font-mono text-slate-400 hover:text-emerald-400 transition cursor-pointer flex items-center gap-1.5"
            title="Open Developer Cockpit (Ctrl+Shift+D)"
          >
            <Terminal className="w-3.5 h-3.5 text-indigo-400" />
            <span>Dev Cockpit</span>
          </button>

          <button
            onClick={handleLogout}
            className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Lock</span>
          </button>
        </div>
      </div>

      {/* Main Body with ml-[288px] containment */}
      <main className="ml-[288px] flex-1 h-screen overflow-y-auto bg-slate-50 p-6 lg:p-8">
        {/* Status Toast Alert */}
        {statusMessage && (
          <div className="mb-4 bg-emerald-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-md flex items-center gap-2">
            <Check className="w-4 h-4" />
            {statusMessage}
          </div>
        )}
        {dbError && (
          <div className="mb-6 p-4 bg-red-100 border border-red-300 text-red-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <span>Turso Cloud Error: {dbError}</span>
            </div>
            <button
              onClick={fetchAllData}
              className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-bold"
            >
              Retry
            </button>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODULE 1: Overview & Analytics (KPIs & Debt Dashboard)         */}
        {/* ------------------------------------------------------------- */}
        {(activeTab === 'overview' || activeTab === 'kpi') && (
          <div className="space-y-8">
            {/* Top Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* THE MASSIVE RED KPI BOX - Total Khata Outstanding */}
              <div className="bg-gradient-to-br from-red-600 to-rose-700 text-white rounded-2xl p-6 shadow-xl border-4 border-red-500/50 flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 -mt-2 -mr-2 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black tracking-widest uppercase bg-black/20 px-2.5 py-1 rounded-md text-red-100">
                      High Priority • Khata Debt
                    </span>
                    <AlertTriangle className="w-5 h-5 text-red-200" />
                  </div>
                  <h3 className="text-sm font-medium text-red-100 mt-3">
                    Total Khata Due to Store
                  </h3>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-4xl lg:text-5xl font-black tracking-tight drop-shadow-sm">
                      BHD {Number(kpiData.totalDebt).toFixed(3)}
                    </span>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-red-400/30 flex items-center justify-between text-xs text-red-100">
                  <span>Across {kpiData.totalCustomers} customer ledgers</span>
                  <button
                    onClick={() => setActiveTab('khata')}
                    className="underline font-bold flex items-center gap-1 hover:text-white"
                  >
                    View list <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Total Active Customers */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                    <Users className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-500">Khata Customers</h3>
                  <p className="text-3xl font-extrabold text-slate-900 mt-1">
                    {kpiData.totalCustomers}
                  </p>
                </div>
                <p className="text-xs text-slate-500 mt-4 pt-3 border-t border-slate-100">
                  Registered Khata phone accounts
                </p>
              </div>

              {/* Catalog Total Products */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
                    <Package className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-500">Catalog SKUs</h3>
                  <p className="text-3xl font-extrabold text-slate-900 mt-1">
                    {kpiData.totalProducts}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>In Turso Primary Database</span>
                  <button
                    onClick={() => setActiveTab('products')}
                    className="text-amber-600 font-bold hover:underline"
                  >
                    Manage
                  </button>
                </div>
              </div>

              {/* Inventory Retail Value */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-500">Retail Inventory Value</h3>
                  <p className="text-3xl font-extrabold text-slate-900 mt-1">
                    BHD {kpiData.totalInventoryValue.toFixed(3)}
                  </p>
                </div>
                <p className="text-xs text-slate-500 mt-4 pt-3 border-t border-slate-100">
                  Stock quantity × retail selling price
                </p>
              </div>
            </div>

            {/* Visual Analytics Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Highest Khata Debt Exposure
                    </h2>
                    <p className="text-xs text-slate-500">
                      Outstanding credit by top customer ledgers (in BHD)
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-red-50 text-red-600 rounded-lg">
                    Real-time Turso Cloud
                  </span>
                </div>

                <div className="h-64 w-full">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#64748b' }} unit=" BHD" />
                        <Tooltip
                          formatter={(val) => [`BHD ${Number(val).toFixed(3)}`, 'Debt Balance']}
                          contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', border: 'none' }}
                        />
                        <Bar dataKey="debt" radius={[6, 6, 0, 0]}>
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.debt > 10 ? '#dc2626' : '#f59e0b'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                      No Khata debt records available
                    </div>
                  )}
                </div>
              </div>

              {/* Edge Architecture Quick Reference */}
              <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-400 mb-2">
                    <ShieldCheck className="w-4 h-4" />
                    Distributed POS Architecture
                  </div>
                  <h3 className="text-lg font-bold">Askar Tri-Tier Hybrid Engine</h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Changes made here in the Back-Office update the Turso Cloud database instantly.
                    Cashier terminals sync this catalog seamlessly without stopping sales.
                  </p>

                  <div className="mt-4 space-y-2 text-xs">
                    <div className="p-2.5 bg-slate-800 rounded-lg flex items-center justify-between">
                      <span className="text-slate-300">Edge Worker API</span>
                      <span className="text-emerald-400 font-mono">Live • Cloudflare</span>
                    </div>
                    <div className="p-2.5 bg-slate-800 rounded-lg flex items-center justify-between">
                      <span className="text-slate-300">Customer PWA</span>
                      <span className="text-emerald-400 font-mono">Live • Vercel</span>
                    </div>
                    <div className="p-2.5 bg-slate-800 rounded-lg flex items-center justify-between">
                      <span className="text-slate-300">SUNMI POS Terminal</span>
                      <span className="text-blue-400 font-mono">Local-First (0ms)</span>
                    </div>
                  </div>
                </div>

                <a
                  href="https://askar-khata-pwa.vercel.app/tab/f8a9-4b2c"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-6 w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition"
                >
                  <span>Open Sample Customer PWA</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODULE 1.5: Register Spy (Live Sunmi Till Monitor)             */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'spy' && (
          <RegisterSpyWidget
            liveCounterCart={liveCounterCart}
            isBridgeConnected={isBridgeConnected}
            onDrawerKick={remoteDrawerKick}
            onClearCart={remoteClearCart}
            onLockRegister={remoteLockRegister}
            onTestPrint={sendPrintRequest}
          />
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODULE 2: Product & Price Manager                             */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'products' && (
          <div className="space-y-6">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900">
              <div className="flex items-center gap-3">
                <Package className="w-6 h-6 text-amber-600 shrink-0" />
                <div>
                  <h3 className="font-bold text-sm">Instant Cloud Price Propagation</h3>
                  <p className="text-xs text-amber-800">
                    When you update a price or barcode here, Turso writes to the global edge. Physical SUNMI terminals pull updated pricing on their next sync cycle automatically.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddProductModal(true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shrink-0 shadow transition"
              >
                <Plus className="w-4 h-4" />
                Add Barcode Item
              </button>
            </div>

            {/* Filter and Search */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-center gap-3">
              <Search className="w-5 h-5 text-slate-400 ml-1" />
              <input
                type="text"
                placeholder="Search products by item name or barcode..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full text-sm outline-none text-slate-800 placeholder-slate-400"
              />
              {productSearch && (
                <button onClick={() => setProductSearch('')} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Product Data Grid */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 uppercase text-xs tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4">Item Name</th>
                      <th className="py-3.5 px-4">Barcode</th>
                      <th className="py-3.5 px-4">Cost (BHD)</th>
                      <th className="py-3.5 px-4">Selling Price (BHD)</th>
                      <th className="py-3.5 px-4 text-center">Margin %</th>
                      <th className="py-3.5 px-4">Stock Level</th>
                      <th className="py-3.5 px-4 text-right">Quick Edit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.map((p) => {
                      const isEditing = editingProductId === p.id;
                      const sell = Number(p.sellingPrice) || 0;
                      const cost = Number(p.purchasePrice || (sell * 0.65));
                      const margin = sell > 0 ? (((sell - cost) / sell) * 100).toFixed(1) : '0.0';
                      const marginNum = parseFloat(margin);

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {p.name}
                          </td>
                          <td className="py-3 px-4 text-slate-600 font-mono text-xs">
                            {p.barcode || <span className="text-slate-400 italic">No Barcode</span>}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-500">
                            BHD {cost.toFixed(3)}
                          </td>
                          <td className="py-3 px-4">
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-500">BHD</span>
                                <input
                                  type="number"
                                  step="0.005"
                                  value={editPriceValue}
                                  onChange={(e) => setEditPriceValue(e.target.value)}
                                  className="w-24 px-2 py-1 border border-red-500 rounded text-sm font-bold text-slate-900 outline-none focus:ring-1 focus:ring-red-500"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSavePrice(p.id)}
                                  className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition"
                                  title="Save to Turso Cloud"
                                >
                                  <Save className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setEditingProductId(null)}
                                  className="p-1 bg-slate-300 text-slate-700 rounded hover:bg-slate-400 transition"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <span className="font-extrabold text-slate-900 font-mono">
                                BHD {sell.toFixed(3)}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold ${
                              marginNum >= 25 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : marginNum >= 15 
                                ? 'bg-amber-100 text-amber-800' 
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {margin}%
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                              (p.stockQuantity || 0) < 10 
                                ? 'bg-red-100 text-red-700' 
                                : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {p.stockQuantity || 0} units
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {!isEditing && (
                              <button
                                onClick={() => {
                                  setEditingProductId(p.id);
                                  setEditPriceValue(p.sellingPrice);
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                Change Price
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {filteredProducts.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          No products found matching &ldquo;{productSearch}&rdquo;
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODULE 3: Khata Master Directory                              */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'khata' && (
          <div className="space-y-6">
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-red-950">
              <div className="flex items-center gap-3">
                <Users className="w-6 h-6 text-red-600 shrink-0" />
                <div>
                  <h3 className="font-bold text-sm">Customer Khata Ledger Administration</h3>
                  <p className="text-xs text-red-800">
                    Manage credit limits, inspect generated statements, or adjust disputed ledger balances.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setPendingNfcTagId('');
                    setShowNfcAssignmentModal(true);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shrink-0 shadow transition"
                >
                  <CreditCard className="w-4 h-4" />
                  NFC Card Manager
                </button>
                <button
                  onClick={() => setShowAddCustomerModal(true)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shrink-0 shadow transition"
                >
                  <Plus className="w-4 h-4" />
                  Register New Customer
                </button>
              </div>
            </div>

            {/* Filter and Search */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-center gap-3">
              <Search className="w-5 h-5 text-slate-400 ml-1" />
              <input
                type="text"
                placeholder="Search Khata directory by customer name, phone, or UUID token..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full text-sm outline-none text-slate-800 placeholder-slate-400"
              />
              {customerSearch && (
                <button onClick={() => setCustomerSearch('')} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Khata Customer Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 uppercase text-xs tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4">Customer Name</th>
                      <th className="py-3.5 px-4">Phone Number</th>
                      <th className="py-3.5 px-4">UUID Access Token</th>
                      <th className="py-3.5 px-4">Total Due</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCustomers.map((c) => {
                      const balance = Number(c.balance) || 0;
                      return (
                        <tr key={c.id || c.access_token} className="hover:bg-slate-50/80 transition">
                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            {c.name}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 font-mono text-xs">
                            {c.phone || '—'}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                              {c.access_token}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`font-black text-base ${balance > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                              BHD {balance.toFixed(3)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right space-x-2">
                            <button
                              onClick={() => {
                                setAdjustCustomer(c);
                                setAdjustAmount('');
                                lockCustomerForEditing(c.id, c.name);
                              }}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                            >
                              Adjust Balance
                            </button>
                            <button
                              onClick={() => {
                                const ok = sendPrintRequest({
                                  invoiceNo: `STMT-${Date.now().toString().slice(-6)}`,
                                  customerName: c.name,
                                  customerPhone: c.phone,
                                  total: Number(c.balance || 0),
                                  subtotal: Number(c.balance || 0),
                                  vat: 0,
                                  paymentMode: 'CREDIT',
                                  newBalance: Number(c.balance || 0),
                                  items: [
                                    {
                                      name: 'Khata Statement Balance',
                                      quantity: 1,
                                      sellingPrice: Number(c.balance || 0),
                                      total_price: Number(c.balance || 0)
                                    }
                                  ]
                                });
                                if (ok) {
                                  showFlash(`🖨️ Statement print beamed across RJ45 to Sunmi printer for ${c.name}!`);
                                } else {
                                  alert('Sunmi Bridge is offline. Ensure RJ45 cable or bridge server is connected.');
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition"
                              title="Print Statement on Sunmi Hardware Printer"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Sunmi Print</span>
                            </button>
                            <a
                              href={`https://askar-khata-pwa.vercel.app/tab/${c.access_token}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-semibold transition"
                              title="Open Customer's Live Vercel PWA"
                            >
                              <span>PWA View</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredCustomers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          No Khata customer found matching &ldquo;{customerSearch}&rdquo;
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODULE 4: Procurement & Logistics (WhatsApp Distributor POs) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'logistics' && (
          <ProcurementLogistics apiBase="http://localhost:3000" />
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODULE 5: Financials & Bahrain NBR 10% VAT Return Statement    */}
        {/* ------------------------------------------------------------- */}
        {(activeTab === 'financials' || activeTab === 'vat') && (
          <FinancialsVatReturn apiBase="http://localhost:3000" />
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODULE 6: Scale & Shelf Label Studio (EAN-13 Produce Barcodes) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'labels' && (
          <ScaleLabelStudio />
        )}

        {/* Footer with discrete Developer Cockpit shortcut */}
        <footer className="pt-10 pb-4 text-xs text-slate-400 border-t border-slate-200 mt-12 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© {new Date().getFullYear()} Askar Supermarket Store OS • Branch 01 (Askar)</p>
          <button
            onClick={() => setShowDevCockpit(true)}
            className="text-[11px] font-mono text-slate-400 hover:text-indigo-600 transition cursor-pointer"
            title="Open Developer & Patch Control Cockpit (Shortcut: Ctrl+Shift+D)"
          >
            ⚙️ Developer Cockpit (Ctrl+Shift+D)
          </button>
        </footer>
      </main>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: Add Barcode Product                                  */}
      {/* ------------------------------------------------------------- */}
      {showAddProductModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-lg">Add New Product SKU</h3>
              <button onClick={() => setShowAddProductModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Almarai Milk 2L"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Barcode / EAN
                </label>
                <input
                  type="text"
                  placeholder="e.g. 6281058102036 (leave blank to auto-generate)"
                  value={newProduct.barcode}
                  onChange={(e) => setNewProduct({ ...newProduct, barcode: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Selling Price (BHD) *
                  </label>
                  <input
                    type="number"
                    step="0.005"
                    required
                    placeholder="0.750"
                    value={newProduct.sellingPrice}
                    onChange={(e) => setNewProduct({ ...newProduct, sellingPrice: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Purchase Cost (BHD)
                  </label>
                  <input
                    type="number"
                    step="0.005"
                    placeholder="0.550"
                    value={newProduct.purchasePrice}
                    onChange={(e) => setNewProduct({ ...newProduct, purchasePrice: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Initial Stock Quantity
                </label>
                <input
                  type="number"
                  value={newProduct.stockQuantity}
                  onChange={(e) => setNewProduct({ ...newProduct, stockQuantity: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>

              <div className="pt-3 flex gap-2 justify-end border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition"
                >
                  Save to Turso Cloud
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: Register Khata Customer                              */}
      {/* ------------------------------------------------------------- */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-lg">Register Khata Customer</h3>
              <button onClick={() => setShowAddCustomerModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Customer Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mohammed Bucheeri"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Bahrain Mobile Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 97339123456"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Starting Balance (BHD)
                </label>
                <input
                  type="number"
                  step="0.005"
                  placeholder="0.000"
                  value={newCustomer.balance}
                  onChange={(e) => setNewCustomer({ ...newCustomer, balance: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500 outline-none font-bold"
                />
              </div>

              <div className="pt-3 flex gap-2 justify-end border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition"
                >
                  Create Khata Ledger
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 3: Adjust Customer Balance                              */}
      {/* ------------------------------------------------------------- */}
      {adjustCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="font-bold text-slate-900 text-lg">Adjust Khata Balance</h3>
            <p className="text-xs text-slate-500 mt-1">
              Customer: <span className="font-semibold text-slate-800">{adjustCustomer.name}</span>
            </p>
            <p className="text-sm font-bold text-slate-700 mt-1">
              Current Due: <span className="text-red-600 font-black">BHD {Number(adjustCustomer.balance).toFixed(3)}</span>
            </p>

            <div className="mt-4">
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Adjustment Amount (BHD)
              </label>
              <p className="text-xs text-slate-400 mb-2">Use positive (+) to add debt, negative (-) to record payment.</p>
              <input
                type="number"
                step="0.005"
                placeholder="e.g. -5.000 (customer paid 5 BHD)"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500 outline-none font-bold"
              />
            </div>

            <div className="mt-6 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  if (adjustCustomer?.id) {
                    releaseCustomerLock(adjustCustomer.id);
                  }
                  setAdjustCustomer(null);
                }}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdjustBalance}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition"
              >
                Apply Adjustment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NFC Card Assignment Modal (Auto-triggered on Sunmi scan or manual click) */}
      <NfcAssignmentModal
        isOpen={showNfcAssignmentModal}
        onClose={() => {
          setShowNfcAssignmentModal(false);
          setPendingNfcTagId('');
        }}
        initialTagId={pendingNfcTagId}
        onSuccess={() => {
          fetchAllData();
        }}
        broadcastNfcAssigned={broadcastNfcAssigned}
      />
    </div>
  );
}
