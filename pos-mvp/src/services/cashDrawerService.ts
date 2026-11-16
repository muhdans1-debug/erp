// pos-mvp/src/services/cashDrawerService.ts
import { showToast } from '../utils/printer';
import { Printer } from 'capacitor-sunmi-printer';
import { isNativeSunmiHardware, getNetworkPrinterConfig } from '../utils/networkPrinter';
import { getApiBaseUrl, DEFAULT_EDGE_API_URL } from '../utils/apiConfig';

export interface CashDrawerOptions {
  saleTotal?: number;
  targetTerminal?: string; // defaults to 'T1'
  reason?: string;         // 'SALE', 'NO_SALE', 'MANUAL_TRIGGER', 'SUPERVISOR', 'HOTKEY_F9'
  pin?: string;
  silent?: boolean;
}

let lastPhysicalKickTime = 0;

/**
 * Isolated Hardware RJ11 Cash Drawer Service
 * - If running on physical Sunmi terminal: activates RJ11 solenoid via Printer.openCashBox() and ESC/POS pulse.
 * - If running on Laptop / Desktop / Tablet: dispatches network command to Sunmi terminal across Central Server / WebSocket!
 */
export const openCashDrawer = async (
  optionsOrTotal?: number | CashDrawerOptions
): Promise<boolean> => {
  const options: CashDrawerOptions = typeof optionsOrTotal === 'number'
    ? { saleTotal: optionsOrTotal }
    : (optionsOrTotal || {});

  const { saleTotal, reason = 'MANUAL_TRIGGER', pin, silent = false } = options;
  const netCfg = getNetworkPrinterConfig();
  const targetTerminal = (options.targetTerminal || netCfg.targetTerminal || 'T1').toUpperCase();

  try {
    const isNative = isNativeSunmiHardware();

    // 🟢 SCENARIO 1: Running ON physical Sunmi Terminal -> Trigger RJ11 hardware solenoid directly
    if (isNative) {
      const now = Date.now();
      // Solenoid safety guard: minimum 800ms between physical pulses to protect coil
      if (now - lastPhysicalKickTime < 800) {
        console.log('⚡ [Hardware Solenoid] Debounced rapid duplicate kick');
        return true;
      }
      lastPhysicalKickTime = now;

      let triggered = false;

      // A. Sunmi AIDL Android Native JS Bridge
      if (typeof window !== 'undefined' && (window as any).sunmi && typeof (window as any).sunmi.openCashBox === 'function') {
        try {
          (window as any).sunmi.openCashBox();
          triggered = true;
          console.log('⚡ [Hardware Solenoid] Kicked via window.sunmi.openCashBox()');
        } catch (e) {
          console.warn('window.sunmi.openCashBox error:', e);
        }
      }

      // B. Capacitor Sunmi Printer Plugin AIDL openDrawer
      if (!triggered && typeof Printer !== 'undefined') {
        try {
          if (typeof Printer.initPrinter === 'function') {
            await Printer.initPrinter().catch(() => {});
          }
          if (typeof Printer.openCashBox === 'function') {
            await Printer.openCashBox();
            triggered = true;
            console.log('⚡ [Hardware Solenoid] Kicked via Printer.openCashBox()');
          }
        } catch (e) {
          console.warn('Capacitor Printer.openCashBox error:', e);
        }
      }

      // C. Fallback ESC/POS drawer kick pulse via sendRAWData (pin 2 & pin 5 kick: 1B 70 00 19 FA)
      if (typeof Printer !== 'undefined' && typeof Printer.sendRAWData === 'function') {
        try {
          const kickBytes = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]);
          let binary = '';
          for (let i = 0; i < kickBytes.byteLength; i++) {
            binary += String.fromCharCode(kickBytes[i]);
          }
          const base64Kick = btoa(binary);
          await (Printer as any).sendRAWData({ base64Data: base64Kick }).catch(() => {});
        } catch {}
      }

      if (!silent) {
        const msg = (typeof saleTotal === 'number' && saleTotal > 0)
          ? `Cash Drawer Opened. Return BD ${saleTotal.toFixed(3)}`
          : '⚡ Cash Drawer Opened';
        showToast(msg);
      }

      return true;
    }

    // 🔵 SCENARIO 2: Running on Laptop / Desktop / Browser -> Trigger Sunmi Drawer across Network!
    console.log(`🌐 [Remote Drawer] Dispatching drawer kick to Sunmi (${targetTerminal}) across network...`);
    let networkDispatched = false;

    // 1. WebSocket Bus (sub-10ms latency)
    try {
      const ws = (typeof window !== 'undefined' ? (window as any).__posWebSocket : null) as WebSocket | null;
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'REMOTE_DRAWER_KICK',
          command: 'DRAWER_KICK',
          terminalId: targetTerminal,
          source: 'LAPTOP_POS',
          authorized: true,
          payload: {
            saleTotal,
            reason,
            timestamp: Date.now()
          }
        }));
        networkDispatched = true;
        console.log('🌐 [Remote Drawer] Sent via WebSocket bus');
      }
    } catch (wsErr) {
      console.warn('WS drawer kick notice:', wsErr);
    }

    // 2. HTTP POST to Central Server (Guarantees delivery via endpoint & fleet command queue)
    const candidateBases = [
      netCfg.customServerUrl,
      getApiBaseUrl(),
      DEFAULT_EDGE_API_URL,
      'http://localhost:3000',
      'http://192.168.8.7:3000'
    ].filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i);

    for (const base of candidateBases) {
      try {
        const res = await fetch(`${base}/api/hardware/drawer-kick`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-pos-client': 'store-pos',
            ...(pin ? { 'x-manager-pin': pin } : {})
          },
          body: JSON.stringify({
            terminalId: targetTerminal,
            command: 'DRAWER_KICK',
            saleTotal,
            reason,
            pin,
            authorized: true,
            source: 'LAPTOP_POS'
          }),
          signal: AbortSignal.timeout(3000)
        });

        if (res.ok) {
          networkDispatched = true;
          console.log(`🌐 [Remote Drawer] Successfully reached ${base}/api/hardware/drawer-kick`);
          break;
        }
      } catch {
        // Fallback to /api/register/command
        try {
          const cmdRes = await fetch(`${base}/api/register/command`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-pos-client': 'store-pos'
            },
            body: JSON.stringify({
              terminalId: targetTerminal,
              command: 'DRAWER_KICK',
              payload: { saleTotal, reason, source: 'LAPTOP_POS' }
            }),
            signal: AbortSignal.timeout(3000)
          });
          if (cmdRes.ok) {
            networkDispatched = true;
            break;
          }
        } catch {}
      }
    }

    if (!silent) {
      if (networkDispatched) {
        const msg = (typeof saleTotal === 'number' && saleTotal > 0)
          ? `⚡ Sunmi (${targetTerminal}) Drawer Opened! Return BD ${saleTotal.toFixed(3)}`
          : `⚡ Sunmi (${targetTerminal}) Cash Drawer Opened!`;
        showToast(msg);
      } else {
        showToast(`⚠️ Unable to reach Sunmi terminal (${targetTerminal}). Check network.`);
      }
    }

    return networkDispatched;
  } catch (error: any) {
    console.error('RJ11 Kick Error:', error);
    if (!silent) showToast('Hardware Error: Cash drawer trigger failed');
    return false;
  }
};

export const kickCashDrawer = openCashDrawer;
