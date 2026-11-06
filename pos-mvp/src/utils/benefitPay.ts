/**
 * Bahrain BenefitPay Fawri+ Dynamic QR Code Payload Generator & Configuration Engine
 * Standardized across Bahrain Central Bank (CBB) & BENEFIT Company specifications.
 * Supports both:
 * 1. Merchant Accounts (Corporate Fawri+ QR with Merchant ID & Terminal ID)
 * 2. Mobile Fawri+ / IBAN Accounts (Direct phone number / IBAN settlement for SME & Sole Proprietorships)
 */

export interface BenefitPayConfig {
  accountType: 'MERCHANT' | 'MOBILE_FAWRI';
  merchantId: string;       // e.g. "BH-BENEFIT-97300182" or Acquiring Bank Terminal/Merchant ID
  merchantName: string;     // e.g. "ASKAR SUPERMARKET"
  mobileNumber: string;     // e.g. "+973 39000000" or "39000000"
  iban: string;             // e.g. "BH67NBOB00000012345678"
  cprOrCr: string;          // CR or CPR Number
  branchId: string;         // e.g. "MAIN-01" or "POS-01"
  notes: string;            // Customer instructions
  updatedAt?: string;
}

export const DEFAULT_BENEFIT_CONFIG: BenefitPayConfig = {
  accountType: 'MERCHANT',
  merchantId: 'BH-BENEFIT-97300182',
  merchantName: 'ASKAR SUPERMARKET',
  mobileNumber: '+973 39000000',
  iban: '',
  cprOrCr: '200012345678901',
  branchId: 'MAIN-01',
  notes: 'Scan with BenefitPay app to pay directly',
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
      return { ...DEFAULT_BENEFIT_CONFIG, ...parsed };
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

  // Synchronize with master backend server
  const targetApi =
    apiBase ||
    (typeof window !== 'undefined' ? localStorage.getItem('master_server_url') : '') ||
    'http://localhost:3000';

  try {
    const res = await fetch(`${targetApi}/api/config/benefit-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merged),
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.config) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('benefitpay_config', JSON.stringify(data.config));
        }
        return data.config;
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
  const targetApi =
    apiBase ||
    (typeof window !== 'undefined' ? localStorage.getItem('master_server_url') : '') ||
    'http://localhost:3000';

  try {
    const res = await fetch(`${targetApi}/api/config/benefit-account`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object' && (data.merchantId || data.mobileNumber)) {
        const merged = { ...DEFAULT_BENEFIT_CONFIG, ...data };
        if (typeof window !== 'undefined') {
          localStorage.setItem('benefitpay_config', JSON.stringify(merged));
          if (data.merchantId) localStorage.setItem('benefitpay_merchant_id', data.merchantId);
        }
        return merged;
      }
    }
  } catch (e) {
    // Graceful offline fallback to cached config
  }
  return getStoredBenefitPayConfig();
};

/**
 * Bahrain BenefitPay Fawri+ Dynamic QR Code Payload Generator
 * Generates an authentic Fawri+ URL accepted by BenefitPay and camera scanners.
 */
export const generateBenefitPayPayload = (
  amount: number,
  invoiceNo: string,
  configOrMerchant?: BenefitPayConfig | string
): string => {
  const formattedAmount = Number(amount || 0).toFixed(3);
  const cleanInvoice = (invoiceNo || `INV-${Date.now().toString().slice(-6)}`).trim();

  let config: BenefitPayConfig;
  if (!configOrMerchant) {
    config = getStoredBenefitPayConfig();
  } else if (typeof configOrMerchant === 'string') {
    config = { ...getStoredBenefitPayConfig(), merchantId: configOrMerchant };
  } else {
    config = configOrMerchant;
  }

  if (config.accountType === 'MOBILE_FAWRI') {
    const cleanMobile = (config.mobileNumber || '').replace(/[^\d+]/g, '').trim();
    return `https://benefitpay.bh/fawriplus?mobile=${encodeURIComponent(cleanMobile)}&amount=${formattedAmount}&ref=${encodeURIComponent(cleanInvoice)}&name=${encodeURIComponent(config.merchantName || 'Askar Supermarket')}${config.iban ? `&iban=${encodeURIComponent(config.iban)}` : ''}`;
  }

  // Merchant Account Fawri+ QR
  const cleanMerchant = (config.merchantId || 'BH-BENEFIT-97300182').trim();
  return `https://benefitpay.bh/fawriplus?merchant=${encodeURIComponent(cleanMerchant)}&amount=${formattedAmount}&ref=${encodeURIComponent(cleanInvoice)}&name=${encodeURIComponent(config.merchantName || 'Askar Supermarket')}`;
};

/**
 * Raw Fawri+ protocol payload string (used on customer dual screens and POS display)
 */
export const generateFawriRawString = (
  amount: number,
  invoiceNo: string,
  config?: BenefitPayConfig
): string => {
  const cfg = config || getStoredBenefitPayConfig();
  const amt = Number(amount || 0).toFixed(3);
  const inv = (invoiceNo || `INV-${Date.now().toString().slice(-6)}`).trim();

  if (cfg.accountType === 'MOBILE_FAWRI') {
    return `BH-BENEFIT-FAWRI:MOBILE=${cfg.mobileNumber}:AMT=${amt}:REF=${inv}:NAME=${cfg.merchantName || 'ASKAR'}`;
  }
  return `BH-BENEFIT-FAWRI:MERCHANT=${cfg.merchantId}:AMT=${amt}:REF=${inv}:NAME=${cfg.merchantName || 'ASKAR'}`;
};

export default generateBenefitPayPayload;
