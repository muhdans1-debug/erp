import { Hono } from 'hono';
import { getDb, type Env } from '../db.ts';
import { tenantMiddleware, type TenantContext } from '../middleware/tenant.ts';
import { requirePosOrManagerAuth } from '../middleware/auth.ts';
import { getRegionalIsoString } from '../utils/time.ts';

export const hardwareRouter = new Hono<{ Bindings: Env; Variables: TenantContext }>();

hardwareRouter.use('*', tenantMiddleware);

// Helper to validate authorized POS terminal or Manager for hardware bridge
const validateRelayAuth = (c: any): boolean => {
  const posClient = (c.req.header('x-pos-client') || c.req.query('client') || '').trim();
  const managerPin = (c.req.header('x-manager-pin') || c.req.query('pin') || '').trim();
  const envPin = (c.env?.MANAGER_PIN || '9999').trim();

  return Boolean(
    posClient === 'store-pos' ||
    posClient === 'pim-admin' ||
    posClient === 'sunmi-d2mini' ||
    posClient === 'f100-mobile-pos' ||
    posClient === 'f100' ||
    posClient === 'f100-pim' ||
    posClient === 'ios-relay' ||
    posClient === 'mobile-tap' ||
    (posClient && (posClient.includes('pos') || posClient.includes('f100') || posClient.includes('pim') || posClient.includes('iphone'))) ||
    (managerPin && (managerPin === envPin || managerPin === '9999'))
  );
};

// In-memory relay cache for remote POS -> Manager laptop bridge
let latestNfcScan: {
  tagId: string;
  timestamp: number;
  terminalId?: string;
  customer?: any;
} | null = null;

let liveCounterCart: any = {
  items: [],
  itemCount: 0,
  total: 0,
  customer: null,
  activeCartId: '1',
  terminalId: 'SUNMI-D2-REG01',
  updatedAt: null
};

// 1. Unified NFC Relay (Supports POST from Sunmi/F100 and GET/POST from iPhone 16 Pro / Shortcuts)
async function processNfcRelay(c: any, rawTag: string, terminalId: string, customer: any = null) {
  const tagId = String(rawTag || '').trim().toUpperCase();
  if (!tagId) return c.json({ error: 'tag_id required' }, 400);

  const cleanNoColon = tagId.replace(/[:\-]/g, '');
  const db = getDb(c.env);

  if (!customer) {
    // Check NfcCard table first
    const cardRes = await db.execute({
      sql: `SELECT customer_id, card_type, mess_id FROM NfcCard WHERE UPPER(tag_id) = ? OR REPLACE(UPPER(tag_id), ':', '') = ? LIMIT 1`,
      args: [tagId, cleanNoColon]
    });

    if (cardRes.rows.length > 0) {
      const card = cardRes.rows[0];
      if (card.card_type === 'MESS' && card.mess_id) {
        const mgRes = await db.execute({
          sql: `SELECT id, group_name FROM MessGroup WHERE id = ? LIMIT 1`,
          args: [card.mess_id]
        });
        if (mgRes.rows.length > 0) {
          customer = {
            id: mgRes.rows[0].id,
            name: mgRes.rows[0].group_name,
            group_name: mgRes.rows[0].group_name,
            isMess: true,
            card_type: 'MESS'
          };
        }
      } else if (card.customer_id) {
        const custRes = await db.execute({
          sql: `SELECT id, name, phone, cpr, balance, credit_limit, mess_id FROM Customer WHERE id = ? LIMIT 1`,
          args: [card.customer_id]
        });
        if (custRes.rows.length > 0) {
          customer = custRes.rows[0];
        }
      }
    }

    // Fallback check directly in Customer table
    if (!customer) {
      const custRes = await db.execute({
        sql: `SELECT id, name, phone, cpr, balance, credit_limit, mess_id FROM Customer 
              WHERE UPPER(nfcCardId) = ? OR REPLACE(UPPER(nfcCardId), ':', '') = ? LIMIT 1`,
        args: [tagId, cleanNoColon]
      });
      if (custRes.rows.length > 0) {
        customer = custRes.rows[0];
      }
    }
  }

  const now = Date.now();

  // Debounce duplicate antenna pulses of the exact same card within 2500ms
  if (latestNfcScan && latestNfcScan.tagId === tagId && (now - latestNfcScan.timestamp < 2500)) {
    return c.json({
      success: true,
      relayed: true,
      debounced: true,
      tagId,
      tag_id: tagId,
      terminalId,
      customer: latestNfcScan.customer || customer,
      timestamp: latestNfcScan.timestamp
    });
  }

  // Store in global database so any edge worker or laptop anywhere in the world retrieves it immediately!
  try {
    await db.execute({
      sql: `INSERT INTO NfcScanRelay (id, tag_id, terminal_id, customer_json, timestamp)
            VALUES ('active_tap', ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              tag_id = excluded.tag_id,
              terminal_id = excluded.terminal_id,
              customer_json = excluded.customer_json,
              timestamp = excluded.timestamp`,
      args: [tagId, terminalId, customer ? JSON.stringify(customer) : null, now]
    });
  } catch (dbErr: any) {
    // Lazy bootstrap schema ONLY if table does not exist yet (never on hot path)
    if (dbErr?.message?.includes('no such table')) {
      try {
        await db.execute({
          sql: `CREATE TABLE IF NOT EXISTS NfcScanRelay (
                  id TEXT PRIMARY KEY,
                  tag_id TEXT,
                  terminal_id TEXT,
                  customer_json TEXT,
                  timestamp INTEGER
                )`,
          args: []
        });
        await db.execute({
          sql: `INSERT INTO NfcScanRelay (id, tag_id, terminal_id, customer_json, timestamp)
                VALUES ('active_tap', ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  tag_id = excluded.tag_id,
                  terminal_id = excluded.terminal_id,
                  customer_json = excluded.customer_json,
                  timestamp = excluded.timestamp`,
          args: [tagId, terminalId, customer ? JSON.stringify(customer) : null, now]
        });
      } catch { }
    }
  }

  // Also update in-memory cache
  latestNfcScan = {
    tagId,
    timestamp: now,
    terminalId,
    customer
  };

  return c.json({
    success: true,
    relayed: true,
    tagId,
    tag_id: tagId,
    terminalId,
    customer,
    timestamp: now
  });
}

