import assert from 'assert';

// Mock WebAuthn and localStorage/sessionStorage environment for testing
const mockStorage = new Map();
global.localStorage = {
  getItem: (k) => mockStorage.get(k) || null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear()
};

const mockSession = new Map();
global.sessionStorage = {
  getItem: (k) => mockSession.get(k) || null,
  setItem: (k, v) => mockSession.set(k, String(v)),
  removeItem: (k) => mockSession.delete(k),
  clear: () => mockSession.clear()
};

global.window = {
  location: { hostname: 'askar-khata-pwa.vercel.app' },
  crypto: {
    getRandomValues: (buf) => {
      for (let i = 0; i < buf.length; i++) buf[i] = (Math.random() * 256) | 0;
      return buf;
    }
  },
  PublicKeyCredential: {
    isUserVerifyingPlatformAuthenticatorAvailable: async () => true
  }
};

Object.defineProperty(globalThis.navigator, 'credentials', {
  value: {
    create: async ({ publicKey }) => {
      assert(publicKey.authenticatorSelection.userVerification === 'required');
      return {
        id: 'mock_credential_id_123',
        rawId: new Uint8Array([1, 2, 3, 4]).buffer,
        response: { clientDataJSON: new ArrayBuffer(8) }
      };
    },
    get: async ({ publicKey }) => {
      assert(publicKey.userVerification === 'required');
      return {
        id: 'mock_credential_id_123',
        response: { clientDataJSON: new ArrayBuffer(8) }
      };
    }
  },
  configurable: true,
  writable: true
});

// Import module
const {
  isPhoneLockAvailable,
  registerPhoneLock,
  verifyPhoneLock,
  isPhoneLockConfigured,
  isSessionVerified,
  createReceiptDeviceToken,
  getDeviceAuthHeaders
} = await import('../src/utils/phoneLockAuth.js');

async function runTests() {
  console.log('Testing phoneLockAuth utility...');

  // 1. Availability check
  const available = await isPhoneLockAvailable();
  assert.strictEqual(available, true, 'Phone lock should be available');

  // 2. Initial state
  const testCustomerId = '12252030-e633-472d-b627-bcd2d8f3e77b';
  assert.strictEqual(isPhoneLockConfigured(testCustomerId), false);
  assert.strictEqual(isSessionVerified(testCustomerId), false);

  // 3. Register phone lock
  const regResult = await registerPhoneLock(testCustomerId, 'Anas');
  assert.strictEqual(regResult.success, true);
  assert.strictEqual(isPhoneLockConfigured(testCustomerId), true);
  assert.strictEqual(isSessionVerified(testCustomerId), true);

  // 4. Verify phone lock
  sessionStorage.clear();
  assert.strictEqual(isSessionVerified(testCustomerId), false);
  const verifyResult = await verifyPhoneLock(testCustomerId);
  assert.strictEqual(verifyResult.success, true);
  assert.strictEqual(isSessionVerified(testCustomerId), true);

  // 5. Receipt token fallback for non-biometric budget phones
  const token = createReceiptDeviceToken('69f7bafc-fd06-496d-acea-c8d2ac64d910');
  assert(token && token.length > 10);
  assert.strictEqual(localStorage.getItem('my_khata_customer_id'), '69f7bafc-fd06-496d-acea-c8d2ac64d910');

  // 6. Auth headers
  const headers = getDeviceAuthHeaders('69f7bafc-fd06-496d-acea-c8d2ac64d910');
  assert.strictEqual(headers['x-khata-device-token'], token);
  assert.strictEqual(headers['x-khata-customer-id'], '69f7bafc-fd06-496d-acea-c8d2ac64d910');

  console.log('✅ All phoneLockAuth unit tests passed successfully!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
