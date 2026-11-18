// ====================================================================
// ASKAR SUPERMARKET ERP - RESILIENT CLOUD MIRRORING & RECONCILIATION
// Asynchronous, Non-Blocking Zero-SPOF Synchronization between Local SQLite & Turso Cloud
// ====================================================================

import { db, tursoCloudClient } from '../db.js';

let isReconciling = false;

// --- EXPONENTIAL BACKOFF & CIRCUIT BREAKER STATE ---
let consecutiveCloudErrors = 0;
let cloudBackoffUntil = 0;
const MAX_BACKOFF_MS = 60000; // 60 seconds maximum backoff
const BASE_BACKOFF_MS = 1000; // 1 second initial backoff

/**
 * Get current circuit breaker and exponential backoff status
 */
export function getCloudSyncBackoffStatus() {
  const now = Date.now();
  return {
    consecutiveCloudErrors,
    isCircuitOpen: now < cloudBackoffUntil,
    backoffRemainingMs: Math.max(0, cloudBackoffUntil - now),
    cloudBackoffUntil
  };
}

/**
 * Manually reset the circuit breaker (e.g. for testing or after confirmed network recovery)
 */
export function resetCloudSyncCircuitBreaker() {
  consecutiveCloudErrors = 0;
  cloudBackoffUntil = 0;
}

/**
 * Trip the circuit breaker and calculate exponential backoff delay with random jitter
 */
export function tripCloudSyncCircuitBreaker(error) {
  consecutiveCloudErrors++;
  const exp = Math.min(6, consecutiveCloudErrors - 1);
  const backoffDelay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, exp));
  const jitter = Math.floor(Math.random() * 500);
  cloudBackoffUntil = Date.now() + backoffDelay + jitter;
  console.warn(`⏳ [CloudSync Circuit Breaker] Tripped (attempt #${consecutiveCloudErrors}). Pausing cloud writes for ${(backoffDelay + jitter)}ms. Reason: ${error?.message || error}`);
}

/**
 * Record a successful cloud operation to reset consecutive error counter
 */
export function recordCloudSyncSuccess() {
  if (consecutiveCloudErrors > 0) {
    console.log(`✅ [CloudSync Circuit Breaker] Recovered. Resetting error counter after successful cloud write.`);
  }
  consecutiveCloudErrors = 0;
  cloudBackoffUntil = 0;
}

/**
 * Safely format argument for SQL queries
 */
function toSqlArg(val) {
  if (val === undefined || val === null) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'boolean') return val ? 1 : 0;
  return val;
}

/**
 * 1. Asynchronously mirror a local sale and its line items to Turso Cloud
 * Fire-and-forget: Never blocks local checkout or crashes cashier operations.
 */
export async function mirrorSaleToCloud(saleId) {
  if (!tursoCloudClient || !saleId) return false;
  if (Date.now() < cloudBackoffUntil) {
    return false; // Circuit breaker active: throttle request
  }

  try {
    // 1. Fetch sale from local database
    const saleRes = await db.execute({
      sql: `SELECT * FROM Sale WHERE id = ? LIMIT 1`,
      args: [saleId]
    });
    if (!saleRes.rows || saleRes.rows.length === 0) return false;
    const s = saleRes.rows[0];

    // 2. Fetch items for this sale
    const itemsRes = await db.execute({
      sql: `SELECT * FROM SaleItem WHERE saleId = ?`,
      args: [saleId]
    });
    const items = itemsRes.rows || [];

    // 3. Batch insert into Turso Cloud
    const statements = [
      {
        sql: `INSERT INTO Sale (
          id, tenantId, invoiceNo, invoiceSeq, customerId, shiftId, employeeId,
          subtotal, vatTotal, totalVat, total, totalAmount, paymentType,
          status, syncStatus, createdAt, storeId, terminalId
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          syncStatus = 'SYNCED',
          status = excluded.status,
          total = excluded.total,
          totalAmount = excluded.totalAmount,
          storeId = excluded.storeId,
          terminalId = excluded.terminalId`,
        args: [
          s.id,
          s.tenantId || 'tenant_askar_01',
          s.invoiceNo,
          s.invoiceSeq || 0,
          s.customerId || null,
          s.shiftId || null,
          s.employeeId || null,
          s.subtotal,
          s.vatTotal || s.totalVat || 0,
          s.totalVat || s.vatTotal || 0,
          s.total,
          s.totalAmount || s.total,
          s.paymentType || 'CASH',
          s.status || 'COMPLETED',
          s.createdAt,
          s.storeId || 'store_askar_01',
          s.terminalId || 'T1'
        ]
      }
    ];

    for (const item of items) {
      statements.push({
        sql: `INSERT INTO SaleItem (
          id, tenantId, saleId, productId, quantity, priceAtSale, costAtSale,
          vatRateAtSale, vatAmount, total_price
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          quantity = excluded.quantity,
          priceAtSale = excluded.priceAtSale,
          total_price = excluded.total_price`,
        args: [
          item.id,
          item.tenantId || s.tenantId || 'tenant_askar_01',
          item.saleId,
          item.productId,
          item.quantity,
          item.priceAtSale,
          item.costAtSale || 0,
          item.vatRateAtSale || 10.0,
          item.vatAmount || 0,
          item.total_price
        ]
      });
    }

    await tursoCloudClient.batch(statements, 'write');

    // 4. Mark local sale as SYNCED
    await db.execute({
      sql: `UPDATE Sale SET syncStatus = 'SYNCED' WHERE id = ?`,
      args: [saleId]
    });

    recordCloudSyncSuccess();
    console.log(`☁️ [CloudSync] Sale ${s.invoiceNo} (${saleId}) mirrored to Turso Cloud.`);
    return true;
  } catch (err) {
    tripCloudSyncCircuitBreaker(err);
    console.warn(`⚠️ [CloudSync] Could not mirror sale ${saleId} to cloud (circuit tripped, will retry after backoff):`, err.message);
    return false;
  }
}

