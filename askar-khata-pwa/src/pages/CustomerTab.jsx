import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

export default function CustomerTab() {
  const { customerId } = useParams();
  const [searchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [successBanner, setSuccessBanner] = useState(
    statusParam === 'complete' || statusParam === 'success' || statusParam === 'mock_demo_success'
  );

  useEffect(() => {
    const fetchLedger = async () => {
      try {
        setLoading(true);
        setError('');

        // Pass saved PIN in header if device was previously authenticated
        const savedPin = localStorage.getItem(`khata_pin_${customerId}`) || '';
        const headers = {
          'Content-Type': 'application/json',
          ...(savedPin ? { 'x-khata-pin': savedPin } : {})
        };

        let data = null;
        let lastErrorMsg = '';

        const candidateEndpoints = [
          `/api/customers/${encodeURIComponent(customerId)}/tab`,
          `/api/khata/${encodeURIComponent(customerId)}/tab`,
          `/api/khata/${encodeURIComponent(customerId)}`,
          `/api/tab/${encodeURIComponent(customerId)}`
        ];

        for (const ep of candidateEndpoints) {
          try {
            const res = await fetch(ep, { headers });
            if (res.ok) {
              const json = await res.json();
              if (json && (json.balance !== undefined || json.name)) {
                data = json;
                break;
              }
            } else {
              const errBody = await res.json().catch(() => ({}));
              if (errBody && errBody.message) {
                lastErrorMsg = errBody.message;
              }
            }
          } catch (e) {
            // continue fallback
          }
        }

        if (!data) {
          throw new Error(lastErrorMsg || 'Customer Khata record not found or server is unreachable.');
        }

        setLedger({
          id: data.id || customerId,
          name: data.name || 'Valued Customer',
          balance: Number(data.balance ?? data.currentBalance ?? 0),
          credit_limit: Number(data.credit_limit ?? data.creditLimit ?? 30.0)
        });
      } catch (err) {
        setError(err.message || 'Could not load ledger');
      } finally {
        setLoading(false);
      }
    };

    if (customerId) {
      fetchLedger();
    }
  }, [customerId]);

  const handlePay = async () => {
    if (!ledger || ledger.balance <= 0) return;
    try {
      setPaying(true);
      const initRes = await fetch('/api/checkout/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customerId,
          amount: ledger.balance,
          customerName: ledger.name
        })
      });

      const data = await initRes.json();
      if (!initRes.ok || data.error) {
        throw new Error(data.error || 'Payment initialization failed');
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error('No checkout URL returned from payment gateway');
      }
    } catch (err) {
      alert(`Payment failed to start: ${err.message}`);
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Loading Khata Ledger...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            !
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Account Not Found</h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <a href="/" className="text-emerald-600 font-semibold underline">
            Return to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-8 md:pt-16 px-4 pb-12">
      {/* Brand Header */}
      <div className="w-full max-w-md mb-4 flex items-center justify-between px-2">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-gray-900">ASKAR SUPERMARKET</h2>
          <p className="text-xs text-gray-400">Official Customer Khata Portal</p>
        </div>
        <div className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
          LIVE LEDGER
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8 w-full max-w-md text-center">
        {successBanner && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-sm font-semibold flex items-center gap-2 justify-center">
            <span>🎉</span>
            <span>Payment received! Your ledger is updating.</span>
          </div>
        )}

        <h1 className="text-2xl font-black text-gray-800 tracking-tight">
          {ledger.name}&apos;s Khata Tab
        </h1>
        <p className="text-xs text-gray-400 mt-1 font-mono">ID: {ledger.id}</p>

        <div className="my-8 py-6 px-4 bg-gray-50 rounded-2xl border border-gray-100">
          <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">
            Outstanding Balance Owed
          </p>
          <p className="text-5xl font-black text-red-600 my-2 tracking-tight">
            BHD {ledger.balance.toFixed(3)}
          </p>
          <p className="text-xs text-gray-400 font-medium">
            Credit Limit: BHD {ledger.credit_limit.toFixed(3)}
          </p>
        </div>

        {ledger.balance > 0 ? (
          <button
            onClick={handlePay}
            disabled={paying}
            className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60 text-white font-bold py-4 px-6 rounded-2xl text-lg shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {paying ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Connecting to Gateway...</span>
              </>
            ) : (
              <>
                <span>Settle via BenefitPay</span>
                <span className="text-emerald-200">→</span>
              </>
            )}
          </button>
        ) : (
          <div className="w-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold py-4 rounded-2xl text-lg flex items-center justify-center gap-2">
            <span>✅</span>
            <span>All Settled Up — No Debt Owed</span>
          </div>
        )}

        <div className="mt-4 pt-3 text-center">
          <a
            href={`/statement/${encodeURIComponent(ledger.id || customerId)}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3.5 py-2 rounded-xl transition"
          >
            <span>🔒</span>
            <span>View Full Itemized Statement (PIN Protected)</span>
          </a>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <span>Secured by BenefitPay & Fawri+</span>
          <span>100% Verified</span>
        </div>
      </div>
    </div>
  );
}

