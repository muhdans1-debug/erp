import assert from 'assert';

const BASE_URL = 'http://127.0.0.1:3000';
const DEV_SECRET = '457738d4f57ef4ccdd606b4cbf78aa7de5c5e27327ce32b53e0a5fc4bf7f9d06';

async function runAuthTests() {
  console.log('🧪 Starting Part 1: Authentication & Authorization Boundary Test Suite...\n');
  let passed = 0;
  let total = 0;

  // TEST 1: Unauthenticated request with x-pos-client header MUST fail (No spoofing bypass)
  total++;
  try {
    const res = await fetch(`${BASE_URL}/api/super-admin/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pos-client': 'store-pos' // Attacker spoofing POS register header
      },
      body: JSON.stringify({ sql: 'SELECT 1' })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 401, `Expected 401 Unauthorized, got ${res.status}`);
    assert.match(data.error, /Manager authorization required/i, 'Expected error message to require manager authorization');
    console.log('✅ TEST 1 PASSED: Unauthenticated x-pos-client spoofing successfully REJECTED (401)');
    passed++;
  } catch (err) {
    console.error('❌ TEST 1 FAILED:', err.message);
  }

  // TEST 2: Machine-to-machine authorized request using DEV_SECRET MUST succeed
  total++;
  try {
    const res = await fetch(`${BASE_URL}/api/super-admin/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-token': DEV_SECRET // Cryptographic pre-shared secret
      },
      body: JSON.stringify({ sql: 'SELECT 1 as test' })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    assert.strictEqual(data.success, true, 'Expected success: true');
    console.log('✅ TEST 2 PASSED: Machine token (x-manager-token) constant-time handshake AUTHORIZED (200)');
    passed++;
  } catch (err) {
    console.error('❌ TEST 2 FAILED:', err.message);
  }

  // TEST 3: Invalid PIN must be rejected with 403 Access Denied
  total++;
  try {
    const res = await fetch(`${BASE_URL}/api/super-admin/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-pin': '000000_WRONG_PIN'
      },
      body: JSON.stringify({ sql: 'SELECT 1' })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
    assert.match(data.error, /Invalid Manager PIN/i, 'Expected invalid PIN message');
    console.log('✅ TEST 3 PASSED: Invalid PIN cleanly rejected with 403 Forbidden');
    passed++;
  } catch (err) {
    console.error('❌ TEST 3 FAILED:', err.message);
  }

  // TEST 4: Valid Manager PIN verified against bcrypt database hash MUST succeed
  total++;
  try {
    const res = await fetch(`${BASE_URL}/api/super-admin/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-pin': '9999' // Matches Store Manager bcrypt hash in Employee DB
      },
      body: JSON.stringify({ sql: 'SELECT 1 as verified' })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    assert.strictEqual(data.success, true, 'Expected success: true');
    console.log('✅ TEST 4 PASSED: Valid bcrypt Manager PIN verified against Employee DB (200)');
    passed++;
  } catch (err) {
    console.error('❌ TEST 4 FAILED:', err.message);
  }

  // TEST 5: Rate Limiting & Lockout after repeated failed attempts
  total++;
  try {
    console.log('   Simulating 5 rapid brute-force attacks with wrong PINs...');
    let hitRateLimit = false;
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`${BASE_URL}/api/super-admin/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-manager-pin': `bad_pin_${i}`
        },
        body: JSON.stringify({ sql: 'SELECT 1' })
      });
      if (res.status === 429) {
        hitRateLimit = true;
        const data = await res.json();
        console.log(`   Attempt ${i + 1}: Rate limiter locked out attacker: "${data.error}"`);
        break;
      }
    }
    assert.strictEqual(hitRateLimit, true, 'Expected rate limit lockout (429) after failed attempts');
    console.log('✅ TEST 5 PASSED: Brute-force lockout triggered (429 Too Many Requests)');
    passed++;
  } catch (err) {
    console.error('❌ TEST 5 FAILED:', err.message);
  }

  console.log(`\n========================================`);
  console.log(`🏁 PART 1 AUTH TEST SUMMARY: ${passed}/${total} PASSED`);
  console.log(`========================================`);

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAuthTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
