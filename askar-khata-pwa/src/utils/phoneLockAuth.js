/**
 * Phone Lock Authentication Utility for Layali Supermarket Customer Khata PWA
 * 
 * Tailored for laborers, camp patrons, and elderly customers:
 * - Uses WebAuthn Platform Authenticator (Fingerprint, Face ID, or Phone Screen Lock Pattern).
 * - Zero memorized passwords or 4-digit PINs.
 * - Falls back seamlessly to physical receipt QR proof-of-possession device tokens.
 */

/**
 * Converts a Base64 or Base64URL string to a Uint8Array (BufferSource)
 */
export function base64ToUint8Array(base64String) {
  if (!base64String || typeof base64String !== 'string') return null;
  try {
    let base64 = base64String.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const binaryStr = typeof atob === 'function' 
      ? atob(base64) 
      : Buffer.from(base64, 'base64').toString('binary');
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  } catch (err) {
    console.warn('Failed to parse credential ID from base64:', err);
    try {
      return new TextEncoder().encode(base64String);
    } catch {
      return null;
    }
  }
}

/**
 * Converts an ArrayBuffer / Uint8Array to a standard Base64 string
 */
export function bufferToBase64(buffer) {
  if (!buffer) return '';
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
}

/**
 * Checks synchronously if PublicKeyCredential exists on window
 */
export function isPhoneLockSupported() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.PublicKeyCredential);
}

/**
 * Checks if the device and browser support native phone lock (Fingerprint / Face / Screen Lock)
 */
export async function isPhoneLockAvailable() {
  try {
    if (!isPhoneLockSupported()) {
      return false;
    }
    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      const res = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      return Boolean(res);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Registers native phone lock (Fingerprint / Face ID / Phone Pattern) for this customer
 */
export async function registerPhoneLock(customerId, customerName = 'Valued Customer') {
  if (!customerId) return { success: false, error: 'Customer ID required' };

  try {
    const isAvail = await isPhoneLockAvailable();
    if (!isAvail) {
      // Graceful fallback: create receipt device token
      const tok = createReceiptDeviceToken(customerId);
      return { success: true, isFallback: true, token: tok };
    }

    const cryptoObj = (typeof window !== 'undefined' && window.crypto) || globalThis.crypto;
    const challenge = new Uint8Array(32);
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      cryptoObj.getRandomValues(challenge);
    } else {
      for (let i = 0; i < challenge.length; i++) challenge[i] = Math.floor(Math.random() * 256);
    }

    const encoder = new TextEncoder();
    const userId = encoder.encode(String(customerId));
    const rpId = (typeof window !== 'undefined' && window.location?.hostname) ? window.location.hostname : 'localhost';

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'Layali Supermarket',
          id: rpId
        },
        user: {
          id: userId,
          name: customerName,
          displayName: customerName
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },  // ES256
          { alg: -257, type: 'public-key' } // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
          requireResidentKey: false
        },
        timeout: 60000
      }
    });

    if (credential && credential.id) {
      const deviceToken = createReceiptDeviceToken(customerId);
      localStorage.setItem(`khata_phone_lock_${customerId}`, credential.id);
      if (credential.rawId) {
        localStorage.setItem(`khata_phone_lock_raw_${customerId}`, bufferToBase64(credential.rawId));
      }
      localStorage.setItem(`khata_phone_lock_enabled_${customerId}`, 'true');
      markSessionVerified(customerId);
      return { success: true, credentialId: credential.id, deviceToken };
    }

    return { success: false, error: 'Credential creation returned null' };
  } catch (err) {
    console.warn('Phone lock registration error:', err);
    // If user cancelled or device error, fallback to receipt token
    const tok = createReceiptDeviceToken(customerId);
    return { success: true, isFallback: true, token: tok };
  }
}

/**
 * Prompts the customer for their native phone lock (Fingerprint, Face ID, or Pattern)
 * Fully compliant with W3C WebAuthn: Always provides a valid binary BufferSource in allowCredentials
 * to eliminate "use of an empty allowcredentials list is not supported" on Android and desktop devices.
 */
