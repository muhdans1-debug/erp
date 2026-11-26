/**
 * Bahrain BenefitPay Fawri+ Dynamic QR Code Payload Generator & Configuration Engine
 * Standardized to EMVCo Merchant-Presented Mode (MPM) QRCPS specifications
 * as enforced by the Central Bank of Bahrain (CBB) & The BENEFIT Company.
 *
 * Supports both:
 * 1. Merchant Accounts (Corporate Fawri+ QR with Merchant ID & Terminal ID)
 * 2. Mobile Fawri+ / IBAN Accounts (Direct phone number / IBAN settlement for SME & Sole Proprietorships)
 */

import { getManagerPin } from './authUtils';
import { getApiBaseUrl } from './apiConfig';

export interface BenefitPayConfig {
  accountType: 'MERCHANT' | 'MOBILE_FAWRI';
  merchantId: string;       // e.g. "97300182" or Acquiring Bank Terminal/Merchant ID
  merchantName: string;     // e.g. "layali sbi" or "ASKAR SUPERMARKET"
  mobileNumber: string;     // e.g. "+973 33843855" or "33843855"
  iban: string;             // e.g. "BH77SBIN02740045310001"
  cprOrCr: string;          // CR or CPR Number
  branchId: string;         // e.g. "MAIN-01" or "POS-01"
  notes: string;            // Customer instructions
  updatedAt?: string;
}

export const DEFAULT_BENEFIT_CONFIG: BenefitPayConfig = {
  accountType: 'MOBILE_FAWRI',
  merchantId: '97300182',
  merchantName: 'layali sbi',
  mobileNumber: '+973 33843855',
  iban: 'BH77SBIN02740045310001',
  cprOrCr: '790614189',
  branchId: 'MAIN-01',
  notes: 'Scan with BenefitPay app to pay directly via Fawri+',
  updatedAt: new Date().toISOString(),
};

/**
 * Retrieve cached BenefitPay configuration from localStorage with safe fallback
 */
export const getStoredBenefitPayConfig = (): BenefitPayConfig => {
  if (typeof window === 'undefined') return DEFAULT_BENEFIT_CONFIG;
  try {
    const raw = localStorage.getItem('benefitpay_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      const clean = (parsed && parsed.config) ? { ...parsed, ...parsed.config } : parsed;
      delete clean.config;
      delete clean.success;
      return { ...DEFAULT_BENEFIT_CONFIG, ...clean };
    }
    // Backward compatibility with legacy key
    const legacyMerchantId = localStorage.getItem('benefitpay_merchant_id');
    if (legacyMerchantId) {
      return { ...DEFAULT_BENEFIT_CONFIG, merchantId: legacyMerchantId };
    }
  } catch (e) {
    console.warn('Error reading BenefitPay config:', e);
  }
  return DEFAULT_BENEFIT_CONFIG;
};

/**
 * Broadcast configuration update across all open tabs, windows, and dual screens
 */
export const broadcastBenefitPayConfig = (config: BenefitPayConfig) => {
  if (typeof window === 'undefined') return;
  try {
    const ch1 = new BroadcastChannel('sunmi_dual_screen');
    ch1.postMessage({ type: 'BENEFIT_PAY_CONFIG_UPDATED', config });
    ch1.close();

    const ch2 = new BroadcastChannel('askar_customer_display_channel');
    ch2.postMessage({ type: 'BENEFIT_PAY_CONFIG_UPDATED', config });
    ch2.close();
  } catch (e) {
    console.warn('BroadcastChannel error:', e);
  }
  window.dispatchEvent(new CustomEvent('benefitpay_config_updated', { detail: config }));
};

/**
 * Save configuration to localStorage, broadcast to fleet, and sync to master server
 */
