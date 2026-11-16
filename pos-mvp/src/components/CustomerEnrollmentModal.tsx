import React, { useState, useEffect } from 'react';
import { Customer } from '../types/pos';

export interface CustomerEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  customersList: Customer[];
  onSelectCustomer: (customer: Customer) => void;
  onCreateCustomer: (name: string, cardUid?: string, previousBalance?: number) => void;
  onBindCard: (customerId: string, cardUid: string) => void;
  lastDetectedUid: string | null;
  bindingCustomerId: string | null;
  setBindingCustomerId: (id: string | null) => void;
  newCustCardUid: string;
  setNewCustCardUid: (uid: string) => void;
}

export const CustomerEnrollmentModal: React.FC<CustomerEnrollmentModalProps> = ({
  isOpen,
  onClose,
  customersList,
  onSelectCustomer,
  onCreateCustomer,
  onBindCard,
  lastDetectedUid,
  bindingCustomerId,
  setBindingCustomerId,
  newCustCardUid,
  setNewCustCardUid,
}) => {
  const [newCustName, setNewCustName] = useState('');
  const [newCustPrevBalance, setNewCustPrevBalance] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Auto-listen to NFC taps while modal is active
  useEffect(() => {
    if (!isOpen) return;
    const handleNfc = (e: any) => {
      const uid = e?.detail?.tag_id || e?.detail?.nfcId || (typeof e?.detail === 'string' ? e.detail : '');
      if (uid) {
        const clean = uid.trim().toUpperCase();
        setNewCustCardUid(clean);
      }
    };
    window.addEventListener('sunmi-nfc-scan', handleNfc);
    return () => window.removeEventListener('sunmi-nfc-scan', handleNfc);
  }, [isOpen, setNewCustCardUid]);

  if (!isOpen) return null;

  const handleCreate = () => {
    if (!newCustName.trim()) return;
    const prevBal = parseFloat(newCustPrevBalance);
    onCreateCustomer(newCustName.trim(), newCustCardUid, !isNaN(prevBal) && prevBal > 0 ? prevBal : 0);
    setNewCustName('');
    setNewCustPrevBalance('');
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15,23,42,0.65)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          width: '600px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
        }}
      >
        {/* Modal Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: '#111827' }}>
            Customer Enrollment & Khata Cards
          </h3>
          <button
            onClick={() => {
              onClose();
              setBindingCustomerId(null);
            }}
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
          {/* Add New Customer Form */}
          <div style={{ marginBottom: '20px' }}>
            {newCustCardUid ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px' }}>💳</span>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#065f46' }}>NFC Card Attached (Ready to Link)</div>
                    <div style={{ fontSize: '13px', fontFamily: 'monospace', fontWeight: 'bold', color: '#047857' }}>{newCustCardUid}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setNewCustCardUid('')}
                  style={{ fontSize: '11px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Clear Card
                </button>
              </div>
            ) : (
              <div style={{ backgroundColor: '#eff6ff', border: '1px dashed #93c5fd', borderRadius: '8px', padding: '6px 12px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#1e40af' }}>
                <span>📶</span>
                <span><strong>NFC Ready:</strong> Tap card on terminal to auto-attach to this new customer</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input
                type="text"
                placeholder="Card UID (auto-filled on tap, or type manually)"
                value={newCustCardUid}
                onChange={(e) => setNewCustCardUid(e.target.value.toUpperCase())}
                style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px', fontFamily: 'monospace' }}
              />
              {lastDetectedUid && newCustCardUid !== lastDetectedUid && (
                <button
                  type="button"
                  onClick={() => setNewCustCardUid(lastDetectedUid)}
                  style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  Use Last Tap ({lastDetectedUid})
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="text"
                placeholder="New customer name *..."
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                }}
                style={{ flex: 1.5, padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', fontWeight: '500' }}
              />
              <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: '10px', fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>BD</span>
                <input
                  type="number"
                  step="0.005"
                  min="0"
                  placeholder="0.000 (Book Balance)"
                  value={newCustPrevBalance}
                  onChange={(e) => setNewCustPrevBalance(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                  }}
                  title="Previous balance owed from physical paper notebook"
                  style={{ width: '100%', padding: '10px 14px 10px 32px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', fontWeight: 'bold', color: '#dc2626' }}
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={!newCustName.trim()}
                style={{ backgroundColor: newCustName.trim() ? '#2563eb' : '#94a3b8', color: '#ffffff', padding: '10px 18px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: newCustName.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}
              >
                Add Customer
              </button>
            </div>
            {newCustPrevBalance && parseFloat(newCustPrevBalance) > 0 && (
              <div style={{ fontSize: '11px', color: '#b91c1c', backgroundColor: '#fef2f2', padding: '4px 8px', borderRadius: '6px', border: '1px solid #fecaca', marginBottom: '8px' }}>
                📖 <strong>Opening Balance:</strong> BD {parseFloat(newCustPrevBalance).toFixed(3)} will be posted immediately as an initial debit to this customer's Khata ledger.
              </div>
            )}
          </div>

          {/* Binding in Progress Banner */}
          {bindingCustomerId && (
            <div style={{ padding: '12px 16px', backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', marginBottom: '16px', color: '#92400e' }}>
              ⏳ <strong>Tap customer card or phone now</strong> on the SUNMI reader to link it!
              <button
                onClick={() => setBindingCustomerId(null)}
                style={{ marginLeft: '12px', textDecoration: 'underline', background: 'none', border: 'none', color: '#92400e', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Customer Search Bar */}
          <div style={{ marginBottom: '12px' }}>
            <input
              type="text"
              placeholder="🔍 Search customers by name, phone, or card UID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '13px',
                boxSizing: 'border-box',
                backgroundColor: '#f8fafc'
              }}
            />
          </div>

          {/* Customer List Table */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            {(() => {
              const q = searchQuery.toLowerCase().trim();
              const filteredList = (customersList || []).filter(c => {
                if (!q) return true;
                return (
                  (c.name && c.name.toLowerCase().includes(q)) ||
                  (c.phone && c.phone.includes(q)) ||
                  (c.cardUid && c.cardUid.toLowerCase().includes(q)) ||
                  (c.nfcCardId && c.nfcCardId.toLowerCase().includes(q))
                );
              });

              if (filteredList.length === 0) {
                return (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                    {searchQuery ? `No customers matching "${searchQuery}"` : 'No customers enrolled yet'}
                  </div>
                );
              }

              return filteredList.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: '14px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid #f3f4f6',
                  backgroundColor: bindingCustomerId === c.id ? '#fefce8' : '#ffffff',
                }}
              >
                <div>
                  <div style={{ fontWeight: '600', fontSize: '16px', color: '#111827' }}>{c.name}</div>
                  <div style={{ fontSize: '13px', color: '#6b7280' }}>
                    Card UID: <strong style={{ color: c.cardUid ? '#1d4ed8' : '#9ca3af' }}>{c.cardUid || c.nfcCardId || 'None'}</strong>
                  </div>
                  <div style={{ fontSize: '13px', color: '#059669', fontWeight: 'bold' }}>
                    Khata Balance: BD {Number(c.currentBalance ?? c.balance ?? 0).toFixed(3)}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={() => {
                      onSelectCustomer(c);
                      onClose();
                    }}
                    style={{
                      backgroundColor: '#10b981',
                      color: '#ffffff',
                      padding: '8px 14px',
                      borderRadius: '6px',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                    }}
                  >
                    Select
                  </button>

                  {lastDetectedUid && (
                    <button
                      onClick={() => onBindCard(c.id, lastDetectedUid)}
                      style={{
                        backgroundColor: '#059669',
                        color: '#ffffff',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                      }}
                      title={`Bind ${lastDetectedUid} to ${c.name}`}
                    >
                      Bind Last Read ({lastDetectedUid})
                    </button>
                  )}

                  <button
                    onClick={() => setBindingCustomerId(c.id)}
                    style={{
                      backgroundColor: bindingCustomerId === c.id ? '#d97706' : '#1f2937',
                      color: '#ffffff',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                    }}
                  >
                    {bindingCustomerId === c.id ? 'Waiting for Tap...' : 'Bind Card'}
                  </button>
                </div>
              </div>
            ));
          })()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerEnrollmentModal;

