import assert from 'assert';

const BASE_URL = 'http://127.0.0.1:3000';
const DEV_SECRET = process.env.DEV_SECRET || '457738d4f57ef4ccdd606b4cbf78aa7de5c5e27327ce32b53e0a5fc4bf7f9d06';

export async function run() {
  console.log('\n======================================================');
  console.log('🛡️  PART 1: AUTHENTICATION & ACCESS BOUNDARY SUITE');
  console.log('======================================================');

  let passed = 0;
  let total = 0;

  // TEST 1.1: Unauthenticated request with x-pos-client spoofing MUST be rejected
  total++;
  try {
    const res = await fetch(`${BASE_URL}/api/super-admin/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pos-client': 'store-pos'
      },
      body: JSON.stringify({ sql: 'SELECT 1' })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 401, `Expected 401 Unauthorized, got ${res.status}`);
    assert.match(data.error, /Manager authorization required/i);
    console.log('  ✅ [1.1] x-pos-client Header Spoofing Bypass Rejection: PASSED (401)');
    passed++;
  } catch (err) {
    console.error('  ❌ [1.1] FAILED:', err.message);
  }

  // TEST 1.2: Machine-to-machine authorized request using DEV_SECRET MUST succeed
  total++;
  try {
    const res = await fetch(`${BASE_URL}/api/super-admin/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-token': DEV_SECRET
      },
      body: JSON.stringify({ sql: 'SELECT 1 as test' })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    assert.strictEqual(data.success, true);
    console.log('  ✅ [1.2] Machine Token (x-manager-token) Handshake: PASSED (200)');
    passed++;
  } catch (err) {
    console.error('  ❌ [1.2] FAILED:', err.message);
  }

  // TEST 1.3: Invalid PIN must be rejected with 403 Forbidden
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
    assert.match(data.error, /Invalid Manager PIN/i);
    console.log('  ✅ [1.3] Invalid Manager PIN Rejection: PASSED (403)');
    passed++;
  } catch (err) {
    console.error('  ❌ [1.3] FAILED:', err.message);
  }

  // TEST 1.4: Valid Manager PIN verified against bcrypt database hash MUST succeed
  total++;
  try {
    const res = await fetch(`${BASE_URL}/api/super-admin/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-pin': '9999'
      },
      body: JSON.stringify({ sql: 'SELECT 1 as verified' })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    assert.strictEqual(data.success, true);
    console.log('  ✅ [1.4] Bcrypt-Hashed Manager PIN Verification: PASSED (200)');
    passed++;
  } catch (err) {
    console.error('  ❌ [1.4] FAILED:', err.message);
  }

  // TEST 1.5: Brute-Force Rate Limiting Lockout
  total++;
  try {
    let hitRateLimit = false;
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`${BASE_URL}/api/super-admin/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-manager-pin': `attack_pin_${i}`
        },
        body: JSON.stringify({ sql: 'SELECT 1' })
      });
      if (res.status === 429) {
        hitRateLimit = true;
        break;
      }
    }
    assert.strictEqual(hitRateLimit, true, 'Expected rate limit lockout (429) after failed attempts');
    console.log('  ✅ [1.5] Brute-Force IP Lockout (429 Too Many Requests): PASSED');
    passed++;

    // Unlock test IP via verified machine token for subsequent test suites
    await fetch(`${BASE_URL}/api/super-admin/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-token': DEV_SECRET
      },
      body: JSON.stringify({ sql: 'SELECT 1' })
    });
  } catch (err) {
    console.error('  ❌ [1.5] FAILED:', err.message);
  }

  // TEST 1.6: End-of-Day Z-Report Manager Authentication Protection
  total++;
  try {
    const unauthRes = await fetch(`${BASE_URL}/api/reports/z-report`);
    assert.strictEqual(unauthRes.status, 401, `Unauthenticated Z-Report query should return 401, got ${unauthRes.status}`);

    const authRes = await fetch(`${BASE_URL}/api/reports/z-report`, {
      headers: { 'x-manager-token': DEV_SECRET }
    });
    assert.strictEqual(authRes.status, 200, `Authorized Z-Report query should return 200, got ${authRes.status}`);
    const data = await authRes.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.report, 'Z-report payload missing report object');

    console.log('  ✅ [1.6] End-of-Day Z-Report Manager Authentication Protection: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [1.6] FAILED:', err.message);
  }

  // TEST 1.7: Duplicate Active Shift Conflict Defense (409)
  total++;
  try {
    const duplicateRes = await fetch(`${BASE_URL}/api/shifts/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cashierName: 'Auditor Cashier',
        openingCash: 50.000
      })
    });
    assert.strictEqual(
      duplicateRes.status, 
      409, 
      `Opening an overlapping shift should return 409 Conflict, got ${duplicateRes.status}`
    );
    const data = await duplicateRes.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.error.includes('already exists'), 'Error message missing expected duplicate indication');

    console.log('  ✅ [1.7] Duplicate Active Shift Conflict Defense (409): PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [1.7] FAILED:', err.message);
  }

  // TEST 1.8: Cashier PIN Verification & Non-Leakage Invariant (/api/employees/verify-pin)
  total++;
  try {
    // 1. Valid cashier PIN
    const validRes = await fetch(`${BASE_URL}/api/employees/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '1234' })
    });
    assert.strictEqual(validRes.status, 200, `Valid cashier PIN should return 200, got ${validRes.status}`);
    const validData = await validRes.json();
    assert.strictEqual(validData.success, true);
    assert.strictEqual(validData.employee.id, 'emp_cashier_1');
    assert.strictEqual(validData.employee.role, 'CASHIER');
    assert.strictEqual(validData.employee.pin_code, undefined, 'pin_code must never leak in employee response');

    // 2. Invalid cashier PIN
    const invalidRes = await fetch(`${BASE_URL}/api/employees/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '987654' })
    });
    assert.strictEqual(invalidRes.status, 401, `Invalid cashier PIN should return 401, got ${invalidRes.status}`);

    // 3. Empty PIN
    const emptyRes = await fetch(`${BASE_URL}/api/employees/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(emptyRes.status, 400, `Empty PIN should return 400, got ${emptyRes.status}`);

    console.log('  ✅ [1.8] Cashier PIN Verification & Non-Leakage Invariant: PASSED (200, 401, 400)');
    passed++;
  } catch (err) {
    console.error('  ❌ [1.8] FAILED:', err.message);
  }

  // TEST 1.9: Shift Close Authorization Guard (/api/shifts/close)
  total++;
  try {
    // 1. Unauthenticated shift close attempt MUST be rejected
    const unauthClose = await fetch(`${BASE_URL}/api/shifts/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closingCash: 50.000 })
    });
    assert.strictEqual(unauthClose.status, 401, `Unauthenticated shift close should return 401, got ${unauthClose.status}`);
    const unauthData = await unauthClose.json();
    assert.match(unauthData.error, /Shift close authorization required/i);

    // 2. Shift close with invalid PIN MUST be rejected
    const badPinClose = await fetch(`${BASE_URL}/api/shifts/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closingCash: 50.000, pin: '000000_BAD_PIN' })
    });
    assert.strictEqual(badPinClose.status, 401, `Shift close with invalid PIN should return 401, got ${badPinClose.status}`);

    console.log('  ✅ [1.9] Shift Close Authorization Guard: PASSED (401 Interception)');
    passed++;
  } catch (err) {
    console.error('  ❌ [1.9] FAILED:', err.message);
  }

  // TEST 1.10: Sales Checkout Cashier & Shift Identity Invariant
  total++;
  try {
    const saleRes = await fetch(`${BASE_URL}/api/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { productId: '105', name: 'White Sliced Bread', quantity: 1, priceAtSale: 0.400 }
        ],
        paymentType: 'CASH'
        // Intentionally omit employeeId to test automated binding
      })
    });
    assert.strictEqual(saleRes.status, 200, `Checkout should return 200, got ${saleRes.status}`);
    const saleData = await saleRes.json();
    assert.strictEqual(saleData.success, true);
    assert.ok(saleData.sale.employeeId, 'Sale employeeId must be populated and not null');
    assert.strictEqual(typeof saleData.sale.employeeId, 'string');
    assert.ok(saleData.sale.shiftId, 'Sale shiftId must be populated and not null');

    console.log(`  ✅ [1.10] Sales Checkout Cashier & Shift Identity Invariant: PASSED (Cashier: ${saleData.sale.employeeId})`);
    passed++;
  } catch (err) {
    console.error('  ❌ [1.10] FAILED:', err.message);
  }

  // TEST 1.11: Price Tampering Defense & Manager Elevation Invariant
  total++;
  try {
    // 1. Unauthenticated price tampering (Catalog price for 6084012463873 is BD 0.200; client sends BD 0.050)
    const tamperedRes = await fetch(`${BASE_URL}/api/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { productId: '6084012463873', name: 'Aleef Tissue', quantity: 1, priceAtSale: 0.050 }
        ],
        paymentType: 'CASH'
      })
    });
    assert.strictEqual(tamperedRes.status, 200);
    const tamperedData = await tamperedRes.json();
    // Server must have rejected BD 0.050 and enforced catalog price BD 0.200
    assert.strictEqual(tamperedData.sale.total, 0.200, `Price tampering was not clamped! Expected 0.200, got ${tamperedData.sale.total}`);

    // 2. Manager-authorized price override with manager PIN (Overrides BD 0.200 to BD 0.150)
    const overrideRes = await fetch(`${BASE_URL}/api/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-pin': '9999'
      },
      body: JSON.stringify({
        items: [
          { productId: '6084012463873', name: 'Aleef Tissue', quantity: 1, priceAtSale: 0.150 }
        ],
        paymentType: 'CASH'
      })
    });
    assert.strictEqual(overrideRes.status, 200);
    const overrideData = await overrideRes.json();
    assert.strictEqual(overrideData.sale.total, 0.150, `Manager price override was not respected! Expected 0.150, got ${overrideData.sale.total}`);

    console.log('  ✅ [1.11] Price Tampering Defense & Manager Elevation Invariant: PASSED (Clamped & Override)');
    passed++;
  } catch (err) {
    console.error('  ❌ [1.11] FAILED:', err.message);
  }

  // TEST 1.12: Client-Side Storage Audit (Zero Plaintext Manager PINs on Disk)
  total++;
  try {
    const fs = await import('fs');
    const path = await import('path');
    const getSrcFile = (rel) => {
      const candidates = [
        path.resolve(process.cwd(), rel),
        path.resolve(process.cwd(), 'pos-mvp', rel),
        path.resolve(process.cwd(), 'src', rel)
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
      }
      throw new Error(`File not found: ${rel}`);
    };

    const authUtilsCode = getSrcFile('src/utils/authUtils.ts');
    const mainCode = getSrcFile('src/main.tsx');

    // Invariant 1: setManagerSessionPin must never write to localStorage
    assert.strictEqual(
      authUtilsCode.includes("localStorage.setItem('askar_manager_pin'"),
      false,
      'CRITICAL: authUtils.ts must never write manager PIN to localStorage!'
    );

    // Invariant 2: localStorage manager PIN keys must be purged on init
    assert.ok(
      mainCode.includes("localStorage.removeItem('askar_manager_pin')"),
      'main.tsx must actively purge legacy askar_manager_pin from localStorage!'
    );

    // Invariant 3: getManagerPin must not pull plaintext PINs from localStorage
    assert.strictEqual(
      authUtilsCode.includes("localStorage.getItem('askar_manager_pin')"),
      false,
      'authUtils.ts must not read manager PIN from localStorage!'
    );

    console.log('  ✅ [1.12] Client-Side Storage Audit (Zero Plaintext PINs in LocalStorage): PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [1.12] FAILED:', err.message);
  }

  // TEST 1.13: Offline Employee Credential Caching Security Invariant (Zero Plaintext PINs)
  total++;
  try {
    const fs = await import('fs');
    const path = await import('path');
    const getSrcFile = (rel) => {
      const candidates = [
        path.resolve(process.cwd(), rel),
        path.resolve(process.cwd(), 'pos-mvp', rel),
        path.resolve(process.cwd(), 'src', rel)
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
      }
      throw new Error(`File not found: ${rel}`);
    };

    const loginCode = getSrcFile('src/pages/LoginScreen.tsx');

    // Invariant 1: Cached employee objects must use pin_hash
    assert.ok(
      loginCode.includes('pin_hash: hashedPin'),
      'LoginScreen.tsx must store pin_hash in askar_cached_employees'
    );

    // Invariant 2: Offline fallback must never check plaintext e.pin_code === cleanPin
    assert.strictEqual(
      loginCode.includes('String(e.pin_code).trim() === cleanPin'),
      false,
      'CRITICAL: LoginScreen.tsx must not fall back to plaintext e.pin_code comparison!'
    );

    // Invariant 3: SHA-256 Web Crypto hashing utilized for offline verification
    assert.ok(
      loginCode.includes('hashPinSha256(cleanPin)'),
      'LoginScreen.tsx must hash entered PIN via hashPinSha256 before cache check'
    );

    console.log('  ✅ [1.13] Offline Credential Caching (SHA-256 Non-Plaintext Invariant): PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [1.13] FAILED:', err.message);
  }

  // TEST 1.14: Terminal Role Isolation Invariant (Cashier Cannot Leak Manager Credentials)
  total++;
  try {
    const fs = await import('fs');
    const path = await import('path');
    const getSrcFile = (rel) => {
      const candidates = [
        path.resolve(process.cwd(), rel),
        path.resolve(process.cwd(), 'pos-mvp', rel),
        path.resolve(process.cwd(), 'src', rel)
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
      }
      throw new Error(`File not found: ${rel}`);
    };

    const authUtilsCode = getSrcFile('src/utils/authUtils.ts');

    // Invariant: getManagerPin enforces askar_role === MANAGER
    assert.ok(
      authUtilsCode.includes("activeRole !== 'MANAGER'"),
      'getManagerPin must return empty string when active role is not MANAGER'
    );

    // Invariant: verifyManagerPinAsync checks employee role === MANAGER
    assert.ok(
      authUtilsCode.includes("data.employee?.role === 'MANAGER'"),
      'verifyManagerPinAsync must strictly verify role is MANAGER'
    );

    console.log('  ✅ [1.14] Terminal Role Isolation Invariant (Cashier Credential Non-Leakage): PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [1.14] FAILED:', err.message);
  }

  return { passed, total, name: 'Part 1: Auth & Access Boundary' };
}

if (process.argv[1]?.endsWith('01_auth_boundary.test.mjs')) {
  run().then(({ passed, total }) => {
    process.exit(passed === total ? 0 : 1);
  });
}