export const saveStoredBenefitPayConfig = async (
  updated: Partial<BenefitPayConfig>,
  apiBase?: string
): Promise<BenefitPayConfig> => {
  const current = getStoredBenefitPayConfig();
  const merged: BenefitPayConfig = {
    ...current,
    ...updated,
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem('benefitpay_config', JSON.stringify(merged));
    localStorage.setItem('benefitpay_merchant_id', merged.merchantId);
    broadcastBenefitPayConfig(merged);
  }

  // Synchronize with master backend server / Cloudflare Edge API
  const targetApi = apiBase || getApiBaseUrl();

  try {
    const res = await fetch(`${targetApi}/api/config/benefit-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-pin': getManagerPin(),
        'x-pos-client': 'pos-register',
      },
      body: JSON.stringify(merged),
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      const clean = (data && data.config) ? data.config : data;
      if (clean && typeof clean === 'object') {
        const finalized = { ...DEFAULT_BENEFIT_CONFIG, ...clean };
        delete (finalized as any).config;
        delete (finalized as any).success;
        if (typeof window !== 'undefined') {
          localStorage.setItem('benefitpay_config', JSON.stringify(finalized));
        }
        return finalized;
      }
    }
  } catch (err) {
    console.warn('Failed to sync BenefitPay config to backend server:', err);
  }

  return merged;
};

/**
 * Fetch latest BenefitPay configuration from backend server and update cache
 */
export const fetchBenefitPayConfig = async (apiBase?: string): Promise<BenefitPayConfig> => {
  const targetApi = apiBase || getApiBaseUrl();

  try {
    const res = await fetch(`${targetApi}/api/config/benefit-account`, {
      headers: {
        'x-pos-client': 'pos-register',
      },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        const raw = (data as any).config || data;
        const clean = { ...raw };
        delete clean.config;
        delete clean.success;
        if (clean.merchantId || clean.mobileNumber || clean.iban) {
          const merged = { ...DEFAULT_BENEFIT_CONFIG, ...clean };
          if (typeof window !== 'undefined') {
            localStorage.setItem('benefitpay_config', JSON.stringify(merged));
            if (clean.merchantId) localStorage.setItem('benefitpay_merchant_id', clean.merchantId);
          }
          return merged;
        }
      }
    }
  } catch (e) {
    // Graceful offline fallback to cached config
  }
  return getStoredBenefitPayConfig();
};

/**
 * Format a standard EMVCo Tag-Length-Value (TLV) segment
 */
export const formatEMVCoTag = (tag: string, value: string): string => {
  if (!value) return '';
  const len = String(value.length).padStart(2, '0');
  return `${tag}${len}${value}`;
};

/**
 * Calculate EMVCo QRCPS standard 16-bit Cyclic Redundancy Check (CRC-16-CCITT)
 * Polynomial: 0x1021 (X^16 + X^12 + X^5 + 1), Initial value: 0xFFFF
 */
export const calculateEMVCoCRC16 = (payload: string): string => {
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
 * Bahrain BenefitPay Fawri+ Dynamic QR Code Payload Generator
 * Supports:
 * 1. Mobile Fawri+ / IBAN Mode (for BenefitPay Mobile Scanner in Bahrain):
 *    The official BenefitPay app scanner natively recognizes the standard JSON IBAN payload:
 *    {"iban":"BH..."}
 *    When scanned, it immediately opens the Fawri+ direct transfer screen with the recipient bank & account pre-filled.
 * 2. Official Corporate/Commercial Merchant Account Mode (EMVCo MPM QRCPS):
 *    Standardized to Central Bank of Bahrain & The BENEFIT Company EMVCo specifications
 *    Used when the business has an official Merchant ID registered with acquiring bank.
 */
export const generateBenefitPayPayload = (
  amount: number,
  invoiceNo: string,
  configOrMerchant?: BenefitPayConfig | string,
  formatOverride?: 'BENEFIT_JSON' | 'RAW_IBAN' | 'EMV_MERCHANT'
): string => {
  const isDynamic = typeof amount === 'number' && amount > 0;
  const formattedAmount = isDynamic ? Number(amount).toFixed(3) : '0.000';
  const cleanInvoice = (invoiceNo || `INV-${Date.now().toString().slice(-6)}`).trim();

  let config: BenefitPayConfig;
  if (!configOrMerchant) {
    config = getStoredBenefitPayConfig();
  } else if (typeof configOrMerchant === 'string') {
    config = { ...getStoredBenefitPayConfig(), merchantId: configOrMerchant };
  } else {
    config = configOrMerchant;
  }

  const cleanIban = (config.iban || '').replace(/\s+/g, '').toUpperCase();

  // If RAW_IBAN requested
  if (formatOverride === 'RAW_IBAN') {
    return cleanIban || 'BH77SBIN02740045310001';
  }

  // 1. MOBILE_FAWRI mode (or forced BENEFIT_JSON):
  // Returns authentic JSON payload {"iban": "BH..."} recognized natively by BenefitPay scanner
  if (formatOverride === 'BENEFIT_JSON' || (config.accountType === 'MOBILE_FAWRI' && formatOverride !== 'EMV_MERCHANT')) {
    if (cleanIban && cleanIban.startsWith('BH')) {
      return JSON.stringify({ iban: cleanIban });
    }
    let cleanMobile = (config.mobileNumber || '').replace(/[^\d]/g, '');
    if (cleanMobile.length === 8 && !cleanMobile.startsWith('973')) {
      cleanMobile = `973${cleanMobile}`;
    }
    if (cleanMobile) {
      return JSON.stringify({ mobile: cleanMobile });
    }
  }

  // 2. Official Corporate/Commercial Merchant Account Mode (EMVCo MPM QRCPS)
  // 1. Tag 00: Payload Format Indicator (01)
  let emv = formatEMVCoTag('00', '01');

  // 2. Tag 01: Point of Initiation Method (12 = Dynamic with preset amount, 11 = Static)
  emv += formatEMVCoTag('01', isDynamic ? '12' : '11');

  // 3. Tag 26: Bahrain BENEFIT Scheme Merchant Account Information
  let sub26 = '';
  // Subtag 00: Globally Unique Scheme Identifier for Bahrain
  sub26 += formatEMVCoTag('00', 'bh.benefit');

  const cleanMerchant = (config.merchantId || '97300182').replace(/[^\w-]/g, '').trim();
  sub26 += formatEMVCoTag('01', cleanMerchant || '97300182');

  const branch = (config.branchId || 'POS-01').trim();
  if (branch) {
    sub26 += formatEMVCoTag('02', branch);
  }

  if (cleanIban) {
    sub26 += formatEMVCoTag('03', cleanIban);
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
  const rawName = (config.merchantName || 'layali sbi').trim();
  const safeName = rawName.replace(/[^\x20-\x7E]/g, '').trim() || 'LAYALI SUPERMARKET';
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
 * Direct BenefitPay Fawri+ IBAN payload
 */
export const generateFawriIbanPayload = (config?: BenefitPayConfig): string => {
  const cfg = config || getStoredBenefitPayConfig();
  const cleanIban = (cfg.iban || '').replace(/\s+/g, '').toUpperCase();
  return JSON.stringify({ iban: cleanIban || 'BH77SBIN02740045310001' });
};

/**
 * Raw IBAN string for direct copy / general banking apps
 */
export const generateFawriRawIban = (config?: BenefitPayConfig): string => {
  const cfg = config || getStoredBenefitPayConfig();
  return (cfg.iban || '').replace(/\s+/g, '').toUpperCase() || 'BH77SBIN02740045310001';
};

/**
 * Legacy Fawri string (backward compatibility)
 */
export const generateFawriRawString = (
  _amount?: number,
  _invoiceNo?: string,
  config?: BenefitPayConfig
): string => {
  return generateFawriIbanPayload(config);
};

export default generateBenefitPayPayload;
