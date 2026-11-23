import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('🧪 Starting Customer PWA Security & Native Phone Lock Verification Suite...\n');

// 1. Mock browser globals for phoneLockAuth test
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear()
};

const sessionStorageMap = new Map();
globalThis.sessionStorage = {
  getItem: (k) => sessionStorageMap.get(k) || null,
  setItem: (k, v) => sessionStorageMap.set(k, String(v)),
  removeItem: (k) => sessionStorageMap.delete(k),
  clear: () => sessionStorageMap.clear()
};

let mockCredentialCreateResult = null;
let mockCredentialGetResult = null;
let mockCreateThrows = null;
let mockGetThrows = null;

const mockCredentials = {
  create: async (options) => {
    if (mockCreateThrows) throw mockCreateThrows;
    assert(options && options.publicKey, 'Expected publicKey in create options');
    assert(options.publicKey.authenticatorSelection.userVerification === 'required', 'Expected userVerification=required');
    return mockCredentialCreateResult;
  },
  get: async (options) => {
    if (mockGetThrows) throw mockGetThrows;
    assert(options && options.publicKey, 'Expected publicKey in get options');
    assert(options.publicKey.userVerification === 'required', 'Expected userVerification=required in get');
    return mockCredentialGetResult;
  }
};

if (!globalThis.navigator) {
  globalThis.navigator = {};
}
Object.defineProperty(globalThis.navigator, 'credentials', {
  value: mockCredentials,
  configurable: true,
  writable: true
});

globalThis.window = {
  PublicKeyCredential: {
    isUserVerifyingPlatformAuthenticatorAvailable: async () => true
  }
};

const {
  isPhoneLockSupported,
  isPhoneLockAvailable,
  registerPhoneLock,
  verifyPhoneLock,
  isPhoneLockConfigured,
  isSessionVerified,
  createReceiptDeviceToken,
  getDeviceAuthHeaders
} = await import('../src/utils/phoneLockAuth.js');

// Test 1: Phone Lock Availability
console.log('--- Test 1: WebAuthn Phone Lock Availability ---');
const isAvail = await isPhoneLockAvailable();
assert.strictEqual(isAvail, true, 'Phone lock should be available when navigator.credentials exists');
assert.strictEqual(isPhoneLockSupported(), true, 'Phone lock should be supported synchronously');
console.log('✅ isPhoneLockAvailable() returned true as expected.');

// Test 2: Phone Lock Registration
console.log('\n--- Test 2: Native Phone Lock Registration ---');
const customerId = 'cust_labour_9988';
mockCredentialCreateResult = {
  id: 'cred_raw_phone_lock_xyz123',
  rawId: new Uint8Array([1, 2, 3, 4]).buffer,
  type: 'public-key'
};

const regRes = await registerPhoneLock(customerId, 'Bashir Ahmed');
assert.strictEqual(regRes.success, true, 'Registration should succeed');
assert.strictEqual(isPhoneLockConfigured(customerId), true, 'Customer should now be configured with phone lock');
assert.strictEqual(isSessionVerified(customerId), true, 'Session should be verified upon registration');
console.log('✅ registerPhoneLock successfully stored credential and verified session.');

// Test 3: Phone Lock Verification
console.log('\n--- Test 3: Native Phone Lock Verification ---');
// Clear session to simulate reopening the app
sessionStorage.clear();
assert.strictEqual(isSessionVerified(customerId), false, 'Session should be unverified after restart');

mockCredentialGetResult = {
  id: 'cred_raw_phone_lock_xyz123',
  type: 'public-key'
};

const verifyRes = await verifyPhoneLock(customerId);
assert.strictEqual(verifyRes.success, true, 'Verification should succeed');
assert.strictEqual(isSessionVerified(customerId), true, 'Session should be verified after phone lock');
console.log('✅ verifyPhoneLock successfully unlocked session using biometrics.');

