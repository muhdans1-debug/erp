import React, { useState } from 'react';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { 
  X, 
  Search, 
  RotateCcw, 
  AlertTriangle, 
  CheckCircle2, 
  Printer, 
  Wallet,
  Users
} from 'lucide-react';

interface SaleItem {
  id: string;
  productId: string;
  productName: string;
  barcode?: string;
  quantity: number;
  priceAtSale?: number;
  unitPrice?: number;
  subtotal?: number;
  unitCost?: number;
}

interface SaleData {
  id: string;
  invoiceNo: string;
  total: number;
  subtotal?: number;
  paymentType?: string;
  customerId?: string | null;
  customer?: { id: string; name: string; currentBalance?: number } | null;
  createdAt: string;
  items: SaleItem[];
  priorRefunds?: any[];
}

interface SelectedItemState {
  selected: boolean;
  quantity: number;
  reason: string;
  isDamaged: boolean;
}

interface RefundModalProps {
  onClose: () => void;
  apiBase?: string;
  onSuccess?: (refundData: any) => void;
}

export default function RefundModal({ onClose, apiBase: propApiBase, onSuccess }: RefundModalProps) {
  const apiBase =
    propApiBase ||
    (typeof window !== 'undefined'
      ? localStorage.getItem('master_server_url') || 'http://localhost:3000'
      : 'http://localhost:3000');

  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sale, setSale] = useState<SaleData | null>(null);

  // Return configuration
  const [itemStates, setItemStates] = useState<{ [saleItemId: string]: SelectedItemState }>({});
  const [globalReason, setGlobalReason] = useState<string>('MISTAKE');
  const [destination, setDestination] = useState<'CASH' | 'KHATA_CREDIT'>('CASH');
  const [cashierName, setCashierName] = useState('Cashier 01');

  // Submission & Result state
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedRefund, setCompletedRefund] = useState<{
    refund: any;
    creditNoteNo: string;
    items: any[];
    sale: any;
  } | null>(null);

  // Fetch invoice from server
  const searchInvoice = async (cleanQuery: string) => {
    const clean = cleanQuery.trim();
    if (!clean) {
      setSearchError('Please enter an invoice number or barcode ID.');
      return;
    }

    setSearching(true);
    setSearchError(null);
    setSale(null);
    setItemStates({});
    setCompletedRefund(null);

    try {
      const res = await fetch(`${apiBase}/api/sales/invoice/${encodeURIComponent(clean)}`);
      const data = await res.json();

      if (res.ok && data.success && data.sale) {
        setSale(data.sale);
        // Default destination: if sale was on credit and customer exists, default to Khata credit
        if (data.sale.paymentType === 'CREDIT' && data.sale.customerId) {
          setDestination('KHATA_CREDIT');
        } else {
          setDestination('CASH');
        }

        // Calculate already refunded quantities per item if prior refunds exist
        const priorRefundedQtys: { [key: string]: number } = {};
        if (Array.isArray(data.sale.priorRefunds)) {
          for (const pr of data.sale.priorRefunds) {
            try {
              const pItems = typeof pr.itemsJson === 'string' ? JSON.parse(pr.itemsJson) : pr.itemsJson;
              if (Array.isArray(pItems)) {
                for (const pi of pItems) {
                  const key = pi.saleItemId || pi.productId;
                  priorRefundedQtys[key] = (priorRefundedQtys[key] || 0) + (pi.quantity || 0);
                }
              }
            } catch {
              // ignore parse errors
            }
          }
        }

        // Initialize item selection states
        const initialStates: { [saleItemId: string]: SelectedItemState } = {};
        for (const itm of data.sale.items || []) {
          const priorRefunded = priorRefundedQtys[itm.id] || priorRefundedQtys[itm.productId] || 0;
          const maxAvailable = Math.max(0, itm.quantity - priorRefunded);
          initialStates[itm.id] = {
            selected: maxAvailable > 0, // default selected if quantity remaining
            quantity: maxAvailable > 0 ? maxAvailable : 1,
            reason: 'MISTAKE',
            isDamaged: false,
          };
        }
        setItemStates(initialStates);
      } else {
        setSearchError(data.error || `Invoice #${clean} was not found.`);
      }
    } catch (err: any) {
      setSearchError('Network error: Could not reach back-office server.');
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await searchInvoice(invoiceQuery);
  };

  // Hardware Laser Scanner listener inside RefundModal
  useBarcodeScanner((scannedCode: string) => {
    const clean = scannedCode.trim();
    if (clean) {
      setInvoiceQuery(clean);
      searchInvoice(clean);
    }
  });

  // Toggle selection
  const toggleItemSelect = (itemId: string) => {
    setItemStates((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        selected: !prev[itemId]?.selected,
      },
    }));
  };

  // Update item quantity
  const updateItemQty = (itemId: string, newQty: number, maxQty: number) => {
    const clamped = Math.max(1, Math.min(newQty, maxQty));
    setItemStates((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        quantity: clamped,
      },
    }));
  };

  // Update item reason & damage toggle
  const updateItemReason = (itemId: string, reason: string) => {
    const isDamaged = reason === 'DAMAGED' || reason === 'EXPIRED';
    setItemStates((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        reason,
        isDamaged,
      },
    }));
  };

  const toggleItemDamaged = (itemId: string) => {
    setItemStates((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        isDamaged: !prev[itemId]?.isDamaged,
      },
    }));
  };

  // Calculate Refund Totals
  const selectedItemsToRefund = (sale?.items || []).filter((itm) => itemStates[itm.id]?.selected);

  const totalRefundAmount = selectedItemsToRefund.reduce((sum, itm) => {
    const state = itemStates[itm.id];
    const unitPrice = Number(itm.priceAtSale ?? itm.unitPrice ?? 0);
    const qty = state ? state.quantity : 1;
    return sum + unitPrice * qty;
  }, 0);

  // Submit Refund to Backend
  const handleProcessRefund = async () => {
    if (!sale) return;
    if (selectedItemsToRefund.length === 0) {
      setErrorMessage('Please select at least one item to return.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    const refundItemsPayload = selectedItemsToRefund.map((itm) => {
      const state = itemStates[itm.id];
      const unitPrice = Number(itm.priceAtSale ?? itm.unitPrice ?? 0);
      return {
        saleItemId: itm.id,
        productId: itm.productId,
        productName: itm.productName,
        quantity: state.quantity,
        unitPrice,
        isDamaged: state.isDamaged || state.reason === 'DAMAGED' || state.reason === 'EXPIRED',
        reason: state.reason || globalReason,
      };
    });

    try {
      const res = await fetch(`${apiBase}/api/sales/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceNo: sale.invoiceNo,
          reason: globalReason,
          destination,
          processedBy: cashierName,
          items: refundItemsPayload,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setCompletedRefund({
          refund: data.refund,
          creditNoteNo: data.creditNoteNo,
          items: data.items,
          sale,
        });
        if (onSuccess) onSuccess(data);
      } else {
        setErrorMessage(data.error || 'Failed to process refund. Please try again.');
      }
    } catch (err: any) {
      setErrorMessage('Network error: Could not process return with back-office.');
    } finally {
      setSubmitting(false);
    }
  };

  // Print function using window.print()
  const handlePrintCreditNote = () => {
    window.print();
  };

  return (
    <div
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
      {/* EMBEDDED PRINT CSS FOR CREDIT NOTE */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #credit-note-print-area, #credit-note-print-area * {
            visibility: visible !important;
          }
          #credit-note-print-area {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 78mm !important;
            margin: 0 !important;
            padding: 8px !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
            font-family: 'Courier New', Courier, monospace !important;
            font-size: 12px !important;
            line-height: 1.3 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div
        className="no-print"
        style={{
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          borderRadius: '16px',
          width: '100%',
          maxWidth: completedRefund ? '560px' : '820px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          overflow: 'hidden',
          transition: 'all 0.25s ease',
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#1e293b',
            borderBottom: '1px solid #334155',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(220, 38, 38, 0.4)',
              }}
            >
              <RotateCcw size={20} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 'bold', margin: 0, color: '#f8fafc' }}>
                {completedRefund ? 'Credit Note Receipt' : 'Return & Refund Engine'}
              </h2>
              <p style={{ fontSize: '11px', margin: 0, color: '#94a3b8' }}>
                {completedRefund
                  ? `Generated for Invoice #${completedRefund.sale.invoiceNo}`
                  : 'Automated Stock Restocking, Wastage Routing & Till Reconciliation'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* MODAL BODY */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {/* VIEW A: COMPLETED REFUND / PRINT PREVIEW */}
          {completedRefund ? (
            <div>
              <div
                style={{
                  backgroundColor: '#064e3b',
                  border: '1px solid #059669',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <CheckCircle2 size={24} color="#34d399" />
                <div>
                  <div style={{ fontWeight: 'bold', color: '#6ee7b7', fontSize: '14px' }}>
                    Refund Processed Successfully!
                  </div>
                  <div style={{ color: '#a7f3d0', fontSize: '12px' }}>
                    Credit Note <strong style={{ color: '#ffffff' }}>{completedRefund.creditNoteNo}</strong> has been
                    generated. Financials and stock records were updated atomically.
                  </div>
                </div>
              </div>

              {/* THERMAL CREDIT NOTE SLIP PREVIEW */}
              <div
                id="credit-note-print-area"
                style={{
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  borderRadius: '10px',
                  padding: '20px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
                  margin: '0 auto',
                  maxWidth: '380px',
                  border: '1px dashed #cbd5e1',
                }}
              >
                {/* RECEIPT HEADER */}
                <div style={{ textAlign: 'center', borderBottom: '1px dashed #000000', paddingBottom: '10px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                    AL-HILAL SUPERMARKET
                  </div>
                  <div style={{ fontSize: '10px', color: '#475569' }}>Askar, Kingdom of Bahrain • Tel: +973 1700 0000</div>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 'bold',
                      marginTop: '8px',
                      padding: '3px 8px',
                      background: '#f1f5f9',
                      display: 'inline-block',
                      border: '1px solid #000',
                    }}
                  >
                    CREDIT NOTE / إشعار دائن
                  </div>
                </div>

                {/* RECEIPT METADATA */}
                <div style={{ padding: '10px 0', borderBottom: '1px dashed #000000', fontSize: '11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Credit Note #:</span>
                    <strong>{completedRefund.creditNoteNo}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
                    <span>Original Invoice:</span>
                    <strong>#{completedRefund.sale.invoiceNo}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
                    <span>Date & Time:</span>
                    <span>{new Date().toLocaleString('en-GB')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
                    <span>Cashier:</span>
                    <span>{cashierName}</span>
                  </div>
                  {completedRefund.sale.customer && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
                      <span>Customer:</span>
                      <strong>{completedRefund.sale.customer.name}</strong>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
                    <span>Refund Type:</span>
                    <strong>
                      {completedRefund.refund.destination === 'KHATA_CREDIT' ? 'Khata Account Credit' : 'Cash Payout'}
                    </strong>
                  </div>
                </div>

                {/* RETURNED ITEMS LIST */}
                <div style={{ padding: '10px 0', borderBottom: '1px dashed #000000' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr',
                      fontWeight: 'bold',
                      fontSize: '11px',
                      marginBottom: '6px',
                    }}
                  >
                    <span>ITEM</span>
                    <span style={{ textAlign: 'center' }}>QTY</span>
                    <span style={{ textAlign: 'right' }}>PRICE</span>
                    <span style={{ textAlign: 'right' }}>TOTAL</span>
                  </div>
                  {completedRefund.items.map((item, idx) => (
                    <div key={idx} style={{ marginBottom: '6px', fontSize: '11px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.productName}
                        </span>
                        <span style={{ textAlign: 'center' }}>{item.quantity}</span>
                        <span style={{ textAlign: 'right' }}>BD {Number(item.unitPrice).toFixed(3)}</span>
                        <span style={{ textAlign: 'right', fontWeight: 'bold' }}>
                          BD {Number(item.totalAmount).toFixed(3)}
                        </span>
                      </div>
                      <div style={{ fontSize: '9px', color: '#64748b', fontStyle: 'italic', paddingLeft: '4px' }}>
                        ↳ {item.isDamaged ? '⚠️ Sent to Wastage (Damaged)' : '✅ Restocked to Shelf'}
                      </div>
                    </div>
                  ))}
                </div>

                {/* TOTALS */}
                <div style={{ padding: '10px 0', borderBottom: '1px dashed #000000' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '15px',
                      fontWeight: 'bold',
                    }}
                  >
                    <span>REFUNDED TOTAL:</span>
                    <span>BD {Number(completedRefund.refund.refundedAmount).toFixed(3)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginTop: '4px' }}>
                    <span>Destination:</span>
                    <span>
                      {completedRefund.refund.destination === 'KHATA_CREDIT'
                        ? 'Customer Khata Balance Decreased'
                        : 'Deducted from Register Cash'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginTop: '2px' }}>
                    <span>Return Reason:</span>
                    <span>{completedRefund.refund.reason}</span>
                  </div>
                </div>

                {/* FOOTER */}
                <div style={{ textAlign: 'center', paddingTop: '10px', fontSize: '10px', color: '#64748b' }}>
                  <div>Retain this slip for your accounting records.</div>
                  <div style={{ marginTop: '2px' }}>*** THANK YOU ***</div>
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                <button
                  onClick={handlePrintCreditNote}
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
                  Print Credit Note (Thermal)
                </button>
                <button
                  onClick={() => {
                    setCompletedRefund(null);
                    setSale(null);
                    setInvoiceQuery('');
                  }}
                  style={{
                    backgroundColor: '#334155',
                    color: '#f8fafc',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '12px 18px',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  New Return
                </button>
                <button
                  onClick={onClose}
                  style={{
                    backgroundColor: '#1e293b',
                    color: '#94a3b8',
                    border: '1px solid #475569',
                    borderRadius: '10px',
                    padding: '12px 18px',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* VIEW B: SEARCH & ITEM SELECTION */
            <div>
              {/* SEARCH BAR */}
              <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search
                    size={18}
                    color="#94a3b8"
                    style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    type="text"
                    value={invoiceQuery}
                    onChange={(e) => setInvoiceQuery(e.target.value)}
                    placeholder="Scan or enter Invoice # (e.g. INV-1002 or receipt ID)..."
                    autoFocus
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      backgroundColor: '#1e293b',
                      color: '#f8fafc',
                      border: '1px solid #475569',
                      borderRadius: '10px',
                      padding: '11px 12px 11px 40px',
                      fontSize: '14px',
                      outline: 'none',
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching}
                  style={{
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '0 20px',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: searching ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {searching ? 'Searching...' : 'Find Invoice'}
                </button>
              </form>

              {/* SEARCH ERROR */}
              {searchError && (
                <div
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid #ef4444',
                    color: '#fca5a5',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '13px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertTriangle size={16} />
                  <span>{searchError}</span>
                </div>
              )}

              {/* INVOICE FOUND DETAILS */}
              {sale && (
                <div>
                  {/* INVOICE SUMMARY STRIP */}
                  <div
                    style={{
                      backgroundColor: '#1e293b',
                      borderRadius: '12px',
                      padding: '14px 16px',
                      marginBottom: '18px',
                      border: '1px solid #334155',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>Invoice Number</div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#38bdf8' }}>
                        #{sale.invoiceNo}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>Sale Date & Time</div>
                      <div style={{ fontSize: '13px', color: '#f8fafc' }}>
                        {new Date(sale.createdAt).toLocaleDateString()} {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>Original Total</div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#10b981' }}>
                        BD {Number(sale.total).toFixed(3)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>Payment Method</div>
                      <div style={{ fontSize: '13px', color: '#cbd5e1' }}>
                        {sale.paymentType || 'CASH'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>Customer</div>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: sale.customer ? '#a78bfa' : '#64748b' }}>
                        {sale.customer ? sale.customer.name : 'Walk-in'}
                      </div>
                    </div>
                  </div>

                  {/* PRIOR REFUNDS WARNING IF ANY */}
                  {Array.isArray(sale.priorRefunds) && sale.priorRefunds.length > 0 && (
                    <div
                      style={{
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid #f59e0b',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        marginBottom: '14px',
                        fontSize: '12px',
                        color: '#fcd34d',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <AlertTriangle size={16} />
                      <span>
                        Notice: This invoice has <strong>{sale.priorRefunds.length}</strong> previous return(s).
                        Quantities already refunded are clamped below.
                      </span>
                    </div>
                  )}

                  {/* RETURN ITEMS TABLE */}
                  <div style={{ marginBottom: '18px' }}>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '10px',
                        marginBottom: '10px',
                      }}
                    >
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#cbd5e1' }}>
                          Select Items to Return
                        </span>
                        <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: '8px' }}>
                          ({selectedItemsToRefund.length} of {sale.items.length} selected)
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>Return Reason:</span>
                          <select
                            value={globalReason}
                            onChange={(e) => {
                              const newR = e.target.value;
                              setGlobalReason(newR);
                              const isDam = newR === 'DAMAGED' || newR === 'EXPIRED';
                              setItemStates((prev) => {
                                const next = { ...prev };
                                Object.keys(next).forEach((k) => {
                                  next[k] = { ...next[k], reason: newR, isDamaged: isDam };
                                });
                                return next;
                              });
                            }}
                            style={{
                              backgroundColor: '#1e293b',
                              color: '#f8fafc',
                              border: '1px solid #475569',
                              borderRadius: '6px',
                              padding: '5px 8px',
                              fontSize: '12px',
                              outline: 'none',
                            }}
                          >
                            <option value="MISTAKE">Mistake (Restock to Shelf)</option>
                            <option value="DAMAGED">Damaged (Send to Wastage)</option>
                            <option value="DEFECTIVE">Defective (Send to Wastage)</option>
                            <option value="EXPIRED">Expired (Send to Wastage)</option>
                          </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>Cashier:</span>
                          <input
                            type="text"
                            value={cashierName}
                            onChange={(e) => setCashierName(e.target.value)}
                            style={{
                              backgroundColor: '#1e293b',
                              color: '#f8fafc',
                              border: '1px solid #475569',
                              borderRadius: '6px',
                              padding: '5px 8px',
                              fontSize: '12px',
                              width: '100px',
                              outline: 'none',
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: '10px',
                        border: '1px solid #334155',
                        overflow: 'hidden',
                        backgroundColor: '#1e293b',
                      }}
                    >
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                            <th style={{ padding: '10px 12px', width: '40px' }}>✓</th>
                            <th style={{ padding: '10px 12px' }}>Item Description</th>
                            <th style={{ padding: '10px 12px', textAlign: 'center', width: '110px' }}>Return Qty</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right', width: '90px' }}>Price</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right', width: '100px' }}>Refund Subtotal</th>
                            <th style={{ padding: '10px 12px', width: '160px' }}>Reason / Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sale.items.map((item) => {
                            const state = itemStates[item.id] || {
                              selected: false,
                              quantity: item.quantity,
                              reason: 'MISTAKE',
                              isDamaged: false,
                            };
                            const unitPrice = Number(item.priceAtSale ?? item.unitPrice ?? 0);
                            const lineSubtotal = unitPrice * state.quantity;

                            return (
                              <tr
                                key={item.id}
                                style={{
                                  borderBottom: '1px solid #334155',
                                  backgroundColor: state.selected ? 'rgba(56, 189, 248, 0.05)' : 'transparent',
                                  transition: 'background-color 0.15s ease',
                                }}
                              >
                                {/* CHECKBOX */}
                                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={state.selected}
                                    onChange={() => toggleItemSelect(item.id)}
                                    style={{
                                      width: '18px',
                                      height: '18px',
                                      accentColor: '#0284c7',
                                      cursor: 'pointer',
                                    }}
                                  />
                                </td>

                                {/* ITEM NAME & BARCODE */}
                                <td style={{ padding: '10px 12px' }}>
                                  <div style={{ fontWeight: '600', color: state.selected ? '#f8fafc' : '#94a3b8' }}>
                                    {item.productName}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                                    Barcode: {item.barcode || item.productId} • Sold: {item.quantity} pcs
                                  </div>
                                </td>

                                {/* RETURN QUANTITY STEPPER */}
                                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                  <div
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      backgroundColor: '#0f172a',
                                      borderRadius: '6px',
                                      border: '1px solid #475569',
                                    }}
                                  >
                                    <button
                                      type="button"
                                      disabled={!state.selected || state.quantity <= 1}
                                      onClick={() => updateItemQty(item.id, state.quantity - 1, item.quantity)}
                                      style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: '#cbd5e1',
                                        padding: '4px 8px',
                                        cursor: 'pointer',
                                        fontWeight: 'bold',
                                      }}
                                    >
                                      -
                                    </button>
                                    <span
                                      style={{
                                        padding: '4px 8px',
                                        minWidth: '24px',
                                        textAlign: 'center',
                                        fontWeight: 'bold',
                                        color: state.selected ? '#38bdf8' : '#64748b',
                                      }}
                                    >
                                      {state.quantity}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={!state.selected || state.quantity >= item.quantity}
                                      onClick={() => updateItemQty(item.id, state.quantity + 1, item.quantity)}
                                      style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: '#cbd5e1',
                                        padding: '4px 8px',
                                        cursor: 'pointer',
                                        fontWeight: 'bold',
                                      }}
                                    >
                                      +
                                    </button>
                                  </div>
                                </td>

                                {/* UNIT PRICE */}
                                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#94a3b8' }}>
                                  BD {unitPrice.toFixed(3)}
                                </td>

                                {/* LINE TOTAL */}
                                <td
                                  style={{
                                    padding: '10px 12px',
                                    textAlign: 'right',
                                    fontWeight: 'bold',
                                    color: state.selected ? '#10b981' : '#64748b',
                                  }}
                                >
                                  BD {lineSubtotal.toFixed(3)}
                                </td>

                                {/* REASON & SPOILAGE TOGGLE */}
                                <td style={{ padding: '10px 12px' }}>
                                  <select
                                    disabled={!state.selected}
                                    value={state.reason}
                                    onChange={(e) => updateItemReason(item.id, e.target.value)}
                                    style={{
                                      width: '100%',
                                      backgroundColor: '#0f172a',
                                      color: '#f8fafc',
                                      border: '1px solid #475569',
                                      borderRadius: '6px',
                                      padding: '5px 8px',
                                      fontSize: '12px',
                                      outline: 'none',
                                      marginBottom: '4px',
                                    }}
                                  >
                                    <option value="MISTAKE">Mistake (Restock)</option>
                                    <option value="DAMAGED">Damaged (Wastage)</option>
                                    <option value="DEFECTIVE">Defective (Wastage)</option>
                                    <option value="EXPIRED">Expired (Wastage)</option>
                                  </select>

                                  <label
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      fontSize: '11px',
                                      cursor: state.selected ? 'pointer' : 'not-allowed',
                                      color: state.isDamaged ? '#f87171' : '#64748b',
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={!state.selected}
                                      checked={state.isDamaged}
                                      onChange={() => toggleItemDamaged(item.id)}
                                      style={{ accentColor: '#ef4444' }}
                                    />
                                    <span>{state.isDamaged ? 'Route to Wastage Log' : 'Restock to Inventory'}</span>
                                  </label>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* DESTINATION & SUMMARY BAR */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                      gap: '16px',
                      backgroundColor: '#1e293b',
                      borderRadius: '12px',
                      padding: '16px',
                      border: '1px solid #334155',
                      marginBottom: '16px',
                    }}
                  >
                    {/* DESTINATION SELECTION */}
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#cbd5e1', marginBottom: '8px' }}>
                        Refund Payout Destination:
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          type="button"
                          onClick={() => setDestination('CASH')}
                          style={{
                            flex: 1,
                            backgroundColor: destination === 'CASH' ? '#0284c7' : '#0f172a',
                            color: destination === 'CASH' ? '#ffffff' : '#94a3b8',
                            border: `1px solid ${destination === 'CASH' ? '#38bdf8' : '#334155'}`,
                            borderRadius: '8px',
                            padding: '10px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                          }}
                        >
                          <Wallet size={16} />
                          <span>Cash Drawer</span>
                        </button>

                        <button
                          type="button"
                          disabled={!sale.customerId}
                          onClick={() => setDestination('KHATA_CREDIT')}
                          style={{
                            flex: 1,
                            backgroundColor: destination === 'KHATA_CREDIT' ? '#8b5cf6' : '#0f172a',
                            color: destination === 'KHATA_CREDIT' ? '#ffffff' : sale.customerId ? '#94a3b8' : '#475569',
                            border: `1px solid ${destination === 'KHATA_CREDIT' ? '#a78bfa' : '#334155'}`,
                            borderRadius: '8px',
                            padding: '10px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            cursor: sale.customerId ? 'pointer' : 'not-allowed',
                            opacity: sale.customerId ? 1 : 0.5,
                          }}
                          title={sale.customerId ? 'Credit customer account balance' : 'No customer linked to this invoice'}
                        >
                          <Users size={16} />
                          <span>Khata Credit</span>
                        </button>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                        {destination === 'CASH'
                          ? 'Deducts cash from register float (recorded as refund expense in till).'
                          : sale.customer
                          ? `Credits ${sale.customer.name}'s Khata account directly.`
                          : 'Customer not linked to this invoice.'}
                      </div>
                    </div>

                    {/* TOTAL REFUND CALCULATION */}
                    <div
                      style={{
                        backgroundColor: '#0f172a',
                        borderRadius: '8px',
                        padding: '12px 16px',
                        border: '1px solid #334155',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                      }}
                    >
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>Total Refund Due:</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444' }}>
                        BD {totalRefundAmount.toFixed(3)}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                        {selectedItemsToRefund.length} item(s) selected
                      </div>
                    </div>
                  </div>

                  {/* ERROR MESSAGE */}
                  {errorMessage && (
                    <div
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid #ef4444',
                        color: '#fca5a5',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        fontSize: '13px',
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <AlertTriangle size={16} />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {/* ACTION FOOTER */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button
                      type="button"
                      onClick={onClose}
                      style={{
                        backgroundColor: '#334155',
                        color: '#f8fafc',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '12px 20px',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={submitting || selectedItemsToRefund.length === 0}
                      onClick={handleProcessRefund}
                      style={{
                        backgroundColor: selectedItemsToRefund.length === 0 ? '#475569' : '#dc2626',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '12px 24px',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        cursor: submitting || selectedItemsToRefund.length === 0 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
                      }}
                    >
                      <RotateCcw size={18} />
                      <span>
                        {submitting ? 'Processing Transaction...' : `Process Refund (BD ${totalRefundAmount.toFixed(3)})`}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
