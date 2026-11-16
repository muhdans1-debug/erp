import { useEffect, useState } from 'react';
import { 
  Monitor, ShoppingCart, Users, Trash2, KeyRound, 
  CheckCircle2, Zap, Clock, ShieldCheck, RefreshCw,
  Layers, Smartphone, Laptop, CheckCircle, AlertCircle, Package
} from 'lucide-react';
import { DEFAULT_EDGE_API_URL, getApiBaseUrl } from './utils/apiConfig';

interface CartItem {
  id?: string;
  barcode?: string;
  name: string;
  qty?: number;
  quantity?: number;
  price?: number;
  sellingPrice?: number;
  priceAtSale?: number;
  total?: number;
  is_weighed_item?: boolean;
}

export interface RegisterState {
  terminalId: string;
  terminalName: string;
  cashierName: string;
  status: 'ACTIVE_CART' | 'IDLE';
  items: CartItem[];
  itemCount: number;
  total: number;
  customer?: any;
  customerName: string;
  activeCartId?: string;
  lastSeen?: number;
  updatedAt?: string | number;
  isOnline: boolean;
}

interface RegisterSpyWidgetProps {
  apiBase?: string;
  onDrawerKick?: (terminalId?: string) => void;
  onClearCart?: (terminalId?: string) => void;
  onLockRegister?: (terminalId?: string) => void;
}

const DEFAULT_REGISTERS: RegisterState[] = [
  {
    terminalId: 'T1',
    terminalName: 'Counter 1 (Sunmi D2 Mini)',
    cashierName: 'Cashier 1',
    status: 'IDLE',
    items: [],
    itemCount: 0,
    total: 0,
    customerName: 'Walk-in',
    isOnline: false
  },
  {
    terminalId: 'T2',
    terminalName: 'Counter 2 (Feitian F100 Mobile)',
    cashierName: 'Cashier 2',
    status: 'IDLE',
    items: [],
    itemCount: 0,
    total: 0,
    customerName: 'Walk-in',
    isOnline: false
  },
  {
    terminalId: 'T3',
    terminalName: 'Counter 3 (Desktop Web POS 1)',
    cashierName: 'Cashier 3',
    status: 'IDLE',
    items: [],
    itemCount: 0,
    total: 0,
    customerName: 'Walk-in',
    isOnline: false
  },
  {
    terminalId: 'T4',
    terminalName: 'Counter 4 (Desktop Web POS 2)',
    cashierName: 'Cashier 4',
    status: 'IDLE',
    items: [],
    itemCount: 0,
    total: 0,
    customerName: 'Walk-in',
    isOnline: false
  },
  {
    terminalId: 'M1',
    terminalName: 'Floor Phone 1 (Mobile Web POS)',
    cashierName: 'Floor Staff 1',
    status: 'IDLE',
    items: [],
    itemCount: 0,
    total: 0,
    customerName: 'Walk-in',
    isOnline: false
  },
  {
    terminalId: 'M2',
    terminalName: 'Floor Phone 2 (Mobile Web POS)',
    cashierName: 'Floor Staff 2',
    status: 'IDLE',
    items: [],
    itemCount: 0,
    total: 0,
    customerName: 'Walk-in',
    isOnline: false
  }
];

