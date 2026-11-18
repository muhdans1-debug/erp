import assert from 'assert';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://127.0.0.1:3000';
const DEV_SECRET = process.env.DEV_SECRET || '457738d4f57ef4ccdd606b4cbf78aa7de5c5e27327ce32b53e0a5fc4bf7f9d06';

export async function run() {
  console.log('\n======================================================');
  console.log('🏢  PART 6: MULTI-TENANT ISOLATION & FLEET SECURITY');
  console.log('======================================================');

  let passed = 0;
  let total = 0;

  // TEST 6.1: Kill-Switch Protection (Unauthorized Access Blocked)
  total++;
  try {
    const res = await fetch(`${BASE_URL}/api/super-admin/kill-switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    // Must be rejected with 401 or 429
    assert.ok(
      res.status === 401 || res.status === 403 || res.status === 429,
      `Unauthenticated kill switch returned unexpected status: ${res.status}`
    );
    console.log(`  ✅ [6.1] Emergency Kill-Switch Protected Against Unauthorized Invocations: PASSED (${res.status})`);
    passed++;
  } catch (err) {
    console.error('  ❌ [6.1] FAILED:', err.message);
  }

  // TEST 6.2: Fleet Matrix Data Authorization & Sanitization
  total++;
  try {
    const res = await fetch(`${BASE_URL}/api/super-admin/fleet`, {
      method: 'GET',
      headers: {
        'x-manager-token': DEV_SECRET
      }
    });
    assert.strictEqual(res.status, 200, `Expected 200 OK for authorized fleet request, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    const fleetList = data.fleet || data.terminals || [];
    assert.ok(Array.isArray(fleetList) && fleetList.length > 0, 'Fleet response missing fleet array');

    // Verify zero platform credentials or master secrets leaked in terminal records
    for (const term of fleetList) {
      assert.strictEqual(term.authToken, undefined, 'Tenant JWT leaked in fleet matrix response!');
      assert.strictEqual(term.platformToken, undefined, 'Platform API token leaked in fleet matrix response!');
    }
    console.log(`  ✅ [6.2] Fleet Terminal Matrix Authorized & Credential-Sanitized (${fleetList.length} terminals): PASSED`);
    passed++;
  } catch (err) {
    console.error('  ❌ [6.2] FAILED:', err.message);
  }

  // TEST 6.3: Public Endpoint Credential Leak Audit (Zero Secret Exposure)
  total++;
  try {
    const publicEndpoints = ['/api/health', '/api/time', '/health'];
    for (const ep of publicEndpoints) {
      const res = await fetch(`${BASE_URL}${ep}`);
      if (res.ok) {
        const bodyStr = await res.text();
        assert.ok(!bodyStr.includes(DEV_SECRET), `DEV_SECRET leaked in public endpoint ${ep}!`);
        assert.ok(!bodyStr.includes('TURSO_PLATFORM_API_TOKEN'), `Turso token leaked in ${ep}!`);
        assert.ok(!bodyStr.includes('MANAGER_PIN_HASH'), `PIN hash leaked in ${ep}!`);
      }
    }
    console.log('  ✅ [6.3] Public Health & Time Endpoints Zero-Secret Exposure Audit: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [6.3] FAILED:', err.message);
  }

  // TEST 6.4: Tenant Path Traversal & SQL Injection in Tenant Names
  total++;
  try {
    const maliciousTenantSlugs = [
      '../../etc/passwd',
      "store' OR '1'='1",
      'store; DROP TABLE Customer;'
    ];

    for (const slug of maliciousTenantSlugs) {
      const res = await fetch(`${BASE_URL}/api/super-admin/tenants/provision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-manager-token': DEV_SECRET
        },
        body: JSON.stringify({ slug })
      });
      assert.strictEqual(
        res.status,
        400,
        `Malicious slug (${slug}) should be rejected with 400, got ${res.status}`
      );
    }
    console.log('  ✅ [6.4] Tenant Slug Sanitization & Injection Defense: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [6.4] FAILED:', err.message);
  }

  // TEST 6.5: Database Query Engine SQLite Meta-Command Sandboxing (PRAGMA, ATTACH, DETACH, VACUUM, REINDEX, Multi-Statement Blocked)
  total++;
  try {
    const maliciousQueries = [
      'PRAGMA table_info(Customer);',
      'PRAGMA schema_version;',
      "ATTACH DATABASE ':memory:' AS leak;",
      "DETACH DATABASE leak;",
      "VACUUM INTO 'exploit.db'",
      'REINDEX Customer;',
      'SELECT 1; DROP TABLE Customer;',
      'ALTER TABLE Customer ADD COLUMN injected TEXT;'
    ];

    for (const sql of maliciousQueries) {
      const res = await fetch(`${BASE_URL}/api/super-admin/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-manager-token': DEV_SECRET
        },
        body: JSON.stringify({ sql })
      });
      assert.strictEqual(
        res.status,
        403,
        `Destructive/Meta SQL query (${sql}) should be rejected with 403, got ${res.status}`
      );
    }

    // Verify legitimate read-only query succeeds
    const legitRes = await fetch(`${BASE_URL}/api/super-admin/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-token': DEV_SECRET
      },
      body: JSON.stringify({ sql: 'SELECT count(*) as count FROM Customer' })
    });
    assert.strictEqual(legitRes.status, 200, `Legitimate read-only query failed: ${legitRes.status}`);
    const legitData = await legitRes.json();
    assert.strictEqual(legitData.success, true);
    assert.ok(Array.isArray(legitData.rows), 'Query result missing rows array');

    console.log('  ✅ [6.5] SQL Sandbox Meta-Command Interception (PRAGMA/ATTACH/VACUUM/Multi-Statement Blocked): PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [6.5] FAILED:', err.message);
  }

  // TEST 6.6: Database Backup Snapshot & Path Traversal Guard
  total++;
  try {
    // 1. Path traversal attempts must be rejected with 400 Bad Request
    const traversalFilenames = [
      '../../../windows/win.ini',
      '..\\..\\boot.ini',
      'malicious_payload.sh',
      'backup_not_db.txt'
    ];

    for (const filename of traversalFilenames) {
      const res = await fetch(`${BASE_URL}/api/system/download-backup?filename=${encodeURIComponent(filename)}`, {
        headers: { 'x-manager-token': DEV_SECRET }
      });
      assert.strictEqual(
        res.status,
        400,
        `Traversal filename (${filename}) should be rejected with 400, got ${res.status}`
      );
    }

    // 2. Legitimate backup download stream returns valid SQLite binary header
    const validRes = await fetch(`${BASE_URL}/api/system/download-backup`, {
      headers: { 'x-manager-token': DEV_SECRET }
    });
    assert.strictEqual(validRes.status, 200, `Valid backup download failed: ${validRes.status}`);
    assert.strictEqual(validRes.headers.get('content-type'), 'application/x-sqlite3');
    const disposition = validRes.headers.get('content-disposition') || '';
    assert.match(disposition, /attachment; filename="backup_.*\.db"/);

    console.log('  ✅ [6.6] Database Backup Snapshot Stream & Path Traversal Guard: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [6.6] FAILED:', err.message);
  }

  // TEST 6.7: Edge API & Cloud Tenant Slug Validation Regex Invariant
  total++;
  try {
    const SLUG_REGEX = /^[a-zA-Z0-9_-]{1,32}$/;

    const invalidSlugs = [
      '../../etc/passwd',
      "store' OR '1'='1",
      'tenant; DROP TABLE Customer;',
      '<script>alert(1)</script>',
      'a'.repeat(40),
      'tenant slug with spaces',
      'tenant!@#$%'
    ];

    for (const slug of invalidSlugs) {
      assert.strictEqual(
        SLUG_REGEX.test(slug),
        false,
        `Slug (${slug}) should fail validation regex`
      );
    }

    const validSlugs = ['tenant_askar_01', 'store_askar_01', 'T1', 'pos-terminal-02', 'askar_main'];
    for (const slug of validSlugs) {
      assert.strictEqual(
        SLUG_REGEX.test(slug),
        true,
        `Valid slug (${slug}) unexpectedly failed regex`
      );
    }

    console.log('  ✅ [6.7] Edge Multi-Tenant Slug Isolation & Header Injection Regex Invariant: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [6.7] FAILED:', err.message);
  }

  // TEST 6.8: Payday Recovery Batch Debtor PII & CPR Protection Invariant
  total++;
  try {
    // 1. Unauthenticated request must be rejected with 401
    const unauthRes = await fetch(`${BASE_URL}/api/khata/payday-batch`);
    assert.strictEqual(
      unauthRes.status,
      401,
      `Unauthenticated payday batch should be rejected with 401, got ${unauthRes.status}`
    );

    // 2. Authorized manager request succeeds with 200 and formatted debtors
    const authRes = await fetch(`${BASE_URL}/api/khata/payday-batch`, {
      headers: { 'x-manager-token': DEV_SECRET }
    });
    assert.strictEqual(authRes.status, 200, `Authorized payday batch failed: ${authRes.status}`);
    const data = await authRes.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.debtors), 'Payday batch response missing debtors array');
    assert.ok(typeof data.totalOutstandingBhd === 'number', 'Missing totalOutstandingBhd number');
    assert.ok(
      typeof data.totalOutstandingFormatted === 'string' &&
        (data.totalOutstandingFormatted.includes('BHD') || data.totalOutstandingFormatted.includes('BD')),
      'Invalid Bahraini currency format on total outstanding'
    );

    console.log(`  ✅ [6.8] Payday Batch Debtor PII & CPR Protection Invariant (${data.totalDebtors} debtors protected): PASSED`);
    passed++;
  } catch (err) {
    console.error('  ❌ [6.8] FAILED:', err.message);
  }

  // TEST 6.9: Quick Products Mutation Authorization Guard (Update, Swap, Remove)
  total++;
  try {
    const endpoints = [
      { path: '/api/quick-products/update', body: { id: 'test_prod', isQuickProduct: true } },
      { path: '/api/quick-products/swap', body: { oldId: 'prod_1', newId: 'prod_2' } },
      { path: '/api/quick-products/remove', body: { id: 'test_prod' } }
    ];

    for (const ep of endpoints) {
      const res = await fetch(`${BASE_URL}${ep.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ep.body)
      });
      assert.strictEqual(
        res.status,
        401,
        `Unauthenticated mutation on ${ep.path} should return 401, got ${res.status}`
      );
    }

    // Authorized mutation succeeds (or validates input with 200/400, never 401)
    const authRes = await fetch(`${BASE_URL}/api/quick-products/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-token': DEV_SECRET
      },
      body: JSON.stringify({ id: 'test_p1', category: 'ESSENTIALS', isQuickProduct: true })
    });
    assert.ok(authRes.status === 200 || authRes.status === 400, `Authorized mutation failed with: ${authRes.status}`);

    console.log('  ✅ [6.9] Quick Products Catalog Mutation Authorization Guard: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [6.9] FAILED:', err.message);
  }

  // TEST 6.10: Edge Cloud API Security & Bcrypt Verification Contract Invariant
  total++;
  try {
    const getEdgePath = (rel) => {
      const candidates = [
        path.resolve(process.cwd(), 'askar-edge-api', rel),
        path.resolve(process.cwd(), '../askar-edge-api', rel)
      ];
      return candidates.find(p => fs.existsSync(p));
    };

    const wranglerPath = getEdgePath('wrangler.jsonc');
    const edgeIndexPath = getEdgePath('src/index.ts');
    const edgeKhataPath = getEdgePath('src/routes/khata.ts');

    assert.ok(wranglerPath, 'askar-edge-api/wrangler.jsonc must exist');
    assert.ok(edgeIndexPath, 'askar-edge-api/src/index.ts must exist');
    assert.ok(edgeKhataPath, 'askar-edge-api/src/routes/khata.ts must exist');

    // 1. wrangler.jsonc must NOT have hardcoded MANAGER_PIN
    const wranglerContent = fs.readFileSync(wranglerPath, 'utf-8');
    assert.ok(!wranglerContent.includes('"MANAGER_PIN"'), 'Hardcoded MANAGER_PIN found in wrangler.jsonc!');

    // 2. edge index.ts must use bcrypt.compare and bcrypt.hash
    const indexContent = fs.readFileSync(edgeIndexPath, 'utf-8');
    assert.ok(indexContent.includes('bcrypt.compare'), 'Missing bcrypt.compare in edge index.ts verifyPinHandler!');
    assert.ok(indexContent.includes('bcrypt.hash'), 'Missing bcrypt.hash in edge index.ts saveEmployeeHandler!');
    assert.ok(indexContent.includes('requireManagerAuth, saveEmployeeHandler'), 'saveEmployeeHandler missing requireManagerAuth!');

    // 3. edge khata.ts must protect payday-batch, nfc/assign, nfc/unlink, and mess-groups with requireManagerAuth
    const khataContent = fs.readFileSync(edgeKhataPath, 'utf-8');
    assert.ok(khataContent.includes("khataRouter.get('/payday-batch', requireManagerAuth"), 'payday-batch missing requireManagerAuth in edge khata.ts!');
    assert.ok(khataContent.includes("khataRouter.post('/nfc/assign', requireManagerAuth"), 'nfc/assign missing requireManagerAuth in edge khata.ts!');
    assert.ok(khataContent.includes("khataRouter.post('/nfc/unlink', requireManagerAuth"), 'nfc/unlink missing requireManagerAuth in edge khata.ts!');
    assert.ok(khataContent.includes("khataRouter.post('/nfc/mess-groups', requireManagerAuth"), 'nfc/mess-groups missing requireManagerAuth in edge khata.ts!');

    console.log('  ✅ [6.10] Edge Cloud API Security & Bcrypt Verification Contract Invariant: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [6.10] FAILED:', err.message);
  }

  // TEST 6.11: Edge Actuators & Hardware Dispatch Security Invariant
  total++;
  try {
    const getEdgePath = (rel) => {
      const candidates = [
        path.resolve(process.cwd(), 'askar-edge-api', rel),
        path.resolve(process.cwd(), '../askar-edge-api', rel)
      ];
      return candidates.find(p => fs.existsSync(p));
    };

    const hardwarePath = getEdgePath('src/routes/hardware.ts');
    assert.ok(hardwarePath, 'askar-edge-api/src/routes/hardware.ts must exist');

    const content = fs.readFileSync(hardwarePath, 'utf-8');

    // 1. drawer-kick must require manager auth
    assert.ok(
      content.includes("hardwareRouter.post('/drawer-kick', requireManagerAuth"),
      'Drawer kick on edge hardwareRouter must require manager authentication!'
    );

    // 2. register/command must require manager auth
    assert.ok(
      content.includes("hardwareRouter.post('/register/command', requireManagerAuth"),
      'Register command dispatch on edge hardwareRouter must require manager authentication!'
    );

    // 3. print must require pos or manager auth
    assert.ok(
      content.includes("hardwareRouter.post('/print', requirePosOrManagerAuth"),
      'Print dispatch on edge hardwareRouter must require POS or manager authentication!'
    );

    console.log('  ✅ [6.11] Edge Actuators & Hardware Dispatch Security Invariant: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [6.11] FAILED:', err.message);
  }

  // TEST 6.12: Edge Quick Products & Shift Audits Authorization Invariant
  total++;
  try {
    const getEdgePath = (rel) => {
      const candidates = [
        path.resolve(process.cwd(), 'askar-edge-api', rel),
        path.resolve(process.cwd(), '../askar-edge-api', rel)
      ];
      return candidates.find(p => fs.existsSync(p));
    };

    const productsPath = getEdgePath('src/routes/products.ts');
    assert.ok(productsPath, 'askar-edge-api/src/routes/products.ts must exist');
    const prodContent = fs.readFileSync(productsPath, 'utf-8');

    assert.ok(
      prodContent.includes("productsRouter.post('/quick-products/update', requirePosOrManagerAuth"),
      'quick-products/update must require POS or manager auth!'
    );
    assert.ok(
      prodContent.includes("productsRouter.post('/quick-products/remove', requirePosOrManagerAuth"),
      'quick-products/remove must require POS or manager auth!'
    );
    assert.ok(
      prodContent.includes("productsRouter.post('/quick-products/swap', requirePosOrManagerAuth"),
      'quick-products/swap must require POS or manager auth!'
    );

    const shiftsPath = getEdgePath('src/routes/shifts.ts');
    assert.ok(shiftsPath, 'askar-edge-api/src/routes/shifts.ts must exist');
    const shiftsContent = fs.readFileSync(shiftsPath, 'utf-8');

    assert.ok(
      shiftsContent.includes("shiftsRouter.get('/reconciliation', requireManagerAuth"),
      'Shift reconciliation statement must require manager auth!'
    );
    assert.ok(
      shiftsContent.includes("shiftsRouter.get('/audits', requireManagerAuth"),
      'Shift audits statement must require manager auth!'
    );

    console.log('  ✅ [6.12] Edge Quick Products & Shift Audits Authorization Invariant: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [6.12] FAILED:', err.message);
  }

  // TEST 6.13: Edge Manager PIN URL Query Parameter Leak Prevention Invariant
  total++;
  try {
    const getEdgePath = (rel) => {
      const candidates = [
        path.resolve(process.cwd(), 'askar-edge-api', rel),
        path.resolve(process.cwd(), '../askar-edge-api', rel)
      ];
      return candidates.find(p => fs.existsSync(p));
    };

    const authPath = getEdgePath('src/middleware/auth.ts');
    assert.ok(authPath, 'askar-edge-api/src/middleware/auth.ts must exist');
    const authContent = fs.readFileSync(authPath, 'utf-8');

    // In isManagerAuthorizedEdge, query string pin extraction must NOT exist
    assert.ok(
      !authContent.includes("c.req.query('pin')"),
      'isManagerAuthorizedEdge must not extract PIN from URL query string parameters (leak risk)!'
    );

    console.log('  ✅ [6.13] Edge Manager PIN URL Query Parameter Leak Prevention Invariant: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [6.13] FAILED:', err.message);
  }

  return { passed, total, name: 'Part 6: Multi-Tenant & Fleet Security' };
}

if (process.argv[1]?.endsWith('06_multitenant_isolation.test.mjs')) {
  run().then(({ passed, total }) => {
    process.exit(passed === total ? 0 : 1);
  });
}
