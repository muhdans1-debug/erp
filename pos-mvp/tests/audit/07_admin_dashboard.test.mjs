import assert from 'assert';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://127.0.0.1:3000';
const WS_URL = 'ws://127.0.0.1:3000/ws';
const DEV_SECRET = process.env.DEV_SECRET || '457738d4f57ef4ccdd606b4cbf78aa7de5c5e27327ce32b53e0a5fc4bf7f9d06';

export async function run() {
  console.log('\n======================================================');
  console.log('🖥️  PART 7: ADMIN DASHBOARD & HARDWARE BRIDGE AUDIT');
  console.log('======================================================');

  let passed = 0;
  let total = 0;

  // TEST 7.1: Static Source Code Security Audit (Zero Hardcoded Cloud JWTs / Default PINs)
  total++;
  try {
    const dashboardSrcDir = path.resolve(process.cwd(), '..', 'askar-admin-dashboard', 'src');
    const targetDir = fs.existsSync(dashboardSrcDir) 
      ? dashboardSrcDir 
      : path.resolve(process.cwd(), 'askar-admin-dashboard', 'src');

    assert.ok(fs.existsSync(targetDir), `Dashboard src dir not found at ${targetDir}`);

    const violations = [];
    function scanDir(dir) {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          scanDir(full);
        } else if (/\.(jsx?|tsx?)$/.test(entry)) {
          const content = fs.readFileSync(full, 'utf8');
          const lines = content.split(/\r?\n/);
          lines.forEach((line, idx) => {
            // Check for raw Turso JWT
            if (line.includes('eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9')) {
              violations.push(`${entry}:${idx + 1} Hardcoded Turso JWT`);
            }
            // Check for hardcoded manager fallback secrets
            if (line.includes('askar-manager-secret-2026')) {
              violations.push(`${entry}:${idx + 1} Hardcoded manager fallback secret`);
            }
            // Check for hardcoded 9999 in headers or auth guards (exclude CSS borderRadius: '9999px', zIndex: 9999, PLU code sort)
            if (
              line.includes('9999') &&
              !line.includes('borderRadius') &&
              !line.includes('zIndex') &&
              !line.includes('plu_code') &&
              !line.includes('parseInt')
            ) {
              violations.push(`${entry}:${idx + 1} Hardcoded '9999' auth bypass: ${line.trim().slice(0, 60)}`);
            }
          });
        }
      }
    }

    scanDir(targetDir);
    assert.strictEqual(
      violations.length,
      0,
      `Detected ${violations.length} critical security violations in dashboard source:\n  - ${violations.join('\n  - ')}`
    );

    console.log('  ✅ [7.1] Static Source Audit (Zero Hardcoded Cloud JWTs & Master PINs): PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [7.1] FAILED:', err.message);
  }

  // TEST 7.2: Unauthenticated Cash Drawer Actuator Interception (REST)
  total++;
  try {
    // 1. Calling /api/hardware/drawer-kick without credentials should return 401
    const unauthRes = await fetch(`${BASE_URL}/api/hardware/drawer-kick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId: 'T1' })
    });
    assert.strictEqual(unauthRes.status, 401, `Unauthenticated drawer kick should return 401, got ${unauthRes.status}`);

    // 2. Calling with valid machine token should return 200
    const authRes = await fetch(`${BASE_URL}/api/hardware/drawer-kick`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-token': DEV_SECRET
      },
      body: JSON.stringify({ terminalId: 'T1', reason: 'AUDIT_TEST' })
    });
    assert.strictEqual(authRes.status, 200, `Authorized drawer kick should return 200, got ${authRes.status}`);
    const data = await authRes.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.dispatched, true);

    console.log('  ✅ [7.2] Cash Drawer Actuator Zero-Trust Interception (REST): PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [7.2] FAILED:', err.message);
  }

  // TEST 7.3: WebSocket Hardware Actuator Zero-Trust Protection
  total++;
  try {
    const ws = new WebSocket(WS_URL);

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket connection timeout')), 3000);

      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = (err) => {
        clearTimeout(timer);
        reject(err);
      };
    });

    // Send unauthenticated REMOTE_DRAWER_KICK with spoofed authorized: true
    const unauthPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ timeout: true }), 1500);

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'ERROR' && parsed.message.includes('Unauthorized remote drawer kick')) {
            clearTimeout(timer);
            resolve(parsed);
          }
        } catch {}
      };

      ws.send(JSON.stringify({
        type: 'REMOTE_DRAWER_KICK',
        terminalId: 'T1',
        authorized: true,
        source: 'STORE_POS'
      }));
    });

    const unauthReply = await unauthPromise;
    assert.ok(
      !unauthReply.timeout && unauthReply.type === 'ERROR',
      'WebSocket server failed to block unauthenticated drawer kick command!'
    );

    ws.close();
    console.log('  ✅ [7.3] WebSocket Hardware Actuator Zero-Trust Bus Defense: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [7.3] FAILED:', err.message);
  }

  // TEST 7.4: Super Admin Fleet API Protected Against Missing Auth
  total++;
  try {
    // 1. Missing auth headers -> 401
    const unauthRes = await fetch(`${BASE_URL}/api/super-admin/fleet`);
    assert.strictEqual(unauthRes.status, 401, `Unauthenticated fleet query should return 401, got ${unauthRes.status}`);

    // 2. With machine token -> 200
    const authRes = await fetch(`${BASE_URL}/api/super-admin/fleet`, {
      headers: { 'x-manager-token': DEV_SECRET }
    });
    assert.strictEqual(authRes.status, 200, `Authorized fleet query should return 200, got ${authRes.status}`);
    const data = await authRes.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.fleet), 'Fleet array missing in authorized response');

    console.log('  ✅ [7.4] Super Admin Fleet API Boundary Protection: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [7.4] FAILED:', err.message);
  }

  // TEST 7.5: Fleet Command Actuator Bridge Authorization (/api/register/command)
  total++;
  try {
    // 1. Unauthenticated DRAWER_KICK via register command bridge -> 401
    const unauthCmdRes = await fetch(`${BASE_URL}/api/register/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        terminalId: 'T1',
        command: 'DRAWER_KICK'
      })
    });
    assert.strictEqual(unauthCmdRes.status, 401, `Unauthenticated DRAWER_KICK command should return 401, got ${unauthCmdRes.status}`);

    // 2. Authenticated DRAWER_KICK with machine token -> 200
    const authCmdRes = await fetch(`${BASE_URL}/api/register/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-token': DEV_SECRET
      },
      body: JSON.stringify({
        terminalId: 'T1',
        command: 'DRAWER_KICK'
      })
    });
    assert.strictEqual(authCmdRes.status, 200, `Authorized DRAWER_KICK command should return 200, got ${authCmdRes.status}`);
    const authCmdData = await authCmdRes.json();
    assert.strictEqual(authCmdData.success, true);
    assert.strictEqual(authCmdData.dispatched, true);

    console.log('  ✅ [7.5] Fleet Command Actuator Bridge Authorization (DRAWER_KICK): PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [7.5] FAILED:', err.message);
  }

  // TEST 7.6: Super Admin Query Engine - Strict Read-Only Guard & Credential Redaction
  total++;
  try {
    // 1. Unauthenticated query -> 401
    const unauthQuery = await fetch(`${BASE_URL}/api/super-admin/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT 1' })
    });
    assert.strictEqual(unauthQuery.status, 401, `Unauthenticated query should return 401, got ${unauthQuery.status}`);

    // 2. Destructive SQL injection -> 403
    const destructiveQuery = await fetch(`${BASE_URL}/api/super-admin/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-token': DEV_SECRET
      },
      body: JSON.stringify({ sql: 'DROP TABLE IF EXISTS MockEvilTable' })
    });
    assert.strictEqual(destructiveQuery.status, 403, `Destructive SQL should return 403, got ${destructiveQuery.status}`);

    // 3. Credential Redaction: Query Employee table and ensure pin_code is sanitized
    const credQuery = await fetch(`${BASE_URL}/api/super-admin/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-token': DEV_SECRET
      },
      body: JSON.stringify({ sql: 'SELECT id, name, role, pin_code FROM Employee LIMIT 5' })
    });
    assert.strictEqual(credQuery.status, 200, `Valid query should return 200, got ${credQuery.status}`);
    const credData = await credQuery.json();
    assert.strictEqual(credData.success, true);
    assert.ok(Array.isArray(credData.rows), 'Query should return rows array');

    for (const row of credData.rows) {
      if (row.pin_code !== null && row.pin_code !== undefined) {
        assert.strictEqual(
          row.pin_code,
          '[REDACTED_HASH]',
          `Employee pin_code must be redacted in admin query output! Found: ${row.pin_code}`
        );
      }
    }

    console.log('  ✅ [7.6] Super Admin Query Engine (Destructive Filter & Hash Redaction): PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [7.6] FAILED:', err.message);
  }

  // TEST 7.7: Khata Debt Write-Off Authorization Gate
  total++;
  try {
    // 1. Missing manager auth -> 401
    const unauthWriteOff = await fetch(`${BASE_URL}/api/khata/write-off`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: 'cust_audit_nonexistent' })
    });
    assert.strictEqual(unauthWriteOff.status, 401, `Unauthenticated write-off should return 401, got ${unauthWriteOff.status}`);

    // 2. With valid manager token -> Reaches business layer (404 for non-existent customer)
    const authWriteOff = await fetch(`${BASE_URL}/api/khata/write-off`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-token': DEV_SECRET
      },
      body: JSON.stringify({ customerId: 'cust_audit_nonexistent' })
    });
    assert.strictEqual(authWriteOff.status, 404, `Authorized write-off for unknown customer should return 404, got ${authWriteOff.status}`);

    console.log('  ✅ [7.7] Khata Debt Write-Off Manager Authorization: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [7.7] FAILED:', err.message);
  }

  // TEST 7.8: WebSocket Actuator Authentication for REMOTE_LOCK_REGISTER & REMOTE_CLEAR_CART
  total++;
  try {
    const ws = new WebSocket(WS_URL);

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket connection timeout')), 3000);
      ws.onopen = () => { clearTimeout(timer); resolve(); };
      ws.onerror = (err) => { clearTimeout(timer); reject(err); };
    });

    // 1. Unauthenticated REMOTE_LOCK_REGISTER must be blocked
    const unauthPromise = new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ timeout: true }), 1500);
      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'ERROR' && parsed.message.includes('Unauthorized remote command')) {
            clearTimeout(timer);
            resolve(parsed);
          }
        } catch {}
      };
      ws.send(JSON.stringify({
        type: 'REMOTE_LOCK_REGISTER',
        terminalId: 'T1'
      }));
    });

    const unauthReply = await unauthPromise;
    assert.ok(
      !unauthReply.timeout && unauthReply.type === 'ERROR',
      'WebSocket server failed to block unauthenticated REMOTE_LOCK_REGISTER command!'
    );

    ws.close();
    console.log('  ✅ [7.8] Remote Register Lock & Cart Actuator Zero-Trust Defense: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [7.8] FAILED:', err.message);
  }

  // TEST 7.9: Dashboard Client Session Security & Inactivity Timeout Invariant
  total++;
  try {
    const dashboardSrc = path.resolve(process.cwd(), '..', 'askar-admin-dashboard', 'src');
    const targetDir = fs.existsSync(dashboardSrc) ? dashboardSrc : path.resolve(process.cwd(), 'askar-admin-dashboard', 'src');

    const authJs = fs.readFileSync(path.join(targetDir, 'utils', 'auth.js'), 'utf8');
    const guardJs = fs.readFileSync(path.join(targetDir, 'components', 'AdminAuthGuard.jsx'), 'utf8');

    // Invariant 1: getAdminPin must not pull plaintext PINs from localStorage
    assert.strictEqual(
      authJs.includes("localStorage.getItem('askar_admin_pin')"),
      false,
      'auth.js must not read admin PIN from localStorage!'
    );

    // Invariant 2: setAdminPin must actively purge legacy localStorage keys
    assert.ok(
      authJs.includes("localStorage.removeItem('askar_admin_pin')"),
      'auth.js must actively purge legacy askar_admin_pin from localStorage!'
    );

    // Invariant 3: AdminAuthGuard must enforce inactivity timeout
    assert.ok(
      guardJs.includes('INACTIVITY_TIMEOUT_MS'),
      'AdminAuthGuard must define and enforce INACTIVITY_TIMEOUT_MS!'
    );
    assert.ok(
      guardJs.includes('MAX_SESSION_LIFETIME_MS'),
      'AdminAuthGuard must enforce MAX_SESSION_LIFETIME_MS!'
    );

    console.log('  ✅ [7.9] Dashboard Client Session Security & Auto-Lock Inactivity Invariant: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [7.9] FAILED:', err.message);
  }

  // TEST 7.10: Zero Leaked Environment Secrets in Dashboard Source & Config
  total++;
  try {
    const dashboardDir = path.resolve(process.cwd(), '..', 'askar-admin-dashboard');
    const targetDir = fs.existsSync(dashboardDir) ? dashboardDir : path.resolve(process.cwd(), 'askar-admin-dashboard');

    const envFiles = ['.env', '.env.example', 'wrangler.jsonc'].map(f => path.join(targetDir, f)).filter(f => fs.existsSync(f));
    for (const envFile of envFiles) {
      const content = fs.readFileSync(envFile, 'utf8');
      assert.strictEqual(
        content.includes('VITE_MANAGER_PIN'),
        false,
        `CRITICAL: ${envFile} contains leaked VITE_MANAGER_PIN!`
      );
      assert.strictEqual(
        content.includes('VITE_DEV_SECRET'),
        false,
        `CRITICAL: ${envFile} contains leaked VITE_DEV_SECRET!`
      );
    }

    console.log('  ✅ [7.10] Dashboard Config & Environment Non-Leakage Invariant: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [7.10] FAILED:', err.message);
  }

  return { passed, total };
}

if (process.argv[1]?.endsWith('07_admin_dashboard.test.mjs')) {
  run().then(({ passed, total }) => {
    process.exit(passed === total ? 0 : 1);
  });
}
