/**
 * GS1 / EAN-13 Supermarket Scale & Deli Barcode Parser
 *
 * Supermarket weighing scales (Bizerba, Mettler Toledo, Avery Berkel, Digi, Teraoka)
 * generate in-store price-embedded or weight-embedded 13-digit EAN-13 barcodes.
 *
 * EAN-13 In-Store Variable Measure Format:
 * - Digits 1-2 (Index 0-1): In-store prefix:
 *     - '20': In-store variable measure (price/weight embedded)
 *     - '21': Price-embedded barcode (Total Price encoded on label)
 *     - '22': Weight-embedded barcode (Weight encoded in grams on label)
 * - Digits 3-7 (Index 2-6): 5-digit PLU (Item Code), e.g. "00101"
 * - Digits 8-12 (Index 7-11): 5-digit Value (Price or Weight in grams/fils)
 * - Digit 13 (Index 12): Modulo-10 checksum digit
 */

export interface ScaleBarcodeResult {
  isScaleBarcode: boolean;
  rawBarcode: string;
  prefix?: string;
  plu?: string;             // 5-digit PLU string, e.g. "00101"
  numericPlu?: number;      // e.g. 101
  type?: 'PRICE' | 'WEIGHT';
  rawDigits?: string;       // e.g. "02450"
  extractedValue?: number;  // e.g. 2.450 (BD or KG)
  formattedValue?: string;  // e.g. "2.450"
  checksum?: string;
}

/**
 * Detects and parses standard 13-digit price-embedded or weight-embedded scale barcodes
 * @param barcode Raw scanned barcode string
 * @param currencyDecimals Number of decimal places (default: 3 for Bahrain BHD, 1 BD = 1000 fils)
 */
export function parseScaleBarcode(
  barcode: string,
  currencyDecimals: number = 3
): ScaleBarcodeResult {
  const clean = String(barcode || '').trim();

  // Must be exactly 13 digits
  if (!/^\d{13}$/.test(clean)) {
    return { isScaleBarcode: false, rawBarcode: clean };
  }

  // Detect in-store variable measure prefix (20, 21, 22)
  const prefix = clean.slice(0, 2);
  if (!['20', '21', '22'].includes(prefix)) {
    return { isScaleBarcode: false, rawBarcode: clean };
  }

  // Extract 5-digit PLU (Characters at index 2 to 6 inclusive)
  const plu = clean.slice(2, 7);
  const numericPlu = parseInt(plu, 10);

  // Extract remaining 5 characters before final checksum (Characters at index 7 to 11 inclusive)
  const rawDigits = clean.slice(7, 12);
  const rawValue = parseInt(rawDigits, 10);

  // Extract final checksum digit (Index 12)
  const checksum = clean.charAt(12);

  // Prefix 22 is typically weight-embedded (grams); 21 and 20 are price-embedded
  const type: 'PRICE' | 'WEIGHT' = prefix === '22' ? 'WEIGHT' : 'PRICE';

  // Handle decimal placement correctly:
  // For BHD currency, 3 decimals: 02450 fils -> 2.450 BHD (divide by 1000)
  // For weight in kg: 01250 grams -> 1.250 kg (divide by 1000)
  const divisor = Math.pow(10, currencyDecimals);
  const extractedValue = Number((rawValue / divisor).toFixed(currencyDecimals));

  return {
    isScaleBarcode: true,
    rawBarcode: clean,
    prefix,
    plu,
    numericPlu,
    type,
    rawDigits,
    extractedValue,
    formattedValue: extractedValue.toFixed(currencyDecimals),
    checksum,
  };
}

/**
 * Searches a product catalog to find the matching item for a parsed scale PLU
 */
export function findProductByPLU<T extends { id: string; barcode?: string; name: string; sellingPrice?: number }>(
  catalog: T[],
  parsed: ScaleBarcodeResult
): T | undefined {
  if (!parsed.isScaleBarcode || !parsed.plu) return undefined;

  const targetPlu = parsed.plu;
  const numPluStr = String(parsed.numericPlu);

  return catalog.find((p) => {
    const id = String(p.id).trim().toLowerCase();
    const barcode = String(p.barcode || '').trim().toLowerCase();

    // 1. Direct match with 5-digit PLU (e.g. "00101")
    if (id === targetPlu || barcode === targetPlu) return true;

    // 2. Direct match with numeric PLU (e.g. "101")
    if (id === numPluStr || barcode === numPluStr) return true;

    // 3. Match barcode starting with prefix + PLU (e.g. "2100101...")
    if (
      parsed.prefix &&
      (barcode.startsWith(`${parsed.prefix}${targetPlu}`) ||
        id.startsWith(`${parsed.prefix}${targetPlu}`))
    ) {
      return true;
    }

    // 4. Barcode exact match with raw scanned barcode
    if (barcode === parsed.rawBarcode.toLowerCase()) return true;

    return false;
  });
}
