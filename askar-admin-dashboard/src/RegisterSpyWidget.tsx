import { useEffect, useState } from 'react';

interface CartItem {
  id?: string;
  name: string;
  qty?: number;
  quantity?: number;
  price?: number;
  sellingPrice?: number;
}

interface RegisterSpyWidgetProps {
  apiBase?: string;
  onDrawerKick?: () => void;
  onClearCart?: () => void;
  onLockRegister?: () => void;
}

export default function RegisterSpyWidget({
  apiBase,
  onDrawerKick,
  onClearCart,
  onLockRegister
}: RegisterSpyWidgetProps = {}) {
  const [liveCart, setLiveCart] = useState<{ items: CartItem[]; total: number; customerName: string }>({
    items: [],
    total: 0,
    customerName: 'Walk-in'
  });
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Connect locally or across LAN since the bridge runs on Fastify :3000
    const host = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
    const wsUrl = `ws://${host}:3000/ws`;
    const resolvedApi = apiBase || `http://${host}:3000`;
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let isUnmounted = false;

    // Fetch live cart snapshot immediately via HTTP fallback
    fetch(`${resolvedApi}/api/register/cart/live`)
      .then((res) => res.json())
      .then((data) => {
        if (!isUnmounted && data && Array.isArray(data.items) && data.items.length > 0) {
          setLiveCart({
            items: data.items,
            total: Number(data.total || 0),
            customerName: data.customer?.name || data.customerName || 'Walk-in'
          });
        }
      })
      .catch(() => {});

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
            reconnectTimeout = setTimeout(connect, 2500);
          }
        };

        ws.onerror = () => {
          ws?.close();
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'CART_UPDATE') {
              setLiveCart({
                items: data.items || [],
                total: Number(data.total || 0),
                customerName: data.customerName || 'Walk-in'
              });
            } else if (data.type === 'CART_UPDATED') {
              const p = data.payload || {};
              setLiveCart({
                items: p.items || [],
                total: Number(p.total || 0),
                customerName: p.customer?.name || p.customerName || 'Walk-in'
              });
            }
          } catch (err) {
            console.error("Failed to parse spy payload", err);
          }
        };
      } catch {
        if (!isUnmounted) {
          reconnectTimeout = setTimeout(connect, 2500);
        }
      }
    };

    connect();

    return () => {
      isUnmounted = true;
      clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, []);

  return (
    <div className="bg-white rounded-lg shadow-md p-4 w-96 border-t-4 border-blue-500">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-lg text-gray-800">Live Register Spy</h3>
        <span className={`px-2 py-1 rounded text-xs font-bold ${isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {isConnected ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      <div className="text-sm text-gray-500 mb-2">Customer: <strong className="text-gray-700">{liveCart.customerName}</strong></div>
      
      <div className="h-48 overflow-y-auto border border-gray-100 p-2 mb-4 bg-gray-50 rounded">
        {liveCart.items.length === 0 ? (
          <p className="text-center text-gray-400 mt-16 italic">Register is empty</p>
        ) : (
          liveCart.items.map((item: any, idx: number) => {
            const qty = item.qty ?? item.quantity ?? 1;
            const price = Number(item.price ?? item.sellingPrice ?? 0);
            return (
              <div key={idx} className="flex justify-between text-sm py-1 border-b border-gray-200 last:border-0">
                <span className="truncate w-32" title={item.name}>{item.name}</span>
                <span className="text-gray-600">x{qty}</span>
                <span className="font-bold text-gray-800">BHD {(price * qty).toFixed(3)}</span>
              </div>
            );
          })
        )}
      </div>

      <div className="flex justify-between items-center font-extrabold text-xl text-blue-900 border-t pt-2">
        <span>TOTAL:</span>
        <span>BHD {Number(liveCart.total || 0).toFixed(3)}</span>
      </div>

      {(onDrawerKick || onClearCart || onLockRegister) && (
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
          {onDrawerKick && (
            <button
              onClick={onDrawerKick}
              className="px-2.5 py-1 text-xs font-semibold rounded bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
            >
              Kick Drawer
            </button>
          )}
          {onClearCart && (
            <button
              onClick={onClearCart}
              className="px-2.5 py-1 text-xs font-semibold rounded bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

