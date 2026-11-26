/**
 * Sunmi Innerprinter & Bill Receipt Style Configuration Engine
 * Centralized settings for Askar Supermarket thermal printing.
 * 
 * Supports:
 * - 58mm (Sunmi D2mini / V2 / T2mini) & 80mm (Wide rolls / external ESC/POS)
 * - Compact Professional Mode: Shrunk, clean, paper-saving Bahrain NBR retail standard
 * - Bilingual Arabic / English typography & Ministry of Industry and Commerce C.R. / NBR compliance
 * - Hardware density / burn intensity control (Normal, Dark, Deep Burn)
 * - Dynamic live preview & thermal slip customization
 */

export interface SunmiPrinterStyleConfig {
  // Store & Tax Identity
  shopNameEn: string;
  shopNameAr: string;
  crNumber: string;        // Commercial Registration (س.ت)
  vatNumber: string;       // NBR VAT TRN (الرقم الضريبي)
  shopAddressEn: string;
  shopAddressAr: string;
  shopPhone: string;

  // Paper & Hardware Configuration
  paperWidth: '58mm' | '80mm';
  fontSize: 'compact' | 'standard' | 'large';
  printDensity: 'normal' | 'dark' | 'deep_burn';
  feedLines: number;
  autoCut: boolean;

  // Content & Layout Toggles
  showArabicHeader: boolean;
  showArabicItems: boolean;
  showVatBreakdown: boolean;
  showNbrQr: boolean;
  showReturnBarcode: boolean;
  showKhataQr: boolean;
  seniorHighLegibility: boolean; // Ultra-bold high-contrast mode for laborers & elderly customers
  totalBannerSize: 'standard' | 'extra_bold' | 'jumbo'; // Scale of total price banner
  showCreditBalanceBox: boolean; // Prominent framed box for current Khata balance due

  // Footer & Policies
  footerPolicyEn: string;
  footerPolicyAr: string;
  receiptTheme: 'classic_supermarket' | 'compact_quick' | 'executive_framed';
  updatedAt?: string;
}

// ⚡ COMPACT PROFESSIONAL PRESET (Shrunk, Sleek, Paper-Saving & 100% NBR Compliant)
export const COMPACT_PROFESSIONAL_CONFIG: SunmiPrinterStyleConfig = {
  shopNameEn: 'LAYALI SUPERMARKET',
  shopNameAr: 'أسواق ليالي المركزية',
  crNumber: '790614189',
  vatNumber: '200012345678901',
  shopAddressEn: 'Askar, Bahrain',
  shopAddressAr: 'عسكر، البحرين',
  shopPhone: '+973 33843855',

  paperWidth: '58mm',
  fontSize: 'compact',
  printDensity: 'deep_burn',
  feedLines: 4, // 4 lines (~16-18mm) physically required to feed footer past Sunmi tear bar / cutter blade
  autoCut: true,

  showArabicHeader: true,
  showArabicItems: false,       // Single-line clean items (saves 1-2 lines per item)
  showVatBreakdown: false,      // Consolidated 1-line subtotal + VAT summary
  showNbrQr: true,              // Required by Bahrain NBR law (sharp, compact)
  showReturnBarcode: false,     // Disabled to save 3-4 cm of paper
  showKhataQr: false,           // Disabled to prevent double QR code clutter
  seniorHighLegibility: false,  // Compact tight margins & fonts
  totalBannerSize: 'standard',  // Clean single-line bold total
  showCreditBalanceBox: false,  // Concise 2-line Khata balance

  footerPolicyEn: 'Return/exchange within 3 days with bill',
  footerPolicyAr: 'الاستبدال والاسترجاع خلال ٣ أيام مع الفاتورة',
  receiptTheme: 'compact_quick',
  updatedAt: new Date().toISOString(),
};

