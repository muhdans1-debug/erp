import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.retail.pos',
  appName: 'Askar POS',
  webDir: 'dist',
  loggingBehavior: 'none',
  server: {
    androidScheme: 'http',
    cleartext: true
  },
  android: {
    webContentsDebuggingEnabled: true
  }
};

export default config;
