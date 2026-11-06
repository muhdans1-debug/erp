import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Building2,
  Smartphone,
  Save,
  X,
  CheckCircle2,
  AlertCircle,
  QrCode,
  RefreshCw,
} from 'lucide-react';
import {
  BenefitPayConfig,
  getStoredBenefitPayConfig,
  saveStoredBenefitPayConfig,
  fetchBenefitPayConfig,
  generateBenefitPayPayload,
} from '../utils/benefitPay';

export interface BenefitPayConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiBase?: string;
  onConfigSaved?: (config: BenefitPayConfig) => void;
}

export const BenefitPayConfigModal: React.FC<BenefitPayConfigModalProps> = ({
  isOpen,
  onClose,
  apiBase = 'http://localhost:3000',
  onConfigSaved,
}) => {
  const [config, setConfig] = useState<BenefitPayConfig>(getStoredBenefitPayConfig());
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync latest from backend on modal open
  useEffect(() => {
    if (isOpen) {
      setConfig(getStoredBenefitPayConfig());
      setSavedSuccess(false);
      setErrorMsg(null);
      fetchBenefitPayConfig(apiBase).then((remote) => {
        if (remote) setConfig(remote);
      });
    }
  }, [isOpen, apiBase]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);

    // Validation
    if (config.accountType === 'MERCHANT' && !config.merchantId.trim()) {
      setErrorMsg('Please enter a valid BenefitPay Merchant ID.');
      setSaving(false);
      return;
    }
    if (config.accountType === 'MOBILE_FAWRI' && !config.mobileNumber.trim()) {
      setErrorMsg('Please enter a valid Bahrain mobile number for Fawri+ transfers.');
      setSaving(false);
      return;
    }

    try {
      const saved = await saveStoredBenefitPayConfig(config, apiBase);
      setSaving(false);
      setSavedSuccess(true);
      if (onConfigSaved) onConfigSaved(saved);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setSaving(false);
      setErrorMsg(err?.message || 'Failed to save BenefitPay configuration.');
    }
  };

  const sampleAmount = 1.5;
  const sampleInvoice = 'INV-SAMPLE';
  const previewPayload = generateBenefitPayPayload(sampleAmount, sampleInvoice, config);

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-[9999] p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl text-white flex flex-col max-h-[92vh] overflow-hidden">
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center text-white shadow-lg shadow-red-900/30">
              <span className="text-xl">🇧🇭</span>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                <span>BenefitPay Owner Account Setup</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                  Fawri+ ⚡
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-medium font-arabic">
                إعداد حساب بنفت بي الخاص بمالك المتجر لاستلام الدفعات مباشرة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* ERROR / SUCCESS ALERTS */}
        {savedSuccess && (
          <div className="mt-3 p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-xl flex items-center gap-2.5 text-xs text-emerald-300 font-bold animate-in fade-in">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>BenefitPay account saved and synchronized across all Sunmi terminals & secondary screens!</span>
          </div>
        )}

        {errorMsg && (
          <div className="mt-3 p-3 bg-red-950/80 border border-red-500/50 rounded-xl flex items-center gap-2.5 text-xs text-red-300 font-bold">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* MODAL BODY (SCROLLABLE) */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {/* 1. ACCOUNT MODE SELECTOR */}
          <div>
            <label className="text-xs font-black text-slate-300 uppercase tracking-wider block mb-2">
              Select BenefitPay Receiving Method (نوع الحساب)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Option A: Merchant Account */}
              <button
                type="button"
                onClick={() => setConfig({ ...config, accountType: 'MERCHANT' })}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                  config.accountType === 'MERCHANT'
                    ? 'bg-red-500/10 border-red-500/60 ring-2 ring-red-500/30'
                    : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800 text-slate-400'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    config.accountType === 'MERCHANT' ? 'bg-red-600 text-white' : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  <Building2 size={18} />
                </div>
                <div>
                  <div className="text-xs font-black text-white flex items-center gap-1.5">
                    <span>Merchant Account (حساب تاجر)</span>
                    {config.accountType === 'MERCHANT' && (
                      <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    Commercial Merchant ID from BENEFIT, NBB, or CrediMax POS terminal.
                  </p>
                </div>
              </button>

              {/* Option B: Mobile Fawri+ / IBAN */}
              <button
                type="button"
                onClick={() => setConfig({ ...config, accountType: 'MOBILE_FAWRI' })}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                  config.accountType === 'MOBILE_FAWRI'
                    ? 'bg-emerald-500/10 border-emerald-500/60 ring-2 ring-emerald-500/30'
                    : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800 text-slate-400'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    config.accountType === 'MOBILE_FAWRI' ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  <Smartphone size={18} />
                </div>
                <div>
                  <div className="text-xs font-black text-white flex items-center gap-1.5">
                    <span>Mobile Fawri+ / IBAN (حساب فوري شخصي)</span>
                    {config.accountType === 'MOBILE_FAWRI' && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    Owner's Bahrain mobile number or IBAN registered on BenefitPay app.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* 2. FORM FIELDS */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3.5">
            {config.accountType === 'MERCHANT' ? (
              <>
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    BenefitPay Merchant ID (معرف التاجر) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={config.merchantId}
                    onChange={(e) => setConfig({ ...config, merchantId: e.target.value })}
                    placeholder="e.g. BH-BENEFIT-97300182 or 97300182"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-hidden focus:border-red-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Provided by BENEFIT or your acquiring bank (NBB / CrediMax / BBK / BisB / ila).
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Merchant Legal Name (اسم المنشأة)
                    </label>
                    <input
                      type="text"
                      value={config.merchantName}
                      onChange={(e) => setConfig({ ...config, merchantName: e.target.value })}
                      placeholder="e.g. ASKAR SUPERMARKET"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Terminal / Branch ID (رقم الفرع أو الكاشير)
                    </label>
                    <input
                      type="text"
                      value={config.branchId}
                      onChange={(e) => setConfig({ ...config, branchId: e.target.value })}
                      placeholder="e.g. MAIN-01 or POS-01"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-hidden focus:border-red-500"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Owner BenefitPay Mobile Number (رقم هاتف المالك المسجل في بنفت بي) <span className="text-emerald-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      required
                      value={config.mobileNumber}
                      onChange={(e) => setConfig({ ...config, mobileNumber: e.target.value })}
                      placeholder="e.g. +973 39401234 or 39401234"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-3 pr-20 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
                    />
                    <span className="absolute right-3 top-2 text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      Fawri+ Direct
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Customers can scan the dynamic Fawri+ QR code or send payment directly to this mobile number.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Beneficiary / Owner Name (اسم المستفيد)
                    </label>
                    <input
                      type="text"
                      value={config.merchantName}
                      onChange={(e) => setConfig({ ...config, merchantName: e.target.value })}
                      placeholder="e.g. ASKAR SUPERMARKET / OWNER NAME"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Bahrain Bank IBAN (رقم الآيبان - اختياري)
                    </label>
                    <input
                      type="text"
                      value={config.iban}
                      onChange={(e) => setConfig({ ...config, iban: e.target.value.toUpperCase() })}
                      placeholder="e.g. BH67 NBOB 0000 0012 3456 78"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>
                </div>
              </>
            )}

            {/* CPR / CR & Customer Instructions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-800/80">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  CR No. / CPR (السجل التجاري أو الرقم الشخصي)
                </label>
                <input
                  type="text"
                  value={config.cprOrCr}
                  onChange={(e) => setConfig({ ...config, cprOrCr: e.target.value })}
                  placeholder="e.g. 200012345678901"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-hidden focus:border-slate-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Customer Prompt Note (ملاحظة تظهر للمشتري على الشاشة)
                </label>
                <input
                  type="text"
                  value={config.notes}
                  onChange={(e) => setConfig({ ...config, notes: e.target.value })}
                  placeholder="Scan with BenefitPay app to pay directly"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-slate-500"
                />
              </div>
            </div>
          </div>

          {/* 3. LIVE QR & CUSTOMER DISPLAY PREVIEW */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                <QrCode size={14} className="text-red-400" />
                <span>Live Dynamic Fawri+ QR Preview</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                Sample: BD {sampleAmount.toFixed(3)}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-900/90 rounded-lg p-3 border border-slate-800">
              <div className="bg-white p-2.5 rounded-xl shadow-md shrink-0">
                <QRCodeSVG
                  value={previewPayload}
                  size={100}
                  level="M"
                  includeMargin={false}
                  fgColor="#000000"
                  bgColor="#ffffff"
                />
              </div>

              <div className="space-y-1 text-center sm:text-left flex-1 min-w-0">
                <div className="text-xs font-black text-white truncate">
                  {config.merchantName || 'ASKAR SUPERMARKET'}
                </div>
                <div className="text-[11px] font-mono text-emerald-400 font-bold truncate">
                  {config.accountType === 'MOBILE_FAWRI'
                    ? `Fawri+ Mobile: ${config.mobileNumber || 'Not Set'}`
                    : `Merchant ID: ${config.merchantId || 'Not Set'}`}
                </div>
                {config.iban && (
                  <div className="text-[10px] font-mono text-slate-400 truncate">
                    IBAN: {config.iban}
                  </div>
                )}
                <div className="text-[10px] text-slate-400 truncate">
                  {config.notes || 'Scan with BenefitPay app to pay directly'}
                </div>
                <div className="text-[9px] font-mono text-slate-500 truncate pt-1">
                  Payload: {previewPayload.slice(0, 48)}...
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* MODAL FOOTER */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-lg transition-all cursor-pointer ${
              saving
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white shadow-red-900/40 active:scale-95'
            }`}
          >
            {saving ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Saving & Syncing Fleet...</span>
              </>
            ) : (
              <>
                <Save size={14} />
                <span>Save BenefitPay Account (حفظ ومزامنة)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BenefitPayConfigModal;
