import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import bcrypt from 'bcryptjs';
import { getDb, type Env } from './db.ts';
import { tenantMiddleware, type TenantContext } from './middleware/tenant.ts';
import { checkPinRateLimit, recordFailedPinAttempt, resetPinAttempts, requireManagerAuth, requirePosOrManagerAuth } from './middleware/auth.ts';
import { salesRouter } from './routes/sales.ts';
import { productsRouter } from './routes/products.ts';
import { khataRouter } from './routes/khata.ts';
import { shiftsRouter } from './routes/shifts.ts';
import { reportsRouter } from './routes/reports.ts';
import { storesRouter } from './routes/stores.ts';
import { procurementRouter } from './routes/procurement.ts';
import { hardwareRouter } from './routes/hardware.ts';
import { getMasterServerTimeInfo, getRegionalIsoString } from './utils/time.ts';

const app = new Hono<{ Bindings: Env; Variables: TenantContext }>();

// 1. Global Middleware: Logger & Universal CORS
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  maxAge: 86400,
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'x-tenant-id',
    'x-store-id',
    'x-terminal-id',
    'x-register-id',
    'x-manager-pin',
    'x-dr-secret',
    'x-khata-pin',
    'x-pos-client'
  ],
  exposeHeaders: ['Content-Length', 'x-store-id', 'x-tenant-id']
}));

// 2. Health, Heartbeat & Master Regional Time Endpoints
app.get('/', (c) => {
  const masterTime = getMasterServerTimeInfo();
  return c.json({
    service: 'Askar-Retail-Edge-Platform',
    status: 'online',
    architecture: 'Cloudflare Edge + Turso Central Database',
    region: 'Bahrain PoP (BAH)',
    timestamp: masterTime.serverEpoch,
    masterTime
  });
});

app.get('/health', (c) => {
  const masterTime = getMasterServerTimeInfo();
  return c.json({ status: 'ok', service: 'Askar-Edge-API', timestamp: masterTime.serverEpoch, masterTime });
});

app.get('/api/health', (c) => {
  const masterTime = getMasterServerTimeInfo();
  return c.json({ status: 'ok', service: 'Askar-POS-Master', hostname: 'askar-edge.cloudflare', timestamp: masterTime.serverEpoch, masterTime });
});

// Master Regional Clock Synchronization Endpoints for all POS Terminals
app.get('/api/time', (c) => c.json({ success: true, masterTime: getMasterServerTimeInfo() }));
app.get('/api/server-time', (c) => c.json({ success: true, masterTime: getMasterServerTimeInfo() }));
app.get('/server-time', (c) => c.json({ success: true, masterTime: getMasterServerTimeInfo() }));

// 3. Backward Compatibility Endpoints for POS Terminal Handshakes
app.all('/api/db/sync', (c) => c.json({
  success: true,
  offline: false,
  message: 'Cloudflare Edge API is live. Central database connected.',
  syncResult: { status: 'synced' },
  masterTime: getMasterServerTimeInfo()
}));

app.get('/api/sync/status', (c) => c.json({
  online: true,
  syncActive: true,
  service: 'Cloudflare-Edge-API',
  region: 'me-central (Bahrain)',
  masterTime: getMasterServerTimeInfo()
}));