// 📋 CLASSIC FULL PRESET (Extended layout with multi-line banners)
export const CLASSIC_FULL_CONFIG: SunmiPrinterStyleConfig = {
  shopNameEn: 'LAYALI SUPERMARKET',
  shopNameAr: 'أسواق ليالي المركزية',
  crNumber: '790614189',
  vatNumber: '200012345678901',
  shopAddressEn: 'Building 123, Road 456, Block 951, Askar, Bahrain',
  shopAddressAr: 'مبنى ١٢٣، طريق ٤٥٦، مجمع ٩٥١، عسكر، البحرين',
  shopPhone: '+973 33843855',

  paperWidth: '58mm',
  fontSize: 'standard',
  printDensity: 'deep_burn',
  feedLines: 4,
  autoCut: true,

  showArabicHeader: true,
  showArabicItems: true,
  showVatBreakdown: true,
  showNbrQr: true,
  showReturnBarcode: true,
  showKhataQr: true,
  seniorHighLegibility: true,
  totalBannerSize: 'jumbo',
  showCreditBalanceBox: true,

  footerPolicyEn: 'Exchange or return accepted within 3 days with receipt',
  footerPolicyAr: 'الاستبدال والاسترجاع خلال ٣ أيام مع إحضار الفاتورة الأصلية',
  receiptTheme: 'classic_supermarket',
  updatedAt: new Date().toISOString(),
};

// Default active preset is Compact Professional
export const DEFAULT_PRINTER_STYLE_CONFIG: SunmiPrinterStyleConfig = COMPACT_PROFESSIONAL_CONFIG;

const STORAGE_KEY = 'pos_sunmi_printer_style_config_v2';
const LEGACY_STORAGE_KEY = 'pos_sunmi_printer_style_config';

/**
 * Retrieve active printer style config from localStorage with defaults fallback.
 * Automatically migrates older verbose configs to compact paper-saving format.
 */
export const getPrinterStyleConfig = (): SunmiPrinterStyleConfig => {
  if (typeof window === 'undefined') {
    return DEFAULT_PRINTER_STYLE_CONFIG;
  }

  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      // Auto-heal feedLines: Sunmi cutter is physically 18-20mm (4 lines) behind printhead.
      // If feedLines was previously set to < 4, clamp to 4 to prevent footer clipping into next print.
      const healedFeedLines = (!parsed.feedLines || Number(parsed.feedLines) < 4) ? 4 : Number(parsed.feedLines);
      return {
        ...DEFAULT_PRINTER_STYLE_CONFIG,
        ...parsed,
        feedLines: healedFeedLines,
      };
    }

    // Check if legacy config exists and migrate to compact
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const parsedLegacy = JSON.parse(legacyRaw);
      // Preserve custom shop name / phone / CR if user entered custom values, but enforce compact mode
      const migrated: SunmiPrinterStyleConfig = {
        ...DEFAULT_PRINTER_STYLE_CONFIG,
        shopNameEn: parsedLegacy.shopNameEn || DEFAULT_PRINTER_STYLE_CONFIG.shopNameEn,
        shopNameAr: parsedLegacy.shopNameAr || DEFAULT_PRINTER_STYLE_CONFIG.shopNameAr,
        crNumber: parsedLegacy.crNumber || DEFAULT_PRINTER_STYLE_CONFIG.crNumber,
        vatNumber: parsedLegacy.vatNumber || DEFAULT_PRINTER_STYLE_CONFIG.vatNumber,
        shopPhone: parsedLegacy.shopPhone || DEFAULT_PRINTER_STYLE_CONFIG.shopPhone,
        paperWidth: parsedLegacy.paperWidth || DEFAULT_PRINTER_STYLE_CONFIG.paperWidth,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch (e) {
    console.warn('Failed to parse printer style config:', e);
  }

  return { ...DEFAULT_PRINTER_STYLE_CONFIG };
};

/**
 * Save updated printer style config, sync legacy keys, and notify all listeners
 */
export const savePrinterStyleConfig = (
  updates: Partial<SunmiPrinterStyleConfig>
): SunmiPrinterStyleConfig => {
  const current = getPrinterStyleConfig();
  const merged: SunmiPrinterStyleConfig = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(merged));
      localStorage.setItem('pos_receipt_format', merged.paperWidth);
      window.dispatchEvent(
        new CustomEvent('pos-printer-config-changed', { detail: merged })
      );
    } catch (e) {
      console.warn('Failed to persist printer style config:', e);
    }
  }

  return merged;
};

/**
 * Reset config back to compact factory defaults
 */
export const resetPrinterStyleConfig = (): SunmiPrinterStyleConfig => {
  return savePrinterStyleConfig(DEFAULT_PRINTER_STYLE_CONFIG);
};
