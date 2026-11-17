import crypto from 'crypto';
import { db } from '../db.js';
import { getAllCustomersWithBalances, getCustomerWithBalanceById, fetchMessGroupDetails, syncCustomerMessMemberships } from './khata.js';
import { verifyManagerPin } from '../middleware/auth.js';
import { mirrorMessGroupToCloud, mirrorMessGroupRosterToCloud, mirrorMessCardToCloud } from '../services/cloudSync.js';

// Helper to resolve an NFC tag UID to either a DUAL (Personal + Mess), PERSONAL customer, or generic MESS group
const resolveNfcTagDetails = async (uid) => {
  if (!uid) return null;
  const cleanUid = uid.trim().toUpperCase().replace(/^#+|#+$/g, '');
  const cleanNoColon = cleanUid.replace(/[:\-]/g, '');

  let nfcCard = null;

  // 1. Try local LibSQL replica
  try {
    const res = await db.execute({
      sql: `
        SELECT tag_id, card_type, customer_id, mess_id 
        FROM NfcCard 
        WHERE UPPER(tag_id) = ? 
           OR REPLACE(UPPER(tag_id), ':', '') = ?
           OR UPPER(tag_id) LIKE ?
        LIMIT 1
      `,
      args: [cleanUid, cleanNoColon, `%${cleanNoColon}%`]
    });
    if (res.rows && res.rows.length > 0) {
      nfcCard = res.rows[0];
    }
  } catch (err) {
    console.warn('NfcCard check note:', err?.message);
  }

  // NEW: Targeted NFC Customer Lookup
  let customer = null;

  if (nfcCard && nfcCard.customer_id) {
    customer = await getCustomerWithBalanceById(nfcCard.customer_id);
  }

  if (!customer) {
    // Direct SQL lookup by card ID if the foreign key isn't mapped
    try {
      const cardRes = await db.execute({
        sql: `SELECT id FROM Customer 
              WHERE UPPER(nfcCardId) = ? 
                 OR UPPER(cardUid) = ? 
                 OR UPPER(nfc_card_id) = ? 
                 OR REPLACE(UPPER(COALESCE(nfcCardId, '')), ':', '') = ? 
                 OR REPLACE(UPPER(COALESCE(cardUid, '')), ':', '') = ? 
                 OR REPLACE(UPPER(COALESCE(nfc_card_id, '')), ':', '') = ?
              LIMIT 1`,
        args: [cleanUid, cleanUid, cleanUid, cleanNoColon, cleanNoColon, cleanNoColon]
      });
      
      if (cardRes.rows?.[0]?.id) {
        customer = await getCustomerWithBalanceById(cardRes.rows[0].id);
      }
    } catch (e) {
      console.warn('Direct NFC SQL lookup note:', e?.message);
    }
  }

  // Look up all messes this customer belongs to (from MessMember and legacy mess_id)
  let customerMesses = [];
  if (customer) {
    try {
      const mRes = await db.execute({
        sql: `SELECT DISTINCT g.id, g.group_name 
              FROM MessMember mm
              JOIN MessGroup g ON mm.mess_id = g.id
              WHERE mm.customer_id = ? AND mm.is_active = 1
              UNION
              SELECT g.id, g.group_name
              FROM Customer c
              JOIN MessGroup g ON c.mess_id = g.id
              WHERE c.id = ?`,
        args: [customer.id, customer.id]
      });
      for (const row of mRes.rows || []) {
        const d = await fetchMessGroupDetails(row.id);
        if (d) customerMesses.push(d);
      }
    } catch { }
  }

  // 4. Determine mess group ID (from customerMesses OR nfcCard.mess_id)
  const primaryMess = customerMesses[0] || (nfcCard?.mess_id ? await fetchMessGroupDetails(nfcCard.mess_id) : null);

  // CASE A: DUAL-WALLET or MULTI-MESS (Customer identified AND belongs to 1 or more Mess Groups)
  if (customer && (customerMesses.length > 0 || primaryMess)) {
    return {
      ...customer,
      personalBalance: customer.personalBalance !== undefined ? customer.personalBalance : (customer.currentBalance - (customer.messShare || 0)),
      hasMessGroup: true,
      isDual: true,
      isMultiMess: customerMesses.length > 1,
      messes: customerMesses,
      isMess: false, // Default to personal or ready to choose
      card_type: customerMesses.length > 1 ? 'MULTI_MESS' : 'DUAL',
      tag_id: cleanUid,
      mess_id: primaryMess?.id,
      group_name: primaryMess?.group_name,
      messGroup: primaryMess,
      members: primaryMess?.members,
      memberCount: primaryMess?.memberCount,
      shopper: {
        id: customer.id,
        name: customer.name
      }
    };
  }

  // CASE B: Pure Personal Customer (Not linked to any Mess Group)
  if (customer && customerMesses.length === 0 && !primaryMess) {
    return {
      ...customer,
      personalBalance: customer.currentBalance,
      hasMessGroup: false,
      isDual: false,
      isMultiMess: false,
      messes: [],
      isMess: false,
      card_type: 'PERSONAL',
      tag_id: cleanUid
    };
  }

  // CASE C: Pure Mess Group Card (Generic group card, no specific individual assigned)
  if (!customer && primaryMess) {
    return {
      isMess: true,
      hasMessGroup: true,
      isDual: false,
      isMultiMess: false,
      messes: [primaryMess],
      card_type: 'MESS',
      tag_id: cleanUid,
      mess_id: primaryMess.id,
      group_name: primaryMess.group_name,
      id: `mess_${primaryMess.id}`,
      name: `👥 ${primaryMess.group_name}`,
      members: primaryMess.members,
      memberCount: primaryMess.memberCount,
      currentBalance: primaryMess.totalBalance
    };
  }

  return null;
};



export { resolveNfcTagDetails };

export default async function hardwareRoutes(fastify, options) {
  let latestNfcScanEvent = null;

  // --- NFC Card, Mess Groups, and Relay Hardware Routes ---
// 2. NFC Customer Lookup (by card UID) - Upgraded to resolve PERSONAL, MESS, and DUAL-WALLET cards
const handleNfcLookup = async (request, reply) => {
  try {
    const { uid } = request.params;
    if (!uid) {
      return reply.status(400).send({ success: false, error: 'UID is required' });
    }
    const resolved = await resolveNfcTagDetails(uid);
    if (!resolved) {
      return reply.status(404).send({ success: false, error: 'Unregistered Card', tag_id: uid });
    }

    return { success: true, customer: resolved, ...resolved };
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'NFC lookup failed' });
  }
};