export default function RegisterSpyWidget({
  apiBase,
  onDrawerKick,
  onClearCart,
  onLockRegister
}: RegisterSpyWidgetProps = {}) {
  const [registers, setRegisters] = useState<RegisterState[]>(DEFAULT_REGISTERS);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string>('ALL');
  const [isConnected, setIsConnected] = useState(false);
  const [lastPolledAt, setLastPolledAt] = useState<number>(0);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const triggerAction = (label: string, actionFn?: (tid?: string) => void, tid?: string, cmdType?: string) => {
    try {
      if (actionFn) actionFn(tid);
      const resolvedApi = apiBase || getApiBaseUrl();
      if (cmdType) {
        fetch(`${resolvedApi}/api/register/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-pos-client': 'pim-admin' },
          body: JSON.stringify({ terminalId: tid || 'ALL', command: cmdType })
        }).catch(() => {});
      }
      setActionNotice(`⚡ ${label} signal sent for ${tid || 'Terminal'}!`);
      setTimeout(() => setActionNotice(null), 3500);
    } catch {
      setActionNotice(`⚠️ Failed to trigger ${label}`);
      setTimeout(() => setActionNotice(null), 3500);
    }
  };

  useEffect(() => {
    const host = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
    const resolvedApi = apiBase || getApiBaseUrl();

    const wsUrl = (resolvedApi.startsWith('https://') 
      ? resolvedApi.replace('https://', 'wss://') 
      : (resolvedApi.startsWith('http://') ? resolvedApi.replace('http://', 'ws://') : `ws://${host}:3000`)) + '/ws';

    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let pollInterval: any = null;
    let isUnmounted = false;

    const parseAndSetFleetData = (data: any) => {
      if (!data) return;

      if (Array.isArray(data.registers) && data.registers.length > 0) {
        setRegisters(data.registers.map((r: any) => ({
          terminalId: r.terminalId,
          terminalName: r.terminalName || (r.terminalId === 'T1' ? 'Counter 1 (Sunmi D2 Mini)' : r.terminalId === 'T2' ? 'Counter 2 (Feitian F100 Mobile)' : r.terminalId === 'T4' ? 'Counter 4 (Desktop Web POS 2)' : 'Counter 3 (Desktop Web POS 1)'),
          cashierName: r.cashierName || 'Cashier',
          status: r.status || (r.items && r.items.length > 0 ? 'ACTIVE_CART' : 'IDLE'),
          items: Array.isArray(r.items) ? r.items : [],
          itemCount: Number(r.itemCount || (r.items || []).length),
          total: Number(r.total || 0),
          customer: r.customer || null,
          customerName: r.customerName || (r.customer ? r.customer.name : 'Walk-in'),
          activeCartId: r.activeCartId || '1',
          lastSeen: r.lastSeen,
          updatedAt: r.updatedAt,
          isOnline: Boolean(r.isOnline)
        })));
        return;
      }

      // Single register response fallback: merge into T1 slot
      const raw = data.payload || data.cart || data;
      const tid = raw.terminalId === 'SUNMI-D2-REG01' ? 'T1' : (raw.terminalId || 'T1');
      const items = Array.isArray(raw.items) ? raw.items : (Array.isArray(data.items) ? data.items : []);
      const total = Number(raw.total ?? data.total ?? 0);
      const customer = raw.customer || data.customer || null;
      const customerName = customer?.name || raw.customerName || data.customerName || 'Walk-in';

      // Dynamic Fleet Discovery: update existing or append newly discovered active terminal
      setRegisters((prev) => {
        const exists = prev.some((reg) => reg.terminalId === tid);
        if (exists) {
          return prev.map((reg) => {
            if (reg.terminalId === tid) {
              return {
                ...reg,
                items,
                itemCount: items.length,
                total,
                customer,
                customerName,
                status: items.length > 0 ? 'ACTIVE_CART' : 'IDLE',
                isOnline: true,
                updatedAt: raw.updatedAt || Date.now()
              };
            }
            return reg;
          });
        } else {
          const defaultName = tid.startsWith('M') ? `Floor Phone (${tid})` : `Counter ${tid}`;
          const newTerminal: RegisterState = {
            terminalId: tid,
            terminalName: raw.terminalName || defaultName,
            cashierName: raw.cashierName || `Staff (${tid})`,
            items,
            itemCount: items.length,
            total,
            customer,
            customerName,
            status: items.length > 0 ? 'ACTIVE_CART' : 'IDLE',
            isOnline: true,
            updatedAt: raw.updatedAt || Date.now()
          };
          return [...prev, newTerminal];
        }
      });
    };

    const fetchSnapshot = () => {
      fetch(`${resolvedApi}/api/register/cart/live?t=${Date.now()}`)
        .then((res) => {
          if (!res.ok) throw new Error('Not ok');
          return res.json();
        })
        .then((data) => {
          if (!isUnmounted && data) {
            parseAndSetFleetData(data);
            setLastPolledAt(Date.now());
          }
        })
        .catch(() => {
          if (resolvedApi !== DEFAULT_EDGE_API_URL) {
            fetch(`${DEFAULT_EDGE_API_URL}/api/register/cart/live?t=${Date.now()}`)
              .then(res => res.json())
              .then(data => {
                if (!isUnmounted && data) {
                  parseAndSetFleetData(data);
                  setLastPolledAt(Date.now());
                }
              })
              .catch(() => {});
          }
        });
    };

    // Immediate initial snapshot fetch
    fetchSnapshot();

    // 8s Polling loop (prevents cloud quota exhaustion while maintaining fleet presence)
    pollInterval = setInterval(fetchSnapshot, 8000);

    const connect = () => {
      if (isUnmounted) return;
      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setIsConnected(true);
        };

        ws.onclose = () => {
          setIsConnected(false);
          if (!isUnmounted) {
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {
          ws?.close();
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'CART_UPDATE' || data.type === 'CART_UPDATED') {
              parseAndSetFleetData(data);
              setLastPolledAt(Date.now());
            } else if (data.type === 'REGISTER_HEARTBEAT' || data.type === 'FLEET_REGISTRY_SYNC') {
              fetchSnapshot();
            }
          } catch (err) {
            console.error("Failed to parse spy payload", err);
          }
        };
      } catch {
        if (!isUnmounted) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      isUnmounted = true;
      clearTimeout(reconnectTimeout);
      clearInterval(pollInterval);
      ws?.close();
    };
  }, [apiBase]);

  const isLive = isConnected || (Date.now() - lastPolledAt < 8000);
  const statusLabel = isConnected ? 'LAN WS 0ms' : (Date.now() - lastPolledAt < 8000 ? 'EDGE CLOUD 2s' : 'STANDBY');

  const onlineCount = registers.filter(r => r.isOnline).length;
  const totalFleetRevenue = registers.reduce((sum, r) => sum + Number(r.total || 0), 0);

  const getTerminalIcon = (tid: string) => {
    if (tid === 'T1') return <Monitor className="w-5 h-5 text-blue-400" />;
    if (tid === 'T2') return <Smartphone className="w-5 h-5 text-amber-400" />;
    if (tid === 'T4') return <Laptop className="w-5 h-5 text-teal-400" />;
    if (tid.startsWith('M')) return <Smartphone className="w-5 h-5 text-emerald-400" />;
    return <Laptop className="w-5 h-5 text-purple-400" />;
  };

  const selectedRegister = selectedTerminalId !== 'ALL'
    ? (registers.find(r => r.terminalId === selectedTerminalId) || registers[0])
    : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 text-white overflow-hidden relative w-full max-w-6xl mx-auto">
      {/* Ambient Radial Glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between pb-6 border-b border-slate-800 gap-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner">
            <Monitor className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white tracking-tight">Register Spy Commander</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                MULTI-REGISTER FLEET
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
              <span>Active POS Fleet: <strong className="text-emerald-400 font-mono">{onlineCount} of {registers.length} Online</strong></span>
              <span>•</span>
              <span>Live Carts Total: <strong className="text-emerald-400 font-mono">BD {totalFleetRevenue.toFixed(3)}</strong></span>
            </p>
          </div>
        </div>

        {/* Fleet Connection Badge & Channel Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs font-semibold">
            <span className={`w-2.5 h-2.5 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
            <span className={isLive ? 'text-emerald-400 font-mono' : 'text-rose-400 font-mono'}>
              {statusLabel}
            </span>
          </div>

          <button
            onClick={() => {
              setLastPolledAt(Date.now());
              setActionNotice('⚡ Manual sync triggered');
              setTimeout(() => setActionNotice(null), 2000);
            }}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700 cursor-pointer"
            title="Refresh Fleet Status"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Action Notification Toast */}
      {actionNotice && (
        <div className="mt-4 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Terminal View Selector Tabs */}
      <div className="flex flex-wrap items-center gap-2 mt-6 pb-2 border-b border-slate-800 relative z-10">
        <button
          onClick={() => setSelectedTerminalId('ALL')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            selectedTerminalId === 'ALL'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
              : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>All Counters (Fleet Grid)</span>
          <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-900/60 font-mono">
            {registers.length}
          </span>
        </button>

        {registers.map((reg) => (
          <button
            key={reg.terminalId}
            onClick={() => setSelectedTerminalId(reg.terminalId)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              selectedTerminalId === reg.terminalId
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60'
            }`}
          >
            {getTerminalIcon(reg.terminalId)}
            <span>{reg.terminalId}: {reg.terminalName.split(' ')[0]} {reg.terminalName.split(' ')[1]}</span>
            <span className={`w-2 h-2 rounded-full ${reg.isOnline ? 'bg-emerald-400' : 'bg-rose-500'}`} />
            {reg.total > 0 && (
              <span className="font-mono text-emerald-400 text-[11px]">
                BD {Number(reg.total).toFixed(3)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* VIEW MODE 1: ALL REGISTERS (3-COLUMN FLEET OVERVIEW GRID) */}
      {selectedTerminalId === 'ALL' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6 relative z-10">
          {registers.map((reg) => {
            const hasItems = reg.items && reg.items.length > 0;
            const formattedTime = reg.updatedAt
              ? new Date(reg.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : 'No activity';

            return (
              <div 
                key={reg.terminalId}
                className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 shadow-inner flex flex-col justify-between hover:border-slate-700 transition"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                        {getTerminalIcon(reg.terminalId)}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-white">{reg.terminalName}</h3>
                        <p className="text-[11px] text-slate-400 font-mono">ID: {reg.terminalId} • {reg.cashierName}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono flex items-center gap-1 ${
                      reg.isOnline 
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${reg.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                      {reg.isOnline ? 'ONLINE' : 'STANDBY'}
                    </span>
                  </div>

                  {/* Customer Banner */}
                  <div className="mb-3 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs flex items-center justify-between">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-blue-400" />
                      <span>{reg.customerName || 'Walk-in'}</span>
                    </span>
                    {reg.customer?.balance !== undefined && (
                      <span className="font-mono text-amber-400 font-bold text-[11px]">
                        Debt: BD {Number(reg.customer.balance).toFixed(3)}
                      </span>
                    )}
                  </div>

                  {/* Cart Items List */}
                  <div className="space-y-1.5 min-h-[140px] max-h-48 overflow-y-auto pr-1">
                    {!hasItems ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center text-slate-500">
                        {String(reg.status || '').includes('PIM') ? (
                          <>
                            <Package className="w-8 h-8 stroke-[1.2] mb-1.5 text-amber-500 animate-pulse" />
                            <p className="text-xs font-semibold text-amber-400">PIM Inventory Active</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Stock intake & barcode scans running</p>
                          </>
                        ) : (
                          <>
                            <ShoppingCart className="w-8 h-8 stroke-[1.2] mb-1.5 text-slate-600" />
                            <p className="text-xs font-semibold text-slate-400">Cart is empty</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">Terminal standing by for items</p>
                          </>
                        )}
                      </div>
                    ) : (
                      reg.items.slice(0, 5).map((item, idx) => (
                        <div 
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-900/90 border border-slate-800/80 text-xs"
                        >
                          <div className="truncate max-w-[140px]">
                            <p className="font-bold text-white truncate">{item.name}</p>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Qty: {item.quantity ?? item.qty ?? 1} × BD {Number(item.price ?? item.sellingPrice ?? 0).toFixed(3)}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-emerald-400 text-xs">
                            BD {Number(item.total ?? ((item.price ?? item.sellingPrice ?? 0) * (item.quantity ?? item.qty ?? 1))).toFixed(3)}
                          </span>
                        </div>
                      ))
                    )}
                    {reg.items && reg.items.length > 5 && (
                      <p className="text-[10px] text-center text-slate-500 font-mono pt-1">
                        + {reg.items.length - 5} more items in cart...
                      </p>
                    )}
                  </div>
                </div>

                {/* Card Footer: Subtotal & Detail Button */}
                <div className="pt-3 border-t border-slate-800 mt-3 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Current Total</span>
                    <span className="font-mono font-black text-emerald-400 text-lg">
                      BD {Number(reg.total || 0).toFixed(3)}
                    </span>
                  </div>

                  <button
                    onClick={() => setSelectedTerminalId(reg.terminalId)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition border border-slate-700 cursor-pointer"
                  >
                    Open Console
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW MODE 2: SINGLE COUNTER DETAILED COMMAND CENTER */}
      {selectedTerminalId !== 'ALL' && selectedRegister && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 relative z-10 animate-in fade-in">
          
          {/* Left 2 Cols: Real-time Scanned Items */}
          <div className="lg:col-span-2 bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 shadow-inner flex flex-col justify-between min-h-[360px]">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <ShoppingCart className="w-4 h-4 text-blue-400" />
                  <span>
                    {selectedRegister.terminalName} Cart ({selectedRegister.items.length} {selectedRegister.items.length === 1 ? 'item' : 'items'})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                    selectedRegister.isOnline ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                  }`}>
                    {selectedRegister.isOnline ? '🟢 ACTIVE LINK' : '🔴 OFFLINE'}
                  </span>
                </div>
              </div>

              {!selectedRegister.items || selectedRegister.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
                  <ShoppingCart className="w-12 h-12 stroke-[1.2] mb-3 text-slate-600" />
                  <p className="font-semibold text-sm text-slate-400">Register cart is empty</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    Items scanned by the cashier will stream here live in real-time.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {selectedRegister.items.map((item: any, idx: number) => {
                    const qty = Number(item.quantity ?? item.qty ?? 1);
                    const price = Number(item.price ?? item.priceAtSale ?? item.sellingPrice ?? 0);
                    const lineTotal = Number(item.total || (price * qty));
                    return (
                      <div 
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-900/90 border border-slate-800/90 hover:border-slate-700 transition"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-300 font-mono text-xs font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <div>
                            <p className="font-bold text-sm text-white">{item.name || item.productName || 'Item'}</p>
                            <p className="text-xs text-slate-400 font-mono">
                              {item.is_weighed_item ? `${qty.toFixed(3)}kg` : `Qty: ${qty}`} × BD {price.toFixed(3)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-emerald-400 text-sm">
                            BD {lineTotal.toFixed(3)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Cart Bottom Summary */}
            <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-semibold">Active Cart Subtotal</span>
              <span className="text-2xl font-black font-mono text-emerald-400">
                BD {Number(selectedRegister.total || 0).toFixed(3)}
              </span>
            </div>
          </div>

          {/* Right 1 Col: Customer Details & Remote Controls */}
          <div className="space-y-4 flex flex-col justify-between">
            
            {/* Customer Tile */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 shadow-inner">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                <Users className="w-4 h-4 text-emerald-400" />
                <span>Customer Identification</span>
              </div>

              {selectedRegister.customer ? (
                <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-base">{selectedRegister.customer.name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                      {selectedRegister.customer.card_type === 'DUAL' ? 'DUAL WALLET' : (selectedRegister.customer.card_type || 'KHATA')}
                    </span>
                  </div>
                  {selectedRegister.customer.phone && (
                    <p className="text-xs text-slate-400 font-mono">📞 {selectedRegister.customer.phone}</p>
                  )}
                  <div className="pt-2 border-t border-emerald-900/50 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Current Khata Debt:</span>
                    <span className="font-mono font-bold text-amber-400">
                      BD {Number(selectedRegister.customer.balance || 0).toFixed(3)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                  <p className="text-sm font-semibold text-slate-400">{selectedRegister.customerName || 'Walk-in Shopper'}</p>
                  <p className="text-xs text-slate-500 mt-1">No NFC Card or Khata account linked to active cart.</p>
                </div>
              )}
            </div>

            {/* Hardware Controls Tile */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 shadow-inner space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                <span>Remote Terminal Controls</span>
              </div>

              {onDrawerKick && (
                <button
                  onClick={() => triggerAction('Cash Drawer Kick', onDrawerKick, selectedRegister.terminalId, 'DRAWER_KICK')}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition active:scale-95 cursor-pointer shadow-sm"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Kick Cash Drawer</span>
                </button>
              )}

              {onClearCart && (
                <button
                  onClick={() => triggerAction('Clear Cart', onClearCart, selectedRegister.terminalId, 'CLEAR_CART')}
                  disabled={!selectedRegister.items || selectedRegister.items.length === 0}
                  className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold border transition active:scale-95 cursor-pointer ${
                    selectedRegister.items && selectedRegister.items.length > 0
                      ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/40'
                      : 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-50'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Remote Clear Cart</span>
                </button>
              )}

              {onLockRegister && (
                <button
                  onClick={() => triggerAction('Lock Register', onLockRegister, selectedRegister.terminalId, 'LOCK_REGISTER')}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition active:scale-95 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                  <span>Lock Register Till</span>
                </button>
              )}
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