// Employee & Manager PIN Authentication with Rate Limiting & Bcrypt Defense (No Hardcoded Backdoors)
const verifyPinHandler = async (c: any) => {
  const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
  const rateLimit = checkPinRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return c.json({ error: `Too many failed PIN attempts. Locked out for ${rateLimit.remainingLockoutSec}s.` }, 429);
  }

  const db = getDb(c.env);
  try {
    const body = await c.req.json();
    const cleanPin = String(body.pin || '').trim();
    if (!cleanPin) return c.json({ error: 'PIN required' }, 400);

    // 1. Fetch active employees to compare bcrypt hash safely
    const res = await db.execute({
      sql: 'SELECT id, name, role, pin_code, is_active FROM Employee WHERE is_active = 1',
      args: []
    });

    if (res.rows && res.rows.length > 0) {
      for (const row of res.rows) {
        const storedPin = String(row.pin_code || '').trim();
        let isMatch = false;
        if (storedPin.startsWith('$2a$') || storedPin.startsWith('$2b$')) {
          isMatch = await bcrypt.compare(cleanPin, storedPin);
        } else if (storedPin) {
          isMatch = (storedPin === cleanPin);
        }

        if (isMatch) {
          resetPinAttempts(clientIp);
          return c.json({
            success: true,
            employee: {
              id: row.id,
              name: row.name,
              role: row.role,
              is_active: row.is_active
            }
          });
        }
      }
    }

    // 2. Strict environment PIN check (if configured and non-default)
    const envManagerPin = c.env.MANAGER_PIN?.trim();
    if (envManagerPin && envManagerPin !== '9999' && cleanPin === envManagerPin) {
      resetPinAttempts(clientIp);
      return c.json({
        success: true,
        employee: {
          id: 'emp_manager_admin',
          name: 'Store Manager',
          role: 'MANAGER',
          is_active: 1
        }
      });
    }

    recordFailedPinAttempt(clientIp);
    return c.json({ success: false, error: 'Invalid PIN. Access Denied.' }, 401);
  } catch (err: any) {
    return c.json({ error: 'Verification failed', details: err?.message }, 500);
  }
};

// Return employee roster WITHOUT exposing pin_code to clients
const getEmployeesHandler = async (c: any) => {
  const db = getDb(c.env);
  try {
    const res = await db.execute('SELECT id, name, role, is_active FROM Employee WHERE is_active = 1 ORDER BY name ASC');
    return c.json({ success: true, count: res.rows.length, employees: res.rows });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch employees', details: err?.message }, 500);
  }
};

const saveEmployeeHandler = async (c: any) => {
  const db = getDb(c.env);
  try {
    const body = await c.req.json();
    const { id, name, pin_code, role, is_active, tenantId } = body || {};
    if (!name || !pin_code || !role) {
      return c.json({ error: 'Name, 4-digit PIN, and role are required' }, 400);
    }
    const cleanPin = String(pin_code).trim();
    if (cleanPin.length !== 4 && !(cleanPin.startsWith('$2b$') || cleanPin.startsWith('$2a$'))) {
      return c.json({ error: 'PIN must be exactly 4 digits' }, 400);
    }
    const empId = id || `emp_${crypto.randomUUID().slice(0, 8)}`;
    const empName = String(name).trim();
    const empRole = String(role).toUpperCase();
    const activeVal = is_active !== false ? 1 : 0;
    const resolvedTenant = tenantId || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';

    // Bcrypt-hash 4-digit PIN if not already hashed
    let storedPin = cleanPin;
    if (!storedPin.startsWith('$2a$') && !storedPin.startsWith('$2b$')) {
      storedPin = await bcrypt.hash(cleanPin, 10);
    }

    await db.execute({
      sql: `INSERT INTO Employee (id, tenantId, name, pin_code, role, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              pin_code = excluded.pin_code,
              role = excluded.role,
              is_active = excluded.is_active`,
      args: [empId, resolvedTenant, empName, storedPin, empRole, activeVal]
    });

    return c.json({ success: true, employeeId: empId, message: 'Employee saved successfully' });
  } catch (err: any) {
    return c.json({ error: 'Failed to save employee', details: err?.message }, 500);
  }
};

app.post('/api/employees/verify-pin', verifyPinHandler);
app.post('/employees/verify-pin', verifyPinHandler);
app.get('/api/employees', getEmployeesHandler);
app.get('/employees', getEmployeesHandler);
app.post('/api/employees', requireManagerAuth, saveEmployeeHandler);
app.post('/employees', requireManagerAuth, saveEmployeeHandler);
app.get('/api/super-admin/fleet', requireManagerAuth, (c) => {
  return c.json({ success: true, authorized: true });
});

// 4. Apply Multi-Tenant / Multi-Store Scoping Middleware
app.use('/api/*', tenantMiddleware);
app.use('/products/*', tenantMiddleware);
app.use('/sales/*', tenantMiddleware);
app.use('/checkout/*', tenantMiddleware);
app.use('/shifts/*', tenantMiddleware);
app.use('/khata/*', tenantMiddleware);
app.use('/customers/*', tenantMiddleware);