/**
 * 2. Asynchronously mirror a product create or update to Turso Cloud
 */
export async function mirrorProductToCloud(prod) {
  if (!tursoCloudClient || !prod) return false;

  try {
    const updatedAt = prod.updatedAt ? new Date(prod.updatedAt).toISOString() : new Date().toISOString();
    await tursoCloudClient.execute({
      sql: `INSERT INTO Product (
        id, tenantId, name, purchasePrice, unitCost, sellingPrice,
        stockQuantity, minThreshold, maxThreshold, supplierName,
        distributorId, taxRate, vatRate, barcode, category,
        is_weighed_item, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        purchasePrice = excluded.purchasePrice,
        unitCost = excluded.unitCost,
        sellingPrice = excluded.sellingPrice,
        stockQuantity = excluded.stockQuantity,
        minThreshold = excluded.minThreshold,
        maxThreshold = excluded.maxThreshold,
        supplierName = excluded.supplierName,
        distributorId = excluded.distributorId,
        barcode = excluded.barcode,
        category = excluded.category,
        is_weighed_item = excluded.is_weighed_item,
        updatedAt = excluded.updatedAt`,
      args: [
        prod.id,
        prod.tenantId || 'tenant_askar_01',
        prod.name,
        prod.purchasePrice ?? prod.costPrice ?? prod.unitCost ?? 0,
        prod.unitCost ?? prod.purchasePrice ?? 0,
        prod.sellingPrice ?? prod.price ?? 0,
        prod.stockQuantity ?? 0,
        prod.minThreshold ?? 10,
        prod.maxThreshold ?? 100,
        prod.supplierName || 'General',
        prod.distributorId || null,
        prod.taxRate ?? 0.10,
        prod.vatRate ?? 10.0,
        prod.barcode || null,
        prod.category || 'GROCERY',
        prod.is_weighed_item ? 1 : 0,
        updatedAt
      ]
    });

    console.log(`☁️ [CloudSync] Product '${prod.name}' (${prod.barcode || prod.id}) mirrored to Turso Cloud.`);
    return true;
  } catch (err) {
    console.warn(`⚠️ [CloudSync] Could not mirror product ${prod.id} to cloud:`, err.message);
    return false;
  }
}

/**
 * 3. Mirror product deletion tombstone to Turso Cloud
 */
export async function mirrorProductTombstoneToCloud(id, barcode, name) {
  if (!tursoCloudClient || !id) return false;

  try {
    await tursoCloudClient.batch([
      {
        sql: `INSERT INTO DeletedProduct (id, barcode, name, tenantId, deletedAt)
              VALUES (?, ?, ?, 'tenant_askar_01', CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO NOTHING`,
        args: [id, barcode || null, name || 'Deleted Item']
      },
      {
        sql: `DELETE FROM Product WHERE id = ?`,
        args: [id]
      }
    ], 'write');
    console.log(`☁️ [CloudSync] Product tombstone ${id} mirrored to Turso Cloud.`);
    return true;
  } catch (err) {
    console.warn(`⚠️ [CloudSync] Could not mirror product deletion to cloud:`, err.message);
    return false;
  }
}

/**
 * 4. Asynchronously mirror a customer create or update to Turso Cloud
 */
