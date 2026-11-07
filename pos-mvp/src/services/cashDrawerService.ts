// pos-mvp/src/services/cashDrawerService.ts
import { showToast } from '../utils/printer';
import { Printer } from 'capacitor-sunmi-printer';

/**
 * Isolated Hardware RJ11 Cash Drawer Service
 * Decouples raw hardware electrical signals / solenoid kick pulses from React UI rendering.
 * Supports Sunmi Android JS Bridge, Capacitor Sunmi AIDL driver, and universal ESC/POS hex kick.
 */
export const openCashDrawer = async (saleTotal?: number): Promise<boolean> => {
  try {
    let triggered = false;

    // 1. Sunmi Native Android JS Bridge
    if (typeof window !== 'undefined' && (window as any).sunmi && typeof (window as any).sunmi.openCashBox === 'function') {
      (window as any).sunmi.openCashBox();
      triggered = true;
    }
    // 2. Capacitor Sunmi Printer plugin (for Sunmi Android Terminals)
    else if (typeof Printer !== 'undefined' && typeof Printer.openCashBox === 'function') {
      try {
        if (typeof Printer.initPrinter === 'function') {
          await Printer.initPrinter().catch(() => {});
        }
        await Printer.openCashBox();
        triggered = true;
      } catch (e) {
        console.warn('Capacitor Printer.openCashBox error:', e);
      }
    }

    // 3. Fallback ESC/POS kick command for standard receipt printers
    if (!triggered) {
      const escPosKick = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]);

      // Assuming a globally available write function for raw USB/BT/Serial
      if (typeof window !== 'undefined' && (window as any).printerPort) {
        await (window as any).printerPort.write(escPosKick);
      } else {
        console.log("Simulating Cash Drawer Kick in Browser:", escPosKick);
      }
    }

    // Use the non-blocking toast instead of alert()
    const message = (typeof saleTotal === 'number' && saleTotal > 0)
      ? `Cash Drawer Opened. Return BD ${saleTotal.toFixed(3)}`
      : 'Cash Drawer Opened';
    showToast(message);

    return true;
  } catch (error: any) {
    console.error('RJ11 Kick Failed:', error);
    showToast('Hardware Error: Check RJ11 connection');
    return false;
  }
};

// Retain alias for full backwards compatibility
export const kickCashDrawer = openCashDrawer;

