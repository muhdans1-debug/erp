import Fastify from 'fastify';
import crypto from 'crypto';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import salesRoutes from './routes/sales.js';
import productRoutes from './routes/products.js';
import khataRoutes, { getAllCustomersWithBalances } from './routes/khata.js';
import hardwareRoutes from './routes/hardware.js';
import shiftRoutes from './routes/shifts.js';
import reportRoutes from './routes/reports.js';
import procurementRoutes from './routes/procurement.js';
import { managerAuth } from './middleware/auth.js';
import { pipeline } from 'stream/promises';
import { db, initDatabase, localDbPath } from './db.js';
import { SaleRepository } from './repositories/SaleRepository.js';
import { startSyncEngine, syncNow, getSyncStatus, setMasterBaseUrl, getMasterBaseUrl } from './syncEngine.js';
import { startReorderCron, runReorderCheck, snoozedDistributors } from './src/automation/reorderJob.js';
import { startBackupCron, createDatabaseBackup, getLatestBackup } from './src/automation/backupJob.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCurrentInvoiceSequence, setStartingInvoiceSequence, formatInvoiceNumber } from './services/invoiceSequence.js';
import { startBridgeServer } from './bridgeServer.js';

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

const fastify = Fastify({
  logger: true,
  bodyLimit: 52428800 // 50MB limit to handle bulk image syncs and 100+ item intake batches
});

// 🟢 Register Modular Domain Route Plugins
fastify.register(salesRoutes);
fastify.register(productRoutes);
fastify.register(khataRoutes);
fastify.register(hardwareRoutes);
fastify.register(shiftRoutes);
fastify.register(reportRoutes);
fastify.register(procurementRoutes);

// APK Direct Download Endpoint for Sunmi Terminal Installation
if (!fs.existsSync(path.join(__dirname, 'dist', 'pos.apk'))) {
  fastify.get('/pos.apk', async (request, reply) => {
    const apkPath = path.resolve('./android/app/build/outputs/apk/debug/app-debug.apk');
    if (fs.existsSync(apkPath)) {
      const stream = fs.createReadStream(apkPath);
      reply.header('Content-Type', 'application/vnd.android.package-archive');
      reply.header('Content-Disposition', 'attachment; filename="askar-pos-latest.apk"');
      return reply.send(stream);
    }
    return reply.status(404).send({ error: 'APK build not found' });
  });
}

// Process Resilience: Prevent unexpected background network disconnects from crashing the server
process.on('uncaughtException', (err) => {
  console.error('⚠️ [Server Uncaught Exception Safeguard]:', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.warn('⚠️ [Server Unhandled Rejection Safeguard]:', reason?.message || reason);
});

// Singleton LibSQL Client used for all database queries & background Turso sync
const tursoDb = db;

// Ensure Sales view and triggers exist on local.db for backward & forward compatibility
if (tursoDb?.execute) {
  try {
    tursoDb.execute(`
    CREATE VIEW IF NOT EXISTS Sales AS 
    SELECT 
      id,
      invoiceNo AS invoice_number,
      total,
      paymentType AS payment_type,
      status,
      employeeId AS employee_id,
      shiftId AS shift_id,
      customerId AS khata_id,
      createdAt AS created_at
    FROM Sale;
  `).catch(() => { });

    tursoDb.execute(`
    CREATE TRIGGER IF NOT EXISTS sales_insert_trigger
    INSTEAD OF INSERT ON Sales
    BEGIN
      INSERT INTO Sale (id, invoiceNo, total, subtotal, paymentType, status, shiftId, createdAt)
      VALUES (
        NEW.id,
        NEW.invoice_number,
        NEW.total,
        COALESCE(NEW.total, 0),
        NEW.payment_type,
        NEW.status,
        NEW.shift_id,
        datetime('now')
      );
    END;
  `).catch(() => { });

    tursoDb.execute(`
    CREATE TRIGGER IF NOT EXISTS sales_update_trigger
    INSTEAD OF UPDATE ON Sales
    BEGIN
      UPDATE Sale
      SET status = NEW.status
      WHERE invoiceNo = NEW.invoice_number OR id = NEW.id;
    END;
  `).catch(() => { });
  } catch (e) {
    console.warn('Sales view setup notice:', e?.message);
  }
}

const _transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_APP_PASS },
});

await fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-manager-pin', 'Accept', 'Origin', 'X-Requested-With', 'Cache-Control', 'Pragma', 'Expires'],
});

