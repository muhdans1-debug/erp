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
    const { App } = await import('@capacitor/app');

    // 1. Tell Capgo the app booted successfully so it doesn't rollback
    await CapacitorUpdater.notifyAppReady();
    console.log('🛡️ [OTA Engine] Sunmi terminal marked READY & STABLE.');

    // 2. Listen for app resuming from background
    App.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        try {
          const update = await (CapacitorUpdater.download as any)({
            version: 'latest',
          });
          if (update) {
            console.log('🚀 [OTA Engine] New patch applied. Reloading POS interface...');
            await CapacitorUpdater.set(update);
          }
        } catch (_error) {
          console.log('ℹ️ [OTA Engine] App is up to date or offline.');
        }
      }
    });
  } catch (error) {
    console.warn('⚠️ [OTA Engine] Native updater initialization skipped:', error);
  }
};
