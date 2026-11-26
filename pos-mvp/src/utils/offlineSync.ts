// pos-mvp/src/utils/offlineSync.ts
import { getNativeDb, getOfflineKhataEvents, markOfflineKhataSynced, getOfflineKhataSettlements, markOfflineKhataSettlementSynced } from './nativeDb';
import { resolveMasterServer } from './network';
import { generateCompliantInvoiceNumber } from './nbrInvoice';
import { getApiBaseUrl, DEFAULT_EDGE_API_URL } from './apiConfig';

/**
 * Helper to resolve prioritized API base URLs (Cloudflare Sovereign Edge first, then local mDNS)
 */
const getSyncCandidates = async (): Promise<string[]> => {
  const candidates: string[] = [getApiBaseUrl(), DEFAULT_EDGE_API_URL];
  try {
    const resolved = await resolveMasterServer();
    if (resolved && !candidates.includes(resolved)) {
      candidates.push(resolved);
    }
  } catch {}
  return candidates.filter(Boolean);
};

/**
 * ⚡ CRDT Event-Sourced Offline Khata Synchronizer
 * Replays queued append-only deltas in strict chronological order (ORDER BY timestamp ASC)
 * ensuring atomic relative balance adjustment on the master server without race conditions.
 */
export const syncOfflineKhataEvents = async (nativeDb?: any): Promise<{ processed: number; success: boolean }> => {
  let processed = 0;

  try {
    const syncCandidates = await getSyncCandidates();

    // 1. Direct Native SQLite query if native connection provided
    if (nativeDb && typeof nativeDb.query === 'function') {
      const pendingEvents = await nativeDb.query('SELECT * FROM offline_khata WHERE synced = 0 ORDER BY timestamp ASC');
      const rows = pendingEvents?.values || [];
      if (rows.length === 0) return { processed: 0, success: true };

      console.log(`🔄 Syncing ${rows.length} offline Khata events via native SQLite...`);

      for (const event of rows) {
        try {
          const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
          let eventSynced = false;

          for (const baseUrl of syncCandidates) {
            try {
              const response = await fetch(`${baseUrl}/api/khata/charge`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-pos-client': 'store-pos'
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(5000)
              });

              if (response.ok) {
                await nativeDb.run('UPDATE offline_khata SET synced = 1 WHERE id = ?', [event.id]);
                processed++;
                eventSynced = true;
                break;
              } else if (response.status === 404) {
                // Try next candidate
                continue;
              } else if (response.status >= 400 && response.status < 500) {
                // Non-retryable bad data (e.g. malformed or invalid customer)
                console.error(`⚠️ Permanent 4xx error for event ${event.id} (HTTP ${response.status}). Moving to dead-letter.`);
                await nativeDb.run('UPDATE offline_khata SET synced = 2 WHERE id = ?', [event.id]);
                eventSynced = true;
                break;
              }
            } catch {}
          }

          if (!eventSynced) {
            console.warn(`⚠️ Failed to sync Khata event ${event.id} across all candidates, will retry next loop.`);
            break; // Stop replaying on network failure to preserve chronological order
          }
        } catch (error) {
          console.warn(`⚠️ Failed to process Khata event ${event.id}:`, error);
          break;
        }
      }

      return { processed, success: true };
    }

    // 2. Universal fallback (supports Native SQLite connection pool + LocalStorage fallback)
    const db = await getNativeDb();
    const pendingEvents = await getOfflineKhataEvents(db);

    if (pendingEvents.length === 0) return { processed: 0, success: true };

    console.log(`🔄 Syncing ${pendingEvents.length} offline Khata events...`);

    for (const event of pendingEvents) {
      try {
        const eventId = event.dbId || event.id;
        const payload = {
          customerId: event.customerId || event.customer_id,
          amount: Number(event.amount),
          invoiceNo: event.invoiceNo || event.reference || generateCompliantInvoiceNumber()
        };
        let eventSynced = false;

        for (const baseUrl of syncCandidates) {
          try {
            const response = await fetch(`${baseUrl}/api/khata/charge`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-pos-client': 'store-pos'
              },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(5000)
            });

            if (response.ok) {
              await markOfflineKhataSynced(eventId, db);
              processed++;
              eventSynced = true;
              break;
            } else if (response.status === 404) {
              continue;
            } else if (response.status >= 400 && response.status < 500) {
              console.error(`⚠️ Permanent 4xx error for event ${eventId} (HTTP ${response.status}). Quarantining dead letter.`);
              await markOfflineKhataSynced(eventId, db);
              eventSynced = true;
              break;
            }
          } catch {}
        }

        if (!eventSynced) {
          console.warn(`⚠️ Failed to sync Khata event ${eventId} across candidates, will retry next loop.`);
          break;
        }
      } catch (error) {
        console.warn(`⚠️ Failed to sync Khata event:`, error);
        break;
      }
    }

    return { processed, success: true };
  } catch (err) {
    console.error('❌ CRITICAL: Error in syncOfflineKhataEvents:', err);
    return { processed, success: false };
  }
};