export async function mirrorCustomerToCloud(customer) {
  if (!tursoCloudClient || !customer || !customer.id) return false;

  try {
    const updatedAt = customer.updatedAt ? new Date(customer.updatedAt).toISOString() : new Date().toISOString();
    const pin = customer.khataPin || customer.khata_pin || customer.pin || null;

    await tursoCloudClient.execute({
      sql: `INSERT INTO Customer (
        id, tenantId, name, phone, cpr, batchNo, description,
        nfcCardId, cardUid, nfc_card_id, balance, khataPin, khata_pin,
        pin, access_token, credit_limit, is_active, isActive, mess_id, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        phone = excluded.phone,
        cpr = excluded.cpr,
        description = excluded.description,
        nfcCardId = excluded.nfcCardId,
        cardUid = excluded.cardUid,
        nfc_card_id = excluded.nfc_card_id,
        balance = excluded.balance,
        khataPin = excluded.khataPin,
        khata_pin = excluded.khata_pin,
        pin = excluded.pin,
        credit_limit = excluded.credit_limit,
        mess_id = excluded.mess_id,
        updatedAt = excluded.updatedAt`,
      args: [
        customer.id,
        customer.tenantId || 'tenant_askar_01',
        customer.name,
        customer.phone || null,
        customer.cpr || null,
        customer.batchNo || null,
        customer.description || null,
        customer.cardUid || customer.nfcCardId || null,
        customer.cardUid || customer.nfcCardId || null,
        customer.cardUid || customer.nfcCardId || null,
        customer.balance ?? 0.0,
        pin,
        pin,
        pin,
        customer.access_token || customer.id,
        customer.credit_limit ?? 30.0,
        customer.mess_id || null,
        customer.createdAt ? new Date(customer.createdAt).toISOString() : updatedAt,
        updatedAt
      ]
    });

    if (customer.mess_ids || customer.messes) {
      mirrorCustomerMessMembershipsToCloud(customer.id, customer.mess_ids || customer.messes).catch(() => {});
    }

    console.log(`☁️ [CloudSync] Customer '${customer.name}' (${customer.id}) mirrored to Turso Cloud.`);
    return true;
  } catch (err) {
    console.warn(`⚠️ [CloudSync] Could not mirror customer ${customer.id} to cloud:`, err.message);
    return false;
  }
}

/**
 * Mirror Mess Group to Turso Cloud
 */
export async function mirrorMessGroupToCloud(group) {
  if (!tursoCloudClient || !group || !group.id) return false;
  try {
    await tursoCloudClient.execute({
      sql: `INSERT INTO MessGroup (id, tenantId, group_name, createdAt)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET group_name = excluded.group_name`,
      args: [group.id, group.tenantId || 'tenant_askar_01', group.group_name, group.createdAt || new Date().toISOString()]
    });
    return true;
  } catch (err) {
    console.warn(`⚠️ [CloudSync] Could not mirror mess group ${group.id}:`, err.message);
    return false;
  }
}

/**
 * Mirror complete Mess Group Roster (members) to Turso Cloud
 */
export async function mirrorMessGroupRosterToCloud(groupId, memberIds) {
  if (!tursoCloudClient || !groupId) return false;
  try {
    await tursoCloudClient.execute({
      sql: `DELETE FROM MessMember WHERE mess_id = ?`,
      args: [groupId]
    });
    const ids = Array.isArray(memberIds) ? memberIds : [];
    for (const mId of ids.filter(Boolean)) {
      const mmId = `mm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await tursoCloudClient.execute({
        sql: `INSERT INTO MessMember (id, tenantId, mess_id, customer_id, role, is_active, joined_at)
              VALUES (?, 'tenant_askar_01', ?, ?, 'MEMBER', 1, CURRENT_TIMESTAMP)
              ON CONFLICT(mess_id, customer_id) DO UPDATE SET is_active = 1`,
        args: [mmId, groupId, mId]
      });
    }
    console.log(`☁️ [CloudSync] Mess group ${groupId} roster (${ids.length} members) mirrored to Turso Cloud.`);
    return true;
  } catch (err) {
    console.warn(`⚠️ [CloudSync] Could not mirror mess group roster for ${groupId}:`, err.message);
    return false;
  }
}

/**
 * Mirror Mess Group NFC Card binding or deletion to Turso Cloud
 */
export async function mirrorMessCardToCloud(messId, tagId) {
  if (!tursoCloudClient || !messId) return false;
  try {
    if (tagId && String(tagId).trim() && String(tagId).trim().toLowerCase() !== 'null') {
      const cleanTag = String(tagId).trim().toUpperCase();
      await tursoCloudClient.execute({
        sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, mess_id, createdAt) 
              VALUES (?, 'MESS', NULL, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(tag_id) DO UPDATE SET card_type = 'MESS', customer_id = NULL, mess_id = excluded.mess_id`,
        args: [cleanTag, messId]
      });
      await tursoCloudClient.execute({
        sql: `UPDATE Customer SET cardUid = NULL, nfcCardId = NULL 
              WHERE UPPER(COALESCE(cardUid, '')) = ? 
                 OR REPLACE(UPPER(COALESCE(cardUid, '')), ':', '') = ?
                 OR UPPER(COALESCE(nfcCardId, '')) = ?
                 OR REPLACE(UPPER(COALESCE(nfcCardId, '')), ':', '') = ?`,
        args: [cleanTag, cleanTag.replace(/[:\-]/g, ''), cleanTag, cleanTag.replace(/[:\-]/g, '')]
      });
      console.log(`☁️ [CloudSync] Mess card '${cleanTag}' for group ${messId} mirrored to Turso Cloud.`);
    } else {
      await tursoCloudClient.execute({
        sql: `DELETE FROM NfcCard WHERE mess_id = ?`,
        args: [messId]
      });
      console.log(`☁️ [CloudSync] Mess cards for group ${messId} unlinked from Turso Cloud.`);
    }
    return true;
  } catch (err) {
    console.warn(`⚠️ [CloudSync] Could not mirror mess card for ${messId}:`, err.message);
    return false;
  }
}