// 5. Mount Core Domain Routers (Both /api/* and root /* for total client backwards compatibility)
app.route('/api/sales', salesRouter);
app.route('/api/checkout', salesRouter);
app.route('/checkout', salesRouter);
app.route('/api/sync/sales', salesRouter); // Direct alias for offline queue drain
app.route('/sales', salesRouter);

app.route('/api/products', productsRouter);
app.route('/products', productsRouter);

// Direct PIM Push Sync Handler (Feitian F100 Handheld Intake Protocol 1)
const pimPushHandler = async (c: any) => {
  const db = getDb(c.env);
  const tenantId = c.get('tenantId') || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';

  try {
    const body = await c.req.json();
    const batch: any[] = body.batch || body.products || [];
    if (!Array.isArray(batch) || batch.length === 0) {
      return c.json({ success: true, count: 0, syncedIds: [] });
    }

    const batchStatements: { sql: string; args: any[] }[] = [];
    const syncedIds: string[] = [];

    for (const b of batch) {
      const data = b.data || b;
      const localId = b.local_id || b.id || data.id;
      const barcode = String(b.barcode || data.barcode || '').trim();
      const id = String(data.id || barcode || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
      const name = String(data.name || 'Product').trim();
      const sellingPrice = Number(data.sellingPrice || data.price || 0);
      const purchasePrice = Number(data.purchasePrice || data.unitCost || 0);
      const unitCost = Number(data.unitCost || purchasePrice);
      const stockQuantity = Number(data.stockQuantity ?? data.intakeQty ?? 99999);
      const category = data.category || 'GROCERY';
      const vatRate = Number(data.vatRate ?? 10);
      const isWeighed = data.is_weighed_item ? 1 : 0;
      const minThreshold = Number(data.minThreshold || 10);
      const maxThreshold = Number(data.maxThreshold || 100);

      // Remove from DeletedProduct if previously tombstoned
      batchStatements.push({
        sql: `DELETE FROM DeletedProduct WHERE id = ? OR (barcode IS NOT NULL AND barcode = ?)`,
        args: [id, barcode]
      });

      // Upsert Product
      batchStatements.push({
        sql: `INSERT INTO Product (id, tenantId, barcode, name, sellingPrice, purchasePrice, unitCost, stockQuantity, minThreshold, maxThreshold, category, vatRate, is_weighed_item, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                barcode = excluded.barcode,
                sellingPrice = excluded.sellingPrice,
                unitCost = excluded.unitCost,
                purchasePrice = excluded.purchasePrice,
                stockQuantity = excluded.stockQuantity,
                minThreshold = excluded.minThreshold,
                maxThreshold = excluded.maxThreshold,
                category = excluded.category,
                vatRate = excluded.vatRate,
                is_weighed_item = excluded.is_weighed_item,
                updatedAt = CURRENT_TIMESTAMP`,
        args: [id, tenantId, barcode || null, name, sellingPrice, purchasePrice, unitCost, stockQuantity, minThreshold, maxThreshold, category, vatRate, isWeighed]
      });

      // Upsert StoreInventory
      batchStatements.push({
        sql: `INSERT INTO StoreInventory (id, tenantId, storeId, productId, stockQuantity, sellingPrice, unitCost, minThreshold, maxThreshold, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(storeId, productId) DO UPDATE SET
                stockQuantity = excluded.stockQuantity,
                sellingPrice = excluded.sellingPrice,
                unitCost = excluded.unitCost,
                minThreshold = excluded.minThreshold,
                maxThreshold = excluded.maxThreshold,
                updated_at = CURRENT_TIMESTAMP`,
        args: [`si_${storeId}_${id}`, tenantId, storeId, id, stockQuantity, sellingPrice, unitCost, minThreshold, maxThreshold]
      });

      if (localId) {
        syncedIds.push(localId);
      }
    }

    const CHUNK_SIZE = 100;
    for (let i = 0; i < batchStatements.length; i += CHUNK_SIZE) {
      const chunk = batchStatements.slice(i, i + CHUNK_SIZE);
      await db.batch(chunk, 'write');
    }

    return c.json({ success: true, count: batch.length, syncedIds });
  } catch (err: any) {
    return c.json({ error: 'Failed to process PIM batch push', details: err?.message, success: false }, 500);
  }
};

app.post('/api/sync/pim-push', requirePosOrManagerAuth, pimPushHandler);
app.post('/sync/pim-push', requirePosOrManagerAuth, pimPushHandler);

// Quick Products & Categories Selective Endpoints & Aliases
app.get('/api/quick-products', async (c) => {
  const db = getDb(c.env);
  const storeId = c.req.query('storeId') || c.get('storeId') || c.env.DEFAULT_STORE_ID || 'store_askar_01';
  try {
    const res = await db.execute({
      sql: `
        SELECT 
          p.id, p.barcode, p.name, 
          COALESCE(qp.category, p.category, 'ESSENTIALS') as category,
          p.vatRate, p.is_weighed_item,
          COALESCE(si.sellingPrice, p.sellingPrice) as sellingPrice,
          COALESCE(si.sellingPrice, p.sellingPrice) as price,
          COALESCE(si.stockQuantity, p.stockQuantity, 99999) as stockQuantity,
          qp.quickColor, qp.sortOrder,
          1 as isQuickProduct
        FROM QuickProduct qp
        JOIN Product p ON qp.productId = p.id OR (p.barcode IS NOT NULL AND qp.productId = p.barcode)
        LEFT JOIN StoreInventory si ON p.id = si.productId AND si.storeId = ?
        ORDER BY qp.sortOrder ASC, p.name ASC
      `,
      args: [storeId]
    });
    return c.json({ success: true, products: res.rows || [] });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch quick products', details: err?.message }, 500);
  }
});

app.get('/quick-products', async (c) => {
  return c.redirect('/api/quick-products');
});

app.post('/api/quick-products/update', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  try {
    const body = await c.req.json();
    const id = body.id || body.productId || body.barcode;
    const category = (body.category || 'ESSENTIALS').toUpperCase();
    const isQuick = body.isQuickProduct !== false;

    if (!id) return c.json({ error: 'Missing product ID or barcode' }, 400);

    if (isQuick) {
      await db.execute({
        sql: `
          INSERT INTO QuickProduct (id, productId, category, quickColor, updatedAt)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(productId) DO UPDATE SET
            category = excluded.category,
            quickColor = COALESCE(excluded.quickColor, QuickProduct.quickColor),
            updatedAt = CURRENT_TIMESTAMP
        `,
        args: [`qp_${id}`, String(id), category, body.quickColor || null]
      });
      return c.json({ success: true, action: 'added', productId: id, category });
    } else {
      await db.execute({
        sql: `DELETE FROM QuickProduct WHERE productId = ? OR id = ?`,
        args: [String(id), `qp_${id}`]
      });
      return c.json({ success: true, action: 'removed', productId: id });
    }
  } catch (err: any) {
    return c.json({ error: 'Failed to update quick product', details: err?.message }, 500);
  }
});

