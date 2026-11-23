/**
 * Bahrain National Bureau for Revenue (NBR) Simplified Tax Invoice QR Code Encoder
 * Implements official 5-Tag TLV (Tag-Length-Value) Base64 specification according to Article 53:
 * - Tag 1 (0x01): Seller Name
 * - Tag 2 (0x02): VAT Registration Number (15 digits)
 * - Tag 3 (0x03): Invoice Timestamp (ISO 8601 format)
 * - Tag 4 (0x04): Invoice Total (Including VAT, formatted to 3 decimal places e.g. 1.250)
 * - Tag 5 (0x05): Total VAT Amount (Formatted to 3 decimal places e.g. 0.114)
 */

export function generateNbrTlvBase64({
  sellerName = 'LAYALI SUPERMARKET W.L.L.',
  vatNumber = '200000000000002',
  timestamp,
  total = 0,
  vatAmount
}) {
  const seller = String(sellerName || 'LAYALI SUPERMARKET W.L.L.').trim();
  const vatNo = String(vatNumber || '200000000000002').trim();
  let isoDate = '';
  try {
    isoDate = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
  } catch {
    isoDate = new Date().toISOString();
  }
  const totalNum = Number(total || 0);
  const totalStr = totalNum.toFixed(3);
  const vatStr = vatAmount !== undefined
    ? Number(vatAmount).toFixed(3)
    : Number(totalNum - (totalNum / 1.10)).toFixed(3);

  const tags = [
    { tag: 1, val: seller },
    { tag: 2, val: vatNo },
    { tag: 3, val: isoDate },
    { tag: 4, val: totalStr },
    { tag: 5, val: vatStr },
  ];

  const byteBuffers = [];
  const encoder = new TextEncoder();

  for (const { tag, val } of tags) {
    const valBytes = encoder.encode(val);
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