/**
 * Mirror Mess Group disband / deletion tombstone to Turso Cloud and Cloudflare Edge
 */
export async function mirrorMessGroupTombstoneToCloud(id, groupName) {
  if (!id) return false;

  if (tursoCloudClient) {
    try {
      await tursoCloudClient.batch([
        {
          sql: `INSERT INTO DisbandedMessGroup (id, group_name, tenantId, disbandedAt)
                VALUES (?, ?, 'tenant_askar_01', CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO NOTHING`,
          args: [id, groupName || 'Disbanded Group']
        },
        {
          sql: `DELETE FROM MessMember WHERE mess_id = ?`,
          args: [id]
        },
        {
          sql: `UPDATE Customer SET mess_id = NULL WHERE mess_id = ?`,
          args: [id]
        },
        {
          sql: `DELETE FROM NfcCard WHERE mess_id = ?`,
          args: [id]
        },
        {
          sql: `DELETE FROM MessGroup WHERE id = ?`,
          args: [id]
        }
      ], 'write');
      console.log(`☁️ [CloudSync] Mess group tombstone ${id} mirrored to Turso Cloud.`);
    } catch (err) {
      console.warn(`⚠️ [CloudSync] Could not mirror mess group deletion to cloud:`, err.message);
    }
  }

  // Also notify Cloudflare Edge API
  try {
    const edgeUrl = `https://askar-edge-api.layali-askar-pos.workers.dev/api/nfc/mess-groups/${encodeURIComponent(id)}`;
    await fetch(edgeUrl, {
      method: 'DELETE',
      headers: {
        'x-manager-pin': '9999',
        'x-pos-client': 'store-pos'
      },
      signal: AbortSignal.timeout(3000)
    });
  } catch (err) {
    console.warn(`⚠️ [CloudSync] Could not notify Cloudflare edge of disbanded group:`, err.message);
  }

  return true;
}

/**
 * Mirror Customer's multiple mess memberships to Turso Cloud
 */
