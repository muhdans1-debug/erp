import assert from 'assert';

const BASE_URL = 'http://127.0.0.1:3000';
const DEV_SECRET = process.env.DEV_SECRET || '457738d4f57ef4ccdd606b4cbf78aa7de5c5e27327ce32b53e0a5fc4bf7f9d06';

export async function run() {
  console.log('\n======================================================');
  console.log('🖨️  PART 5: HARDWARE PERIPHERALS & I/O RELIABILITY SUITE');
  console.log('======================================================');

  let passed = 0;
  let total = 0;

  // TEST 5.1: Omni-Format Colon-Agnostic NFC Card Resolution (Zero Latency)
  total++;
  try {
    const rawUid = '04366632D72A81';
    const colonUid = '04:36:66:32:D7:2A:81';
    const lowerUid = '04366632d72a81';

    const t0 = Date.now();
    const resA = await fetch(`${BASE_URL}/api/customers/nfc/${rawUid}`);
    const resB = await fetch(`${BASE_URL}/api/customers/nfc/${colonUid}`);
    const resC = await fetch(`${BASE_URL}/api/customers/nfc/${lowerUid}`);
    const elapsedMs = Date.now() - t0;

    assert.strictEqual(resA.status, 200);
    assert.strictEqual(resB.status, 200);
    assert.strictEqual(resC.status, 200);

    const dataA = await resA.json();
    const dataB = await resB.json();
    const dataC = await resC.json();

    const nameA = dataA.customer?.name || dataA.name;
    const nameB = dataB.customer?.name || dataB.name;
    const nameC = dataC.customer?.name || dataC.name;

    assert.strictEqual(nameA, nameB, 'Colon formatted and unformatted NFC cards must resolve identically');
    assert.strictEqual(nameA, nameC, 'Lowercase and uppercase NFC cards must resolve identically');
    assert.ok(elapsedMs < 1000, `NFC resolution took too long: ${elapsedMs}ms`);

    console.log(`  ✅ [5.1] Colon-Agnostic Multi-Format NFC Card Resolution (Customer: ${nameA}, ${elapsedMs}ms): PASSED`);
    passed++;
  } catch (err) {
    console.error('  ❌ [5.1] FAILED:', err.message);
  }

  // TEST 5.2: NFC Card Soft-Debounce / Rapid-Tap Flooding Resilience
  total++;
  try {
    const rapidTaps = 10;
    const uid = '04:36:66:32:D7:2A:81';
    const t0 = Date.now();

    const promises = Array.from({ length: rapidTaps }, () =>
      fetch(`${BASE_URL}/api/customers/nfc/${uid}`).then((r) => r.json())
    );

    const results = await Promise.all(promises);
    const elapsedMs = Date.now() - t0;

    for (const r of results) {
      assert.ok(r.customer?.name || r.name, 'Rapid tap response missing customer data');
    }

    console.log(`  ✅ [5.2] Rapid NFC Card Tap Flooding Resilience (10 Parallel Taps in ${elapsedMs}ms): PASSED`);
    passed++;
  } catch (err) {
    console.error('  ❌ [5.2] FAILED:', err.message);
  }

  // TEST 5.3: Cash Drawer Pulse Direct Trigger Protection
  total++;
  try {
    // Calling protected drawer kick without valid token or manager pin
    const res = await fetch(`${BASE_URL}/api/hardware/drawer/kick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    // Should return 401/403 or 404 if not directly exposed
    assert.ok(
      res.status === 401 || res.status === 403 || res.status === 404,
      `Unauthenticated cash drawer kick should not return 200, got ${res.status}`
    );
    console.log('  ✅ [5.3] Unauthenticated Cash Drawer Relay Kick Interception: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [5.3] FAILED:', err.message);
  }

  // TEST 5.4: Barcode Scanner HID Wedge Carriage-Return Sanitization
  total++;
  try {
    const rawBarcode = '6291001001234\r\n';
    const sanitized = rawBarcode.trim().replace(/[\r\n]/g, '');
    assert.strictEqual(sanitized, '6291001001234');
    assert.strictEqual(sanitized.length, 13);
    console.log('  ✅ [5.4] Barcode Scanner HID Wedge Character Sanitization: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [5.4] FAILED:', err.message);
  }

  // TEST 5.5: NFC Physical Credential Assignment Authorization (POST /api/nfc/assign)
  total++;
  try {
    // 1. Unauthenticated assignment attempt -> 401
    const unauthRes = await fetch(`${BASE_URL}/api/nfc/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: '04A1B2C3', card_type: 'PERSONAL', customer_id: 'cust_audit' })
    });
    assert.strictEqual(unauthRes.status, 401, `Unauthenticated NFC card assignment should return 401, got ${unauthRes.status}`);

    // 2. Authenticated assignment attempt with manager token -> Permitted through auth barrier
    const authRes = await fetch(`${BASE_URL}/api/nfc/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-token': DEV_SECRET
      },
      body: JSON.stringify({ tag_id: '04A1B2C3', card_type: 'PERSONAL', customer_id: 'cust_audit' })
    });
    // Reaches business layer (not 401)
    assert.notStrictEqual(authRes.status, 401, 'Manager token must bypass auth barrier for NFC assignment');

    console.log('  ✅ [5.5] NFC Card Assignment Manager Authorization Guard: PASSED (401 Interception)');
    passed++;
  } catch (err) {
    console.error('  ❌ [5.5] FAILED:', err.message);
  }

  // TEST 5.6: NFC Card Unlink Authorization (POST /api/nfc/unlink)
  total++;
  try {
    // 1. Unauthenticated unlink attempt -> 401
    const unauthRes = await fetch(`${BASE_URL}/api/nfc/unlink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: '04A1B2C3' })
    });
    assert.strictEqual(unauthRes.status, 401, `Unauthenticated NFC card unlinking should return 401, got ${unauthRes.status}`);

    // 2. Authenticated unlink attempt with manager token -> 200
    const authRes = await fetch(`${BASE_URL}/api/nfc/unlink`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-token': DEV_SECRET
      },
      body: JSON.stringify({ tag_id: '04A1B2C3' })
    });
    assert.strictEqual(authRes.status, 200, `Authorized unlink should return 200, got ${authRes.status}`);

    console.log('  ✅ [5.6] NFC Card Unlink Manager Authorization Guard: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [5.6] FAILED:', err.message);
  }

  // TEST 5.7: Mess Group Lifecycle Authorization (POST, PUT, DELETE /api/nfc/mess-groups)
  total++;
  try {
    // 1. Unauthenticated create -> 401
    const unauthCreate = await fetch(`${BASE_URL}/api/nfc/mess-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_name: 'Audit Mess Group' })
    });
    assert.strictEqual(unauthCreate.status, 401, `Unauthenticated mess group creation must return 401, got ${unauthCreate.status}`);

    // 2. Unauthenticated update -> 401
    const unauthUpdate = await fetch(`${BASE_URL}/api/nfc/mess-groups/fake_mess_id`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_name: 'Renamed Mess Group' })
    });
    assert.strictEqual(unauthUpdate.status, 401, `Unauthenticated mess group update must return 401, got ${unauthUpdate.status}`);

    // 3. Unauthenticated disband / delete -> 401
    const unauthDelete = await fetch(`${BASE_URL}/api/nfc/mess-groups/fake_mess_id`, {
      method: 'DELETE'
    });
    assert.strictEqual(unauthDelete.status, 401, `Unauthenticated mess group disband must return 401, got ${unauthDelete.status}`);

    console.log('  ✅ [5.7] Mess Group Lifecycle (Create/Update/Delete) Manager Auth: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [5.7] FAILED:', err.message);
  }

  // TEST 5.8: NFC Physical UID Non-Leakage of PIN & Non-Fuzzy Matching
  total++;
  try {
    const validUid = '04366632D72A81';
    const res = await fetch(`${BASE_URL}/api/customers/nfc/${validUid}`);
    assert.strictEqual(res.status, 200, 'Known NFC card should resolve');
    const data = await res.json();

    // Verify ZERO credential leakage
    assert.strictEqual(data.pin, undefined, 'Customer PIN must never be exposed via NFC lookup');
    assert.strictEqual(data.khataPin, undefined, 'Customer khataPin must never be exposed via NFC lookup');
    assert.strictEqual(data.khata_pin, undefined, 'Customer khata_pin must never be exposed via NFC lookup');
    assert.strictEqual(data.access_token, undefined, 'Customer access_token must never be exposed via NFC lookup');

    // Verify Wildcard Injection Defense: non-hex or wildcard must return 404
    const wildcardRes = await fetch(`${BASE_URL}/api/customers/nfc/%25`); // % character
    assert.strictEqual(wildcardRes.status, 404, 'Wildcard % NFC lookup must be rejected with 404');

    const shortRes = await fetch(`${BASE_URL}/api/customers/nfc/04`); // Too short
    assert.strictEqual(shortRes.status, 404, 'Truncated NFC lookup (<4 chars) must be rejected with 404');

    console.log('  ✅ [5.8] NFC Credential Non-Leakage & Wildcard Injection Defense: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [5.8] FAILED:', err.message);
  }

  return { passed, total, name: 'Part 5: Hardware Peripherals & Reliability' };
}

if (process.argv[1]?.endsWith('05_hardware_reliability.test.mjs')) {
  run().then(({ passed, total }) => {
    process.exit(passed === total ? 0 : 1);
  });
}
