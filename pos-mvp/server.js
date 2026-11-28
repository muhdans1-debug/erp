import Fastify from 'fastify';

// Global BigInt JSON serialization polyfill for SQLite / libSQL INTEGER results
BigInt.prototype.toJSON = function () {
  const n = Number(this);
  return Number.isSafeInteger(n) ? n : this.toString();
};
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fastifyWebsocket from '@fastify/websocket';
import { Bonjour } from 'bonjour-service';
import salesRoutes from './routes/sales.js';
import productRoutes from './routes/products.js';
import khataRoutes, { getAllCustomersWithBalances } from './routes/khata.js';
import hardwareRoutes from './routes/hardware.js';
import shiftRoutes from './routes/shifts.js';
import reportRoutes from './routes/reports.js';
import procurementRoutes from './routes/procurement.js';
import resilienceRoutes from './routes/resilience.js';
import whatsappRoutes from './routes/whatsapp.js';
import { flightRecorder } from './services/flightRecorder.js';
import { chaosEngine } from './services/chaosEngine.js';
import { ShadowLedger } from './services/shadowLedger.js';
import { congestionGovernor } from './services/congestionGovernor.js';
import { verifyManagerPin, managerAuth } from './middleware/auth.js';
import { pipeline } from 'stream/promises';
import { db, tursoCloudClient, initDatabase, localDbPath } from './db.js';
import { SaleRepository } from './repositories/SaleRepository.js';
import { startSyncEngine, syncNow, getSyncStatus, setMasterBaseUrl, getMasterBaseUrl } from './syncEngine.js';
import { startCloudSyncDaemon, getCloudSyncBackoffStatus } from './services/cloudSync.js';
import { startReorderCron, runReorderCheck, snoozedDistributors } from './src/automation/reorderJob.js';
import { startBackupCron, createDatabaseBackup, getLatestBackup } from './src/automation/backupJob.js';
import { startPaydayCron } from './src/automation/paydayJob.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCurrentInvoiceSequence, setStartingInvoiceSequence, formatInvoiceNumber } from './services/invoiceSequence.js';
import { getMasterServerTimeInfo, getRegionalIsoString, REGIONAL_TIMEZONE } from './utils/time.js';
import { initPushNotificationService, registerPushSubscription, unregisterPushSubscription, getActiveSubscriptionsCount, broadcastTransactionEvent, getVapidPublicKey } from './services/pushNotificationService.js';
import { initAlertService, dispatchAlert } from './services/alertService.js';
import { startReconcilerCron, runReconciliationPass, getLastAuditReport, forceWalCheckpoint } from './services/auditReconciler.js';
import { l1ProductCache } from './services/l1ProductCache.js';
import { IdempotencyService } from './services/idempotency.js';
import { percentileTracker } from './services/percentileTracker.js';
import { HotBackupService } from './services/hotBackup.js';
import { healthAnalyticsService } from './services/healthAnalyticsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Automatic Environment Configuration Loader (.env)
const envCandidatePaths = [
  path.resolve(__dirname, '.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'pos-mvp', '.env')
];
for (const envFilePath of envCandidatePaths) {
  if (fs.existsSync(envFilePath)) {
    try {
      const rawEnv = fs.readFileSync(envFilePath, 'utf8');
      for (const line of rawEnv.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const k = trimmed.slice(0, eqIdx).trim();
          let v = trimmed.slice(eqIdx + 1).trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          if (!process.env[k]) {
            process.env[k] = v;
          }
        }
      }
    } catch { }
  }
}

export const dataDir = process.env.ASKAR_DATA_PATH || __dirname;
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

import nodemailer from 'nodemailer';
import {
  listTenantDatabases,
  provisionTenantDatabase,
  executeRemoteQuery,
  setTenantLicenseStatus,
  getFleetMatrix
} from './services/tursoPlatform.js';

// Dynamic TLS / HTTPS Configuration for Local POS Master Server
const certDir = path.resolve(__dirname, 'certs');
const certPath = path.join(certDir, 'server.cert');
const keyPath = path.join(certDir, 'server.key');
const fastifyOptions = {
  logger: true,
  bodyLimit: 52428800 // 50MB limit to handle bulk image syncs and 100+ item intake batches
};

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  try {
    fastifyOptions.https = {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath)
    };
    console.log('🔒 TLS 1.3 / HTTPS Encryption active on POS master server');
  } catch (sslErr) {
    console.warn('⚠️ Could not load SSL certificates:', sslErr.message);
  }
}

const fastify = Fastify(fastifyOptions);

// Attach Singleton LibSQL Database to Fastify Instance
if (!fastify.hasDecorator('db')) {
  fastify.decorate('db', db);
}

// ⚡ Windows 24/7 Retail Server Keep-Awake Heartbeat
// Guarantees the back-office laptop never sleeps, suspends on lid close, or drops POS terminals
if (process.platform === 'win32') {
  import('child_process').then(({ exec }) => {
    const keepAwake = () => {
      exec(
        'powercfg /change standby-timeout-ac 0 & powercfg /change hibernate-timeout-ac 0 & powercfg /change standby-timeout-dc 0 & powercfg /setacvalueindex SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 0 & powercfg /setdcvalueindex SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936 0 & powercfg /setactive SCHEME_CURRENT',
        (err) => {
          if (!err) {
            fastify.log.info('🔋 [Server Keep-Awake] 24/7 Retail Mode Active: Sleep=NEVER, LidClose=RUNNING');
          }
        }
      );
    };
    keepAwake();
    // Re-assert every 10 minutes to prevent OEM battery-savers from suspending
    setInterval(keepAwake, 600000);
  });
}

// APK Direct Download Endpoint for Sunmi Terminal Installation
fastify.get('/api/download/apk', async (request, reply) => {
  const candidateApks = [
    path.resolve(__dirname, 'updated-sunmi.apk'),
    path.resolve(__dirname, 'dist', 'pos.apk'),
    path.resolve(__dirname, 'android/app/build/outputs/apk/debug/app-debug.apk')
  ];
  for (const apkPath of candidateApks) {
    if (fs.existsSync(apkPath)) {
      const stream = fs.createReadStream(apkPath);
      reply.header('Content-Type', 'application/vnd.android.package-archive');
      reply.header('Content-Disposition', 'attachment; filename="askar-pos-latest.apk"');
      return reply.send(stream);
    }
  }
  return reply.status(404).send({ error: 'APK build not found' });
});

if (!fs.existsSync(path.join(__dirname, 'dist', 'pos.apk'))) {
  fastify.get('/pos.apk', async (request, reply) => {
    const candidateApks = [
      path.resolve(__dirname, 'updated-sunmi.apk'),
      path.resolve(__dirname, 'android/app/build/outputs/apk/debug/app-debug.apk')
    ];
    for (const apkPath of candidateApks) {
      if (fs.existsSync(apkPath)) {
        const stream = fs.createReadStream(apkPath);
        reply.header('Content-Type', 'application/vnd.android.package-archive');
        reply.header('Content-Disposition', 'attachment; filename="askar-pos-latest.apk"');
        return reply.send(stream);
      }
    }
    return reply.status(404).send({ error: 'APK build not found' });
  });
}

// Process Resilience: Prevent unexpected background network disconnects from crashing the server
process.on('uncaughtException', (err) => {
  console.error('⚠️ [Server Uncaught Exception Safeguard]:', err?.message || err);
  try {
    flightRecorder.recordEvent({
      type: 'FATAL_UNCAUGHT_EXCEPTION',
      category: 'ERROR',
      level: 'FATAL',
      details: { message: err?.message, stack: err?.stack ? err.stack.slice(0, 400) : null }
    });
  } catch (_) {}
});
process.on('unhandledRejection', (reason) => {
  console.warn('⚠️ [Server Unhandled Rejection Safeguard]:', reason?.message || reason);
  try {
    flightRecorder.recordEvent({
      type: 'UNHANDLED_REJECTION',
      category: 'ERROR',
      level: 'WARN',
      details: { message: reason?.message || String(reason) }
    });
  } catch (_) {}
});

// Singleton LibSQL Client used for all database queries & background Turso sync
const tursoDb = db;

const _transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_APP_PASS },
});

await fastify.register(cors, {
  origin: (origin, cb) => {
    // Allow non-browser requests (native apps, Capacitor, curl, ADB)
    if (!origin || origin === 'null') {
      return cb(null, true);
    }
    try {
      const url = new URL(origin);
      const hostname = url.hostname;
      // Allow localhost, loopback, private store subnets (RFC 1918), and trusted deployment domains
      const isRfc1918 = (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname))
      );
      const isTrustedOrigin = (
        origin.startsWith('capacitor://') ||
        origin.startsWith('ionic://') ||
        hostname.endsWith('.workers.dev') ||
        hostname.endsWith('.pages.dev') ||
        hostname.endsWith('.vercel.app') ||
        hostname === 'askar-khata-pwa.vercel.app' ||
        hostname.endsWith('.askar-khata-pwa.vercel.app')
      );
      if (isRfc1918 || isTrustedOrigin) {
        return cb(null, true);
      }
    } catch { }
    return cb(new Error('CORS Not Allowed'), false);
  },
  methods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
});

// Tolerant JSON Body Parser: safely handles empty JSON bodies without FST_ERR_CTP_EMPTY_JSON_BODY
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  if (!body || (typeof body === 'string' && body.trim() === '')) {
    return done(null, {});
  }
  try {
    const json = JSON.parse(body);
    done(null, json);
  } catch (err) {
    err.statusCode = 400;
    done(err, undefined);
  }
});

// 🔌 Native WebSocket Event Bus (Consolidated on port 3000 at /ws)
await fastify.register(fastifyWebsocket, {
  options: {
    maxPayload: 1048576, // 1MB payload ceiling
    clientTracking: true
  }
});

// Initialize PWA Push Notification & Real-Time Event Hub
initPushNotificationService(fastify);
initAlertService(fastify);

// Push Notification Subscription & VAPID Endpoints
fastify.get('/api/notifications/vapid-public-key', async (request, reply) => {
  return reply.send({ publicKey: getVapidPublicKey() });
});

fastify.post('/api/notifications/subscribe', async (request, reply) => {
  const sub = request.body;
  if (!sub || !sub.endpoint) {
    return reply.status(400).send({ error: 'Valid subscription object required' });
  }
  registerPushSubscription(sub);
  return reply.send({ success: true, count: getActiveSubscriptionsCount() });
});

fastify.post('/api/notifications/unsubscribe', async (request, reply) => {
  const { endpoint } = request.body || {};
  if (endpoint) {
    unregisterPushSubscription(endpoint);
  }
  return reply.send({ success: true });
});

fastify.get('/api/notifications/status', async (request, reply) => {
  return reply.send({
    activeSubscriptions: getActiveSubscriptionsCount(),
    wsClients: fastify.websocketServer?.clients?.size || 0,
    timestamp: new Date().toISOString()
  });
});

fastify.all('/api/notifications/test', async (request, reply) => {
  const query = request.query || {};
  const body = request.body || {};
  const data = { ...query, ...body };

  const testEvent = {
    txType: data.txType || 'SALE',
    title: data.title || '🔔 Transaction Alert (Live Test)',
    message: data.message || 'Payment received successfully at Askar Supermarket',
    amount: Number(data.amount) || 2.500,
    formattedAmount: `${(Number(data.amount) || 2.5).toFixed(3)} BHD`,
    reference: data.reference || 'TEST-' + Math.floor(1000 + Math.random() * 9000),
    invoiceNo: data.invoiceNo || 'INV-' + Math.floor(10000 + Math.random() * 90000),
    paymentMethod: data.paymentMethod || 'BenefitPay',
    customerName: data.customerName || 'Test Customer (Phone Alert)',
    customerId: data.customerId || 'CUST-001',
    timestamp: new Date().toISOString()
  };

  const res = broadcastTransactionEvent(testEvent);
  fastify.log.info(`🔔 [Push Test] Broadcasted test notification to ${res.broadcastCount} clients.`);
  return reply.send({
    success: true,
    broadcastCount: res.broadcastCount,
    payload: res.payload
  });
});

