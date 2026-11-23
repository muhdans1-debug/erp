// askar-admin-dashboard/src/components/ResilienceChaosHarbor.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Flame,
  Activity,
  Download,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Layers,
  Zap,
  Radio,
  Server,
  Database,
  Clock,
  Terminal,
  FileText,
  History,
  Undo2,
  Gauge,
  Cpu
} from 'lucide-react';
import { getAdminPin } from '../utils/auth';

interface ResilienceChaosHarborProps {
  apiBase: string;
}

export const ResilienceChaosHarbor: React.FC<ResilienceChaosHarborProps> = ({ apiBase }) => {
  const [subTab, setSubTab] = useState<'flight' | 'chaos' | 'shadow' | 'timetravel'>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('subtab');
      if (p === 'timetravel' || p === 'time-travel' || p === 'rollback') return 'timetravel';
      if (p === 'chaos') return 'chaos';
      if (p === 'shadow') return 'shadow';
    }
    return 'flight';
  });
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [chaosStatus, setChaosStatus] = useState<any>(null);
  const [shadowIntegrity, setShadowIntegrity] = useState<any>(null);
  const [shadowParity, setShadowParity] = useState<any>(null);
  const [governorStatus, setGovernorStatus] = useState<any>(null);
  const [sentinelStatus, setSentinelStatus] = useState<any>(null);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [expandedSnapshotId, setExpandedSnapshotId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const timerRef = useRef<any>(null);

  const fetchFlightEvents = async () => {
    try {
      const pin = getAdminPin() || '9999';
      const catParam = selectedCategory !== 'ALL' ? `&category=${selectedCategory}` : '';
      const res = await fetch(`${apiBase}/api/flight-recorder/events?limit=100${catParam}`, {
        headers: { 'x-manager-pin': pin }
      });
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (_) {}
  };

  const fetchChaosStatus = async () => {
    try {
      const res = await fetch(`${apiBase}/api/chaos/status`);
      if (res.ok) {
        const data = await res.json();
        setChaosStatus(data);
      }
    } catch (_) {}
  };

  const fetchShadowLedger = async () => {
    try {
      const pin = getAdminPin() || '9999';
      const [intRes, parRes] = await Promise.all([
        fetch(`${apiBase}/api/shadow-ledger/integrity`, { headers: { 'x-manager-pin': pin } }),
        fetch(`${apiBase}/api/shadow-ledger/parity`, { headers: { 'x-manager-pin': pin } })
      ]);
      if (intRes.ok) setShadowIntegrity(await intRes.json());
      if (parRes.ok) setShadowParity(await parRes.json());
    } catch (_) {}
  };

  const fetchGovernorAndSentinel = async () => {
    try {
      const [govRes, senRes] = await Promise.all([
        fetch(`${apiBase}/api/engine/governor-status`),
        fetch(`${apiBase}/api/hardware/sentinel-status`)
      ]);
      if (govRes.ok) {
        const d = await govRes.json();
        setGovernorStatus(d.governor);
      }
      if (senRes.ok) {
        const d = await senRes.json();
        setSentinelStatus(d.sentinel);
      }
    } catch (_) {}
  };

  const fetchSnapshots = async () => {
    try {
      const pin = getAdminPin() || '9999';
      const res = await fetch(`${apiBase}/api/time-travel/snapshots?limit=50`, {
        headers: { 'x-manager-pin': pin }
      });
      if (res.ok) {
        const d = await res.json();
        const list = d.snapshots || [];
        setSnapshots(list);
        if (list.length > 0) {
          setExpandedSnapshotId(prev => prev || list[0].snapshotId);
        }
      }
    } catch (_) {}
  };

  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([
      fetchFlightEvents(),
      fetchChaosStatus(),
      fetchShadowLedger(),
      fetchGovernorAndSentinel(),
      fetchSnapshots()
    ]);
    setLoading(false);
  };

  useEffect(() => {
    refreshAll();
  }, [apiBase, selectedCategory]);

  useEffect(() => {
    if (!autoRefresh) return;
    timerRef.current = setInterval(() => {
      fetchFlightEvents();
      fetchChaosStatus();
      fetchGovernorAndSentinel();
    }, 3000);
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, selectedCategory, apiBase]);

  const handleDownloadCrashpack = async () => {
    const pin = getAdminPin() || '9999';
    try {
      const res = await fetch(`${apiBase}/api/flight-recorder/export`, {
        headers: { 'x-manager-pin': pin }
      });
      if (!res.ok) throw new Error('Failed to download crashpack');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crashpack-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setActionFeedback({ type: 'success', message: 'Black Box Crashpack (.json) downloaded successfully.' });
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message });
    }
  };

  const handleArmChaos = async (scenario: string, durationSec: number) => {
    const pin = getAdminPin() || '9999';
    if (!window.confirm(`⚠️ ARM CHAOS SCENARIO?\n\nThis will safely simulate '${scenario}' for ${durationSec} seconds to test recovery mechanisms.\n\nAuto-disarm will restore normal operations within ${durationSec}s.`)) {
      return;
    }

    try {
      const res = await fetch(`${apiBase}/api/chaos/arm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-manager-pin': pin },
        body: JSON.stringify({ scenario, durationSec })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to arm chaos');
      setActionFeedback({ type: 'success', message: `Chaos armed: ${scenario} (${durationSec}s)` });
      fetchChaosStatus();
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message });
    }
  };

  const handleDisarmChaos = async () => {
    const pin = getAdminPin() || '9999';
    try {
      const res = await fetch(`${apiBase}/api/chaos/disarm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-manager-pin': pin },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to disarm');
      setActionFeedback({ type: 'success', message: 'Chaos disarmed. All systems normal.' });
      fetchChaosStatus();
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message });
    }
  };

  const handleHealParity = async () => {
    const pin = getAdminPin() || '9999';
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/shadow-ledger/heal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-manager-pin': pin },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Heal pass failed');
      setActionFeedback({
        type: 'success',
        message: data.message || `Synchronized ${data.healedCount || 0} missing ledger entries.`
      });
      fetchShadowLedger();
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRollbackSnapshot = async (snapshotId: string) => {
    const pin = getAdminPin() || '9999';
    if (!window.confirm(`⚠️ CONFIRM SURGICAL ROLLBACK?\n\nThis will restore the selected entity to its exact before-mutation state without affecting any subsequent sales or customers.\n\nProceed?`)) {
      return;
    }

    try {
      const res = await fetch(`${apiBase}/api/time-travel/rollback/${snapshotId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-manager-pin': pin },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rollback failed');
      setActionFeedback({ type: 'success', message: data.message || `Successfully rolled back snapshot ${snapshotId}` });
      fetchSnapshots();
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message });
    }
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'ERROR': return 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
      case 'CHAOS': return 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse';
      case 'SQL': return 'bg-purple-500/20 text-purple-400 border border-purple-500/30';
      case 'WS': return 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
      case 'LEDGER': return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
      case 'HTTP': return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
      default: return 'bg-slate-700/50 text-slate-300 border border-slate-600/30';
    }
  };

  const getGovernorStatePill = () => {
    const st = governorStatus?.state || 'NORMAL';
    if (st === 'RUSH_HOUR') {
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5 animate-pulse">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          RUSH HOUR THROTTLED
        </span>
      );
    }
    if (st === 'IDLE_DRAIN') {
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          IDLE DRAIN OPTIMAL
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40 flex items-center gap-1.5">
        <Gauge className="w-3.5 h-3.5 text-blue-400" />
        TRAFFIC NORMAL
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                Resilience & Chaos Engineering Harbor
                {chaosStatus?.isArmed ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse">
                    ⚠️ CHAOS ACTIVE ({chaosStatus.remainingSeconds}s)
                  </span>
                ) : (
                  getGovernorStatePill()
                )}
              </h1>
              <p className="text-sm text-slate-400">
                Flight-recorder ring buffer, safe fault-injection sandbox, and surgical time-travel rollback.
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {chaosStatus?.isArmed && (
            <button
              onClick={handleDisarmChaos}
              className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-900/30 animate-bounce"
            >
              <RotateCcw className="w-4 h-4" />
              EMERGENCY DISARM
            </button>
          )}

          <button
            onClick={handleDownloadCrashpack}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            Export Crashpack (.json)
          </button>

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
              autoRefresh
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-pulse' : ''}`} />
            {autoRefresh ? 'Live Streaming' : 'Paused'}
          </button>

          <button
            onClick={refreshAll}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Adaptive Telemetry KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-xs">
          <div className="text-slate-500 font-medium">AIMD Sync Batch</div>
          <div className="text-lg font-bold text-white mt-0.5">
            {governorStatus?.recommendedBatchSize || 15} rows
            <span className="text-[10px] text-slate-400 ml-1.5">({governorStatus?.wanRttMs || 150}ms WAN)</span>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-xs">
          <div className="text-slate-500 font-medium">Counter Activity</div>
          <div className="text-lg font-bold text-white mt-0.5">
            {governorStatus?.timeSinceLastSaleSec !== undefined ? `${governorStatus.timeSinceLastSaleSec}s ago` : 'Active'}
            <span className="text-[10px] text-slate-400 ml-1.5 font-normal">({governorStatus?.requestsPerSecond || 0} req/s)</span>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-xs">
          <div className="text-slate-500 font-medium">NBR VAT Clock Drift</div>
          <div className="text-lg font-bold mt-0.5 flex items-center gap-1.5">
            <span className={sentinelStatus?.hasClockSkewWarning ? 'text-amber-400' : 'text-emerald-400'}>
              {Math.abs(sentinelStatus?.clockDriftMs || 0)}ms drift
            </span>
            <span className="text-[10px] text-slate-400 font-normal">
              {sentinelStatus?.hasClockSkewWarning ? '⚠️ Warning' : '✅ Compliant'}
            </span>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-xs">
          <div className="text-slate-500 font-medium">Hardware Sentinel</div>
          <div className="text-lg font-bold text-white mt-0.5 flex items-center gap-1.5">
            <span className="text-emerald-400">{sentinelStatus?.printerWatchdogMode || 'READY'}</span>
            <span className="text-[10px] text-slate-400 font-normal">
              ({sentinelStatus?.totalZombiesReaped || 0} zombies reaped)
            </span>
          </div>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          className={`p-3.5 rounded-lg border flex items-center justify-between text-sm ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <span>{actionFeedback.message}</span>
          <button onClick={() => setActionFeedback(null)} className="text-xs opacity-75 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Sub-Tabs Navigation */}
      <div className="flex border-b border-slate-800 gap-2 overflow-x-auto">
        <button
          onClick={() => setSubTab('flight')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            subTab === 'flight'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-4 h-4" />
          Flight-Recorder Buffer ({events.length} Events)
        </button>

        <button
          onClick={() => setSubTab('timetravel')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            subTab === 'timetravel'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="w-4 h-4" />
          Time-Travel & Surgical Rollback ({snapshots.length})
        </button>

        <button
          onClick={() => setSubTab('chaos')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            subTab === 'chaos'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Flame className="w-4 h-4" />
          Chaos & Fault-Injection Harbor
          {chaosStatus?.isArmed && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
          )}
        </button>

        <button
          onClick={() => setSubTab('shadow')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            subTab === 'shadow'
              ? 'border-purple-500 text-purple-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Database className="w-4 h-4" />
          Shadow Ledger & Cryptographic Parity
        </button>
      </div>

      {/* TAB 1: FLIGHT RECORDER BUFFER */}
      {subTab === 'flight' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold mr-1">Filter:</span>
            {['ALL', 'HTTP', 'SQL', 'WS', 'SYNC', 'CHAOS', 'ERROR', 'LEDGER'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  selectedCategory === cat
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden font-mono text-xs">
            <div className="bg-slate-900/80 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-slate-400">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                In-Memory Circular Ring Buffer (Zero-GC, 500 Slots)
              </span>
              <span>Showing last {events.length} ordered traces</span>
            </div>

            <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-900/60 p-2">
              {events.length === 0 ? (
                <div className="py-12 text-center text-slate-500">No events logged in the buffer yet.</div>
              ) : (
                events.map((ev) => (
                  <div key={ev.seq} className="py-2 px-3 hover:bg-slate-900/40 rounded flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-slate-600 text-[11px] w-12">#{ev.seq}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getCategoryBadgeClass(ev.category)}`}>
                        {ev.category}
                      </span>
                      <span className="text-slate-300 font-semibold">{ev.type}</span>
                      <span className="text-slate-500 text-[11px]">corr:{ev.correlationId?.slice(-8)}</span>
                    </div>

                    <div className="flex items-center gap-4 text-slate-400 text-[11px]">
                      {ev.durationMs !== null && (
                        <span className={`font-semibold ${ev.durationMs > 50 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {ev.durationMs}ms
                        </span>
                      )}
                      {ev.details?.method && (
                        <span className="text-slate-400">{ev.details.method} {ev.details.url?.slice(0, 32)}</span>
                      )}
                      {ev.details?.message && (
                        <span className="text-rose-400">{ev.details.message.slice(0, 48)}</span>
                      )}
                      <span className="text-slate-600">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TIME-TRAVEL & SURGICAL ROLLBACK */}
      {subTab === 'timetravel' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm text-slate-300 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <History className="w-5 h-5 text-indigo-400 shrink-0" />
              <span>
                <strong>Granular CDC Audit Log</strong>: Revert a specific erroneous void, customer credit adjustment, or price override without wiping any subsequent sales.
              </span>
            </div>
            <button
              onClick={fetchSnapshots}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh Snapshots
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/80">
            {snapshots.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                No destructive mutations recorded yet. Voiding a sale or adjusting a Khata balance will automatically record a snapshot here.
              </div>
            ) : (
              snapshots.map((snap) => {
                const isExpanded = expandedSnapshotId === snap.snapshotId;
                return (
                  <div key={snap.snapshotId} className="p-4 hover:bg-slate-850/50 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                          snap.isReverted
                            ? 'bg-slate-800 text-slate-500 line-through'
                            : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                        }`}>
                          {snap.mutationType}
                        </span>
                        <div>
                          <div className="font-bold text-white text-sm flex items-center gap-2">
                            {snap.entityType} ID: <code className="text-slate-300 font-mono text-xs">{snap.entityId}</code>
                            {snap.isReverted && (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                                REVERTED
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            Author PIN: <span className="text-slate-300 font-mono">{snap.authorPin}</span> • {new Date(snap.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpandedSnapshotId(isExpanded ? null : snap.snapshotId)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700"
                        >
                          {isExpanded ? 'Hide Diff' : 'View Diff'}
                        </button>

                        {!snap.isReverted && (
                          <button
                            onClick={() => handleRollbackSnapshot(snap.snapshotId)}
                            className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-900/30"
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                            Surgically Rollback
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expandable Side-by-Side Diff */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                        <div className="bg-rose-950/20 border border-rose-900/30 rounded-lg p-3 overflow-x-auto">
                          <div className="font-bold text-rose-400 mb-1">State BEFORE Mutation:</div>
                          <pre className="text-rose-200">{JSON.stringify(snap.beforeState, null, 2)}</pre>
                        </div>
                        <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-lg p-3 overflow-x-auto">
                          <div className="font-bold text-emerald-400 mb-1">State AFTER Mutation:</div>
                          <pre className="text-emerald-200">{JSON.stringify(snap.afterState, null, 2)}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CHAOS & FAULT-INJECTION HARBOR */}
      {subTab === 'chaos' && (
        <div className="space-y-6">
          {chaosStatus?.isArmed ? (
            <div className="bg-amber-500/10 border-2 border-amber-500/50 rounded-xl p-5 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-pulse">
              <div>
                <h3 className="text-lg font-bold text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  CHAOS HARBOR ACTIVELY ARMED: {chaosStatus.activeScenario}
                </h3>
                <p className="text-sm text-slate-300 mt-1">
                  Simulated failure is active. Master POS is proving its zero-SPOF recovery and local offline queues.
                </p>
                <div className="mt-2 text-xs font-mono text-amber-400">
                  Auto-disarm dead-man's switch triggers in: <span className="font-bold text-base text-white">{chaosStatus.remainingSeconds}s</span>
                </div>
              </div>
              <button
                onClick={handleDisarmChaos}
                className="px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-xl"
              >
                Instant Disarm
              </button>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-sm text-slate-400 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>
                Chaos Harbor is currently <strong>DISARMED</strong>. All local databases, cloud connections, and hardware peripherals are operating normally.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(chaosStatus?.availableScenarios || []).map((sc: any) => {
              const isCurrent = chaosStatus?.isArmed && chaosStatus.activeScenario === sc.key;
              return (
                <div
                  key={sc.key}
                  className={`p-5 rounded-xl border transition-all ${
                    isCurrent
                      ? 'bg-amber-500/10 border-amber-500/60 shadow-xl shadow-amber-950/30'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-white text-base">{sc.title}</h4>
                      <code className="text-xs text-slate-500 block mt-0.5">{sc.key}</code>
                    </div>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                        ACTIVE
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-slate-300 mt-3">{sc.description}</p>

                  <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-xs text-slate-400">Auto-Disarm: 30s</span>
                    <button
                      onClick={() => handleArmChaos(sc.key, 30)}
                      disabled={isCurrent}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        isCurrent
                          ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                          : 'bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-900/30'
                      }`}
                    >
                      {isCurrent ? 'Executing...' : 'Inject Fault (30s)'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: SHADOW LEDGER & CRYPTOGRAPHIC PARITY */}
      {subTab === 'shadow' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Local SHA-256 Chain</span>
                <Database className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-black text-white font-mono">
                {shadowIntegrity?.shortHash || 'Validating...'}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Root: <span className="font-mono text-purple-300">{shadowIntegrity?.rootHash?.slice(0, 24)}...</span>
              </p>
              <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 flex justify-between">
                <span>Audited Rows: {shadowIntegrity?.scannedRows || 0}</span>
                <span>Net: {Number(shadowIntegrity?.totalNetSumBhd || 0).toFixed(3)} BHD</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Turso Cloud Parity</span>
                <Zap className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl font-bold flex items-center gap-2">
                {shadowParity?.isParityMatch ? (
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-5 h-5" /> 100% Bit-Perfect
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-5 h-5" /> {shadowParity?.status || 'Checking...'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Drift: <span className="font-bold text-white">{shadowParity?.driftBhd || '0.000'} BHD</span>
              </p>
              <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 flex justify-between">
                <span>Local: {shadowParity?.local?.rowCount || 0} rows</span>
                <span>Turso: {shadowParity?.turso?.rowCount || 0} rows</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Autonomous Drift Healer</span>
                <p className="text-xs text-slate-300 mt-2">
                  Scans recent 500 transactions and automatically enqueues any missing local rows directly into Turso.
                </p>
              </div>
              <button
                onClick={handleHealParity}
                disabled={loading}
                className="mt-4 w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-purple-900/30"
              >
                <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Run Bisection Parity Heal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResilienceChaosHarbor;