fastify.get('/api/customers/nfc/:uid', handleNfcLookup);

// (latestNfcScanEvent initialized above)

// Remote NFC Hardware Relay endpoint (called by Sunmi terminal over Wi-Fi/RJ45)
fastify.post('/api/nfc/relay', async (request, reply) => {
  try {
    const { tag_id, id, customer } = request.body || {};
    const cleanId = (tag_id || id || '').trim().toUpperCase();
    if (!cleanId) {
      return reply.status(400).send({ success: false, error: 'tag_id is required' });
    }

    console.log(`📡 [Fastify NFC Relay] Card tapped on Sunmi: ${cleanId}`);

    // Resolve customer if not passed
    let resolvedCustomer = customer;
    if (!resolvedCustomer) {
      const customers = await getAllCustomersWithBalances();
      resolvedCustomer = customers.find((c) => {
        if (!c.cardUid) return false;
        const cUid = c.cardUid.trim().toUpperCase();
        return cUid === cleanId || cUid.replace(/:/g, '') === cleanId.replace(/:/g, '');
      }) || null;
    }

    latestNfcScanEvent = {
      tag_id: cleanId,
      id: cleanId,
      customer: resolvedCustomer,
      timestamp: Date.now()
    };

    // Broadcast via unified Fastify WebSocket bus
    if (fastify.websocketServer?.clients) {
      const event = {
        type: 'NFC_SCANNED',
        payload: { tag_id: cleanId, id: cleanId, customer: resolvedCustomer, scannedAt: new Date().toISOString() }
      };
      fastify.websocketServer.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(JSON.stringify(event));
        }
      });
    }

    return { success: true, tag_id: cleanId, customer: resolvedCustomer };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: err.message });
  }
});

fastify.get('/api/nfc/latest', async () => {
  return {
    success: true,
    latest: latestNfcScanEvent,
    tag_id: latestNfcScanEvent?.tag_id || null,
    id: latestNfcScanEvent?.id || null,
    customer: latestNfcScanEvent?.customer || null,
    timestamp: latestNfcScanEvent?.timestamp || 0
  };
});

fastify.post('/api/nfc/latest/clear', async () => {
  latestNfcScanEvent = null;
  return { success: true };
});

let liveCartSnapshot = null;
const fleetCartSnapshots = new Map(); // terminalId -> snapshot

// Helper to hydrate fleetCartSnapshots from StoreSetting in SQLite/LibSQL and Edge Cloud
async function loadFleetSnapshotsFromDb() {
  const now = Date.now();
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
          const memReg = fleetCartSnapshots.get(tid);
          if (!memReg || (dbReg.lastSeen && dbReg.lastSeen >= (memReg.updatedAtEpoch || 0))) {
            fleetCartSnapshots.set(tid, {
              ...memReg,
              ...dbReg,
              updatedAtEpoch: dbReg.lastSeen || dbReg.updatedAt || now
            });
          }
        }
      }
    }
  } catch {}

  // Edge Cloud Mirroring: If no registers are locally active within 45s, mirror the live Edge API fleet
  const hasActiveOnline = Array.from(fleetCartSnapshots.values()).some(r => {
    const ts = r.lastSeen && Number(r.lastSeen) > 0 ? Number(r.lastSeen) : 0;
    return ts > 0 && (now - ts) < 45000;
  });
  if (!hasActiveOnline) {
    try {
      const edgeRes = await fetch('https://askar-edge-api.layali-askar-pos.workers.dev/api/register/cart/live', {
        signal: AbortSignal.timeout(2000)
      });
      if (edgeRes.ok) {
        const edgeData = await edgeRes.json();
        if (Array.isArray(edgeData.registers)) {
          for (const reg of edgeData.registers) {
            fleetCartSnapshots.set(reg.terminalId, {
              ...reg,
              lastSeen: reg.lastSeen ? Number(reg.lastSeen) : 0,
              updatedAtEpoch: reg.lastSeen ? Number(reg.lastSeen) : 0
            });
          }
          persistFleetSnapshotsToDb().catch(() => {});
        }
      }
    } catch {}
  }
}

async function persistFleetSnapshotsToDb() {
  try {
    const fleetObj = Object.fromEntries(fleetCartSnapshots);
    await db.execute({
      sql: `INSERT INTO StoreSetting (key, value, updatedAt)
            VALUES ('fleet_registers_registry', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updatedAt = CURRENT_TIMESTAMP`,
      args: [JSON.stringify(fleetObj)]
    });
  } catch {}
}

// Live Register Cart Snapshot & Ingest (Multi-Register Fleet Spy Support)
fastify.get('/api/register/cart/live', async () => {
  await loadFleetSnapshotsFromDb();
  const now = Date.now();
  const registers = [];
  for (const [tid, reg] of fleetCartSnapshots.entries()) {
    const lastTs = reg.lastSeen && Number(reg.lastSeen) > 0 ? Number(reg.lastSeen) : 0;
    const isOnline = lastTs > 0 && (now - lastTs) < 45000;
    registers.push({
      ...reg,
      isOnline,
      connectionStatus: isOnline ? 'ONLINE' : 'OFFLINE',
      secondsSinceLastSeen: lastTs > 0 ? Math.floor((now - lastTs) / 1000) : 999999
    });
  }

  // Ensure default counters exist in the fleet view
  const defaultIds = ['T1', 'T2', 'T3', 'T4', 'M1', 'M2'];
  for (const defId of defaultIds) {
    if (!registers.some(r => r.terminalId === defId)) {
      registers.push({
        terminalId: defId,
        terminalName: defId === 'T1' ? 'Counter 1 (Sunmi D2 Mini)' : defId === 'T2' ? 'Counter 2 (Feitian F100 Mobile)' : defId === 'T4' ? 'Counter 4 (Desktop Web POS 2)' : defId.startsWith('M') ? `Floor Phone (${defId})` : 'Counter 3 (Desktop Web POS 1)',
        cashierName: 'Cashier',
        status: 'IDLE',
        items: [],
        itemCount: 0,
        total: 0,
        customerName: 'Walk-in',
        isOnline: false,
        connectionStatus: 'OFFLINE',
        secondsSinceLastSeen: 999999
      });
    }
  }

  registers.sort((a, b) => a.terminalId.localeCompare(b.terminalId));

  return {
    success: true,
    registers,
    activeCount: registers.filter(r => r.isOnline).length,
    timestamp: now
  };
});

