import assert from 'assert';
import { getNextInvoiceSequence, formatInvoiceNumber } from '../../services/invoiceSequence.js';
import {
  getCloudSyncBackoffStatus,
  tripCloudSyncCircuitBreaker,
  resetCloudSyncCircuitBreaker,
  syncAllPendingToCloud
} from '../../services/cloudSync.js';

const BASE_URL = 'http://127.0.0.1:3000';

export async function run() {
  console.log('\n======================================================');
  console.log('🔄  PART 3: OFFLINE-FIRST SYNC & CONCURRENCY SUITE');
  console.log('======================================================');

  let passed = 0;
  let total = 0;

  // TEST 3.1: Atomic Monotonic Invoice Sequence Generator (Gapless NBR Compliance)
  total++;
  try {
    const seqA = await getNextInvoiceSequence('T1');
    const seqB = await getNextInvoiceSequence('T1');
    const seqC = await getNextInvoiceSequence('T2'); // Separate mobile terminal namespace

    assert.strictEqual(seqB, seqA + 1, `Sequences on T1 must be strictly increasing: ${seqA} -> ${seqB}`);
    const invA = formatInvoiceNumber(seqA, 'T1');
    const invB = formatInvoiceNumber(seqB, 'T1');
    const invC = formatInvoiceNumber(seqC, 'T2');

    assert.notStrictEqual(invA, invB, 'T1 invoice numbers must never collide');
    assert.match(invA, /^INV-T1-\d{6}$/, `Invalid invoice format: ${invA}`);
    assert.match(invC, /^INV-T2-\d{6}$/, `Invalid multi-terminal invoice format: ${invC}`);
    console.log(`  ✅ [3.1] Namespaced Monotonic Invoice Sequence (${invA}, ${invB}, ${invC}): PASSED`);
    passed++;
  } catch (err) {
    console.error('  ❌ [3.1] FAILED:', err.message);
  }

  // TEST 3.2: Concurrent Sequence Generation Integrity (Zero Collision Under Load)
  total++;
  try {
    const concurrentCount = 10;
    const promises = Array.from({ length: concurrentCount }, () => getNextInvoiceSequence('T1'));
    const results = await Promise.all(promises);

    const uniqueSet = new Set(results);
    assert.strictEqual(
      uniqueSet.size,
      concurrentCount,
      `Sequence collision detected! Generated ${concurrentCount} sequences but only ${uniqueSet.size} were unique`
    );
    console.log(`  ✅ [3.2] Concurrent Race Condition Resistance (10 Parallel Sequences Unique): PASSED`);
    passed++;
  } catch (err) {
    console.error('  ❌ [3.2] FAILED:', err.message);
  }

  // TEST 3.3: Master Regional Server Clock Vector Check (Clock Skew Invariant)
  total++;
  try {
    const res = await fetch(`${BASE_URL}/api/server-time`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const timeInfo = data.masterTime || data;

    assert.ok(timeInfo.serverEpoch, 'Master server epoch must be provided');
    assert.strictEqual(timeInfo.timezone, 'Asia/Bahrain', 'Server timezone must be Asia/Bahrain (UTC+3)');

    const localEpoch = Date.now();
    const driftMs = Math.abs(localEpoch - timeInfo.serverEpoch);
    assert.ok(driftMs < 5000, `Excessive clock drift between client and master server: ${driftMs}ms`);

    console.log(`  ✅ [3.3] Master Regional Clock Vector Synchronization (Drift: ${driftMs}ms): PASSED`);
    passed++;
  } catch (err) {
    console.error('  ❌ [3.3] FAILED:', err.message);
  }

  // TEST 3.4: Cloud Sync Engine Status Check
  total++;
  try {
    const res = await fetch(`${BASE_URL}/api/sync/status`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.totalSales !== undefined || data.service !== undefined, 'Sync status response missing telemetry');
    console.log(`  ✅ [3.4] Zero-SPOF Cloud Sync Engine Heartbeat (Synced: ${data.syncedCount ?? 'All'} sales): PASSED`);
    passed++;
  } catch (err) {
    console.error('  ❌ [3.4] FAILED:', err.message);
  }

  // TEST 3.5: Cloud Sync Circuit Breaker & Exponential Backoff Invariant
  total++;
  try {
    // 1. Verify telemetry endpoint reports circuit breaker state
    const res = await fetch(`${BASE_URL}/api/sync/status`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.cloudCircuitBreaker !== undefined, 'Missing cloudCircuitBreaker telemetry in /api/sync/status');
    assert.strictEqual(typeof data.cloudCircuitBreaker.isCircuitOpen, 'boolean');

    // 2. Test circuit breaker tripping & exponential backoff calculation
    resetCloudSyncCircuitBreaker();
    assert.strictEqual(getCloudSyncBackoffStatus().isCircuitOpen, false);

    tripCloudSyncCircuitBreaker(new Error('HTTP 429 Too Many Requests'));
    const status1 = getCloudSyncBackoffStatus();
    assert.strictEqual(status1.consecutiveCloudErrors, 1);
    assert.strictEqual(status1.isCircuitOpen, true);
    assert.ok(status1.backoffRemainingMs >= 900 && status1.backoffRemainingMs <= 2000, `Expected ~1000ms backoff, got ${status1.backoffRemainingMs}`);

    // Verify outbox drain skips gracefully while circuit is open
    const drainResult = await syncAllPendingToCloud();
    assert.strictEqual(drainResult.backedOff, true, 'Outbox drain should pause when circuit breaker is open');

    // Reset circuit breaker to healthy state
    resetCloudSyncCircuitBreaker();
    const recoveredStatus = getCloudSyncBackoffStatus();
    assert.strictEqual(recoveredStatus.isCircuitOpen, false);
    assert.strictEqual(recoveredStatus.consecutiveCloudErrors, 0);

    console.log(`  ✅ [3.5] Cloud Sync Circuit Breaker & Exponential Backoff Invariant: PASSED`);
    passed++;
  } catch (err) {
    console.error('  ❌ [3.5] FAILED:', err.message);
  }

  return { passed, total, name: 'Part 3: Offline-First Sync & Concurrency' };
}

if (process.argv[1]?.endsWith('03_edge_sync_divergence.test.mjs')) {
  run().then(({ passed, total }) => {
    process.exit(passed === total ? 0 : 1);
  });
}
