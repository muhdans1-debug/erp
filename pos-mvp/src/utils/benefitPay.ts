/**
 * Bahrain BenefitPay Fawri+ Dynamic QR Code Payload Generator
 * Formats BHD currency to 3 decimal places and binds merchant ID and unique transaction reference/invoice.
 */
export const generateBenefitPayPayload = (
  amount: number, 
  invoiceNo: string, 
  merchantId: string = 'ASKAR_SUPERMARKET_01'
): string => {
  // Format the amount to exactly 3 decimal places for Bahraini Dinar (BHD)
  const formattedAmount = Number(amount || 0).toFixed(3);
  const cleanMerchant = (merchantId || 'ASKAR_SUPERMARKET_01').trim();
  const cleanInvoice = (invoiceNo || `INV-${Date.now()}`).trim();
  
  // Direct Fawri+ intent URL scheme accepted by BenefitPay and camera scanners in Bahrain
  const payload = `https://benefitpay.bh/fawriplus?merchant=${encodeURIComponent(cleanMerchant)}&amount=${formattedAmount}&ref=${encodeURIComponent(cleanInvoice)}`;
  
  return payload;
};

export default generateBenefitPayPayload;