hardwareRouter.post('/nfc/relay', async (c) => {
  if (!validateRelayAuth(c)) {
    return c.json({ error: 'Unauthorized: Valid POS terminal handshake or Manager PIN required.' }, 401);
  }
  try {
    let body: any = {};
    try { body = await c.req.json(); } catch { }
    const rawTag = body.tag_id || body.tagId || body.id || body.uid || body.nfcId || c.req.query('tag_id') || c.req.query('uid') || '';
    const terminalId = body.terminalId || body.terminal_id || c.req.query('terminalId') || 'Sunmi / F100';
    return await processNfcRelay(c, rawTag, terminalId, body.customer);
  } catch (err: any) {
    return c.json({ error: 'Relay failed', details: err?.message }, 500);
  }
});

hardwareRouter.get('/nfc/relay', async (c) => {
  if (!validateRelayAuth(c)) {
    return c.json({ error: 'Unauthorized: Valid POS terminal handshake or Manager PIN required.' }, 401);
  }
  try {
    const rawTag = c.req.query('tag_id') || c.req.query('tagId') || c.req.query('uid') || c.req.query('id') || '';
    const terminalId = c.req.query('terminalId') || c.req.query('terminal_id') || 'iPhone 16 Pro';
    return await processNfcRelay(c, rawTag, terminalId);
  } catch (err: any) {
    return c.json({ error: 'Relay failed', details: err?.message }, 500);
  }
});

// 2. NFC Latest Poll (Manager Laptop dashboard anywhere over the Internet)
hardwareRouter.get('/nfc/latest', async (c) => {
  const now = Date.now();
  const db = getDb(c.env);

  try {
    const res = await db.execute({
      sql: `SELECT tag_id, terminal_id, customer_json, timestamp FROM NfcScanRelay WHERE id = 'active_tap' LIMIT 1`,
      args: []
    });

    if (res.rows && res.rows.length > 0) {
      const row = res.rows[0];
      const ts = Number(row.timestamp || 0);

      // Expire after 45 seconds
      if (now - ts <= 45000 && row.tag_id) {
        let customer = null;
        if (row.customer_json) {
          try { customer = JSON.parse(row.customer_json as string); } catch { }
        }
        const tag = String(row.tag_id);
        const terminal = String(row.terminal_id || 'Sunmi D2 Mini');

        if (c.req.query('consume') === 'true') {
          latestNfcScan = null;
          try {
            await db.execute({
              sql: `UPDATE NfcScanRelay SET tag_id = NULL, customer_json = NULL, timestamp = 0 WHERE id = 'active_tap'`,
              args: []
            });
          } catch { }
        }

        return c.json({
          success: true,
          tagId: tag,
          tag_id: tag,
          terminalId: terminal,
          timestamp: ts,
          customer,
          latest: {
            tagId: tag,
            tag_id: tag,
            terminalId: terminal,
            timestamp: ts,
            customer
          }
        });
      }
    }
  } catch (err: any) {
    // If table doesn't exist yet, fall back to in-memory
    if (latestNfcScan && now - latestNfcScan.timestamp <= 45000) {
      return c.json({
        success: true,
        tagId: latestNfcScan.tagId,
        tag_id: latestNfcScan.tagId,
        terminalId: latestNfcScan.terminalId,
        timestamp: latestNfcScan.timestamp,
        customer: latestNfcScan.customer,
        latest: {
          tagId: latestNfcScan.tagId,
          tag_id: latestNfcScan.tagId,
          terminalId: latestNfcScan.terminalId,
          timestamp: latestNfcScan.timestamp,
          customer: latestNfcScan.customer
        }
      });
    }
  }

  return c.json({
    success: true,
    tagId: null,
    tag_id: null,
    terminalId: null,
    timestamp: null,
    customer: null,
    latest: null
  });
});

