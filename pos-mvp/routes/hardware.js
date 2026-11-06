import crypto from 'crypto';
import { db } from '../db.js';
import { getAllCustomersWithBalances, fetchMessGroupDetails } from './khata.js';
import { verifyManagerPin } from '../middleware/auth.js';

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

  // 2. Fetch all customers with their balances
  const allCustomers = await getAllCustomersWithBalances();

  // 3. Find linked customer if any
  let customer = null;
  if (nfcCard && nfcCard.customer_id) {
    customer = allCustomers.find(c => c.id === nfcCard.customer_id);
  }
  if (!customer) {
    // Check fallback Customer.cardUid or Customer.nfc_card_id
    customer = allCustomers.find((c) => {
      const cardField = c.nfc_card_id || c.cardUid;
      if (!cardField) return false;
      const cUid = cardField.trim().toUpperCase().replace(/^#+|#+$/g, '');
      const cUidNoColon = cUid.replace(/[:\-]/g, '');
      return cUid === cleanUid || cUidNoColon === cleanNoColon || cUid.includes(cleanNoColon) || cleanUid.includes(cUidNoColon);
    });
  }

  // Look up mess_id directly from LibSQL
  let customerMessId = null;
  if (customer) {
    try {
      const cRes = await db.execute({ sql: 'SELECT mess_id FROM Customer WHERE id = ? LIMIT 1', args: [customer.id] });
      if (cRes.rows && cRes.rows.length > 0 && cRes.rows[0].mess_id) {
        customerMessId = cRes.rows[0].mess_id;
      }
    } catch { }
  }

  // 4. Determine mess group ID (from customerMessId OR nfcCard.mess_id)
  const messId = customerMessId || nfcCard?.mess_id;
  let messDetails = null;
  if (messId) {
    messDetails = await fetchMessGroupDetails(messId);
  }

  // CASE A: DUAL-WALLET (Customer identified AND belongs to a Mess Group)
  // One card holds both their Personal Khata and their shared Mess Group!
  if (customer && messDetails) {
    return {
      ...customer,
      personalBalance: customer.currentBalance,
      hasMessGroup: true,
      isDual: true,
      isMess: false, // Default to personal or ready to choose
      card_type: 'DUAL',
      tag_id: cleanUid,
      mess_id: messDetails.id,
      group_name: messDetails.group_name,
      messGroup: messDetails,
      members: messDetails.members,
      memberCount: messDetails.memberCount,
      shopper: {
        id: customer.id,
        name: customer.name
      }
    };
  }

  // CASE B: Pure Personal Customer (Not linked to any Mess Group)
  if (customer && !messDetails) {
    return {
      ...customer,
      personalBalance: customer.currentBalance,
      hasMessGroup: false,
      isDual: false,
      isMess: false,
      card_type: 'PERSONAL',
      tag_id: cleanUid
    };
  }

  // CASE C: Pure Mess Group Card (Generic group card, no specific individual assigned)
  if (!customer && messDetails) {
    return {
      isMess: true,
      hasMessGroup: true,
      isDual: false,
      card_type: 'MESS',
      tag_id: cleanUid,
      mess_id: messDetails.id,
      group_name: messDetails.group_name,
      id: `mess_${messDetails.id}`,
      name: `👥 ${messDetails.group_name}`,
      members: messDetails.members,
      memberCount: messDetails.memberCount,
      currentBalance: messDetails.totalBalance
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

// Live Register Cart Snapshot & Ingest (Register Spy Support)
fastify.get('/api/register/cart/live', async () => {
  if (liveCartSnapshot?.payload) return liveCartSnapshot.payload;
  if (liveCartSnapshot) return liveCartSnapshot;
  return { items: [], total: 0, customerName: 'Walk-in', itemCount: 0 };
});

fastify.post('/api/register/cart/live', async (request) => {
  const body = request.body || {};
  liveCartSnapshot = {
    type: 'CART_UPDATED',
    payload: {
      items: body.items || [],
      itemCount: body.itemCount || (body.items || []).length,
      total: Number(body.total || 0),
      customer: body.customer || null,
      customerName: body.customerName || (body.customer ? body.customer.name : 'Walk-in'),
      activeCartId: body.activeCartId || '1',
      terminalId: body.terminalId || 'SUNMI-D2-REG01',
      updatedAt: new Date().toISOString()
    }
  };

  if (fastify.websocketServer?.clients) {
    const msg = JSON.stringify(liveCartSnapshot);
    fastify.websocketServer.clients.forEach((c) => {
      if (c.readyState === 1) c.send(msg);
    });
  }
  return { ok: true };
});

// Protected Cash Drawer Kick (Requires Valid Manager PIN via Bcrypt)
fastify.post('/api/hardware/drawer-kick', { preHandler: verifyManagerPin }, async (request, reply) => {
  try {
    if (fastify.websocketServer?.clients) {
      const kickEvent = JSON.stringify({ type: 'REMOTE_DRAWER_KICK', sentAt: new Date().toISOString() });
      fastify.websocketServer.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(kickEvent);
        }
      });
    }
    return { success: true, message: 'Cash drawer kick signal authorized and dispatched.' };
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ success: false, error: err.message });
  }
});

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
    const messCards = enrichedCards.filter(c => c.card_type === 'MESS').length;
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
    const { tag_id, card_type, customer_id, mess_id, mess_name, member_ids } = request.body || {};
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

      // If members provided, attach them to this mess group
      if (targetMessId && Array.isArray(member_ids)) {
        try {
          for (const mId of member_ids) {
            await db.execute({
              sql: `UPDATE Customer SET mess_id = ? WHERE id = ?`,
              args: [targetMessId, mId]
            });
          }
        } catch { }
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
          sql: 'UPDATE Customer SET nfc_card_id = ?, cardUid = ? WHERE id = ?',
          args: [cleanTag, cleanTag, customer_id]
        });
      } catch { }

      // If mess_id is specified (or explicitly cleared), update customer's mess group
      if (mess_id !== undefined) {
        try {
          await db.execute({
            sql: `UPDATE Customer SET mess_id = ? WHERE id = ?`,
            args: [mess_id || null, customer_id]
          });
        } catch { }
      }

      try {
        await db.execute({
          sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, mess_id, createdAt) 
                VALUES (?, 'PERSONAL', ?, ?, datetime('now'))
                ON CONFLICT(tag_id) DO UPDATE SET card_type = 'PERSONAL', customer_id = excluded.customer_id, mess_id = excluded.mess_id;`,
          args: [cleanTag, customer_id, mess_id || null]
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
        sql: `UPDATE Customer SET cardUid = NULL, nfc_card_id = NULL WHERE UPPER(cardUid) = ? OR UPPER(COALESCE(nfc_card_id, '')) = ? OR REPLACE(UPPER(cardUid), ':', '') = ?`,
        args: [cleanTag, cleanTag, cleanTag.replace(/:/g, '')]
      });
      await db.execute({
        sql: `DELETE FROM NfcCard WHERE UPPER(tag_id) = ? OR REPLACE(UPPER(tag_id), ':', '') = ?`,
        args: [cleanTag, cleanTag.replace(/:/g, '')]
      });
    } catch { }

    if (db) {
      try {
        await db.execute({
          sql: `UPDATE Customer SET cardUid = NULL WHERE UPPER(cardUid) = ? OR REPLACE(UPPER(cardUid), ':', '') = ?`,
          args: [cleanTag, cleanTag.replace(/:/g, '')]
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
          sql: `SELECT tag_id FROM NfcCard WHERE mess_id = ? AND card_type = 'MESS' LIMIT 1`,
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
        assignedCard: cardTag
      });
    }

    return { success: true, messGroups: enrichedGroups };
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
          await db.execute({
            sql: `UPDATE Customer SET mess_id = ? WHERE id = ?`,
            args: [messId, mId]
          });
        }
      }
      if (tag_id && tag_id.trim()) {
        const cleanTag = tag_id.trim().toUpperCase();
        await db.execute({
          sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, mess_id, createdAt) 
                VALUES (?, 'MESS', NULL, ?, datetime('now'))
                ON CONFLICT(tag_id) DO UPDATE SET card_type = 'MESS', customer_id = NULL, mess_id = excluded.mess_id;`,
          args: [cleanTag, messId]
        });
      }
    } catch { }

    const details = await fetchMessGroupDetails(messId);
    return { success: true, messGroup: { ...details, assignedCard: tag_id || null } };
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
        await db.execute({
          sql: `UPDATE Customer SET mess_id = NULL WHERE mess_id = ?`,
          args: [id]
        });
        for (const mId of member_ids) {
          await db.execute({
            sql: `UPDATE Customer SET mess_id = ? WHERE id = ?`,
            args: [id, mId]
          });
        }
      }

      if (tag_id !== undefined) {
        if (tag_id) {
          const cleanTag = tag_id.trim().toUpperCase();
          await db.execute({
            sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, mess_id, createdAt) 
                  VALUES (?, 'MESS', NULL, ?, datetime('now'))
                  ON CONFLICT(tag_id) DO UPDATE SET card_type = 'MESS', customer_id = NULL, mess_id = excluded.mess_id;`,
            args: [cleanTag, id]
          });
        } else {
          await db.execute({
            sql: `DELETE FROM NfcCard WHERE mess_id = ? AND card_type = 'MESS'`,
            args: [id]
          });
        }
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
      await db.execute({ sql: `UPDATE Customer SET mess_id = NULL WHERE mess_id = ?`, args: [id] });
      await db.execute({ sql: `DELETE FROM NfcCard WHERE mess_id = ?`, args: [id] });
      await db.execute({ sql: `DELETE FROM MessGroup WHERE id = ?`, args: [id] });
    } catch { }

    return { success: true, message: `Mess Group ${id} disbanded successfully` };
  } catch (err) {
    fastify.log.error(err);
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

}
