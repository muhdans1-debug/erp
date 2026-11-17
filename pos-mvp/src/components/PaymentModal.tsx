import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Smartphone,
  Banknote,
  CreditCard,
  CheckCircle2,
  Printer,
  Copy,
  Check,
  RefreshCw,
  Settings,
  Coins
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { printFullReceipt, formatSaleReceiptText } from '../utils/printer';
import { getPrinterStyleConfig } from '../utils/printerConfig';
import {
  getNetworkPrinterConfig,
  setNetworkPrinterConfig,
  testSunmiNetworkPrint,
  isNativeSunmiHardware
} from '../utils/networkPrinter';
import { generateNbrTlvBase64 } from '../utils/nbrQr';
import { openCashDrawer } from '../services/cashDrawerService';
import { playThankYouVoice } from '../utils/sound';
import { saveSaleOffline } from '../utils/nativeDb';
import {
  BenefitPayConfig,
  getStoredBenefitPayConfig,
  fetchBenefitPayConfig,
  generateBenefitPayPayload,
} from '../utils/benefitPay';
import BenefitPayConfigModal from './BenefitPayConfigModal';
import { DEFAULT_EDGE_API_URL } from '../utils/apiConfig';
import { getRegionalIsoString, getSynchronizedDate } from '../utils/time';
import { saveRecentSale } from '../services/recentSalesService';

export interface PaymentItem {
  id: string;
  name: string;
  price?: number;
  qty?: number;
  unitCost?: number;
  sellingPrice?: number;
  purchasePrice?: number;
  quantity?: number;
  vatRate?: number;
  taxRate?: number;
}

export interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalAmount?: number;
  total?: number;
  subtotal?: number;
  vat?: number;
  cart?: PaymentItem[];
  customer?: { id: string; name: string; currentBalance?: number; cardUid?: string | null } | null;
  apiBase?: string;
  initialMethod?: 'CASH' | 'BENEFIT_PAY' | 'CARD';
  invoiceNo?: string;
  autoPrintReceipt?: boolean;
  onToggleAutoPrint?: (enabled: boolean) => void;
  onSuccess?: (receiptData: any) => void;
  onComplete?: () => void;
  initialBenefitPayment?: any;
  receiptFormat?: '58mm' | '80mm';
  onReceiptFormatChange?: (format: '58mm' | '80mm') => void;
}