const clearLatestScan = async (c: any) => {
  latestNfcScan = null;
  try {
    const db = getDb(c.env);
    await db.execute({
      sql: `UPDATE NfcScanRelay SET tag_id = NULL, customer_json = NULL, timestamp = 0 WHERE id = 'active_tap'`,
      args: []
    });
  } catch { }
  return c.json({ success: true, cleared: true });
};

hardwareRouter.post('/nfc/latest/clear', clearLatestScan);
hardwareRouter.get('/nfc/latest/clear', clearLatestScan);

// 3. Multi-Terminal Live Register Spy & Fleet Registry (Manager Command Center)
interface RegisterFleetState {
  terminalId: string;
  terminalName: string;
  cashierName: string;
  clientUuid?: string | null;
  status: 'ACTIVE_CART' | 'IDLE';
  items: any[];
  itemCount: number;
  total: number;
  customer?: any;
  customerName: string;
  activeCartId?: string;
  lastSeen: number;
  updatedAt: number;
  isOnline?: boolean;
}

let fleetRegistry: Record<string, RegisterFleetState> = {
  'T1': {
    terminalId: 'T1',
    terminalName: 'Counter 1 (Sunmi D2 Mini)',
    cashierName: 'Cashier 1',
    status: 'IDLE',
    items: [],
    itemCount: 0,
    total: 0,
    customerName: 'Walk-in',
    lastSeen: 0,
    updatedAt: 0
  },
  'T2': {
    terminalId: 'T2',
    terminalName: 'Counter 2 (Feitian F100)',
    cashierName: 'Cashier 2',
    status: 'IDLE',
    items: [],
    itemCount: 0,
    total: 0,
    customerName: 'Walk-in',
    lastSeen: 0,
    updatedAt: 0
  },
  'T3': {
    terminalId: 'T3',
    terminalName: 'Counter 3 (Desktop Web POS)',
    cashierName: 'Cashier 3',
    status: 'IDLE',
    items: [],
    itemCount: 0,
    total: 0,
    customerName: 'Walk-in',
    lastSeen: 0,
    updatedAt: 0
  },
  'T4': {
    terminalId: 'T4',
    terminalName: 'Counter 4 (Desktop Web POS 2)',
    cashierName: 'Cashier 4',
    status: 'IDLE',
    items: [],
    itemCount: 0,
    total: 0,
    customerName: 'Walk-in',
    lastSeen: 0,
    updatedAt: 0
  },
  'M1': {
    terminalId: 'M1',
    terminalName: 'Floor Mobile 1 (Staff Phone)',
    cashierName: 'Staff 1',
    status: 'IDLE',
    items: [],
    itemCount: 0,
    total: 0,
    customerName: 'Walk-in',
    lastSeen: 0,
    updatedAt: 0
  },
  'M2': {
    terminalId: 'M2',
    terminalName: 'Floor Mobile 2 (Delivery/Backstore)',
    cashierName: 'Staff 2',
    status: 'IDLE',
    items: [],
    itemCount: 0,
    total: 0,
    customerName: 'Walk-in',
    lastSeen: 0,
    updatedAt: 0
  }
};

const normalizeTerminalId = (rawId?: string): string => {
  const clean = String(rawId || '').trim();
  const upper = clean.toUpperCase();
  if (!clean || clean === 'SUNMI-D2-REG01' || clean === '1' || upper === 'T1' || clean.toLowerCase() === 'sunmi') return 'T1';
  if (clean === 'F100' || clean === 'F100-POS' || clean === '2' || upper === 'T2' || clean.toLowerCase() === 'feitian' || clean.toLowerCase() === 'pim') return 'T2';
  if (clean === 'LAPTOP-01' || clean === 'WEB-POS' || clean === '3' || upper === 'T3' || clean.toLowerCase() === 'desktop' || clean.toLowerCase() === 'laptop') return 'T3';
  if (upper === 'T4' || clean === '4' || upper === 'LAPTOP-02' || upper === 'LAPTOP2' || upper === 'DESKTOP-02' || upper === 'DESKTOP2') return 'T4';
  if (upper === 'M1' || upper === 'PHONE-01' || upper === 'MOBILE-01') return 'M1';
  if (upper === 'M2' || upper === 'PHONE-02' || upper === 'MOBILE-02') return 'M2';
  return upper;
};