export async function verifyPhoneLock(customerId) {
  if (!customerId) return { success: false, error: 'Customer ID required' };

  try {
    const isAvail = await isPhoneLockAvailable();
    const storedRawId = localStorage.getItem(`khata_phone_lock_raw_${customerId}`);
    const storedCredId = storedRawId || localStorage.getItem(`khata_phone_lock_${customerId}`);

    if (!isAvail || !storedCredId) {
      // Fallback: check device binding token
      if (isDeviceAuthorized(customerId)) {
        markSessionVerified(customerId);
        return { success: true };
      }
      return { success: false, error: 'Phone lock not configured' };
    }

    // Convert stored base64 credential ID into a binary BufferSource (Uint8Array)
    const credBuffer = base64ToUint8Array(storedCredId);
    if (!credBuffer || credBuffer.byteLength === 0) {
      return { 
        success: false, 
        error: 'Biometric credential needs refresh. Please re-enroll biometrics.',
        needsReenroll: true 
      };
    }

    const cryptoObj = (typeof window !== 'undefined' && window.crypto) || globalThis.crypto;
    const challenge = new Uint8Array(32);
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      cryptoObj.getRandomValues(challenge);
    } else {
      for (let i = 0; i < challenge.length; i++) challenge[i] = Math.floor(Math.random() * 256);
    }

    // Explicitly populate allowCredentials with binary BufferSource
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [
          {
            type: 'public-key',
            id: credBuffer,
            transports: ['internal']
          }
        ],
        userVerification: 'required',
        timeout: 60000
      }
    });

    if (credential) {
      markSessionVerified(customerId);
      return { success: true };
    }

    return { success: false, error: 'Verification failed' };
  } catch (err) {
    console.warn('Phone lock verification error:', err);
    const msg = String(err?.message || '');
    if (msg.toLowerCase().includes('allowcredentials') || msg.toLowerCase().includes('notsupportederror')) {
      return { 
        success: false, 
        error: 'Biometric credential format outdated on this device. Please log in with password and re-enroll biometrics.',
        needsReenroll: true 
      };
    }
    return { success: false, error: err?.message || 'Verification cancelled' };
  }
}

/**
 * Checks if phone lock is enabled for this customer on this device
 */
export function isPhoneLockConfigured(customerId) {
  if (!customerId || typeof localStorage === 'undefined') return false;
  return localStorage.getItem(`khata_phone_lock_enabled_${customerId}`) === 'true';
}

/**
 * Marks session as verified in both sessionStorage and persistent localStorage (30-day trust)
 */
export function markSessionVerified(customerId) {
  if (!customerId) return;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(`khata_session_verified_${customerId}`, 'true');
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`khata_session_verified_ts_${customerId}`, String(Date.now()));
    }
  } catch {}
}

/**
 * Checks if the customer has an active verified session (ephemeral or persistent 30-day window)
 */
export function isSessionVerified(customerId) {
  if (!customerId) return false;
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (sessionStorage.getItem(`khata_session_verified_${customerId}`) === 'true') {
        return true;
      }
    }
    if (typeof localStorage !== 'undefined') {
      const ts = Number(localStorage.getItem(`khata_session_verified_ts_${customerId}`) || 0);
      // Valid for 30 days (2,592,000,000 ms) to survive iOS/Android tab reloads and app switches
      if (ts > 0 && (Date.now() - ts < 2592000000)) {
        return true;
      }
    }
  } catch {}
  return false;
}

/**
 * Creates and stores a cryptographic receipt device token for single-phone binding
 */
export function createReceiptDeviceToken(customerId) {
  if (!customerId) return null;
  const cryptoObj = (typeof window !== 'undefined' && window.crypto) || globalThis.crypto;
  const bytes = new Uint8Array(24);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const rand = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const payload = {
    cid: customerId,
    iat: Date.now(),
    nonce: rand.slice(0, 8)
  };
  const token = 'dev_token_' + (typeof btoa === 'function' ? btoa(JSON.stringify(payload)) : Buffer.from(JSON.stringify(payload)).toString('base64'));
  
  try {
    localStorage.setItem(`khata_device_token_${customerId}`, token);
    localStorage.setItem('my_khata_customer_id', customerId);
    markSessionVerified(customerId);
  } catch {}

  return token;
}

/**
 * Returns true if the device holds a valid binding token for this customer
 */
export function isDeviceAuthorized(customerId) {
  if (!customerId || typeof localStorage === 'undefined') return false;
  const boundId = localStorage.getItem('my_khata_customer_id');
  const token = localStorage.getItem(`khata_device_token_${customerId}`);
  return Boolean(boundId === customerId && token);
}

/**
 * Returns authorization headers for API requests
 */
export function getDeviceAuthHeaders(customerId) {
  if (!customerId || typeof localStorage === 'undefined') return {};
  const token = localStorage.getItem(`khata_device_token_${customerId}`) || '';
  const isPhoneLocked = localStorage.getItem(`khata_phone_lock_enabled_${customerId}`) === 'true';
  return {
    'x-khata-device-token': token,
    'x-khata-customer-id': customerId,
    ...(isPhoneLocked ? { 'x-khata-phone-locked': 'true' } : {})
  };
}