// Test 4: Device Receipt Token Generation & Headers
console.log('\n--- Test 4: Receipt Device Token & Auth Headers ---');
const devToken = createReceiptDeviceToken(customerId);
assert(devToken.startsWith('dev_token_'), 'Token should have dev_token_ prefix');
const decoded = JSON.parse(Buffer.from(devToken.slice(10), 'base64').toString('utf8'));
assert.strictEqual(decoded.cid, customerId, 'Device token payload must contain customerId');

const headers = getDeviceAuthHeaders(customerId);
assert.strictEqual(headers['x-khata-device-token'], devToken, 'Header must contain generated device token');
assert.strictEqual(headers['x-khata-phone-locked'], 'true', 'Header must flag phone locked status');
console.log('✅ Device receipt token and headers generated with strict customer binding.');

// Test 5: IDOR Protection on Server API
console.log('\n--- Test 5: Server API Anti-IDOR Device Binding Guard ---');
const serverCode = fs.readFileSync(path.resolve('askar-khata-pwa/api/server.js'), 'utf8');
assert(serverCode.includes('x-khata-device-token'), 'server.js must inspect x-khata-device-token');
assert(serverCode.includes('Device Mismatch: Phone is locked to another Khata account.'), 'server.js must block mismatched devices with 403');
console.log('✅ Server API contains Anti-IDOR Device Binding Token validation.');

// Test 6: Verify Stripping of Account Switching and Public Search in UI
console.log('\n--- Test 6: UI Source Audit (Zero Inter-Account Hopping) ---');
const customerTabCode = fs.readFileSync(path.resolve('askar-khata-pwa/src/pages/CustomerTab.jsx'), 'utf8');
const drawerCode = fs.readFileSync(path.resolve('askar-khata-pwa/src/components/HamburgerDrawer.jsx'), 'utf8');
const homeLookupCode = fs.readFileSync(path.resolve('askar-khata-pwa/src/pages/HomeLookup.jsx'), 'utf8');
const appCode = fs.readFileSync(path.resolve('askar-khata-pwa/src/App.jsx'), 'utf8');

// Check CustomerTab.jsx
assert(!customerTabCode.includes('switchAcc'), 'CustomerTab.jsx must not render switch account button');
assert(!customerTabCode.includes('/?switch=1'), 'CustomerTab.jsx must not contain /?switch=1 link');
assert(customerTabCode.includes('isDeviceBoundToOther'), 'CustomerTab.jsx must check isDeviceBoundToOther');
assert(customerTabCode.includes('Account Mismatch Protected'), 'CustomerTab.jsx must render lockout screen on IDOR attempt');
assert(customerTabCode.includes('Native Phone Lock Biometric Gate'), 'CustomerTab.jsx must include biometric gate');
assert(customerTabCode.includes('Enable 1-Touch Phone Lock'), 'CustomerTab.jsx must offer 1-touch enrollment for elderly labor patrons');

// Check HamburgerDrawer.jsx
assert(!drawerCode.includes('Khata Search & QR Scanner'), 'HamburgerDrawer must not contain Khata search link');
assert(!drawerCode.includes('to="/"'), 'HamburgerDrawer must not link back to customer search');

// Check HomeLookup.jsx
assert(!homeLookupCode.includes('recentAccounts'), 'HomeLookup.jsx must not store or render recentAccounts directory');
assert(!homeLookupCode.includes('passkeyPlaceholder'), 'HomeLookup.jsx must not render public phone/CPR text search input');
assert(homeLookupCode.includes('scanReceiptBtn'), 'HomeLookup.jsx must focus exclusively on physical receipt QR scanning');

// Check App.jsx
assert(!appCode.includes("search.includes('switch=1')"), 'App.jsx must not allow ?switch=1 to bypass device lock');

console.log('✅ UI Source Audit Passed: Zero account-switching or search options remain for customers!');
console.log('\n🎉 ALL SECURITY & PHONE LOCK VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
