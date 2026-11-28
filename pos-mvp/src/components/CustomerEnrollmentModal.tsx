import React, { useState, useEffect } from 'react';
import { Customer } from '../types/pos';

export interface CustomerEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  customersList: Customer[];
  onSelectCustomer: (customer: Customer) => void;
  onCreateCustomer: (
    name: string,
    cardUid?: string,
    previousBalance?: number,
    cardDepositAmount?: number,
    cardType?: string,
    paydayDayOfMonth?: number,
    depositPaymentMode?: 'DEFERRED_PAYDAY' | 'CASH_UPFRONT'
  ) => void;
  onBindCard: (customerId: string, cardUid: string, depositAmount?: number) => void;
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
  const [cardType, setCardType] = useState<'PHYSICAL_NFC' | 'DIGITAL_PASS'>('PHYSICAL_NFC');
  const [depositAmount, setDepositAmount] = useState('3.000');
  const [depositPaymentMode, setDepositPaymentMode] = useState<'DEFERRED_PAYDAY' | 'CASH_UPFRONT'>('DEFERRED_PAYDAY');
  const [paydayDay, setPaydayDay] = useState('28');
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
    window.addEventListener('sunmi-nfc-broadcast', handleNfc);
    return () => {
      window.removeEventListener('sunmi-nfc-scan', handleNfc);
      window.removeEventListener('sunmi-nfc-broadcast', handleNfc);
    };
  }, [isOpen, setNewCustCardUid]);

  if (!isOpen) return null;

  const handleCreate = () => {
    if (!newCustName.trim()) return;
    const prevBal = parseFloat(newCustPrevBalance);
    const depAmt = cardType === 'DIGITAL_PASS' ? 0 : (parseFloat(depositAmount) || 0);
    const pDay = parseInt(paydayDay) || 28;
    onCreateCustomer(
      newCustName.trim(),
      cardType === 'DIGITAL_PASS' ? undefined : (newCustCardUid || undefined),
      !isNaN(prevBal) && prevBal > 0 ? prevBal : 0,
      depAmt,
      cardType,
      pDay,
      depositPaymentMode
    );
    setNewCustName('');
    setNewCustPrevBalance('');
    setDepositAmount('3.000');
    setDepositPaymentMode('DEFERRED_PAYDAY');
    setCardType('PHYSICAL_NFC');
    setPaydayDay('28');
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15,23,42,0.75)',
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
            {/* Card Type Selector */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  setCardType('PHYSICAL_NFC');
                  if (depositAmount === '0.000') setDepositAmount('3.000');
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: cardType === 'PHYSICAL_NFC' ? '2px solid #2563eb' : '1px solid #d1d5db',
                  backgroundColor: cardType === 'PHYSICAL_NFC' ? '#eff6ff' : '#ffffff',
                  color: cardType === 'PHYSICAL_NFC' ? '#1e40af' : '#4b5563',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>💳 Physical NFC Card</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCardType('DIGITAL_PASS');
                  setDepositAmount('0.000');
                  setNewCustCardUid('');
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: cardType === 'DIGITAL_PASS' ? '2px solid #059669' : '1px solid #d1d5db',
                  backgroundColor: cardType === 'DIGITAL_PASS' ? '#ecfdf5' : '#ffffff',
                  color: cardType === 'DIGITAL_PASS' ? '#065f46' : '#4b5563',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>📱 Free Digital Pass (0 BD)</span>
              </button>
            </div>

            {/* Editable Deposit & Payday Selector */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  Card Deposit (BHD - Custodial Trust):
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: '10px', fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>BD</span>
                  <input
                    type="number"
                    step="0.500"
                    min="0"
                    disabled={cardType === 'DIGITAL_PASS'}
                    placeholder="3.000"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 32px',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      color: cardType === 'DIGITAL_PASS' ? '#94a3b8' : '#047857',
                      backgroundColor: cardType === 'DIGITAL_PASS' ? '#f1f5f9' : '#ffffff'
                    }}
                  />
                </div>
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  Salary Payday (Day of Month):
                </label>
                <select
                  value={paydayDay}
                  onChange={(e) => setPaydayDay(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    color: '#334155',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <option value="25">25th of month</option>
                  <option value="26">26th of month</option>
                  <option value="27">27th of month</option>
                  <option value="28">28th of month (Standard)</option>
                  <option value="29">29th of month</option>
                  <option value="30">30th of month</option>
                  <option value="1">1st of month</option>
                  <option value="5">5th of month</option>
                  <option value="10">10th of month</option>
                </select>
              </div>
            </div>

            {/* Deposit Payment Timing: Deferred Payday vs Cash Upfront */}
            {cardType === 'PHYSICAL_NFC' && (
              <div style={{ marginBottom: '10px', backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#334155' }}>
                    Card Deposit Payment Mode:
                  </label>
                  <span style={{ fontSize: '10px', color: '#64748b', fontStyle: 'italic' }}>
                    {depositPaymentMode === 'DEFERRED_PAYDAY' ? 'Billed on First Payday' : 'Paid at Counter'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setDepositPaymentMode('DEFERRED_PAYDAY')}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: depositPaymentMode === 'DEFERRED_PAYDAY' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      backgroundColor: depositPaymentMode === 'DEFERRED_PAYDAY' ? '#eff6ff' : '#ffffff',
                      color: depositPaymentMode === 'DEFERRED_PAYDAY' ? '#1e40af' : '#475569',
                      fontWeight: 'bold',
                      fontSize: '11px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>🗓️</span>
                      <span>Charge to Tab (Pay on Payday)</span>
                    </div>
                    <div style={{ fontSize: '10px', fontWeight: 'normal', color: '#64748b', marginTop: '2px', paddingLeft: '18px' }}>
                      Adds BD {(parseFloat(depositAmount) || 3.000).toFixed(3)} to starting balance
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDepositPaymentMode('CASH_UPFRONT')}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: depositPaymentMode === 'CASH_UPFRONT' ? '2px solid #059669' : '1px solid #cbd5e1',
                      backgroundColor: depositPaymentMode === 'CASH_UPFRONT' ? '#ecfdf5' : '#ffffff',
                      color: depositPaymentMode === 'CASH_UPFRONT' ? '#065f46' : '#475569',
                      fontWeight: 'bold',
                      fontSize: '11px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>💵</span>
                      <span>Cash Paid Now at Counter</span>
                    </div>
                    <div style={{ fontSize: '10px', fontWeight: 'normal', color: '#64748b', marginTop: '2px', paddingLeft: '18px' }}>
                      Held in trust; tab starts at BD 0.000
                    </div>
                  </button>
                </div>
              </div>
            )}

            {cardType === 'PHYSICAL_NFC' && (
              <>
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
              </>
            )}
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
            {cardType === 'PHYSICAL_NFC' && depositPaymentMode === 'DEFERRED_PAYDAY' && (parseFloat(depositAmount) || 0) > 0 && (
              <div style={{ fontSize: '11px', color: '#1e40af', backgroundColor: '#eff6ff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #bfdbfe', marginBottom: '8px' }}>
                🗓️ <strong>Payday Deposit Note:</strong> Card deposit of BD {(parseFloat(depositAmount) || 3.000).toFixed(3)} will be charged to the customer's tab and settled on their first payday ({paydayDay}th).
              </div>
            )}
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
                    {c.card_type === 'DIGITAL_PASS' && (
                      <span style={{ marginLeft: '6px', fontSize: '11px', color: '#0369a1', backgroundColor: '#e0f2fe', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>Digital Pass</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#047857', marginTop: '2px' }}>
                    Deposit: <strong>{
                      (c.card_deposit_status === 'IN_CREDIT' || c.card_deposit_status === 'DEFERRED_CREDIT' || c.card_deposit_status === 'DEFERRED_PAYDAY' || Boolean(c.depositInCredit))
                        ? `BD ${Number(c.card_deposit_amount || 3).toFixed(3)} Credit Deposit`
                        : (Number(c.card_deposit_amount || 0) > 0 || c.card_deposit_status === 'HELD')
                          ? `BD ${Number(c.card_deposit_amount ?? 3).toFixed(3)} Deposited`
                          : (c.card_type === 'DIGITAL_PASS' ? '0 BD (Free Pass)' : 'No Deposit')
                    }</strong>
                  </div>
                  <div style={{ fontSize: '13px', color: '#dc2626', fontWeight: 'bold' }}>
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
                      onClick={() => onBindCard(c.id, lastDetectedUid, parseFloat(depositAmount) || 3.000)}
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
                      title={`Bind ${lastDetectedUid} to ${c.name} (Deposit: BD ${depositAmount})`}
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