export async function mirrorCustomerMessMembershipsToCloud(customerId, messIds) {
  if (!tursoCloudClient || !customerId) return false;
  try {
    await tursoCloudClient.execute({
      sql: `DELETE FROM MessMember WHERE customer_id = ?`,
      args: [customerId]
    });
    const ids = Array.isArray(messIds) ? messIds : [messIds];
    for (const mId of ids.filter(Boolean)) {
      const mmId = `mm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await tursoCloudClient.execute({
        sql: `INSERT INTO MessMember (id, tenantId, mess_id, customer_id, role, is_active, joined_at)
              VALUES (?, 'tenant_askar_01', ?, ?, 'MEMBER', 1, CURRENT_TIMESTAMP)
              ON CONFLICT(mess_id, customer_id) DO UPDATE SET is_active = 1`,
        args: [mmId, mId, customerId]
      });
    }
    return true;
  } catch (err) {
    console.warn(`⚠️ [CloudSync] Could not mirror mess memberships for ${customerId}:`, err.message);
    return false;
  }
}

/**
 * 5. Mirror customer deletion to Turso Cloud
 */
export async function mirrorCustomerDeleteToCloud(customerId) {
  if (!tursoCloudClient || !customerId) return false;

  try {
    await tursoCloudClient.execute({
      sql: `DELETE FROM Customer WHERE id = ?`,
      args: [customerId]
    });
    console.log(`☁️ [CloudSync] Customer ${customerId} deleted from Turso Cloud.`);
    return true;
  } catch (err) {
    console.warn(`⚠️ [CloudSync] Could not mirror customer deletion to cloud:`, err.message);
    return false;
  }
}

/**
 * 6. Asynchronously mirror a Khata ledger entry and update customer balance on Turso Cloud
 */
export async function mirrorLedgerEntryToCloud(entry) {
  if (!tursoCloudClient || !entry || !entry.id) return false;
  if (Date.now() < cloudBackoffUntil) {
    return false; // Circuit breaker active: throttle request
  }

  try {
    const timestamp = entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString();
    const customerId = entry.customerId;

    const statements = [
      {
        sql: `INSERT INTO KhataLedger (
          id, tenantId, customerId, amount, type, reference,
          running_balance, syncStatus, timestamp, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          syncStatus = 'SYNCED',
          running_balance = excluded.running_balance`,
        args: [
          entry.id,
          entry.tenantId || 'tenant_askar_01',
          customerId,
          entry.amount,
          entry.type || 'CHARGE',
          entry.reference || null,
          entry.running_balance ?? 0,
          timestamp,
          timestamp
        ]
      }
    ];

    if (customerId) {
      statements.push({
        sql: `UPDATE Customer SET
          balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?),
          updatedAt = datetime('now')
        WHERE id = ?`,
        args: [customerId, customerId]
      });
    }

    await tursoCloudClient.batch(statements, 'write');

    // Mark local ledger as SYNCED
    await db.execute({
      sql: `UPDATE KhataLedger SET syncStatus = 'SYNCED' WHERE id = ?`,
      args: [entry.id]
    });

    recordCloudSyncSuccess();
    console.log(`☁️ [CloudSync] Ledger entry ${entry.id} (${entry.type} ${entry.amount}) mirrored to Turso Cloud.`);
    return true;
  } catch (err) {
    tripCloudSyncCircuitBreaker(err);
    console.warn(`⚠️ [CloudSync] Could not mirror ledger entry ${entry.id} to cloud (circuit tripped, will retry after backoff):`, err.message);
    return false;
  }
}

/**
 * 7. Push all pending local sales & ledger events to Turso Cloud (Batch Outbox Drain)
 */
export async function syncAllPendingToCloud() {
  if (!tursoCloudClient) return { pushedSales: 0, pushedLedger: 0 };

  // Circuit Breaker Guard: Skip drain cycle if currently in exponential backoff
  if (Date.now() < cloudBackoffUntil) {
    const waitSec = Math.ceil((cloudBackoffUntil - Date.now()) / 1000);
    console.log(`⏸️ [CloudSync] Circuit breaker OPEN (${consecutiveCloudErrors} consecutive errors). Skipping outbox drain for ${waitSec}s.`);
    return { pushedSales: 0, pushedLedger: 0, backedOff: true, waitSec };
  }

  let pushedSales = 0;
  let pushedLedger = 0;

  try {
    // A. Pending Sales
    const pendingSalesRes = await db.execute({
      sql: `SELECT id FROM Sale WHERE syncStatus = 'PENDING' LIMIT 100`,
      args: []
    });

    const pendingSaleIds = (pendingSalesRes.rows || []).map(r => r.id);
    for (const sid of pendingSaleIds) {
      if (Date.now() < cloudBackoffUntil) break; // Break out immediately if circuit tripped
      const ok = await mirrorSaleToCloud(sid);
      if (ok) pushedSales++;
      else if (Date.now() < cloudBackoffUntil) break;
    }

    // B. Pending Khata Ledger (only if circuit breaker remains healthy)
    if (Date.now() >= cloudBackoffUntil) {
      const pendingLedgerRes = await db.execute({
        sql: `SELECT * FROM KhataLedger WHERE syncStatus = 'PENDING' OR syncStatus IS NULL LIMIT 200`,
        args: []
      });

      const pendingLedgers = pendingLedgerRes.rows || [];
      for (const l of pendingLedgers) {
        if (Date.now() < cloudBackoffUntil) break;
        const ok = await mirrorLedgerEntryToCloud(l);
        if (ok) pushedLedger++;
        else if (Date.now() < cloudBackoffUntil) break;
      }
    }

    // C. Reconcile Mess Groups & Members to Cloud
    if (Date.now() >= cloudBackoffUntil) {
      try {
        const lGroups = await db.execute(`SELECT * FROM MessGroup WHERE id NOT IN (SELECT id FROM DisbandedMessGroup)`);
        for (const g of lGroups.rows || []) {
          if (Date.now() < cloudBackoffUntil) break;
          await tursoCloudClient.execute({
            sql: `INSERT INTO MessGroup (id, tenantId, group_name, createdAt)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET group_name = excluded.group_name`,
            args: [g.id, g.tenantId || 'tenant_askar_01', g.group_name, g.createdAt || new Date().toISOString()]
          });
        }
        const lMembers = await db.execute(`
          SELECT mm.* FROM MessMember mm 
          WHERE mm.mess_id NOT IN (SELECT id FROM DisbandedMessGroup)
        `);
        for (const m of lMembers.rows || []) {
          if (Date.now() < cloudBackoffUntil) break;
          await tursoCloudClient.execute({
            sql: `INSERT INTO MessMember (id, tenantId, mess_id, customer_id, role, is_active, joined_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(mess_id, customer_id) DO UPDATE SET is_active = excluded.is_active`,
            args: [m.id, m.tenantId || 'tenant_askar_01', m.mess_id, m.customer_id, m.role || 'MEMBER', m.is_active ?? 1, m.joined_at || new Date().toISOString()]
          });
        }
      } catch (err) {
        tripCloudSyncCircuitBreaker(err);
      }
    }

    if (pushedSales > 0 || pushedLedger > 0) {
      console.log(`☁️ [CloudSync] Outbox drain completed: ${pushedSales} sales, ${pushedLedger} ledger entries synced to cloud.`);
    }
  } catch (err) {
    tripCloudSyncCircuitBreaker(err);
    console.warn(`⚠️ [CloudSync] Outbox push notice:`, err.message);
  }

  return { pushedSales, pushedLedger };
}

/**
 * Safely upsert a customer locally without triggering unique constraint violations
 */
async function upsertLocalCustomer(c) {
  if (!c || !c.id) return false;
  const cardVal = c.cardUid || c.nfcCardId || null;

  // Check if a DIFFERENT customer already owns this cardVal
  let safeCardVal = cardVal;
  if (safeCardVal) {
    const cardHolder = await db.execute({
      sql: `SELECT id FROM Customer WHERE (nfcCardId = ? OR cardUid = ?) AND id != ? LIMIT 1`,
      args: [safeCardVal, safeCardVal, c.id]
    });
    if (cardHolder.rows && cardHolder.rows.length > 0) {
      safeCardVal = null; // Prevent UNIQUE constraint violation
    }
  }

  const existing = await db.execute({
    sql: `SELECT id, name, phone, balance, nfcCardId, cardUid FROM Customer WHERE id = ? LIMIT 1`,
    args: [c.id]
  });

  const pin = c.khataPin || c.khata_pin || c.pin || null;
  const token = c.access_token || c.id;

  try {
    if (!existing.rows || existing.rows.length === 0) {
      await db.execute({
        sql: `INSERT OR REPLACE INTO Customer (
          id, tenantId, name, phone, cpr, batchNo, description,
          nfcCardId, cardUid, nfc_card_id, balance, khataPin, khata_pin,
          pin, access_token, credit_limit, is_active, isActive, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          c.id,
          c.tenantId || 'tenant_askar_01',
          c.name,
          c.phone || null,
          c.cpr || null,
          c.batchNo || null,
          c.description || null,
          safeCardVal,
          safeCardVal,
          safeCardVal,
          c.balance ?? 0.0,
          pin,
          pin,
          pin,
          token,
          c.credit_limit ?? 30.0,
          c.is_active ?? 1,
          c.isActive ?? 1,
          c.createdAt || new Date().toISOString(),
          c.updatedAt || new Date().toISOString()
        ]
      });
      return true;
    } else {
      const local = existing.rows[0];
      const localLedgerBal = await db.execute({
        sql: `SELECT ROUND(COALESCE(SUM(amount), 0), 3) as bal, COUNT(id) as cnt FROM KhataLedger WHERE customerId = ?`,
        args: [c.id]
      });
      const effectiveBalance = (localLedgerBal.rows && localLedgerBal.rows[0]?.cnt > 0)
        ? Number(localLedgerBal.rows[0].bal || 0)
        : Number(c.balance ?? 0.0);

      const hasDiff =
        Math.abs(Number(local.balance || 0) - effectiveBalance) > 0.001 ||
        local.name !== c.name ||
        (local.phone || '') !== (c.phone || '') ||
        (local.nfcCardId || '') !== (safeCardVal || '');

      if (hasDiff) {
        await db.execute({
          sql: `UPDATE Customer SET
            name = ?, phone = ?, cpr = ?, description = ?, balance = ?,
            nfcCardId = ?, cardUid = ?, nfc_card_id = ?, updatedAt = ?
          WHERE id = ?`,
          args: [
            c.name,
            c.phone || null,
            c.cpr || null,
            c.description || null,
            effectiveBalance,
            safeCardVal,
            safeCardVal,
            safeCardVal,
            c.updatedAt || new Date().toISOString(),
            c.id
          ]
        });
        return true;
      }
      return false;
    }
  } catch (err) {
    console.warn(`⚠️ [CloudSync] Error upserting local customer ${c.id}:`, err.message);
    return false;
  }
}