export default function PaymentModal({
  isOpen,
  onClose,
  totalAmount: propTotalAmount,
  total: propTotal,
  subtotal: propSubtotal = 0,
  vat: propVat = 0,
  cart = [],
  customer,
  apiBase = 'http://localhost:3000',
  initialMethod = 'BENEFIT_PAY',
  invoiceNo: propInvoiceNo,
  autoPrintReceipt,
  onToggleAutoPrint,
  onSuccess,
  onComplete,
  initialBenefitPayment,
  receiptFormat: propReceiptFormat,
  onReceiptFormatChange,
}: PaymentModalProps) {
  const totalAmount = propTotalAmount !== undefined ? propTotalAmount : (propTotal !== undefined ? propTotal : 0);
  const subtotal = propSubtotal;
  const vat = propVat;
  const [selectedMethod, setSelectedMethod] = useState<'CASH' | 'BENEFIT_PAY' | 'CARD'>(initialMethod);

  // Thermal paper roll width (58mm Compact vs 80mm Standard)
  const [receiptFormat, setReceiptFormat] = useState<'58mm' | '80mm'>(() => {
    if (propReceiptFormat) return propReceiptFormat;
    try {
      const saved = localStorage.getItem('pos_receipt_format');
      if (saved === '80mm') return '80mm';
    } catch { }
    return '58mm';
  });

  useEffect(() => {
    if (propReceiptFormat && propReceiptFormat !== receiptFormat) {
      setReceiptFormat(propReceiptFormat);
    }
  }, [propReceiptFormat]);

  const handleFormatSelect = (format: '58mm' | '80mm') => {
    setReceiptFormat(format);
    try {
      localStorage.setItem('pos_receipt_format', format);
    } catch { }
    if (onReceiptFormatChange) onReceiptFormatChange(format);
  };

  // Selective Auto-Print Preference
  const [autoPrint, setAutoPrint] = useState<boolean>(() => {
    if (autoPrintReceipt !== undefined) return autoPrintReceipt;
    try {
      const saved = localStorage.getItem('pos_auto_print_receipt');
      if (saved !== null) return JSON.parse(saved);
    } catch { }
    return false;
  });

  useEffect(() => {
    if (autoPrintReceipt !== undefined) {
      setAutoPrint(autoPrintReceipt);
    }
  }, [autoPrintReceipt]);

  // BenefitPay Owner Account Configuration
  const [benefitConfig, setBenefitConfig] = useState<BenefitPayConfig>(getStoredBenefitPayConfig);
  const [showBenefitConfigModal, setShowBenefitConfigModal] = useState(false);

  // Network Sunmi Printer State (Billing on Laptop -> Printing on Sunmi)
  const [printerConfig, setPrinterConfigState] = useState(getNetworkPrinterConfig);
  const [testingSunmi, setTestingSunmi] = useState(false);
  const isNative = isNativeSunmiHardware();

  useEffect(() => {
    const handlePrinterCfg = () => {
      setPrinterConfigState(getNetworkPrinterConfig());
      const pCfg = getPrinterStyleConfig();
      if (pCfg.paperWidth) {
        setReceiptFormat(pCfg.paperWidth);
      }
    };
    window.addEventListener('pos-printer-config-changed', handlePrinterCfg);
    return () => window.removeEventListener('pos-printer-config-changed', handlePrinterCfg);
  }, []);

  const [copiedMobile, setCopiedMobile] = useState(false);
  const [copiedIban, setCopiedIban] = useState(false);

  useEffect(() => {
    const handleConfigUpdate = (e: any) => {
      setBenefitConfig(e.detail || getStoredBenefitPayConfig());
    };
    window.addEventListener('benefitpay_config_updated', handleConfigUpdate);
    return () => window.removeEventListener('benefitpay_config_updated', handleConfigUpdate);
  }, []);

  // Dynamically refresh BenefitPay owner settings from backend server when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchBenefitPayConfig(apiBase).then((remote) => {
        if (remote) setBenefitConfig(remote);
      }).catch(() => { });
    }
  }, [isOpen, apiBase]);

  // Stable session invoice number (persisted for the duration of this payment modal)
  const activeInvoiceNo = useMemo(() => {
    return propInvoiceNo || `INV-${Date.now().toString().slice(-6)}`;
  }, [propInvoiceNo, isOpen]);

  // Generate unique transaction reference for this payment session
  const transactionRef = useMemo(() => {
    const timestamp = Date.now().toString().slice(-6);
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `BP-TXN-${timestamp}-${rand}`;
  }, [totalAmount, isOpen]);

  // QR Code format toggle for Fawri+ (BenefitPay App JSON vs Raw IBAN vs EMVCo Merchant)
  const [qrFormat, setQrFormat] = useState<'BENEFIT_JSON' | 'RAW_IBAN' | 'EMV_MERCHANT'>('BENEFIT_JSON');

  // Fawri+ Dynamic QR Code Payload (generated via benefitPay utility)
  const qrPayload = useMemo(() => {
    return generateBenefitPayPayload(totalAmount, activeInvoiceNo, benefitConfig, qrFormat);
  }, [totalAmount, activeInvoiceNo, benefitConfig, qrFormat]);

  // Bahrain NBR Simplified Tax Invoice QR (Article 53 TLV Base64)
  const nbrPayload = useMemo(() => {
    return generateNbrTlvBase64({
      sellerName: 'ASKAR SUPERMARKET',
      vatNumber: '200012345678901',
      timestamp: new Date(),
      total: totalAmount,
      vatAmount: vat,
    });
  }, [totalAmount, vat]);

  // Processing & Confirmation state
  const [processing, setProcessing] = useState(false);
  const [webhookAutoSettled, setWebhookAutoSettled] = useState(false);
  const [completedSale, setCompletedSale] = useState<{
    invoiceNo: string;
    paidAmount: number;
    paymentMethod: string;
    transactionRef?: string;
    cashTendered?: number;
    changeDue?: number;
    createdAt: string;
  } | null>(null);

  const [copiedRef, setCopiedRef] = useState(false);
  const [cashTendered, setCashTendered] = useState<string>('');
  const [tenderedAmount, setTenderedAmount] = useState<number>(totalAmount);

  useEffect(() => {
    if (isOpen && !completedSale) {
      setSelectedMethod(initialMethod);
      setCompletedSale(null);
      setProcessing(false);
      setCashTendered('');
      setTenderedAmount(totalAmount);
    }
  }, [isOpen, initialMethod]);

  // Cash Tendered & Change Calculations
  const parsedTender = parseFloat(cashTendered);
  const activeTendered = selectedMethod === 'CASH'
    ? (cashTendered.trim() !== '' && !isNaN(parsedTender) ? parsedTender : tenderedAmount)
    : totalAmount;
  const changeDue = activeTendered > totalAmount ? activeTendered - totalAmount : 0;
  const isShort = selectedMethod === 'CASH' && activeTendered < totalAmount && cashTendered.trim() !== '';

  if (!isOpen) return null;

  // Copy reference code to clipboard
  const handleCopyRef = () => {
    navigator.clipboard.writeText(transactionRef);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  // Complete checkout process (supports manual cashier click or automated BenefitPay webhook)
  const executePayment = async (overrideMethod?: 'CASH' | 'BENEFIT_PAY' | 'CARD', overrideRef?: string) => {
    if (processing) return;
    const finalMethod = overrideMethod || selectedMethod;
    const finalRef = overrideRef || (finalMethod === 'BENEFIT_PAY' ? transactionRef : undefined);
    setProcessing(true);

    const configuredTerminalId = typeof window !== 'undefined'
      ? (localStorage.getItem('terminal_id') || localStorage.getItem('active_terminal_id') || 'T1')
      : 'T1';

    const salePayload = {
      id: crypto.randomUUID(),
      tenantId: 'tenant_askar_01',
      terminalId: configuredTerminalId,
      storeId: 'store_askar_01',
      invoiceNo: activeInvoiceNo,
      cart,
      subtotal,
      vat,
      vatTotal: vat,
      total: totalAmount,
      paymentType: finalMethod,
      customerId: customer ? customer.id : null,
      transactionRef: finalRef,
      cashTendered: finalMethod === 'CASH' ? activeTendered : undefined,
      changeDue: finalMethod === 'CASH' ? changeDue : undefined,
      items: cart.map((item) => {
        const qty = item.quantity ?? (item as any).qty ?? 1;
        const unitPrice = item.sellingPrice ?? (item as any).price ?? 0;
        const lineTotal = Number((unitPrice * qty).toFixed(3));
        const prodName = item.name || (item as any).productName || 'Item';
        return {
          id: item.id || `si_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          productId: item.id || (item as any).productId,
          name: prodName,
          productName: prodName,
          barcode: (item as any).barcode || item.id,
          quantity: qty,
          qty,
          price: unitPrice,
          sellingPrice: unitPrice,
          priceAtSale: unitPrice,
          unitPrice: unitPrice,
          total_price: lineTotal,
          total: lineTotal,
          costAtSale: item.purchasePrice || (item as any).unitCost || 0,
          unitCost: item.purchasePrice || (item as any).unitCost || 0,
        };
      }),
    };

    // Authorised POS terminal handshake header (required by requirePosOrManagerAuth middleware)
    const posAuthHeaders = {
      'Content-Type': 'application/json',
      'x-pos-client': 'sunmi-d2mini',
    };

    let data: any = null;
    try {
      const res = await fetch(`${apiBase}/checkout`, {
        method: 'POST',
        headers: posAuthHeaders,
        body: JSON.stringify(salePayload),
        signal: AbortSignal.timeout(8000)  // Extended: Cloudflare Worker RTT from Bahrain ~900-1200ms + cold-start buffer
      });
      if (res.ok) {
        data = await res.json();
      } else {
        try { data = await res.json(); } catch { }
      }
    } catch (netErr) {
      console.warn('Payment checkout network notice (initiating instant local zero-block fallback):', netErr);
    }

    // Try failover alternative server if primary failed
    if (!data || !data.success) {
      const altCandidates = [DEFAULT_EDGE_API_URL].filter(u => !apiBase.startsWith(u));
      for (const altBase of altCandidates) {
        try {
          const altRes = await fetch(`${altBase}/checkout`, {
            method: 'POST',
            headers: posAuthHeaders,
            body: JSON.stringify(salePayload),
            signal: AbortSignal.timeout(6000)
          });
          if (altRes.ok) {
            const altData = await altRes.json();
            if (altData && altData.success) {
              data = altData;
              localStorage.setItem('master_server_url', altBase);
              break;
            }
          }
        } catch { }
      }
    }

    try {
      // Zero-block safeguard: Even if master server is unavailable, complete sale locally and print
      const isOnlineSuccess = Boolean(data && data.success);
      const verifiedInvoiceNo = isOnlineSuccess
        ? (data.formattedInvoice || data.invoice || data.invoiceNo || activeInvoiceNo)
        : activeInvoiceNo;

      if (!isOnlineSuccess) {
        saveSaleOffline({
          ...salePayload,
          id: salePayload.id || verifiedInvoiceNo,
          invoiceNo: verifiedInvoiceNo,
          offlineTimestamp: getRegionalIsoString()
        }).catch((err) => console.warn('Offline save error:', err));
      }

      const finalReceiptData = {
        invoiceNo: verifiedInvoiceNo,
        paidAmount: totalAmount,
        paymentMethod: finalMethod,
        transactionRef: finalRef,
        cashTendered: finalMethod === 'CASH' ? activeTendered : undefined,
        changeDue: finalMethod === 'CASH' ? changeDue : undefined,
        createdAt: getRegionalIsoString(),
      };

      // 💾 Persist to durable recent sales history for instant cashier reprint
      try {
        saveRecentSale({
          invoiceNo: finalReceiptData.invoiceNo,
          total: totalAmount,
          subtotal,
          vat,
          items: (cart || []).map((c: any) => ({
            name: c.name,
            nameAr: c.nameAr || c.name_ar,
            qty: c.qty ?? c.quantity ?? 1,
            price: c.price ?? c.sellingPrice ?? 0,
            vatRate: c.vatRate,
            is_weighed_item: c.is_weighed_item || c.isScaleItem,
            scaleWeight: c.scaleWeight
          })),
          paymentMode: finalMethod,
          timestamp: finalReceiptData.createdAt,
          customerName: customer?.name,
          customerPhone: (customer as any)?.phone || undefined,
          customerCardUid: customer?.cardUid || undefined,
          customerId: customer?.id || undefined,
          cashTendered: finalMethod === 'CASH' ? activeTendered : undefined,
          changeDue: finalMethod === 'CASH' ? changeDue : undefined,
          cashierName: localStorage.getItem('active_shift_cashier') || 'Register 01',
          transactionRef: finalRef,
        });
      } catch (saveRecentErr) {
        console.warn('Failed saving recent sale:', saveRecentErr);
      }

      // Strict hardware rule: Only trigger RJ11 solenoid kick on CASH payment!
      // BenefitPay Fawri+ keeps drawer physically locked.
      if (finalMethod === 'CASH') {
        openCashDrawer(changeDue).catch(() => { });
      }

      setCompletedSale(finalReceiptData);
      onSuccess?.(finalReceiptData);
      onComplete?.();
      playThankYouVoice('SALE');

      // Print full NBR VAT receipt via printer utility / Web Worker (if auto-print enabled)
      if (autoPrint) {
        const custBal = Number((customer as any)?.balance ?? (customer as any)?.currentBalance ?? 0);
        const isKhataSale = (finalMethod as string) === 'KHATA' || (finalMethod as string) === 'CREDIT' || (finalMethod as string) === 'CREDIT_PERSONAL';
        printFullReceipt({
          invoiceNo: finalReceiptData.invoiceNo,
          items: (cart || []) as any,
          subtotal,
          vat,
          total: totalAmount,
          paymentMode: finalMethod,
          cashTendered: finalMethod === 'CASH' ? activeTendered : undefined,
          changeDue: finalMethod === 'CASH' ? changeDue : undefined,
          customerName: customer?.name,
          customerCardUid: customer?.cardUid || undefined,
          customerId: customer?.id || undefined,
          customerUuid: customer?.id || undefined,
          previousBalance: isKhataSale ? custBal : undefined,
          newBalance: isKhataSale ? custBal + totalAmount : (custBal > 0 ? custBal : undefined),
          cashierName: 'Register 01',
          transactionRef: finalRef,
        }).catch(() => { });
      }
    } catch (err) {
      console.error('Payment checkout error:', err);
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmPayment = () => executePayment();

  // ⚡ BenefitPay Fawri+ Automated Webhook & Remote Polling Engine
  // Listens via:
  // 1. window event 'sunmi-remote-benefit-success' (dispatched by App.tsx from Cloudflare Edge heartbeat)
  // 2. High-speed 1.5-second active polling of /api/register/command?terminalId=... while modal is open
  // 3. Fastify WebSocket /ws bus fallback (for local network POS)
  useEffect(() => {
    if (!isOpen || completedSale) return;

    let isSubscribed = true;

    const handleBenefitPaymentEvent = async (detail: any) => {
      if (!isSubscribed || completedSale || processing) return;

      const receivedAmt = detail?.amount !== undefined && detail?.amount !== null ? Number(detail.amount) : null;
      const refNumber = detail?.referenceNumber || detail?.ref || transactionRef;

      // Validate amount match (within 0.005 BD tolerance for currency rounding)
      const matchesAmount = receivedAmt === null || Math.abs(receivedAmt - totalAmount) < 0.005;
      const matchesInvoice = Boolean(detail?.invoiceNo && activeInvoiceNo && detail.invoiceNo === activeInvoiceNo);
      const matchesRef = Boolean(detail?.referenceNumber && transactionRef && (
        detail.referenceNumber === transactionRef ||
        detail.referenceNumber.includes(transactionRef) ||
        transactionRef.includes(detail.referenceNumber)
      ));

      if (matchesAmount || matchesInvoice || matchesRef) {
        console.log(`⚡ [BenefitPay Webhook] Instant Fawri+ payment verified (BHD ${(receivedAmt ?? totalAmount).toFixed(3)}, Ref: ${refNumber})! Auto-settling sale...`);
        if (isSubscribed) {
          setWebhookAutoSettled(true);
          setSelectedMethod('BENEFIT_PAY');
          await executePayment('BENEFIT_PAY', refNumber);
        }
      } else {
        console.warn(`[BenefitPay Webhook] Amount mismatch: received BHD ${receivedAmt}, expected BHD ${totalAmount}`);
      }
    };

    // If initial payment was already delivered when modal opened
    if (initialBenefitPayment) {
      handleBenefitPaymentEvent(initialBenefitPayment);
    }

    // 1. CustomEvent listener
    const onRemoteBenefitSuccess = (e: any) => {
      handleBenefitPaymentEvent(e?.detail);
    };
    window.addEventListener('sunmi-remote-benefit-success', onRemoteBenefitSuccess);

    // 2. High-speed active command polling (every 1.5 seconds) while modal is active
    let resolvedTerminalId = 'T1';
    try {
      resolvedTerminalId = localStorage.getItem('terminal_id') || 'T1';
      if (resolvedTerminalId === 'SUNMI-D2-REG01' || resolvedTerminalId === '1') resolvedTerminalId = 'T1';
      if (resolvedTerminalId === 'F100' || resolvedTerminalId === '2') resolvedTerminalId = 'T2';
      if (resolvedTerminalId === 'LAPTOP-01' || resolvedTerminalId === 'WEB-POS' || resolvedTerminalId === '3') resolvedTerminalId = 'T3';
    } catch {}

    const candidateBases = [apiBase, DEFAULT_EDGE_API_URL].filter(
      (v, i, a): v is string => Boolean(v) && a.indexOf(v) === i
    );

    const pollInterval = setInterval(async () => {
      if (!isSubscribed || completedSale) return;
      for (const base of candidateBases) {
        try {
          const res = await fetch(`${base}/api/register/command?terminalId=${resolvedTerminalId}`, {
            headers: { 'x-pos-client': 'store-pos' },
            signal: AbortSignal.timeout(2000)
          });
          if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.commands) && data.commands.length > 0) {
              for (const cmd of data.commands) {
                if (typeof cmd === 'object' && (cmd.command === 'BENEFIT_PAY_SUCCESS' || cmd.type === 'BENEFIT_PAY_SUCCESS')) {
                  handleBenefitPaymentEvent(cmd.payload || cmd);
                } else if (typeof cmd === 'string' && cmd.includes('BENEFIT_PAY_SUCCESS')) {
                  handleBenefitPaymentEvent({ amount: totalAmount });
                }
              }
            }
          }
        } catch {}
      }
    }, 1500);

    // 3. WebSocket listener
    let ws: WebSocket | null = null;
    try {
      const wsUrl = (apiBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'))
        .replace(/^http:/, 'ws:')
        .replace(/^https:/, 'wss:')
        .replace(/\/+$/, '') + '/ws';

      ws = new WebSocket(wsUrl);
      ws.onmessage = async (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'BENEFIT_PAY_CONFIG_UPDATED' && data.config) {
            setBenefitConfig(data.config);
            return;
          }
          if (data.type === 'BENEFIT_PAY_SUCCESS') {
            handleBenefitPaymentEvent(data.payload || data);
          }
        } catch (err) {
          console.error('WebSocket parsing error:', err);
        }
      };
    } catch (wsErr) {
      console.warn('BenefitPay WS listener notice:', wsErr);
    }

    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
      window.removeEventListener('sunmi-remote-benefit-success', onRemoteBenefitSuccess);
      if (ws) {
        try { ws.close(); } catch {}
      }
    };
  }, [isOpen, completedSale, activeInvoiceNo, transactionRef, totalAmount, selectedMethod, apiBase, processing]);

  // Trigger thermal receipt print via hardware printer on Sunmi or isolated iframe on browser
  const handlePrintReceipt = async () => {
    try {
      const custBal = Number((customer as any)?.balance ?? (customer as any)?.currentBalance ?? 0);
      const payMethodStr = String(completedSale?.paymentMethod || selectedMethod);
      const isKhataSale = payMethodStr === 'KHATA' || payMethodStr === 'CREDIT' || payMethodStr === 'CREDIT_PERSONAL';
      await printFullReceipt({
        invoiceNo: completedSale?.invoiceNo || activeInvoiceNo,
        items: cart.map((i) => ({
          ...i,
          price: Number(i.price ?? i.sellingPrice ?? 0),
          qty: Number(i.qty ?? i.quantity ?? 1),
        })),
        total: totalAmount,
        subtotal,
        vat,
        paymentMode: completedSale?.paymentMethod || selectedMethod,
        transactionRef: completedSale?.transactionRef || transactionRef,
        cashTendered: completedSale?.cashTendered !== undefined ? completedSale.cashTendered : (cashTendered ? parseFloat(cashTendered) : undefined),
        changeDue: completedSale?.changeDue !== undefined ? completedSale.changeDue : changeDue,
        customerName: customer?.name,
        customerCardUid: customer?.cardUid || undefined,
        customerId: customer?.id || undefined,
        customerUuid: customer?.id || undefined,
        previousBalance: isKhataSale ? custBal : undefined,
        newBalance: isKhataSale ? custBal + totalAmount : (custBal > 0 ? custBal : undefined),
      });
    } catch (e) {
      console.warn('Direct printer dispatch notice:', e);
    }
  };

  // Exact authentic Sunmi monospaced receipt text
  const receiptText = useMemo(() => {
    const pCfg = getPrinterStyleConfig();
    return formatSaleReceiptText({
      shopName: pCfg.shopNameEn,
      shopNameAr: pCfg.shopNameAr,
      shopAddress: pCfg.shopAddressEn,
      shopPhone: pCfg.shopPhone,
      crNumber: pCfg.crNumber,
      vatNumber: pCfg.vatNumber,
      invoiceNo: completedSale?.invoiceNo || activeInvoiceNo || 'INV-005000',
      items: (cart || []) as any,
      subtotal,
      vat,
      total: totalAmount,
      paymentMode: completedSale?.paymentMethod || selectedMethod,
      cashTendered: completedSale?.cashTendered !== undefined ? completedSale.cashTendered : (cashTendered ? parseFloat(cashTendered) : undefined),
      changeDue: completedSale?.changeDue !== undefined ? completedSale.changeDue : changeDue,
      customerName: customer?.name,
      customerCardUid: customer?.cardUid || undefined,
      cashierName: "Register 01",
      transactionRef: completedSale?.transactionRef || transactionRef,
      isMess: (selectedMethod as string) === 'MESS_KHATA',
      saleDate: getSynchronizedDate(),
      styleConfig: { ...pCfg, paperWidth: receiptFormat },
    });
  }, [completedSale, activeInvoiceNo, cart, subtotal, vat, totalAmount, selectedMethod, cashTendered, changeDue, customer, transactionRef, receiptFormat]);

  return (
    <div
      className="select-none modal-overlay-print"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* THERMAL RECEIPT PRINT STYLES - ISOLATED 58mm / 80mm FORMAT */}
      <style>{`
        @media screen {
          #pos-thermal-receipt {
            display: none !important;
          }
        }
        @media print {
          @page {
            size: auto;
            margin: 0mm;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          .no-print, header, nav, aside {
            display: none !important;
          }
          .modal-overlay-print {
            position: static !important;
            background: transparent !important;
            backdrop-filter: none !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }
          #pos-thermal-receipt {
            display: block !important;
            position: static !important;
            left: auto !important;
            top: auto !important;
            margin: 0 auto !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
            box-sizing: border-box !important;
            font-family: 'Roboto Mono', Consolas, 'Courier New', monospace !important;
            font-weight: 600 !important;
            letter-spacing: -0.15px !important;
            line-height: 1.25 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #pos-thermal-receipt.format-58mm {
            width: 48mm !important;
            max-width: 48mm !important;
            padding: 1.5mm 1mm !important;
            border: none !important;
            font-size: 9.5px !important;
          }
          #pos-thermal-receipt.format-80mm {
            width: 70mm !important;
            max-width: 70mm !important;
            padding: 2mm 1.5mm !important;
            border: none !important;
            font-size: 11px !important;
          }
        }
      `}</style>

      {/* MODAL CONTAINER */}
      <div
        className="no-print"
        style={{
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          borderRadius: '20px',
          width: '100%',
          maxWidth: completedSale ? '480px' : '620px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '94vh',
          transition: 'all 0.25s ease',
        }}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: selectedMethod === 'BENEFIT_PAY' ? '#991b1b' : '#1e293b',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            transition: 'background-color 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: selectedMethod === 'BENEFIT_PAY' ? '#dc2626' : '#334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              }}
            >
              {selectedMethod === 'BENEFIT_PAY' && <Smartphone size={24} color="#ffffff" />}
              {selectedMethod === 'CASH' && <Banknote size={24} color="#34d399" />}
              {selectedMethod === 'CARD' && <CreditCard size={24} color="#60a5fa" />}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#ffffff' }}>
                  {completedSale ? 'Payment Receipt' : 'Checkout & Payment'}
                </h2>
                {selectedMethod === 'BENEFIT_PAY' && (
                  <span
                    style={{
                      backgroundColor: '#ef4444',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: '800',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      letterSpacing: '0.5px',
                    }}
                  >
                    FAWRI+
                  </span>
                )}
              </div>
              <p style={{ fontSize: '12px', margin: '2px 0 0 0', color: '#e2e8f0', opacity: 0.85 }}>
                {completedSale
                  ? `Invoice ${completedSale.invoiceNo} successfully finalized`
                  : 'Select payment method and present details to customer'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#cbd5e1',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* MODAL BODY */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {completedSale ? (
            /* VIEW 1: SUCCESS CONFIRMATION & PRINT ACTION */
            <div>
              <div
                style={{
                  backgroundColor: '#064e3b',
                  border: '1px solid #059669',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <CheckCircle2 size={28} color="#34d399" />
                <div>
                  <div style={{ fontWeight: 'bold', color: '#6ee7b7', fontSize: '15px' }}>
                    Payment Finalized Successfully!
                  </div>
                  <div style={{ color: '#a7f3d0', fontSize: '12px' }}>
                    {completedSale.paymentMethod === 'BENEFIT_PAY'
                      ? 'Paid via BenefitPay (Fawri+). Transaction logged and verified.'
                      : 'Sale recorded. Drawer and inventory updated.'}
                  </div>
                </div>
              </div>

              {/* RECEIPT WIDTH TOGGLE & HEADER */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Thermal Receipt Preview</span>
                <div style={{ display: 'flex', gap: '4px', background: '#1e293b', padding: '3px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <button
                    type="button"
                    onClick={() => handleFormatSelect('58mm')}
                    style={{
                      padding: '3px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      background: receiptFormat === '58mm' ? '#0284c7' : 'transparent',
                      color: receiptFormat === '58mm' ? '#ffffff' : '#94a3b8',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    58mm Compact
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormatSelect('80mm')}
                    style={{
                      padding: '3px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      background: receiptFormat === '80mm' ? '#0284c7' : 'transparent',
                      color: receiptFormat === '80mm' ? '#ffffff' : '#94a3b8',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    80mm Desktop
                  </button>
                </div>
              </div>

              {/* SCREEN PREVIEW OF RECEIPT (Compact Authentic Supermarket Style) */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontFamily: "'Roboto Mono', Consolas, 'Courier New', monospace",
                  fontWeight: 600,
                  fontSize: receiptFormat === '80mm' ? '11px' : '9.5px',
                  lineHeight: 1.25,
                  border: '1px dashed #000000',
                  marginBottom: '14px',
                  maxHeight: '44vh',
                  overflowY: 'auto',
                  maxWidth: receiptFormat === '80mm' ? '340px' : '270px',
                  margin: '0 auto 14px auto',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}
              >
                <div style={{ textAlign: 'center', borderBottom: '1px dashed #000000', paddingBottom: '6px' }}>
                  <div style={{ fontWeight: '700', fontSize: receiptFormat === '80mm' ? '14px' : '12.5px' }}>ASKAR SUPERMARKET</div>
                  <div style={{ fontWeight: '700', fontSize: receiptFormat === '80mm' ? '13px' : '11.5px' }}>أسواق عسكر المركزية</div>
                  <div style={{ fontSize: '9px' }}>Simplified Tax Invoice</div>
                  <div style={{ fontSize: '9px' }}>VAT No: 200012345678901</div>
                  <div style={{ fontSize: '9px' }}>Tel: +973 1700 0000</div>
                </div>

                <div style={{ padding: '6px 0', borderBottom: '1px dashed #000000', fontSize: '9.5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Inv:</span>
                    <strong style={{ fontWeight: 700 }}>{completedSale.invoiceNo}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1px' }}>
                    <span>Date:</span>
                    <span>{new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1px' }}>
                    <span>Staff:</span>
                    <span>Register 01</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1px' }}>
                    <span>Mode:</span>
                    <span>{completedSale.paymentMethod}</span>
                  </div>
                  {completedSale.transactionRef && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1px' }}>
                      <span>Ref No:</span>
                      <strong style={{ fontWeight: 700 }}>{completedSale.transactionRef}</strong>
                    </div>
                  )}
                </div>

                {/* ITEM BREAKDOWN (Strict Alignment) */}
                <div style={{ padding: '5px 0', borderBottom: '1px dashed #000000' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '9.5px', marginBottom: '3px' }}>
                    <div style={{ width: '52%', textAlign: 'left' }}>Item</div>
                    <div style={{ width: '18%', textAlign: 'center' }}>Qty</div>
                    <div style={{ width: '30%', textAlign: 'right' }}>Amt(BD)</div>
                  </div>
                  {cart.map((item, idx) => {
                    const qty = item.qty || item.quantity || 1;
                    const unitPrice = item.price ?? item.sellingPrice ?? 0;
                    const lineTotal = unitPrice * qty;
                    const isVat10 = item.vatRate === 10 || (item.vatRate === undefined && item.taxRate !== 0);
                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', marginTop: '1.5px' }}>
                        <div style={{ width: '52%', textAlign: 'left', wordBreak: 'break-word' }}>
                          {item.name} {isVat10 ? '*' : ''}
                        </div>
                        <div style={{ width: '18%', textAlign: 'center' }}>{qty}</div>
                        <div style={{ width: '30%', textAlign: 'right', fontWeight: 700 }}>{lineTotal.toFixed(3)}</div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ padding: '6px 0', borderBottom: '1px dashed #000000', fontSize: '9.5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Subtotal:</span>
                    <span>BD {subtotal.toFixed(3)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1px' }}>
                    <span>VAT (10%):</span>
                    <span>BD {vat.toFixed(3)}</span>
                  </div>
                  <div style={{ borderTop: '1px dashed #000000', margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: receiptFormat === '80mm' ? '14px' : '12.5px' }}>
                    <span>TOTAL:</span>
                    <span>BD {totalAmount.toFixed(3)}</span>
                  </div>
                  <div style={{ borderTop: '1px dashed #000000', margin: '4px 0' }} />
                </div>

                {completedSale.paymentMethod === 'CASH' && (
                  <div style={{ padding: '4px 0', borderBottom: '1px dashed #000000', fontSize: '9.5px' }}>
                    <div style={{ textAlign: 'center', fontWeight: 700, marginBottom: '2px' }}>
                      *** PAID VIA CASH ***
                    </div>
                    {completedSale.cashTendered !== undefined && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Cash Tendered:</span>
                          <span>BD {Number(completedSale.cashTendered).toFixed(3)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1px' }}>
                          <span>Change:</span>
                          <span>BD {Number(completedSale.changeDue || 0).toFixed(3)}</span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {completedSale.paymentMethod === 'BENEFIT_PAY' && (
                  <div style={{ padding: '4px 0', borderBottom: '1px dashed #000000', textAlign: 'center', fontSize: '9.5px' }}>
                    <div style={{ fontWeight: 700 }}>*** PAID VIA BENEFITPAY ***</div>
                    <div style={{ marginTop: '1px' }}>Fawri+ Instant QR</div>
                  </div>
                )}

                {/* NBR ARTICLE 53 SIMPLIFIED TAX INVOICE QR CODE */}
                <div style={{ textAlign: 'center', marginTop: '8px', marginBottom: '6px' }}>
                  <div style={{ display: 'inline-block', padding: '2px', background: '#ffffff', border: '1px solid #000000' }}>
                    <QRCodeSVG
                      value={nbrPayload}
                      size={receiptFormat === '80mm' ? 82 : 68}
                      level="M"
                      includeMargin={false}
                      fgColor="#000000"
                      bgColor="#ffffff"
                    />
                  </div>
                  <div style={{ fontSize: '8px', fontWeight: 700, marginTop: '2px', letterSpacing: '0.3px' }}>
                    NBR SIMPLIFIED TAX INVOICE
                  </div>
                </div>

                {/* CODE 128 BARCODE SIMULATION */}
                <div style={{ textAlign: 'center', marginTop: '6px' }}>
                  <div style={{ letterSpacing: '2px', fontWeight: 700, fontSize: '11px', lineHeight: 1 }}>
                    |||| | ||||| |||| || |||||||
                  </div>
                  <div style={{ fontSize: '9px', marginTop: '2px', fontWeight: 700 }}>
                    {completedSale.invoiceNo}
                  </div>
                </div>

                <div style={{ textAlign: 'center', paddingTop: '6px', fontSize: '8.5px', color: '#000000' }}>
                  <div style={{ marginBottom: '1px' }}>* Item includes 10% VAT</div>
                  <div style={{ fontWeight: 700 }}>Thank You For Shopping!</div>
                  <div>Please retain invoice for returns.</div>
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handlePrintReceipt}
                  style={{
                    flex: 1,
                    backgroundColor: (!isNative && printerConfig.mode === 'SUNMI_NETWORK') ? '#059669' : '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '12px',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    boxShadow: (!isNative && printerConfig.mode === 'SUNMI_NETWORK')
                      ? '0 4px 12px rgba(5, 150, 105, 0.3)'
                      : '0 4px 12px rgba(2, 132, 199, 0.3)',
                  }}
                >
                  <Printer size={18} />
                  {!isNative && printerConfig.mode === 'SUNMI_NETWORK'
                    ? `Print on Sunmi (${printerConfig.targetTerminal || 'T1'})`
                    : 'Print Thermal Receipt'}
                </button>
                <button
                  onClick={onClose}
                  style={{
                    backgroundColor: '#334155',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '12px 20px',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  Done / Next Order
                </button>
              </div>
            </div>
          ) : (
            /* VIEW 2: METHOD SELECTION & DYNAMIC FAWRI+ BENEFITPAY QR */
            <div>
              {/* PAYMENT METHOD SELECTOR TABS */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '8px',
                  backgroundColor: '#1e293b',
                  padding: '6px',
                  borderRadius: '14px',
                  marginBottom: '20px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedMethod('BENEFIT_PAY')}
                  style={{
                    backgroundColor: selectedMethod === 'BENEFIT_PAY' ? '#dc2626' : 'transparent',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '10px 6px',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    boxShadow: selectedMethod === 'BENEFIT_PAY' ? '0 4px 12px rgba(220, 38, 38, 0.3)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Smartphone size={16} />
                  <span>BenefitPay</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedMethod('CASH')}
                  style={{
                    backgroundColor: selectedMethod === 'CASH' ? '#059669' : 'transparent',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '10px 6px',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    boxShadow: selectedMethod === 'CASH' ? '0 4px 12px rgba(5, 150, 105, 0.3)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Banknote size={16} />
                  <span>Cash</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedMethod('CARD')}
                  style={{
                    backgroundColor: selectedMethod === 'CARD' ? '#2563eb' : 'transparent',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '10px 6px',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    boxShadow: selectedMethod === 'CARD' ? '0 4px 12px rgba(37, 99, 235, 0.3)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <CreditCard size={16} />
                  <span>Card POS</span>
                </button>
              </div>

              {/* METHOD TAB A: BENEFITPAY (FAWRI+ DYNAMIC QR) */}
              {selectedMethod === 'BENEFIT_PAY' && (
                <div>
                  <div
                    style={{
                      backgroundColor: '#1e293b',
                      borderRadius: '16px',
                      padding: '20px',
                      border: '1px solid #334155',
                      textAlign: 'center',
                      position: 'relative',
                    }}
                  >
                    {/* BENEFITPAY OWNER ACCOUNT BANNER */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '11px',
                        color: '#94a3b8',
                        marginBottom: '14px',
                        padding: '10px 14px',
                        backgroundColor: '#0f172a',
                        borderRadius: '10px',
                        border: '1px solid #334155',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left' }}>
                        <span style={{ fontSize: '18px' }}>🇧🇭</span>
                        <div>
                          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                            {benefitConfig.accountType === 'MOBILE_FAWRI'
                              ? 'Owner Fawri+ Mobile:'
                              : 'Fawri+ Merchant ID:'}
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace' }}>
                            {benefitConfig.accountType === 'MOBILE_FAWRI'
                              ? (benefitConfig.mobileNumber || 'Not Set')
                              : (benefitConfig.merchantId || 'Not Set')}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowBenefitConfigModal(true)}
                        style={{
                          backgroundColor: '#1e293b',
                          border: '1px solid #475569',
                          color: '#38bdf8',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                        }}
                      >
                        <Settings size={12} />
                        <span>Settings</span>
                      </button>
                    </div>

                    {/* TOTAL TO PAY PROMINENT BANNER */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Scan & Pay via BenefitPay
                      </div>
                      <div
                        style={{
                          fontSize: '32px',
                          fontWeight: '800',
                          color: '#ef4444',
                          letterSpacing: '-0.5px',
                          margin: '4px 0',
                        }}
                      >
                        BD {totalAmount.toFixed(3)}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        امسح رمز الاستجابة السريعة للدفع عبر تطبيق بنفت بي
                      </div>
                    </div>

                    {/* QR FORMAT SELECTOR PILLS */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '12px' }}>
                      <button
                        type="button"
                        onClick={() => setQrFormat('BENEFIT_JSON')}
                        style={{
                          backgroundColor: qrFormat === 'BENEFIT_JSON' ? '#dc2626' : '#0f172a',
                          color: '#ffffff',
                          border: qrFormat === 'BENEFIT_JSON' ? '1px solid #ef4444' : '1px solid #334155',
                          borderRadius: '8px',
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>⚡ BenefitPay App (IBAN)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setQrFormat('RAW_IBAN')}
                        style={{
                          backgroundColor: qrFormat === 'RAW_IBAN' ? '#2563eb' : '#0f172a',
                          color: '#ffffff',
                          border: qrFormat === 'RAW_IBAN' ? '1px solid #3b82f6' : '1px solid #334155',
                          borderRadius: '8px',
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <span>Raw IBAN</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setQrFormat('EMV_MERCHANT')}
                        style={{
                          backgroundColor: qrFormat === 'EMV_MERCHANT' ? '#059669' : '#0f172a',
                          color: '#ffffff',
                          border: qrFormat === 'EMV_MERCHANT' ? '1px solid #10b981' : '1px solid #334155',
                          borderRadius: '8px',
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <span>EMVCo QRCPS</span>
                      </button>
                    </div>

                    {/* DYNAMIC QR CODE DISPLAY */}
                    <div
                      style={{
                        backgroundColor: '#ffffff',
                        display: 'inline-block',
                        padding: '14px',
                        borderRadius: '16px',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                        marginBottom: '10px',
                      }}
                    >
                      <QRCodeSVG
                        value={qrPayload}
                        size={256}
                        level="M"
                        includeMargin={true}
                        fgColor="#000000"
                        bgColor="#ffffff"
                      />
                    </div>

                    {/* OWNER BENEFICIARY DETAILS */}
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#f1f5f9' }}>
                        {benefitConfig.merchantName || 'layali sbi'}
                      </div>
                      {benefitConfig.accountType === 'MOBILE_FAWRI' ? (
                        benefitConfig.mobileNumber && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                            <span style={{ fontSize: '13px', color: '#34d399', fontWeight: 700, fontFamily: 'monospace' }}>
                              Fawri+ Mobile: {benefitConfig.mobileNumber}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(benefitConfig.mobileNumber || '');
                                setCopiedMobile(true);
                                setTimeout(() => setCopiedMobile(false), 2000);
                              }}
                              style={{ background: 'none', border: 'none', color: copiedMobile ? '#34d399' : '#94a3b8', cursor: 'pointer', padding: '2px' }}
                              title="Copy Mobile Number"
                            >
                              {copiedMobile ? <Check size={13} /> : <Copy size={13} />}
                            </button>
                          </div>
                        )
                      ) : (
                        <div style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 700, fontFamily: 'monospace', marginTop: '3px' }}>
                          Merchant ID: {benefitConfig.merchantId || '97300182'} • Terminal: {benefitConfig.branchId || 'POS-01'}
                        </div>
                      )}
                      {benefitConfig.iban && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                          <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                            IBAN: {benefitConfig.iban}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(benefitConfig.iban || '');
                              setCopiedIban(true);
                              setTimeout(() => setCopiedIban(false), 2000);
                            }}
                            style={{ background: 'none', border: 'none', color: copiedIban ? '#34d399' : '#94a3b8', cursor: 'pointer', padding: '2px' }}
                            title="Copy IBAN"
                          >
                            {copiedIban ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* TRANSACTION REFERENCE STRIP */}
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        backgroundColor: '#0f172a',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid #334155',
                        fontSize: '11px',
                        color: '#94a3b8',
                      }}
                    >
                      <span>Fawri+ Ref:</span>
                      <strong style={{ color: '#38bdf8' }}>{transactionRef}</strong>
                      <button
                        type="button"
                        onClick={handleCopyRef}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: copiedRef ? '#34d399' : '#94a3b8',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title="Copy Reference"
                      >
                        {copiedRef ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>

                    {/* STATUS & CASHIER ACTION PROMPT */}
                    {webhookAutoSettled ? (
                      <div
                        style={{
                          marginTop: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          fontSize: '13px',
                          fontWeight: 'bold',
                          color: '#34d399',
                        }}
                      >
                        <CheckCircle2 size={16} />
                        <span>⚡ BenefitPay Fawri+ Confirmed! Printing receipt...</span>
                      </div>
                    ) : (
                      <div
                        style={{
                          marginTop: '12px',
                          padding: '8px 12px',
                          backgroundColor: 'rgba(56, 189, 248, 0.08)',
                          border: '1px solid rgba(56, 189, 248, 0.2)',
                          borderRadius: '8px',
                          fontSize: '11px',
                          color: '#94a3b8',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ color: '#38bdf8', fontWeight: 700, marginBottom: '2px' }}>
                          📲 Customer scans with BenefitPay app & approves Fawri+ transfer
                        </div>
                        <div>
                          Once customer confirms on their phone, tap <strong style={{ color: '#f1f5f9' }}>Confirm BenefitPay</strong> below to print receipt.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* METHOD TAB B: CASH */}
              {selectedMethod === 'CASH' && (
                <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 text-center space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <Banknote size={28} />
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                        Total Amount Due
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => openCashDrawer({ reason: 'PAYMENT_MODAL_QUICK_POP' })}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-black transition active:scale-95 cursor-pointer shadow-xs"
                        title="Open Sunmi Cash Drawer [F9]"
                      >
                        <Coins size={14} className="text-amber-400" />
                        <span>Pop Drawer (F9)</span>
                      </button>
                      <div className="font-mono text-3xl font-black text-emerald-400">
                        BD {totalAmount.toFixed(3)}
                      </div>
                    </div>
                  </div>

                  {/* Fitts's Law Quick Tender Buttons */}
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 text-left">
                      Quick Denomination Tender
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCashTendered(totalAmount.toFixed(3));
                          setTenderedAmount(totalAmount);
                        }}
                        className={`h-14 rounded-xl font-mono font-black text-xs flex flex-col items-center justify-center active:scale-95 transition-all cursor-pointer border ${Math.abs(activeTendered - totalAmount) < 0.001 && cashTendered === totalAmount.toFixed(3)
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow-md ring-2 ring-emerald-400/40'
                          : 'bg-slate-700/80 hover:bg-slate-700 text-slate-200 border-slate-600'
                          }`}
                      >
                        <span className="text-[10px] font-sans font-bold text-emerald-200">EXACT</span>
                        <span>BD {totalAmount.toFixed(3)}</span>
                      </button>

                      {[0.5, 1, 5, 10, 20].map((val) => {
                        const isSelected = Math.abs(activeTendered - val) < 0.001 && cashTendered === val.toFixed(3);
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => {
                              setCashTendered(val.toFixed(3));
                              setTenderedAmount(val);
                            }}
                            className={`h-14 rounded-xl font-mono font-black text-xs flex flex-col items-center justify-center active:scale-95 transition-all cursor-pointer border ${isSelected
                              ? 'bg-emerald-600 text-white border-emerald-400 shadow-md ring-2 ring-emerald-400/40'
                              : 'bg-slate-700/80 hover:bg-slate-700 text-slate-200 border-slate-600'
                              }`}
                          >
                            <span className="text-[10px] font-sans font-bold text-slate-400">NOTE</span>
                            <span>BD {val.toFixed(3)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cash Tendered Input & Change Calculator */}
                  <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-700/80 space-y-3">
                    <label className="block text-slate-300 font-bold text-xs uppercase tracking-wider text-left">
                      Amount Customer Handed You:
                    </label>
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-black text-emerald-400 font-mono">BHD</span>
                      <input
                        type="number"
                        step="0.050"
                        className="w-full text-2xl font-mono font-black p-3 bg-slate-950 border-2 border-slate-700 rounded-xl text-white focus:border-emerald-500 focus:outline-hidden"
                        value={cashTendered}
                        onChange={(e) => {
                          setCashTendered(e.target.value);
                          const num = parseFloat(e.target.value);
                          if (!isNaN(num)) setTenderedAmount(num);
                        }}
                        placeholder={`e.g. ${totalAmount.toFixed(3)}`}
                      />
                      {cashTendered && (
                        <button
                          type="button"
                          onClick={() => {
                            setCashTendered('');
                            setTenderedAmount(totalAmount);
                          }}
                          className="px-3 py-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg text-xs font-bold"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {/* Change Due Display */}
                    <div className="mt-3 flex justify-between items-center p-4 bg-slate-950 rounded-xl border border-slate-800">
                      <span className="text-base text-slate-300 font-bold">Change to Return:</span>
                      <span className={`text-3xl font-mono font-extrabold ${changeDue > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                        BHD {changeDue.toFixed(3)}
                      </span>
                    </div>

                    {isShort && (
                      <p className="text-rose-400 font-bold text-xs mt-1 text-left flex items-center gap-1.5">
                        <span>⚠️ Customer is short BHD {(totalAmount - activeTendered).toFixed(3)}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* METHOD TAB C: CARD */}
              {selectedMethod === 'CARD' && (
                <div
                  style={{
                    backgroundColor: '#1e293b',
                    borderRadius: '16px',
                    padding: '24px',
                    border: '1px solid #334155',
                    textAlign: 'center',
                  }}
                >
                  <CreditCard size={48} color="#3b82f6" style={{ margin: '0 auto 12px' }} />
                  <div style={{ fontSize: '13px', color: '#94a3b8' }}>Card Terminal Charge:</div>
                  <div style={{ fontSize: '36px', fontWeight: '800', color: '#3b82f6', margin: '4px 0 16px' }} className="font-mono">
                    BD {totalAmount.toFixed(3)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
                    Tap, insert, or swipe debit/credit card on the external bank terminal.
                  </div>
                </div>
              )}

              {/* PRINT TOGGLE & NETWORK SUNMI SELECTOR BAR */}
              <div className="flex flex-col gap-2.5 p-3 bg-slate-800/80 rounded-xl border border-slate-700/80 mt-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Printer size={18} className={autoPrint ? 'text-emerald-400' : 'text-slate-400'} />
                    <span className="text-xs font-bold text-slate-200">
                      Auto-Print 58mm Thermal Receipt
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !autoPrint;
                      setAutoPrint(next);
                      localStorage.setItem('pos_auto_print_receipt', JSON.stringify(next));
                      onToggleAutoPrint?.(next);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${autoPrint
                        ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/30'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                  >
                    <span>{autoPrint ? 'PRINT: ON' : 'PRINT: OFF (Selective)'}</span>
                  </button>
                </div>

                {/* Network Sunmi Printer Controls (Visible on Laptop / Desktop Web POS) */}
                {!isNative && (
                  <div className="flex items-center justify-between pt-2 border-t border-slate-700/60">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${printerConfig.mode === 'SUNMI_NETWORK' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                      <span className="text-[11px] font-semibold text-slate-300">
                        Printer: <strong className={printerConfig.mode === 'SUNMI_NETWORK' ? 'text-emerald-300' : 'text-slate-400'}>
                          {printerConfig.mode === 'SUNMI_NETWORK' ? `Sunmi Handheld (${printerConfig.targetTerminal || 'T1'})` : 'This Laptop (Browser)'}
                        </strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={async () => {
                          setTestingSunmi(true);
                          try {
                            await testSunmiNetworkPrint(printerConfig.targetTerminal);
                          } finally {
                            setTestingSunmi(false);
                          }
                        }}
                        disabled={testingSunmi}
                        className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Send a quick test receipt to Sunmi printer"
                      >
                        {testingSunmi ? 'Testing...' : 'Test Sunmi'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const nextMode = printerConfig.mode === 'SUNMI_NETWORK' ? 'LOCAL_BROWSER' : 'SUNMI_NETWORK';
                          const updated = setNetworkPrinterConfig({ mode: nextMode });
                          setPrinterConfigState(updated);
                        }}
                        className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-700 hover:bg-slate-600 text-cyan-300 transition-colors cursor-pointer"
                      >
                        {printerConfig.mode === 'SUNMI_NETWORK' ? 'Use Laptop' : 'Use Sunmi'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* FOOTER ACTION BUTTONS */}
              <div className="flex items-center gap-3 mt-6">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-16 px-6 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-base rounded-xl active:scale-95 transition-transform border border-slate-700 cursor-pointer shadow-xs"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={processing || (selectedMethod === 'CASH' && isShort)}
                  onClick={handleConfirmPayment}
                  className={`h-16 flex-1 rounded-xl font-bold text-lg text-white flex items-center justify-center gap-2 active:scale-95 transition-transform cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${selectedMethod === 'BENEFIT_PAY'
                    ? 'bg-red-600 hover:bg-red-700'
                    : selectedMethod === 'CASH'
                      ? isShort
                        ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                >
                  {processing ? (
                    <>
                      <RefreshCw size={20} className="animate-spin" />
                      <span>Finalizing Sale...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={22} />
                      <span className="font-mono">
                        {selectedMethod === 'BENEFIT_PAY'
                          ? `Confirm BenefitPay (BD ${totalAmount.toFixed(3)})`
                          : selectedMethod === 'CASH'
                            ? changeDue > 0
                              ? `Complete Sale (Return BD ${changeDue.toFixed(3)} Change)`
                              : `Complete Exact Cash (BD ${totalAmount.toFixed(3)})`
                            : `Confirm Card Sale (BD ${totalAmount.toFixed(3)})`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* DEDICATED THERMAL RECEIPT CONTAINER FOR @media print (Exact Authentic Sunmi Hardware Format) */}
      <div
        id="pos-thermal-receipt"
        className={`print-receipt format-${receiptFormat}`}
        style={{
          fontFamily: "'Roboto Mono', Consolas, 'Courier New', monospace",
          fontWeight: 600,
          color: '#000000',
          width: receiptFormat === '80mm' ? '70mm' : '48mm',
          maxWidth: receiptFormat === '80mm' ? '70mm' : '48mm',
          margin: '0 auto',
          padding: '1.5mm 1mm',
          border: 'none',
          boxSizing: 'border-box',
          fontSize: receiptFormat === '80mm' ? '11px' : '9.5px',
          lineHeight: 1.25,
          letterSpacing: '-0.15px',
        }}
      >
        <pre
          style={{
            fontFamily: "'Roboto Mono', Consolas, 'Courier New', monospace",
            fontWeight: 600,
            fontSize: receiptFormat === '80mm' ? '11px' : '9.5px',
            lineHeight: 1.25,
            letterSpacing: '-0.15px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            margin: 0,
            padding: 0,
            border: 'none',
            color: '#000000'
          }}
        >
          {receiptText}
        </pre>

        {/* NBR ARTICLE 53 SIMPLIFIED TAX INVOICE QR CODE */}
        <div style={{ textAlign: 'center', marginTop: '6px', marginBottom: '4px' }}>
          <div style={{ display: 'inline-block', padding: '2px', background: '#ffffff' }}>
            <QRCodeSVG
              value={nbrPayload}
              size={receiptFormat === '80mm' ? 82 : 68}
              level="M"
              includeMargin={false}
              fgColor="#000000"
              bgColor="#ffffff"
            />
          </div>
          <div style={{ fontSize: '8px', fontWeight: 700, marginTop: '2px', letterSpacing: '0.3px' }}>
            NBR SIMPLIFIED TAX INVOICE QR
          </div>
        </div>

        {/* RETURN BARCODE SECTION */}
        <div style={{ textAlign: 'center', marginTop: '4px' }}>
          <div style={{ fontSize: '9px', fontWeight: 600, marginBottom: '2px' }}>
            --------------------------------<br />
            SCAN TO RETURN ITEMS
          </div>
          <div style={{ letterSpacing: '2px', fontWeight: 700, fontSize: '11px', lineHeight: 1 }}>
            |||| | ||||| |||| || |||||||
          </div>
          <div style={{ fontSize: '9px', marginTop: '2px', fontWeight: 700 }}>
            {completedSale?.invoiceNo || activeInvoiceNo || 'INV-005000'}
          </div>
          <div style={{ fontSize: '9px', fontWeight: 600, marginTop: '2px' }}>
            ================================
          </div>
        </div>
      </div>

      {/* BENEFITPAY OWNER ACCOUNT CONFIG MODAL */}
      <BenefitPayConfigModal
        isOpen={showBenefitConfigModal}
        onClose={() => setShowBenefitConfigModal(false)}
        apiBase={apiBase}
        onConfigSaved={(updated) => setBenefitConfig(updated)}
      />
    </div>
  );
}
