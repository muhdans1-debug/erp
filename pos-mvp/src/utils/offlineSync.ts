// pos-mvp/src/utils/offlineSync.ts
import { getNativeDb, getOfflineKhataEvents, markOfflineKhataSynced } from './nativeDb';
import { resolveMasterServer } from './network';
import { generateCompliantInvoiceNumber } from './nbrInvoice';

/**
 * ⚡ CRDT Event-Sourced Offline Khata Synchronizer
 * Replays queued append-only deltas in strict chronological order (ORDER BY timestamp ASC)
 * ensuring atomic relative balance adjustment on the master server without race conditions.
 */
export const syncOfflineKhataEvents = async (nativeDb?: any): Promise<{ processed: number; success: boolean }> => {
  let processed = 0;

  try {
    // 1. Direct Native SQLite query if native connection provided
    if (nativeDb && typeof nativeDb.query === 'function') {
      const pendingEvents = await nativeDb.query('SELECT * FROM offline_khata WHERE synced = 0 ORDER BY timestamp ASC');
      const rows = pendingEvents?.values || [];
      if (rows.length === 0) return { processed: 0, success: true };

      console.log(`🔄 Syncing ${rows.length} offline Khata events via native SQLite...`);

      // Resolve Master PC endpoint
      let masterUrl = 'http://askar-master.local:3000';
      try {
        const resolved = await resolveMasterServer();
        if (resolved) masterUrl = resolved;
      } catch {}

      for (const event of rows) {
        try {
          const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;

          // Dispatch the delta to the master server
          const response = await fetch(`${masterUrl}/api/khata/charge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5000)
          });

          if (response.ok) {
            // Mark as synced locally so it never double-charges
            await nativeDb.run('UPDATE offline_khata SET synced = 1 WHERE id = ?', [event.id]);
            processed++;
          } else {
            console.warn(`⚠️ Master server rejected Khata event ${event.id} (HTTP ${response.status})`);
            break; // Stop replaying on failure to preserve causality
          }
        } catch (error) {
          console.warn(`⚠️ Failed to sync Khata event ${event.id}, will retry next loop.`, error);
          break; // Stop replaying on the first network failure to preserve chronological order
        }
      }

      return { processed, success: true };
    }

    // 2. Universal fallback (supports Native SQLite connection pool + LocalStorage fallback)
    const db = await getNativeDb();
    const pendingEvents = await getOfflineKhataEvents(db);

    if (pendingEvents.length === 0) return { processed: 0, success: true };

    console.log(`🔄 Syncing ${pendingEvents.length} offline Khata events...`);

    let masterUrl = 'http://askar-master.local:3000';
    try {
      const resolved = await resolveMasterServer();
      if (resolved) masterUrl = resolved;
    } catch {}

    for (const event of pendingEvents) {
      try {
        const eventId = event.dbId || event.id;
        const payload = {
          customerId: event.customerId || event.customer_id,
          amount: Number(event.amount),
          invoiceNo: event.invoiceNo || event.reference || generateCompliantInvoiceNumber()
        };

        const response = await fetch(`${masterUrl}/api/khata/charge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
          await markOfflineKhataSynced(eventId, db);
          processed++;
        } else {
          console.warn(`⚠️ Master server returned ${response.status} for event ${eventId}`);
          break; // Preserve causal ordering
        }
      } catch (error) {
        console.warn(`⚠️ Failed to sync Khata event ${event.id}, will retry next loop.`, error);
        break; // Stop replaying on the first network failure to preserve chronological order
      }
    }

    return { processed, success: true };
  } catch (err) {
    console.error('❌ CRITICAL: Error in syncOfflineKhataEvents:', err);
    return { processed, success: false };
  }
};

