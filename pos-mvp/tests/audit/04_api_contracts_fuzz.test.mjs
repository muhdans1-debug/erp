import assert from 'assert';

const BASE_URL = 'http://127.0.0.1:3000';
const DEV_SECRET = process.env.DEV_SECRET || '457738d4f57ef4ccdd606b4cbf78aa7de5c5e27327ce32b53e0a5fc4bf7f9d06';

export async function run() {
  console.log('\n======================================================');
  console.log('🔌  PART 4: API CONTRACTS & INPUT FUZZING SUITE');
  console.log('======================================================');

  let passed = 0;
  let total = 0;

  // TEST 4.1: Destructive SQL Injection Interception on Query Engine
  total++;
  try {
    const destructiveQueries = [
      'DROP TABLE Customer;',
      'DELETE FROM Product WHERE 1=1;',
      'UPDATE Employee SET pin_code = 1234;',
      'TRUNCATE TABLE Sale;'
    ];

    for (const sql of destructiveQueries) {
      const res = await fetch(`${BASE_URL}/api/super-admin/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-manager-token': DEV_SECRET
        },
        body: JSON.stringify({ sql })
      });
      const data = await res.json();
      assert.strictEqual(
        res.status,
        403,
        `Destructive SQL (${sql}) was NOT blocked! Status: ${res.status}`
      );
      assert.match(data.error, /Forbidden.*read-only/i);
    }
    console.log('  ✅ [4.1] Destructive SQL Commands Blocked by Query Engine (403): PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [4.1] FAILED:', err.message);
  }

  // TEST 4.2: Fuzzed / Malformed Sales Request Fails Gracefully (No Server Crash)
  total++;
  try {
    const malformedPayloads = [
      { items: 'not_an_array' },
      { items: [{ id: 'prod_1', qty: 'invalid_number', price: -5.000 }] },
      { total: 'not_a_number' },
      {}
    ];

    for (const payload of malformedPayloads) {
      const res = await fetch(`${BASE_URL}/api/sales`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-manager-token': DEV_SECRET
        },
        body: JSON.stringify(payload)
      });
      // Fastify must return a client error (400) or handle without crashing the daemon
      assert.ok(
        res.status === 400 || res.status === 500,
        `Unexpected response status for malformed payload: ${res.status}`
      );
    }

    // Verify daemon is still alive and responsive after fuzzing
    const health = await fetch(`${BASE_URL}/api/health`);
    assert.strictEqual(health.status, 200, 'Server crashed after receiving malformed sales payload!');
    console.log('  ✅ [4.2] Sales Payload Fuzzing & Graceful Rejection: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [4.2] FAILED:', err.message);
  }

  // TEST 4.3: BigInt Barcode & Timestamp JSON Serialization Integrity
  total++;
  try {
    const res = await fetch(`${BASE_URL}/api/products`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const products = data.products || data || [];

    // Verify barcodes containing 13+ digit EAN numbers serialize safely
    for (const p of products.slice(0, 20)) {
      if (p.barcode) {
        assert.strictEqual(typeof p.barcode, 'string', `Barcode must serialize as string: ${p.barcode}`);
      }
    }
    console.log(`  ✅ [4.3] Safe BigInt & Large Number JSON Serialization: PASSED (${products.length} products audited)`);
    passed++;
  } catch (err) {
    console.error('  ❌ [4.3] FAILED:', err.message);
  }

  // TEST 4.4: Super-Admin Remote Query Input Sanitization (Empty/Null Guard)
  total++;
  try {
    const res = await fetch(`${BASE_URL}/api/super-admin/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-token': DEV_SECRET
      },
      body: JSON.stringify({ sql: '' })
    });
    assert.strictEqual(res.status, 400, `Empty SQL string should return 400, got ${res.status}`);
    console.log('  ✅ [4.4] Query Engine Empty Input Validation: PASSED (400)');
    passed++;
  } catch (err) {
    console.error('  ❌ [4.4] FAILED:', err.message);
  }

  // TEST 4.5: Checkout Idempotency Key Replay Verification
  total++;
  try {
    const testIdempotencyKey = `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const checkoutPayload = {
      idempotencyKey: testIdempotencyKey,
      items: [
        { id: 'item_test_1', name: 'Test Apple', price: 0.500, quantity: 1 }
      ],
      paymentType: 'CASH',
      terminalId: 'T1'
    };

    // First request: Process sale
    const firstRes = await fetch(`${BASE_URL}/api/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checkoutPayload)
    });
    assert.strictEqual(firstRes.status, 200, `First checkout request failed: ${firstRes.status}`);
    const firstData = await firstRes.json();
    assert.strictEqual(firstData.success, true);
    assert.ok(firstData.invoiceNo, 'First checkout missing invoiceNo');

    // Second request: Replay exact same request with same idempotency key
    const replayRes = await fetch(`${BASE_URL}/api/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checkoutPayload)
    });
    assert.strictEqual(replayRes.status, 200, `Replay request failed: ${replayRes.status}`);
    const replayData = await replayRes.json();
    assert.strictEqual(replayData.success, true);
    assert.strictEqual(replayData.idempotentReplay, true, 'Expected idempotentReplay flag on retry');
    assert.strictEqual(replayData.invoiceNo, firstData.invoiceNo, 'Replay returned different invoice number!');

    console.log(`  ✅ [4.5] Checkout Idempotency Replay (Invoice: ${firstData.invoiceNo}): PASSED`);
    passed++;
  } catch (err) {
    console.error('  ❌ [4.5] FAILED:', err.message);
  }

  // TEST 4.6: Negative Quantity and Price Fuzz Rejection
  total++;
  try {
    // 1. Negative quantity
    const negQtyRes = await fetch(`${BASE_URL}/api/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ id: 'bad_item_1', name: 'Tampered Qty', price: 1.000, quantity: -2 }]
      })
    });
    assert.strictEqual(negQtyRes.status, 400, `Negative quantity should return 400, got ${negQtyRes.status}`);

    // 2. Negative price
    const negPriceRes = await fetch(`${BASE_URL}/api/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ id: 'bad_item_2', name: 'Tampered Price', price: -5.000, quantity: 1 }]
      })
    });
    assert.strictEqual(negPriceRes.status, 400, `Negative price should return 400, got ${negPriceRes.status}`);

    console.log('  ✅ [4.6] Negative Quantity & Price Injection Rejection: PASSED (400)');
    passed++;
  } catch (err) {
    console.error('  ❌ [4.6] FAILED:', err.message);
  }

  // TEST 4.7: Produce Batch Negative Pricing Fuzz Defense
  total++;
  try {
    const produceRes = await fetch(`${BASE_URL}/api/products/produce/batch-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-token': DEV_SECRET
      },
      body: JSON.stringify({
        updates: [
          { id: 'prod_produce_1', name: 'Fuzzed Tomatoes', sellingPrice: -0.800 }
        ]
      })
    });
    assert.strictEqual(produceRes.status, 400, `Negative produce price should return 400, got ${produceRes.status}`);
    const data = await produceRes.json();
    assert.ok(data.error.includes('cannot be negative'), 'Missing expected price validation error');

    console.log('  ✅ [4.7] Produce Batch Negative Price Fuzz Defense: PASSED (400)');
    passed++;
  } catch (err) {
    console.error('  ❌ [4.7] FAILED:', err.message);
  }

  return { passed, total, name: 'Part 4: API Contracts & Input Fuzzing' };
}

if (process.argv[1]?.endsWith('04_api_contracts_fuzz.test.mjs')) {
  run().then(({ passed, total }) => {
    process.exit(passed === total ? 0 : 1);
  });
}