/**
 * ⚡ CRDT Event-Sourced Offline Khata Settlement / Repayment Synchronizer
 * Replays queued debt settlements in strict chronological order, ensuring customer balances
 * and ledger payments are reconciled across cloud and local servers.
 */
export const syncOfflineKhataSettlements = async (nativeDb?: any): Promise<{ processed: number; success: boolean }> => {
  let processed = 0;

  try {
    const syncCandidates = await getSyncCandidates();

    // 1. Direct Native SQLite query if native connection provided
    if (nativeDb && typeof nativeDb.query === 'function') {
      const pendingRes = await nativeDb.query('SELECT * FROM offline_khata_settlements WHERE synced = 0 ORDER BY timestamp ASC');
      const rows = pendingRes?.values || [];
      if (rows.length === 0) return { processed: 0, success: true };

      console.log(`🔄 Syncing ${rows.length} offline Khata settlements via native SQLite...`);

      for (const row of rows) {
        try {
          const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
          const customerId = payload.customerId || payload.customer_id;
          if (!customerId) {
            await nativeDb.run('UPDATE offline_khata_settlements SET synced = 2 WHERE id = ?', [row.id]);
            continue;
          }

          let settlementSynced = false;
          for (const baseUrl of syncCandidates) {
            try {
              // Try customer-specific settle endpoint first, fallback to /api/khata/pay
              let response = await fetch(`${baseUrl}/api/customers/${customerId}/settle`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-pos-client': 'store-pos'
                },
                body: JSON.stringify({
                  amount: Number(payload.amount),
                  paymentMethod: payload.paymentMethod || 'CASH',
                  reference: payload.reference || payload.receiptNo,
                  paymentTarget: payload.paymentTarget || payload.target,
                  target: payload.target || payload.paymentTarget,
                  messId: (payload.messId && payload.messId !== 'ALL_MESSES') ? payload.messId : null,
                  mess_id: (payload.mess_id && payload.mess_id !== 'ALL_MESSES') ? payload.mess_id : null
                }),
                signal: AbortSignal.timeout(5000)
              });

              if (response.status === 404) {
                response = await fetch(`${baseUrl}/api/khata/pay`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-pos-client': 'store-pos'
                  },
                  body: JSON.stringify({
                    customerId,
                    amount: Number(payload.amount),
                    paymentMethod: payload.paymentMethod || 'CASH',
                    reference: payload.reference || payload.receiptNo,
                    paymentTarget: payload.paymentTarget || payload.target,
                    target: payload.target || payload.paymentTarget,
                    messId: (payload.messId && payload.messId !== 'ALL_MESSES') ? payload.messId : null,
                    mess_id: (payload.mess_id && payload.mess_id !== 'ALL_MESSES') ? payload.mess_id : null
                  }),
                  signal: AbortSignal.timeout(5000)
                });
              }

              if (response.ok) {
                await nativeDb.run('UPDATE offline_khata_settlements SET synced = 1 WHERE id = ?', [row.id]);
                processed++;
                settlementSynced = true;
                break;
              } else if (response.status >= 400 && response.status < 500 && response.status !== 404) {
                console.error(`⚠️ Permanent 4xx error for settlement ${row.id} (HTTP ${response.status}). Quarantining.`);
                await nativeDb.run('UPDATE offline_khata_settlements SET synced = 2 WHERE id = ?', [row.id]);
                settlementSynced = true;
                break;
              }
            } catch {}
          }

          if (!settlementSynced) {
            console.warn(`⚠️ Failed to sync settlement ${row.id} across candidates, will retry.`);
            break;
          }
        } catch (rowErr) {
          console.warn(`⚠️ Failed to process settlement ${row.id}:`, rowErr);
          break;
        }
      }

      return { processed, success: true };
    }

    // 2. Universal fallback (supports Native SQLite connection pool + LocalStorage fallback)
    const db = await getNativeDb();
    const pendingSettlements = await getOfflineKhataSettlements(db);

    if (pendingSettlements.length === 0) return { processed: 0, success: true };

    console.log(`🔄 Syncing ${pendingSettlements.length} offline Khata settlements...`);

    for (const item of pendingSettlements) {
      try {
        const sId = item.dbId || item.id;
        const customerId = item.customerId || item.customer_id;
        if (!customerId) {
          await markOfflineKhataSettlementSynced(sId, db);
          continue;
        }

        let synced = false;
        for (const baseUrl of syncCandidates) {
          try {
            let response = await fetch(`${baseUrl}/api/customers/${customerId}/settle`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-pos-client': 'store-pos'
              },
              body: JSON.stringify({
                amount: Number(item.amount),
                paymentMethod: item.paymentMethod || 'CASH',
                reference: item.reference || item.receiptNo,
                paymentTarget: item.paymentTarget || item.target,
                target: item.target || item.paymentTarget,
                messId: (item.messId && item.messId !== 'ALL_MESSES') ? item.messId : null,
                mess_id: (item.mess_id && item.mess_id !== 'ALL_MESSES') ? item.mess_id : null
              }),
              signal: AbortSignal.timeout(5000)
            });

            if (response.status === 404) {
              response = await fetch(`${baseUrl}/api/khata/pay`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-pos-client': 'store-pos'
                },
                body: JSON.stringify({
                  customerId,
                  amount: Number(item.amount),
                  paymentMethod: item.paymentMethod || 'CASH',
                  reference: item.reference || item.receiptNo,
                  paymentTarget: item.paymentTarget || item.target,
                  target: item.target || item.paymentTarget,
                  messId: (item.messId && item.messId !== 'ALL_MESSES') ? item.messId : null,
                  mess_id: (item.mess_id && item.mess_id !== 'ALL_MESSES') ? item.mess_id : null
                }),
                signal: AbortSignal.timeout(5000)
              });
            }

            if (response.ok) {
              await markOfflineKhataSettlementSynced(sId, db);
              processed++;
              synced = true;
              break;
            } else if (response.status >= 400 && response.status < 500 && response.status !== 404) {
              console.error(`⚠️ Permanent 4xx error for settlement ${sId} (HTTP ${response.status}). Quarantining.`);
              await markOfflineKhataSettlementSynced(sId, db);
              synced = true;
              break;
            }
          } catch {}
        }

        if (!synced) {
          console.warn(`⚠️ Failed to sync settlement ${sId} across candidates, will retry.`);
          break;
        }
      } catch (err) {
        console.warn(`⚠️ Failed to sync settlement item:`, err);
        break;
      }
    }

    return { processed, success: true };
  } catch (err) {
    console.error('❌ CRITICAL: Error in syncOfflineKhataSettlements:', err);
    return { processed, success: false };
  }
};

