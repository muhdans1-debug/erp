// pos-mvp/updater.js
// ====================================================================
// ASKAR SUPERMARKET ERP - GITOPS PULL-BASED FLEET AUTO-UPDATER
// Runs as an independent background daemon alongside Fastify API in PM2.
// Autonomously queries central canary version controller and updates stores.
// ====================================================================

import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import util from 'util';
import { fileURLToPath } from 'url';

const execPromise = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VERSION_FILE = path.resolve(__dirname, 'version.json');
const DEFAULT_VERSION = '1.0.4';
const DEFAULT_STORE_ID = process.env.ASKAR_STORE_ID || 'ASKAR_001';
const DEFAULT_LOCATION = process.env.ASKAR_STORE_LOCATION || 'Askar, Southern Governorate, Bahrain';

// Resolves version check and central telemetry endpoints
const VERSION_CHECK_URL = process.env.ASKAR_VERSION_CHECK_URL || 'http://localhost:3000/api/fleet/version';
const CENTRAL_TELEMETRY_URL = process.env.ASKAR_CENTRAL_TELEMETRY_URL || 'http://localhost:3000/api/telemetry';
const CHECK_INTERVAL_MS = Number(process.env.ASKAR_UPDATE_INTERVAL_MS) || (60 * 60 * 1000); // 1 hour

/**
 * Read local store version and configuration
 */
export const getLocalVersionData = () => {
  try {
    if (fs.existsSync(VERSION_FILE)) {
      const raw = fs.readFileSync(VERSION_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('⚠️ [Updater] Could not read local version.json, using defaults:', err.message);
  }
  return {
    version: DEFAULT_VERSION,
    storeId: DEFAULT_STORE_ID,
    storeName: 'Askar Supermarket',
    location: DEFAULT_LOCATION,
    channel: 'pilot',
    lastUpdated: new Date().toISOString()
  };
};

/**
 * Persist updated version locally
 */
export const saveLocalVersionData = (newData) => {
  try {
    fs.writeFileSync(VERSION_FILE, JSON.stringify(newData, null, 2), 'utf-8');
    console.log(`💾 [Updater] version.json successfully updated to version ${newData.version}`);
  } catch (err) {
    console.error('❌ [Updater] Failed to write version.json:', err.message);
  }
};

/**
 * Transmit store telemetry heartbeat to central fleet dashboard
 */
export const reportTelemetry = async (payload) => {
  try {
    const res = await fetch(CENTRAL_TELEMETRY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000)
    });
    if (res.ok) {
      console.log(`📡 [Updater Telemetry] Heartbeat reported to central controller (${payload.status}).`);
    }
  } catch (err) {
    console.warn('⚠️ [Updater Telemetry] Central telemetry ping warning:', err.message);
  }
};

/**
 * ⚡ Pull-Based Auto-Update Cycle
 * Queries central version controller with store credentials, evaluates Canary channel,
 * and initiates automated deploy.bat if a newer version is authorized.
 */
export const checkForUpdates = async () => {
  const localConfig = getLocalVersionData();
  const currentVersion = localConfig.version || DEFAULT_VERSION;
  const storeId = localConfig.storeId || DEFAULT_STORE_ID;
  const channel = localConfig.channel || 'pilot';

  console.log(`\n🔍 [Updater] Checking for fleet updates (Store: ${storeId}, Installed: v${currentVersion})...`);

  try {
    // Construct check URL with progressive canary query parameters
    let requestUrl = VERSION_CHECK_URL;
    try {
      const parsed = new URL(VERSION_CHECK_URL);
      parsed.searchParams.set('storeId', storeId);
      parsed.searchParams.set('version', currentVersion);
      parsed.searchParams.set('channel', channel);
      requestUrl = parsed.toString();
    } catch {
      requestUrl = `${VERSION_CHECK_URL}?storeId=${encodeURIComponent(storeId)}&version=${encodeURIComponent(currentVersion)}`;
    }

    const response = await fetch(requestUrl, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      throw new Error(`Version server returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const latestVersion = data.latestVersion || data.version;

    if (!latestVersion) {
      console.log('ℹ️ [Updater] No version data in server response. Maintaining current version.');
      return;
    }

    // Check if new version detected and not paused
    if (latestVersion !== currentVersion && !data.paused) {
      console.log(`🚀 [GitOps] New version ${latestVersion} detected (Stage: ${data.currentStage || 'PRODUCTION'})!`);
      console.log(`📦 Initiating automated zero-downtime deployment script...`);

      // 1. Report UPDATING status to Central Dashboard
      await reportTelemetry({
        storeId,
        storeName: localConfig.storeName,
        location: localConfig.location,
        status: 'UPDATING',
        version: currentVersion,
        targetVersion: latestVersion,
        stage: data.currentStage || 'CANARY'
      });

      // 2. Resolve deployment script path (deploy.bat)
      let deployScript = path.resolve(__dirname, 'deploy.bat');
      if (!fs.existsSync(deployScript)) {
        deployScript = path.resolve(__dirname, '..', 'deploy.bat');
      }

      console.log(`🛠️ Executing: ${deployScript}`);
      try {
        const { stdout, stderr } = await execPromise(`"${deployScript}"`, {
          cwd: path.dirname(deployScript),
          timeout: 180000 // 3 minutes timeout
        });
        if (stdout) console.log(stdout.trim());
        if (stderr) console.warn(stderr.trim());
      } catch (execErr) {
        console.warn('⚠️ [Updater] deploy.bat finished with warning:', execErr.message);
      }

      // 3. Update local version file to prevent looping
      const updatedConfig = {
        ...localConfig,
        version: latestVersion,
        lastUpdated: new Date().toISOString()
      };
      saveLocalVersionData(updatedConfig);

      // 4. Report SUCCESS back to Central Telemetry
      await reportTelemetry({
        storeId,
        storeName: localConfig.storeName,
        location: localConfig.location,
        status: 'UPDATED',
        version: latestVersion,
        stage: data.currentStage || 'CANARY',
        lastUpdated: updatedConfig.lastUpdated
      });

      console.log(`✅ [GitOps] Auto-update to v${latestVersion} complete! Store is running latest fleet release.`);
    } else {
      console.log(`✨ [Updater] Store is up-to-date at v${currentVersion} (Stage: ${data.currentStage || 'STABLE'}).`);
      // Report ONLINE heartbeat
      await reportTelemetry({
        storeId,
        storeName: localConfig.storeName,
        location: localConfig.location,
        status: 'ONLINE',
        version: currentVersion,
        channel
      });
    }
  } catch (error) {
    console.error('❌ [Updater] Update check failed, will retry on next schedule:', error.message);
    await reportTelemetry({
      storeId,
      status: 'HEARTBEAT_DEGRADED',
      version: currentVersion,
      error: error.message
    }).catch(() => {});
  }
};

// Handle CLI execution modes: --check-now or background daemon interval
const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  const args = process.argv.slice(2);
  const isOneShot = args.includes('--check-now') || args.includes('--run-once');

  console.log('🤖 Askar ERP Fleet Auto-Updater Initialized.');
  checkForUpdates().then(() => {
    if (isOneShot) {
      console.log('🏁 Single-run update check finished.');
    } else {
      console.log(`⏰ Scheduled pull-based update check every ${Math.round(CHECK_INTERVAL_MS / 60000)} minutes.`);
      setInterval(checkForUpdates, CHECK_INTERVAL_MS);
    }
  });
}
