import fs from 'fs';
import path from 'path';

const rootDir = 'c:/Users/ACER/Desktop/erp';

// 1. Folders to remove completely
const heavyFolders = [
  path.join(rootDir, 'pos-mvp/src-tauri'),
  path.join(rootDir, 'pos-mvp/release'),
  path.join(rootDir, 'askar-khata-api'),
  path.join(rootDir, 'askar-erp-build'),
  path.join(rootDir, 'askar-cloud-dr'),
  path.join(rootDir, 'pos-mvp/platform-tools'),
  path.join(rootDir, 'dist')
];

for (const dir of heavyFolders) {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log('✓ [DELETED FOLDER]', dir);
    } catch (e) {
      console.error('Failed to delete', dir, e.message);
    }
  }
}

// 2. Junk files in root and pos-mvp
const scanDirs = [rootDir, path.join(rootDir, 'pos-mvp')];
const isJunk = (filename) => {
  if (filename.endsWith('.png')) return true;
  if (filename.startsWith('.tmp.')) return true;
  if (['updated-sunmi.apk', 'updated-sunmi.apk.idsig', 'local_replica.db'].includes(filename) && filename === 'updated-sunmi.apk' && false) return false;
  return false;
};

for (const d of scanDirs) {
  try {
    const files = fs.readdirSync(d);
    for (const f of files) {
      const fullPath = path.join(d, f);
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        if (f.endsWith('.png') || f.startsWith('.tmp.') || f.startsWith('scratch_check') || f.startsWith('check_shifts') || f.startsWith('check_sales') || f.startsWith('check_cols')) {
          fs.unlinkSync(fullPath);
          console.log('✓ [DELETED FILE]', f);
        }
      }
    }
  } catch {}
}

// 3. Obsolete laptop server scripts in root and pos-mvp
const obsoleteScripts = [
  path.join(rootDir, 'START_SYSTEM.bat'),
  path.join(rootDir, 'SETUP_STORE_LAPTOP.bat'),
  path.join(rootDir, 'SETUP_PM2_BACKGROUND_SERVICE.bat'),
  path.join(rootDir, 'PREVENT_LAPTOP_SLEEP.bat'),
  path.join(rootDir, 'ENABLE_FIREWALL_FOR_TERMINALS.bat'),
  path.join(rootDir, 'SETUP_DIRECT_ETHERNET_BRIDGE.bat'),
  path.join(rootDir, 'UPDATE_AND_RESTART_SERVICES.bat'),
  path.join(rootDir, 'deploy.bat'),
  path.join(rootDir, 'FLEET_DEPLOY.bat'),
  path.join(rootDir, 'start-backoffice.bat'),
  path.join(rootDir, 'start-pos.cjs'),
  path.join(rootDir, 'test_insert_update.cjs'),
  path.join(rootDir, 'test_view.cjs'),
  path.join(rootDir, 'fix_trigger.cjs'),
  path.join(rootDir, 'local_replica.db'),
  path.join(rootDir, 'updated-sunmi.apk'), // Duplicate in root; canonical is in pos-mvp/
  path.join(rootDir, 'updated-sunmi.apk.idsig'),
  path.join(rootDir, 'pos-mvp/START_SYSTEM.bat'),
  path.join(rootDir, 'pos-mvp/SETUP_STORE_LAPTOP.bat'),
  path.join(rootDir, 'pos-mvp/SETUP_PM2_BACKGROUND_SERVICE.bat'),
  path.join(rootDir, 'pos-mvp/ENABLE_SYNC_FIREWALL.bat'),
  path.join(rootDir, 'pos-mvp/start-backoffice.bat'),
  path.join(rootDir, 'pos-mvp/start-pos.cjs'),
  path.join(rootDir, 'pos-mvp/local_replica.db')
];

for (const s of obsoleteScripts) {
  if (fs.existsSync(s)) {
    try {
      fs.unlinkSync(s);
      console.log('✓ [DELETED SCRIPT]', path.basename(s));
    } catch (e) {
      console.error('Failed to delete', s, e.message);
    }
  }
}

console.log('\n--- Workspace Cleanup Complete! ---');

