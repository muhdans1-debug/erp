import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, Check, ExternalLink, ShieldCheck, QrCode, Smartphone, ArrowRight } from 'lucide-react';
import { openBenefitPayApp } from '../utils/benefitPay';

export default function BenefitPayModal({
  isOpen,
  onClose,
  data,
  lang = 'en',
  onSuccess
}) {
  const [activeTab, setActiveTab] = useState('qr'); // 'qr' | 'manual'
  const [copiedKey, setCopiedKey] = useState(null);
  const [referenceInput, setReferenceInput] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successResult, setSuccessResult] = useState(null);

  if (!isOpen || !data) return null;

  const amountStr = Number(data.amount || 0).toFixed(3);
  const merchantName = data.merchantName || 'ASKAR SUPERMARKET';
  const merchantId = data.merchantId || '97300182';
  const mobileNumber = data.mobileNumber || '+973 39000000';
  const qrPayload = data.qrPayload || '';

  const handleCopy = (text, key) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  const handleConfirmPayment = async () => {
    setErrorMsg(null);
    setConfirming(true);

    try {
      const res = await fetch('/api/checkout/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: data.customerId,
          amount: data.amount,
          reference: referenceInput.trim() || undefined
        })
      });

      const result = await res.json();
      if (!res.ok || result.error) {
        throw new Error(result.error || 'Failed to record settlement');
      }

      setSuccessResult(result);
      if (onSuccess) {
        onSuccess(result);
      }
      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (err) {
      setErrorMsg(err.message || 'Error confirming payment');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="benefitpay-modal-title"
      >
        {/* BenefitPay Crimson Header */}
        <div className="bg-[#DA291C] px-5 py-4 text-white flex items-center justify-between relative shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-sm">
              <span className="text-[#DA291C] font-black text-sm tracking-tighter">BP</span>
            </div>
            <div>
              <h3 id="benefitpay-modal-title" className="font-extrabold text-base tracking-tight leading-tight flex items-center gap-1.5">
                <span>BenefitPay</span>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/20 text-white uppercase tracking-wider">
                  Fawri+
                </span>
              </h3>
              <p className="text-[11px] text-white/80 font-medium">
                Central Bank of Bahrain • CBB Certified
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close BenefitPay Modal"
            className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Amount Banner */}
        <div className="bg-slate-950/90 px-5 py-3 border-b border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {lang === 'ar' ? 'المبلغ المطلوب سداده' : 'Amount to Settle'}
            </span>
            <div className="text-2xl font-black font-mono text-emerald-400">
              {amountStr} <span className="text-xs text-slate-300 font-sans">BHD</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              {merchantName}
            </span>
            <span className="text-[11px] font-mono text-slate-300">
              ID: {merchantId}
            </span>
          </div>
        </div>

        {/* Tab Selection (Scan QR vs Pay on this Mobile) */}
        <div className="p-3 bg-slate-900 border-b border-slate-800 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('qr')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'qr'
                ? 'bg-red-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>{lang === 'ar' ? 'مسح رمز QR' : 'Scan Fawri+ QR'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'manual'
                ? 'bg-red-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>{lang === 'ar' ? 'الدفع من هذا الهاتف' : 'Pay on Mobile'}</span>
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {successResult ? (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 animate-bounce">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>
              <h4 className="text-lg font-bold text-white">
                {lang === 'ar' ? 'تم تسجيل السداد بنجاح!' : 'Settlement Reconciled!'}
              </h4>
              <p className="text-xs text-slate-300 max-w-xs font-mono">
                {successResult.reference || 'BenefitPay Fawri+ Payment Confirmed'}
              </p>
              <div className="text-sm font-bold text-emerald-400">
                {lang === 'ar' ? 'الرصيد المتبقي الجديد:' : 'New Balance:'}{' '}
                {Number(successResult.newBalance || 0).toFixed(3)} BHD
              </div>
            </div>
          ) : activeTab === 'qr' ? (
            /* QR Code Mode */
            <div className="flex flex-col items-center space-y-3">
              <div className="bg-white p-3 rounded-2xl shadow-xl border-4 border-slate-700/50">
                {qrPayload ? (
                  <QRCodeSVG
                    value={qrPayload}
                    size={170}
                    level="M"
                    includeMargin={false}
                  />
                ) : (
                  <div className="w-[170px] h-[170px] flex items-center justify-center text-slate-400 text-xs">
                    Generating QR...
                  </div>
                )}
              </div>

              <div className="text-center space-y-1">
                <p className="text-xs font-semibold text-slate-200">
                  {lang === 'ar'
                    ? 'افتح تطبيق بنفت بي واختر "مسح الرمز" (Scan QR)'
                    : 'Open BenefitPay app & tap "Scan QR" to pay'}
                </p>
                <p className="text-[11px] text-slate-400 font-arabic">
                  {lang === 'ar'
                    ? 'سيتم تحديد المبلغ تلقائياً بدقة إلى حساب أسواق أسكر'
                    : 'Amount is pre-filled directly to Askar Supermarket'}
                </p>
              </div>

              {/* Mobile Deep Link Shortcut */}
              <button
                type="button"
                onClick={openBenefitPayApp}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-750 text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition"
              >
                <span>{lang === 'ar' ? 'أو افتح تطبيق بنفت بي مباشرة' : 'Open BenefitPay App on this Phone'}</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          ) : (
            /* Direct Fawri+ / Mobile Copy Details */
            <div className="space-y-3">
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-2">
                <p className="text-xs text-slate-300">
                  {lang === 'ar'
                    ? 'أرسل المبلغ عبر فوري+ باستخدام رقم الهاتف أو معرف التاجر:'
                    : 'Send via Fawri+ using our registered Merchant ID or Mobile:'}
                </p>

                {/* Merchant ID Card */}
                <div className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-700 rounded-xl">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Benefit Merchant ID
                    </span>
                    <span className="font-mono font-bold text-white text-sm">
                      {merchantId}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(merchantId, 'mid')}
                    className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 rounded-lg flex items-center gap-1 transition"
                  >
                    {copiedKey === 'mid' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'mid' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                {/* Fawri+ Mobile Card */}
                <div className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-700 rounded-xl">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Fawri+ Mobile Number
                    </span>
                    <span className="font-mono font-bold text-white text-sm">
                      {mobileNumber}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(mobileNumber, 'mobile')}
                    className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 rounded-lg flex items-center gap-1 transition"
                  >
                    {copiedKey === 'mobile' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'mobile' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                {/* Amount to Send */}
                <div className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-700 rounded-xl">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Exact Amount (BHD)
                    </span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {amountStr}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(amountStr, 'amount')}
                    className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 rounded-lg flex items-center gap-1 transition"
                  >
                    {copiedKey === 'amount' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'amount' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Direct App Launch Button */}
              <button
                type="button"
                onClick={openBenefitPayApp}
                className="w-full py-3 px-4 bg-[#DA291C] hover:bg-[#b52216] text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 transition"
              >
                <span>{lang === 'ar' ? 'فتح تطبيق بنفت بي الآن' : 'Launch BenefitPay App'}</span>
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Payment Confirmation Form */}
          {!successResult && (
            <div className="pt-2 border-t border-slate-800 space-y-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-300 block">
                  {lang === 'ar' ? 'رقم مرجع بنفت بي (اختياري)' : 'BenefitPay Reference / Fawri+ No. (Optional)'}
                </label>
                <input
                  type="text"
                  value={referenceInput}
                  onChange={(e) => setReferenceInput(e.target.value)}
                  placeholder="e.g. 10482938"
                  className="w-full py-2 px-3 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-xs focus:border-red-500 outline-none"
                />
              </div>

              {errorMsg && (
                <div className="p-2.5 bg-red-950/60 border border-red-800 rounded-xl text-red-200 text-xs">
                  {errorMsg}
                </div>
              )}

              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={confirming}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {confirming ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{lang === 'ar' ? 'جارٍ التحقق...' : 'Reconciling Settlement...'}</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-200" />
                    <span>{lang === 'ar' ? 'لقد قمت بالدفع - تأكيد السداد' : 'I Have Paid with BenefitPay — Confirm'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer Note */}
        <div className="p-3 bg-slate-950 border-t border-slate-800/80 text-center text-[10px] text-slate-500">
          Official Merchant CR: 200012345678901 • Askar Supermarket, Bahrain
        </div>
      </div>
    </div>
  );
}

