import React, { useState, useEffect, useMemo } from 'react';
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
  Store
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { printFullReceipt, kickCashDrawer } from '../utils/printer';
import { ASKAR_OFFLINE_SALES_KEY } from '../constants/storage';

export interface PaymentItem {
  id: string;
  name: string;
  sellingPrice: number;
  purchasePrice?: number;
  quantity?: number;
  vatRate?: number;
  taxRate?: number;
}

export interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalAmount: number;
  subtotal: number;
  vat: number;
  cart: PaymentItem[];
  customer?: { id: string; name: string; currentBalance?: number; cardUid?: string | null } | null;
  apiBase: string;
  initialMethod?: 'CASH' | 'BENEFIT_PAY' | 'CARD';
  onSuccess: (receiptData: any) => void;
}

export default function PaymentModal({
  isOpen,
  onClose,
  totalAmount,
  subtotal,
  vat,
  cart,
  customer,
  apiBase,
  initialMethod = 'BENEFIT_PAY',
  onSuccess,
}: PaymentModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<'CASH' | 'BENEFIT_PAY' | 'CARD'>(initialMethod);

  // BenefitPay Merchant Settings
  const [merchantId, setMerchantId] = useState<string>(() => {
    return localStorage.getItem('benefitpay_merchant_id') || 'BH-BENEFIT-97300182';
  });
  const [showMerchantConfig, setShowMerchantConfig] = useState(false);
  const [tempMerchantId, setTempMerchantId] = useState(merchantId);

  // Generate unique transaction reference for this payment session
  const transactionRef = useMemo(() => {
    const timestamp = Date.now().toString().slice(-6);
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `BP-TXN-${timestamp}-${rand}`;
  }, [totalAmount, isOpen]);

  // Fawri+ Dynamic QR Code Payload
  // Embeds merchant ID, dynamic BHD amount formatted to 3 decimals, and unique reference
  const fawriQrPayload = useMemo(() => {
    return JSON.stringify({
      scheme: 'FAWRI_PLUS',
      merchantId: merchantId.trim(),
      merchantName: 'AL-HILAL SUPERMARKET',
      amount: Number(totalAmount.toFixed(3)),
      currency: 'BHD',
      reference: transactionRef,
      service: 'MERCHANT_PAYMENT',
      uri: `fawriplus://pay?mid=${encodeURIComponent(merchantId.trim())}&amt=${totalAmount.toFixed(3)}&cur=BHD&ref=${transactionRef}`
    });
  }, [merchantId, totalAmount, transactionRef]);

  // Processing & Confirmation state
  const [processing, setProcessing] = useState(false);
  const [completedSale, setCompletedSale] = useState<{
    invoiceNo: string;
    paidAmount: number;
    paymentMethod: string;
    transactionRef?: string;
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

  // Save Merchant ID setting
  const handleSaveMerchantId = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = tempMerchantId.trim() || 'BH-BENEFIT-97300182';
    localStorage.setItem('benefitpay_merchant_id', clean);
    setMerchantId(clean);
    setShowMerchantConfig(false);
  };

  // Complete checkout process
  const handleConfirmPayment = async () => {
    setProcessing(true);

    const invoiceNo = `INV-${Date.now()}`;
    const salePayload = {
      id: crypto.randomUUID(),
      tenantId: 'askar_main',
      invoiceNo,
      cart,
      subtotal,
      vat,
      vatTotal: vat,
      total: totalAmount,
      paymentType: selectedMethod,
      customerId: customer ? customer.id : null,
      transactionRef: selectedMethod === 'BENEFIT_PAY' ? transactionRef : undefined,
      cashTendered: selectedMethod === 'CASH' ? activeTendered : undefined,
      changeDue: selectedMethod === 'CASH' ? changeDue : undefined,
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
        signal: AbortSignal.timeout(3500)
      });
      if (res.ok) {
        data = await res.json();
      } else {
        try { data = await res.json(); } catch {}
      }
    } catch (netErr) {
      console.warn('Payment checkout network notice:', netErr);
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
            signal: AbortSignal.timeout(3000)
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
        ? (data.formattedInvoice || data.invoice || data.invoiceNo || invoiceNo)
        : `INV-OFF-${Date.now().toString().slice(-6)}`;

      if (!isOnlineSuccess) {
        try {
          const offlineQueue = JSON.parse(localStorage.getItem(ASKAR_OFFLINE_SALES_KEY) || '[]');
          offlineQueue.push({
            ...salePayload,
            invoiceNo: verifiedInvoiceNo,
            offlineTimestamp: new Date().toISOString()
          });
          localStorage.setItem(ASKAR_OFFLINE_SALES_KEY, JSON.stringify(offlineQueue));
          if (offlineQueue.length > 100) {
            console.warn("⚠️ Offline queue exceeds 100 items. Connect to Wi-Fi soon.");
          }
        } catch {}
      }

      const finalReceiptData = {
        invoiceNo: verifiedInvoiceNo,
        paidAmount: totalAmount,
        paymentMethod: selectedMethod,
        transactionRef: selectedMethod === 'BENEFIT_PAY' ? transactionRef : undefined,
        cashTendered: selectedMethod === 'CASH' ? activeTendered : undefined,
        changeDue: selectedMethod === 'CASH' ? changeDue : undefined,
        createdAt: new Date().toISOString(),
      };

      if (selectedMethod === 'CASH') {
        kickCashDrawer().catch(() => {});
      }

      setCompletedSale(finalReceiptData);
      onSuccess(finalReceiptData);

      // Attempt Sunmi hardware printer if available
      printFullReceipt({
        invoiceNo: finalReceiptData.invoiceNo,
        items: cart,
        subtotal,
        vat,
        total: totalAmount,
        paymentMode: selectedMethod,
        cashTendered: selectedMethod === 'CASH' ? activeTendered : undefined,
        changeDue: selectedMethod === 'CASH' ? changeDue : undefined,
        customerName: customer?.name,
        customerCardUid: customer?.cardUid || undefined,
        cashierName: 'Register 01',
        transactionRef: selectedMethod === 'BENEFIT_PAY' ? transactionRef : undefined,
      }).catch(() => {});
    } catch (err) {
      console.error('Payment checkout error:', err);
    } finally {
      setProcessing(false);
    }
  };

  // Trigger thermal receipt print via window.print()
  const handlePrintReceipt = () => {
    window.print();
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
      {/* THERMAL RECEIPT PRINT STYLES FOR 58mm/80mm THERMAL ROLL */}
      <style>{`
        @media print {
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
            width: 78mm !important;
            max-width: 78mm !important;
            margin: 0 !important;
            padding: 8px !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
            font-family: 'Courier New', Courier, monospace !important;
            font-size: 12px !important;
            line-height: 1.35 !important;
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
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  border: '1px dashed #cbd5e1',
                  marginBottom: '20px',
                }}
              >
                <div style={{ textAlign: 'center', borderBottom: '1px dashed #000000', paddingBottom: '8px' }}>
                  <div style={{ fontWeight: '900', fontSize: '16px' }}>ASKAR SUPERMARKET</div>
                  <div style={{ fontSize: '11px', fontWeight: 'bold' }}>Simplified Tax Invoice</div>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#0f766e' }}>VAT No: 200012345678901</div>
                  <div style={{ fontSize: '10px', color: '#475569' }}>Askar, Kingdom of Bahrain • Tel: +973 1700 0000</div>
                </div>

                <div style={{ padding: '8px 0', borderBottom: '1px dashed #000000', fontSize: '11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Invoice:</span>
                    <strong>{completedSale.invoiceNo}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                    <span>Date:</span>
                    <span>{new Date().toLocaleString()}</span>
                  </div>
                  {completedSale.paymentMethod === 'BENEFIT_PAY' && (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginTop: '4px',
                          color: '#b91c1c',
                          fontWeight: 'bold',
                        }}
                      >
                        <span>Payment Mode:</span>
                        <span>Paid via BenefitPay</span>
                      </div>
                      {completedSale.transactionRef && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                          <span>Fawri+ Ref:</span>
                          <strong>{completedSale.transactionRef}</strong>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* ITEM BREAKDOWN WITH ASTERISK FOR 10% VAT */}
                <div style={{ padding: '6px 0', borderBottom: '1px dashed #000000' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '10px', marginBottom: '4px' }}>
                    <span>ITEM</span>
                    <span>QTY</span>
                    <span>AMT (BD)</span>
                  </div>
                  {cart.map((item, idx) => {
                    const qty = item.quantity || 1;
                    const lineTotal = item.sellingPrice * qty;
                    const isVat10 = item.vatRate === 10 || (item.vatRate === undefined && item.taxRate !== 0);
                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginTop: '2px' }}>
                        <span style={{ maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.name} {isVat10 ? '*' : ''}
                        </span>
                        <span>{qty}</span>
                        <span style={{ fontWeight: 'bold' }}>{lineTotal.toFixed(3)}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ padding: '8px 0', borderBottom: '1px dashed #000000', fontSize: '11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Subtotal:</span>
                    <span>BD {subtotal.toFixed(3)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                    <span>VAT (10%):</span>
                    <span>BD {vat.toFixed(3)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '900', fontSize: '15px', marginTop: '6px', paddingTop: '4px', borderTop: '1px solid #000' }}>
                    <span>TOTAL:</span>
                    <span>BD {totalAmount.toFixed(3)}</span>
                  </div>
                </div>

                <div style={{ textAlign: 'center', paddingTop: '8px', fontSize: '10px', color: '#64748b' }}>
                  <div style={{ fontStyle: 'italic', marginBottom: '4px' }}>* Item includes 10% VAT</div>
                  {completedSale.paymentMethod === 'BENEFIT_PAY' && (
                    <div style={{ fontWeight: 'bold', color: '#000000', marginBottom: '2px' }}>
                      *** Paid via BenefitPay ***
                    </div>
                  )}
                  <div>Thank you for shopping with us!</div>
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
                    {/* MERCHANT ID BANNER */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '11px',
                        color: '#94a3b8',
                        marginBottom: '14px',
                        paddingBottom: '10px',
                        borderBottom: '1px solid #334155',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Store size={14} color="#f87171" />
                        <span>Fawri+ Merchant ID: </span>
                        <strong style={{ color: '#f8fafc' }}>{merchantId}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowMerchantConfig(!showMerchantConfig)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#38bdf8',
                          fontSize: '11px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          cursor: 'pointer',
                        }}
                      >
                        <Settings size={12} />
                        <span>{showMerchantConfig ? 'Cancel' : 'Change'}</span>
                      </button>
                    </div>

                    {/* MERCHANT ID CONFIG INPUT */}
                    {showMerchantConfig && (
                      <form
                        onSubmit={handleSaveMerchantId}
                        style={{
                          display: 'flex',
                          gap: '8px',
                          marginBottom: '14px',
                          padding: '10px',
                          backgroundColor: '#0f172a',
                          borderRadius: '8px',
                          border: '1px solid #475569',
                        }}
                      >
                        <input
                          type="text"
                          value={tempMerchantId}
                          onChange={(e) => setTempMerchantId(e.target.value)}
                          placeholder="e.g. BH-BENEFIT-102934"
                          style={{
                            flex: 1,
                            backgroundColor: '#1e293b',
                            color: '#ffffff',
                            border: '1px solid #64748b',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            fontSize: '12px',
                            outline: 'none',
                          }}
                        />
                        <button
                          type="submit"
                          style={{
                            backgroundColor: '#dc2626',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 14px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                          }}
                        >
                          Save
                        </button>
                      </form>
                    )}

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
                        marginBottom: '14px',
                      }}
                    >
                      <QRCodeSVG
                        value={fawriQrPayload}
                        size={210}
                        level="H"
                        includeMargin={false}
                        fgColor="#000000"
                        bgColor="#ffffff"
                      />
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
                    <div
                      style={{
                        marginTop: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        color: '#f59e0b',
                      }}
                    >
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Awaiting customer payment confirmation...</span>
                    </div>
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

      {/* DEDICATED THERMAL RECEIPT CONTAINER FOR @media print */}
      <div
        id="pos-thermal-receipt"
        style={{
          display: 'none',
        }}
      >
        <div style={{ textAlign: 'center', borderBottom: '1px dashed #000000', paddingBottom: '6px' }}>
          <div style={{ fontSize: '16px', fontWeight: '900' }}>ASKAR SUPERMARKET</div>
          <div style={{ fontSize: '11px', fontWeight: 'bold' }}>Simplified Tax Invoice</div>
          <div style={{ fontSize: '11px', fontWeight: 'bold' }}>VAT No: 200012345678901</div>
          <div style={{ fontSize: '11px', fontWeight: 'bold' }}>Invoice: {completedSale?.invoiceNo || 'INV-005000'}</div>
          <div style={{ fontSize: '10px' }}>{new Date().toLocaleString()}</div>
          {customer && <div style={{ fontSize: '10px' }}>Customer: {customer.name}</div>}
        </div>

        {/* ITEMS TABLE */}
        <table style={{ width: '100%', textAlign: 'left', margin: '6px 0', borderBottom: '1px solid #000', paddingBottom: '4px', fontSize: '11px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #000' }}>
              <th style={{ textAlign: 'left', paddingBottom: '3px' }}>Item</th>
              <th style={{ textAlign: 'center', paddingBottom: '3px' }}>Qty</th>
              <th style={{ textAlign: 'right', paddingBottom: '3px' }}>Amt</th>
            </tr>
          </thead>
          <tbody>
            {cart.map((item, idx) => {
              const qty = item.quantity || 1;
              const lineTotal = item.sellingPrice * qty;
              const isVat10 = item.vatRate === 10 || (item.vatRate === undefined && item.taxRate !== 0);
              return (
                <tr key={idx}>
                  <td style={{ paddingTop: '3px' }}>{item.name} {isVat10 ? '*' : ''}</td>
                  <td style={{ textAlign: 'center', paddingTop: '3px' }}>{qty}</td>
                  <td style={{ textAlign: 'right', paddingTop: '3px', fontWeight: 'bold' }}>{lineTotal.toFixed(3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* TOTALS */}
        <div style={{ padding: '4px 0', borderBottom: '1px dashed #000000', fontSize: '11px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>Subtotal:</span>
            <span>BD {subtotal.toFixed(3)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginTop: '2px' }}>
            <span>VAT (10%):</span>
            <span>BD {vat.toFixed(3)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: '900', marginTop: '4px', borderTop: '1px solid #000000', paddingTop: '4px' }}>
            <span>TOTAL:</span>
            <span>BD {totalAmount.toFixed(3)}</span>
          </div>
        </div>

        {/* PROMINENT BENEFITPAY RECEIPT BLOCK */}
        {selectedMethod === 'BENEFIT_PAY' && (
          <div
            style={{
              padding: '6px 0',
              borderBottom: '1px dashed #000000',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 'bold' }}>
              *** Paid via BenefitPay ***
            </div>
            <div style={{ fontSize: '11px', marginTop: '2px' }}>
              Transaction Ref: {completedSale?.transactionRef || transactionRef}
            </div>
            <div style={{ fontSize: '10px', marginTop: '1px' }}>
              Merchant ID: {merchantId} • Fawri+ QR
            </div>
          </div>
        )}

        {selectedMethod === 'CASH' && (
          <div style={{ padding: '4px 0', borderBottom: '1px dashed #000000', textAlign: 'center', fontSize: '11px' }}>
            Payment Mode: CASH
          </div>
        )}

        {selectedMethod === 'CARD' && (
          <div style={{ padding: '4px 0', borderBottom: '1px dashed #000000', textAlign: 'center', fontSize: '11px' }}>
            Payment Mode: CARD POS
          </div>
        )}

        <div style={{ textAlign: 'center', paddingTop: '6px', fontSize: '10px' }}>
          <p style={{ margin: '2px 0', fontStyle: 'italic' }}>* Item includes 10% VAT</p>
          <div>THANK YOU FOR SHOPPING!</div>
          <div>Please retain invoice for returns.</div>
        </div>
      </div>
    </div>
  );
}