// Serve compiled React frontend if dist exists
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  await fastify.register(fastifyStatic, {
    root: distPath,
    prefix: '/',
    wildcard: false,
    index: false,
    maxAge: 86400000,
    immutable: true
  });

  fastify.setNotFoundHandler((request, reply) => {
    if (request.raw.url && !request.raw.url.startsWith('/api')) {
      return reply.sendFile('index.html');
    }
    reply.status(404).send({ message: `Route ${request.method}:${request.url} not found`, error: 'Not Found', statusCode: 404 });
  });
}

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
    } else if (!existing.whatsappNumber || existing.whatsappNumber === '97339000000') {
      await db.orm.Distributor.where({ id: d.id }).update({ whatsappNumber: d.whatsappNumber });
    }
  }

  // Ensure all products are linked to a Distributor
  const products = await db.orm.Product.all();
  for (const p of products) {
    if (!p.distributorId) {
      let distId = 'dist_local';
      const sName = (p.supplierName || '').toLowerCase();
      const pName = (p.name || '').toLowerCase();
      if (sName.includes('almarai') || pName.includes('almarai')) {
        distId = 'dist_almarai';
      } else if (sName.includes('arla') || pName.includes('lurpak')) {
        distId = 'dist_arla';
      } else if (sName.includes('jameel') || pName.includes('rice')) {
        distId = 'dist_aljameel';
      }
      await db.orm.Product.where({ id: p.id }).update({ distributorId: distId });
    }
  }
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