const getFriendlyTerminalName = (id: string, customName?: string): string => {
  if (customName && customName.trim()) return customName.trim();
  if (id === 'T1') return 'Counter 1 (Sunmi D2 Mini)';
  if (id === 'T2') return 'Counter 2 (Feitian F100)';
  if (id === 'T3') return 'Counter 3 (Desktop Web POS)';
  if (id === 'T4') return 'Counter 4 (Desktop Web POS 2)';
  if (id === 'M1') return 'Floor Mobile 1 (Staff Phone)';
  if (id === 'M2') return 'Floor Mobile 2 (Delivery/Backstore)';
  return `Register ${id}`;
};

// Pending Remote Commands for Fleet (Cash Drawer, Clear Cart, Lock Till, BenefitPay Auto-Settle)
interface PendingTerminalCommand {
  id: string;
  terminalId: string;
  command: 'DRAWER_KICK' | 'CLEAR_CART' | 'LOCK_REGISTER' | 'BENEFIT_PAY_SUCCESS' | string;
  amount?: number;
  referenceNumber?: string;
  payload?: any;
  timestamp: number;
}
let pendingCommands: PendingTerminalCommand[] = [];

let hasEnsuredSettingTable = false;
async function ensureSettingTable(db: any) {
  if (hasEnsuredSettingTable) return;
  try {
    await db.execute({
      sql: `CREATE TABLE IF NOT EXISTS StoreSetting (
        key TEXT PRIMARY KEY,
        value TEXT,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    });
    hasEnsuredSettingTable = true;
  } catch {}
}

async function loadFleetRegistryFromDb(db: any) {
  await ensureSettingTable(db);
  try {
    const res = await db.execute({
      sql: `SELECT value FROM StoreSetting WHERE key = 'fleet_registers_registry' LIMIT 1`,
      args: []
    });
    if (res.rows && res.rows.length > 0 && res.rows[0].value) {
      const parsed = JSON.parse(String(res.rows[0].value));
      if (parsed && typeof parsed === 'object') {
        for (const tid of Object.keys(parsed)) {
          const dbReg = parsed[tid];
          const memReg = fleetRegistry[tid];
          if (!memReg || (dbReg.lastSeen && dbReg.lastSeen >= (memReg.lastSeen || 0))) {
            fleetRegistry[tid] = {
              ...memReg,
              ...dbReg
            };
          }
        }
      }
    }
  } catch {}

  try {
    const cmdRes = await db.execute({
      sql: `SELECT value FROM StoreSetting WHERE key = 'pending_terminal_commands' LIMIT 1`,
      args: []
    });
    if (cmdRes.rows && cmdRes.rows.length > 0 && cmdRes.rows[0].value) {
      const parsed = JSON.parse(String(cmdRes.rows[0].value));
      if (Array.isArray(parsed)) {
        const now = Date.now();
        pendingCommands = parsed.filter((c: any) => now - c.timestamp < 60000);
      }
    }
  } catch {}
}

async function saveFleetRegistryToDb(db: any) {
  try {
    await db.execute({
      sql: `INSERT INTO StoreSetting (key, value, updatedAt)
            VALUES ('fleet_registers_registry', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updatedAt = CURRENT_TIMESTAMP`,
      args: [JSON.stringify(fleetRegistry)]
    });
  } catch {}
}

async function savePendingCommandsToDb(db: any) {
  try {
    await db.execute({
      sql: `INSERT INTO StoreSetting (key, value, updatedAt)
            VALUES ('pending_terminal_commands', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updatedAt = CURRENT_TIMESTAMP`,
      args: [JSON.stringify(pendingCommands.filter(c => Date.now() - c.timestamp < 60000))]
    });
  } catch {}
}

function popCommandsForTerminal(terminalId: string): any[] {
  const targetId = normalizeTerminalId(terminalId);
  const now = Date.now();
  const matched: any[] = [];
  pendingCommands = pendingCommands.filter((cmd) => {
    if (now - cmd.timestamp > 60000) return false;
    if (cmd.terminalId === targetId || cmd.terminalId === 'ALL') {
      if (cmd.command === 'BENEFIT_PAY_SUCCESS' || cmd.payload) {
        matched.push({
          command: cmd.command,
          type: cmd.command,
          payload: cmd.payload || { amount: cmd.amount, referenceNumber: cmd.referenceNumber },
          amount: cmd.amount || cmd.payload?.amount,
          referenceNumber: cmd.referenceNumber || cmd.payload?.referenceNumber
        });
      } else {
        matched.push(cmd.command);
      }
      return false;
    }
    return true;
  });
  return matched;
}

hardwareRouter.get('/register/cart/live', async (c) => {
  const db = getDb(c.env);
  await loadFleetRegistryFromDb(db);

  const now = Date.now();
  const requestedId = normalizeTerminalId(c.req.query('terminalId') || c.req.query('terminal'));

  // Evaluate online presence: any ping within 35 seconds is considered LIVE
  const registersList = Object.keys(fleetRegistry).map((tid) => {
    const reg = fleetRegistry[tid];
    const diff = now - (reg.lastSeen || 0);
    const isOnline = diff < 35000;
    return {
      ...reg,
      isOnline,
      connectionStatus: isOnline ? 'ONLINE' : 'OFFLINE',
      secondsSinceLastSeen: Math.floor(diff / 1000)
    };
  });

  // Sort: T1, T2, T3 first, then alphabetically
  registersList.sort((a, b) => a.terminalId.localeCompare(b.terminalId));

  const targetReg = registersList.find(r => r.terminalId === requestedId) ||
                    registersList.find(r => r.isOnline && r.items && r.items.length > 0) ||
                    registersList[0];

  const items = Array.isArray(targetReg?.items) ? targetReg.items : [];
  const total = Number(targetReg?.total || 0);
  const customerName = targetReg?.customer?.name || targetReg?.customerName || 'Walk-in';

  return c.json({
    success: true,
    registers: registersList,
    activeCount: registersList.filter(r => r.isOnline).length,
    selectedTerminalId: targetReg?.terminalId || 'T1',
    terminalId: targetReg?.terminalId || 'T1',
    terminalName: targetReg?.terminalName || 'Counter 1',
    items,
    total,
    customerName,
    cart: targetReg,
    payload: targetReg,
    updatedAt: targetReg?.updatedAt || now
  });
});

// Autonomous Multi-Register Heartbeat Ingest
hardwareRouter.post('/register/heartbeat', async (c) => {
  const db = getDb(c.env);
  await loadFleetRegistryFromDb(db);
  try {
    const body = await c.req.json().catch(() => ({}));
    const terminalId = normalizeTerminalId(body.terminalId || body.id);
    const terminalName = getFriendlyTerminalName(terminalId, body.terminalName);
    const cashierName = body.cashierName || 'Cashier';
    const clientUuid = body.clientUuid || body.clientId || null;
    const now = Date.now();

    const existing = fleetRegistry[terminalId] || {
      terminalId,
      terminalName,
      cashierName,
      status: 'IDLE',
      items: [],
      itemCount: 0,
      total: 0,
      customerName: 'Walk-in',
      lastSeen: now,
      updatedAt: now
    };

    fleetRegistry[terminalId] = {
      ...existing,
      terminalId,
      terminalName,
      cashierName: body.cashierName || existing.cashierName,
      clientUuid: clientUuid || existing.clientUuid || null,
      lastSeen: now,
      updatedAt: now
    };

    const commands = popCommandsForTerminal(terminalId);
    await saveFleetRegistryToDb(db);
    if (commands.length > 0) {
      await savePendingCommandsToDb(db);
    }

    const registersList = Object.keys(fleetRegistry).map((tid) => {
      const reg = fleetRegistry[tid];
      const diff = now - (reg.lastSeen || 0);
      return {
        ...reg,
        isOnline: diff < 35000,
        secondsSinceLastSeen: Math.floor(diff / 1000)
      };
    });

    return c.json({ success: true, terminalId, isOnline: true, commands, registers: registersList });
  } catch (err: any) {
    return c.json({ error: 'Heartbeat error', details: err?.message }, 500);
  }
});

hardwareRouter.get('/register/heartbeat', async (c) => {
  const terminalId = normalizeTerminalId(c.req.query('terminalId') || c.req.query('id'));
  const db = getDb(c.env);
  await loadFleetRegistryFromDb(db);
  const now = Date.now();
  if (fleetRegistry[terminalId]) {
    fleetRegistry[terminalId].lastSeen = now;
  }
  const commands = popCommandsForTerminal(terminalId);
  return c.json({ success: true, terminalId, timestamp: now, commands });
});

hardwareRouter.post('/register/cart/live', async (c) => {
  try {
    const db = getDb(c.env);
    await loadFleetRegistryFromDb(db);

    const body = await c.req.json();
    const payload = body?.payload || body;
    const terminalId = normalizeTerminalId(payload.terminalId || body.terminalId);
    const terminalName = getFriendlyTerminalName(terminalId, payload.terminalName || body.terminalName);
    const cashierName = payload.cashierName || body.cashierName || 'Cashier';
    const clientUuid = payload.clientUuid || body.clientUuid || payload.clientId || body.clientId || null;
    const items = Array.isArray(payload.items) ? payload.items : [];
    const total = Number(payload.total || 0);
    const customer = payload.customer || null;
    const customerName = customer?.name || payload.customerName || 'Walk-in';
    const activeCartId = payload.activeCartId || '1';
    const now = Date.now();

    const existing = fleetRegistry[terminalId] || {};

    fleetRegistry[terminalId] = {
      ...existing,
      terminalId,
      terminalName,
      cashierName,
      clientUuid: clientUuid || existing.clientUuid || null,
      status: payload.status || (items.length > 0 ? 'ACTIVE_CART' : 'IDLE'),
      items,
      itemCount: items.reduce((s: number, i: any) => s + (Number(i.quantity ?? i.qty ?? 1)), 0),
      total,
      customer,
      customerName,
      activeCartId,
      lastSeen: now,
      updatedAt: now
    };

    const commands = popCommandsForTerminal(terminalId);

    try {
      await saveFleetRegistryToDb(db);
      if (commands.length > 0) {
        await savePendingCommandsToDb(db);
      }
      // Backwards-compatible single snapshot mirroring
      await db.execute({
        sql: `INSERT INTO StoreSetting (key, value, updatedAt)
              VALUES ('live_cart_snapshot', ?, CURRENT_TIMESTAMP)
              ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updatedAt = CURRENT_TIMESTAMP`,
        args: [JSON.stringify(fleetRegistry[terminalId])]
      });
    } catch {}

    const registersList = Object.keys(fleetRegistry).map((tid) => {
      const reg = fleetRegistry[tid];
      const diff = now - (reg.lastSeen || 0);
      return {
        ...reg,
        isOnline: diff < 35000,
        secondsSinceLastSeen: Math.floor(diff / 1000)
      };
    });

    return c.json({ success: true, updated: true, terminalId, commands, registers: registersList });
  } catch (err: any) {
    return c.json({ error: 'Failed to update live cart', details: err?.message }, 500);
  }
});

// 4. Remote Fleet Command Dispatcher (Drawer Kick, Remote Clear Cart, Lock Register)
hardwareRouter.post('/drawer-kick', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const rawTid = body.terminalId || body.terminal || c.req.query('terminalId') || 'T1';
    const terminalId = normalizeTerminalId(rawTid);
    const db = getDb(c.env);
    await loadFleetRegistryFromDb(db);

    const newCmd: PendingTerminalCommand = {
      id: `kick_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      terminalId,
      command: 'DRAWER_KICK',
      payload: body,
      timestamp: Date.now()
    };
    pendingCommands.push(newCmd);
    await savePendingCommandsToDb(db);

    return c.json({
      success: true,
      dispatched: true,
      terminalId,
      commandId: newCmd.id,
      message: `Cash drawer kick signal dispatched to terminal ${terminalId}`
    });
  } catch (err: any) {
    return c.json({ error: 'Drawer kick dispatch failed', details: err?.message }, 500);
  }
});

hardwareRouter.post('/register/command', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const rawTid = body.terminalId || body.terminal || c.req.query('terminalId');
    const terminalId = rawTid && String(rawTid).toUpperCase() !== 'ALL'
      ? normalizeTerminalId(rawTid)
      : 'ALL';
    const rawCmd = String(body.command || body.type || c.req.query('command') || '').trim().toUpperCase();
    if (!rawCmd) return c.json({ error: 'command required' }, 400);

    const cleanCmd = rawCmd.startsWith('REMOTE_') ? rawCmd.replace('REMOTE_', '') : rawCmd;
    const db = getDb(c.env);
    await loadFleetRegistryFromDb(db);

    const newCmd: PendingTerminalCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      terminalId,
      command: cleanCmd as any,
      payload: body.payload !== undefined ? body.payload : (body.command ? body : undefined),
      timestamp: Date.now()
    };
    pendingCommands.push(newCmd);
    await savePendingCommandsToDb(db);

    return c.json({
      success: true,
      dispatched: true,
      terminalId,
      command: cleanCmd,
      commandId: newCmd.id
    });
  } catch (err: any) {
    return c.json({ error: 'Command dispatch failed', details: err?.message }, 500);
  }
});

