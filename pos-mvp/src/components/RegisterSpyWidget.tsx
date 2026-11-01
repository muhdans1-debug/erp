import { useState } from 'react';
import { 
  Monitor, ShoppingCart, Users, Trash2, KeyRound, 
  Printer, CheckCircle2, Zap, Clock, ShieldCheck 
} from 'lucide-react';

interface RegisterSpyWidgetProps {
  liveCounterCart?: any;
  isBridgeConnected?: boolean;
  onDrawerKick?: () => void;
  onClearCart?: () => void;
  onLockRegister?: () => void;
  onTestPrint?: (slip: any) => void;
}

export default function RegisterSpyWidget({
  liveCounterCart,
  isBridgeConnected = true,
  onDrawerKick,
  onClearCart,
  onLockRegister,
  onTestPrint
}: RegisterSpyWidgetProps) {
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const triggerAction = (label: string, actionFn?: () => void) => {
    try {
      if (actionFn) actionFn();
      setActionNotice(`⚡ ${label} executed successfully!`);
      setTimeout(() => setActionNotice(null), 3000);
    } catch {
      setActionNotice(`⚠️ Failed to trigger ${label}`);
      setTimeout(() => setActionNotice(null), 3000);
    }
  };

  const hasItems = liveCounterCart && liveCounterCart.items && liveCounterCart.items.length > 0;
  const total = Number(liveCounterCart?.total || 0);
  const itemCount = Number(liveCounterCart?.itemCount || (liveCounterCart?.items || []).length);
  const customer = liveCounterCart?.customer;

  const formattedTime = liveCounterCart?.updatedAt 
    ? new Date(liveCounterCart.updatedAt).toLocaleTimeString() 
    : 'Waiting for cashier activity...';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 text-white overflow-hidden relative">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-6 border-b border-slate-800 gap-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner">
            <Monitor className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white tracking-tight">Counter 01 Register Spy</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                SUNMI-D2-REG01
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Last Cart Activity: <strong className="text-slate-300 font-mono">{formattedTime}</strong></span>
            </p>
          </div>
        </div>

        {/* Bridge Status & Remote Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs font-semibold">
            <span className={`w-2 h-2 rounded-full ${isBridgeConnected ? 'bg-emerald-400 animate-ping' : 'bg-rose-500'}`} />
            <span className={isBridgeConnected ? 'text-emerald-400' : 'text-rose-400'}>
              {isBridgeConnected ? 'RJ45 Bridge 0ms Live' : 'Bridge Standby'}
            </span>
          </div>

          <button
            onClick={() => triggerAction('Cash Drawer Kick', onDrawerKick)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition active:scale-95 cursor-pointer shadow-sm"
            title="Remote Kick Cash Drawer on Sunmi Terminal"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Kick Drawer</span>
          </button>

          <button
            onClick={() => triggerAction('Clear Cart', onClearCart)}
            disabled={!hasItems}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition active:scale-95 cursor-pointer ${
              hasItems 
                ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/40' 
                : 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-50'
            }`}
            title="Remote Clear Active Cart on Sunmi Register"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Remote Clear</span>
          </button>

          <button
            onClick={() => triggerAction('Lock Register', onLockRegister)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition active:scale-95 cursor-pointer"
            title="Remote Lock Counter Terminal"
          >
            <KeyRound className="w-3.5 h-3.5 text-slate-400" />
            <span>Lock Till</span>
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

      {/* Live Counter Display Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 relative z-10">
        
        {/* Left 2 Cols: Real-time Scanned Items */}
        <div className="lg:col-span-2 bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 shadow-inner flex flex-col justify-between min-h-[340px]">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                <ShoppingCart className="w-4 h-4 text-blue-400" />
                <span>Active Counter Cart ({itemCount} {itemCount === 1 ? 'item' : 'items'})</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                Cart ID: {liveCounterCart?.activeCartId || '1'}
              </span>
            </div>

            {!hasItems ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
                <ShoppingCart className="w-12 h-12 stroke-[1.2] mb-3 text-slate-600" />
                <p className="font-semibold text-sm text-slate-400">Cashier register cart is empty</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Items scanned on the Sunmi counter terminal will stream here instantly in real-time.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {liveCounterCart.items.map((item: any, idx: number) => (
                  <div 
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-900/90 border border-slate-800/90 hover:border-slate-700 transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-300 font-mono text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-bold text-sm text-white">{item.name}</p>
                        <p className="text-xs text-slate-400 font-mono">
                          {item.is_weighed_item ? `${Number(item.quantity).toFixed(3)}kg` : `Qty: ${item.quantity}`} × BD {Number(item.price).toFixed(3)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-emerald-400 text-sm">
                        BD {Number(item.total || (item.price * item.quantity)).toFixed(3)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart Bottom Summary */}
          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold">Active Cart Subtotal</span>
            <span className="text-2xl font-black font-mono text-emerald-400">
              BD {total.toFixed(3)}
            </span>
          </div>
        </div>

        {/* Right 1 Col: Customer & Quick Till Overview */}
        <div className="space-y-4 flex flex-col justify-between">
          
          {/* Active Shopper Tile */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 shadow-inner">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              <Users className="w-4 h-4 text-emerald-400" />
              <span>Customer Identification</span>
            </div>

            {customer ? (
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-base">{customer.name}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                    {customer.card_type === 'DUAL' ? 'DUAL WALLET' : (customer.card_type || 'KHATA')}
                  </span>
                </div>
                {customer.phone && (
                  <p className="text-xs text-slate-400 font-mono">📞 {customer.phone}</p>
                )}
                <div className="pt-2 border-t border-emerald-900/50 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Current Khata Debt:</span>
                  <span className="font-mono font-bold text-amber-400">
                    BD {Number(customer.balance || 0).toFixed(3)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                <p className="text-sm font-semibold text-slate-400">Walk-in Shopper</p>
                <p className="text-xs text-slate-500 mt-1">No NFC Card or Khata account linked to active cart.</p>
              </div>
            )}
          </div>

          {/* Till Health & Security Card */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 shadow-inner">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <span>Hardware Link Health</span>
            </div>
            
            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between text-slate-400">
                <span>Thermal AIDL Printer:</span>
                <span className="text-emerald-400 font-bold">READY (58mm)</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Customer Display:</span>
                <span className="text-emerald-400 font-bold">READY (4.3")</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Cash Drawer Solenoid:</span>
                <span className="text-amber-400 font-bold">RJ11 ARMED</span>
              </div>
            </div>

            <button
              onClick={() => {
                if (onTestPrint) {
                  triggerAction('Test Receipt Print', () => onTestPrint({
                    invoiceNo: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
                    items: [{ name: 'RJ45 Bridge Test Slip', sellingPrice: 0.100, quantity: 1 }],
                    subtotal: 0.100,
                    vat: 0.010,
                    total: 0.110,
                    paymentMethod: 'CASH',
                    cashierName: 'Manager Laptop',
                    createdAt: new Date().toISOString()
                  }));
                }
              }}
              className="mt-4 w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 border border-slate-700 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-blue-400" />
              <span>Print Hardware Test Slip</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}

