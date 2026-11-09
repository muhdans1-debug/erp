/**
 * Bahrain BenefitPay Fawri+ Dynamic QR Code Payload Generator & Deep Link Utilities
 * Standardized to EMVCo Merchant-Presented Mode (MPM) QRCPS specifications
 * as enforced by the Central Bank of Bahrain (CBB) & The BENEFIT Company.
 */

export const DEFAULT_BENEFIT_CONFIG = {
  accountType: 'MOBILE_FAWRI',
  merchantId: '97300182',
  merchantName: 'ASKAR SUPERMARKET',
  mobileNumber: '+973 32067388',
  iban: 'BH67NBOB00000012345678',
  cprOrCr: '200012345678901',
  branchId: 'POS-01',
  notes: 'Scan with BenefitPay app to pay directly via Fawri+'
};

/**
 * Format a standard EMVCo Tag-Length-Value (TLV) segment
 * @param {string} tag - 2-digit tag ID
 * @param {string} value - String value
 * @returns {string} TLV segment
 */
export const formatEMVCoTag = (tag, value) => {
  if (value === undefined || value === null || value === '') return '';
  const str = String(value);
  const len = String(str.length).padStart(2, '0');
  return `${tag}${len}${str}`;
};

/**
 * Calculate EMVCo QRCPS standard 16-bit Cyclic Redundancy Check (CRC-16-CCITT)
 * Polynomial: 0x1021 (X^16 + X^12 + X^5 + 1), Initial value: 0xFFFF
 * @param {string} payload - Input payload string
 * @returns {string} 4-character hex uppercase CRC checksum
 */
export const calculateEMVCoCRC16 = (payload) => {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= (payload.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

/**
 * Bahrain BenefitPay Fawri+ Dynamic QR Code Payload Generator (EMVCo MPM Compliant)
 * Generates an authentic EMVCo MPM QR string (starts with 000201...) recognized
 * natively by the BenefitPay mobile app scanner in the Kingdom of Bahrain.
 *
 * @param {number} amount - Transaction amount in BHD (e.g. 1.500)
 * @param {string} [invoiceNo] - Invoice / Customer reference ID
 * @param {object} [customConfig] - Merchant configuration override
 * @returns {string} Fully signed EMVCo MPM compliant string
 */
export const generateBenefitPayPayload = (amount, invoiceNo, customConfig) => {
  const isDynamic = typeof amount === 'number' && amount > 0;
  const formattedAmount = isDynamic ? Number(amount).toFixed(3) : '0.000';
  const cleanInvoice = (invoiceNo || `INV-${Date.now().toString().slice(-6)}`).trim();

  const config = {
    ...DEFAULT_BENEFIT_CONFIG,
    ...(customConfig || {})
  };

  // 1. Tag 00: Payload Format Indicator (01)
  let emv = formatEMVCoTag('00', '01');

  // 2. Tag 01: Point of Initiation Method (12 = Dynamic with preset amount, 11 = Static)
  emv += formatEMVCoTag('01', isDynamic ? '12' : '11');

  // 3. Tag 26: Bahrain BENEFIT Scheme Merchant Account Information
  let sub26 = '';
  // Subtag 00: Globally Unique Scheme Identifier for Bahrain
  sub26 += formatEMVCoTag('00', 'bh.benefit');

  if (config.accountType === 'MOBILE_FAWRI') {
    let cleanMobile = (config.mobileNumber || '').replace(/[^\d]/g, '');
    if (cleanMobile.length === 8 && !cleanMobile.startsWith('973')) {
      cleanMobile = `973${cleanMobile}`;
    }
    sub26 += formatEMVCoTag('01', cleanMobile || '97339000000');
  } else {
    const cleanMerchant = (config.merchantId || '97300182').replace(/[^\w-]/g, '').trim();
    sub26 += formatEMVCoTag('01', cleanMerchant || '97300182');
  }

  const branch = (config.branchId || 'POS-01').trim();
  if (branch) {
    sub26 += formatEMVCoTag('02', branch);
  }

  if (config.iban) {
    const cleanIban = config.iban.replace(/\s+/g, '').toUpperCase();
    if (cleanIban) {
      sub26 += formatEMVCoTag('03', cleanIban);
    }
  }

  emv += formatEMVCoTag('26', sub26);

  // 4. Tag 52: Merchant Category Code (5411 = Supermarket / Grocery)
  emv += formatEMVCoTag('52', '5411');

  // 5. Tag 53: Transaction Currency (048 = BHD - Bahraini Dinar ISO 4217)
  emv += formatEMVCoTag('53', '048');

  // 6. Tag 54: Transaction Amount in BHD (e.g. 1.500)
  if (isDynamic) {
    emv += formatEMVCoTag('54', formattedAmount);
  }

  // 7. Tag 58: Country Code (BH = Bahrain ISO 3166-1)
  emv += formatEMVCoTag('58', 'BH');

  // 8. Tag 59: Merchant Name (Clean ASCII max 25 chars for EMVCo TLV safety)
  const rawName = (config.merchantName || 'ASKAR SUPERMARKET').trim();
  const safeName = rawName.replace(/[^\x20-\x7E]/g, '').trim() || 'ASKAR SUPERMARKET';
  emv += formatEMVCoTag('59', safeName.slice(0, 25));

  // 9. Tag 60: Merchant City (Max 15 chars)
  emv += formatEMVCoTag('60', 'ASKAR');

  // 10. Tag 62: Additional Data Field Template (Bill/Invoice & Reference numbers)
  let sub62 = '';
  const cleanInv = cleanInvoice.slice(0, 20);
  if (cleanInv) {
    sub62 += formatEMVCoTag('01', cleanInv);
    sub62 += formatEMVCoTag('05', cleanInv);
  }
  if (branch) {
    sub62 += formatEMVCoTag('07', branch.slice(0, 10));
  }
  if (sub62) {
    emv += formatEMVCoTag('62', sub62);
  }

  // 11. Tag 63: Cyclic Redundancy Check (CRC-16-CCITT)
  emv += '6304';
  const checksum = calculateEMVCoCRC16(emv);
  emv += checksum;

  return emv;
};

/**
 * Attempts to launch the native BenefitPay mobile app or redirects to the app store
 * Uses Android Intent URI on Android to prevent ERR_UNKNOWN_URL_SCHEME,
 * and handles desktop environments gracefully.
 */
export const openBenefitPayApp = (onDesktopNotice) => {
  if (typeof window === 'undefined') return;

  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isAndroid = /Android/.test(ua);

  const appStoreUrl = 'https://apps.apple.com/bh/app/benefitpay/id1112444984';
  const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.benefit.benefitpay';

  if (isAndroid) {
    // Robust Android Intent URI: Launches BenefitPay app or falls back seamlessly to Google Play
    const intentUrl = 'intent://#Intent;scheme=benefitpay;package=com.benefit.benefitpay;S.browser_fallback_url=' + encodeURIComponent(playStoreUrl) + ';end;';
    window.location.href = intentUrl;
    return;
  }

  if (isIOS) {
    const deepLink = 'benefitpay://';
    const start = Date.now();
    window.location.href = deepLink;

    setTimeout(() => {
      if (Date.now() - start < 3000) {
        window.open(appStoreUrl, '_blank');
      }
    }, 2500);
    return;
  }

  // Desktop environment
  if (onDesktopNotice && typeof onDesktopNotice === 'function') {
    onDesktopNotice();
  } else {
    alert('BenefitPay is a mobile application. Please scan the QR code using your smartphone.');
  }
};

export default generateBenefitPayPayload;