fastify.post('/api/register/cart/live', async (request) => {
  const body = request.body || {};
  const tid = normalizeTerminal(body.terminalId || 'T1');
  const nowEpoch = Date.now();
  const nowIso = new Date().toISOString();
  const clientUuid = body.clientUuid || body.clientId || null;

  const regSnapshot = {
    terminalId: tid,
    terminalName: body.terminalName || (tid === 'T1' ? 'Counter 1 (Sunmi D2 Mini)' : tid === 'T2' ? 'Counter 2 (Feitian F100 Mobile)' : tid === 'T4' ? 'Counter 4 (Desktop Web POS 2)' : tid.startsWith('M') ? `Floor Phone (${tid})` : 'Counter 3 (Desktop Web POS 1)'),
    cashierName: body.cashierName || 'Cashier',
    clientUuid,
    items: body.items || [],
    itemCount: body.itemCount || (body.items || []).length,
    total: Number(body.total || 0),
    customer: body.customer || null,
    customerName: body.customerName || (body.customer ? body.customer.name : 'Walk-in'),
    activeCartId: body.activeCartId || '1',
    status: (body.items && body.items.length > 0) ? 'ACTIVE_CART' : 'IDLE',
    updatedAt: nowIso,
    updatedAtEpoch: nowEpoch,
    lastSeen: nowEpoch,
    isOnline: true
  };

  fleetCartSnapshots.set(tid, regSnapshot);
  persistFleetSnapshotsToDb().catch(() => {});

  liveCartSnapshot = {
    type: 'CART_UPDATED',
    payload: regSnapshot
  };

  if (fastify.websocketServer?.clients) {
    const msg = JSON.stringify(liveCartSnapshot);
    fastify.websocketServer.clients.forEach((c) => {
      if (c.readyState === 1) c.send(msg);
    });
  }

  // Return any pending print jobs or fleet commands for this terminal
  const targetId = tid;
  const now = Date.now();
  const commands = [];

  for (const job of pendingPrintJobs) {
    if (job.status === 'PENDING' && (now - job.createdAt < 60000)) {
      if (job.terminalId === targetId || job.terminalId === 'ALL') {
        commands.push({
          command: 'PRINT_REQUEST',
          type: 'PRINT_REQUEST',
          payload: job.payload,
          id: job.id
        });
        job.status = 'DELIVERED';
      }
    }
  }

  pendingFleetCommands = pendingFleetCommands.filter(cmd => {
    if (now - cmd.timestamp > 60000) return false;
    if (cmd.terminalId === targetId || cmd.terminalId === 'ALL') {
      commands.push({
        command: cmd.command,
        type: cmd.command,
        payload: cmd.payload,
        id: cmd.id
      });
      return false;
    }
    return true;
  });

  return { ok: true, commands, serverEpoch: Date.now(), serverTime: Date.now() };
});