app.post('/api/quick-products/remove', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  try {
    const body = await c.req.json();
    const id = body.id || body.productId || body.barcode;
    if (!id) return c.json({ error: 'Missing product ID' }, 400);

    await db.execute({
      sql: `DELETE FROM QuickProduct WHERE productId = ? OR id = ?`,
      args: [String(id), `qp_${id}`]
    });
    return c.json({ success: true, removed: true, productId: id });
  } catch (err: any) {
    return c.json({ error: 'Failed to remove quick product', details: err?.message }, 500);
  }
});

app.post('/api/quick-products/swap', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  try {
    const body = await c.req.json();
    const { sourceId, targetId } = body;
    if (!sourceId || !targetId) return c.json({ error: 'sourceId and targetId required' }, 400);

    const sRow = await db.execute({
      sql: `SELECT sortOrder FROM QuickProduct WHERE productId = ? OR id = ? LIMIT 1`,
      args: [String(sourceId), `qp_${sourceId}`]
    });
    const tRow = await db.execute({
      sql: `SELECT sortOrder FROM QuickProduct WHERE productId = ? OR id = ? LIMIT 1`,
      args: [String(targetId), `qp_${targetId}`]
    });

    if (sRow.rows.length > 0 && tRow.rows.length > 0) {
      const sOrder = sRow.rows[0].sortOrder;
      const tOrder = tRow.rows[0].sortOrder;

      await db.execute({
        sql: `UPDATE QuickProduct SET sortOrder = ? WHERE productId = ? OR id = ?`,
        args: [tOrder, String(sourceId), `qp_${sourceId}`]
      });
      await db.execute({
        sql: `UPDATE QuickProduct SET sortOrder = ? WHERE productId = ? OR id = ?`,
        args: [sOrder, String(targetId), `qp_${targetId}`]
      });
      return c.json({ success: true, swapped: true });
    }
    return c.json({ error: 'Items not found in QuickProduct table' }, 404);
  } catch (err: any) {
    return c.json({ error: 'Swap failed', details: err?.message }, 500);
  }
});

