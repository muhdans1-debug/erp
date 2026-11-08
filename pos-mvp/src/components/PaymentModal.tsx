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
  Settings 
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { printFullReceipt } from '../utils/printer';
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
  onSuccess?: (receiptData: any) => void;
  onComplete?: () => void;
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
  onSuccess,
  onComplete,
}: PaymentModalProps) {
  const totalAmount = propTotalAmount !== undefined ? propTotalAmount : (propTotal !== undefined ? propTotal : 0);
  const subtotal = propSubtotal;
  const vat = propVat;
  const [selectedMethod, setSelectedMethod] = useState<'CASH' | 'BENEFIT_PAY' | 'CARD'>(initialMethod);

  // BenefitPay Owner Account Configuration
  const [benefitConfig, setBenefitConfig] = useState<BenefitPayConfig>(getStoredBenefitPayConfig);
  const [showBenefitConfigModal, setShowBenefitConfigModal] = useState(false);

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
      }).catch(() => {});
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

  // Fawri+ Dynamic QR Code Payload (generated via benefitPay utility)
  const qrPayload = useMemo(() => {
    return generateBenefitPayPayload(totalAmount, activeInvoiceNo, benefitConfig);
  }, [totalAmount, activeInvoiceNo, benefitConfig]);

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
    const finalMethod = overrideMethod || selectedMethod;
    const finalRef = overrideRef || (finalMethod === 'BENEFIT_PAY' ? transactionRef : undefined);
    setProcessing(true);

    const salePayload = {
      id: crypto.randomUUID(),
      tenantId: 'askar_main',
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
      items: cart.map((item) => ({
        productId: item.id,
        quantity: item.quantity ?? 1,
        priceAtSale: item.sellingPrice,
        costAtSale: item.purchasePrice || 0,
      })),
    };

    let data: any = null;
    try {
      const res = await fetch(`${apiBase}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(salePayload),
        signal: AbortSignal.timeout(900)
      });
      if (res.ok) {
        data = await res.json();
      } else {
        try { data = await res.json(); } catch {}
      }
    } catch (netErr) {
      console.warn('Payment checkout network notice (initiating instant local zero-block fallback):', netErr);
    }

    // Try failover alternative server if primary failed or returned error
    if (!data || !data.success) {
      const altCandidates = ['http://192.168.8.7:3000', 'http://localhost:3000'].filter(u => !apiBase.startsWith(u));
      for (const altBase of altCandidates) {
        try {
          const altRes = await fetch(`${altBase}/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(salePayload),
            signal: AbortSignal.timeout(600)
          });
          if (altRes.ok) {
            const altData = await altRes.json();
            if (altData && altData.success) {
              data = altData;
              localStorage.setItem('master_server_url', altBase);
              break;
            }
          }
        } catch {}
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
          offlineTimestamp: new Date().toISOString()
        }).catch((err) => console.warn('Offline save error:', err));
      }

      const finalReceiptData = {
        invoiceNo: verifiedInvoiceNo,
        paidAmount: totalAmount,
        paymentMethod: finalMethod,
        transactionRef: finalRef,
        cashTendered: finalMethod === 'CASH' ? activeTendered : undefined,
        changeDue: finalMethod === 'CASH' ? changeDue : undefined,
        createdAt: new Date().toISOString(),
      };

      // Strict hardware rule: Only trigger RJ11 solenoid kick on CASH payment!
      // BenefitPay Fawri+ keeps drawer physically locked.
      if (finalMethod === 'CASH') {
        openCashDrawer(changeDue).catch(() => {});
      }

      setCompletedSale(finalReceiptData);
      onSuccess?.(finalReceiptData);
      onComplete?.();
      playThankYouVoice('SALE');

      // Print full NBR VAT receipt via printer utility / Web Worker
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
        cashierName: 'Register 01',
        transactionRef: finalRef,
      }).catch(() => {});
    } catch (err) {
      console.error('Payment checkout error:', err);
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmPayment = () => executePayment();

  // ⚡ BenefitPay Fawri+ Webhook WebSocket Listener
  // Listens on Fastify /ws bus for BENEFIT_PAY_SUCCESS callback from Bahrain FinTech Bay
  useEffect(() => {
    if (!isOpen || completedSale) return;

    let ws: WebSocket | null = null;
    let isSubscribed = true;

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
            const matchesInvoice = data.invoiceNo && data.invoiceNo === activeInvoiceNo;
            const matchesRef = data.referenceNumber && (data.referenceNumber === transactionRef || data.referenceNumber.includes(transactionRef));
            const matchesAmount = data.amount && Math.abs(Number(data.amount) - totalAmount) < 0.005;

            if (matchesInvoice || matchesRef || (matchesAmount && selectedMethod === 'BENEFIT_PAY')) {
              console.log('⚡ [BenefitPay Webhook] Instant Fawri+ payment received via Webhook! Auto-settling sale...');
              if (isSubscribed) {
                setWebhookAutoSettled(true);
                setSelectedMethod('BENEFIT_PAY');
                await executePayment('BENEFIT_PAY', data.referenceNumber || transactionRef);
              }
            }
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
      if (ws) {
        try { ws.close(); } catch {}
      }
    };
  }, [isOpen, completedSale, activeInvoiceNo, transactionRef, totalAmount, selectedMethod, apiBase]);

  // Trigger thermal receipt print via hardware printer on Sunmi or window.print() on browser
  const handlePrintReceipt = async () => {
    try {
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
      });
    } catch (e) {
      console.warn('Direct printer dispatch notice:', e);
    }

    if (typeof window !== 'undefined' && !(window as any).Capacitor?.isNativePlatform?.()) {
      window.print();
    }
  };

  return (
    <div
      className="select-none"
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
      {/* THERMAL RECEIPT PRINT STYLES FOR EXACT 58mm THERMAL ROLL - OPTION A+ ULTRA BOLD */}
      <style>{`
        @media print {
          @page {
            size: 58mm auto;
            margin: 0;
          }
          body * {
            visibility: hidden !important;
          }
          #pos-thermal-receipt, #pos-thermal-receipt * {
            visibility: visible !important;
          }
          #pos-thermal-receipt {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 58mm !important;
            max-width: 58mm !important;
            margin: 0 !important;
            padding: 4px 6px !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
            font-family: 'Roboto Mono', Consolas, 'Courier New', monospace !important;
            font-size: 12px !important;
            font-weight: 900 !important;
            -webkit-text-stroke: 0.7px #000000 !important;
            letter-spacing: -0.2px !important;
            line-height: 1.35 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
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

              {/* SCREEN PREVIEW OF RECEIPT */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  borderRadius: '12px',
                  padding: '16px',
                  fontFamily: "'Roboto Mono', Consolas, 'Courier New', monospace",
                  fontWeight: 600,
                  fontSize: '12px',
                  lineHeight: 1.4,
                  border: '1px dashed #000000',
                  marginBottom: '20px',
                }}
              >
                <div style={{ textAlign: 'center', borderBottom: '1px dashed #000000', paddingBottom: '8px' }}>
                  <div style={{ fontWeight: '700', fontSize: '16px' }}>ASKAR SUPERMARKET</div>
                  <div style={{ fontWeight: '700' }}>أسكار سوبر ماركت</div>
                  <div style={{ fontSize: '11px' }}>Simplified Tax Invoice</div>
                  <div style={{ fontSize: '11px' }}>VAT No: 200012345678901</div>
                  <div style={{ fontSize: '11px' }}>Tel: +973 1700 0000</div>
                </div>

                <div style={{ padding: '8px 0', borderBottom: '1px dashed #000000', fontSize: '11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Inv:</span>
                    <strong style={{ fontWeight: 700 }}>{completedSale.invoiceNo}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                    <span>Date:</span>
                    <span>{new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                    <span>Staff:</span>
                    <span>Register 01</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                    <span>Mode:</span>
                    <span>{completedSale.paymentMethod}</span>
                  </div>
                  {completedSale.transactionRef && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                      <span>Ref No:</span>
                      <strong style={{ fontWeight: 700 }}>{completedSale.transactionRef}</strong>
                    </div>
                  )}
                </div>

                {/* ITEM BREAKDOWN (Strict Alignment) */}
                <div style={{ padding: '6px 0', borderBottom: '1px dashed #000000' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '11px', marginBottom: '4px' }}>
                    <div style={{ width: '50%', textAlign: 'left' }}>Item</div>
                    <div style={{ width: '20%', textAlign: 'center' }}>Qty</div>
                    <div style={{ width: '30%', textAlign: 'right' }}>Amt(BD)</div>
                  </div>
                  {cart.map((item, idx) => {
                    const qty = item.qty || item.quantity || 1;
                    const unitPrice = item.price ?? item.sellingPrice ?? 0;
                    const lineTotal = unitPrice * qty;
                    const isVat10 = item.vatRate === 10 || (item.vatRate === undefined && item.taxRate !== 0);
                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginTop: '2px' }}>
                        <div style={{ width: '50%', textAlign: 'left', wordBreak: 'break-word' }}>
                          {item.name} {isVat10 ? '*' : ''}
                        </div>
                        <div style={{ width: '20%', textAlign: 'center' }}>{qty}</div>
                        <div style={{ width: '30%', textAlign: 'right', fontWeight: 700 }}>{lineTotal.toFixed(3)}</div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ padding: '8px 0', borderBottom: '1px dashed #000000', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Subtotal:</span>
                    <span>BD {subtotal.toFixed(3)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                    <span>VAT (10%):</span>
                    <span>BD {vat.toFixed(3)}</span>
                  </div>
                  <div style={{ borderTop: '1px dashed #000000', margin: '6px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '16px' }}>
                    <span>TOTAL:</span>
                    <span>BD {totalAmount.toFixed(3)}</span>
                  </div>
                  <div style={{ borderTop: '1px dashed #000000', margin: '6px 0' }} />
                </div>

                {completedSale.paymentMethod === 'CASH' && (
                  <div style={{ padding: '6px 0', borderBottom: '1px dashed #000000', fontSize: '11px' }}>
                    <div style={{ textAlign: 'center', fontWeight: 700, marginBottom: '4px' }}>
                      *** PAID VIA CASH ***
                    </div>
                    {completedSale.cashTendered !== undefined && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Cash Tendered:</span>
                          <span>BD {Number(completedSale.cashTendered).toFixed(3)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                          <span>Change:</span>
                          <span>BD {Number(completedSale.changeDue || 0).toFixed(3)}</span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {completedSale.paymentMethod === 'BENEFIT_PAY' && (
                  <div style={{ padding: '6px 0', borderBottom: '1px dashed #000000', textAlign: 'center', fontSize: '11px' }}>
                    <div style={{ fontWeight: 700 }}>*** PAID VIA BENEFITPAY ***</div>
                    <div style={{ marginTop: '2px' }}>Fawri+ Instant QR</div>
                  </div>
                )}

                {/* NBR ARTICLE 53 SIMPLIFIED TAX INVOICE QR CODE */}
                <div style={{ textAlign: 'center', marginTop: '10px', marginBottom: '8px' }}>
                  <div style={{ display: 'inline-block', padding: '3px', background: '#ffffff', border: '1px solid #000000' }}>
                    <QRCodeSVG
                      value={nbrPayload}
                      size={96}
                      level="M"
                      includeMargin={false}
                      fgColor="#000000"
                      bgColor="#ffffff"
                    />
                  </div>
                  <div style={{ fontSize: '9px', fontWeight: 700, marginTop: '2px', letterSpacing: '0.5px' }}>
                    NBR SIMPLIFIED TAX INVOICE
                  </div>
                </div>

                {/* CODE 128 BARCODE SIMULATION */}
                <div style={{ textAlign: 'center', marginTop: '8px' }}>
                  <div style={{ letterSpacing: '2px', fontWeight: 700, fontSize: '12px', lineHeight: 1 }}>
                    |||| | ||||| |||| || |||||||
                  </div>
                  <div style={{ fontSize: '10px', marginTop: '3px', fontWeight: 700 }}>
                    {completedSale.invoiceNo}
                  </div>
                </div>

                <div style={{ textAlign: 'center', paddingTop: '8px', fontSize: '10px', color: '#000000' }}>
                  <div style={{ marginBottom: '2px' }}>* Item includes 10% VAT</div>
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
                    backgroundColor: '#0284c7',
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
                    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
                  }}
                >
                  <Printer size={18} />
                  Print Thermal Receipt
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
                        {benefitConfig.merchantName || 'ASKAR SUPERMARKET'}
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

                    {/* STATUS PULSE */}
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
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          fontSize: '12px',
                          color: '#38bdf8',
                        }}
                      >
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Fawri+ Webhook Active &bull; Waiting for customer scan...</span>
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
                    <div className="font-mono text-3xl font-black text-emerald-400">
                      BD {totalAmount.toFixed(3)}
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
                        className={`h-14 rounded-xl font-mono font-black text-xs flex flex-col items-center justify-center active:scale-95 transition-all cursor-pointer border ${
                          Math.abs(activeTendered - totalAmount) < 0.001 && cashTendered === totalAmount.toFixed(3)
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
                            className={`h-14 rounded-xl font-mono font-black text-xs flex flex-col items-center justify-center active:scale-95 transition-all cursor-pointer border ${
                              isSelected
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
                  className={`h-16 flex-1 rounded-xl font-bold text-lg text-white flex items-center justify-center gap-2 active:scale-95 transition-transform cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                    selectedMethod === 'BENEFIT_PAY'
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

      {/* DEDICATED THERMAL RECEIPT CONTAINER FOR @media print (Option A+ Ultra Heavy Monospaced Style) */}
      <div
        id="pos-thermal-receipt"
        className="print-receipt"
        style={{
          display: 'none',
          fontFamily: "'Roboto Mono', Consolas, 'Courier New', monospace",
          fontWeight: 900,
          WebkitTextStroke: '0.7px #000000',
          color: '#000000',
          width: '58mm',
          margin: '0 auto',
          fontSize: '12px',
          lineHeight: 1.35,
          letterSpacing: '-0.2px',
        }}
      >
        {/* HEADER */}
        <div style={{ textAlign: 'center', fontWeight: 900, fontSize: '15px', WebkitTextStroke: '0.9px #000000' }}>ASKAR SUPERMARKET</div>
        <div style={{ textAlign: 'center', fontWeight: 900, fontSize: '14px', WebkitTextStroke: '0.9px #000000' }}>أسواق عسكر المركزية</div>
        <div style={{ textAlign: 'center', fontWeight: 900 }}>Simplified Tax Invoice</div>
        <div style={{ textAlign: 'center', fontWeight: 900 }}>فاتورة ضريبية مبسطة</div>
        <div style={{ textAlign: 'center', fontWeight: 900 }}>VAT No: 200012345678901</div>
        <div style={{ textAlign: 'center' }}>Tel: +973 1700 0000</div>
        
        <div style={{ borderTop: '2.5px dashed #000000', margin: '8px 0' }} />

        {/* META INFO (Strict Alignment) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}><span>Inv:</span> <span>{completedSale?.invoiceNo || 'INV-005000'}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}><span>Date:</span> <span>{new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}><span>Staff:</span> <span>Register 01</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}><span>Mode:</span> <span>{selectedMethod}</span></div>
        {customer && <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}><span>Customer:</span> <span>{customer.name}</span></div>}

        <div style={{ borderTop: '2.5px dashed #000000', margin: '8px 0' }} />

        {/* ITEMS HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '12.5px' }}>
          <div style={{ width: '50%', textAlign: 'left' }}>Item</div>
          <div style={{ width: '20%', textAlign: 'center' }}>Qty</div>
          <div style={{ width: '30%', textAlign: 'right' }}>Amt(BD)</div>
        </div>
        
        <div style={{ borderTop: '2.5px solid #000000', margin: '8px 0' }} />

        {/* ITEMS LIST */}
        {cart.map((item, idx) => {
          const qty = item.qty || item.quantity || 1;
          const unitPrice = item.price ?? item.sellingPrice ?? 0;
          const lineTotal = unitPrice * qty;
          const isVat10 = item.vatRate === 10 || (item.vatRate === undefined && item.taxRate !== 0);
          return (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontWeight: 900 }}>
              <div style={{ width: '50%', textAlign: 'left', wordBreak: 'break-word' }}>
                {item.name} {isVat10 ? '*' : ''}
              </div>
              <div style={{ width: '20%', textAlign: 'center' }}>{qty}</div>
              <div style={{ width: '30%', textAlign: 'right', fontWeight: 900 }}>{lineTotal.toFixed(3)}</div>
            </div>
          );
        })}

        <div style={{ borderTop: '2.5px solid #000000', margin: '8px 0' }} />

        {/* TOTALS */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}><span>Subtotal:</span> <span>BD {subtotal.toFixed(3)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}><span>VAT (10%):</span> <span>BD {vat.toFixed(3)}</span></div>
        
        {/* Highlighted Total */}
        <div style={{ borderTop: '2.5px solid #000000', margin: '8px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '17px', WebkitTextStroke: '0.95px #000000' }}>
          <span>TOTAL:</span> 
          <span>BD {totalAmount.toFixed(3)}</span>
        </div>
        <div style={{ borderTop: '2.5px solid #000000', margin: '8px 0' }} />

        {selectedMethod === 'CASH' && (
          <div style={{ textAlign: 'center', marginTop: '8px', fontWeight: 900 }}>
            <div style={{ fontWeight: 900 }}>*** PAID VIA CASH ***</div>
            {tenderedAmount !== undefined && Number(tenderedAmount) > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontWeight: 900 }}>
                  <span>Cash Tendered:</span> <span>BD {Number(tenderedAmount).toFixed(3)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}>
                  <span>Change:</span> <span>BD {Number(changeDue || 0).toFixed(3)}</span>
                </div>
              </>
            )}
          </div>
        )}

        {selectedMethod === 'BENEFIT_PAY' && (
          <div style={{ textAlign: 'center', marginTop: '8px', fontWeight: 900 }}>
            <div style={{ fontWeight: 900 }}>*** PAID VIA BENEFITPAY ***</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontWeight: 900 }}>
              <span>Method:</span> <span>Fawri+ QR</span>
            </div>
            {(completedSale?.transactionRef || transactionRef) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}>
                <span>Ref No:</span> <span>{completedSale?.transactionRef || transactionRef}</span>
              </div>
            )}
          </div>
        )}

        {selectedMethod === 'CARD' && (
          <div style={{ textAlign: 'center', marginTop: '8px', fontWeight: 900 }}>
            <div style={{ fontWeight: 900 }}>*** PAID VIA CARD ***</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontWeight: 900 }}>
              <span>Terminal:</span> <span>POS Contactless EMV</span>
            </div>
          </div>
        )}

        {/* NBR ARTICLE 53 SIMPLIFIED TAX INVOICE QR CODE */}
        <div style={{ textAlign: 'center', marginTop: '10px', marginBottom: '8px' }}>
          <div style={{ display: 'inline-block', padding: '3px', background: '#ffffff', border: '2px solid #000000' }}>
            <QRCodeSVG
              value={nbrPayload}
              size={96}
              level="M"
              includeMargin={false}
              fgColor="#000000"
              bgColor="#ffffff"
            />
          </div>
          <div style={{ fontSize: '9px', fontWeight: 900, marginTop: '2px', letterSpacing: '0.5px' }}>
            NBR SIMPLIFIED TAX INVOICE
          </div>
        </div>

        {/* FOOTER & BARCODE */}
        <div style={{ textAlign: 'center', marginTop: '15px', fontWeight: 900 }}>
          <div style={{ letterSpacing: '2px', fontWeight: 900, fontSize: '13px', lineHeight: 1 }}>
            |||| | ||||| |||| || |||||||
          </div>
          <div style={{ fontSize: '10px', marginTop: '4px', fontWeight: 900 }}>
            {completedSale?.invoiceNo || 'INV-005000'}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '10px', fontWeight: 900 }}>
          * Item includes 10% VAT<br />
          Thank You For Shopping!<br />
          Please retain invoice for returns.
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
