// pos-mvp/src/services/salesService.ts
import { getApiBaseUrl } from '../utils/apiConfig';

/**
 * Resolves the active master backend URL via unified config
 */
export const getMasterServerUrl = (): string => {
  return getApiBaseUrl();
};

/**
 * 🔒 Process Secure Refund with Dynamic Manager PIN Verification
 * Securely calls /api/sales/refund passing the user-entered manager PIN
 * and decoupled from hardware drivers.
 */
export const processSecureRefund = async (invoiceNo: string, managerPin: string, refundData: any = {}) => {
  if (!managerPin || !managerPin.trim()) {
    throw new Error('Manager authorization PIN is required to process refunds.');
  }

  const masterBase = getMasterServerUrl();
  
  const response = await fetch(`${masterBase}/api/sales/refund`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json', 
      'x-manager-pin': managerPin.trim() // Securely passing the user-entered PIN
    },
    body: JSON.stringify({ invoiceNo, ...refundData })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || 'Refund rejected: Invalid PIN or server error');
  }

  return await response.json();
};