/**
 * 8. Reconcile Cloud Deltas Down to Local SQLite (e.g. Sales, Customers, or Payments processed on Edge API while laptop was asleep)
 */
export async function pullCloudDeltas() {
  if (!tursoCloudClient) return { pulledCustomers: 0, pulledSales: 0, pulledLedger: 0 };
  if (Date.now() < cloudBackoffUntil) {
    return { pulledCustomers: 0, pulledSales: 0, pulledLedger: 0, backedOff: true };
  }

  let pulledCustomers = 0;
  let pulledSales = 0;
  let pulledLedger = 0;

  try {
    // A. Reconcile Customers FIRST to satisfy foreign key constraints
    const cloudCustRes = await tursoCloudClient.execute({
      sql: `SELECT * FROM Customer LIMIT 150`,
      args: []
    });

    for (const cc of (cloudCustRes.rows || [])) {
      const ok = await upsertLocalCustomer(cc);
      if (ok) pulledCustomers++;
    }

    // B. Reconcile Sales & SaleItems
    const maxSaleRes = await db.execute({
      sql: `SELECT MAX(createdAt) as maxDate FROM Sale`,
      args: []
    });
    const latestLocalSaleDate = maxSaleRes.rows?.[0]?.maxDate || '1970-01-01T00:00:00.000Z';

    const cloudSalesRes = await tursoCloudClient.execute({
      sql: `SELECT * FROM Sale WHERE createdAt > ? ORDER BY createdAt ASC LIMIT 100`,
      args: [latestLocalSaleDate]
    });

    const newCloudSales = cloudSalesRes.rows || [];
    for (const cs of newCloudSales) {
      // Check if this sale already exists locally
      const localCheck = await db.execute({
        sql: `SELECT id FROM Sale WHERE id = ? OR invoiceNo = ? LIMIT 1`,
        args: [cs.id, cs.invoiceNo]
      });

      if (!localCheck.rows || localCheck.rows.length === 0) {
        // Validate customerId foreign key
        let validCustomerId = null;
        if (cs.customerId) {
          const custCheck = await db.execute({
            sql: `SELECT id FROM Customer WHERE id = ? LIMIT 1`,
            args: [cs.customerId]
          });
          if (custCheck.rows && custCheck.rows.length > 0) {
            validCustomerId = cs.customerId;
          } else {
            // Customer not yet local, fetch customer directly from Turso Cloud
            const cloudSingleCust = await tursoCloudClient.execute({
              sql: `SELECT * FROM Customer WHERE id = ? LIMIT 1`,
              args: [cs.customerId]
            });
            if (cloudSingleCust.rows && cloudSingleCust.rows.length > 0) {
              await upsertLocalCustomer(cloudSingleCust.rows[0]);
              validCustomerId = cs.customerId;
            }
          }
        }

        // Fetch items from Turso Cloud
        const cloudItemsRes = await tursoCloudClient.execute({
          sql: `SELECT * FROM SaleItem WHERE saleId = ?`,
          args: [cs.id]
        });
        const cloudItems = cloudItemsRes.rows || [];

        // Insert into local SQLite
        await db.transaction(async (tx) => {
          await tx.execute({
            sql: `INSERT INTO Sale (
              id, tenantId, invoiceNo, invoiceSeq, customerId, shiftId, employeeId,
              subtotal, vatTotal, totalVat, total, totalAmount, paymentType,
              status, syncStatus, createdAt, storeId, terminalId
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?, ?)`,
            args: [
              cs.id,
              cs.tenantId || 'tenant_askar_01',
              cs.invoiceNo,
              cs.invoiceSeq || 0,
              validCustomerId,
              cs.shiftId || null,
              cs.employeeId || null,
              cs.subtotal,
              cs.vatTotal || cs.totalVat || 0,
              cs.totalVat || cs.vatTotal || 0,
              cs.total,
              cs.totalAmount || cs.total,
              cs.paymentType || 'CASH',
              cs.status || 'COMPLETED',
              cs.createdAt,
              cs.storeId || 'store_askar_01',
              cs.terminalId || 'T1'
            ]
          });

          for (const item of cloudItems) {
            await tx.execute({
              sql: `INSERT INTO SaleItem (
                id, tenantId, saleId, productId, quantity, priceAtSale, costAtSale,
                vatRateAtSale, vatAmount, total_price
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [
                item.id,
                item.tenantId || cs.tenantId || 'tenant_askar_01',
                item.saleId,
                item.productId,
                item.quantity,
                item.priceAtSale,
                item.costAtSale || 0,
                item.vatRateAtSale || 10.0,
                item.vatAmount || 0,
                item.total_price
              ]
            });
          }
        });
        pulledSales++;
      }
    }

    // C. Reconcile Khata Ledger from Cloud
    const cloudLedgerRes = await tursoCloudClient.execute({
      sql: `SELECT * FROM KhataLedger ORDER BY datetime(COALESCE(created_at, timestamp, '1970-01-01')) DESC LIMIT 500`,
      args: []
    });

    const newCloudLedgers = cloudLedgerRes.rows || [];
    const touchedCustomerIds = new Set();

    for (const cl of newCloudLedgers) {
      const localCheck = await db.execute({
        sql: `SELECT id FROM KhataLedger WHERE id = ? LIMIT 1`,
        args: [cl.id]
      });

      if (!localCheck.rows || localCheck.rows.length === 0) {
        // Validate customer existence
        const custCheck = await db.execute({
          sql: `SELECT id FROM Customer WHERE id = ? LIMIT 1`,
          args: [cl.customerId]
        });
        if (!custCheck.rows || custCheck.rows.length === 0) {
          // Fetch customer from cloud
          const singleCust = await tursoCloudClient.execute({
            sql: `SELECT * FROM Customer WHERE id = ? LIMIT 1`,
            args: [cl.customerId]
          });
          if (singleCust.rows && singleCust.rows.length > 0) {
            await upsertLocalCustomer(singleCust.rows[0]);
          }
        }

        await db.execute({
          sql: `INSERT INTO KhataLedger (
            id, tenantId, customerId, amount, type, reference,
            running_balance, syncStatus, timestamp, created_at,
            mess_id, sale_id, group_total, member_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            amount = excluded.amount,
            type = excluded.type,
            reference = excluded.reference`,
          args: [
            cl.id,
            cl.tenantId || 'tenant_askar_01',
            cl.customerId,
            cl.amount,
            cl.type,
            cl.reference,
            cl.running_balance,
            cl.timestamp,
            cl.created_at || cl.timestamp,
            cl.mess_id || null,
            cl.sale_id || null,
            cl.group_total ?? null,
            cl.member_count ?? null
          ]
        });
        if (cl.customerId) touchedCustomerIds.add(cl.customerId);
        pulledLedger++;
      }
    }

    // Recalculate local customer balances for touched customers
    for (const custId of touchedCustomerIds) {
      await db.execute({
        sql: `UPDATE Customer SET
          balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?),
          updatedAt = datetime('now')
        WHERE id = ?`,
        args: [custId, custId]
      });
    }

    // Pull Mess Groups & Members from Cloud
    try {
      // 1. Sync disbanded mess group tombstones first
      try {
        const cTombstones = await tursoCloudClient.execute(`SELECT * FROM DisbandedMessGroup`);
        for (const t of cTombstones.rows || []) {
          await db.execute({
            sql: `INSERT INTO DisbandedMessGroup (id, group_name, tenantId, disbandedAt)
                  VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
            args: [t.id, t.group_name || 'Disbanded Group', t.tenantId || 'tenant_askar_01', t.disbandedAt || new Date().toISOString()]
          });
          await db.execute({ sql: `DELETE FROM MessMember WHERE mess_id = ?`, args: [t.id] });
          await db.execute({ sql: `UPDATE Customer SET mess_id = NULL WHERE mess_id = ?`, args: [t.id] });
          await db.execute({ sql: `DELETE FROM NfcCard WHERE mess_id = ?`, args: [t.id] });
          await db.execute({ sql: `DELETE FROM MessGroup WHERE id = ?`, args: [t.id] });
        }
      } catch { }

      // 2. Pull only active, non-tombstoned groups
      const cGroups = await tursoCloudClient.execute(`SELECT * FROM MessGroup WHERE id NOT IN (SELECT id FROM DisbandedMessGroup)`);
      for (const g of cGroups.rows || []) {
        const isTombstoned = await db.execute({ sql: `SELECT 1 FROM DisbandedMessGroup WHERE id = ?`, args: [g.id] });
        if (isTombstoned.rows && isTombstoned.rows.length > 0) continue;

        await db.execute({
          sql: `INSERT INTO MessGroup (id, tenantId, group_name, createdAt)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET group_name = excluded.group_name`,
          args: [g.id, g.tenantId || 'tenant_askar_01', g.group_name, g.createdAt || new Date().toISOString()]
        });
      }
      const cMembers = await tursoCloudClient.execute(`
        SELECT mm.* FROM MessMember mm 
        JOIN MessGroup mg ON mm.mess_id = mg.id
        WHERE mm.mess_id NOT IN (SELECT id FROM DisbandedMessGroup)
      `);
      for (const m of cMembers.rows || []) {
        const isTombstoned = await db.execute({ sql: `SELECT 1 FROM DisbandedMessGroup WHERE id = ?`, args: [m.mess_id] });
        if (isTombstoned.rows && isTombstoned.rows.length > 0) continue;

        await db.execute({
          sql: `INSERT INTO MessMember (id, tenantId, mess_id, customer_id, role, is_active, joined_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(mess_id, customer_id) DO UPDATE SET is_active = excluded.is_active`,
          args: [m.id, m.tenantId || 'tenant_askar_01', m.mess_id, m.customer_id, m.role || 'MEMBER', m.is_active ?? 1, m.joined_at || new Date().toISOString()]
        });
      }
    } catch { }

    if (pulledCustomers > 0 || pulledSales > 0 || pulledLedger > 0) {
      console.log(`☁️ [CloudSync] Pulled from Turso Cloud: ${pulledCustomers} customers, ${pulledSales} sales, ${pulledLedger} ledger events.`);
    }
    recordCloudSyncSuccess();
  } catch (err) {
    tripCloudSyncCircuitBreaker(err);
    console.warn(`⚠️ [CloudSync] Cloud deltas pull notice:`, err.message);
  }

  return { pulledCustomers, pulledSales, pulledLedger };
}

/**
 * 9. Master Reconciliation Routine
 */
export async function syncAllWithCloud() {
  if (!tursoCloudClient || isReconciling) return;
  if (Date.now() < cloudBackoffUntil) return;
  isReconciling = true;

  try {
    await syncAllPendingToCloud();
    if (Date.now() >= cloudBackoffUntil) {
      await pullCloudDeltas();
    }
  } catch (err) {
    tripCloudSyncCircuitBreaker(err);
    console.warn(`⚠️ [CloudSync] Sync cycle notice:`, err.message);
  } finally {
    isReconciling = false;
  }
}

/**
 * 10. Start the Background Cloud Sync Daemon
 */
export function startCloudSyncDaemon() {
  if (!tursoCloudClient) {
    console.log('ℹ️ [CloudSync] Turso Cloud credentials not active; cloud sync daemon idle.');
    return;
  }

  console.log('🚀 [CloudSync] Zero-SPOF Cloud Sync Daemon activated (Reconciliation every 30s).');

  // Initial reconciliation after 3 seconds
  setTimeout(() => {
    syncAllWithCloud().catch(() => { });
  }, 3000);

  // Periodic interval
  setInterval(() => {
    syncAllWithCloud().catch(() => { });
  }, 30000);
}
