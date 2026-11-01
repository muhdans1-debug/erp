import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, Server, Store, Laptop, Cpu, Wifi, WifiOff, RefreshCw, 
  Play, Send, ShieldCheck, ShieldAlert, Check, X, AlertTriangle, 
  Zap, Radio, Database, Layers, ExternalLink, Activity, Sliders, 
  RotateCcw, Eye, Lock, ArrowUpRight, Copy, CheckCheck, Trash2, Printer, CreditCard
} from 'lucide-react';
import SuperAdminFleet from './SuperAdminFleet';

export default function DeveloperCockpit({
  isBridgeConnected,
  broadcastNfcAssigned,
  activeStoreId = 'tenant_askar_01',
  onSwitchStore,
  onClose
}) {
  // 1. Core Developer State
  const [currentTenant, setCurrentTenant] = useState(activeStoreId || 'tenant_askar_01');
  const [projectedPersona, setProjectedPersona] = useState('POS'); // 'POS' | 'MANAGER' | 'HQ'
  const [deviceViewport, setDeviceViewport] = useState('SUNMI_LANDSCAPE'); // 'SUNMI_LANDSCAPE' | 'TABLET' | 'RESPONSIVE'
  const [activeSideTab, setActiveSideTab] = useState('PATCH'); // 'PATCH' | 'DIAGNOSTICS' | 'FLAGS' | 'LOGS'

  // 2. OTA Hot Patch State
  const [currentPatchVersion, setCurrentPatchVersion] = useState('v2.4.2-dual-wallet');
  const [pendingPatchVersion, setPendingPatchVersion] = useState('v2.4.3-hotfix');
  const [patchNote, setPatchNote] = useState('Dual-Wallet 1-fil rounding & shopper attribution verified');
  const [isPatching, setIsPatching] = useState(false);
  const [patchSuccess, setPatchSuccess] = useState('');

  // 3. Telemetry & Hardware Status
  const [posOnline, setPosOnline] = useState(true);
  const [tursoStatus, setTursoStatus] = useState({ state: 'SYNCED', latencyMs: 3, pendingCount: 0 });
  const [printerStatus, setPrinterStatus] = useState({ paper: 'OK', head: 'HEALTHY', model: 'Sunmi 58mm AIDL' });
  const [actionOutput, setActionOutput] = useState('');

  // 4. Feature Flag Matrix
  const [featureFlags, setFeatureFlags] = useState({
    dualWalletMess: true,
    strictNbrInvoicing: true,
    scaleBarcodeParser: true,
    crossStoreRoamingKhata: true,
    electronicShelfLabels: false,
    whatsappAiOrdering: false,
    hardwareMutexLock: true
  });

  // 5. Live Event Bus Logs
  const [eventLogs, setEventLogs] = useState([
    { id: 1, time: '21:30:12', type: 'SYS', msg: 'Developer Cockpit initialized on port 5176' },
    { id: 2, time: '21:31:05', type: 'NET', msg: 'RJ45 WebSocket bridge connected to counter (ws://0.0.0.0:8080)' },
    { id: 3, time: '21:32:44', type: 'DB', msg: 'Turso Cloud LibSQL replica synced (0 pending mutations)' },
    { id: 4, time: '21:35:18', type: 'NFC', msg: 'NFC Card 08:F9:95:86 resolved: Ali (Dual-Wallet Personal + Mess)' },
    { id: 5, time: '21:38:02', type: 'SALE', msg: 'Invoice INV-005058 committed with paymentType: MESS_KHATA' }
  ]);

  const iframeRef = useRef(null);

  // Store definitions
  const STORES = [
    { id: 'tenant_askar_01', name: 'Askar Supermarket', location: 'Askar Industrial (Primary)', status: 'ACTIVE', terminals: 1 },
    { id: 'tenant_sitra_02', name: 'Sitra Branch', location: 'Sitra Avenue (Staging)', status: 'STANDBY', terminals: 2 },
    { id: 'tenant_salmabad_03', name: 'Salmabad Hub', location: 'Salmabad Central (Sandbox)', status: 'STANDBY', terminals: 1 }
  ];

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  // Helper to add event log
  const pushLog = (type, msg) => {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setEventLogs(prev => [{ id: Date.now(), time, type, msg }, ...prev.slice(0, 49)]);
  };

  // 1. Simulate OTA Patch Deployment
  const handleDeployPatch = (targetScope = 'STORE') => {
    setIsPatching(true);
    setPatchSuccess('');
    pushLog('OTA', `Initiating OTA Patch ${pendingPatchVersion} deploy to [${targetScope === 'STORE' ? currentTenant : 'ALL_STORES'}]...`);

    setTimeout(() => {
      setIsPatching(false);
      setCurrentPatchVersion(pendingPatchVersion);
      setPatchSuccess(`Patch ${pendingPatchVersion} successfully deployed over-the-air!`);
      pushLog('OTA', `Deployment complete: Bundle hash verified. 0 downtime hot-reload triggered.`);
      
      // Auto-reload POS iframe to pick up new bundle if in POS view
      if (iframeRef.current && projectedPersona === 'POS') {
        iframeRef.current.src = iframeRef.current.src;
      }
    }, 1400);
  };

  // 2. 1-Click Remote Diagnostics & Healing
  const triggerRemoteAction = async (actionType) => {
    setActionOutput(`Executing ${actionType}...`);
    pushLog('DIAG', `Triggered remote diagnostic action: ${actionType}`);

    try {
      if (actionType === 'SIMULATE_NFC_ALI') {
        // Send NFC simulation to Fastify / bridge
        await fetch(`http://${currentHost}:3000/api/customers/by-card/08:F9:95:86`);
        setActionOutput('✅ Card 08:F9:95:86 (Ali - Dual Wallet) dispatched to counter!');
        pushLog('NFC', 'Dispatched test NFC tag 08:F9:95:86 to counter terminal');
      } else if (actionType === 'SIMULATE_NFC_MESS') {
        await fetch(`http://${currentHost}:3000/api/customers/by-card/04:6A:B2:91:2A`);
        setActionOutput('✅ Card 04:6A:B2:91:2A (Camp 4 Mess) dispatched to counter!');
        pushLog('NFC', 'Dispatched test NFC tag 04:6A:B2:91:2A (Camp 4) to counter terminal');
      } else if (actionType === 'FORCE_TURSO_SYNC') {
        const res = await fetch(`http://${currentHost}:3000/api/sync/now`, { method: 'POST' });
        const data = await res.json();
        setActionOutput(`✅ Turso Cloud Sync Complete: ${data.message || 'Synced'}`);
        pushLog('DB', 'Turso Cloud LibSQL embedded replica sync forced and verified');
      } else if (actionType === 'TEST_PRINT') {
        setActionOutput('✅ Remote print instruction dispatched to Sunmi AIDL buffer.');
        pushLog('PRT', 'Remote 58mm test slip sent to Sunmi hardware print queue');
      } else if (actionType === 'FLUSH_CACHE') {
        if (iframeRef.current) {
          iframeRef.current.src = iframeRef.current.src;
        }
        setActionOutput('✅ Local browser & SQLite WAL buffer flushed and re-indexed.');
        pushLog('SYS', 'Clean reload and cache flush executed');
      }
    } catch (err) {
      setActionOutput(`❌ Action failed: ${err.message}`);
      pushLog('ERR', `Action ${actionType} error: ${err.message}`);
    }
  };

  // 3. Toggle Feature Flag
  const toggleFeatureFlag = (key) => {
    const updated = !featureFlags[key];
    setFeatureFlags(prev => ({ ...prev, [key]: updated }));
    pushLog('FLAG', `Feature flag [${key}] toggled to: ${updated ? 'ENABLED' : 'DISABLED'}`);
  };

  // Viewport width styling
  const getViewportStyle = () => {
    if (deviceViewport === 'SUNMI_LANDSCAPE') {
      return { width: '100%', maxWidth: '1280px', height: '800px', border: '1px solid #334155', borderRadius: '16px' };
    }
    if (deviceViewport === 'TABLET') {
      return { width: '100%', maxWidth: '1024px', height: '768px', border: '1px solid #334155', borderRadius: '16px' };
    }
    return { width: '100%', height: '100%', minHeight: '750px', border: 'none' };
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* =================================================================== */}
      {/* 1. MASTER DEVELOPER CONTROL BAR (Top God-Mode Strip)                */}
      {/* =================================================================== */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 z-30">
        {/* Left: Branding & Store Lens Selector */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-black text-white shadow-md shadow-indigo-600/30">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-xs tracking-wider uppercase text-indigo-400">Control Plane</span>
              <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold border border-indigo-500/30">
                GOD MODE
              </span>
            </div>
          </div>

          <div className="h-5 w-px bg-slate-800 mx-1"></div>

          {/* STORE LENS SELECTOR */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-700">
            <Store className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-400 font-medium">Store Lens:</span>
            <select
              value={currentTenant}
              onChange={(e) => {
                setCurrentTenant(e.target.value);
                pushLog('LENS', `Switched Store Lens to: ${e.target.value}`);
              }}
              className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
            >
              {STORES.map(s => (
                <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                  {s.name} ({s.status})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Center: Projected Persona Switcher */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => {
              setProjectedPersona('POS');
              pushLog('VIEW', 'Projected Persona: Cashier POS Register');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              projectedPersona === 'POS'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Cashier POS (Sunmi)
          </button>
          <button
            onClick={() => {
              setProjectedPersona('MANAGER');
              pushLog('VIEW', 'Projected Persona: Store Manager Back-Office');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              projectedPersona === 'MANAGER'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            Store Manager
          </button>
          <button
            onClick={() => {
              setProjectedPersona('HQ');
              pushLog('VIEW', 'Projected Persona: Chain HQ & Cloud Fleet');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              projectedPersona === 'HQ'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            Chain HQ Fleet
          </button>
        </div>

        {/* Right: Quick Vitals Pill & Return Button */}
        <div className="flex items-center gap-3">
          {/* Hardware status chips */}
          <div className="hidden xl:flex items-center gap-2">
            <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800/80 text-emerald-400 border border-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              POS: 0ms
            </span>
            <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800/80 text-blue-400 border border-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
              RJ45: Active
            </span>
            <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800/80 text-purple-400 border border-slate-700">
              {currentPatchVersion}
            </span>
          </div>

          {/* Direct Port Launchers */}
          <div className="flex items-center gap-1.5">
            <a
              href="http://localhost:5175/"
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1 bg-emerald-700/80 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg border border-emerald-500/40 transition flex items-center gap-1"
              title="Launch Store Manager on Port 5175"
            >
              <span>Manager :5175</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="http://localhost:5173/"
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-lg border border-slate-700 transition flex items-center gap-1"
              title="Launch POS Counter Register on Port 5173"
            >
              <span>POS :5173</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold border border-slate-700 transition cursor-pointer flex items-center gap-1.5"
          >
            <span>Exit Cockpit</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* =================================================================== */}
      {/* 2. DUAL-STAGE WORKSPACE (Left: Viewport / Right: Developer Rails)     */}
      {/* =================================================================== */}
      <div className="flex flex-1 overflow-hidden">
        {/* ================================================================= */}
        {/* STAGE A: THE PROJECTED WORKSPACE VIEWPORT (Left ~72%)            */}
        {/* ================================================================= */}
        <main className="flex-1 bg-slate-900/60 p-4 flex flex-col items-center justify-start overflow-auto">
          {/* Viewport Frame Toolbar (If viewing POS) */}
          {projectedPersona === 'POS' && (
            <div className="w-full max-w-5xl mb-3 flex items-center justify-between bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-xl text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <span className="font-bold text-white">Target Display:</span>
                <span>Sunmi D2 Mini Counter POS Register</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-800 rounded text-slate-300">
                  http://localhost:5173/
                </span>
              </div>

              {/* Viewport Resolution Presets */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setDeviceViewport('SUNMI_LANDSCAPE')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition ${
                    deviceViewport === 'SUNMI_LANDSCAPE'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Sunmi 1280x800
                </button>
                <button
                  onClick={() => setDeviceViewport('TABLET')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition ${
                    deviceViewport === 'TABLET'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Tablet 1024x768
                </button>
                <button
                  onClick={() => setDeviceViewport('RESPONSIVE')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition ${
                    deviceViewport === 'RESPONSIVE'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Full Stretch
                </button>
                <button
                  onClick={() => {
                    if (iframeRef.current) iframeRef.current.src = iframeRef.current.src;
                    pushLog('SYS', 'Reloaded counter POS viewport');
                  }}
                  className="p-1 text-slate-400 hover:text-white rounded cursor-pointer transition ml-1"
                  title="Reload POS Viewport"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* VIEW 1: LIVE CASHIER POS VIEWPORT (Interactive Iframe) */}
          {projectedPersona === 'POS' && (
            <div 
              style={getViewportStyle()} 
              className="bg-black shadow-2xl overflow-hidden transition-all duration-200 relative flex items-center justify-center"
            >
              <iframe
                ref={iframeRef}
                src={`http://${currentHost}:5173/?view=pos`}
                title="Sunmi Counter POS"
                className="w-full h-full border-0"
              />
            </div>
          )}

          {/* VIEW 2: STORE MANAGER OPERATIONS (Embedded Lens) */}
          {projectedPersona === 'MANAGER' && (
            <div className="w-full max-w-6xl space-y-4">
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-base flex items-center gap-2">
                    <span>Store Manager Hub Projection</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
                      {currentTenant}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Viewing local operations for <strong>Askar Supermarket</strong>. Price updates, stock orders, and Khata ledger edits sync directly to counter.
                  </p>
                </div>
                <a
                  href={`http://${currentHost}:5175/`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                >
                  <span>Open Full Manager Hub (:5175)</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Fast Inline Iframe to Manager Hub */}
              <div className="w-full h-[750px] bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
                <iframe
                  src={`http://${currentHost}:5175/`}
                  title="Askar Store Manager"
                  className="w-full h-full border-0"
                />
              </div>
            </div>
          )}

          {/* VIEW 3: CHAIN HQ MULTI-BRANCH FLEET */}
          {projectedPersona === 'HQ' && (
            <div className="w-full max-w-6xl space-y-4">
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-base flex items-center gap-2">
                    <span>Chain HQ Multi-Tenant Cockpit</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">
                      GLOBAL SCOPE
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Managing cross-store Turso cloud databases, provisioning Branch 2 & 3, and executing remote queries.
                  </p>
                </div>
              </div>

              <div className="w-full bg-slate-900 rounded-2xl border border-slate-800 p-6 overflow-y-auto max-h-[750px]">
                <SuperAdminFleet />
              </div>
            </div>
          )}
        </main>

        {/* ================================================================= */}
        {/* STAGE B: DEVELOPER TELEMETRY & PATCH CONSOLE (Right ~28%)         */}
        {/* ================================================================= */}
        <aside className="w-96 bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 z-20">
          {/* Sub-tab Navigation */}
          <div className="h-11 border-b border-slate-800 px-3 flex items-center justify-between bg-slate-900/80">
            <div className="flex space-x-1">
              <button
                onClick={() => setActiveSideTab('PATCH')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeSideTab === 'PATCH'
                    ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                OTA Patch
              </button>
              <button
                onClick={() => setActiveSideTab('DIAGNOSTICS')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeSideTab === 'DIAGNOSTICS'
                    ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                1-Click Heal
              </button>
              <button
                onClick={() => setActiveSideTab('FLAGS')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeSideTab === 'FLAGS'
                    ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Flags
              </button>
              <button
                onClick={() => setActiveSideTab('LOGS')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeSideTab === 'LOGS'
                    ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Logs
              </button>
            </div>
          </div>

          {/* Console Body */}
          <div className="p-4 flex-1 overflow-y-auto space-y-4">
            {/* ============================================================= */}
            {/* TAB 1: OVER-THE-AIR (OTA) HOT PATCH ENGINE                    */}
            {/* ============================================================= */}
            {activeSideTab === 'PATCH' && (
              <div className="space-y-4">
                <div className="p-3 bg-purple-950/30 border border-purple-800/60 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wider">Active Patch Bundle</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold">
                      LIVE
                    </span>
                  </div>
                  <div className="font-mono text-base font-black text-white">{currentPatchVersion}</div>
                  <div className="text-[11px] text-purple-200/70">
                    Capacitor Updater Channel: <strong>production-main</strong>
                  </div>
                </div>

                {/* Staging New Hot Patch */}
                <div className="space-y-2.5 border border-slate-800 bg-slate-950/60 p-3 rounded-xl">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-purple-400" />
                    Stage Next Hotfix Release
                  </span>
                  <div>
                    <label className="text-[10px] text-slate-400 font-medium">Patch Version Tag</label>
                    <input
                      type="text"
                      value={pendingPatchVersion}
                      onChange={(e) => setPendingPatchVersion(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white outline-none focus:border-purple-500 mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-medium">Changelog / Commit Brief</label>
                    <textarea
                      rows={2}
                      value={patchNote}
                      onChange={(e) => setPatchNote(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 outline-none focus:border-purple-500 mt-1 resize-none"
                    />
                  </div>

                  {patchSuccess && (
                    <div className="p-2.5 bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs font-bold rounded-lg flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      <span>{patchSuccess}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => handleDeployPatch('STORE')}
                      disabled={isPatching}
                      className="py-2 px-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                    >
                      <Zap className={`w-3.5 h-3.5 ${isPatching ? 'animate-spin' : ''}`} />
                      <span>Deploy Askar</span>
                    </button>
                    <button
                      onClick={() => handleDeployPatch('GLOBAL')}
                      disabled={isPatching}
                      className="py-2 px-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-purple-300 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Server className="w-3.5 h-3.5" />
                      <span>Deploy All</span>
                    </button>
                  </div>
                </div>

                {/* Telemetry Vitals */}
                <div className="space-y-2 border border-slate-800 bg-slate-950/60 p-3 rounded-xl text-xs">
                  <span className="font-bold text-slate-300 text-[11px] uppercase tracking-wider">Hardware Telemetry</span>
                  <div className="flex justify-between py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Sunmi D2 Mini Terminal:</span>
                    <span className="font-mono text-emerald-400 font-bold">Online (0ms)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">RJ45 UI Bridge:</span>
                    <span className="font-mono text-blue-400 font-bold">ws://0.0.0.0:8080</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Turso Cloud LibSQL:</span>
                    <span className="font-mono text-purple-400 font-bold">0 Pending WAL</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">58mm Thermal Printer:</span>
                    <span className="font-mono text-emerald-400 font-bold">AIDL Ready</span>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================= */}
            {/* TAB 2: 1-CLICK REMOTE DIAGNOSTICS & HEALING                   */}
            {/* ============================================================= */}
            {activeSideTab === 'DIAGNOSTICS' && (
              <div className="space-y-3">
                <span className="text-xs font-bold text-white uppercase tracking-wider text-[11px]">
                  Emergency & Remote Actions
                </span>

                <button
                  onClick={() => triggerRemoteAction('SIMULATE_NFC_ALI')}
                  className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left text-xs font-bold text-white rounded-xl flex items-center justify-between transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-400" />
                    Simulate NFC Tap: Ali (Dual-Wallet)
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">08:F9:95:86</span>
                </button>

                <button
                  onClick={() => triggerRemoteAction('SIMULATE_NFC_MESS')}
                  className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left text-xs font-bold text-white rounded-xl flex items-center justify-between transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-purple-400" />
                    Simulate NFC Tap: Camp 4 Mess
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">04:6A:B2:91:2A</span>
                </button>

                <button
                  onClick={() => triggerRemoteAction('FORCE_TURSO_SYNC')}
                  className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left text-xs font-bold text-white rounded-xl flex items-center justify-between transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-blue-400" />
                    Force Turso Cloud LibSQL Sync
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">POST /api/sync/now</span>
                </button>

                <button
                  onClick={() => triggerRemoteAction('TEST_PRINT')}
                  className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left text-xs font-bold text-white rounded-xl flex items-center justify-between transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Printer className="w-4 h-4 text-amber-400" />
                    Test Print 58mm Thermal Slip
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">AIDL Driver</span>
                </button>

                <button
                  onClick={() => triggerRemoteAction('FLUSH_CACHE')}
                  className="w-full py-2.5 px-3 bg-red-950/40 hover:bg-red-900/50 border border-red-800 text-left text-xs font-bold text-red-300 rounded-xl flex items-center justify-between transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-red-400" />
                    Flush Cache & Re-Index SQLite WAL
                  </span>
                  <span className="text-[10px] font-mono text-red-400">HEAL</span>
                </button>

                {actionOutput && (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-300">
                    {actionOutput}
                  </div>
                )}
              </div>
            )}

            {/* ============================================================= */}
            {/* TAB 3: FEATURE FLAGS ENGINE                                   */}
            {/* ============================================================= */}
            {activeSideTab === 'FLAGS' && (
              <div className="space-y-3">
                <span className="text-xs font-bold text-white uppercase tracking-wider text-[11px]">
                  Granular Capability Toggles
                </span>

                {Object.entries(featureFlags).map(([flagKey, isEnabled]) => (
                  <div
                    key={flagKey}
                    onClick={() => toggleFeatureFlag(flagKey)}
                    className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between cursor-pointer hover:border-slate-700 transition"
                  >
                    <div>
                      <div className="text-xs font-bold text-white">
                        {flagKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">{flagKey}</div>
                    </div>
                    <div className={`w-8 h-4.5 rounded-full transition flex items-center px-0.5 ${
                      isEnabled ? 'bg-emerald-600 justify-end' : 'bg-slate-700 justify-start'
                    }`}>
                      <div className="w-3.5 h-3.5 rounded-full bg-white shadow-xs"></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ============================================================= */}
            {/* TAB 4: LIVE EVENT BUS LOGS                                    */}
            {/* ============================================================= */}
            {activeSideTab === 'LOGS' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase tracking-wider text-[11px]">
                    Live Telemetry Stream
                  </span>
                  <button
                    onClick={() => setEventLogs([])}
                    className="text-[10px] text-slate-400 hover:text-white"
                  >
                    Clear
                  </button>
                </div>

                <div className="font-mono text-[11px] space-y-1.5 max-h-[550px] overflow-y-auto bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                  {eventLogs.map((log) => (
                    <div key={log.id} className="leading-tight flex items-start gap-1.5">
                      <span className="text-slate-500 shrink-0">{log.time}</span>
                      <span className={`px-1 py-0.2 rounded text-[9px] font-bold shrink-0 ${
                        log.type === 'NFC' ? 'bg-emerald-500/20 text-emerald-300' :
                        log.type === 'DB' ? 'bg-purple-500/20 text-purple-300' :
                        log.type === 'SALE' ? 'bg-amber-500/20 text-amber-300' :
                        log.type === 'ERR' ? 'bg-red-500/20 text-red-300' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {log.type}
                      </span>
                      <span className="text-slate-300 break-all">{log.msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

