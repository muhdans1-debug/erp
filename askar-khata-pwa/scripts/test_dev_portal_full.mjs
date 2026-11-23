import assert from 'node:assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fastify } from '../api/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runDevPortalTestSuite() {
  console.log('🧪 Starting Full Developer Portal Verification Test Suite...\n');
  await fastify.ready();

  // Test 1: Wrong developer password
  console.log('[Test 1] Testing Auth Rejection with Invalid Password...');
  const badAuthRes = await fastify.inject({
    method: 'POST',
    url: '/api/dev/auth',
    payload: { password: 'WrongPassword123!' }
  });
  assert.strictEqual(badAuthRes.statusCode, 401, 'Bad password should return 401');
  const badBody = JSON.parse(badAuthRes.payload);
  assert.strictEqual(badBody.success, false);
  console.log(`✅ Passed: Wrong password rejected with 401: "${badBody.error}"`);

  // Test 2: Master password Anasanas1!
  console.log('\n[Test 2] Testing Auth Success with Master Password "Anasanas1!"...');
  const goodAuthRes = await fastify.inject({
    method: 'POST',
    url: '/api/dev/auth',
    payload: { password: 'Anasanas1!' }
  });
  assert.strictEqual(goodAuthRes.statusCode, 200, 'Valid password should return 200');
  const goodBody = JSON.parse(goodAuthRes.payload);
  assert.strictEqual(goodBody.success, true);
  assert(goodBody.token, 'Must return JWT token');
  assert.strictEqual(goodBody.role, 'DEVELOPER');
  const devToken = goodBody.token;
  console.log(`✅ Passed: Authenticated successfully! Received Developer JWT.`);

  // Test 3: Unauthenticated /api/dev/customers
  console.log('\n[Test 3] Testing /api/dev/customers access without token...');
  const unauthRes = await fastify.inject({
    method: 'GET',
    url: '/api/dev/customers'
  });
  assert.strictEqual(unauthRes.statusCode, 401, 'Unauthenticated request should return 401');
  console.log('✅ Passed: Unauthenticated request rejected with 401 Unauthorized.');

  // Test 4: Authenticated /api/dev/customers with Developer JWT
  console.log('\n[Test 4] Testing /api/dev/customers with Developer JWT...');
  const custsRes = await fastify.inject({
    method: 'GET',
    url: '/api/dev/customers',
    headers: {
      authorization: `Bearer ${devToken}`
    }
  });
  assert.strictEqual(custsRes.statusCode, 200, 'Authenticated request should return 200');
  const custsBody = JSON.parse(custsRes.payload);
  assert.strictEqual(custsBody.success, true);
  assert(Array.isArray(custsBody.customers), 'Must return customers array');
  assert(custsBody.stats, 'Must return stats object');
  assert(typeof custsBody.stats.totalCustomers === 'number', 'Stats must include totalCustomers');
  console.log(`✅ Passed: Successfully fetched ${custsBody.customers.length} customer accounts.`);
  console.log('   KPI Stats Summary:', custsBody.stats);

  const sampleCust = custsBody.customers[0];

  // Test 5: Verify Developer Session Bypasses Anti-IDOR Device Lock on Tab & Statement
  console.log(`\n[Test 5] Testing Khata Tab & Statement Inspection Bypass for Customer ${sampleCust.id} (${sampleCust.name})...`);
  const tabRes = await fastify.inject({
    method: 'GET',
    url: `/api/khata/${encodeURIComponent(sampleCust.id)}/tab`,
    headers: {
      authorization: `Bearer ${devToken}`,
      'x-khata-device-token': 'mismatched_unauthorized_device_token_99999'
    }
  });
  assert.strictEqual(tabRes.statusCode, 200, 'Developer JWT should bypass device mismatch on Tab');
  const tabBody = JSON.parse(tabRes.payload);
  assert.strictEqual(tabBody.success, true);
  assert.strictEqual(tabBody.id, sampleCust.id);
  console.log(`✅ Passed: Tab inspection bypass confirmed. Customer balance: ${tabBody.balance} BHD.`);

  const stmtRes = await fastify.inject({
    method: 'GET',
    url: `/api/khata/${encodeURIComponent(sampleCust.id)}?limit=10&offset=0`,
    headers: {
      authorization: `Bearer ${devToken}`
    }
  });
  assert.strictEqual(stmtRes.statusCode, 200, 'Developer JWT should bypass PIN gate on Statement');
  const stmtBody = JSON.parse(stmtRes.payload);
  assert.strictEqual(stmtBody.success, true);
  assert.strictEqual(Boolean(stmtBody.isLocked), false);
  console.log(`✅ Passed: Statement inspection bypass confirmed. Transactions: ${stmtBody.ledger?.length || 0}`);

  // Test 6: Verify Developer Can Freeze and Unfreeze Customer Account
  console.log(`\n[Test 6] Testing Developer Account Freeze & Unfreeze Toggle...`);
  const initialActive = sampleCust.is_active !== 0;
  // Freeze
  const freezeRes = await fastify.inject({
    method: 'POST',
    url: `/api/dev/customer/${encodeURIComponent(sampleCust.id)}/freeze`,
    headers: {
      authorization: `Bearer ${devToken}`
    },
    payload: { freeze: true }
  });
  assert.strictEqual(freezeRes.statusCode, 200, 'Freeze endpoint should return 200');
  const freezeData = JSON.parse(freezeRes.payload);
  assert.strictEqual(freezeData.success, true);
  assert.strictEqual(freezeData.is_active, 0);
  console.log(`✅ Passed: Successfully froze customer ${sampleCust.id}.`);

  // Restore back to original state
  const restoreRes = await fastify.inject({
    method: 'POST',
    url: `/api/dev/customer/${encodeURIComponent(sampleCust.id)}/freeze`,
    headers: {
      authorization: `Bearer ${devToken}`
    },
    payload: { freeze: !initialActive }
  });
  assert.strictEqual(restoreRes.statusCode, 200, 'Restore freeze endpoint should return 200');
  const restoreData = JSON.parse(restoreRes.payload);
  assert.strictEqual(restoreData.success, true);
  console.log(`✅ Passed: Restored customer ${sampleCust.id} active state back to ${restoreData.is_active}.`);

  // Test 7: Static Security & Routing Audit: Ensure zero public navigation links to /dev or /developer
  console.log('\n[Test 7] Auditing Public Navigation & Route Files for Stealth Guarantee...');
  const pwaSrcDir = join(__dirname, '..', 'src');
  const drawerContent = readFileSync(join(pwaSrcDir, 'components', 'HamburgerDrawer.jsx'), 'utf-8');
  const homeContent = readFileSync(join(pwaSrcDir, 'pages', 'HomeLookup.jsx'), 'utf-8');
  const appContent = readFileSync(join(pwaSrcDir, 'App.jsx'), 'utf-8');

  assert(!drawerContent.includes('/dev') && !drawerContent.toLowerCase().includes('developer'),
    'Stealth violation: Found /dev or developer references in HamburgerDrawer.jsx!');
  assert(!homeContent.includes('/dev') && !homeContent.toLowerCase().includes('developer'),
    'Stealth violation: Found /dev or developer references in HomeLookup.jsx!');
  assert(appContent.includes('path="/dev"') && appContent.includes('path="/developer"'),
    'App.jsx must declare /dev and /developer routes');
  console.log('✅ Passed: /dev routes registered secretly with zero public navigation clues.');

  console.log('\n🎉 ALL 7 DEVELOPER PORTAL INTEGRATION TESTS PASSED PERFECTLY!\n');
  process.exit(0);
}

runDevPortalTestSuite().catch((err) => {
  console.error('\n❌ Developer Portal Test Suite Failed:', err);
  process.exit(1);
});
