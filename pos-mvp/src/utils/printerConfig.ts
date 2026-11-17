/**
 * Sunmi Innerprinter & Bill Receipt Style Configuration Engine
 * Centralized settings for Askar Supermarket thermal printing.
 * 
 * Supports:
 * - 58mm (Sunmi D2mini / V2 / T2mini) & 80mm (Wide rolls / external ESC/POS)
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

export const DEFAULT_PRINTER_STYLE_CONFIG: SunmiPrinterStyleConfig = {
  shopNameEn: 'ASKAR SUPERMARKET',
  shopNameAr: 'أسواق عسكر المركزية',
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

const STORAGE_KEY = 'pos_sunmi_printer_style_config';

/**
 * Retrieve the active printer style config from localStorage with defaults fallback
 */
export const getPrinterStyleConfig = (): SunmiPrinterStyleConfig => {
  if (typeof window === 'undefined') {
    return DEFAULT_PRINTER_STYLE_CONFIG;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate legacy 80mm setting if set
      const legacyFormat = localStorage.getItem('pos_receipt_format');
      if (legacyFormat === '80mm' && !parsed.paperWidth) {
        parsed.paperWidth = '80mm';
      }
      return {
        ...DEFAULT_PRINTER_STYLE_CONFIG,
        ...parsed,
      };
    }
  } catch (e) {
    console.warn('Failed to parse printer style config:', e);
  }

  // Check legacy format fallback
  const legacyFormat = typeof window !== 'undefined' ? localStorage.getItem('pos_receipt_format') : null;
  if (legacyFormat === '80mm') {
    return {
      ...DEFAULT_PRINTER_STYLE_CONFIG,
      paperWidth: '80mm',
    };
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
      // Sync legacy receipt format key for components reading pos_receipt_format directly
      localStorage.setItem('pos_receipt_format', merged.paperWidth);
      // Dispatch custom window event
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
 * Reset config back to pristine factory defaults
 */
export const resetPrinterStyleConfig = (): SunmiPrinterStyleConfig => {
  return savePrinterStyleConfig(DEFAULT_PRINTER_STYLE_CONFIG);
};