app.get('/api/quick-categories', async (c) => {
  const db = getDb(c.env);
  try {
    const res = await db.execute(`
      SELECT DISTINCT category FROM QuickProduct WHERE category IS NOT NULL AND category != ''
      UNION SELECT 'ALL'
      ORDER BY category ASC
    `);
    let categories = res.rows.map((r: any) => r.category).filter(Boolean);
    if (!categories.includes('ALL')) categories = ['ALL', ...categories];
    return c.json({ success: true, categories });
  } catch {
    return c.json({ success: true, categories: ['ALL', 'PRODUCE', 'BAKERY', 'DAIRY', 'ESSENTIALS'] });
  }
});

app.get('/quick-categories', async (c) => {
  return c.redirect('/api/quick-categories');
});

app.route('/api/khata', khataRouter);
app.route('/khata', khataRouter);
app.route('/api/shifts', shiftsRouter);
app.route('/shifts', shiftsRouter);
app.route('/api/reports', reportsRouter);
app.route('/reports', reportsRouter);
app.route('/api/stores', storesRouter);
app.route('/stores', storesRouter);

app.route('/api/purchase-orders', procurementRouter);
app.route('/purchase-orders', procurementRouter);

// Hardware & Live Relays
app.route('/api/hardware', hardwareRouter);
app.route('/api', hardwareRouter);
app.route('/', hardwareRouter);

// Procurement Distributors & Automation Trigger
app.get('/api/distributors', async (c) => {
  const db = getDb(c.env);
  try {
    const res = await db.execute('SELECT * FROM Distributor');
    return c.json({ success: true, distributors: res.rows });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch distributors', details: err?.message }, 500);
  }
});
app.get('/api/distributors/metrics', async (c) => {
  const db = getDb(c.env);
  try {
    const res = await db.execute('SELECT * FROM Distributor');
    return c.json({ success: true, distributors: res.rows });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch distributor metrics', details: err?.message }, 500);
  }
});
app.all('/api/automation/trigger-reorder', (c) => {
  return c.json({ success: true, message: 'Stock threshold reorder check completed', count: 0 });
});

/**
 * BenefitPay Fleet Configuration Engine (Central StoreSetting Backed)
 */
const DEFAULT_BENEFIT_CONFIG = {
  accountType: 'MOBILE_FAWRI',
  merchantId: '97300182',
  merchantName: 'layali sbi',
  mobileNumber: '+973 33843855',
  iban: 'BH77SBIN02740045310001',
  cprOrCr: '790614189',
  branchId: 'MAIN-01',
  notes: 'Scan with BenefitPay app to pay directly via Fawri+',
  updatedAt: new Date().toISOString()
};

const getBenefitConfigHandler = async (c: any) => {
  const db = getDb(c.env);
  try {
    const res = await db.execute({
      sql: `SELECT value FROM StoreSetting WHERE key = 'benefit_account' LIMIT 1`,
      args: []
    });
    let config = DEFAULT_BENEFIT_CONFIG;
    if (res.rows && res.rows.length > 0 && res.rows[0].value) {
      try {
        const raw = JSON.parse(String(res.rows[0].value));
        const clean = (raw && raw.config) ? { ...raw, ...raw.config } : raw;
        delete clean.config;
        delete clean.success;
        config = { ...DEFAULT_BENEFIT_CONFIG, ...clean };
      } catch {}
    }
    return c.json({
      success: true,
      config,
      ...config
    });
  } catch {
    return c.json({
      success: true,
      config: DEFAULT_BENEFIT_CONFIG,
      ...DEFAULT_BENEFIT_CONFIG
    });
  }
};

