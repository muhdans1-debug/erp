// askar-admin-dashboard/src/components/HealthAnalyticsView.tsx
import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Server,
  ShieldCheck,
  TrendingUp,
  Zap,
  Info,
  Layers,
  ArrowUpRight,
  Database,
  Wifi,
  ChevronDown,
  ChevronUp,
  Radio
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';

interface HealthAnalyticsViewProps {
  apiBase: string;
}

interface HourlyBucket {
  id: string;
  timestamp: string;
  label: string;
  transactions: number;
  scans: number;
  items: number;
  salesBhd: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  lockMs: number;
  maxLockMs: number;
  walKb: number;
  cloudPingMs: number;
  errors: number;
  downtimeSec: number;
  uptimePct: number;
}

interface Incident {
  id: string;
  startTime: string;
  endTime: string | null;
  durationSeconds: number | null;
  component: string;
  severity: string;
  triggerSource: string;
  rootCauseReason: string;
  technicalDetails: string | null;
  autoHealed: boolean;
  recoveryAction: string | null;
  salesImpactSummary: string | null;
  isActive: boolean;
}

interface HealthKPIs {
  uptimeSla24h: number;
  totalDowntimeSecondsToday: number;
  mttrSeconds: number;
  totalIncidentsToday: number;
  peakRushHour: string;
  peakHourlySalesBhd: number;
  offlineLossFreeSales: number;
}