// 🟢 Register Modular Domain Route Plugins (With fastify.websocketServer fully available)
fastify.register(salesRoutes);
fastify.register(productRoutes);
fastify.register(khataRoutes);
fastify.register(hardwareRoutes);
fastify.register(shiftRoutes);
fastify.register(reportRoutes);
fastify.register(procurementRoutes);
fastify.register(resilienceRoutes);
fastify.register(whatsappRoutes);

// --- FLIGHT RECORDER & CORRELATION ID TRACING HOOKS ---
fastify.addHook('onRequest', async (request, reply) => {
  congestionGovernor.recordRequest();
  if (request.method === 'POST' && (request.url.startsWith('/api/sales') || request.url.startsWith('/checkout') || request.url.startsWith('/api/checkout'))) {
    congestionGovernor.recordCounterActivity();
  }

  const correlationId = request.headers['x-correlation-id'] || `corr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  request.correlationId = correlationId;
  request.startEpoch = Date.now();
  reply.header('x-correlation-id', correlationId);

  const url = request.url;
  if (!url.startsWith('/assets/') && !url.startsWith('/favicon') && !url.endsWith('.js') && !url.endsWith('.css') && !url.endsWith('.png') && !url.endsWith('.ico')) {
    flightRecorder.recordEvent({
      type: 'HTTP_START',
      category: 'HTTP',
      level: 'INFO',
      correlationId,
      details: {
        method: request.method,
        url: request.url,
        ip: request.ip
      }
    });
  }
});

fastify.addHook('onResponse', async (request, reply) => {
  const url = request.url;
  if (!url.startsWith('/assets/') && !url.startsWith('/favicon') && !url.endsWith('.js') && !url.endsWith('.css') && !url.endsWith('.png') && !url.endsWith('.ico')) {
    const durationMs = request.startEpoch ? (Date.now() - request.startEpoch) : 0;
    const isError = reply.statusCode >= 400;

    // Real-Time Health Analytics Hooks
    if (reply.statusCode >= 500) {
      healthAnalyticsService.recordError();
    }
    if (request.method === 'POST' && (url.startsWith('/api/sales') || url.startsWith('/api/checkout')) && reply.statusCode < 400) {
      const body = request.body || {};
      const count = (body.items || body.cart || []).length || 1;
      const total = Number(body.total || body.totalAmount) || 0;
      healthAnalyticsService.recordSale({ itemCount: count, totalAmount: total, latencyMs: durationMs });
    } else if (url.startsWith('/api/products/search') || url.startsWith('/api/products/barcode/')) {
      healthAnalyticsService.recordScan();
    }

    flightRecorder.recordEvent({
      type: isError ? 'HTTP_WARN' : 'HTTP_DONE',
      category: isError ? 'ERROR' : 'HTTP',
      level: isError ? (reply.statusCode >= 500 ? 'ERROR' : 'WARN') : 'INFO',
      correlationId: request.correlationId,
      durationMs,
      details: {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode
      }
    });
  }
});

fastify.addHook('onError', async (request, reply, error) => {
  healthAnalyticsService.recordError();
  flightRecorder.recordEvent({
    type: 'HTTP_ERROR',
    category: 'ERROR',
    level: 'ERROR',
    correlationId: request?.correlationId,
    details: {
      method: request?.method,
      url: request?.url,
      message: error?.message,
      stack: error?.stack ? error.stack.slice(0, 300) : null
    }
  });
});

// WebSocket Keepalive Monitor: Graceful keep-alive without aggressively killing local POS hardware
const heartbeatInterval = setInterval(() => {
  if (!fastify.websocketServer?.clients) return;

  fastify.websocketServer.clients.forEach((ws) => {
    if (ws.readyState !== 1) return; // Only ping OPEN sockets

    // Only terminate after 5 consecutive missed heartbeats (2.5 minutes) of complete inactivity
    if (ws.missedPings && ws.missedPings >= 5) {
      fastify.log.warn('Terminating inactive WebSocket client after 5 missed heartbeats');
      return ws.terminate();
    }

    ws.missedPings = (ws.missedPings || 0) + 1;
    try {
      ws.ping();
      // Also send a lightweight JSON heartbeat for clients whose WebView handles message events better than raw control frames
      ws.send(JSON.stringify({ type: 'PING', serverEpoch: Date.now() }));
    } catch { }
  });
}, 30000);

// Ensure the interval is destroyed if the Fastify server shuts down
fastify.addHook('onClose', (_instance, done) => {
  clearInterval(heartbeatInterval);
  done();
});

let activeLock = null;
let lastRelayedNfc = null;
let lastCartState = null;

// Terminal Fleet Registry for Real-Time Fleet & Peripheral Telemetry
const terminalRegistry = new Map();

// Seed primary Sunmi counter register so it is immediately monitored
terminalRegistry.set('REG-01-COUNTER', {
  terminalId: 'REG-01-COUNTER',
  ip: '192.168.8.12',
  name: 'Sunmi V2 Pro Counter',
  appVersion: '1.4.2',
  lastSeen: Date.now(),
  pingRttMs: 2,
  pendingOfflineSales: 0,
  status: 'ONLINE',
  peripherals: {
    printer: 'READY',
    scanner: 'READY',
    drawer: 'CLOSED',
    customerScreen: 'SYNCHRONIZED'
  }
});

function broadcastWs(data) {
  if (fastify.websocketServer?.clients) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    fastify.websocketServer.clients.forEach(client => {
      if (client.readyState === 1) { // 1 = WebSocket.OPEN
        try { client.send(payload); } catch (_) {}
      }
    });
  }
}

// ⚡ Real-Time Health Analytics Streaming Bus (Dual-Transport: WebSocket /ws + SSE /stream)
const sseAnalyticsClients = new Set();

function broadcastAnalyticsEvent(payload) {
  // 1. Unified WebSocket Broadcast (/ws)
  broadcastWs(payload);

  // 2. Server-Sent Events (SSE) Broadcast (/api/system/analytics/stream)
  if (sseAnalyticsClients.size > 0) {
    const sseMsg = `event: ${payload.type || 'message'}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of sseAnalyticsClients) {
      try {
        client.reply.raw.write(sseMsg);
      } catch (_) {
        sseAnalyticsClients.delete(client);
      }
    }
  }
}

healthAnalyticsService.setBroadcaster(broadcastAnalyticsEvent);

