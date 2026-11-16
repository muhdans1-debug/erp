import { getApiBaseUrl, DEFAULT_EDGE_API_URL } from './apiConfig';
import { showToast, type FullReceiptProps } from './printer';

export interface NetworkPrinterConfig {
  enabled: boolean;
  targetTerminal: string; // 'T1' (Counter 1 Sunmi), 'SUNMI', etc.
  mode: 'SUNMI_NETWORK' | 'LOCAL_BROWSER';
  customServerUrl?: string;
}

const STORAGE_KEY = 'pos_network_printer_config';

/**
 * Check if the current client is executing directly on native Sunmi / Android hardware
 */
export const isNativeSunmiHardware = (): boolean => {
  if (typeof window === 'undefined') return false;
  const isCapacitorNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
  const hasSunmiJsBridge = Boolean((window as any).sunmi);
  return isCapacitorNative || hasSunmiJsBridge;
};

/**
 * Retrieve current network printer settings
 */
export const getNetworkPrinterConfig = (): NetworkPrinterConfig => {
  if (typeof window === 'undefined') {
    return { enabled: true, targetTerminal: 'T1', mode: 'SUNMI_NETWORK' };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: parsed.enabled !== undefined ? Boolean(parsed.enabled) : true,
        targetTerminal: (parsed.targetTerminal || 'T1').toUpperCase(),
        mode: parsed.mode || 'SUNMI_NETWORK',
        customServerUrl: parsed.customServerUrl || undefined
      };
    }
  } catch {}

  // Defaults:
  // - If running on Sunmi hardware: Direct native printing (mode = LOCAL_BROWSER / native)
  // - If running on Laptop / Desktop: Default to Sunmi Network Printer (mode = SUNMI_NETWORK)
  const isNative = isNativeSunmiHardware();
  return {
    enabled: true,
    targetTerminal: 'T1',
    mode: isNative ? 'LOCAL_BROWSER' : 'SUNMI_NETWORK'
  };
};

/**
 * Update and persist network printer configuration
 */
export const setNetworkPrinterConfig = (config: Partial<NetworkPrinterConfig>): NetworkPrinterConfig => {
  const current = getNetworkPrinterConfig();
  const updated: NetworkPrinterConfig = {
    ...current,
    ...config,
    targetTerminal: (config.targetTerminal || current.targetTerminal || 'T1').toUpperCase()
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('pos-printer-config-changed', { detail: updated }));
  }

  return updated;
};

/**
 * Dispatches a receipt payload across the network to the Sunmi printer via Central Server
 */
export const dispatchSunmiPrintJob = async (
  receiptProps: FullReceiptProps,
  overrideTerminal?: string
): Promise<{ success: boolean; method?: string; error?: string }> => {
  const cfg = getNetworkPrinterConfig();
  const targetTerminal = (overrideTerminal || cfg.targetTerminal || 'T1').toUpperCase();

  const printPayload = {
    jobId: `print_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    terminalId: targetTerminal,
    targetTerminal,
    type: 'PRINT_REQUEST',
    payload: {
      ...receiptProps,
      saleDate: receiptProps.saleDate ? new Date(receiptProps.saleDate).toISOString() : new Date().toISOString()
    },
    timestamp: Date.now()
  };

  let dispatched = false;
  let dispatchedMethod = '';

  // 1. Instant WebSocket Bus Dispatch (sub-10ms latency when connected to local server)
  try {
    const ws = (typeof window !== 'undefined' ? (window as any).__posWebSocket : null) as WebSocket | null;
    if (ws && ws.readyState === 1) { // 1 = WebSocket.OPEN
      ws.send(JSON.stringify({
        type: 'PRINT_REQUEST',
        jobId: printPayload.jobId,
        terminalId: targetTerminal,
        targetTerminal,
        payload: printPayload.payload,
        timestamp: Date.now()
      }));
      dispatched = true;
      dispatchedMethod = 'WEBSOCKET_BUS';
      console.log(`🖨️ [Network Printer] Dispatched print job via WebSocket Bus (Job: ${printPayload.jobId})`);
    }
  } catch (wsErr) {
    console.warn('Network printer WS dispatch notice:', wsErr);
  }

  // 2. HTTP POST to /api/print on Central Server & Edge Gateway (Guarantees delivery even if WS is inactive)
  const candidateBases = [
    cfg.customServerUrl,
    getApiBaseUrl(),
    DEFAULT_EDGE_API_URL
  ].filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i);

  for (const base of candidateBases) {
    try {
      const res = await fetch(`${base}/api/print`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pos-client': 'store-pos'
        },
        body: JSON.stringify({
          terminalId: targetTerminal,
          type: 'PRINT_REQUEST',
          jobId: printPayload.jobId,
          payload: printPayload.payload
        }),
        signal: AbortSignal.timeout(3500)
      });

      if (res.ok) {
        dispatched = true;
        dispatchedMethod = dispatchedMethod ? `${dispatchedMethod}+HTTP` : 'HTTP_CENTRAL_SERVER';
        console.log(`🖨️ [Network Printer] Enqueued print job at ${base}/api/print`);
        break; // First successful server is sufficient
      }
    } catch {
      // Try fallback /api/register/command endpoint
      try {
        const cmdRes = await fetch(`${base}/api/register/command`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-pos-client': 'store-pos'
          },
          body: JSON.stringify({
            terminalId: targetTerminal,
            command: 'PRINT_REQUEST',
            payload: printPayload.payload
          }),
          signal: AbortSignal.timeout(3000)
        });

        if (cmdRes.ok) {
          dispatched = true;
          dispatchedMethod = dispatchedMethod ? `${dispatchedMethod}+CMD` : 'HTTP_COMMAND_QUEUE';
          break;
        }
      } catch {}
    }
  }

  if (dispatched) {
    showToast(`🧾 Receipt sent to Sunmi Printer (${targetTerminal}) across network!`);
    return { success: true, method: dispatchedMethod };
  }

  return {
    success: false,
    error: `Unable to reach Central Server at ${candidateBases[0] || 'default'}. Check Wi-Fi and server IP.`
  };
};

/**
 * Triggers a 1-click test receipt on the remote Sunmi printer
 */
export const testSunmiNetworkPrint = async (targetTerminal?: string): Promise<boolean> => {
  const result = await dispatchSunmiPrintJob({
    shopName: 'ASKAR SUPERMARKET',
    shopAddress: 'Askar, Kingdom of Bahrain',
    shopPhone: 'Tel: +973 1700 0000',
    vatNumber: '200012345678901',
    invoiceNo: `TEST-${Math.floor(1000 + Math.random() * 9000)}`,
    items: [
      {
        name: 'Sunmi Network Printer Link Test',
        price: 0.100,
        qty: 1
      }
    ],
    subtotal: 0.091,
    vat: 0.009,
    total: 0.100,
    paymentMode: 'CASH',
    cashierName: 'Laptop Billing Station',
    customerName: 'Sunmi Network Link Verified',
    saleDate: new Date()
  }, targetTerminal);

  return result.success;
};