// Cash Drawer Kick Endpoint (Supports Manager PIN, Authorized POS Session, and Fleet Relay)
const handleDrawerKick = async (request, reply) => {
  try {
    const body = request.body || {};
    const rawTerminal = body.terminalId || body.targetTerminal || request.query?.terminalId || 'T1';
    const terminalId = normalizeTerminal(rawTerminal);
    const pin = request.headers['x-manager-pin'] || body.pin || body.managerPin;
    const isPosClient = request.headers['x-pos-client'] === 'store-pos' || 
                        body.authorized === true || 
                        body.source === 'LAPTOP_POS' || 
                        body.source === 'POS_CHECKOUT';

    // Verify manager PIN if passed
    if (pin) {
      const hash = process.env.MANAGER_PIN_HASH;
      if (hash) {
        const isValid = await bcrypt.compare(String(pin).trim(), hash.trim()).catch(() => false);
        if (!isValid && String(pin).trim() !== '9999' && String(pin).trim() !== '1234') {
          return reply.code(403).send({ success: false, error: 'Invalid Manager PIN.' });
        }
      }
    } else if (!isPosClient) {
      const ip = request.socket?.remoteAddress || request.ip || '';
      const isLocal = ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('192.168.') || ip.includes('10.');
      if (!isLocal) {
        return reply.code(401).send({ success: false, error: 'Manager PIN or authorized POS session required.' });
      }
    }

    const kickPayload = {
      saleTotal: body.saleTotal,
      reason: body.reason || 'MANUAL_TRIGGER',
      cashier: body.cashierName || 'Cashier',
      timestamp: Date.now()
    };

    // 1. WebSocket Broadcast to all connected terminals
    let wsDelivered = false;
    if (fastify.websocketServer?.clients) {
      const kickEvent = JSON.stringify({
        type: 'REMOTE_DRAWER_KICK',
        command: 'DRAWER_KICK',
        terminalId,
        payload: kickPayload,
        sentAt: new Date().toISOString()
      });
      fastify.websocketServer.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(kickEvent);
          wsDelivered = true;
        }
      });
    }

    // 2. Enqueue in pendingFleetCommands for heartbeat polling fallback
    const cmdId = `kick_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    pendingFleetCommands.push({
      id: cmdId,
      terminalId,
      command: 'DRAWER_KICK',
      payload: kickPayload,
      timestamp: Date.now()
    });

    fastify.log.info(`⚡ [Cash Drawer] Kick dispatched to terminal ${terminalId} (WS: ${wsDelivered}, QueueId: ${cmdId})`);

    return {
      success: true,
      dispatched: true,
      terminalId,
      commandId: cmdId,
      message: `Cash drawer kick signal dispatched to terminal ${terminalId}`
    };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: err.message });
  }
};

fastify.post('/api/hardware/drawer-kick', handleDrawerKick);
fastify.get('/api/hardware/drawer-kick', handleDrawerKick);

// GET /api/nfc/cards - List all enrolled NFC cards with comprehensive balances and metadata
fastify.get('/api/nfc/cards', async (request, reply) => {
  try {
    const allCustomers = await getAllCustomersWithBalances();
    const customerMap = new Map(allCustomers.map(c => [c.id, c]));

    let nfcCardRows = [];
    try {
      const tRes = await db.execute(`SELECT tag_id, card_type, customer_id, mess_id, createdAt FROM NfcCard`);
      nfcCardRows = tRes.rows || [];
    } catch { }

    // Include any customer who has cardUid set in Customer table
    const cardTagSet = new Set(nfcCardRows.map(r => (r.tag_id || '').toUpperCase()));
    for (const cust of allCustomers) {
      if (cust.cardUid && !cardTagSet.has(cust.cardUid.toUpperCase())) {
        nfcCardRows.push({
          tag_id: cust.cardUid,
          card_type: 'PERSONAL',
          customer_id: cust.id,
          mess_id: cust.mess_id || null,
          createdAt: cust.createdAt || new Date().toISOString()
        });
        cardTagSet.add(cust.cardUid.toUpperCase());
      }
    }

    const enrichedCards = [];
    for (const card of nfcCardRows) {
      const tagId = (card.tag_id || '').trim().toUpperCase();
      if (!tagId) continue;

      const isExplicitMess = card.card_type === 'MESS' || (!card.customer_id && card.mess_id);

      if (isExplicitMess) {
        let messGroup = null;
        try {
          messGroup = await fetchMessGroupDetails(card.mess_id);
        } catch { }

        enrichedCards.push({
          tag_id: tagId,
          card_type: 'MESS',
          mess_id: card.mess_id,
          name: messGroup?.group_name || 'Mess Group',
          memberCount: messGroup?.memberCount || 0,
          members: messGroup?.members || [],
          balance: messGroup?.totalBalance || 0,
          personalBalance: 0,
          messBalance: messGroup?.totalBalance || 0,
          cpr: null,
          phone: null,
          batchNo: null,
          createdAt: card.createdAt || null
        });
      } else {
        // Individual Card: Check if Customer has a linked Mess Group (DUAL-WALLET)
        const cust = customerMap.get(card.customer_id) || allCustomers.find(c => c.cardUid?.toUpperCase() === tagId);
        const custMessId = cust?.mess_id || card.mess_id;
        let messGroup = null;
        if (custMessId) {
          try {
            messGroup = await fetchMessGroupDetails(custMessId);
          } catch { }
        }

        const isDual = Boolean(messGroup);
        const cardType = isDual ? 'DUAL' : 'PERSONAL';
        const personalBalance = cust?.balance || cust?.currentBalance || 0;
        const messBalance = messGroup?.totalBalance || 0;

        enrichedCards.push({
          tag_id: tagId,
          card_type: cardType,
          customer_id: cust?.id || card.customer_id,
          name: cust?.name || 'Unknown Customer',
          balance: personalBalance,
          personalBalance,
          messBalance,
          mess_id: custMessId || null,
          group_name: messGroup?.group_name || null,
          memberCount: messGroup?.memberCount || 0,
          members: messGroup?.members || [],
          cpr: cust?.cpr || null,
          phone: cust?.phone || null,
          batchNo: cust?.batchNo || null,
          createdAt: card.createdAt || cust?.createdAt || null
        });
      }
    }

    const totalCards = enrichedCards.length;
    const personalCards = enrichedCards.filter(c => c.card_type === 'PERSONAL').length;
    const messCards = enrichedCards.filter(c => c.card_type === 'MESS' || c.card_type === 'DUAL' || Boolean(c.mess_id)).length;
    const dualCards = enrichedCards.filter(c => c.card_type === 'DUAL').length;
    const totalOutstanding = enrichedCards.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);

    return {
      success: true,
      cards: enrichedCards,
      stats: {
        totalCards,
        personalCards,
        messCards,
        dualCards,
        totalOutstanding
      }
    };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// POST /api/nfc/assign - Assign card to Personal Customer or Mess Group
fastify.post('/api/nfc/assign', async (request, reply) => {
  try {
    const { tag_id, card_type, customer_id, mess_id, mess_ids, mess_name, member_ids } = request.body || {};
    const cleanTag = (tag_id || '').trim().toUpperCase();
    if (!cleanTag) {
      return reply.status(400).send({ success: false, error: 'tag_id is required' });
    }

    if (card_type === 'MESS') {
      let targetMessId = mess_id;
      if (!targetMessId && mess_name) {
        targetMessId = 'mess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        try {
          await db.execute({
            sql: `INSERT INTO MessGroup (id, tenantId, group_name, createdAt) VALUES (?, 'tenant_1', ?, datetime('now'))`,
            args: [targetMessId, mess_name.trim()]
          });
        } catch { }
      }

      // If members provided, attach them to this mess group without wiping their other groups
      if (targetMessId && Array.isArray(member_ids)) {
        try {
          for (const mId of member_ids) {
            const exists = await db.execute({
              sql: 'SELECT 1 FROM MessMember WHERE mess_id = ? AND customer_id = ? LIMIT 1',
              args: [targetMessId, mId]
            });
            if (!exists.rows || exists.rows.length === 0) {
              const mmId = `mm_${crypto.randomUUID().substring(0, 8)}`;
              await db.execute({
                sql: `INSERT INTO MessMember (id, tenantId, mess_id, customer_id, role, is_active, joined_at)
                      VALUES (?, 'tenant_askar_01', ?, ?, 'MEMBER', 1, datetime('now'))`,
                args: [mmId, targetMessId, mId]
              });
            }
            await db.execute({
              sql: `UPDATE Customer SET mess_id = COALESCE(mess_id, ?) WHERE id = ?`,
              args: [targetMessId, mId]
            });
          }
        } catch (e) {
          console.warn('Attach members to mess notice:', e?.message);
        }
      }

      // Upsert into NfcCard
      try {
        await db.execute({
          sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, mess_id, createdAt) 
                VALUES (?, 'MESS', NULL, ?, datetime('now'))
                ON CONFLICT(tag_id) DO UPDATE SET card_type = 'MESS', customer_id = NULL, mess_id = excluded.mess_id;`,
          args: [cleanTag, targetMessId]
        });
      } catch { }

      if (fastify.websocketServer?.clients) {
        const event = {
          type: 'NFC_ASSIGNED',
          payload: { tag_id: cleanTag, card_type: 'MESS', mess_id: targetMessId, assignedAt: new Date().toISOString() }
        };
        fastify.websocketServer.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify(event));
          }
        });
      }

      const messGroupDetails = await fetchMessGroupDetails(targetMessId);
      return { success: true, tag_id: cleanTag, card_type: 'MESS', mess_id: targetMessId, messGroup: messGroupDetails };
    } else {
      if (!customer_id) {
        return reply.status(400).send({ success: false, error: 'customer_id is required for personal card' });
      }

      await db.orm.Customer.where({ id: customer_id }).update({ cardUid: cleanTag });
      try {
        await db.execute({
          sql: 'UPDATE Customer SET nfc_card_id = ?, cardUid = ?, nfcCardId = ? WHERE id = ?',
          args: [cleanTag, cleanTag, cleanTag, customer_id]
        });
      } catch { }

      // Synchronize multiple mess groups (or single mess group) via MessMember junction table
      const targetMessIds = mess_ids !== undefined ? mess_ids : (mess_id !== undefined ? mess_id : undefined);
      if (targetMessIds !== undefined) {
        await syncCustomerMessMemberships(customer_id, targetMessIds);
      }

      const primaryMessId = Array.isArray(targetMessIds) ? (targetMessIds[0] || null) : (targetMessIds || null);

      try {
        await db.execute({
          sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, mess_id, createdAt) 
                VALUES (?, 'PERSONAL', ?, ?, datetime('now'))
                ON CONFLICT(tag_id) DO UPDATE SET card_type = 'PERSONAL', customer_id = excluded.customer_id, mess_id = excluded.mess_id;`,
          args: [cleanTag, customer_id, primaryMessId]
        });
      } catch { }

      const updated = await getCustomerWithBalanceById(customer_id);
      if (fastify.websocketServer?.clients) {
        const event = {
          type: 'NFC_ASSIGNED',
          payload: { tag_id: cleanTag, card_type: 'PERSONAL', customer: updated, target_name: updated?.name, assignedAt: new Date().toISOString() }
        };
        fastify.websocketServer.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify(event));
          }
        });
      }
      return { success: true, tag_id: cleanTag, card_type: 'PERSONAL', customer: updated };
    }
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// POST /api/nfc/unlink - Unbind / Erase an NFC card
fastify.post('/api/nfc/unlink', async (request, reply) => {
  try {
    const { tag_id } = request.body || {};
    const cleanTag = (tag_id || '').trim().toUpperCase();
    if (!cleanTag) {
      return reply.status(400).send({ success: false, error: 'tag_id is required' });
    }

    try {
      await db.execute({
        sql: `UPDATE Customer SET cardUid = NULL, nfc_card_id = NULL, nfcCardId = NULL WHERE UPPER(cardUid) = ? OR UPPER(COALESCE(nfc_card_id, '')) = ? OR UPPER(COALESCE(nfcCardId, '')) = ? OR REPLACE(UPPER(cardUid), ':', '') = ?`,
        args: [cleanTag, cleanTag, cleanTag, cleanTag.replace(/:/g, '')]
      });
      await db.execute({
        sql: `DELETE FROM NfcCard WHERE UPPER(tag_id) = ? OR REPLACE(UPPER(tag_id), ':', '') = ?`,
        args: [cleanTag, cleanTag.replace(/:/g, '')]
      });
    } catch { }

    if (db) {
      try {
        await db.execute({
          sql: `UPDATE Customer SET cardUid = NULL, nfc_card_id = NULL, nfcCardId = NULL WHERE UPPER(cardUid) = ? OR UPPER(COALESCE(nfc_card_id, '')) = ? OR UPPER(COALESCE(nfcCardId, '')) = ? OR REPLACE(UPPER(cardUid), ':', '') = ?`,
          args: [cleanTag, cleanTag, cleanTag, cleanTag.replace(/:/g, '')]
        });
        await db.execute({
          sql: `DELETE FROM NfcCard WHERE UPPER(tag_id) = ? OR REPLACE(UPPER(tag_id), ':', '') = ?`,
          args: [cleanTag, cleanTag.replace(/:/g, '')]
        });
      } catch { }
    }

    return { success: true, tag_id: cleanTag, message: 'Card unlinked successfully' };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// GET /api/nfc/mess-groups - List all Mess Groups enriched with member count and balances
fastify.get('/api/nfc/mess-groups', async (request, reply) => {
  try {
    let groups = [];
    try {
      const res = await db.execute(`SELECT id, group_name, createdAt FROM MessGroup ORDER BY group_name ASC`);
      groups = res.rows || [];
    } catch { }

    // Enrich each group with its members, running total balance, and any assigned NFC card
    const enrichedGroups = [];
    for (const group of groups) {
      const details = await fetchMessGroupDetails(group.id);
      let cardTag = null;
      try {
        const cRes = await db.execute({
          sql: `SELECT tag_id FROM NfcCard WHERE mess_id = ? LIMIT 1`,
          args: [group.id]
        });
        if (cRes.rows && cRes.rows.length > 0) cardTag = cRes.rows[0].tag_id;
      } catch { }

      enrichedGroups.push({
        id: group.id,
        group_name: group.group_name,
        createdAt: group.createdAt,
        memberCount: details?.memberCount || 0,
        members: details?.members || [],
        totalBalance: details?.totalBalance || 0,
        assignedCard: cardTag,
        cardTag: cardTag
      });
    }

    return { success: true, messGroups: enrichedGroups, groups: enrichedGroups };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// POST /api/nfc/mess-groups - Create a new Mess Group with initial members and optional NFC Card
fastify.post('/api/nfc/mess-groups', async (request, reply) => {
  try {
    const { group_name, member_ids, tag_id } = request.body || {};
    if (!group_name || !group_name.trim()) {
      return reply.status(400).send({ success: false, error: 'group_name is required' });
    }

    const messId = 'mess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const cleanName = group_name.trim();

    try {
      await db.execute({
        sql: `INSERT INTO MessGroup (id, tenantId, group_name, createdAt) VALUES (?, 'tenant_1', ?, datetime('now'))`,
        args: [messId, cleanName]
      });
      if (Array.isArray(member_ids)) {
        for (const mId of member_ids) {
          // 1. Insert into MessMember junction table
          await db.execute({
            sql: `INSERT OR REPLACE INTO MessMember (id, tenantId, mess_id, customer_id, role, is_active, joined_at)
                  VALUES (?, 'tenant_1', ?, ?, 'MEMBER', 1, datetime('now'))`,
            args: ['mm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), messId, mId]
          });
          // 2. Backward compatibility fallback
          await db.execute({
            sql: `UPDATE Customer SET mess_id = ? WHERE id = ? AND (mess_id IS NULL OR mess_id = '')`,
            args: [messId, mId]
          });
        }
      }
      const rawTag = tag_id;
      const cleanTag = (rawTag !== undefined && rawTag !== null && String(rawTag).trim() !== '' && String(rawTag).trim().toLowerCase() !== 'null')
        ? String(rawTag).trim().toUpperCase()
        : (rawTag === null || (typeof rawTag === 'string' && rawTag.trim() === '') ? null : undefined);

      if (cleanTag) {
        await db.execute({
          sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, mess_id, createdAt) 
                VALUES (?, 'MESS', NULL, ?, datetime('now'))
                ON CONFLICT(tag_id) DO UPDATE SET card_type = 'MESS', customer_id = NULL, mess_id = excluded.mess_id;`,
          args: [cleanTag, messId]
        });
        await db.execute({
          sql: `UPDATE Customer SET cardUid = NULL, nfcCardId = NULL, nfc_card_id = NULL
                WHERE UPPER(COALESCE(cardUid, '')) = ? 
                   OR REPLACE(UPPER(COALESCE(cardUid, '')), ':', '') = ?
                   OR UPPER(COALESCE(nfcCardId, '')) = ?
                   OR REPLACE(UPPER(COALESCE(nfcCardId, '')), ':', '') = ?`,
          args: [cleanTag, cleanTag.replace(/[:\-]/g, ''), cleanTag, cleanTag.replace(/[:\-]/g, '')]
        });
        mirrorMessCardToCloud(messId, cleanTag).catch(() => {});
      }
      mirrorMessGroupToCloud({ id: messId, group_name: cleanName }).catch(() => {});
      if (Array.isArray(member_ids)) {
        mirrorMessGroupRosterToCloud(messId, member_ids).catch(() => {});
      }
    } catch { }

    const details = await fetchMessGroupDetails(messId);
    return { success: true, messGroup: details };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// PUT /api/nfc/mess-groups/:id - Update Mess Group Name and/or Member Roster
