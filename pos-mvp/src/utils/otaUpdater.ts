import { Capacitor } from '@capacitor/core';

/**
 * Super Admin Over-The-Air (OTA) Silent Updater
 * Native Android hardware only (Sunmi D2 Mini).
 * Browser / PC environments skip native plugin loading completely.
 */
export const initOTA = async () => {
  if (!Capacitor.isNativePlatform()) {
    console.log('🌐 [OTA Engine] Running in PC browser environment — native OTA updater dormant.');
    return;
  }

  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');

    // 1. Tell Capgo the app booted successfully so it doesn't rollback
    try {
      await CapacitorUpdater.notifyAppReady();
      console.log('🛡️ [OTA Engine] Sunmi terminal marked READY & STABLE.');
    } catch {}
  } catch (error) {
    console.warn('⚠️ [OTA Engine] Native updater initialization skipped:', error);
  }
};
