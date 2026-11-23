import assert from 'node:assert';
import { fastify } from '../api/server.js';

console.log('🧪 Starting Developer API Unit Test Suite...\n');

await fastify.ready();

// Test 1: Bad password returns 401
console.log('--- Test 1: Invalid Developer Password ---');
const badAuthRes = await fastify.inject({
  method: 'POST',
  url: '/api/dev/auth',
  payload: { password: 'WrongPassword123' }
});
assert.strictEqual(badAuthRes.statusCode, 401, 'Bad password should return 401');
const badBody = JSON.parse(badAuthRes.payload);
assert.strictEqual(badBody.success, false);
console.log('✅ Correctly rejected invalid developer password with 401.');

// Test 2: Correct password 'Anasanas1!' returns 200 + Developer JWT
console.log('\n--- Test 2: Valid Developer Password Authentication ---');
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
const devJwt = goodBody.token;
console.log('✅ Successfully authenticated with "Anasanas1!" and received Developer JWT.');

// Test 3: Unauthenticated access to /api/dev/customers is rejected
console.log('\n--- Test 3: Guard /api/dev/customers against Unauthenticated Access ---');
const unauthRes = await fastify.inject({
  method: 'GET',
  url: '/api/dev/customers'
});
assert.strictEqual(unauthRes.statusCode, 401, 'Unauthenticated request should return 401');
console.log('✅ Unauthenticated access to /api/dev/customers blocked with 401.');

// Test 4: Authenticated developer can fetch all accounts and KPIs
console.log('\n--- Test 4: Authenticated Customer Roster & KPI Fetch ---');
const custsRes = await fastify.inject({
  method: 'GET',
  url: '/api/dev/customers',
  headers: {
    authorization: `Bearer ${devJwt}`
  }
});
assert.strictEqual(custsRes.statusCode, 200, 'Authenticated request should return 200');
const custsBody = JSON.parse(custsRes.payload);
assert.strictEqual(custsBody.success, true);
assert(Array.isArray(custsBody.customers), 'Must return customers array');
assert(custsBody.stats, 'Must return stats object');
assert(typeof custsBody.stats.totalCustomers === 'number', 'Stats must include totalCustomers');
console.log(`✅ Successfully fetched ${custsBody.customers.length} customers. Stats:`, custsBody.stats);

// Test 5: Developer JWT inspects any customer tab bypassing device token
console.log('\n--- Test 5: Developer JWT Bypasses IDOR Device Lock ---');
if (custsBody.customers.length > 0) {
  const targetCust = custsBody.customers[0];
  const tabRes = await fastify.inject({
    method: 'GET',
    url: `/api/khata/${targetCust.id}/tab`,
    headers: {
      authorization: `Bearer ${devJwt}`,
      'x-khata-device-token': 'dev_token_mismatched_device_xyz'
    }
  });
  assert.strictEqual(tabRes.statusCode, 200, 'Developer JWT should bypass device mismatch');
  const tabBody = JSON.parse(tabRes.payload);
  assert.strictEqual(tabBody.success, true);
  assert.strictEqual(tabBody.id, targetCust.id);
  console.log(`✅ Developer JWT successfully bypassed IDOR lock for customer: ${tabBody.name}`);
}

console.log('\n🎉 ALL DEVELOPER API TESTS PASSED SUCCESSFULLY!\n');
process.exit(0);