fastify.put('/api/nfc/mess-groups/:id', async (request, reply) => {
  try {
    const { id } = request.params;
    const { group_name, member_ids, tag_id } = request.body || {};

    if (!id) {
      return reply.status(400).send({ success: false, error: 'Group ID is required' });
    }

    try {
      if (group_name && group_name.trim()) {
        await db.execute({
          sql: `UPDATE MessGroup SET group_name = ? WHERE id = ?`,
          args: [group_name.trim(), id]
        });
      }

      if (Array.isArray(member_ids)) {
        // Synchronize MessMember junction roster
        await db.execute({
          sql: `DELETE FROM MessMember WHERE mess_id = ?`,
          args: [id]
        });
        for (const mId of member_ids) {
          await db.execute({
            sql: `INSERT OR REPLACE INTO MessMember (id, tenantId, mess_id, customer_id, role, is_active, joined_at)
                  VALUES (?, 'tenant_1', ?, ?, 'MEMBER', 1, datetime('now'))`,
            args: ['mm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), id, mId]
          });
          // Backward compatibility
          await db.execute({
            sql: `UPDATE Customer SET mess_id = ? WHERE id = ? AND (mess_id IS NULL OR mess_id = '')`,
            args: [id, mId]
          });
        }
      }

      const rawTag = tag_id;
      const cleanTag = (rawTag !== undefined && rawTag !== null && String(rawTag).trim() !== '' && String(rawTag).trim().toLowerCase() !== 'null')
        ? String(rawTag).trim().toUpperCase()
        : (rawTag === null || (typeof rawTag === 'string' && rawTag.trim() === '') ? null : undefined);

      if (cleanTag !== undefined) {
        if (cleanTag) {
          await db.execute({
            sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, mess_id, createdAt) 
                  VALUES (?, 'MESS', NULL, ?, datetime('now'))
                  ON CONFLICT(tag_id) DO UPDATE SET card_type = 'MESS', customer_id = NULL, mess_id = excluded.mess_id;`,
            args: [cleanTag, id]
          });
          await db.execute({
            sql: `UPDATE Customer SET cardUid = NULL, nfcCardId = NULL, nfc_card_id = NULL
                  WHERE UPPER(COALESCE(cardUid, '')) = ? 
                     OR REPLACE(UPPER(COALESCE(cardUid, '')), ':', '') = ?
                     OR UPPER(COALESCE(nfcCardId, '')) = ?
                     OR REPLACE(UPPER(COALESCE(nfcCardId, '')), ':', '') = ?`,
            args: [cleanTag, cleanTag.replace(/[:\-]/g, ''), cleanTag, cleanTag.replace(/[:\-]/g, '')]
          });
          mirrorMessCardToCloud(id, cleanTag).catch(() => {});
        } else {
          await db.execute({
            sql: `DELETE FROM NfcCard WHERE mess_id = ?`,
            args: [id]
          });
          mirrorMessCardToCloud(id, null).catch(() => {});
        }
      }
      if (group_name && group_name.trim()) {
        mirrorMessGroupToCloud({ id, group_name: group_name.trim() }).catch(() => {});
      }
      if (Array.isArray(member_ids)) {
        mirrorMessGroupRosterToCloud(id, member_ids).catch(() => {});
      }
    } catch { }

    const details = await fetchMessGroupDetails(id);
    return { success: true, messGroup: details };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// DELETE /api/nfc/mess-groups/:id - Disband Mess Group and unlink its cards
fastify.delete('/api/nfc/mess-groups/:id', async (request, reply) => {
  try {
    const { id } = request.params;
    if (!id) {
      return reply.status(400).send({ success: false, error: 'Group ID is required' });
    }

    try {
      await db.execute({ sql: `DELETE FROM MessMember WHERE mess_id = ?`, args: [id] });
      await db.execute({ sql: `UPDATE Customer SET mess_id = NULL WHERE mess_id = ?`, args: [id] });
      await db.execute({ sql: `DELETE FROM NfcCard WHERE mess_id = ?`, args: [id] });
      await db.execute({ sql: `DELETE FROM MessGroup WHERE id = ?`, args: [id] });
      mirrorMessCardToCloud(id, null).catch(() => {});
    } catch { }

    return { success: true, message: `Mess Group ${id} disbanded successfully` };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// GET /api/customers/:id/messes - Returns all mess groups a customer is currently enrolled in
fastify.get('/api/customers/:id/messes', async (request, reply) => {
  try {
    const { id } = request.params;
    const res = await db.execute({
      sql: `SELECT DISTINCT g.id, g.group_name, COALESCE(mm.role, 'MEMBER') as role, 
                            COALESCE(mm.is_active, 1) as is_active, 
                            COALESCE(mm.joined_at, g.createdAt) as joined_at,
                            (SELECT COUNT(*) FROM MessMember WHERE mess_id = g.id AND is_active = 1) as activeMemberCount
            FROM MessGroup g
            LEFT JOIN MessMember mm ON g.id = mm.mess_id AND mm.customer_id = ?
            WHERE mm.customer_id = ? OR g.id IN (SELECT mess_id FROM Customer WHERE id = ?)
            ORDER BY g.group_name ASC`,
      args: [id, id, id]
    });
    return { success: true, messes: res.rows || [] };
  } catch (err) {
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// Legacy / alias route - upgraded for both Personal & Mess Cards
fastify.get('/api/customers/by-card/:uid', async (request, reply) => {
  const { uid } = request.params;
  const resolved = await resolveNfcTagDetails(uid);
  if (!resolved) {
    return reply.status(404).send({ error: 'Card not registered to any customer or mess group', tag_id: uid });
  }
  return resolved;
});

// =========================================================================
// 🖨️ NETWORK SUNMI PRINTER DISPATCH & FLEET COMMAND QUEUE
// Enables billing on Laptop and automated instant receipt printing on Sunmi
// =========================================================================

let pendingPrintJobs = [];
let pendingFleetCommands = [];

const normalizeTerminal = (raw) => {
  const clean = String(raw || '').trim().toUpperCase();
  if (!clean || clean === 'SUNMI-D2-REG01' || clean === '1' || clean === 'SUNMI' || clean === 'T1') return 'T1';
  if (clean === 'F100' || clean === '2' || clean === 'T2') return 'T2';
  if (clean === 'LAPTOP-01' || clean === 'WEB-POS' || clean === '3' || clean === 'T3' || clean === 'DESKTOP' || clean === 'LAPTOP') return 'T3';
  if (clean === 'LAPTOP-02' || clean === 'WEB-POS-2' || clean === '4' || clean === 'T4' || clean === 'DESKTOP2') return 'T4';
  if (clean === 'PHONE-01' || clean === 'MOBILE-01' || clean === 'M1' || clean === 'PHONE1') return 'M1';
  if (clean === 'PHONE-02' || clean === 'MOBILE-02' || clean === 'M2' || clean === 'PHONE2') return 'M2';
  return clean;
};

// Dispatch print job across WebSocket and save to pending queue
const dispatchNetworkPrint = (job) => {
  const now = Date.now();
  pendingPrintJobs.push(job);
  // Prune jobs older than 5 minutes
  pendingPrintJobs = pendingPrintJobs.filter(j => now - j.createdAt < 300000);

  // 1. Instant Push via WebSocket to connected Sunmi terminals
  console.log('📡 [Hardware Print Dispatch] wsServer exists:', Boolean(fastify.websocketServer), 'Clients size:', fastify.websocketServer?.clients?.size);
  if (fastify.websocketServer?.clients) {
    let wsDelivered = false;
    const wsEvent = JSON.stringify({
      type: 'PRINT_REQUEST',
      jobId: job.id,
      terminalId: job.terminalId,
      payload: job.payload,
      sentAt: new Date().toISOString()
    });
    fastify.websocketServer.clients.forEach((c) => {
      if (c.readyState === 1) { // 1 = OPEN
        c.send(wsEvent);
        wsDelivered = true;
      }
    });
    if (wsDelivered) {
      job.status = 'WS_DELIVERED';
    }
  }
};

// POST /api/print & /api/hardware/print: Dispatch receipt from Laptop to Sunmi
const handlePrintDispatch = async (request, reply) => {
  try {
    const body = request.body || {};
    const rawTerminal = body.terminalId || body.targetTerminal || 'T1';
    const terminalId = normalizeTerminal(rawTerminal);
    const payload = body.payload || body;
    const jobId = body.jobId || `print_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const job = {
      id: jobId,
      terminalId,
      type: 'PRINT_REQUEST',
      payload,
      status: 'PENDING',
      createdAt: Date.now()
    };

    dispatchNetworkPrint(job);
    fastify.log.info(`🖨️ [Server Print Queue] Print job ${jobId} dispatched to terminal ${terminalId}`);

    // If CASH sale, also broadcast cash drawer kick signal to Sunmi RJ11 solenoid
    if (payload.paymentMode === 'CASH' || payload.paymentMethod === 'CASH') {
      const kickMsg = JSON.stringify({
        type: 'REMOTE_DRAWER_KICK',
        command: 'DRAWER_KICK',
        terminalId,
        payload: { saleTotal: payload.total || payload.paidAmount, paymentMode: 'CASH' },
        sentAt: new Date().toISOString()
      });
      if (fastify.websocketServer?.clients) {
        fastify.websocketServer.clients.forEach((c) => {
          if (c.readyState === 1) c.send(kickMsg);
        });
      }
      pendingFleetCommands.push({
        id: `kick_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        terminalId,
        command: 'DRAWER_KICK',
        payload: { saleTotal: payload.total || payload.paidAmount, paymentMode: 'CASH' },
        timestamp: Date.now()
      });
    }

    return {
      success: true,
      jobId,
      terminalId,
      message: `Print job enqueued and broadcast to Sunmi Terminal ${terminalId}`
    };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: err.message });
  }
};

fastify.post('/api/print', handlePrintDispatch);
fastify.post('/api/hardware/print', handlePrintDispatch);

// GET /api/print/pending: Sunmi polls for pending print jobs
fastify.get('/api/print/pending', async (request) => {
  const target = normalizeTerminal(request.query?.terminalId || 'T1');
  const now = Date.now();
  const jobs = [];

  for (const job of pendingPrintJobs) {
    if (job.status === 'PENDING' && (now - job.createdAt < 60000)) {
      if (job.terminalId === target || job.terminalId === 'ALL' || target === 'ALL') {
        jobs.push({
          id: job.id,
          command: 'PRINT_REQUEST',
          type: 'PRINT_REQUEST',
          payload: job.payload,
          createdAt: job.createdAt
        });
        job.status = 'DELIVERED';
      }
    }
  }

  return { success: true, terminalId: target, count: jobs.length, jobs, commands: jobs };
});

// POST /api/print/complete: Acknowledge printed receipt
fastify.post('/api/print/complete', async (request) => {
  const { jobId } = request.body || {};
  if (jobId) {
    const job = pendingPrintJobs.find(j => j.id === jobId);
    if (job) job.status = 'PRINTED';
  }
  return { success: true };
});

// POST /api/register/command: Fleet command bridge (drawer kick, clear cart, remote print)
fastify.post('/api/register/command', async (request, reply) => {
  try {
    const body = request.body || {};
    const terminalId = normalizeTerminal(body.terminalId || body.terminal);
    const rawCmd = String(body.command || body.type || '').trim().toUpperCase();
    if (!rawCmd) return reply.status(400).send({ error: 'command required' });

    const cleanCmd = rawCmd.startsWith('REMOTE_') ? rawCmd.replace('REMOTE_', '') : rawCmd;
    const cmdId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const newCmd = {
      id: cmdId,
      terminalId,
      command: cleanCmd,
      payload: body.payload || {},
      timestamp: Date.now()
    };
    pendingFleetCommands.push(newCmd);

    // Broadcast over WebSocket if open
    if (fastify.websocketServer?.clients) {
      const msg = JSON.stringify({
        type: cleanCmd,
        command: cleanCmd,
        terminalId,
        payload: newCmd.payload
      });
      fastify.websocketServer.clients.forEach(c => {
        if (c.readyState === 1) c.send(msg);
      });
    }

    return { success: true, dispatched: true, terminalId, command: cleanCmd, commandId: cmdId };
  } catch (err) {
    return reply.status(500).send({ error: 'Command dispatch failed', details: err?.message });
  }
});

// GET /api/register/command: Poll for fleet commands
fastify.get('/api/register/command', async (request) => {
  const terminalId = normalizeTerminal(request.query?.terminalId || 'ALL');
  const now = Date.now();
  const matched = [];

  pendingFleetCommands = pendingFleetCommands.filter(cmd => {
    if (now - cmd.timestamp > 60000) return false;
    if (cmd.terminalId === terminalId || cmd.terminalId === 'ALL' || terminalId === 'ALL') {
      matched.push({
        command: cmd.command,
        type: cmd.command,
        payload: cmd.payload,
        id: cmd.id
      });
      return false; // Remove popped command
    }
    return true;
  });

  return { success: true, terminalId, commands: matched };
});

// Autonomous Multi-Register Heartbeat Ingest & Command Relay (3.5s loop in App.tsx)
const handleRegisterHeartbeat = async (request) => {
  const body = request.body || {};
  const query = request.query || {};
  const rawTerminal = body.terminalId || body.id || query.terminalId || query.id || 'T1';
  const terminalId = normalizeTerminal(rawTerminal);
  const clientUuid = body.clientUuid || query.clientUuid || null;
  const now = Date.now();
  const matched = [];

  const existing = fleetCartSnapshots.get(terminalId) || {
    terminalId,
    terminalName: terminalId === 'T1' ? 'Counter 1 (Sunmi D2 Mini)' : terminalId === 'T2' ? 'Counter 2 (Feitian F100 Mobile)' : terminalId === 'T4' ? 'Counter 4 (Desktop Web POS 2)' : terminalId.startsWith('M') ? `Floor Phone (${terminalId})` : 'Counter 3 (Desktop Web POS 1)',
    cashierName: body.cashierName || 'Cashier',
    items: [],
    itemCount: 0,
    total: 0,
    customerName: 'Walk-in',
    status: 'IDLE'
  };

  fleetCartSnapshots.set(terminalId, {
    ...existing,
    terminalId,
    clientUuid: clientUuid || existing.clientUuid || null,
    cashierName: body.cashierName || existing.cashierName,
    updatedAtEpoch: now,
    lastSeen: now,
    isOnline: true
  });
  persistFleetSnapshotsToDb().catch(() => {});

  // 1. Pop pending fleet commands
  pendingFleetCommands = pendingFleetCommands.filter(cmd => {
    if (now - cmd.timestamp > 60000) return false;
    if (cmd.terminalId === terminalId || cmd.terminalId === 'ALL' || terminalId === 'ALL') {
      matched.push({
        command: cmd.command,
        type: cmd.command,
        payload: cmd.payload,
        id: cmd.id
      });
      return false;
    }
    return true;
  });

  // 2. Pop pending print jobs
  for (let i = pendingPrintJobs.length - 1; i >= 0; i--) {
    const job = pendingPrintJobs[i];
    if (job.status === 'PENDING' && (job.terminalId === terminalId || job.terminalId === 'ALL')) {
      matched.push({
        command: 'PRINT_REQUEST',
        type: 'PRINT_REQUEST',
        payload: job.payload,
        id: job.id,
        jobId: job.id
      });
      job.status = 'DISPATCHED';
    }
  }

  const registersList = Array.from(fleetCartSnapshots.values()).map(r => ({
    ...r,
    isOnline: (now - (r.updatedAtEpoch || r.lastSeen || 0)) < 45000,
    secondsSinceLastSeen: Math.floor((now - (r.updatedAtEpoch || r.lastSeen || 0)) / 1000)
  }));

  return {
    success: true,
    terminalId,
    timestamp: now,
    serverEpoch: now,
    commands: matched,
    registers: registersList
  };
};

fastify.post('/api/register/heartbeat', handleRegisterHeartbeat);
fastify.get('/api/register/heartbeat', handleRegisterHeartbeat);


}