// 4B. Dedicated Network Print Relay (Billing on Laptop -> Instant Print on Sunmi)
hardwareRouter.post('/print', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const rawTid = body.terminalId || body.targetTerminal || c.req.query('terminalId') || 'T1';
    const terminalId = normalizeTerminalId(rawTid);
    const payload = body.payload || body;
    const db = getDb(c.env);
    await loadFleetRegistryFromDb(db);

    const jobId = body.jobId || `print_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newCmd: PendingTerminalCommand = {
      id: jobId,
      terminalId,
      command: 'PRINT_REQUEST',
      payload,
      timestamp: Date.now()
    };
    pendingCommands.push(newCmd);
    await savePendingCommandsToDb(db);

    return c.json({
      success: true,
      jobId,
      terminalId,
      message: `Print job enqueued for Sunmi Terminal ${terminalId}`
    });
  } catch (err: any) {
    return c.json({ error: 'Print dispatch failed', details: err?.message }, 500);
  }
});

hardwareRouter.get('/print/pending', async (c) => {
  const terminalId = normalizeTerminalId(c.req.query('terminalId') || 'T1');
  const db = getDb(c.env);
  await loadFleetRegistryFromDb(db);
  const commands = popCommandsForTerminal(terminalId);
  if (commands.length > 0) {
    await savePendingCommandsToDb(db);
  }
  const printJobs = commands.filter((c: any) => c.command === 'PRINT_REQUEST' || c.type === 'PRINT_REQUEST' || c.payload);
  return c.json({ success: true, terminalId, count: printJobs.length, jobs: printJobs, commands });
});

hardwareRouter.post('/print/complete', async (c) => {
  return c.json({ success: true });
});

hardwareRouter.get('/register/command', async (c) => {
  const terminalId = normalizeTerminalId(c.req.query('terminalId') || 'ALL');
  const db = getDb(c.env);
  await loadFleetRegistryFromDb(db);
  const commands = popCommandsForTerminal(terminalId);
  if (commands.length > 0) {
    await savePendingCommandsToDb(db);
  }
  return c.json({ success: true, terminalId, commands });
});

// 5. Automated Fawri+ / BenefitPay SMS & Push Notification Webhook Bridge
export interface ParsedFawriPayment {
  amount: number | null;
  referenceNumber: string;
  sender: string;
  account: string | null;
  rawMessage: string;
}

export function parseFawriPaymentMessage(rawText: string, meta: any = {}): ParsedFawriPayment {
  const text = String(rawText || '').trim();

  // 1. Explicit amount in metadata or body
  let amount: number | null = null;
  if (meta.amount !== undefined && meta.amount !== null && !isNaN(Number(meta.amount))) {
    amount = parseFloat(Number(meta.amount).toFixed(3));
  } else {
    // Regex matching BHD or BD amounts:
    // e.g. "BHD 1.500", "BD 0.050", "credited by BHD 2.500", "1.500 BHD", "1.500 BD", "credited with BHD 0.050"
    const amountRegexes = [
      /(?:BHD|BD|Dinar|credited\s+(?:by|with))\s*[:\s]*([\d]+\.?\d*)/i,
      /([\d]+\.?\d*)\s*(?:BHD|BD)/i,
      /(?:amount|amt)[:\s]*([\d]+\.?\d*)/i,
      /received\s*([\d]+\.?\d*)/i
    ];
    for (const regex of amountRegexes) {
      const match = text.match(regex);
      if (match && match[1]) {
        const val = parseFloat(match[1]);
        if (!isNaN(val) && val > 0) {
          amount = parseFloat(val.toFixed(3));
          break;
        }
      }
    }
  }

  // 2. Reference number extraction
  let referenceNumber = String(meta.referenceNumber || meta.reference || meta.ref || meta.txnId || meta.trxId || '').trim();
  if (!referenceNumber) {
    const refRegexes = [
      /(?:Ref|Trx|Txn|Reference|TxnID|RefNo|Sequence|Seq)[:\s#]*([A-Za-z0-9]+)/i,
      /(?:Fawri\+?\s*Ref)[:\s#]*([A-Za-z0-9]+)/i,
      /(?:ID)[:\s#]*([A-Za-z0-9]{6,})/i
    ];
    for (const regex of refRegexes) {
      const match = text.match(regex);
      if (match && match[1]) {
        referenceNumber = match[1].trim();
        break;
      }
    }
  }
  if (!referenceNumber) {
    const timestamp = Date.now().toString().slice(-6);
    const rand = Math.floor(1000 + Math.random() * 9000);
    referenceNumber = `FAWRI-${timestamp}-${rand}`;
  }

  // 3. Sender / Bank name
  let sender = String(meta.sender || meta.from || meta.bank || '').trim();
  if (!sender) {
    if (/SBI/i.test(text)) sender = 'State Bank of India (SBI)';
    else if (/BenefitPay/i.test(text)) sender = 'BenefitPay';
    else if (/BBK/i.test(text)) sender = 'BBK';
    else if (/NBB/i.test(text)) sender = 'NBB';
    else if (/Ila/i.test(text)) sender = 'Ila Bank';
    else if (/AUB|Ahli/i.test(text)) sender = 'Ahli United Bank';
    else sender = 'Fawri+ Bahrain';
  }

  // 4. Account match (if available e.g. "0001")
  let account: string | null = null;
  const acMatch = text.match(/(?:A\/C|Account|Acc|ending in)[:\s*]*([0-9]{4})/i);
  if (acMatch && acMatch[1]) {
    account = acMatch[1];
  }

  return {
    amount,
    referenceNumber,
    sender,
    account,
    rawMessage: text
  };
}

const handleBenefitWebhook = async (c: any) => {
  const db = getDb(c.env);
  await loadFleetRegistryFromDb(db);

  let body: any = {};
  let rawText = '';

  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('application/json')) {
    try { body = await c.req.json(); } catch {}
    rawText = body.message || body.text || body.body || body.content || body.sms || '';
  } else if (contentType.includes('application/x-www-form-urlencoded')) {
    try {
      const form = await c.req.parseBody();
      body = form;
      rawText = String(form.message || form.text || form.body || form.content || form.sms || '');
    } catch {}
  } else {
    try {
      rawText = await c.req.text();
    } catch {}
  }

  // Fallbacks to query params
  if (!rawText && c.req.query('message')) rawText = c.req.query('message') || '';
  if (!body.amount && c.req.query('amount')) body.amount = c.req.query('amount');
  if (!body.ref && c.req.query('ref')) body.ref = c.req.query('ref');
  if (!body.sender && c.req.query('sender')) body.sender = c.req.query('sender');

  const parsed = parseFawriPaymentMessage(rawText, body);

  if (parsed.amount === null || isNaN(parsed.amount) || parsed.amount <= 0) {
    return c.json({
      success: false,
      error: 'Could not extract valid BHD amount from payment notification.',
      parsed,
      rawReceived: rawText
    }, 400);
  }

  // Matching with active register cart in fleetRegistry
  const now = Date.now();
  let matchedTerminalId = 'T1'; // Default to Counter 1 (Sunmi D2 Mini)
  let matchedCart: any = null;

  // Search fleetRegistry for any online register with cart total matching parsed.amount
  for (const tid of ['T1', 'T2', 'T3', 'T4', 'M1', 'M2', ...Object.keys(fleetRegistry)]) {
    const reg = fleetRegistry[tid];
    if (!reg) continue;
    const diffTime = now - (reg.lastSeen || 0);
    // Consider active within 2 minutes
    if (diffTime < 120000 && reg.total && Math.abs(Number(reg.total) - parsed.amount) < 0.005) {
      matchedTerminalId = tid;
      matchedCart = reg;
      break;
    }
  }

  // If explicit terminal requested in body/query, respect it
  const explicitTid = c.req.query('terminalId') || body.terminalId || body.terminal;
  if (explicitTid) {
    matchedTerminalId = normalizeTerminalId(explicitTid);
  }

  // Queue remote BENEFIT_PAY_SUCCESS command for the terminal
  const commandId = `bp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const newCmd: PendingTerminalCommand = {
    id: commandId,
    terminalId: matchedTerminalId,
    command: 'BENEFIT_PAY_SUCCESS',
    amount: parsed.amount,
    referenceNumber: parsed.referenceNumber,
    payload: {
      amount: parsed.amount,
      referenceNumber: parsed.referenceNumber,
      sender: parsed.sender,
      account: parsed.account,
      invoiceNo: matchedCart?.activeCartId ? `CHECKOUT-${matchedCart.activeCartId}` : undefined,
      receivedAt: getRegionalIsoString()
    },
    timestamp: now
  };

  pendingCommands.push(newCmd);
  await savePendingCommandsToDb(db);

  // Store in database for audit trail & idempotency
  try {
    await db.execute({
      sql: `INSERT INTO StoreSetting (key, value, updatedAt)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updatedAt = CURRENT_TIMESTAMP`,
      args: [`benefit_webhook_${commandId}`, JSON.stringify({
        parsed,
        terminalId: matchedTerminalId,
        dispatchedAt: now
      })]
    });
  } catch {}

  return c.json({
    success: true,
    message: `Fawri+ payment of BHD ${parsed.amount.toFixed(3)} auto-dispatched to ${getFriendlyTerminalName(matchedTerminalId)}`,
    terminalId: matchedTerminalId,
    amount: parsed.amount,
    referenceNumber: parsed.referenceNumber,
    sender: parsed.sender,
    commandId
  });
};

hardwareRouter.post('/benefit/webhook', handleBenefitWebhook);
hardwareRouter.get('/benefit/webhook', handleBenefitWebhook);


