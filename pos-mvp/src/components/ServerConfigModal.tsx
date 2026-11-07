import React, { useState } from 'react';
import {
  getRegisterPrefix,
  getLocalInvoiceCounter,
  setRegisterPrefix,
  setLocalInvoiceCounter,
  previewNextInvoiceNumber,
} from '../utils/nbrInvoice';

export interface ServerConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeServerIp: string;
  onSaveServerIp: (ip: string) => void;
}

export const ServerConfigModal: React.FC<ServerConfigModalProps> = ({
  isOpen,
  onClose,
  activeServerIp,
  onSaveServerIp,
}) => {
  const [customServerIp, setCustomServerIp] = useState(activeServerIp);
  const [registerPrefix, setRegPrefixState] = useState(getRegisterPrefix());
  const [invoiceCounter, setInvCounterState] = useState(getLocalInvoiceCounter().toString());

  if (!isOpen) return null;

  const nextPreview = previewNextInvoiceNumber(registerPrefix, parseInt(invoiceCounter, 10) || 1);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          maxWidth: '520px',
          width: '100%',
          padding: '24px',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>
              ⚙️ Master Back-Office IP Setup
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
              Point this SUNMI terminal to the store's central laptop
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>
            Master Server IPv4 Address or Hostname:
          </label>
          <input
            type="text"
            value={customServerIp}
            onChange={(e) => setCustomServerIp(e.target.value)}
            placeholder="e.g. http://askar-master.local:3000"
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '14px',
              fontFamily: 'monospace',
              width: '100%',
            }}
          />
          <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
            Currently active: <strong>{activeServerIp}</strong>
          </p>
        </div>

        {/* Quick Preset Buttons */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: '#64748b', alignSelf: 'center' }}>Presets:</span>
          <button
            onClick={() => setCustomServerIp('http://askar-master.local:3000')}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid #a7f3d0',
              backgroundColor: '#ecfdf5',
              color: '#065f46',
              fontWeight: 'bold',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            📡 mDNS Auto-Discovery
          </button>
          <button
            onClick={() => setCustomServerIp('http://192.168.8.7:3000')}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#f8fafc',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Wi-Fi LAN (:3000)
          </button>
          <button
            onClick={() => setCustomServerIp('http://localhost:3000')}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#f8fafc',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Localhost (3000)
          </button>
        </div>

        {/* Bahrain NBR Article 53 Terminal Block Allocation */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>
              🇧🇭 NBR Article 53 VAT Sequential Sequence
            </h4>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              Guarantees gapless sequential invoice numbers during offline outages.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '4px' }}>
                Register Prefix:
              </label>
              <input
                type="text"
                value={registerPrefix}
                onChange={(e) => setRegPrefixState(e.target.value)}
                placeholder="1"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                }}
              />
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>e.g. 1 (Sunmi 1), 2 (Laptop 2)</span>
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '4px' }}>
                Next Offline Counter:
              </label>
              <input
                type="number"
                min="1"
                value={invoiceCounter}
                onChange={(e) => setInvCounterState(e.target.value)}
                placeholder="1"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                }}
              />
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Next: <strong>{nextPreview}</strong></span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#475569',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setRegisterPrefix(registerPrefix);
              setLocalInvoiceCounter(invoiceCounter);
              onSaveServerIp(customServerIp);
              onClose();
            }}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#059669',
              color: '#ffffff',
              fontWeight: 'bold',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Connect & Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default ServerConfigModal;

