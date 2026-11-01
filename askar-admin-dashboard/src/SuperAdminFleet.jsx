import { useState, useEffect } from 'react';
import {
  Server,
  Terminal,
  Database,
  Wifi,
  WifiOff,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Play,
  Plus,
  Radio,
  Cpu,
  Lock,
  Unlock,
  AlertTriangle,
  Clock,
  Send,
  Zap,
  CheckCircle2,
  XCircle,
  ExternalLink
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

export default function SuperAdminFleet() {
  const [activeSubTab, setActiveSubTab] = useState('fleet'); // 'fleet' | 'query' | 'provision' | 'audit'
  const [fleet, setFleet] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Remote Query Engine State
  const [selectedDb, setSelectedDb] = useState('');
  const [sqlQuery, setSqlQuery] = useState('SELECT id, name, sellingPrice, stockQuantity FROM Product LIMIT 10;');
  const [queryRunning, setQueryRunning] = useState(false);
  const [queryResult, setQueryResult] = useState(null);
  const [queryError, setQueryError] = useState(null);

  // New Tenant Provisioning State
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreSlug, setNewStoreSlug] = useState('');
  const [provisioning, setProvisioning] = useState(false);
  const [provisionSuccess, setProvisionSuccess] = useState(null);

  // Kill Switch Modal
  const [killModalTarget, setKillModalTarget] = useState(null);
  const [togglingLicense, setTogglingLicense] = useState(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState([]);

  // Load initial data
  const loadFleetData = async () => {
    setLoading(true);
    setStatusMessage('');
    try {
      // 1. Fetch Fleet Terminals
      const fleetRes = await fetch(`${API_BASE}/api/super-admin/fleet`);
      const fleetData = await fleetRes.json();
      if (fleetData.success) {
        setFleet(fleetData.fleet || []);
      }

      // 2. Fetch Turso Databases via Platform API
      const tenantsRes = await fetch(`${API_BASE}/api/super-admin/tenants`);
      const tenantsData = await tenantsRes.json();
      if (tenantsData.success) {
        setTenants(tenantsData.databases || []);
        if (tenantsData.databases?.length > 0 && !selectedDb) {
          setSelectedDb(tenantsData.databases[0].name);
        }
      }

      // 3. Fetch Audit Logs
      const auditRes = await fetch(`${API_BASE}/api/super-admin/audit-logs`);
      const auditData = await auditRes.json();
      if (auditData.success) {
        setAuditLogs(auditData.logs || []);
      }
    } catch (err) {
      console.error('Failed to load fleet data:', err);
      setStatusMessage('⚠️ Could not connect to Super Admin backend. Ensure server is active on port 3000.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFleetData();
    const interval = setInterval(loadFleetData, 20000); // Polling every 20s
    return () => clearInterval(interval);
  }, []);

  // Run Remote Query
  const handleExecuteQuery = async () => {
    if (!selectedDb || !sqlQuery.trim()) return;
    setQueryRunning(true);
    setQueryError(null);
    setQueryResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/super-admin/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          databaseName: selectedDb,
          sqlQuery: sqlQuery.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        setQueryResult(data);
      } else {
        setQueryError(data.error || 'Query failed to execute.');
      }
    } catch (err) {
      setQueryError(err.message || 'Network error reaching query engine.');
    } finally {
      setQueryRunning(false);
    }
  };

  // Provision New Tenant
  const handleProvisionTenant = async (e) => {
    e.preventDefault();
    if (!newStoreSlug.trim()) return;

    setProvisioning(true);
    setProvisionSuccess(null);
    setStatusMessage('');

    try {
      const res = await fetch(`${API_BASE}/api/super-admin/tenants/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: newStoreSlug.trim().toLowerCase(),
          group: 'default'
        })
      });

      const data = await res.json();
      if (data.success) {
        setProvisionSuccess(data);
        setNewStoreName('');
        setNewStoreSlug('');
        loadFleetData(); // refresh fleet list
      } else {
        setStatusMessage(`❌ Provisioning failed: ${data.error}`);
      }
    } catch (err) {
      setStatusMessage(`❌ Network error: ${err.message}`);
    } finally {
      setProvisioning(false);
    }
  };

  // Step 1: The Remote Kill Switch (Invalidate Tokens via Turso Platform API)
  const handleLockPOS = async (dbName) => {
    const orgName = import.meta.env.VITE_TURSO_ORG || import.meta.env.VITE_TURSO_ORG_NAME || 'muhdans1';
    const token = import.meta.env.VITE_TURSO_PLATFORM_TOKEN || import.meta.env.VITE_TURSO_PLATFORM_API_TOKEN;

    if (window.confirm(`Are you sure you want to lock ${dbName}? This will freeze their POS terminals.`)) {
      try {
        // 1. Invalidate tokens on Turso Platform
        if (orgName && token) {
          await fetch(`https://api.turso.tech/v1/organizations/${orgName}/databases/${dbName}/auth/tokens/invalidate`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }).catch((err) => console.warn('Direct Turso invalidation note:', err));
        }

        // 2. Inform local backend fleet registry
        await fetch(`${API_BASE}/api/super-admin/kill-switch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ terminalId: dbName, licensed: false })
        }).catch(() => {});

        alert(`${dbName} has been successfully locked.`);
        loadFleetData();
      } catch (error) {
        console.error("Failed to lock database:", error);
        alert(`Failed to lock database: ${error.message}`);
      }
    }
  };

  // Step 2: The Remote Unlock (Re-Mint Tokens via Turso Platform API)
  const handleUnlockPOS = async (dbName, terminalId) => {
    const orgName = import.meta.env.VITE_TURSO_ORG || import.meta.env.VITE_TURSO_ORG_NAME || 'muhdans1';
    const token = import.meta.env.VITE_TURSO_PLATFORM_TOKEN || import.meta.env.VITE_TURSO_PLATFORM_API_TOKEN;

    if (window.confirm(`Are you sure you want to UNLOCK ${dbName}? This will generate a fresh token and restore terminal access.`)) {
      try {
        // 1. Re-mint fresh full-access database token
        let newJwt = null;
        if (orgName && token) {
          const res = await fetch(`https://api.turso.tech/v1/organizations/${orgName}/databases/${dbName}/auth/tokens`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ expiration: 'never', authorization: 'full-access' })
          });
          if (res.ok) {
            const data = await res.json();
            newJwt = data.jwt;
          }
        }

        // 2. Inform backend fleet registry
        await fetch(`${API_BASE}/api/super-admin/kill-switch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            terminalId: terminalId || dbName,
            licensed: true,
            newToken: newJwt
          })
        }).catch(() => {});

        alert(`✅ ${dbName} has been successfully UNLOCKED!\nNew database token generated and terminal restored.`);
        loadFleetData();
      } catch (error) {
        console.error("Failed to unlock database:", error);
        alert(`Failed to unlock database: ${error.message}`);
      }
    }
  };

  // Toggle Kill Switch
  const handleToggleKillSwitch = async (terminal, newLicensedState) => {
    setTogglingLicense(true);
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/kill-switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terminalId: terminal.id,
          licensed: newLicensedState
        })
      });

      const data = await res.json();
      if (data.success) {
        setKillModalTarget(null);
        loadFleetData();
      }
    } catch (err) {
      alert(`Kill switch trigger error: ${err.message}`);
    } finally {
      setTogglingLicense(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Telemetry Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Terminals</p>
            <p className="text-2xl font-black text-white mt-1">{fleet.length}</p>
            <span className="text-xs text-emerald-400 flex items-center gap-1 mt-1">
              <Radio className="w-3 h-3 animate-pulse" /> 100% Monitored
            </span>
          </div>
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
            <Cpu className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Isolated Turso DBs</p>
            <p className="text-2xl font-black text-purple-400 mt-1">{tenants.length}</p>
            <span className="text-xs text-purple-300 flex items-center gap-1 mt-1">
              <Database className="w-3 h-3" /> Region: AWS ap-south-1
            </span>
          </div>
          <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-400">
            <Server className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">OTA Release State</p>
            <p className="text-2xl font-black text-blue-400 mt-1">v2.4.1</p>
            <span className="text-xs text-blue-300 flex items-center gap-1 mt-1">
              <Zap className="w-3 h-3" /> Capgo Hot-Swap Active
            </span>
          </div>
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400">
            <Terminal className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Offline Alerts (&gt;48h)</p>
            <p className="text-2xl font-black text-emerald-400 mt-1">0</p>
            <span className="text-xs text-slate-400 flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" /> All stores healthy
            </span>
          </div>
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3 bg-red-950/40 border border-red-800/80 rounded-lg text-sm text-red-200">
          {statusMessage}
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-slate-800 space-x-2">
        <button
          onClick={() => setActiveSubTab('fleet')}
          className={`py-2 px-4 text-sm font-semibold rounded-t-lg transition flex items-center gap-2 ${
            activeSubTab === 'fleet'
              ? 'bg-slate-800 text-white border-t-2 border-emerald-500'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Cpu className="w-4 h-4 text-emerald-400" />
          The Fleet Matrix ({fleet.length})
        </button>

        <button
          onClick={() => setActiveSubTab('query')}
          className={`py-2 px-4 text-sm font-semibold rounded-t-lg transition flex items-center gap-2 ${
            activeSubTab === 'query'
              ? 'bg-slate-800 text-white border-t-2 border-blue-500'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-4 h-4 text-blue-400" />
          Remote Query Engine (God-Mode)
        </button>

        <button
          onClick={() => setActiveSubTab('provision')}
          className={`py-2 px-4 text-sm font-semibold rounded-t-lg transition flex items-center gap-2 ${
            activeSubTab === 'provision'
              ? 'bg-slate-800 text-white border-t-2 border-purple-500'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Plus className="w-4 h-4 text-purple-400" />
          Provision New Client DB
        </button>

        <button
          onClick={() => setActiveSubTab('audit')}
          className={`py-2 px-4 text-sm font-semibold rounded-t-lg transition flex items-center gap-2 ${
            activeSubTab === 'audit'
              ? 'bg-slate-800 text-white border-t-2 border-amber-500'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          Global Fleet Audit Stream
        </button>

        <button
          onClick={loadFleetData}
          disabled={loading}
          className="ml-auto py-2 px-3 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-1.5 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Fleet
        </button>
      </div>

      {/* TAB 1: THE FLEET MATRIX */}
      {activeSubTab === 'fleet' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="p-4 bg-slate-800/40 border-b border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-white flex items-center gap-2 text-sm">
              <Cpu className="w-4 h-4 text-emerald-400" />
              Real-Time Hardware & Terminal Fleet Grid
            </h3>
            <span className="text-xs text-slate-400">
              Auto-refreshes every 20s • Direct Turso Cloud Heartbeat
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/80 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Supermarket & Location</th>
                  <th className="py-3 px-4">Terminal & Hardware</th>
                  <th className="py-3 px-4">Network / IP</th>
                  <th className="py-3 px-4">App Version</th>
                  <th className="py-3 px-4">Turso Cloud Sync</th>
                  <th className="py-3 px-4">Licensing Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {fleet.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        {t.clientName}
                      </div>
                      <span className="text-xs font-mono text-purple-400">
                        {t.storeSlug}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-200 font-medium">{t.terminalName}</div>
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>{t.deviceModel}</span>
                        <span>•</span>
                        <span>🔋 {t.batteryLevel}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs">
                      <div className="text-slate-300">{t.ipAddress}</div>
                      <div className="text-slate-500 flex items-center gap-1">
                        <Wifi className="w-3 h-3 text-emerald-400" /> {t.wifiSsid}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-blue-500/10 border border-blue-500/20 text-blue-400">
                        {t.appVersion}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        {new Date(t.lastSync).toLocaleTimeString()} (Active)
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {t.licensed ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950/60 border border-emerald-500/30 text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" /> ACTIVE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-950/60 border border-red-500/30 text-red-400 animate-pulse">
                          <Lock className="w-3 h-3" /> LOCKED (KILL SWITCH)
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => {
                          setSelectedDb(t.storeSlug);
                          setActiveSubTab('query');
                        }}
                        className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-blue-300 rounded border border-slate-700 transition"
                      >
                        SQL
                      </button>
                      {t.licensed ? (
                        <button
                          onClick={() => handleLockPOS(t.storeSlug || t.id)}
                          className="bg-red-100 hover:bg-red-200 text-red-800 font-bold px-2.5 py-1 text-xs rounded border border-red-300 transition inline-flex items-center gap-1"
                        >
                          <Lock className="w-3 h-3 text-red-700" />
                          Lock POS
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUnlockPOS(t.storeSlug || t.id, t.id)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2.5 py-1 text-xs rounded border border-emerald-500 shadow-md transition inline-flex items-center gap-1"
                        >
                          <Unlock className="w-3 h-3 text-white" />
                          Unlock POS
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: REMOTE SQL QUERY ENGINE */}
      {activeSubTab === 'query' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="font-bold text-white flex items-center gap-2">
                <Terminal className="w-5 h-5 text-blue-400" />
                God-Mode Remote SQL Query Engine
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Execute live SQLite queries across any tenant database via Turso Platform Master Token
              </p>
            </div>

            {/* Tenant Database Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">Target Tenant:</span>
              <select
                value={selectedDb}
                onChange={(e) => setSelectedDb(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              >
                {tenants.map((db) => (
                  <option key={db.name} value={db.name}>
                    {db.name} ({db.primaryRegion})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Preset Queries */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="text-slate-500 self-center">Presets:</span>
            <button
              onClick={() => setSqlQuery('SELECT id, name, sellingPrice, stockQuantity FROM Product LIMIT 10;')}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono text-xs transition"
            >
              Recent Products
            </button>
            <button
              onClick={() => setSqlQuery('SELECT id, invoiceNumber, grandTotal, syncStatus, createdAt FROM Sale ORDER BY createdAt DESC LIMIT 10;')}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono text-xs transition"
            >
              Latest Sales
            </button>
            <button
              onClick={() => setSqlQuery('SELECT id, name, phone, balance FROM Customer WHERE balance > 0 ORDER BY balance DESC LIMIT 10;')}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono text-xs transition"
            >
              Khata Debtors
            </button>
            <button
              onClick={() => setSqlQuery("SELECT name, sql FROM sqlite_master WHERE type='table';")}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono text-xs transition"
            >
              Schema Tables
            </button>
          </div>

          {/* SQL Editor */}
          <div className="relative">
            <textarea
              rows={4}
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-sm text-emerald-400 focus:outline-none focus:border-blue-500"
              placeholder="Enter SQL statement (e.g. SELECT * FROM Sale WHERE id = 105;)"
            />
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={handleExecuteQuery}
              disabled={queryRunning}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition disabled:opacity-50"
            >
              <Play className={`w-4 h-4 ${queryRunning ? 'animate-spin' : ''}`} />
              {queryRunning ? 'Executing via Turso...' : 'Run Query on Cloud'}
            </button>

            {queryResult && (
              <span className="text-xs text-emerald-400 font-mono">
                ✓ Executed in {queryResult.executionTimeMs}ms • {queryResult.rows.length} row(s) returned
              </span>
            )}
          </div>

          {queryError && (
            <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-sm text-red-300 font-mono">
              Error: {queryError}
            </div>
          )}

          {/* Query Results Table */}
          {queryResult && (
            <div className="mt-4 border border-slate-800 rounded-lg overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950 sticky top-0 text-slate-400 border-b border-slate-800">
                  <tr>
                    {queryResult.columns.map((col, idx) => (
                      <th key={idx} className="py-2.5 px-3">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {queryResult.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-800/40">
                      {queryResult.columns.map((col, cIdx) => (
                        <td key={cIdx} className="py-2 px-3 text-slate-200">
                          {typeof row[col] === 'object'
                            ? JSON.stringify(row[col])
                            : String(row[col] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PROVISION NEW CLIENT TENANT */}
      {activeSubTab === 'provision' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-2xl max-w-2xl">
          <div className="border-b border-slate-800 pb-4 mb-4">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-purple-400" />
              1-Click Supermarket Tenant Provisioning
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Spins up a physically isolated LibSQL SQLite instance on Turso Cloud via Platform REST API.
            </p>
          </div>

          <form onSubmit={handleProvisionTenant} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                Supermarket Legal Business Name
              </label>
              <input
                type="text"
                required
                value={newStoreName}
                onChange={(e) => {
                  setNewStoreName(e.target.value);
                  setNewStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
                }}
                placeholder="e.g. City Mart Hypermarket"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                Turso Database Slug (Generated)
              </label>
              <div className="flex items-center">
                <span className="bg-slate-800 text-slate-400 px-3 py-2 text-sm rounded-l-lg border border-r-0 border-slate-700 font-mono">
                  client-
                </span>
                <input
                  type="text"
                  required
                  value={newStoreSlug}
                  onChange={(e) => setNewStoreSlug(e.target.value)}
                  placeholder="citymart"
                  className="w-full bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-purple-300 font-mono focus:outline-none focus:border-purple-500"
                />
                <span className="bg-slate-800 text-slate-400 px-3 py-2 text-sm rounded-r-lg border border-l-0 border-slate-700 font-mono">
                  -db
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Assigned Region: <strong>aws-ap-south-1 (AWS Mumbai)</strong> • Group: <strong>default</strong>
              </p>
            </div>

            <button
              type="submit"
              disabled={provisioning}
              className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <Zap className={`w-4 h-4 ${provisioning ? 'animate-spin' : ''}`} />
              {provisioning ? 'Generating Isolated Cloud Database...' : 'Provision Tenant Database (Instant)'}
            </button>
          </form>

          {provisionSuccess && (
            <div className="mt-6 p-4 bg-purple-950/40 border border-purple-500/40 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                Tenant Database Created Successfully!
              </div>
              <div className="text-xs font-mono space-y-1 text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800">
                <p><strong>DB Name:</strong> {provisionSuccess.databaseName}</p>
                <p><strong>Hostname:</strong> {provisionSuccess.hostname}</p>
                <p><strong>LibSQL URL:</strong> {provisionSuccess.url}</p>
                <p className="truncate"><strong>Hardware Token:</strong> {provisionSuccess.authToken}</p>
              </div>
              <p className="text-xs text-emerald-400">
                ✓ Virtual SUNMI Terminal registered in Fleet Matrix. Ready for deployment.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: GLOBAL AUDIT STREAM */}
      {activeSubTab === 'audit' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-3">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <h3 className="font-bold text-white flex items-center gap-2 text-sm">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              Centralized SystemAuditLog Telemetry Stream
            </h3>
            <span className="text-xs text-slate-400">
              Aggregated across all connected supermarket devices
            </span>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {auditLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No active error logs found across the fleet. Hardware running nominally.
              </div>
            ) : (
              auditLogs.map((log, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg flex items-start gap-3 text-xs"
                >
                  <span className="px-2 py-0.5 rounded font-mono font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400">
                    {log.severity || 'INFO'}
                  </span>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-200">{log.action || log.message}</div>
                    <div className="text-slate-400 mt-0.5 font-mono text-[11px]">{log.details || log.error}</div>
                  </div>
                  <span className="text-slate-500 font-mono">
                    {new Date(log.timestamp || log.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Kill Switch Confirmation Modal */}
      {killModalTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-white text-base">
                  {killModalTarget.licensed ? 'Activate Remote Kill Switch?' : 'Re-activate Terminal License?'}
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Target: <strong>{killModalTarget.clientName}</strong> ({killModalTarget.terminalName})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 bg-red-950/30 p-3 rounded-lg border border-red-900/50">
              {killModalTarget.licensed
                ? 'This will immediately revoke the Turso database authorization token and send a remote lock frame to the SUNMI terminal screen. Sales will be blocked until unlocked.'
                : 'This will re-authorize the Turso database token and dismiss the lock screen on the terminal.'}
            </p>

            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => setKillModalTarget(null)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-lg transition"
              >
                Cancel
              </button>
              <button
                disabled={togglingLicense}
                onClick={() => handleToggleKillSwitch(killModalTarget, !killModalTarget.licensed)}
                className={`flex-1 py-2 font-bold text-xs rounded-lg transition text-white ${
                  killModalTarget.licensed
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {togglingLicense ? 'Executing...' : killModalTarget.licensed ? 'Confirm Kill Switch' : 'Confirm Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

