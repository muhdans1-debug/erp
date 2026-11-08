/**
 * Bahrain BenefitPay Fawri+ Dynamic QR Code Payload Generator & Configuration Engine
 * EMVCo Merchant-Presented Mode (MPM) QRCPS specifications for Admin Dashboard
 */

export interface BenefitPayConfig {
  accountType: 'MERCHANT' | 'MOBILE_FAWRI';
  merchantId: string;       // e.g. "97300182" or Acquiring Bank Terminal/Merchant ID
  merchantName: string;     // e.g. "ASKAR SUPERMARKET"
  mobileNumber: string;     // e.g. "+973 39401234" or "39401234"
  iban: string;             // e.g. "BH67NBOB00000012345678"
  cprOrCr: string;          // CR or CPR Number
  branchId: string;         // e.g. "MAIN-01" or "POS-01"
  notes: string;            // Customer instructions
  updatedAt?: string;
}

export const DEFAULT_BENEFIT_CONFIG: BenefitPayConfig = {
  accountType: 'MERCHANT',
  merchantId: '97300182',
  merchantName: 'ASKAR SUPERMARKET',
  mobileNumber: '+973 39000000',
  iban: '',
  cprOrCr: '200012345678901',
  branchId: 'MAIN-01',
  notes: 'Scan with BenefitPay app to pay directly',
  updatedAt: new Date().toISOString(),
};

export const formatEMVCoTag = (tag: string, value: string): string => {
  if (!value) return '';
  const len = String(value.length).padStart(2, '0');
  return `${tag}${len}${value}`;
};

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

export const generateBenefitPayPayload = (
  amount: number,
  invoiceNo: string,
  config: BenefitPayConfig
): string => {
  const isDynamic = typeof amount === 'number' && amount > 0;
  const formattedAmount = isDynamic ? Number(amount).toFixed(3) : '0.000';
  const cleanInvoice = (invoiceNo || `INV-${Date.now().toString().slice(-6)}`).trim();

  // 1. Tag 00: Format Indicator (01)
  let emv = formatEMVCoTag('00', '01');

  // 2. Tag 01: Initiation Method (12 = dynamic, 11 = static)
  emv += formatEMVCoTag('01', isDynamic ? '12' : '11');

  // 3. Tag 26: Domestic scheme (bh.benefit)
  let sub26 = '';
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

  // 4. Tag 52: MCC 5411 (Grocery / Supermarket)
  emv += formatEMVCoTag('52', '5411');

  // 5. Tag 53: Currency 048 (BHD)
  emv += formatEMVCoTag('53', '048');

  // 6. Tag 54: Amount
  if (isDynamic) {
    emv += formatEMVCoTag('54', formattedAmount);
  }

  // 7. Tag 58: Country BH
  emv += formatEMVCoTag('58', 'BH');

  // 8. Tag 59: Merchant Name
  const rawName = (config.merchantName || 'ASKAR SUPERMARKET').trim();
  const safeName = rawName.replace(/[^\x20-\x7E]/g, '').trim() || 'ASKAR SUPERMARKET';
  emv += formatEMVCoTag('59', safeName.slice(0, 25));

  // 9. Tag 60: City
  emv += formatEMVCoTag('60', 'ASKAR');

  // 10. Tag 62: Additional Data (Bill Number & Transaction Reference)
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

  // 11. Tag 63: CRC16
  emv += '6304';
  const checksum = calculateEMVCoCRC16(emv);
  emv += checksum;

  return emv;
};