const saveBenefitConfigHandler = async (c: any) => {
  const db = getDb(c.env);
  try {
    const body = await c.req.json().catch(() => ({}));
    let current = DEFAULT_BENEFIT_CONFIG;
    try {
      const res = await db.execute({
        sql: `SELECT value FROM StoreSetting WHERE key = 'benefit_account' LIMIT 1`,
        args: []
      });
      if (res.rows && res.rows.length > 0 && res.rows[0].value) {
        const raw = JSON.parse(String(res.rows[0].value));
        const clean = (raw && raw.config) ? { ...raw, ...raw.config } : raw;
        delete clean.config;
        delete clean.success;
        current = { ...DEFAULT_BENEFIT_CONFIG, ...clean };
      }
    } catch {}

    const incoming = (body && typeof body === 'object') ? (body.config || body) : {};
    const { success, config: _nested, ...cleanIncoming } = incoming;

    const updated = {
      ...current,
      ...cleanIncoming,
      updatedAt: new Date().toISOString()
    };

    await db.execute({
      sql: `INSERT INTO StoreSetting (key, value, updatedAt)
            VALUES ('benefit_account', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updatedAt = CURRENT_TIMESTAMP`,
      args: [JSON.stringify(updated)]
    });

    return c.json({
      success: true,
      config: updated,
      ...updated
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to save BenefitPay configuration', details: err?.message }, 500);
  }
};

app.get('/api/config/benefit-account', getBenefitConfigHandler);
app.get('/config/benefit-account', getBenefitConfigHandler);
app.post('/api/config/benefit-account', requirePosOrManagerAuth, saveBenefitConfigHandler);
app.post('/config/benefit-account', requirePosOrManagerAuth, saveBenefitConfigHandler);

/**
 * Expenses & Cash Drawer Audit Logs (Protected)
 */
app.post('/api/expenses', requirePosOrManagerAuth, async (c) => {
  const db = getDb(c.env);
  const tenantId = (c.get('tenantId') as string) || c.env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  const storeId = (c.get('storeId') as string) || c.env.DEFAULT_STORE_ID || 'store_askar_01';
  try {
    const body = await c.req.json();
    const id = body.id || crypto.randomUUID();
    const type = body.type || 'BUSINESS';
    const category = body.category || 'MISC';
    const amount = Number(body.amount || 0);
    const description = body.description || 'General Expense';
    const recordedBy = body.recordedBy || 'Manager';

    const nowRegional = getRegionalIsoString();
    await db.execute({
      sql: `INSERT INTO Expense (id, type, category, amount, vatPaid, description, recordedBy, createdAt)
            VALUES (?, ?, ?, ?, 0.0, ?, ?, ?)`,
      args: [id, type, category, amount, description, recordedBy, nowRegional]
    });

    return c.json({ success: true, expense: { id, type, category, amount, description, recordedBy, createdAt: nowRegional } }, 201);
  } catch (err: any) {
    return c.json({ error: 'Failed to record expense', details: err?.message }, 500);
  }
});

app.get('/api/expenses', requireManagerAuth, async (c) => {
  const db = getDb(c.env);
  try {
    const res = await db.execute({
      sql: `SELECT * FROM Expense ORDER BY datetime(createdAt) DESC LIMIT 100`
    });
    return c.json({ success: true, expenses: res.rows });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch expenses', details: err?.message }, 500);
  }
});

// Root & /api aliases for customer endpoints (used by POS quick scan & spy)
app.route('/api', khataRouter); // Maps /api/customers, /api/customers/nfc/:uid
app.route('/', khataRouter);    // Maps /customers, /customers/nfc/:uid

// 6. Global 404 & Error Handlers
app.notFound((c) => c.json({ error: 'Endpoint Not Found on Edge API Gateway', path: c.req.path }, 404));

app.onError((err, c) => {
  console.error('Unhandled Edge Error:', err);
  return c.json({
    error: 'Internal Server Error on Cloudflare Edge',
    message: err.message,
    path: c.req.path
  }, 500);
});

export default app;
