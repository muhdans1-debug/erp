import assert from 'node:assert';
import { base64ToUint8Array, bufferToBase64 } from '../src/utils/phoneLockAuth.js';

console.log('🧪 Testing WebAuthn allowCredentials Conversion & Helpers...\n');

// Test 1: Standard Base64 roundtrip
const testBytes = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]);
const b64 = bufferToBase64(testBytes);
assert(typeof b64 === 'string' && b64.length > 0, 'Must produce valid base64 string');
const restored = base64ToUint8Array(b64);
assert.deepStrictEqual(Array.from(restored), Array.from(testBytes), 'Restored bytes must match original bytes');
console.log('✅ Passed Test 1: Standard Base64 roundtrip matches perfectly.');

// Test 2: URL-safe Base64 (with - and _)
const urlSafeStr = 'EjRWeJq83vA-'; // Contains - and no padding
const urlRestored = base64ToUint8Array(urlSafeStr);
assert(urlRestored instanceof Uint8Array, 'Must decode URL-safe base64 to Uint8Array');
assert.strictEqual(urlRestored.byteLength > 0, true, 'Decoded byteLength must be greater than 0');
console.log('✅ Passed Test 2: URL-safe Base64 successfully normalized and decoded to BufferSource.');

// Test 3: Null and empty handling
assert.strictEqual(base64ToUint8Array(null), null, 'Null must return null');
assert.strictEqual(base64ToUint8Array(''), null, 'Empty string must return null');
assert.strictEqual(bufferToBase64(null), '', 'Null buffer must return empty string');
console.log('✅ Passed Test 3: Null and empty inputs handled safely without throwing.');

console.log('\n🎉 ALL WEBAUTHN CONVERSION TESTS PASSED!\n');
