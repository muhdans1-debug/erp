/**
 * Bahrain National Bureau for Revenue (NBR) Simplified Tax Invoice QR Code Encoder
 * Implements the official 5-Tag TLV (Tag-Length-Value) Base64 specification:
 * - Tag 1 (0x01): Seller Name
 * - Tag 2 (0x02): VAT Registration Number (15 digits)
 * - Tag 3 (0x03): Invoice Timestamp (ISO 8601 format)
 * - Tag 4 (0x04): Invoice Total (Including VAT, formatted to 3 decimal places e.g. 1.250)
 * - Tag 5 (0x05): Total VAT Amount (Formatted to 3 decimal places e.g. 0.114)
 */
import QRCode from 'qrcode';

export interface NbrInvoiceQrParams {
  sellerName?: string;
  vatNumber?: string;
  timestamp?: string | Date;
  total: number;
  vatAmount?: number;
}

/**
 * Generates the raw TLV Base64 payload required by Bahrain NBR tax regulations.
 */
export function generateNbrTlvBase64(params: NbrInvoiceQrParams): string {
  const seller = (params.sellerName || 'ASKAR SUPERMARKET').trim();
  const vatNo = (params.vatNumber || '200012345678901').trim();
  const dateObj = params.timestamp ? new Date(params.timestamp) : new Date();
  const isoDate = !isNaN(dateObj.getTime()) ? dateObj.toISOString() : new Date().toISOString();
  const totalStr = Number(params.total || 0).toFixed(3);
  const vatStr = params.vatAmount !== undefined
    ? Number(params.vatAmount).toFixed(3)
    : Number((params.total - (params.total / 1.10))).toFixed(3);

  const tags = [
    { tag: 1, val: seller },
    { tag: 2, val: vatNo },
    { tag: 3, val: isoDate },
    { tag: 4, val: totalStr },
    { tag: 5, val: vatStr },
  ];

  const byteBuffers: Uint8Array[] = [];

  for (const { tag, val } of tags) {
    const valBytes = new TextEncoder().encode(val);
    const tagHeader = new Uint8Array([tag, valBytes.length]);
    const merged = new Uint8Array(tagHeader.length + valBytes.length);
    merged.set(tagHeader, 0);
    merged.set(valBytes, tagHeader.length);
    byteBuffers.push(merged);
  }

  const totalLength = byteBuffers.reduce((sum, b) => sum + b.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const b of byteBuffers) {
    combined.set(b, offset);
    offset += b.length;
  }

  let binary = '';
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

/**
 * Generates an image data URL (PNG) of the NBR compliant QR code.
 */
export async function generateNbrQrDataUrl(params: NbrInvoiceQrParams, width: number = 180): Promise<string> {
  const tlvBase64 = generateNbrTlvBase64(params);
  return await QRCode.toDataURL(tlvBase64, {
    width,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });
}