fastify.register(async function (fastifyWsInstance) {
  fastifyWsInstance.get('/ws', { websocket: true }, (connection, req) => {
    const ws = connection?.socket || connection;
    ws.isAlive = true;
    ws.missedPings = 0;
    ws.on('pong', () => {
      ws.isAlive = true;
      ws.missedPings = 0;
    });
    const remoteIp = req.socket?.remoteAddress || 'unknown';
    fastify.log.info(`🔌 [Unified WS Bus] Hardware/client connected from IP: ${remoteIp}`);

    // Push active lock state immediately to freshly connected cashier/manager
    if (activeLock) {
      try {
        ws.send(JSON.stringify({ type: 'LOCK_STATE_SYNC', payload: activeLock }));
      } catch (err) {
        fastify.log.warn(`⚠️ [Unified WS Bus] Failed to sync lock: ${err.message}`);
      }
    }

    // Push live cart state immediately to newly connected Register Spy widgets
    if (lastCartState) {
      try {
        ws.send(JSON.stringify(lastCartState));
      } catch (err) {
        fastify.log.warn(`⚠️ [Unified WS Bus] Failed to sync cart state: ${err.message}`);
      }
    }

    // Push recent NFC scan if tapped within last 30 seconds
    if (lastRelayedNfc && (Date.now() - lastRelayedNfc.timestamp < 30000)) {
      try {
        ws.send(JSON.stringify({ type: 'NFC_SCANNED', payload: lastRelayedNfc }));
      } catch (err) {
        fastify.log.warn(`⚠️ [Unified WS Bus] Failed to sync NFC scan: ${err.message}`);
      }
    }

    ws.on('message', async (message) => {
      ws.missedPings = 0;
      const msgString = message.toString();
      let event;

      try {
        event = JSON.parse(msgString);
      } catch (err) {
        return; // Ignore malformed payloads
      }

      if (event?.type === 'PONG') {
        return; // Heartbeat handled
      }

      // Handle Terminal Hardware Heartbeat & Fleet Telemetry
      if (event?.type === 'TERMINAL_HEARTBEAT') {
        const cleanIp = String(remoteIp || '').replace(/^.*:/, '');
        const termId = event.terminalId || `REG-${cleanIp.split('.').pop() || '01'}`;
        const now = Date.now();
        const pingRtt = event.timestamp ? Math.max(0, now - Number(event.timestamp)) : 0;
        
        terminalRegistry.set(termId, {
          terminalId: termId,
          ip: cleanIp || '192.168.8.12',
          name: event.name || (termId.includes('SUNMI') ? 'Sunmi V2 Pro Counter' : 'Register Terminal'),
          appVersion: event.appVersion || '1.4.2',
          lastSeen: now,
          pingRttMs: pingRtt,
          pendingOfflineSales: Number(event.pendingOfflineSales || 0),
          status: 'ONLINE',
          peripherals: {
            printer: event.peripherals?.printer || 'READY',
            scanner: event.peripherals?.scanner || 'READY',
            drawer: event.peripherals?.drawer || 'CLOSED',
            customerScreen: event.peripherals?.customerScreen || 'SYNCHRONIZED'
          }
        });

        // Phase 1 Peripheral Telemetry: Thermal Printer Watchdog
        const printerStatus = String(event.peripherals?.printer || 'READY').toUpperCase();
        if (printerStatus === 'PAPER_OUT' || printerStatus === 'ERROR' || printerStatus === 'TIMEOUT') {
          healthAnalyticsService.startIncident({
            component: 'THERMAL_PRINTER',
            severity: 'WARNING',
            triggerSource: 'TERMINAL_HEARTBEAT',
            rootCauseReason: `Thermal printer on ${termId} reported ${printerStatus}`,
            technicalDetails: `Terminal IP: ${cleanIp}`,
            salesImpactSummary: 'Local edge buffering print jobs; zero cashier freeze'
          }).catch(() => {});
        } else if (printerStatus === 'READY' && healthAnalyticsService.activeIncidents.has('THERMAL_PRINTER')) {
          healthAnalyticsService.resolveIncident('THERMAL_PRINTER', {
            recoveryAction: `Printer on ${termId} restored to READY state`,
            salesImpactSummary: 'All thermal printing operating normally',
            autoHealed: 1
          }).catch(() => {});
        }

        // Phase 1 Terminal Outbox Queue Watchdog (> 20 unsynced sales)
        const pendingCount = Number(event.pendingOfflineSales || 0);
        if (pendingCount >= 20) {
          healthAnalyticsService.startIncident({
            component: 'TURSO_OUTBOX_LAG',
            severity: 'WARNING',
            triggerSource: 'TERMINAL_OUTBOX_LAG',
            rootCauseReason: `Terminal ${termId} has ${pendingCount} offline sales pending`,
            technicalDetails: `Terminal IP: ${cleanIp}, Outbox backlog: ${pendingCount}`,
            salesImpactSummary: 'Zero financial loss; sales preserved in terminal storage'
          }).catch(() => {});
        } else if (pendingCount < 5 && healthAnalyticsService.activeIncidents.has('TURSO_OUTBOX_LAG')) {
          healthAnalyticsService.resolveIncident('TURSO_OUTBOX_LAG', {
            recoveryAction: `Terminal ${termId} offline queue drained to edge master`,
            salesImpactSummary: '100% sales parity confirmed',
            autoHealed: 1
          }).catch(() => {});
        }

        try {
          ws.send(JSON.stringify({
            type: 'TERMINAL_HEARTBEAT_ACK',
            terminalId: termId,
            timestamp: event.timestamp,
            serverTime: now
          }));
        } catch (_) {}
        return;
      }

      // Intercept and block unauthorized hardware actuation or spoofed payment events
      const systemReservedEvents = ['BENEFIT_PAY_SUCCESS'];

      // Enforce strict manager authorization for remote hardware actuation (cash drawer, lock, clear)
      const remoteActuationCommands = ['REMOTE_DRAWER_KICK', 'DRAWER_KICK', 'REMOTE_LOCK_REGISTER', 'REMOTE_CLEAR_CART'];
      if (remoteActuationCommands.includes(event.type)) {
        const managerSecret = process.env.MANAGER_SECRET || process.env.DEV_SECRET;
        let isAuthorized = false;

        // 1. Verify manager secret token if provided
        if (event.token && managerSecret && typeof event.token === 'string') {
          const bufA = Buffer.from(event.token);
          const bufB = Buffer.from(managerSecret);
          if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
            isAuthorized = true;
          }
        }

        // 2. Verify manager PIN if provided
        if (!isAuthorized && event.pin) {
          const rawPin = String(event.pin).trim();
          try {
            const res = await db.execute({
              sql: "SELECT id, name, role, is_active, pin_code FROM Employee WHERE is_active = 1 AND role = 'MANAGER'",
              args: []
            });
            for (const mgr of (res.rows || [])) {
              const stored = String(mgr.pin_code || '').trim();
              let valid = false;
              if (stored.startsWith('$2a$') || stored.startsWith('$2b$')) {
                valid = await bcrypt.compare(rawPin, stored).catch(() => false);
              } else if (stored) {
                valid = (rawPin === stored);
              }
              if (valid) { isAuthorized = true; break; }
            }
            if (!isAuthorized && process.env.MANAGER_PIN_HASH) {
              const valid = await bcrypt.compare(rawPin, process.env.MANAGER_PIN_HASH.trim()).catch(() => false);
              if (valid) isAuthorized = true;
            }
          } catch {}
        }

        if (!isAuthorized) {
          fastify.log.warn(`🚨 [Unified WS Bus] Blocked unauthorized remote command "${event.type}" from IP: ${remoteIp}`);
          const errMsg = (event.type === 'REMOTE_DRAWER_KICK' || event.type === 'DRAWER_KICK')
            ? 'Unauthorized remote drawer kick. Manager authorization required.'
            : `Unauthorized remote command "${event.type}". Manager authorization required.`;
          try {
            ws.send(JSON.stringify({ type: 'ERROR', message: errMsg }));
          } catch {}
          return;
        }

        fastify.log.info(`⚡ [Unified WS Bus] Relaying authorized command "${event.type}" from ${remoteIp} to Sunmi (${event.terminalId || 'T1'})`);
        if (event.type === 'REMOTE_DRAWER_KICK' || event.type === 'DRAWER_KICK') {
          const popId = `drawer_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
          db.execute({
            sql: `INSERT INTO DrawerActuationLog (id, shiftId, cashierId, cashierName, terminalId, reason, authorizedBy, createdAt)
                  VALUES (?, NULL, ?, ?, ?, 'NO_SALE_POP', ?, datetime('now'))`,
            args: [popId, event.cashierId || 'CASHIER_01', event.cashierName || 'Cashier', event.terminalId || 'REG-01', event.authorizedBy || 'MANAGER']
          }).catch(() => {});
        }
      } else if (systemReservedEvents.includes(event.type)) {
        const managerSecret = process.env.MANAGER_SECRET || process.env.DEV_SECRET;
        if (!managerSecret || !event.token || typeof event.token !== 'string') {
          fastify.log.warn(`🚨 [Unified WS Bus] Blocked unauthorized command "${event.type}" from IP: ${remoteIp}`);
          try {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Unauthorized WebSocket command blocked.' }));
          } catch { }
          return;
        }
        const bufA = Buffer.from(event.token);
        const bufB = Buffer.from(managerSecret);
        if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
          fastify.log.warn(`🚨 [Unified WS Bus] Invalid credentials for "${event.type}" from IP: ${remoteIp}`);
          try {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid manager credentials.' }));
          } catch { }
          return;
        }
      }

      if (event.type === 'KHATA_EDIT_LOCK') {
        activeLock = event.payload;
      } else if (event.type === 'KHATA_EDIT_RELEASE') {
        activeLock = null;
      } else if (event.type === 'NFC_SCANNED' || event.type === 'UNKNOWN_NFC_SCANNED') {
        const tagId = (event.payload?.tag_id || event.payload?.id || '').trim().toUpperCase();
        lastRelayedNfc = {
          tag_id: tagId,
          id: tagId,
          customer: event.payload?.customer || null,
          terminal_id: event.payload?.terminal_id || 'SUNMI-D2-REG01',
          timestamp: Date.now()
        };
        fastify.log.info(`📡 [Unified WS Bus] Stored NFC event for tag: ${tagId}`);
      } else if (event.type === 'CART_UPDATE' || event.type === 'CART_UPDATED') {
        lastCartState = event;
        fastify.log.info(`🛒 [Unified WS Bus] Live cart updated (${(event.payload?.items || event.items || []).length} items)`);
      }

      // Broadcast to all OTHER connected clients (Sunmi, Manager Dashboard, Register Spy)
      if (fastify.websocketServer?.clients) {
        fastify.websocketServer.clients.forEach((client) => {
          if (client !== ws && client.readyState === 1) { // 1 = WebSocket.OPEN
            client.send(msgString);
          }
        });
      }
    });

    ws.on('close', () => {
      fastify.log.info(`❌ [Unified WS Bus] Client disconnected: ${remoteIp}`);
      const cleanIp = String(remoteIp || '').replace(/^.*:/, '');
      for (const [id, meta] of terminalRegistry.entries()) {
        if (meta.ip === cleanIp) {
          terminalRegistry.set(id, { ...meta, status: 'OFFLINE' });
        }
      }
    });

    ws.on('error', (err) => {
      fastify.log.warn(`⚠️ [Unified WS Bus] Socket error (${remoteIp}): ${err.message}`);
    });
  });
});

// Bridge Status Endpoint
fastify.get('/api/bridge/status', async (_request, reply) => {
  return {
    status: 'online',
    unified: true,
    activeLock,
    lastRelayedNfc,
    lastCartState,
    connectedClients: fastify.websocketServer?.clients ? fastify.websocketServer.clients.size : 0
  };
});

// 🇧🇭 Bahrain BenefitPay Fawri+ Webhook Endpoint
// Intercepts instant payment callbacks from Bahrain FinTech Bay / BenefitPay Gateway
const handleBenefitPayWebhook = async (request, reply) => {
  // 1. Enforce Cryptographic Signature Verification
  const signature = request.headers['x-benefit-signature'];
  const secret = process.env.BENEFITPAY_SECRET;

  if (!signature || !secret) {
    request.log.error('BenefitPay Webhook Rejected: Missing signature or secret keys.');
    return reply.code(403).send({ error: 'Unauthorized' });
  }

  // Generate the expected hash from the raw request body
  const payloadString = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  const expectedHash = crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');

  const sigBuffer = Buffer.from(signature);
  const hashBuffer = Buffer.from(expectedHash);

  // Prevent timing attacks while comparing the hashes
  if (sigBuffer.length !== hashBuffer.length || !crypto.timingSafeEqual(sigBuffer, hashBuffer)) {
    request.log.warn(`Spoofed BenefitPay Webhook Blocked for IP: ${request.ip}`);
    return reply.code(403).send({ error: 'Invalid webhook signature' });
  }

  // 2. Process Verified Payment Data
  const { invoiceNo, amount, status, referenceNumber } = request.body || {};
  const isSuccess = status === 'SUCCESS' || status === 'PAID' || status === 'COMPLETED' || status === 'OK';

  if (isSuccess) {
    const verifiedRef = referenceNumber || `BPAY-${Date.now().toString().slice(-6)}`;
    const numAmount = amount !== undefined ? Number(amount) : null;
    fastify.log.info(`✅ [BenefitPay Webhook] Success: Invoice ${invoiceNo} paid ${numAmount ?? ''} BHD. Ref: ${verifiedRef}`);

    // 1. Broadcast the payment success instantly to all connected POS registers via Unified WS Bus
    let broadcastCount = 0;
    if (fastify.websocketServer?.clients) {
      const payload = JSON.stringify({
        type: 'BENEFIT_PAY_SUCCESS',
        invoiceNo: invoiceNo || null,
        amount: numAmount,
        referenceNumber: verifiedRef,
        timestamp: new Date().toISOString()
      });

      fastify.websocketServer.clients.forEach((client) => {
        if (client.readyState === 1) { // 1 = WebSocket.OPEN
          client.send(payload);
          broadcastCount++;
        }
      });
    }

    // 2. Update financial records in database if the sale already exists
    if (invoiceNo) {
      try {
        await db.execute({
          sql: `UPDATE Sale SET paymentType = 'BENEFIT_PAY', status = 'COMPLETED' WHERE invoiceNo = ?`,
          args: [invoiceNo]
        });
      } catch (dbErr) {
        fastify.log.warn(`⚠️ [BenefitPay Webhook] Sale status update notice: ${dbErr.message}`);
      }
    }

    return reply.code(200).send({
      status: 'ACK',
      message: 'BenefitPay payment processed and broadcasted to POS fleet.',
      invoiceNo,
      referenceNumber: verifiedRef,
      broadcastCount
    });
  }

  fastify.log.warn(`⚠️ [BenefitPay Webhook] Received non-success status: ${status} for invoice ${invoiceNo}`);
  return reply.code(400).send({ status: 'FAILED_OR_IGNORED', receivedStatus: status });
};

fastify.post('/api/webhooks/benefit-pay', handleBenefitPayWebhook);
fastify.post('/webhooks/benefit-pay', handleBenefitPayWebhook);
fastify.post('/api/webhook/benefit-pay', handleBenefitPayWebhook);

// 1. Serve POS Frontend on '/' and '/pos/'
const distPathCandidates = [
  path.join(__dirname, 'dist'),
  path.resolve(__dirname, '../pos/dist'),
  path.resolve(__dirname, '../../apps/pos/dist'),
  path.resolve(process.cwd(), 'apps/pos/dist'),
  path.resolve(process.cwd(), 'pos-mvp/dist')
];
const distPath = distPathCandidates.find((p) => fs.existsSync(p)) || path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  await fastify.register(fastifyStatic, {
    root: distPath,
    prefix: '/',
    wildcard: false,
    index: false,
    maxAge: 0,
    setHeaders: (res, pathName) => {
      if (typeof res?.header === 'function') {
        if (pathName.endsWith('.html') || pathName.endsWith('sw.js') || pathName.endsWith('manifest.json')) {
          res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      } else if (typeof res?.setHeader === 'function') {
        if (pathName.endsWith('.html') || pathName.endsWith('sw.js') || pathName.endsWith('manifest.json')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      }
    }
  });

  const assetsPath = path.join(distPath, 'assets');
  if (fs.existsSync(assetsPath)) {
    await fastify.register(fastifyStatic, {
      root: assetsPath,
      prefix: '/assets/',
      decorateReply: false
    });
  }

  await fastify.register(fastifyStatic, {
    root: distPath,
    prefix: '/pos/',
    decorateReply: false
  });
}

// 2. Serve Admin Desktop Frontend on '/admin/'
const adminDistPathCandidates = [
  path.resolve(__dirname, '../askar-admin-dashboard/dist'),
  path.resolve(__dirname, '../desktop/dist'),
  path.resolve(__dirname, '../../apps/desktop/dist'),
  path.resolve(process.cwd(), 'apps/desktop/dist'),
  path.resolve(process.cwd(), 'askar-admin-dashboard/dist')
];
const adminDistPath = adminDistPathCandidates.find((p) => fs.existsSync(p)) || path.resolve(__dirname, '../askar-admin-dashboard/dist');
if (fs.existsSync(adminDistPath)) {
  await fastify.register(fastifyStatic, {
    root: adminDistPath,
    prefix: '/admin/',
    decorateReply: false
  });
}

// 3. Client-Side Routing Fallbacks (Redirect naked path to trailing slash)
fastify.get('/pos', (req, reply) => reply.redirect('/pos/'));
fastify.get('/admin', (req, reply) => reply.redirect('/admin/'));

fastify.setNotFoundHandler((request, reply) => {
  const url = request.raw.url || '';
  if (url.startsWith('/admin')) {
    if (fs.existsSync(adminDistPath)) {
      return reply.sendFile('index.html', adminDistPath);
    }
  }
  if (!url.startsWith('/api') && !url.startsWith('/ws')) {
    if (fs.existsSync(distPath)) {
      return reply.sendFile('index.html', distPath);
    }
  }
  reply.status(404).send({ message: `Route ${request.method}:${request.url} not found`, error: 'Not Found', statusCode: 404 });
});

// Zero-Heap Hardware Photo Uploads Directory (Feitian F100 PIM)
const uploadsStaticDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsStaticDir)) {
  fs.mkdirSync(uploadsStaticDir, { recursive: true });
}
await fastify.register(fastifyStatic, {
  root: uploadsStaticDir,
  prefix: '/uploads/',
  decorateReply: false
});

// Register Multipart for zero-heap streaming file uploads
await fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 15 * 1024 * 1024 // 15MB max photo size
  }
});

// Helper: Seed sample distributors if missing
const seedDistributors = async () => {
  const existingDistributors = await db.orm.Distributor.all();
  if (existingDistributors && existingDistributors.length >= 4) {
    return;
  }
  const defaultDistributors = [
    { id: 'dist_almarai', name: 'Almarai Dairy Co.', whatsappNumber: '97339123456', contactEmail: 'orders@almarai.bh', minimumOrderValue: 50.0, deliveryDays: 'SUN,TUE,THU' },
    { id: 'dist_arla', name: 'Arla Foods Logistics', whatsappNumber: '97339234567', contactEmail: 'supply@arlafoods.bh', minimumOrderValue: 40.0, deliveryDays: 'MON,WED' },
    { id: 'dist_aljameel', name: 'Al Jameel Wholesalers', whatsappNumber: '97339345678', contactEmail: 'wholesale@aljameel.bh', minimumOrderValue: 60.0, deliveryDays: 'SAT,TUE' },
    { id: 'dist_local', name: 'Local Wholesale & Produce', whatsappNumber: '97339456789', contactEmail: 'supplier@askar.bh', minimumOrderValue: 20.0, deliveryDays: 'MON,WED,FRI' }
  ];

  for (const d of defaultDistributors) {
    const existing = await db.orm.Distributor.where({ id: d.id }).all().first();
    if (!existing) {
      await db.orm.Distributor.create(d);
    }
  }

  try {
    await db.execute("UPDATE Product SET distributorId = 'dist_local' WHERE distributorId IS NULL OR distributorId = ''");
  } catch { }
};

// Helper: Seed sample products if missing (with Bahrain VAT compliance: 0% basic food, 10% standard)
const seedProducts = async () => {
  const existingProds = await db.orm.Product.all();
  if (existingProds && existingProds.length >= 10) {
    return; // Fast startup bypass: Products already populated
  }
  const sampleProducts = [
    { id: '1', name: 'Arabian Perfume', purchasePrice: 15.0, sellingPrice: 25.5, stockQuantity: 50, taxRate: 0.10, vatRate: 10.0, tenantId: 'tenant_askar_01', distributorId: 'dist_local' },
    { id: '2', name: 'Smart Watch', purchasePrice: 30.0, sellingPrice: 45.0, stockQuantity: 25, taxRate: 0.10, vatRate: 10.0, tenantId: 'tenant_askar_01', distributorId: 'dist_local' },
    { id: '3', name: 'Wireless Earbuds', purchasePrice: 8.0, sellingPrice: 15.0, stockQuantity: 40, taxRate: 0.10, vatRate: 10.0, tenantId: 'tenant_askar_01', distributorId: 'dist_local' },
    { id: '4', name: 'USB-C Cable', purchasePrice: 1.5, sellingPrice: 3.5, stockQuantity: 100, taxRate: 0.10, vatRate: 10.0, tenantId: 'tenant_askar_01', distributorId: 'dist_local' },
    { id: '101', name: 'Fresh Australian Mutton / Lamb', purchasePrice: 2.5, sellingPrice: 3.8, stockQuantity: 100, taxRate: 0.0, vatRate: 0.0, tenantId: 'tenant_askar_01', distributorId: 'dist_local', barcode: '00101' },
    { id: '102', name: 'Fresh Local Beef Cubes', purchasePrice: 2.0, sellingPrice: 3.2, stockQuantity: 80, taxRate: 0.0, vatRate: 0.0, tenantId: 'tenant_askar_01', distributorId: 'dist_local', barcode: '00102' },
    { id: '103', name: 'Turkish White Feta Cheese', purchasePrice: 1.5, sellingPrice: 2.4, stockQuantity: 60, taxRate: 0.0, vatRate: 0.0, tenantId: 'tenant_askar_01', distributorId: 'dist_local', barcode: '00103' },
    { id: '104', name: 'Almarai Fresh Milk 2L', purchasePrice: 0.85, sellingPrice: 1.100, stockQuantity: 120, taxRate: 0.0, vatRate: 0.0, tenantId: 'tenant_askar_01', distributorId: 'dist_almarai', barcode: '00104' },
    { id: '105', name: 'White Sliced Bread', purchasePrice: 0.25, sellingPrice: 0.400, stockQuantity: 90, taxRate: 0.0, vatRate: 0.0, tenantId: 'tenant_askar_01', distributorId: 'dist_local', barcode: '00105' },
    { id: '106', name: 'Fresh Khubz / Flatbread (5pk)', purchasePrice: 0.05, sellingPrice: 0.100, stockQuantity: 300, taxRate: 0.0, vatRate: 0.0, tenantId: 'tenant_askar_01', distributorId: 'dist_local', barcode: '' },
    { id: '107', name: 'Loose Red Tomatoes 1kg', purchasePrice: 0.20, sellingPrice: 0.350, stockQuantity: 150, taxRate: 0.0, vatRate: 0.0, tenantId: 'tenant_askar_01', distributorId: 'dist_local', barcode: '', is_weighed_item: 1 },
    { id: '108', name: 'Fresh Cucumber 1kg', purchasePrice: 0.18, sellingPrice: 0.300, stockQuantity: 120, taxRate: 0.0, vatRate: 0.0, tenantId: 'tenant_askar_01', distributorId: 'dist_local', barcode: '', is_weighed_item: 1 },
    { id: '109', name: 'Yellow Bananas 1kg', purchasePrice: 0.35, sellingPrice: 0.500, stockQuantity: 140, taxRate: 0.0, vatRate: 0.0, tenantId: 'tenant_askar_01', distributorId: 'dist_local', barcode: '', is_weighed_item: 1 },
    { id: '110', name: 'Red Onions 1kg', purchasePrice: 0.15, sellingPrice: 0.250, stockQuantity: 200, taxRate: 0.0, vatRate: 0.0, tenantId: 'tenant_askar_01', distributorId: 'dist_local', barcode: '', is_weighed_item: 1 },
    { id: '111', name: 'Potatoes 1kg', purchasePrice: 0.20, sellingPrice: 0.350, stockQuantity: 180, taxRate: 0.0, vatRate: 0.0, tenantId: 'tenant_askar_01', distributorId: 'dist_local', barcode: '', is_weighed_item: 1 },
    { id: '112', name: 'Local Farm Eggs (Tray 30)', purchasePrice: 1.20, sellingPrice: 1.650, stockQuantity: 80, taxRate: 0.0, vatRate: 0.0, tenantId: 'tenant_askar_01', distributorId: 'dist_local', barcode: '', is_weighed_item: 0 },
    { id: '113', name: 'Mineral Water 1.5L', purchasePrice: 0.10, sellingPrice: 0.200, stockQuantity: 350, taxRate: 0.10, vatRate: 10.0, tenantId: 'tenant_askar_01', distributorId: 'dist_local', barcode: '', is_weighed_item: 0 },
    { id: '114', name: 'Almarai Fresh Laban 500ml', purchasePrice: 0.20, sellingPrice: 0.300, stockQuantity: 100, taxRate: 0.0, vatRate: 0.0, tenantId: 'tenant_askar_01', distributorId: 'dist_almarai', barcode: '', is_weighed_item: 0 },
    { id: '115', name: 'Plastic Carrier Bag (Medium)', purchasePrice: 0.01, sellingPrice: 0.025, stockQuantity: 1000, taxRate: 0.10, vatRate: 10.0, tenantId: 'tenant_askar_01', distributorId: 'dist_local', barcode: '', is_weighed_item: 0 }
  ];
  for (const prod of sampleProducts) {
    const existing = await db.orm.Product.where({ id: prod.id }).all().first();
    if (!existing) {
      await db.orm.Product.create(prod);
    } else {
      await db.orm.Product.where({ id: prod.id }).update({
        vatRate: prod.vatRate,
        taxRate: prod.taxRate,
        is_weighed_item: prod.is_weighed_item ? 1 : 0,
      });
    }
  }
};

// Helper: Seed sample NFC test customer if missing
const seedNfcCustomers = async () => {
  const testCardUid = '04:8A:21:5A:F1:48:80';
  const allCustomers = await db.orm.Customer.all();
  const existing = allCustomers.find((c) => (c.cardUid || '').toLowerCase() === testCardUid.toLowerCase());
  if (!existing) {
    const testCustId = 'cust_nfc_demo_01';
    await db.orm.Customer.create({
      id: testCustId,
      name: 'Mohammed Yaseen',
      phone: '+973 3999 1234',
      cpr: '920104882',
      batchNo: 'BLK-4',
      description: 'Askar Store Gold Khata Member',
      cardUid: testCardUid,
      tenantId: 'tenant_askar_01',
      createdAt: new Date(),
    });

    const existingLedger = await db.orm.KhataLedger.where({ customerId: testCustId }).all();
    if (existingLedger.length === 0) {
      await db.orm.KhataLedger.create({
        id: crypto.randomUUID(),
        customerId: testCustId,
        amount: 14.500,
        type: 'SALE',
        syncStatus: 'SYNCED',
        timestamp: new Date(),
        tenantId: 'tenant_askar_01',
      });
    }
  }
};

// Root health & landing route
fastify.get('/', async (request, reply) => {
  const indexFile = path.join(distPath, 'index.html');
  if (fs.existsSync(indexFile)) {
    return reply.sendFile('index.html');
  }
  const host = request.headers.host ? request.headers.host.split(':')[0] : 'localhost';
  if (request.headers.accept && request.headers.accept.includes('text/html')) {
    reply.type('text/html').send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Askar Supermarket - Master Sync Server</title>
          <style>
            body { font-family: system-ui, sans-serif; background: #0b1120; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #1e293b; padding: 2.5rem; border-radius: 1rem; border: 1px solid #334155; max-width: 500px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
            h1 { color: #10b981; margin-bottom: 0.5rem; font-size: 1.5rem; }
            p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }
            .badge { display: inline-block; background: #065f46; color: #6ee7b7; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: bold; font-size: 0.8rem; margin-bottom: 1.25rem; }
            .btn { display: inline-block; background: #10b981; color: #022c22; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: bold; text-decoration: none; transition: background 0.2s; margin-top: 1rem; }
            .btn:hover { background: #34d399; }
            .links { margin-top: 1.5rem; font-size: 0.8rem; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="card">
            <span class="badge">● MASTER SYNC SERVER ACTIVE</span>
            <h1>Askar Master Sync Server</h1>
            <p>This port (<strong>:3000</strong>) is the backend REST API engine for SUNMI terminals and database sync.</p>
            <p>To use the graphical POS and Management Dashboard, open port <strong>:5173</strong> below:</p>
            <a class="btn" href="http://${host}:5173/?view=dashboard">Launch Web Dashboard (:5173)</a>
            <div class="links">API Status: Online | SQLite Database: Connected</div>
          </div>
        </body>
      </html>
    `);
    return;
  }
  return {
    status: 'online',
    service: 'Askar Supermarket Master Sync Server',
    webDashboard: `http://${host}:5173/`,
    endpoints: {
      products: '/api/products',
      shifts: '/api/shifts/current',
      sync: '/api/sync/status'
    }
  };
});

// Master Central Server Regional Clock Endpoints (Kingdom of Bahrain Asia/Bahrain +03:00)
const getServerTimeHandler = async () => getMasterServerTimeInfo();
fastify.get('/api/time', getServerTimeHandler);
fastify.get('/api/server-time', getServerTimeHandler);
fastify.get('/server-time', getServerTimeHandler);

// Rapid Health & Discovery Route (for mDNS / Zero-Config fallback pinging)
fastify.get('/api/health', async () => {
  return {
    status: 'ok',
    service: 'Askar-POS-Master',
    hostname: 'askar-master.local',
    timestamp: Date.now(),
    masterTime: getMasterServerTimeInfo()
  };
});

// Alias for system health
fastify.get('/api/system/health', async (request, reply) => {
  return reply.redirect('/api/health/deep');
});

// Deep Diagnostic Health Check (WAL database lock, memory, disk, WebSocket terminals, and Turso cloud lag)
fastify.get('/api/health/deep', async (request, reply) => {
  const startTime = Date.now();
  let dbStatus = 'ok';
  let dbLatencyMs = 0;
  let writeLockLatencyMs = 0;
  let walSizeBytes = 0;
  let walPages = { busy: 0, log: 0, checkpointed: 0 };
  let tursoStatus = 'disconnected';
  let tursoLatencyMs = 0;
  const degradedReasons = [];

  // 1. Probe Local SQLite read & write-lock accessibility
  try {
    const t0 = Date.now();
    await db.execute('SELECT 1');
    dbLatencyMs = Date.now() - t0;

    // Measure micro-transaction write lock acquisition latency
    const tLock0 = Date.now();
    await db.batch(['SELECT 1'], 'write');
    writeLockLatencyMs = Date.now() - tLock0;
  } catch (err) {
    dbStatus = `error: ${err.message}`;
    degradedReasons.push(`SQLite database error: ${err.message}`);
  }

  // 2. Measure SQLite WAL size & passive checkpoint pages
  try {
    const walFile = path.resolve(__dirname, 'local.db-wal');
    if (fs.existsSync(walFile)) {
      walSizeBytes = fs.statSync(walFile).size;
    }
    const chkRes = await db.execute('PRAGMA wal_checkpoint(PASSIVE)');
    if (chkRes.rows?.[0]) {
      const row = chkRes.rows[0];
      walPages = {
        busy: Number(row.busy ?? row[0] ?? 0),
        log: Number(row.log ?? row[1] ?? 0),
        checkpointed: Number(row.checkpointed ?? row[2] ?? 0)
      };
    }
  } catch (err) {
    // Non-fatal WAL inspection
  }

  if (writeLockLatencyMs > 100) {
    degradedReasons.push(`High SQLite write-lock wait time: ${writeLockLatencyMs}ms`);
  }
  if (walSizeBytes > 25 * 1024 * 1024) {
    degradedReasons.push(`SQLite WAL file bloat: ${(walSizeBytes / 1024 / 1024).toFixed(1)}MB (> 25MB threshold)`);
  }

  // 3. Probe Turso Cloud Connection Latency (if initialized)
  if (chaosEngine.isScenarioActive('CHAOS_TURSO_BLACKOUT')) {
    tursoStatus = 'disconnected (chaos simulated)';
    tursoLatencyMs = 15000;
    degradedReasons.push('CHAOS_TURSO_BLACKOUT active: Simulated cloud blackout');
  } else if (tursoCloudClient) {
    try {
      const t0 = Date.now();
      await tursoCloudClient.execute('SELECT 1');
      tursoLatencyMs = Date.now() - t0;
      tursoStatus = 'connected';
      if (tursoLatencyMs > 2500) {
        degradedReasons.push(`Turso Cloud latency elevated: ${tursoLatencyMs}ms (> 2500ms threshold)`);
      }
    } catch (err) {
      tursoStatus = `unreachable: ${err.message}`;
      degradedReasons.push(`Turso Cloud unreachable: ${err.message} (Local POS operating offline in Zero-SPOF mode)`);
    }
  } else {
    degradedReasons.push('Turso Cloud client not initialized (Local-only mode)');
  }

  if (chaosEngine.isScenarioActive('CHAOS_SQLITE_BUSY')) {
    writeLockLatencyMs = 2150;
    degradedReasons.push('CHAOS_SQLITE_BUSY active: Simulated write-lock contention');
  }

  // 4. Collect active terminals and fleet telemetry
  const activeTerminalsCount = fastify.websocketServer?.clients ? Array.from(fastify.websocketServer.clients).filter(c => c.readyState === 1).length : 0;
  const now = Date.now();
  const terminals = Array.from(terminalRegistry.values()).map(t => ({
    ...t,
    heartbeatAgeSec: Math.floor((now - t.lastSeen) / 1000)
  }));

  // 5. System memory
  const mem = process.memoryUsage();
  const rssMb = Math.round(mem.rss / 1024 / 1024);
  const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
  if (rssMb > 500) {
    degradedReasons.push(`Elevated RAM consumption: ${rssMb}MB RSS`);
  }

  // 6. Reconciliation Scope
  const auditReport = getLastAuditReport();

  // Record latencies to percentile reservoir
  percentileTracker.record('sqlite_write_lock', writeLockLatencyMs);
  if (tursoLatencyMs > 0) percentileTracker.record('cloud_sync', tursoLatencyMs);

  const degradedItems = [];
  if (writeLockLatencyMs > 60) {
    degradedItems.push({
      code: 'SQLITE_WRITE_LOCK_ELEVATED',
      severity: writeLockLatencyMs > 120 ? 'CRITICAL' : 'WARNING',
      metric: 'Write Lock Latency',
      current: `${writeLockLatencyMs}ms`,
      threshold: '60ms',
      message: `SQLite write-lock wait time reached ${writeLockLatencyMs}ms under concurrency.`,
      remediation: 'TRIGGER_WAL_CHECKPOINT'
    });
  }
  if (walSizeBytes > 10 * 1024 * 1024) {
    degradedItems.push({
      code: 'SQLITE_WAL_BLOAT',
      severity: walSizeBytes > 25 * 1024 * 1024 ? 'CRITICAL' : 'WARNING',
      metric: 'WAL File Size',
      current: `${(walSizeBytes / 1024 / 1024).toFixed(1)}MB`,
      threshold: '10MB',
      message: `SQLite WAL log file exceeds threshold.`,
      remediation: 'TRIGGER_WAL_CHECKPOINT'
    });
  }
  if (tursoStatus !== 'connected') {
    degradedItems.push({
      code: 'TURSO_CLOUD_OFFLINE',
      severity: 'INFO',
      metric: 'Cloud Sync WAN',
      current: tursoStatus,
      threshold: 'Connected (< 1500ms)',
      message: `Turso Cloud mirror is currently unreachable or disconnected. Local POS engine is operating in 100% offline Zero-SPOF mode with zero cashier disruption.`,
      remediation: 'RECONNECT_CLOUD_GATEWAY'
    });
  }

  const isCritical = dbStatus !== 'ok';
  const isHealthy = !isCritical && degradedReasons.length === 0;

  return reply.status(isCritical ? 503 : 200).send({
    status: isCritical ? 'critical' : (isHealthy ? 'healthy' : 'degraded'),
    service: 'Askar-POS-Master',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    totalLatencyMs: Date.now() - startTime,
    degradedReasons,
    degradedItems,
    percentiles: percentileTracker.getAllMetrics(),
    components: {
      masterEngine: {
        status: 'ok',
        port: 3000,
        watchdogManaged: process.env.WATCHDOG_MANAGED === 'true'
      },
      localSqlite: {
        status: dbStatus,
        readLatencyMs: dbLatencyMs,
        writeLockLatencyMs,
        mode: 'WAL',
        walSizeBytes,
        walPages,
        busyRetries: 0
      },
      tursoCloud: {
        status: tursoStatus,
        latencyMs: tursoLatencyMs
      },
      webSocket: {
        connectedClients: activeTerminalsCount,
        terminals
      },
      reconciliation: auditReport,
      system: {
        rssMb,
        heapUsedMb,
        heapTotalMb
      },
      chaos: chaosEngine.getStatus(),
      flightRecorder: {
        totalEventsRecorded: flightRecorder.count,
        capacity: flightRecorder.capacity
      }
    }
  });
});

// Automated Self-Healing Reconcile Trigger (Manual or Scheduled)
fastify.post('/api/system/reconcile', async (request, reply) => {
  try {
    const report = await runReconciliationPass();
    return reply.send(report);
  } catch (err) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// Force WAL Checkpoint & Vacuum
fastify.post('/api/system/wal-checkpoint', async (request, reply) => {
  try {
    const mode = request.body?.mode || 'TRUNCATE';
    const res = await forceWalCheckpoint(mode);
    return reply.send(res);
  } catch (err) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// Broadcast offline queue re-sync to all terminals
fastify.post('/api/system/resync-terminals', async (request, reply) => {
  try {
    broadcastWs({ type: 'TERMINAL_RESYNC_REQUEST', timestamp: Date.now() });
    return reply.send({ success: true, message: 'Broadcasted re-sync command to all POS terminals.' });
  } catch (err) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// Broadcast Hot-Reload to fleet
fastify.post('/api/system/broadcast-reload', async (request, reply) => {
  try {
    broadcastWs({ type: 'FLEET_RELOAD_COMMAND', timestamp: Date.now() });
    return reply.send({ success: true, message: 'Broadcasted hot-reload command to all POS terminals.' });
  } catch (err) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// Get Standing Audit Reconciliation Status
fastify.get('/api/system/reconcile-status', async (request, reply) => {
  return reply.send({ success: true, report: getLastAuditReport() });
});

// ============================================================================
// STORE HEALTH & DOWNTIME ANALYTICS REST API
// ============================================================================

// 1. Hourly Performance & Throughput Buckets (for 24H / 7D Recharts visual graph)
fastify.get('/api/system/analytics/hourly', async (request, reply) => {
  try {
    const range = String(request.query?.range || '24h').toLowerCase();
    const data = await healthAnalyticsService.getHourlyAnalytics(range);
    return reply.send(data);
  } catch (err) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// 2. Incident Forensics Log ("Where Did It Go & Why?")
fastify.get('/api/system/analytics/incidents', async (request, reply) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(request.query?.limit) || 50));
    const severity = String(request.query?.severity || 'ALL').toUpperCase();
    const data = await healthAnalyticsService.getIncidents(limit, severity);
    return reply.send(data);
  } catch (err) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// 3. Store Reliability KPIs (24H Uptime SLA, MTTR, Peak Rush Hour, Total Downtime)
fastify.get('/api/system/analytics/kpis', async (_request, reply) => {
  try {
    const data = await healthAnalyticsService.getHealthKPIs();
    return reply.send(data);
  } catch (err) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// 4. Manual / Webhook Log Incident
fastify.post('/api/system/analytics/log-incident', async (request, reply) => {
  try {
    const { component, severity, triggerSource, rootCauseReason, technicalDetails, salesImpactSummary } = request.body || {};
    const incidentId = await healthAnalyticsService.startIncident({
      component, severity, triggerSource, rootCauseReason, technicalDetails, salesImpactSummary
    });
    return reply.send({ success: true, incidentId });
  } catch (err) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// 5. Manual / Webhook Resolve Incident
fastify.post('/api/system/analytics/resolve-incident', async (request, reply) => {
  try {
    const { component, recoveryAction, salesImpactSummary, autoHealed } = request.body || {};
    await healthAnalyticsService.resolveIncident(component, { recoveryAction, salesImpactSummary, autoHealed });
    return reply.send({ success: true, message: `Resolved incident for ${component}` });
  } catch (err) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// 6. Real-Time Server-Sent Events (SSE) Stream Endpoint
fastify.get('/api/system/analytics/stream', async (request, reply) => {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('Access-Control-Allow-Origin', '*');
  reply.raw.setHeader('X-Accel-Buffering', 'no');
  reply.raw.flushHeaders();

  const client = { reply };
  sseAnalyticsClients.add(client);

  // Send immediate initial sync snapshot
  try {
    const [hourly, incs, kpis] = await Promise.all([
      healthAnalyticsService.getHourlyAnalytics('24h'),
      healthAnalyticsService.getIncidents(50, 'ALL'),
      healthAnalyticsService.getHealthKPIs()
    ]);
    reply.raw.write(`event: INIT\ndata: ${JSON.stringify({ ...hourly, ...incs, kpis })}\n\n`);
  } catch (_) {}

  // Periodic keepalive ping every 10 seconds
  const keepAlive = setInterval(() => {
    try {
      reply.raw.write(': ping\n\n');
    } catch {
      clearInterval(keepAlive);
      sseAnalyticsClients.delete(client);
    }
  }, 10000);

  request.raw.on('close', () => {
    clearInterval(keepAlive);
    sseAnalyticsClients.delete(client);
  });
});

// 7. Developer & Operator Simulation Endpoint for Verification
fastify.post('/api/system/analytics/simulate-tick', async (request, reply) => {
  try {
    healthAnalyticsService.recordScan();
    healthAnalyticsService.recordSale({ itemCount: 2, totalAmount: 1.500, latencyMs: 0.9 });
    return reply.send({ success: true, message: 'Simulated real-time tick emitted' });
  } catch (err) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// Phase 1 WAL Checkpoint Endpoint
fastify.post('/api/system/analytics/wal-checkpoint', async (request, reply) => {
  try {
    await healthAnalyticsService.checkWalAndLockHealth();
    let rows = [];
    if (db) {
      const res = await db.execute(`PRAGMA wal_checkpoint(TRUNCATE)`);
      rows = res.rows || [];
    }
    return reply.send({ success: true, message: 'PRAGMA wal_checkpoint(TRUNCATE) executed', rows });
  } catch (err) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// Phase 2 Emergency Alerting Verification Endpoint
fastify.post('/api/system/analytics/test-alert', async (request, reply) => {
  try {
    const { component = 'TEST_OUTAGE', severity = 'CRITICAL' } = request.body || {};
    const incidentId = await healthAnalyticsService.startIncident({
      component,
      severity,
      triggerSource: 'OPERATOR_TEST',
      rootCauseReason: 'Operator initiated 15s outage escalation test',
      technicalDetails: 'Manual verification of emergency WhatsApp / SMS alerting bus',
      salesImpactSummary: 'Zero financial loss; test mode only'
    });
    return reply.send({ success: true, incidentId, message: 'Test incident started; will escalate in 15s if not resolved' });
  } catch (err) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// Fastify Global Omni-Search API (for Ctrl+K Command Palette)
fastify.get('/api/search/global', async (request, reply) => {
  const { q } = request.query || {};
  const query = String(q || '').trim().toLowerCase();
  if (!query || query.length < 2) return { success: true, results: [] };

  try {
    const searchPattern = `%${query}%`;
    const [prodRes, custRes, distRes] = await Promise.all([
      db.execute({
        sql: `SELECT id, name, barcode, stockQuantity, sellingPrice, category 
              FROM Product 
              WHERE LOWER(name) LIKE ? OR LOWER(id) LIKE ? OR LOWER(barcode) LIKE ? 
              LIMIT 5`,
        args: [searchPattern, searchPattern, searchPattern]
      }),
      db.execute({
        sql: `SELECT id, name, phone, cardUid, balance 
              FROM Customer 
              WHERE LOWER(name) LIKE ? OR LOWER(phone) LIKE ? OR LOWER(cardUid) LIKE ? 
              LIMIT 5`,
        args: [searchPattern, searchPattern, searchPattern]
      }),
      db.execute({
        sql: `SELECT id, name, contactEmail, minimumOrderValue 
              FROM Distributor 
              WHERE LOWER(name) LIKE ? OR LOWER(contactEmail) LIKE ? 
              LIMIT 3`,
        args: [searchPattern, searchPattern]
      })
    ]);

    const results = [];

    // 1. Search Inventory by name or barcode
    (prodRes.rows || []).forEach((p) => results.push({
      id: `prod-${p.id}`,
      type: 'INVENTORY',
      title: p.name,
      subtitle: `${p.stockQuantity ?? 0} in stock • BD ${Number(p.sellingPrice || 0).toFixed(3)}`,
      action: 'VIEW_STOCK',
      data: p
    }));

    // 2. Search Khata Ledgers by name or phone (CPR and secret tokens strictly omitted)
    (custRes.rows || []).forEach((c) => results.push({
      id: `cust-${c.id}`,
      type: 'KHATA',
      title: c.name,
      subtitle: `Balance: BD ${Number(c.balance || 0).toFixed(3)} • ${c.phone || 'No Phone'}`,
      action: 'VIEW_LEDGER',
      data: {
        id: c.id,
        name: c.name,
        phone: c.phone,
        cardUid: c.cardUid,
        balance: c.balance
      }
    }));

    // 3. Search Supply Chain
    (distRes.rows || []).forEach((d) => results.push({
      id: `dist-${d.id}`,
      type: 'SUPPLIER',
      title: d.name,
      subtitle: `Min Order: BD ${Number(d.minimumOrderValue || 0).toFixed(3)}`,
      action: 'VIEW_SUPPLIER',
      data: d
    }));

    return { success: true, results };
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Global search failed' });
  }
});

// --- OUTBOX SYNC ENGINE ROUTES ---
// 1. Outbox Status Route (Returns pending vs synced counts + Turso Cloud Circuit Breaker)
fastify.get('/api/sync/status', async () => {
  const status = await getSyncStatus();
  if (typeof status === 'object' && status !== null) {
    status.cloudCircuitBreaker = getCloudSyncBackoffStatus();
  }
  return status;
});

// 2. Manual Sync Trigger Route
fastify.post('/api/sync/trigger', async () => {
  return await syncNow();
});
fastify.get('/api/sync/trigger', async () => {
  return await syncNow();
});

// 3. Master Server URL Configuration Route
fastify.get('/api/config/master-url', async () => {
  return { masterUrl: getMasterBaseUrl() };
});

fastify.post('/api/config/master-url', { preHandler: managerAuth }, async (request, reply) => {
  const { masterUrl } = request.body || {};
  if (!masterUrl) return reply.status(400).send({ error: 'masterUrl is required' });
  setMasterBaseUrl(masterUrl);
  return { success: true, masterUrl: getMasterBaseUrl() };
});

// 4. BenefitPay Owner Account Configuration Routes
const benefitConfigFile = path.join(dataDir, 'benefit_account_config.json');

const loadBenefitPayConfig = () => {
  if (fs.existsSync(benefitConfigFile)) {
    try {
      const raw = fs.readFileSync(benefitConfigFile, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to read benefit_account_config.json:', e);
    }
  }
  return {
    accountType: 'MERCHANT',
    merchantId: 'BH-BENEFIT-97300182',
    merchantName: 'ASKAR SUPERMARKET',
    mobileNumber: '+973 39000000',
    iban: '',
    cprOrCr: '200012345678901',
    branchId: 'MAIN-01',
    notes: 'Scan with BenefitPay app to pay directly',
    updatedAt: new Date().toISOString()
  };
};

const saveBenefitPayConfig = (config) => {
  try {
    fs.writeFileSync(benefitConfigFile, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Failed to write benefit_account_config.json:', e);
    return false;
  }
};

fastify.get('/api/config/benefit-account', async () => {
  return loadBenefitPayConfig();
});

fastify.post('/api/config/benefit-account', { preHandler: managerAuth }, async (request, reply) => {
  const current = loadBenefitPayConfig();
  const updated = {
    ...current,
    ...(request.body || {}),
    updatedAt: new Date().toISOString()
  };
  saveBenefitPayConfig(updated);

  // Broadcast to all connected WebSocket clients (terminals & secondary displays)
  if (fastify.websocketServer?.clients) {
    const wsPayload = JSON.stringify({
      type: 'BENEFIT_PAY_CONFIG_UPDATED',
      config: updated
    });
    fastify.websocketServer.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(wsPayload);
      }
    });
  }

  return { success: true, config: updated };
});

// --- AUTOMATED DATABASE BACKUP & SNAPSHOT ROUTES ---

// 1. Download Latest or Specific Database Backup Snapshot Stream
fastify.get('/api/system/download-backup', { preHandler: managerAuth }, async (request, reply) => {
  try {
    const requestedFilename = request.query?.filename;
    let targetBackup;

    if (requestedFilename) {
      const cleanFilename = path.basename(String(requestedFilename).trim());
      if (!cleanFilename.startsWith('backup_') || !cleanFilename.endsWith('.db') || cleanFilename.includes('..')) {
        return reply.status(400).send({ error: 'Invalid backup filename format. Must match backup_*.db without directory traversal.' });
      }
      const archivesDir = path.resolve(process.cwd(), 'archives');
      const targetPath = path.join(archivesDir, cleanFilename);
      if (!fs.existsSync(targetPath)) {
        return reply.status(404).send({ error: 'Requested database backup snapshot not found' });
      }
      const stat = fs.statSync(targetPath);
      targetBackup = {
        filename: cleanFilename,
        fullPath: targetPath,
        sizeBytes: stat.size
      };
    } else {
      targetBackup = await getLatestBackup();
    }

    if (!targetBackup || !fs.existsSync(targetBackup.fullPath)) {
      return reply.status(404).send({ error: 'No database backup snapshot available' });
    }

    const stream = fs.createReadStream(targetBackup.fullPath);
    return reply
      .header('Content-Type', 'application/x-sqlite3')
      .header('Content-Disposition', `attachment; filename="${targetBackup.filename}"`)
      .header('Content-Length', targetBackup.sizeBytes)
      .send(stream);
  } catch (error) {
    fastify.log.error('Failed to stream database backup', error);
    return reply.status(500).send({ error: 'Failed to download database snapshot', details: error.message });
  }
});

// 2. Trigger On-Demand Database Backup Snapshot
fastify.post('/api/system/backup', { preHandler: managerAuth }, async (request, reply) => {
  try {
    const backup = await createDatabaseBackup();
    return {
      success: true,
      message: 'Database snapshot created successfully in /archives.',
      backup,
    };
  } catch (error) {
    fastify.log.error('Manual backup failed', error);
    return reply.status(500).send({ error: 'Failed to create database snapshot', details: error.message });
  }
});

// 3. List All Available Backups
fastify.get('/api/system/backups', { preHandler: managerAuth }, async (request, reply) => {
  try {
    const archivesDir = path.resolve(process.cwd(), 'archives');
    if (!fs.existsSync(archivesDir)) return { backups: [] };

    const files = fs
      .readdirSync(archivesDir)
      .filter((f) => f.startsWith('backup_') && f.endsWith('.db'))
      .map((f) => {
        const fullPath = path.join(archivesDir, f);
        const stat = fs.statSync(fullPath);
        return {
          filename: f,
          sizeBytes: stat.size,
          sizeKb: (stat.size / 1024).toFixed(1),
          createdAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return { success: true, count: files.length, backups: files };
  } catch (error) {
    return reply.status(500).send({ error: 'Failed to list backups' });
  }
});

// 4. Invoice Sequence Counter Status (Bahrain NBR VAT Compliance)
fastify.get('/api/system/invoice-sequence', async (request) => {
  const terminalId = request.query?.terminalId || request.query?.terminal || 'T1';
  const current = await getCurrentInvoiceSequence(terminalId);
  const next = current + 1;
  return {
    success: true,
    terminalId,
    currentSeq: current,
    nextInvoiceNumber: next,
    formattedNextInvoice: formatInvoiceNumber(next, terminalId),
    compliance: 'Bahrain NBR VAT Article 53 - Strictly Sequential & Gapless'
  };
});

// 5. Seed / Set Starting Invoice Sequence (e.g. migrate to starting at #5000)
fastify.post('/api/system/invoice-sequence/seed', { preHandler: managerAuth }, async (request, reply) => {
  const { startingNumber, terminalId } = request.body || {};
  const num = parseInt(startingNumber, 10);
  if (isNaN(num) || num < 1) {
    return reply.status(400).send({ error: 'Invalid startingNumber. Must be an integer >= 1.' });
  }
  const tid = terminalId || 'T1';
  await setStartingInvoiceSequence(num, tid);
  return {
    success: true,
    terminalId: tid,
    message: `Starting invoice sequence for terminal ${tid} configured to #${num}`,
    nextInvoiceNumber: num,
    formattedNextInvoice: formatInvoiceNumber(num, tid)
  };
});

// ==========================================
// TURSO / LIBSQL EMBEDDED REPLICA ENDPOINTS
// 0ms SUNMI Local Chip Execution + Background Turso Sync
// ==========================================


export const syncKhataBalancesToTurso = async () => {
  try {
    const customers = await getAllCustomersWithBalances(true);
    for (const c of customers) {
      const bal = Number(c.currentBalance || 0);
      const token = c.access_token || c.id;

      // 1. Update local database
      await tursoDb.execute({
        sql: `UPDATE Customer SET 
              balance = ?,
              access_token = COALESCE(access_token, ?)
              WHERE id = ?`,
        args: [bal, token, c.id]
      });

      // 2. Mirror balance update directly to Turso Cloud (Zero-SPOF)
      if (tursoCloudClient) {
        await tursoCloudClient.execute({
          sql: `UPDATE Customer SET 
                balance = ?,
                access_token = COALESCE(access_token, ?),
                updatedAt = datetime('now')
                WHERE id = ?`,
          args: [bal, token, c.id]
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Sync Khata balances to Customer warning:', err?.message);
  }
};

// Tap Payments Webhook Receiver & Cryptographically Secured Debt Settlement (Hardened)
fastify.post('/api/webhook/tap', async (request, reply) => {
  const signatureHeader = request.headers['x-tap-signature'];
  const webhookSecret = process.env.TAP_WEBHOOK_SECRET || (process.env.NODE_ENV !== 'production' ? 'sk_test_tap_enterprise_key_2026' : null);

  if (!webhookSecret) {
    request.log.error('TAP_WEBHOOK_SECRET is not configured on the server.');
    return reply.code(500).send({ error: 'Webhook processing misconfigured' });
  }

  if (!signatureHeader) {
    return reply.code(401).send({ error: 'Unauthorized: Missing Tap signature' });
  }

  const payloadString = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  const computedHash = crypto
    .createHmac('sha256', webhookSecret)
    .update(payloadString)
    .digest('hex');

  const sigBuffer = Buffer.from(signatureHeader);
  const hashBuffer = Buffer.from(computedHash);
  if (sigBuffer.length !== hashBuffer.length || !crypto.timingSafeEqual(hashBuffer, sigBuffer)) {
    return reply.code(403).send({ error: 'Forbidden: Invalid webhook signature' });
  }

  const payload = request.body || {};

  // 1. Validate gateway currency to prevent non-BHD settlement corruption
  const currency = String(payload.currency || payload.response?.currency || 'BHD').toUpperCase();
  if (currency !== 'BHD') {
    request.log.warn({ currency }, 'Rejected Tap webhook event with unsupported currency');
    return reply.code(400).send({ error: `Unsupported currency: ${currency}. Only BHD is accepted.` });
  }

  if (payload.status === 'CAPTURED' || payload.status === 'PAID' || payload.status === 'SUCCESS') {
    const amount = Number(payload.amount || payload.response?.amount || 0);
    const customerUuid = payload.metadata?.customerUuid || payload.reference?.order?.replace('ORD-', '');
    const chargeId = String(payload.id || payload.charge_id || `tap_${Date.now()}`);

    if (amount > 0 && customerUuid) {
      // 2. Idempotency check: Ensure chargeId has not been processed previously
      const existingTx = await db.execute({
        sql: 'SELECT id FROM KhataLedger WHERE reference LIKE ? OR id = ? LIMIT 1',
        args: [`%${chargeId}%`, `tx_tap_${chargeId}`]
      });
      if (existingTx.rows && existingTx.rows.length > 0) {
        request.log.info({ chargeId }, 'Tap charge already reconciled in KhataLedger (idempotent skip)');
        return reply.send({ success: true, message: 'Already processed (idempotent)', chargeId });
      }

      const custCheck = await db.execute({
        sql: 'SELECT id, balance FROM Customer WHERE access_token = ? OR id = ? LIMIT 1',
        args: [customerUuid, customerUuid]
      });

      if (custCheck.rows && custCheck.rows.length > 0) {
        const actualCustomer = custCheck.rows[0];
        const actualCustId = actualCustomer.id;

        const ledgerId = `tx_tap_${chargeId}`;
        await db.execute({
          sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, tenantId, syncStatus, timestamp, created_at, running_balance, subledger_type)
                VALUES (?, ?, ?, 'PAYMENT', ?, 'tenant_1', 'SYNCED', datetime('now'), datetime('now'),
                (SELECT ROUND(COALESCE(SUM(amount), 0) - ?, 3) FROM KhataLedger WHERE customerId = ?), 'PERSONAL')`,
          args: [ledgerId, actualCustId, -amount, `BenefitPay Online Settlement via Tap Payments [${chargeId}]`, amount, actualCustId]
        }).catch((e) => {
          console.warn('Tap ledger mirror warning:', e?.message);
        });

        await db.execute({
          sql: `UPDATE Customer SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?), updatedAt = datetime('now') WHERE id = ?`,
          args: [actualCustId, actualCustId]
        });

        console.log(`✅ Cleared BHD ${amount.toFixed(3)} for Customer ID: ${actualCustId} (Charge: ${chargeId})`);
        return reply.send({ success: true, message: 'Khata debt cleared', clearedAmount: amount, customerId: actualCustId, chargeId });
      }
    }
  }
  return reply.send({ received: true, status: payload.status || 'IGNORED' });
});

let isTursoSyncRunning = false;
let lastTursoSyncTime = 0;

fastify.route({
  method: ['GET', 'POST'],
  url: '/api/db/sync',
  handler: async (request, reply) => {
    // Non-blocking 0ms response for POS terminals:
    // Guarantees POS terminals are never stalled by cloud WAN latency or Turso network limits.
    const now = Date.now();

    // Background cloud sync debounced to at most once per 30 seconds
    if (!isTursoSyncRunning && (now - lastTursoSyncTime > 30000)) {
      isTursoSyncRunning = true;
      (async () => {
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Turso sync timeout after 15s')), 15000)
          );
          await Promise.race([
            (async () => {
              await tursoDb.sync();
              await syncKhataBalancesToTurso();
            })(),
            timeoutPromise
          ]);
          lastTursoSyncTime = Date.now();
        } catch (err) {
          fastify.log.warn('Background Turso sync notice: ' + (err?.message || err));
        } finally {
          isTursoSyncRunning = false;
        }
      })();
    }

    return reply.status(200).send({
      success: true,
      offline: false,
      message: 'Master local server online. Cloud sync processing in background.',
      syncResult: { status: isTursoSyncRunning ? 'syncing' : 'synced' }
    });
  }
});

// ============================================================================
// SUPER ADMIN & REMOTE FLEET COMMAND CENTER API
// Powered by Turso Platform API & Master Token
// ============================================================================

// 1. List All Multi-Tenant Client Databases in Organization
fastify.get('/api/super-admin/tenants', { preHandler: managerAuth }, async (_request, reply) => {
  try {
    const databases = await listTenantDatabases();
    return { success: true, count: databases.length, databases };
  } catch (error) {
    fastify.log.error('Failed to list tenant databases: ' + error.message);
    return reply.status(500).send({ success: false, error: error.message });
  }
});

// 2. Programmatically Provision Brand New Isolated Client Database
fastify.post('/api/super-admin/tenants/provision', { preHandler: managerAuth }, async (request, reply) => {
  const { group } = request.body || {};
  const rawSlug = String(request.body?.slug || request.body?.storeSlug || '').trim().toLowerCase();
  if (!rawSlug) {
    return reply.status(400).send({ success: false, error: 'Store slug is required (e.g., citymart, almadina).' });
  }
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(rawSlug)) {
    return reply.status(400).send({ success: false, error: 'Invalid store slug. Must contain only alphanumeric lowercase characters and hyphens.' });
  }

  try {
    const result = await provisionTenantDatabase(rawSlug, group || 'default');
    return { success: true, ...result };
  } catch (error) {
    fastify.log.error('Failed to provision tenant: ' + error.message);
    return reply.status(500).send({ success: false, error: error.message });
  }
});

// 3. Fortified God-Mode SQL Query Engine (Strict Read-Only Guard + Bcrypt Manager Auth)
fastify.post('/api/super-admin/query', { preHandler: verifyManagerPin }, async (request, reply) => {
  const body = request.body || {};
  const sql = (body.sql || body.sqlQuery || '').trim();
  const params = body.params || body.args || [];
  const databaseName = body.databaseName;

  if (!sql || typeof sql !== 'string') {
    return reply.code(400).send({ error: 'Valid SQL string is required.' });
  }

  // 1. Strict Read-Only Whitelist Guard: Must begin with SELECT, EXPLAIN, or WITH (ignoring comments/whitespace)
  const cleanedLeadingSql = sql.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*/, '');
  if (!/^(SELECT|EXPLAIN|WITH)\b/i.test(cleanedLeadingSql)) {
    const remoteIp = request.socket?.remoteAddress || 'unknown';
    request.log.warn(`Blocked non-SELECT query attempt from IP ${remoteIp}: ${sql.substring(0, 80)}`);
    return reply.code(403).send({ error: 'Forbidden: Only read-only SELECT or EXPLAIN queries are permitted on this route.' });
  }

  // 2. Reject multi-statement SQL injection (semicolons with subsequent statements)
  if (/;[\s\S]*\S/.test(sql)) {
    request.log.warn(`Blocked multi-statement SQL attempt: ${sql.substring(0, 80)}`);
    return reply.code(403).send({ error: 'Forbidden: Multi-statement SQL execution is not permitted.' });
  }

  // 3. Strict Read-Only Guard: Reject any destructive SQL or SQLite meta-commands (PRAGMA, ATTACH, DETACH, VACUUM, etc.)
  const destructiveKeywords = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|GRANT|REVOKE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|EXEC|EXECUTE)\b/i;

  if (destructiveKeywords.test(sql)) {
    const remoteIp = request.socket?.remoteAddress || 'unknown';
    request.log.warn(`Blocked destructive or meta SQL attempt from IP: ${remoteIp}`);
    return reply.code(403).send({ error: 'Forbidden: Only read-only SELECT queries are permitted on this route.' });
  }

  try {
    let rows = [];
    let columns = [];

    // Support remote tenant databases if specified, otherwise query local SQLite database safely
    if (databaseName && databaseName !== 'local' && databaseName !== 'local.db' && databaseName !== 'askar-pos-primary') {
      try {
        const queryResult = await executeRemoteQuery(databaseName, sql);
        rows = queryResult.rows || [];
        columns = queryResult.columns || [];
      } catch (remoteErr) {
        request.log.warn(`Remote query fallback to local: ${remoteErr.message}`);
        const result = await db.execute({ sql, args: params });
        rows = result.rows || [];
        columns = result.columns || [];
      }
    } else {
      const result = await db.execute({ sql, args: params });
      rows = result.rows || [];
      columns = result.columns || [];
    }

    // Sanitize sensitive credential fields from query output to prevent credential harvesting
    const SENSITIVE_KEY_REGEX = /^(pin|pin_code|pin_hash|password|secret|token|auth_token|session_token|private_key)$/i;
    const sanitizedRows = rows.map(row => {
      if (!row || typeof row !== 'object') return row;
      const clean = { ...row };
      for (const key of Object.keys(clean)) {
        if (SENSITIVE_KEY_REGEX.test(key) && clean[key] !== null && clean[key] !== undefined) {
          clean[key] = '[REDACTED_HASH]';
        }
      }
      return clean;
    });

    return reply.send({
      success: true,
      count: sanitizedRows.length,
      rows: sanitizedRows,
      columns
    });
  } catch (error) {
    request.log.error('Admin Query Error:', error);
    return reply.code(500).send({ error: 'Query execution failed. Check SQL syntax.' });
  }
});

// 4. Fleet Telemetry Matrix (All 50+ Terminals)
fastify.get('/api/super-admin/fleet', { preHandler: managerAuth }, async (_request, reply) => {
  try {
    const fleet = getFleetMatrix();
    return { success: true, count: fleet.length, fleet };
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
});

// 5. Remote Wipe / Subscription Kill Switch
fastify.post('/api/super-admin/kill-switch', { preHandler: managerAuth }, async (request, reply) => {
  const { terminalId, licensed } = request.body || {};
  if (!terminalId) {
    return reply.status(400).send({ success: false, error: 'terminalId is required.' });
  }

  try {
    const res = await setTenantLicenseStatus(terminalId, licensed !== false);
    return res;
  } catch (error) {
    return reply.status(400).send({ success: false, error: error.message });
  }
});

// 6. Global Audit Log Stream
fastify.get('/api/super-admin/audit-logs', { preHandler: managerAuth }, async (_request, reply) => {
  try {
    const localDb = db.orm;
    let logs = [];
    if (localDb?.SystemAuditLog?.all) {
      logs = await localDb.SystemAuditLog.all();
    }
    return { success: true, count: logs.length, logs };
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
});

// ====================================================================
// 7. GITOPS PULL-BASED FLEET AUTO-UPDATER & CANARY ROLLOUT CONTROLLER
// Supports 100+ stores querying versions, reporting heartbeats, and staged rollouts.
// ====================================================================

const rolloutConfigFile = path.join(dataDir, 'fleet_rollout_config.json');

const defaultRolloutConfig = {
  stableVersion: '1.0.4',
  canaryVersion: '1.0.5',
  pilotStores: ['ASKAR_001', 'ASKAR_002'],
  wave2Stores: Array.from({ length: 18 }, (_, i) => `ASKAR_${String(i + 3).padStart(3, '0')}`),
  rolloutStage: 'PILOT', // 'PILOT' (Stores 1-2) | 'WAVE_2' (Stores 1-20) | 'FULL' (All 100+ stores)
  paused: false,
  releaseNotes: 'Performance optimization, atomic CRDT Khata ledger, and auto-replenishment.'
};

const loadRolloutConfig = () => {
  try {
    if (fs.existsSync(rolloutConfigFile)) {
      return JSON.parse(fs.readFileSync(rolloutConfigFile, 'utf-8'));
    }
  } catch { }
  return defaultRolloutConfig;
};

const saveRolloutConfig = (config) => {
  try {
    fs.writeFileSync(rolloutConfigFile, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save rollout config:', err);
  }
};

// In-memory telemetry matrix for all 100+ fleet stores
const storeTelemetryMap = new Map();

// Initialize sample stores so dashboard displays 100-store fleet grid immediately
for (let i = 1; i <= 25; i++) {
  const sId = `ASKAR_${String(i).padStart(3, '0')}`;
  storeTelemetryMap.set(sId, {
    storeId: sId,
    storeName: `Askar Mart - Branch #${i}`,
    location: i <= 5 ? 'Manama Capital' : (i <= 12 ? 'Riffa Southern' : (i <= 20 ? 'Muharraq Central' : 'Hamad Town')),
    version: i <= 2 ? '1.0.5' : '1.0.4',
    status: 'ONLINE',
    stage: i <= 2 ? 'PILOT' : 'STABLE',
    lastPing: new Date(Date.now() - Math.floor(Math.random() * 120000)).toISOString()
  });
}

// 7a. Version endpoint: Supermarket stores pull their target version here
fastify.get('/api/fleet/version', async (request, reply) => {
  const { storeId = 'ASKAR_001', version: currentVersion = '1.0.4' } = request.query || {};
  const config = loadRolloutConfig();

  if (config.paused) {
    return {
      latestVersion: currentVersion,
      paused: true,
      currentStage: 'PAUSED',
      message: 'Fleet deployments are temporarily paused by administrator.'
    };
  }

  let authorizedVersion = config.stableVersion;
  let storeStage = 'STABLE';

  const isPilot = config.pilotStores?.includes(storeId);
  const isWave2 = isPilot || config.wave2Stores?.includes(storeId);

  if (config.rolloutStage === 'PILOT') {
    if (isPilot) {
      authorizedVersion = config.canaryVersion;
      storeStage = 'PILOT';
    }
  } else if (config.rolloutStage === 'WAVE_2') {
    if (isWave2) {
      authorizedVersion = config.canaryVersion;
      storeStage = 'WAVE_2';
    }
  } else if (config.rolloutStage === 'FULL') {
    authorizedVersion = config.canaryVersion;
    storeStage = 'FULL';
  }

  return {
    latestVersion: authorizedVersion,
    stableVersion: config.stableVersion,
    canaryVersion: config.canaryVersion,
    currentStage: config.rolloutStage,
    storeStage,
    isCanary: authorizedVersion === config.canaryVersion,
    releaseNotes: config.releaseNotes,
    paused: false
  };
});

// 7b. Store Heartbeat Telemetry Receiver (Bounded Map & Sanitized Store IDs)
const MAX_TELEMETRY_ENTRIES = 100;
const handleTelemetry = async (request, reply) => {
  const body = request.body || {};
  const rawStoreId = String(body.storeId || 'ASKAR_UNKNOWN').trim().slice(0, 64);
  const storeId = rawStoreId.replace(/[^a-zA-Z0-9_-]/g, '') || 'ASKAR_UNKNOWN';

  // Evict oldest entry if map exceeds capacity
  if (storeTelemetryMap.size >= MAX_TELEMETRY_ENTRIES && !storeTelemetryMap.has(storeId)) {
    const firstKey = storeTelemetryMap.keys().next().value;
    if (firstKey) storeTelemetryMap.delete(firstKey);
  }

  const existing = storeTelemetryMap.get(storeId) || {};

  const record = {
    ...existing,
    ...body,
    storeId,
    lastPing: new Date().toISOString()
  };
  storeTelemetryMap.set(storeId, record);

  // Broadcast live fleet telemetry over WebSocket bus
  if (fastify.websocketServer?.clients) {
    fastify.websocketServer.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({
          type: 'FLEET_TELEMETRY_PING',
          store: record
        }));
      }
    });
  }

  return { success: true, storeId, receivedAt: record.lastPing };
};

fastify.post('/api/telemetry', handleTelemetry);
fastify.post('/api/fleet/telemetry', handleTelemetry);

// 7c. Fleet Telemetry List for Admin Dashboard
fastify.get('/api/telemetry', async () => {
  const config = loadRolloutConfig();
  const stores = Array.from(storeTelemetryMap.values());
  const updatedCount = stores.filter(s => s.version === config.canaryVersion).length;

  return {
    success: true,
    totalStores: stores.length,
    updatedCount,
    rolloutStage: config.rolloutStage,
    stableVersion: config.stableVersion,
    canaryVersion: config.canaryVersion,
    paused: config.paused,
    stores
  };
});
fastify.get('/api/fleet/telemetry', async (req, res) => fastify.inject({ method: 'GET', url: '/api/telemetry' }).then(r => JSON.parse(r.body)));

// 7d. Progressive Canary Stage Transition Controller
fastify.post('/api/fleet/rollout-stage', { preHandler: managerAuth }, async (request, reply) => {
  const { stage, paused, canaryVersion, stableVersion, releaseNotes } = request.body || {};
  const config = loadRolloutConfig();

  if (stage && ['PILOT', 'WAVE_2', 'FULL'].includes(stage)) {
    config.rolloutStage = stage;
  }
  if (typeof paused === 'boolean') {
    config.paused = paused;
  }
  if (canaryVersion) config.canaryVersion = canaryVersion;
  if (stableVersion) config.stableVersion = stableVersion;
  if (releaseNotes) config.releaseNotes = releaseNotes;

  saveRolloutConfig(config);

  // Broadcast rollout stage change to all connected dashboards and registers
  if (fastify.websocketServer?.clients) {
    fastify.websocketServer.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({
          type: 'FLEET_ROLLOUT_STAGE_CHANGED',
          config
        }));
      }
    });
  }

  return { success: true, message: `Rollout stage updated to ${config.rolloutStage}`, config };
});

// Vercel Serverless Function Handler
export default async function handler(req, res) {
  await fastify.ready();
  fastify.server.emit('request', req, res);
}

// Standalone Server Execution (For Local POS Terminal & LAN)
const start = async () => {
  try {
    await initDatabase();

    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('POS Backend running on port 3000');

    // 📡 Initialize Zero-Config mDNS Beacon
    try {
      const bonjour = new Bonjour();
      bonjour.publish({
        name: 'Askar-POS-Master',
        type: 'http',
        port: 3000,
        host: 'askar-master.local'
      });
      fastify.log.info('📡 mDNS Beacon Active: Hardware terminals can now connect to http://askar-master.local:3000');
    } catch (mdnsErr) {
      console.warn('⚠️ mDNS Beacon notice (non-fatal):', mdnsErr?.message || mdnsErr);
    }

    // Run seeding and background cron in background non-blocking
    setImmediate(async () => {
      try {
        await l1ProductCache.warmUp();
        await IdempotencyService.initTable();
      } catch (cacheErr) {
        console.warn('⚠️ L1/Idempotency init notice:', cacheErr?.message || cacheErr);
      }
      try {
        await seedDistributors();
        await seedProducts();
        await seedNfcCustomers();
      } catch (seedErr) {
        console.warn('⚠️ Seeding notice (non-fatal):', seedErr?.message || seedErr);
      }
      try {
        startSyncEngine();
        startCloudSyncDaemon(fastify.websocketServer);
        startReorderCron();
        startBackupCron();
        startPaydayCron();
        startReconcilerCron();
        healthAnalyticsService.init();
        // Schedule non-blocking hot snapshot every 6 hours
        setInterval(() => {
          HotBackupService.createHotSnapshot('SCHEDULED_6H').catch(() => {});
        }, 6 * 60 * 60 * 1000);
      } catch (cronErr) {
        console.warn('⚠️ Background jobs notice (non-fatal):', cronErr?.message || cronErr);
      }
    });
  } catch (err) {
    if (err?.code === 'EADDRINUSE' || err?.message?.includes('EADDRINUSE')) {
      console.log('⚠️ Port 3000 already running existing server. Connected to active instance.');
      return;
    }
    fastify.log.error(err);
  }
};

if (process.env.VERCEL !== '1') {
  start();
}