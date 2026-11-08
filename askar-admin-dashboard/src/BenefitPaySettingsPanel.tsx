import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Building2,
  Smartphone,
  Save,
  CheckCircle2,
  AlertCircle,
  QrCode,
  RefreshCw,
  Copy,
  Check,
  Radio,
  ShieldCheck,
} from 'lucide-react';
import {
  BenefitPayConfig,
  DEFAULT_BENEFIT_CONFIG,
  generateBenefitPayPayload,
} from './utils/benefitPay';

export default function BenefitPaySettingsPanel({ apiBase }: { apiBase: string }) {
  const [config, setConfig] = useState<BenefitPayConfig>(DEFAULT_BENEFIT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sampleAmount, setSampleAmount] = useState<number>(1.5);
  const [copiedPayload, setCopiedPayload] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, [apiBase]);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/config/benefit-account`, {
        headers: {
          'x-pos-client': 'pim-admin',
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          setConfig({ ...DEFAULT_BENEFIT_CONFIG, ...data });
        }
      }
    } catch (err: any) {
      console.warn('Failed to load BenefitPay config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSavedSuccess(false);

    if (config.accountType === 'MERCHANT' && !config.merchantId.trim()) {
      setErrorMsg('Please provide a valid BenefitPay Merchant ID.');
      setSaving(false);
      return;
    }
    if (config.accountType === 'MOBILE_FAWRI' && !config.mobileNumber.trim()) {
      setErrorMsg('Please provide a valid Bahrain mobile number for Fawri+ settlements.');
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`${apiBase}/api/config/benefit-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-manager-pin': '9999',
          'x-pos-client': 'pim-admin',
        },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        throw new Error('Server returned error while saving BenefitPay config.');
      }

      const data = await res.json();
      if (data?.config) {
        setConfig(data.config);
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save BenefitPay configuration.');
    } finally {
      setSaving(false);
    }
  };

  const previewPayload = generateBenefitPayPayload(sampleAmount, 'INV-PREVIEW', config);

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(previewPayload);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '10px 0' }}>
      {/* HEADER CARD */}
      <div
        style={{
          backgroundColor: '#1e293b',
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid #334155',
          marginBottom: '20px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #dc2626, #991b1b)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              boxShadow: '0 8px 16px rgba(220, 38, 38, 0.3)',
            }}
          >
            🇧🇭
          </div>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: '22px',
                fontWeight: 800,
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span>BenefitPay Owner Account Settings</span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 10px',
                  borderRadius: '9999px',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}
              >
                EMVCo Fawri+ ⚡ Active
              </span>
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
              إعداد حساب بنفت بي لاستلام المدفوعات من الزبائن عبر الكاشير والشاشات الخارجية وسجل الآجل وفق معايير بنفت البحرين
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchConfig}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#0f172a',
            border: '1px solid #475569',
            color: '#cbd5e1',
            padding: '8px 16px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* FEEDBACK BANNERS */}
      {savedSuccess && (
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: 'rgba(6, 78, 59, 0.8)',
            border: '1px solid #10b981',
            borderRadius: '12px',
            color: '#a7f3d0',
            fontSize: '13px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '20px',
          }}
        >
          <CheckCircle2 size={18} color="#34d399" />
          <span>
            BenefitPay EMVCo account configuration saved successfully! Instant sync pushed to Sunmi POS registers, customer secondary screens, and Khata PWA.
          </span>
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: 'rgba(127, 29, 29, 0.8)',
            border: '1px solid #ef4444',
            borderRadius: '12px',
            color: '#fecaca',
            fontSize: '13px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '20px',
          }}
        >
          <AlertCircle size={18} color="#f87171" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* MAIN FORM & PREVIEW GRID */}
      <form onSubmit={handleSave}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '20px',
          }}
        >
          {/* LEFT: CONFIGURATION FORM */}
          <div
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '16px',
              padding: '24px',
              border: '1px solid #334155',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '10px',
                }}
              >
                1. Select Account Channel (نوع الحساب)
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, accountType: 'MERCHANT' })}
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    border:
                      config.accountType === 'MERCHANT'
                        ? '2px solid #ef4444'
                        : '1px solid #475569',
                    backgroundColor:
                      config.accountType === 'MERCHANT'
                        ? 'rgba(239, 68, 68, 0.15)'
                        : '#0f172a',
                    color: '#ffffff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <Building2 size={16} color={config.accountType === 'MERCHANT' ? '#ef4444' : '#94a3b8'} />
                    <strong style={{ fontSize: '13px' }}>Merchant Account</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                    حساب تاجر رسمي (Merchant ID)
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setConfig({ ...config, accountType: 'MOBILE_FAWRI' })}
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    border:
                      config.accountType === 'MOBILE_FAWRI'
                        ? '2px solid #10b981'
                        : '1px solid #475569',
                    backgroundColor:
                      config.accountType === 'MOBILE_FAWRI'
                        ? 'rgba(16, 185, 129, 0.15)'
                        : '#0f172a',
                    color: '#ffffff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <Smartphone size={16} color={config.accountType === 'MOBILE_FAWRI' ? '#10b981' : '#94a3b8'} />
                    <strong style={{ fontSize: '13px' }}>Mobile Fawri+</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                    تحويل برقم هاتف المالك / الآيبان
                  </p>
                </button>
              </div>
            </div>

            {/* CHANNEL-SPECIFIC FIELDS */}
            {config.accountType === 'MERCHANT' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '6px' }}>
                    BenefitPay Merchant ID <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={config.merchantId}
                    onChange={(e) => setConfig({ ...config, merchantId: e.target.value })}
                    placeholder="e.g. 97300182 or BH-BENEFIT-97300182"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #475569',
                      backgroundColor: '#0f172a',
                      color: '#ffffff',
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                    Issued by BENEFIT or acquiring bank (NBB / CrediMax / BBK / BisB / ila).
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '6px' }}>
                      Merchant Legal Name
                    </label>
                    <input
                      type="text"
                      value={config.merchantName}
                      onChange={(e) => setConfig({ ...config, merchantName: e.target.value })}
                      placeholder="e.g. ASKAR SUPERMARKET"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid #475569',
                        backgroundColor: '#0f172a',
                        color: '#ffffff',
                        fontSize: '13px',
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '6px' }}>
                      Terminal / Branch ID
                    </label>
                    <input
                      type="text"
                      value={config.branchId}
                      onChange={(e) => setConfig({ ...config, branchId: e.target.value })}
                      placeholder="e.g. POS-01"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid #475569',
                        backgroundColor: '#0f172a',
                        color: '#ffffff',
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '6px' }}>
                    Owner Registered Mobile Number <span style={{ color: '#10b981' }}>*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={config.mobileNumber}
                    onChange={(e) => setConfig({ ...config, mobileNumber: e.target.value })}
                    placeholder="e.g. +973 39401234 or 39401234"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #475569',
                      backgroundColor: '#0f172a',
                      color: '#ffffff',
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                    Bahrain phone number registered to your BenefitPay wallet for receiving Fawri+ payments.
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '6px' }}>
                      Beneficiary Account Name
                    </label>
                    <input
                      type="text"
                      value={config.merchantName}
                      onChange={(e) => setConfig({ ...config, merchantName: e.target.value })}
                      placeholder="e.g. ASKAR SUPERMARKET / OWNER"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid #475569',
                        backgroundColor: '#0f172a',
                        color: '#ffffff',
                        fontSize: '13px',
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '6px' }}>
                      Bank IBAN (Optional)
                    </label>
                    <input
                      type="text"
                      value={config.iban}
                      onChange={(e) => setConfig({ ...config, iban: e.target.value.toUpperCase() })}
                      placeholder="e.g. BH67 NBOB 0000 0012 3456 78"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid #475569',
                        backgroundColor: '#0f172a',
                        color: '#ffffff',
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* COMMON FIELDS: CPR / CR & NOTES */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '6px' }}>
                  CR No. / CPR Number
                </label>
                <input
                  type="text"
                  value={config.cprOrCr}
                  onChange={(e) => setConfig({ ...config, cprOrCr: e.target.value })}
                  placeholder="e.g. 200012345678901"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #475569',
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '6px' }}>
                  Customer Instruction Note
                </label>
                <input
                  type="text"
                  value={config.notes}
                  onChange={(e) => setConfig({ ...config, notes: e.target.value })}
                  placeholder="Scan with BenefitPay app to pay directly"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #475569',
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* SAVE BUTTON */}
            <div style={{ marginTop: '10px', paddingTop: '16px', borderTop: '1px solid #334155' }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  borderRadius: '12px',
                  border: 'none',
                  background: saving
                    ? '#64748b'
                    : 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  boxShadow: '0 8px 20px rgba(220, 38, 38, 0.35)',
                  transition: 'all 0.15s ease',
                }}
              >
                {saving ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Synchronizing Fleet...</span>
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    <span>Save BenefitPay Account & Sync All Devices</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* RIGHT: LIVE QR & CUSTOMER SIMULATION PREVIEW */}
          <div
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '16px',
              padding: '24px',
              border: '1px solid #334155',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <QrCode size={18} color="#ef4444" />
                <span>Live EMVCo Fawri+ QR Preview</span>
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Test BD:</span>
                <input
                  type="number"
                  step="0.100"
                  min="0"
                  value={sampleAmount}
                  onChange={(e) => setSampleAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  style={{
                    width: '65px',
                    padding: '3px 6px',
                    borderRadius: '6px',
                    border: '1px solid #475569',
                    backgroundColor: '#0f172a',
                    color: '#38bdf8',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    fontWeight: 700,
                    textAlign: 'right',
                  }}
                />
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#0f172a',
                borderRadius: '16px',
                padding: '24px',
                border: '1px solid #334155',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  backgroundColor: '#ffffff',
                  padding: '16px',
                  borderRadius: '16px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
                  marginBottom: '16px',
                }}
              >
                <QRCodeSVG
                  value={previewPayload}
                  size={190}
                  level="M"
                  includeMargin={true}
                  fgColor="#000000"
                  bgColor="#ffffff"
                />
              </div>

              <div style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', marginBottom: '2px' }}>
                {config.merchantName || 'ASKAR SUPERMARKET'}
              </div>

              <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', color: config.accountType === 'MOBILE_FAWRI' ? '#34d399' : '#38bdf8' }}>
                {config.accountType === 'MOBILE_FAWRI'
                  ? `Fawri+ Mobile: ${config.mobileNumber || 'Not Set'}`
                  : `Merchant ID: ${config.merchantId || 'Not Set'}`}
              </div>

              {config.branchId && (
                <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', marginTop: '2px' }}>
                  Terminal ID: {config.branchId}
                </div>
              )}

              {config.iban && (
                <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', marginTop: '2px' }}>
                  IBAN: {config.iban}
                </div>
              )}

              <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#64748b' }}>
                {config.notes || 'Scan with BenefitPay app to pay directly'}
              </p>
            </div>

            {/* PAYLOAD STRING INSPECTOR */}
            <div
              style={{
                backgroundColor: '#0f172a',
                borderRadius: '10px',
                padding: '12px',
                border: '1px solid #334155',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={13} color="#10b981" />
                  <span>EMVCo QRCPS MPM Payload (bh.benefit)</span>
                </span>
                <button
                  type="button"
                  onClick={handleCopyPayload}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: copiedPayload ? '#065f46' : '#1e293b',
                    color: copiedPayload ? '#a7f3d0' : '#94a3b8',
                    border: '1px solid #334155',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {copiedPayload ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedPayload ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: '#38bdf8',
                  wordBreak: 'break-all',
                  lineHeight: '1.4',
                  backgroundColor: '#090d16',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid #1e293b',
                }}
              >
                {previewPayload}
              </p>
            </div>

            {/* DEPLOYMENT NOTICE */}
            <div
              style={{
                backgroundColor: 'rgba(56, 189, 248, 0.08)',
                borderRadius: '10px',
                padding: '12px',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <Radio size={16} color="#38bdf8" />
              <span style={{ fontSize: '12px', color: '#bae6fd' }}>
                Saves centrally to <code>benefit_account_config.json</code> on the store laptop and instantly propagates to all Sunmi handhelds & customer screens.
              </span>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