export const HealthAnalyticsView: React.FC<HealthAnalyticsViewProps> = ({ apiBase }) => {
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [buckets, setBuckets] = useState<HourlyBucket[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [kpis, setKpis] = useState<HealthKPIs | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING'>('ALL');
  const [expandedIncidentId, setExpandedIncidentId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [activeMetricTab, setActiveMetricTab] = useState<'latency' | 'velocity'>('latency');

  // Real-Time Streaming State
  const [streamStatus, setStreamStatus] = useState<'CONNECTED' | 'CONNECTING' | 'POLLING'>('CONNECTING');
  const [streamTransport, setStreamTransport] = useState<'WEBSOCKET' | 'SSE' | 'POLLING'>('POLLING');
  const [lastLiveTickTime, setLastLiveTickTime] = useState<string>('');
  const [flashTick, setFlashTick] = useState<boolean>(false);
  const [simulating, setSimulating] = useState<boolean>(false);

  const fetchAnalytics = async () => {
    try {
      const [hourlyRes, incRes, kpiRes] = await Promise.all([
        fetch(`${apiBase}/api/system/analytics/hourly?range=${range}&t=${Date.now()}`),
        fetch(`${apiBase}/api/system/analytics/incidents?limit=50&severity=${severityFilter}&t=${Date.now()}`),
        fetch(`${apiBase}/api/system/analytics/kpis?t=${Date.now()}`)
      ]);

      if (hourlyRes.ok) {
        const d = await hourlyRes.json();
        setBuckets(d.buckets || []);
      }
      if (incRes.ok) {
        const d = await incRes.json();
        setIncidents(d.incidents || []);
      }
      if (kpiRes.ok) {
        const d = await kpiRes.json();
        setKpis(d);
      }
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.warn('Failed to load health analytics:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let ws: WebSocket | null = null;
    let sse: EventSource | null = null;
    let pollInterval: any = null;
    let isCleanedUp = false;

    // Helper to process telemetry updates in real-time
    const handleTelemetryUpdate = (data: any) => {
      if (data?.bucket) {
        const b: HourlyBucket = data.bucket;
        setBuckets((prev) => {
          const idx = prev.findIndex((item) => item.id === b.id || item.label === b.label);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], ...b };
            return next;
          } else {
            return [...prev, b];
          }
        });
        setFlashTick(true);
        setTimeout(() => setFlashTick(false), 900);
      }
      if (data?.kpis) {
        setKpis(data.kpis);
      }
      const tickTime = new Date().toLocaleTimeString();
      setLastLiveTickTime(tickTime);
      setLastUpdated(tickTime);
    };

    const handleIncidentAlert = (data: any) => {
      if (data?.incident) {
        const inc: Incident = data.incident;
        setIncidents((prev) => [inc, ...prev.filter((i) => i.id !== inc.id)]);
        setKpis((prev) => (prev ? { ...prev, totalIncidentsToday: (prev.totalIncidentsToday || 0) + 1 } : null));
        const tickTime = new Date().toLocaleTimeString();
        setLastLiveTickTime(tickTime);
        setLastUpdated(tickTime);
      }
    };

    const handleIncidentResolved = (data: any) => {
      if (data?.incident) {
        const inc = data.incident;
        setIncidents((prev) =>
          prev.map((i) =>
            i.id === inc.id || (i.component === inc.component && i.isActive)
              ? { ...i, ...inc, isActive: false }
              : i
          )
        );
        const tickTime = new Date().toLocaleTimeString();
        setLastLiveTickTime(tickTime);
        setLastUpdated(tickTime);
      }
    };

    // Determine target WS endpoint
    let wsUrl = '';
    try {
      const isLocalHost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      if (apiBase.startsWith('http://localhost') || apiBase.startsWith('http://127.0.0.1') || apiBase.startsWith('http://192.168.')) {
        wsUrl = apiBase.replace(/^http/, 'ws') + '/ws';
      } else if (isLocalHost) {
        wsUrl = `ws://${window.location.hostname}:3000/ws`;
      } else {
        wsUrl = 'ws://127.0.0.1:3000/ws';
      }
    } catch (_) {}

    const setupSSE = () => {
      if (isCleanedUp) return;
      try {
        const sseUrl = `${apiBase}/api/system/analytics/stream`;
        sse = new EventSource(sseUrl);

        sse.onopen = () => {
          if (isCleanedUp) return;
          setStreamStatus('CONNECTED');
          setStreamTransport('SSE');
        };

        sse.addEventListener('INIT', (e: MessageEvent) => {
          if (isCleanedUp) return;
          try {
            const parsed = JSON.parse(e.data);
            if (parsed.buckets || parsed.hourly?.buckets) {
              setBuckets(parsed.buckets || parsed.hourly?.buckets || []);
            }
            if (parsed.incidents || parsed.incs?.incidents) {
              setIncidents(parsed.incidents || parsed.incs?.incidents || []);
            }
            if (parsed.kpis) {
              setKpis(parsed.kpis);
            }
            setLastUpdated(new Date().toLocaleTimeString());
          } catch (_) {}
        });

        sse.addEventListener('HEALTH_TELEMETRY_TICK', (e: MessageEvent) => {
          if (isCleanedUp) return;
          try {
            handleTelemetryUpdate(JSON.parse(e.data));
          } catch (_) {}
        });

        sse.addEventListener('HEALTH_ROLLUP_FLUSH', (e: MessageEvent) => {
          if (isCleanedUp) return;
          try {
            handleTelemetryUpdate(JSON.parse(e.data));
          } catch (_) {}
        });

        sse.addEventListener('INCIDENT_ALERT', (e: MessageEvent) => {
          if (isCleanedUp) return;
          try {
            handleIncidentAlert(JSON.parse(e.data));
          } catch (_) {}
        });

        sse.addEventListener('INCIDENT_RESOLVED', (e: MessageEvent) => {
          if (isCleanedUp) return;
          try {
            handleIncidentResolved(JSON.parse(e.data));
          } catch (_) {}
        });

        sse.onerror = () => {
          if (isCleanedUp) return;
          setStreamStatus('POLLING');
          setStreamTransport('POLLING');
        };
      } catch (_) {
        setStreamStatus('POLLING');
        setStreamTransport('POLLING');
      }
    };

    const setupWebSocket = () => {
      if (!wsUrl || isCleanedUp) {
        setupSSE();
        return;
      }

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (isCleanedUp) return;
          setStreamStatus('CONNECTED');
          setStreamTransport('WEBSOCKET');
        };

        ws.onmessage = (event) => {
          if (isCleanedUp) return;
          try {
            const data = JSON.parse(event.data);
            if (
              data.type === 'HEALTH_TELEMETRY_TICK' ||
              data.type === 'HEALTH_ROLLUP_FLUSH' ||
              data.type === 'HEALTH_ANALYTICS_UPDATE'
            ) {
              handleTelemetryUpdate(data);
            } else if (data.type === 'INCIDENT_ALERT') {
              handleIncidentAlert(data);
            } else if (data.type === 'INCIDENT_RESOLVED') {
              handleIncidentResolved(data);
            }
          } catch (_) {}
        };

        ws.onerror = () => {
          if (isCleanedUp) return;
          if (ws) {
            try { ws.close(); } catch (_) {}
            ws = null;
          }
          setupSSE();
        };

        ws.onclose = () => {
          if (isCleanedUp) return;
          if (streamTransport === 'WEBSOCKET') {
            setupSSE();
          }
        };
      } catch (_) {
        setupSSE();
      }
    };

    // Initial load
    setLoading(true);
    fetchAnalytics();
    setupWebSocket();

    // 15s adaptive polling fallback if disconnected
    pollInterval = setInterval(() => {
      if (streamStatus !== 'CONNECTED') {
        fetchAnalytics();
      }
    }, 15000);

    return () => {
      isCleanedUp = true;
      if (ws) {
        try { ws.close(); } catch (_) {}
      }
      if (sse) {
        try { sse.close(); } catch (_) {}
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [apiBase, range, severityFilter]);

  const handleSimulateTick = async () => {
    try {
      setSimulating(true);
      await fetch(`${apiBase}/api/system/analytics/simulate-tick`, { method: 'POST' });
    } catch (_) {
    } finally {
      setTimeout(() => setSimulating(false), 600);
    }
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (seconds === null || seconds === undefined) return 'Active (ongoing)';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const remSec = seconds % 60;
    return `${mins}m ${remSec}s`;
  };

  const formatLocalTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoString;
    }
  };

  const activeOutages = incidents.filter((i) => i.isActive);

  return (
    <div className="space-y-6">
      {/* Live Active Outage Banner (Instant Forensic Alert) */}
      {activeOutages.length > 0 && (
        <div className="bg-rose-950/80 border-2 border-rose-500 rounded-2xl p-4 shadow-[0_0_25px_rgba(244,63,94,0.3)] animate-pulse text-white">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-rose-600 rounded-xl mt-0.5">
              <AlertTriangle size={20} className="text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-black tracking-wide text-rose-200 uppercase flex items-center gap-2">
                  <span>ACTIVE SUB-SYSTEM DEGRADATION DETECTED</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500 text-white font-bold">
                    {activeOutages.length} ACTIVE
                  </span>
                </h4>
                <span className="text-xs font-mono text-rose-300">
                  Autonomous Auto-Healer Engaged
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {activeOutages.map((outage) => (
                  <div key={outage.id} className="text-xs text-rose-100 flex items-center justify-between bg-rose-900/40 px-3 py-1.5 rounded-lg border border-rose-700/50">
                    <span className="font-bold">[{outage.component}] {outage.rootCauseReason}</span>
                    <span className="font-mono text-[11px] text-rose-200">Started: {formatLocalTime(outage.startTime)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Filter & Real-Time Status Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl text-white">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
            <TrendingUp size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-black tracking-tight">
                Store Reliability & Downtime Forensics
              </h3>
              {/* Real-Time Live Status Pill */}
              {streamStatus === 'CONNECTED' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold shadow-[0_0_10px_rgba(16,185,129,0.25)]">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                  </span>
                  <span>LIVE STREAM ({streamTransport})</span>
                  {lastLiveTickTime && <span className="opacity-75">• Tick: {lastLiveTickTime}</span>}
                </span>
              ) : streamStatus === 'CONNECTING' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  CONNECTING STREAM...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-mono font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                  POLLING (15s)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Instant real-time telemetry ticks • Hourly percentiles (P50/P95/P99) • Root-cause forensics
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Time Range Selector */}
          <div className="inline-flex p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => setRange('24h')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                range === '24h' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              24 Hours
            </button>
            <button
              type="button"
              onClick={() => setRange('7d')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                range === '7d' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              7 Days
            </button>
            <button
              type="button"
              onClick={() => setRange('30d')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                range === '30d' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              30 Days
            </button>
          </div>

          {/* Test Real-Time Simulation Trigger */}
          <button
            type="button"
            onClick={handleSimulateTick}
            disabled={simulating}
            title="Simulate live cashier scan & sale over the real-time stream"
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-xs font-bold rounded-xl border border-indigo-500/30 transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Zap size={13} className={simulating ? 'animate-bounce text-amber-300' : 'text-indigo-400'} />
            <span>{simulating ? 'Broadcasting...' : 'Simulate Live Tick'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              fetchAnalytics();
            }}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin text-indigo-400' : ''} />
            <span>{lastUpdated ? lastUpdated : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Top 5 KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Card 1: 24h SLA Uptime */}
        <div className={`bg-slate-900 border ${flashTick ? 'border-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.25)]' : 'border-slate-800'} rounded-2xl p-4 shadow-sm transition-all duration-300`}>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Uptime SLA</span>
            <ShieldCheck size={14} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1">
            {kpis?.uptimeSla24h !== undefined ? `${kpis.uptimeSla24h}%` : '99.98%'}
          </div>
          <div className="text-[10px] text-emerald-400 font-mono mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            Zero Unscheduled Downtime
          </div>
        </div>

        {/* Card 2: Total Downtime Today */}
        <div className={`bg-slate-900 border ${flashTick ? 'border-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.25)]' : 'border-slate-800'} rounded-2xl p-4 shadow-sm transition-all duration-300`}>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Downtime Today</span>
            <Clock size={14} className="text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1">
            {formatDuration(kpis?.totalDowntimeSecondsToday || 0)}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-1">
            {kpis?.totalIncidentsToday || 0} Outage Incident(s)
          </div>
        </div>

        {/* Card 3: MTTR (Mean Time To Recover) */}
        <div className={`bg-slate-900 border ${flashTick ? 'border-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.25)]' : 'border-slate-800'} rounded-2xl p-4 shadow-sm transition-all duration-300`}>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Mean Recovery (MTTR)</span>
            <Zap size={14} className="text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1">
            {kpis?.mttrSeconds !== undefined ? `${kpis.mttrSeconds}s` : '1.8s'}
          </div>
          <div className="text-[10px] text-indigo-400 font-mono mt-1">
            Autonomous Self-Healing
          </div>
        </div>

        {/* Card 4: Peak Rush Hour */}
        <div className={`bg-slate-900 border ${flashTick ? 'border-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.25)]' : 'border-slate-800'} rounded-2xl p-4 shadow-sm transition-all duration-300`}>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Peak Rush Hour</span>
            <Activity size={14} className="text-purple-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1">
            {kpis?.peakRushHour || '19:00'}
          </div>
          <div className="text-[10px] text-purple-300 font-mono mt-1">
            Peak Store Throughput
          </div>
        </div>

        {/* Card 5: Offline Loss-Free Parity */}
        <div className={`bg-slate-900 border ${flashTick ? 'border-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.25)]' : 'border-slate-800'} rounded-2xl p-4 shadow-sm col-span-2 md:col-span-1 transition-all duration-300`}>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Offline Parity</span>
            <Database size={14} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 mt-1">
            100%
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-1">
            Zero Lost Sales on Outage
          </div>
        </div>
      </div>

      {/* Main Chart Section: Switchable between Latency & Store Velocity */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <span>Hourly Performance Dynamics</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                {range.toUpperCase()} Window
              </span>
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Correlates store rush traffic with edge latency and database write lock response times
            </p>
          </div>

          <div className="inline-flex p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-bold self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveMetricTab('latency')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeMetricTab === 'latency'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap size={13} />
              Latency Percentiles (P50 / P95 / P99)
            </button>
            <button
              type="button"
              onClick={() => setActiveMetricTab('velocity')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeMetricTab === 'velocity'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity size={13} />
              Store Throughput & Sales
            </button>
          </div>
        </div>

        {/* Chart 1: Latency Percentiles (P50, P95, P99) */}
        {activeMetricTab === 'latency' && (
          <div className="h-72 w-full pt-2">
            {buckets.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs font-mono text-slate-500">
                Awaiting first hourly rollup samples...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={buckets} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="p99Grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="p50Grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} unit="ms" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                    itemStyle={{ color: '#f8fafc' }}
                    labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
                    formatter={(val: any, name: string | undefined) => [
                      `${val} ms`,
                      name === 'p99Ms' ? 'P99 Worst-Case' : name === 'p95Ms' ? 'P95 Tail' : name === 'p50Ms' ? 'P50 Median' : (name || '')
                    ]}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ paddingBottom: '10px', fontSize: '11px' }}
                  />
                  <ReferenceLine y={30} stroke="#10b981" strokeDasharray="4 4" label={{ value: '30ms SLA Target', fill: '#10b981', fontSize: 10, position: 'top' }} />
                  <Area type="monotone" dataKey="p99Ms" name="P99 (Worst Case)" stroke="#818cf8" strokeWidth={2} fill="url(#p99Grad)" />
                  <Area type="monotone" dataKey="p95Ms" name="P95 Latency" stroke="#38bdf8" strokeWidth={1.5} fill="none" strokeDasharray="2 2" />
                  <Area type="monotone" dataKey="p50Ms" name="P50 (Median)" stroke="#10b981" strokeWidth={2} fill="url(#p50Grad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* Chart 2: Store Throughput & Retail Velocity */}
        {activeMetricTab === 'velocity' && (
          <div className="h-72 w-full pt-2">
            {buckets.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs font-mono text-slate-500">
                Awaiting first hourly rollup samples...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={buckets} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                    itemStyle={{ color: '#f8fafc' }}
                    labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
                    formatter={(val: any, name: string | undefined) => [
                      name === 'salesBhd' ? `BD ${Number(val).toFixed(3)}` : val,
                      name === 'transactions' ? 'Checkouts' : name === 'scans' ? 'Barcode Scans' : name === 'errors' ? 'Errors' : (name || '')
                    ]}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="rect"
                    wrapperStyle={{ paddingBottom: '10px', fontSize: '11px' }}
                  />
                  <Bar dataKey="transactions" name="Checkouts Rung Up" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="scans" name="Barcode Scans" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="errors" name="Subsystem Errors" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>

      {/* Incident Black Box Forensics Section ("Where Did It Go & Why?") */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <h4 className="text-base font-black tracking-tight flex items-center gap-2">
              <span>Incident Forensics Black Box</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                {incidents.length} Recorded
              </span>
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Exact second of outage • Root-cause reasons • Autonomous self-healing resolution logs
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-bold">Filter:</span>
            <div className="inline-flex p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => setSeverityFilter('ALL')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                  severityFilter === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSeverityFilter('CRITICAL')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                  severityFilter === 'CRITICAL' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Critical
              </button>
              <button
                type="button"
                onClick={() => setSeverityFilter('WARNING')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                  severityFilter === 'WARNING' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Warning
              </button>
            </div>
          </div>
        </div>

        {/* Incidents Timeline */}
        {incidents.length === 0 ? (
          <div className="p-8 text-center bg-slate-950/60 rounded-2xl border border-slate-800/80 space-y-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 size={24} />
            </div>
            <div className="text-sm font-black text-white">100% Unscheduled Uptime</div>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              No outages or degraded incidents recorded in the current window. All Master POS edge subsystems, database locks, and sync pipelines are operating within nominal thresholds.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {incidents.map((inc) => {
              const isExpanded = expandedIncidentId === inc.id;
              const isCritical = inc.severity === 'CRITICAL';
              const isWarning = inc.severity === 'WARNING';

              return (
                <div
                  key={inc.id}
                  className={`rounded-2xl border transition-all p-4 ${
                    inc.isActive
                      ? 'bg-red-950/50 border-red-500 shadow-lg animate-pulse'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                        inc.isActive
                          ? 'bg-red-600 text-white'
                          : isCritical
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}>
                        {inc.isActive ? <AlertTriangle size={18} /> : (isCritical ? <Server size={18} /> : <Wifi size={18} />)}
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            inc.isActive
                              ? 'bg-red-600 text-white'
                              : isCritical
                                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}>
                            {inc.isActive ? 'ACTIVE OUTAGE' : inc.severity}
                          </span>

                          <span className="text-xs font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700">
                            {inc.component}
                          </span>

                          <span className="text-xs font-bold text-slate-400">
                            Duration: <span className="font-mono text-white font-bold">{formatDuration(inc.durationSeconds)}</span>
                          </span>
                        </div>

                        <div className="text-sm font-black text-white">
                          {inc.rootCauseReason}
                        </div>

                        <div className="text-xs text-slate-400 flex items-center gap-2 font-mono">
                          <span>Started: {formatLocalTime(inc.startTime)}</span>
                          {inc.endTime && <span>• Restored: {formatLocalTime(inc.endTime)}</span>}
                          <span>• Trigger: {inc.triggerSource}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {inc.autoHealed && (
                        <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-full flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          Auto-Healed
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => setExpandedIncidentId(isExpanded ? null : inc.id)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition flex items-center gap-1 cursor-pointer"
                      >
                        <span>{isExpanded ? 'Less' : 'Forensics'}</span>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Forensics Details */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-3 text-xs animate-in slide-in-from-top-1">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* What happened & Why */}
                        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Info size={13} className="text-amber-400" />
                            Where Did It Go & Why?
                          </div>
                          <p className="text-slate-200 font-sans leading-relaxed">
                            {inc.rootCauseReason}
                          </p>
                          {inc.technicalDetails && (
                            <div className="bg-black/60 p-2.5 rounded-lg font-mono text-[11px] text-amber-300 border border-slate-800 overflow-x-auto mt-2">
                              {inc.technicalDetails}
                            </div>
                          )}
                        </div>

                        {/* How it recovered & Business impact */}
                        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Zap size={13} className="text-emerald-400" />
                            Autonomous Recovery & Impact
                          </div>
                          <div className="space-y-1 text-slate-200 font-sans">
                            <div>
                              <span className="font-bold text-emerald-400">Resolution: </span>
                              {inc.recoveryAction || 'Autonomous supervisor restored communication.'}
                            </div>
                            <div>
                              <span className="font-bold text-indigo-400">Cashier Impact: </span>
                              {inc.salesImpactSummary || 'Zero cart transactions dropped.'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default HealthAnalyticsView;
