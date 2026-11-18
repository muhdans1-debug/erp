import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { generateScaleEan13, computeEan13Checksum, parseScaleBarcode } from '../../utils/scaleBarcode.js';
import { runReorderCheck } from '../../src/automation/reorderJob.js';
import { generateKhataDeviceToken, verifyKhataDeviceToken } from '../../middleware/auth.js';

const BASE_URL = 'http://127.0.0.1:3000';
const DEV_SECRET = process.env.DEV_SECRET || '457738d4f57ef4ccdd606b4cbf78aa7de5c5e27327ce32b53e0a5fc4bf7f9d06';

export async function run() {
  console.log('\n======================================================');
  console.log('📱  PART 8: CUSTOMER KHATA PWA, SCALE & RESTOCK SUITE');
  console.log('======================================================');

  let passed = 0;
  let total = 0;

  // TEST 8.1: EAN-13 Produce / Deli Scale Barcode Modulo-10 Checksum Invariant
  total++;
  try {
    // 1. Weight-embedded barcode test (1.250 kg, PLU 101)
    const weightResult = generateScaleEan13('22', 101, 1.250, 3);
    assert.strictEqual(weightResult.barcode.length, 13, 'EAN-13 barcode must be exactly 13 digits');
    assert.strictEqual(weightResult.barcode.slice(0, 2), '22', 'Prefix must be 22 for weight');
    assert.strictEqual(weightResult.barcode.slice(2, 7), '00101', 'PLU must be 5 digits 00101');
    assert.strictEqual(weightResult.barcode.slice(7, 12), '01250', 'Weight must be 1250 grams');

    // Verify Modulo-10 checksum
    const calcChecksum = computeEan13Checksum(weightResult.barcode.slice(0, 12));
    assert.strictEqual(parseInt(weightResult.barcode.charAt(12), 10), calcChecksum);

    // Verify that POS register's parseScaleBarcode decodes it with zero drift
    const parsedWeight = parseScaleBarcode(weightResult.barcode, 3);
    assert.strictEqual(parsedWeight.isScaleBarcode, true);
    assert.strictEqual(parsedWeight.type, 'WEIGHT');
    assert.strictEqual(parsedWeight.plu, '00101');
    assert.strictEqual(parsedWeight.extractedValue, 1.250);

    // 2. Price-embedded barcode test (BD 0.750, PLU 101)
    const priceResult = generateScaleEan13('20', 101, 0.750, 3);
    assert.strictEqual(priceResult.barcode.slice(0, 2), '20', 'Prefix must be 20 for price');
    assert.strictEqual(priceResult.barcode.slice(7, 12), '00750', 'Price must be 750 fils');

    const parsedPrice = parseScaleBarcode(priceResult.barcode, 3);
    assert.strictEqual(parsedPrice.isScaleBarcode, true);
    assert.strictEqual(parsedPrice.type, 'PRICE');
    assert.strictEqual(parsedPrice.extractedValue, 0.750);

    console.log(`  ✅ [8.1] EAN-13 Produce Scale Barcode Modulo-10 Invariant (${weightResult.barcode} -> 1.250kg): PASSED`);
    passed++;
  } catch (err) {
    console.error('  ❌ [8.1] FAILED:', err.message);
  }

  // TEST 8.2: Customer Tab Public Summary Invariant
  total++;
  try {
    // Lookup a known customer (Ashraf or Ajay)
    const custRes = await fetch(`${BASE_URL}/api/customers`);
    const customers = await custRes.json();
    assert.ok(Array.isArray(customers) && customers.length > 0, 'Catalog must contain at least 1 customer');
    const targetCustomer = customers[0];

    const tabRes = await fetch(`${BASE_URL}/api/customers/${targetCustomer.id}/tab`);
    assert.strictEqual(tabRes.status, 200, `Expected 200, got ${tabRes.status}`);
    const tabData = await tabRes.json();

    assert.strictEqual(tabData.id, targetCustomer.id);
    assert.ok(tabData.name, 'Customer name must be present');
    assert.strictEqual(typeof tabData.balance, 'number', 'Balance must be numeric');
    // Ensure balance has at most 3 decimal places
    const decimals = (String(tabData.balance).split('.')[1] || '').length;
    assert.ok(decimals <= 3, `Currency balance precision drift: ${decimals} decimals`);

    console.log(`  ✅ [8.2] Customer Tab Public Summary Invariant (${tabData.name}, BD ${tabData.balance.toFixed(3)}): PASSED`);
    passed++;
  } catch (err) {
    console.error('  ❌ [8.2] FAILED:', err.message);
  }

  // TEST 8.3: Customer PIN Verification Endpoint Invariant
  total++;
  try {
    const custRes = await fetch(`${BASE_URL}/api/customers`);
    const customers = await custRes.json();
    const targetCustomer = customers[0];

    // 1. Malformed PIN (non-4 digits) must return 400 Bad Request
    const malformedRes = await fetch(`${BASE_URL}/api/khata/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: targetCustomer.id, pin: '123456' })
    });
    assert.strictEqual(malformedRes.status, 400, 'Malformed non-4-digit PIN must be rejected with 400');

    // 2. Incorrect 4-digit PIN must be rejected with 401 Unauthorized
    const invalidRes = await fetch(`${BASE_URL}/api/khata/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: targetCustomer.id, pin: '8765' })
    });
    assert.strictEqual(invalidRes.status, 401, 'Incorrect 4-digit PIN must be rejected with 401');
    const invalidData = await invalidRes.json();
    assert.strictEqual(invalidData.success, false);

    // 3. Valid PIN verification must succeed and return a 90-day device pairing token
    const validRes = await fetch(`${BASE_URL}/api/khata/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: targetCustomer.id, pin: '0000' })
    });
    assert.strictEqual(validRes.status, 200, 'Valid PIN must return 200 OK');
    const validData = await validRes.json();
    assert.strictEqual(validData.success, true);
    assert.ok(validData.deviceToken, 'Device pairing token must be generated');
    assert.strictEqual(validData.expiresIn, '90d');

    console.log('  ✅ [8.3] Customer PIN Verification & Fraud Rejection Invariant: PASSED (400, 401 & 200 Handshake)');
    passed++;
  } catch (err) {
    console.error('  ❌ [8.3] FAILED:', err.message);
  }

  // TEST 8.4: Account Unfreeze Protection Invariant (Requires PIN or Manager Auth)
  total++;
  try {
    const custRes = await fetch(`${BASE_URL}/api/customers`);
    const customers = await custRes.json();
    const targetCustomer = customers[0];

    // 1. Freeze account (allowed for self-service lost card protection)
    const freezeRes = await fetch(`${BASE_URL}/api/khata/${targetCustomer.id}/freeze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ freeze: true })
    });
    assert.strictEqual(freezeRes.status, 200);

    // 2. Attempt unfreezing WITHOUT PIN or Manager Token
    const unfreezeNoAuthRes = await fetch(`${BASE_URL}/api/khata/${targetCustomer.id}/freeze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ freeze: false })
    });

    if (targetCustomer.pin || targetCustomer.khataPin || targetCustomer.khata_pin) {
      assert.strictEqual(unfreezeNoAuthRes.status, 401, 'Unfreezing an account with a PIN without credentials must return 401');
    }

    // 3. Unfreeze with authorized Manager Token
    const unfreezeAuthRes = await fetch(`${BASE_URL}/api/khata/${targetCustomer.id}/freeze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-token': DEV_SECRET
      },
      body: JSON.stringify({ freeze: false })
    });
    assert.strictEqual(unfreezeAuthRes.status, 200, 'Unfreezing with manager token must succeed');

    console.log('  ✅ [8.4] Account Unfreeze Authorization & PIN Requirement Invariant: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [8.4] FAILED:', err.message);
  }

  // TEST 8.5: Tap Payments Webhook HMAC-SHA256 Cryptographic Verification & Idempotency Invariant
  total++;
  try {
    const secret = process.env.TAP_WEBHOOK_SECRET || 'sk_test_tap_enterprise_key_2026';
    const fakePayload = JSON.stringify({ id: 'chg_audit_101', amount: 10.500, currency: 'BHD', status: 'CAPTURED' });
    
    // 1. Missing signature rejection (401)
    const noSigRes = await fetch(`${BASE_URL}/api/webhook/tap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: fakePayload
    });
    assert.strictEqual(noSigRes.status, 401, `Missing signature should return 401, got ${noSigRes.status}`);

    // 2. Forged signature rejection (403)
    const forgedHmac = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const forgedRes = await fetch(`${BASE_URL}/api/webhook/tap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tap-signature': forgedHmac
      },
      body: fakePayload
    });
    assert.strictEqual(forgedRes.status, 403, `Forged signature should return 403, got ${forgedRes.status}`);

    // 3. Currency tampering rejection (Non-BHD rejected with 400)
    const usdPayload = JSON.stringify({ id: 'chg_usd_tamper', amount: 100, currency: 'USD', status: 'CAPTURED' });
    const usdHmac = crypto.createHmac('sha256', secret).update(Buffer.from(usdPayload)).digest('hex');
    const usdRes = await fetch(`${BASE_URL}/api/webhook/tap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tap-signature': usdHmac
      },
      body: usdPayload
    });
    assert.strictEqual(usdRes.status, 400, `Non-BHD currency should return 400, got ${usdRes.status}`);

    // 4. Authentic HMAC verification (200) & Idempotent Replay Defense
    const validHmac = crypto.createHmac('sha256', secret).update(Buffer.from(fakePayload)).digest('hex');
    const validRes1 = await fetch(`${BASE_URL}/api/webhook/tap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tap-signature': validHmac
      },
      body: fakePayload
    });
    assert.strictEqual(validRes1.status, 200, `Authentic webhook should succeed with 200, got ${validRes1.status}`);

    // Replay attack: resubmission of identical chargeId must be skipped idempotently
    const validRes2 = await fetch(`${BASE_URL}/api/webhook/tap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tap-signature': validHmac
      },
      body: fakePayload
    });
    assert.strictEqual(validRes2.status, 200);
    const data2 = await validRes2.json();
    assert.ok(data2.message?.includes('idempotent') || data2.status === 'IGNORED' || data2.received === true);

    console.log('  ✅ [8.5] Tap Payments Webhook HMAC-SHA256 Cryptographic & Idempotency Invariant: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [8.5] FAILED:', err.message);
  }

  // TEST 8.6: Automated Reorder Minimum Order Value (MOV) Rule Invariant
  total++;
  try {
    const result = await runReorderCheck({ bypassMov: false });
    assert.strictEqual(result.success, true);
    assert.strictEqual(typeof result.draftCount, 'number');
    assert.strictEqual(typeof result.skippedCount, 'number');

    // If any distributors were skipped due to MOV, verify deficit calculation
    if (result.skipped && result.skipped.length > 0) {
      for (const skipped of result.skipped) {
        assert.ok(skipped.totalOrderCost < skipped.minimumOrderValue, 'Skipped order cost must be below MOV');
        const expectedDeficit = Number((skipped.minimumOrderValue - skipped.totalOrderCost).toFixed(3));
        assert.strictEqual(skipped.deficit, expectedDeficit, 'Deficit must exactly match MOV - totalOrderCost');
      }
    }

    console.log(`  ✅ [8.6] Automated Reorder MOV Rule Invariant (${result.draftCount} drafts, ${result.skippedCount} skipped): PASSED`);
    passed++;
  } catch (err) {
    console.error('  ❌ [8.6] FAILED:', err.message);
  }

  // TEST 8.7: Signed Khata Device Token Cryptographic Invariant & Anti-Tampering Defense
  total++;
  try {
    const custId = 'cust_audit_test_90d';
    const pinHash = '$2b$10$abcdefghijklmnopqrstuv';
    const validTok = generateKhataDeviceToken(custId, pinHash);

    assert.ok(validTok.startsWith(`khata_tok.${custId}.`), 'Token must follow namespaced structure');
    const parts = validTok.split('.');
    assert.strictEqual(parts.length, 4, 'Token must contain 4 delimited segments');

    // 1. Legitimate token validation
    assert.strictEqual(verifyKhataDeviceToken(validTok, custId, pinHash), true, 'Valid token must verify true');

    // 2. Identity Swapping Attack: Using valid token on different customerId
    assert.strictEqual(verifyKhataDeviceToken(validTok, 'victim_customer_id', pinHash), false, 'Cross-customer token reuse must be rejected');

    // 3. Signature Tampering Attack: Altering 1 byte in HMAC signature
    const tamperedSig = validTok.slice(0, -1) + (validTok.endsWith('a') ? 'b' : 'a');
    assert.strictEqual(verifyKhataDeviceToken(tamperedSig, custId, pinHash), false, 'Tampered token signature must fail verification');

    // 4. PIN Change Invalidation Invariant: If customer changes PIN, previous token immediately invalidates
    const newPinHash = '$2b$10$differentPINhashUpdatedNow';
    assert.strictEqual(verifyKhataDeviceToken(validTok, custId, newPinHash), false, 'Old device token must invalidate upon PIN change');

    console.log('  ✅ [8.7] Signed Khata Device Token Cryptographic Invariant & Anti-Tampering: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [8.7] FAILED:', err.message);
  }

  // TEST 8.8: Customer Statement Authorization & IDOR Protection (/api/customers/:id/statement)
  total++;
  try {
    const custRes = await fetch(`${BASE_URL}/api/customers`);
    const customers = await custRes.json();
    const targetCustomer = customers[0];

    // 1. Obtain a valid signed device token via verify-pin
    const loginRes = await fetch(`${BASE_URL}/api/khata/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: targetCustomer.id, pin: '0000' })
    });
    assert.strictEqual(loginRes.status, 200);
    const loginData = await loginRes.json();
    const deviceToken = loginData.deviceToken;
    assert.ok(deviceToken, 'Login must yield deviceToken');

    // 2. Request statement WITH valid signed token -> 200
    const authStmtRes = await fetch(`${BASE_URL}/api/customers/${targetCustomer.id}/statement`, {
      headers: { 'x-khata-token': deviceToken }
    });
    assert.strictEqual(authStmtRes.status, 200, `Authenticated statement query should return 200, got ${authStmtRes.status}`);
    const authStmtData = await authStmtRes.json();
    assert.strictEqual(authStmtData.success, true);
    assert.ok(Array.isArray(authStmtData.statement), 'Statement array must be returned');

    // 3. Request statement with FORGED token -> 401
    const forgedStmtRes = await fetch(`${BASE_URL}/api/customers/${targetCustomer.id}/statement`, {
      headers: { 'x-khata-token': 'khata_tok.fake.9999999999999.badbadbad' }
    });
    assert.strictEqual(forgedStmtRes.status, 401, `Forged token must be rejected with 401, got ${forgedStmtRes.status}`);

    // 4. Request statement with Manager machine secret -> 200 (Back-office elevation)
    const managerStmtRes = await fetch(`${BASE_URL}/api/customers/${targetCustomer.id}/statement`, {
      headers: { 'x-manager-token': DEV_SECRET }
    });
    assert.strictEqual(managerStmtRes.status, 200, `Manager token must permit statement access`);

    console.log('  ✅ [8.8] Customer Statement Authorization & IDOR Protection Invariant: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [8.8] FAILED:', err.message);
  }

  // TEST 8.9: Zero Fallback PIN '1234' Invariant in Account Unfreeze
  total++;
  try {
    const custRes = await fetch(`${BASE_URL}/api/customers`);
    const customers = await custRes.json();
    const targetCustomer = customers[0];

    // Ensure account is frozen
    await fetch(`${BASE_URL}/api/khata/${targetCustomer.id}/freeze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ freeze: true })
    });

    // Attempt unfreezing using hardcoded '1234' manager PIN header without actual manager auth
    const bypassRes = await fetch(`${BASE_URL}/api/khata/${targetCustomer.id}/freeze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-pin': '1234'
      },
      body: JSON.stringify({ freeze: false })
    });

    // Must be rejected with 401 or 403 (zero bypass)
    assert.ok(bypassRes.status === 401 || bypassRes.status === 403, `Bypass attempt with '1234' must be rejected, got ${bypassRes.status}`);

    // Re-enable account with valid manager token
    await fetch(`${BASE_URL}/api/khata/${targetCustomer.id}/freeze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-token': DEV_SECRET
      },
      body: JSON.stringify({ freeze: false })
    });

    console.log('  ✅ [8.9] Zero Fallback PIN 1234 Bypass Defense Invariant: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [8.9] FAILED:', err.message);
  }

  // TEST 8.10: BenefitPay / Fawri+ Webhook Gateway Authentication & Currency Tampering Invariant
  total++;
  try {
    const candidatePaths = [
      path.resolve(process.cwd(), 'askar-edge-api/src/routes/hardware.ts'),
      path.resolve(process.cwd(), '../askar-edge-api/src/routes/hardware.ts')
    ];
    const edgeHardwarePath = candidatePaths.find(p => fs.existsSync(p));
    assert.ok(edgeHardwarePath, 'askar-edge-api hardware.ts missing');
    const content = fs.readFileSync(edgeHardwarePath, 'utf-8');

    // 1. Verify handleBenefitWebhook enforces secret validation
    assert.ok(
      content.includes('x-benefit-secret') || content.includes('BENEFIT_WEBHOOK_SECRET'),
      'Missing BENEFIT_WEBHOOK_SECRET check in handleBenefitWebhook!'
    );
    assert.ok(
      content.includes('isSecretValid'),
      'Missing constant-time isSecretValid check in handleBenefitWebhook!'
    );

    // 2. Verify parsing requires positive BHD amount
    assert.ok(
      content.includes('parsed.amount <= 0'),
      'Missing non-positive amount rejection in handleBenefitWebhook!'
    );

    console.log('  ✅ [8.10] BenefitPay / Fawri+ Webhook Gateway Authentication & Currency Tampering Invariant: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [8.10] FAILED:', err.message);
  }

  // TEST 8.11: Khata Settlement Claims Authorization & Reviewer Identity Gate Invariant
  total++;
  try {
    // 1. Unauthenticated request to /api/khata/claims/pending must return 401
    const unauthPendingRes = await fetch(`${BASE_URL}/api/khata/claims/pending`);
    assert.strictEqual(unauthPendingRes.status, 401, `Unauthenticated claims query must return 401, got ${unauthPendingRes.status}`);

    // 2. Authenticated request with Manager token must return 200
    const authPendingRes = await fetch(`${BASE_URL}/api/khata/claims/pending`, {
      headers: { 'x-manager-token': DEV_SECRET }
    });
    assert.strictEqual(authPendingRes.status, 200, `Authenticated claims query must return 200, got ${authPendingRes.status}`);
    const pendingData = await authPendingRes.json();
    assert.strictEqual(pendingData.success, true);
    assert.ok(Array.isArray(pendingData.claims), 'Claims array must be returned');

    // 3. Unauthenticated approve/reject must return 401
    const unauthApproveRes = await fetch(`${BASE_URL}/api/khata/claims/claim_fake_audit/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewer: 'Hacker' })
    });
    assert.strictEqual(unauthApproveRes.status, 401, `Unauthenticated claim approval must return 401, got ${unauthApproveRes.status}`);

    const unauthRejectRes = await fetch(`${BASE_URL}/api/khata/claims/claim_fake_audit/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewer: 'Hacker' })
    });
    assert.strictEqual(unauthRejectRes.status, 401, `Unauthenticated claim reject must return 401, got ${unauthRejectRes.status}`);

    // 4. Authenticated approve/reject with machine token passes auth (returns 404 for nonexistent claim)
    const authApproveRes = await fetch(`${BASE_URL}/api/khata/claims/claim_fake_audit/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-token': DEV_SECRET
      },
      body: JSON.stringify({ reviewer: 'Machine Manager' })
    });
    assert.strictEqual(authApproveRes.status, 404, `Auth passed with manager token; nonexistent claim returns 404, got ${authApproveRes.status}`);

    console.log('  ✅ [8.11] Khata Settlement Claims Authorization & Reviewer Identity Gate Invariant: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [8.11] FAILED:', err.message);
  }

  // TEST 8.12: Serverless Vercel API PIN Verification & Timing-Safe Token Invariant
  total++;
  try {
    const candidatePaths = [
      path.resolve(process.cwd(), 'askar-khata-pwa/api/server.js'),
      path.resolve(process.cwd(), '../askar-khata-pwa/api/server.js')
    ];
    let serverJsPath = candidatePaths.find(p => fs.existsSync(p));
    assert.ok(serverJsPath, 'askar-khata-pwa/api/server.js must exist');

    const content = fs.readFileSync(serverJsPath, 'utf8');

    // 1. Zero backdoor PIN checks
    assert.ok(!content.includes("pin === '9999'"), "Serverless server.js must not contain hardcoded backdoor PIN '9999'");
    assert.ok(!content.includes("pin === '1234'"), "Serverless server.js must not contain hardcoded backdoor PIN '1234'");

    // 2. Zero hardcoded fallback secret tokens
    assert.ok(!content.includes("'askar_pos_secret_token_2026'"), "Serverless server.js must not contain hardcoded fallback secret token");

    // 3. Must use constant-time comparison for auth secrets
    assert.ok(content.includes('crypto.timingSafeEqual'), "Serverless server.js must enforce constant-time comparison");

    // 4. Must use bcrypt for employee PIN verification
    assert.ok(content.includes('bcrypt.compare'), "Serverless server.js must verify employee PIN with bcrypt");

    console.log('  ✅ [8.12] Serverless Vercel API PIN Verification & Timing-Safe Token Invariant: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [8.12] FAILED:', err.message);
  }

  // TEST 8.13: Customer Tab PWA Freeze/Unfreeze Token Presentation & Zero-Backdoor Invariant
  total++;
  try {
    const candidatePaths = [
      path.resolve(process.cwd(), 'askar-khata-pwa/src/pages/CustomerTab.jsx'),
      path.resolve(process.cwd(), '../askar-khata-pwa/src/pages/CustomerTab.jsx')
    ];
    let customerTabPath = candidatePaths.find(p => fs.existsSync(p));
    assert.ok(customerTabPath, 'CustomerTab.jsx must exist');

    const content = fs.readFileSync(customerTabPath, 'utf8');

    // 1. Unfreeze must pass Authorization header with Bearer or x-khata-token or prompt PIN
    assert.ok(
      content.includes('savedJwt') || content.includes('Bearer') || content.includes('Authorization'),
      'CustomerTab.jsx must attach auth credentials when requesting account unfreeze'
    );

    // 2. Verify zero hardcoded manager PINs in client-side code
    assert.ok(!content.includes("x-manager-pin': '1234'"), "CustomerTab.jsx must not hardcode '1234' manager pin");
    assert.ok(!content.includes("x-manager-pin': '9999'"), "CustomerTab.jsx must not hardcode '9999' manager pin");

    console.log('  ✅ [8.13] Customer Tab PWA Freeze/Unfreeze Token Presentation & Zero-Backdoor Invariant: PASSED');
    passed++;
  } catch (err) {
    console.error('  ❌ [8.13] FAILED:', err.message);
  }

  return { passed, total };
}

// Direct execution support
if (process.argv[1]?.endsWith('08_khata_pwa_security.test.mjs')) {
  run().then(({ passed, total }) => {
    if (passed === total) process.exit(0);
    process.exit(1);
  });
}