// Fastify Global Omni-Search API (for Ctrl+K Command Palette)
fastify.get('/api/search/global', async (request, reply) => {
  const { q } = request.query || {};
  const query = String(q || '').trim().toLowerCase();
  if (!query || query.length < 2) return { success: true, results: [] };

  try {
    const [allProducts, allCustomers, allDistributors] = await Promise.all([
      db.orm.Product.all(),
      db.orm.Customer.all(),
      db.orm.Distributor.all()
    ]);

    const results = [];

    // 1. Search Inventory by name or barcode
    const matchedProducts = allProducts.filter((p) =>
      (p.name && p.name.toLowerCase().includes(query)) ||
      (p.id && String(p.id).toLowerCase().includes(query)) ||
      (p.barcode && String(p.barcode).toLowerCase().includes(query))
    ).slice(0, 5);

    matchedProducts.forEach((p) => results.push({
      id: `prod-${p.id}`,
      type: 'INVENTORY',
      title: p.name,
      subtitle: `${p.stockQuantity ?? 0} in stock • BD ${Number(p.sellingPrice || 0).toFixed(3)}`,
      action: 'VIEW_STOCK',
      data: p
    }));

    // 2. Search Khata Ledgers by name, phone, or CPR
    const matchedCustomers = allCustomers.filter((c) =>
      (c.name && c.name.toLowerCase().includes(query)) ||
      (c.phone && String(c.phone).toLowerCase().includes(query)) ||
      (c.cpr && String(c.cpr).toLowerCase().includes(query)) ||
      (c.cardUid && String(c.cardUid).toLowerCase().includes(query))
    ).slice(0, 5);

    matchedCustomers.forEach((c) => results.push({
      id: `cust-${c.id}`,
      type: 'KHATA',
      title: c.name,
      subtitle: `Balance: BD ${Number(c.currentBalance || 0).toFixed(3)} • ${c.phone || c.cpr || 'No Phone'}`,
      action: 'VIEW_LEDGER',
      data: c
    }));

    // 3. Search Supply Chain
    const matchedDistributors = allDistributors.filter((d) =>
      (d.name && d.name.toLowerCase().includes(query)) ||
      (d.contactEmail && d.contactEmail.toLowerCase().includes(query))
    ).slice(0, 3);

    matchedDistributors.forEach((d) => results.push({
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
// 1. Outbox Status Route (Returns pending vs synced counts)
fastify.get('/api/sync/status', async () => {
  return await getSyncStatus();
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

fastify.post('/api/config/master-url', async (request, reply) => {
  const { masterUrl } = request.body || {};
  if (!masterUrl) return reply.status(400).send({ error: 'masterUrl is required' });
  setMasterBaseUrl(masterUrl);
  return { success: true, masterUrl: getMasterBaseUrl() };
});

// --- AUTOMATED DATABASE BACKUP & SNAPSHOT ROUTES ---

// 1. Download Latest Database Backup Snapshot Stream
fastify.get('/api/system/download-backup', async (request, reply) => {
  try {
    const latestBackup = getLatestBackup();
    if (!latestBackup || !fs.existsSync(latestBackup.fullPath)) {
      return reply.status(404).send({ error: 'No database backup snapshot available' });
    }

    const stream = fs.createReadStream(latestBackup.fullPath);
    return reply
      .header('Content-Type', 'application/x-sqlite3')
      .header('Content-Disposition', `attachment; filename="${latestBackup.filename}"`)
      .header('Content-Length', latestBackup.sizeBytes)
      .send(stream);
  } catch (error) {
    fastify.log.error('Failed to stream database backup', error);
    return reply.status(500).send({ error: 'Failed to download database snapshot', details: error.message });
  }
});

// 2. Trigger On-Demand Database Backup Snapshot
fastify.post('/api/system/backup', async (request, reply) => {
  try {
    const backup = createDatabaseBackup();
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
fastify.get('/api/system/backups', async (request, reply) => {
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
fastify.get('/api/system/invoice-sequence', async () => {
  const current = await getCurrentInvoiceSequence('Sale');
  const next = current + 1;
  return {
    success: true,
    currentSeq: current,
    nextInvoiceNumber: next,
    formattedNextInvoice: formatInvoiceNumber(next),
    compliance: 'Bahrain NBR VAT Article 53 - Strictly Sequential & Gapless'
  };
});

// 5. Seed / Set Starting Invoice Sequence (e.g. migrate to starting at #5000)
fastify.post('/api/system/invoice-sequence/seed', async (request, reply) => {
  const { startingNumber } = request.body || {};
  const num = parseInt(startingNumber, 10);
  if (isNaN(num) || num < 1) {
    return reply.status(400).send({ error: 'Invalid startingNumber. Must be an integer >= 1.' });
  }
  await setStartingInvoiceSequence(num, 'Sale');
  return {
    success: true,
    message: `Starting invoice sequence configured to #${num}`,
    nextInvoiceNumber: num,
    formattedNextInvoice: formatInvoiceNumber(num)
  };
});

// ==========================================
// TURSO / LIBSQL EMBEDDED REPLICA ENDPOINTS
// 0ms SUNMI Local Chip Execution + Background Turso Sync
// ==========================================

// Secured Database Execution Route
fastify.post('/api/db/execute', async (request, reply) => {
  const devSecret = request.headers['x-dev-secret'];

  // Enforce strict developer secret validation
  if (!devSecret || devSecret !== process.env.DEV_SECRET) {
    return reply.code(403).send({ error: 'Forbidden. Invalid developer secret.' });
  }

  const body = request.body || {};
  let sql = typeof body === 'string' ? body : (body.sql || body.query);
  let args = body.args || [];

  try {
    const result = await db.execute({ sql, args });
    return { success: true, rows: result.rows, rowsAffected: result.rowsAffected };
  } catch (error) {
    console.error("DB Execute Error:", error);
    return reply.code(500).send({ error: error.message });
  }
});

export const syncKhataBalancesToTurso = async () => {
  try {
    const customers = await getAllCustomersWithBalances(true);
    for (const c of customers) {
      await tursoDb.execute({
        sql: `UPDATE Customer SET 
              balance = ?,
              access_token = COALESCE(access_token, ?)
              WHERE id = ?`,
        args: [
          Number(c.currentBalance || 0),
          c.access_token || c.id,
          c.id
        ]
      });
    }
  } catch (err) {
    console.warn('Sync Khata balances to Customer warning:', err?.message);
  }
};

// Tap Payments Webhook Receiver & Cryptographically Secured Debt Settlement
fastify.post('/api/webhook/tap', async (request, reply) => {
  const signatureHeader = request.headers['x-tap-signature'];
  const webhookSecret = process.env.TAP_WEBHOOK_SECRET || 'tap_webhook_secret_placeholder';

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
  if (payload.status === 'CAPTURED' || payload.status === 'PAID' || payload.status === 'SUCCESS') {
    const amount = Number(payload.amount || payload.response?.amount || 0);
    const customerUuid = payload.metadata?.customerUuid || payload.reference?.order?.replace('ORD-', '');

    if (amount > 0 && customerUuid) {
      const custCheck = await db.execute({
        sql: 'SELECT id, balance FROM Customer WHERE access_token = ? OR id = ? LIMIT 1',
        args: [customerUuid, customerUuid]
      });

      if (custCheck.rows && custCheck.rows.length > 0) {
        const actualCustomer = custCheck.rows[0];
        const actualCustId = actualCustomer.id;

        await db.execute({
          sql: 'UPDATE Customer SET balance = MAX(0, balance - ?) WHERE id = ?',
          args: [amount, actualCustId]
        });

        const ledgerId = `tx_tap_${Date.now()}`;
        await db.execute({
          sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, tenantId, syncStatus, timestamp, created_at)
                VALUES (?, ?, ?, 'PAYMENT', 'BenefitPay Online Settlement via Tap Payments', 'tenant_1', 'SYNCED', datetime('now'), datetime('now'))`,
          args: [ledgerId, actualCustId, -amount]
        }).catch((e) => {
          console.warn('Tap ledger mirror warning:', e?.message);
        });

        console.log(`✅ Cleared BHD ${amount} for Customer ID: ${actualCustId} (Token: ${customerUuid})`);
        return reply.send({ success: true, message: 'Khata debt cleared', clearedAmount: amount, customerId: actualCustId, customerUuid });
      }
    }
  }
  return reply.send({ received: true, status: payload.status || 'IGNORED' });
});

fastify.route({
  method: ['GET', 'POST'],
  url: '/api/db/sync',
  handler: async (request, reply) => {
    try {
      const syncRes = await tursoDb.sync();
      await syncKhataBalancesToTurso();
      return {
        success: true,
        message: 'Local embedded replica synced to Turso cloud successfully.',
        syncResult: syncRes
      };
    } catch (error) {
      fastify.log.warn('Turso sync offline fallback: ' + (error?.message || error));
      return reply.status(200).send({
        success: false,
        offline: true,
        message: 'Device offline. Sale saved locally and will sync when Wi-Fi returns.',
        error: error?.message || String(error)
      });
    }
  }
});

// ============================================================================
// SUPER ADMIN & REMOTE FLEET COMMAND CENTER API
// Powered by Turso Platform API & Master Token
// ============================================================================

// 1. List All Multi-Tenant Client Databases in Organization
fastify.get('/api/super-admin/tenants', async (_request, reply) => {
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
  const { slug, group } = request.body || {};
  if (!slug) {
    return reply.status(400).send({ success: false, error: 'Store slug is required (e.g., citymart, almadina).' });
  }

  try {
    const result = await provisionTenantDatabase(slug, group || 'default');
    return { success: true, ...result };
  } catch (error) {
    fastify.log.error('Failed to provision tenant: ' + error.message);
    return reply.status(500).send({ success: false, error: error.message });
  }
});

// 3. God-Mode Remote SQL Query Engine
fastify.post('/api/super-admin/query', { preHandler: managerAuth }, async (request, reply) => {
  const { databaseName, sqlQuery } = request.body || {};
  if (!databaseName || !sqlQuery) {
    return reply.status(400).send({ success: false, error: 'databaseName and sqlQuery are required.' });
  }

  try {
    const queryResult = await executeRemoteQuery(databaseName, sqlQuery);
    return queryResult;
  } catch (error) {
    fastify.log.error('Remote SQL execution failed: ' + error.message);
    return reply.status(400).send({ success: false, error: error.message });
  }
});

// 4. Fleet Telemetry Matrix (All 50+ Terminals)
fastify.get('/api/super-admin/fleet', async (_request, reply) => {
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
fastify.get('/api/super-admin/audit-logs', async (_request, reply) => {
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

// Vercel Serverless Function Handler
export default async function handler(req, res) {
  await fastify.ready();
  fastify.server.emit('request', req, res);
}

// Standalone Server Execution (For Local POS Terminal & LAN)
const start = async () => {
  try {
    // 1. Initialize and verify native LibSQL schema on local.db
    await initDatabase();

    try {
      await seedDistributors();
      await seedProducts();
      await seedNfcCustomers();
    } catch (seedErr) {
      console.warn('⚠️ Seeding notice (non-fatal):', seedErr?.message || seedErr);
    }
    try {
      startSyncEngine();
      startReorderCron();
      startBackupCron();
      if (process.env.npm_lifecycle_event !== 'start:master' && process.env.STANDALONE_BRIDGE !== '1') {
        startBridgeServer();
      }
    } catch (cronErr) {
      console.warn('⚠️ Background jobs notice (non-fatal):', cronErr?.message || cronErr);
    }
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('POS Backend running on port 3000');
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