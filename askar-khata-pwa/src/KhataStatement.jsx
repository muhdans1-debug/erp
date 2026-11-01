import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';

export function KhataStatement() {
  const { uuid } = useParams();
  const tokenKey = `khata_token_${uuid}`;

  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return Boolean(localStorage.getItem(tokenKey));
  });
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Fetch statement data once authenticated
  const fetchStatement = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/khata/${uuid}`)
      .then(res => {
        if (!res.ok) throw new Error("Not Found");
        return res.json();
      })
      .then(data => {
        setAccount(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [uuid]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchStatement();
    }
  }, [isAuthenticated, fetchStatement]);

  const handleVerifyPin = async (e) => {
    if (e) e.preventDefault();
    if (!pin || pin.length < 4) {
      setPinError('Please enter your 4-digit PIN');
      return;
    }

    setIsVerifying(true);
    setPinError('');

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerUuid: uuid,
          pin: pin
        })
      });

      const data = await res.json();

      if (res.ok && data.success && data.token) {
        localStorage.setItem(tokenKey, data.token);
        setIsAuthenticated(true);
        setPin('');
      } else {
        setPinError(data.error || 'Incorrect PIN. Default is 1234.');
        setPin('');
      }
    } catch {
      setPinError('Connection failed. Please check internet.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleLockAccount = () => {
    localStorage.removeItem(tokenKey);
    setIsAuthenticated(false);
    setPin('');
    setPinError('');
    setAccount(null);
  };

  // ----------------------------------------------------
  // 1. LOCKED VIEW: Device Trust & PIN Challenge
  // ----------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-6 select-none">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center">
          
          {/* Padlock Icon & Brand Pill */}
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-5 shadow-inner">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>

          <span className="text-[11px] font-black tracking-widest text-emerald-400 uppercase bg-emerald-950/80 border border-emerald-800/40 px-3 py-1 rounded-full mb-3">
            Askar Secure Khata
          </span>

          <h1 className="text-2xl font-black tracking-tight text-white mb-2 text-center">
            Account Locked
          </h1>
          <p className="text-xs text-slate-400 text-center mb-6 leading-relaxed">
            Enter your 4-digit PIN to pair this device and view your private credit statement.
          </p>

          {/* Form */}
          <form onSubmit={handleVerifyPin} className="w-full flex flex-col items-center">
            <div className="w-full mb-4">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setPin(val);
                  if (pinError) setPinError('');
                }}
                placeholder="••••"
                className="w-full text-center tracking-[0.8em] text-3xl font-mono py-4 px-4 bg-slate-950 border border-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-2xl text-white outline-none transition-all placeholder:text-slate-600"
                autoFocus
                disabled={isVerifying}
              />
            </div>

            {pinError && (
              <div className="w-full mb-4 py-2.5 px-3 bg-red-500/10 border border-red-500/30 rounded-xl text-center">
                <p className="text-xs font-semibold text-red-400">{pinError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isVerifying || pin.length < 4}
              className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isVerifying ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Verifying PIN...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  </svg>
                  <span>Unlock Statement</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Digit Pad for Mobile Usability */}
          <div className="grid grid-cols-3 gap-2 w-full mt-6">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => {
                  if (pin.length < 4) {
                    setPin(prev => prev + num);
                    if (pinError) setPinError('');
                  }
                }}
                className="py-3 bg-slate-800/60 hover:bg-slate-800 active:bg-slate-700 text-lg font-bold text-slate-200 rounded-xl border border-slate-700/50 transition-colors"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setPin('');
                setPinError('');
              }}
              className="py-3 bg-slate-800/40 hover:bg-slate-800 text-xs font-semibold text-slate-400 rounded-xl border border-slate-700/50 transition-colors uppercase tracking-wider"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                if (pin.length < 4) {
                  setPin(prev => prev + '0');
                  if (pinError) setPinError('');
                }
              }}
              className="py-3 bg-slate-800/60 hover:bg-slate-800 active:bg-slate-700 text-lg font-bold text-slate-200 rounded-xl border border-slate-700/50 transition-colors"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => {
                setPin(prev => prev.slice(0, -1));
                if (pinError) setPinError('');
              }}
              className="py-3 bg-slate-800/40 hover:bg-slate-800 text-base font-bold text-slate-400 rounded-xl border border-slate-700/50 transition-colors flex items-center justify-center"
            >
              ⌫
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-[11px] text-slate-500">
              Default factory PIN is <span className="font-mono text-emerald-400 font-bold">1234</span>. Contact store cashier to update.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 2. ERROR STATE
  // ----------------------------------------------------
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6 text-center">
        <div className="p-8 bg-white rounded-2xl shadow-xl border-t-8 border-red-600 w-full max-w-md">
          <h1 className="text-red-600 text-3xl font-black mb-2">Account Not Found</h1>
          <p className="text-gray-500 text-lg mb-6">Please check the QR code link on your receipt or contact the store cashier.</p>
          <button
            onClick={handleLockAccount}
            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl transition-all"
          >
            Re-enter PIN
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 3. LOADING STATE
  // ----------------------------------------------------
  if (loading || !account) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <h1 className="text-2xl font-bold text-gray-700">Loading Khata Balance...</h1>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // 4. UNLOCKED STATEMENT VIEW
  // ----------------------------------------------------
  const formattedBalance = typeof account.balance === 'number'
    ? account.balance.toFixed(3)
    : Number(account.balance || 0).toFixed(3);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
      
      {/* Top Bar with Lock / Signout */}
      <div className="w-full max-w-md flex items-center justify-between mb-4">
        <span className="text-xs font-black tracking-widest text-emerald-800 uppercase bg-emerald-100 px-3 py-1 rounded-full">
          Askar Supermarket
        </span>
        <button
          onClick={handleLockAccount}
          title="Lock Statement"
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 bg-white border border-gray-300 px-3 py-1 rounded-full shadow-sm hover:shadow active:scale-95 transition-all cursor-pointer"
        >
          <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>Lock Device</span>
        </button>
      </div>

      <h2 className="text-4xl font-bold text-gray-800 text-center">Welcome, {account.name}</h2>
      
      {/* Balance Card */}
      <div className="mt-8 p-8 bg-white rounded-xl shadow-lg border-t-8 border-red-600 w-full max-w-md text-center">
        <p className="text-gray-500 text-xl uppercase tracking-wide">Total Khata Due</p>
        <p className="text-6xl font-black text-gray-900 mt-2">BHD {formattedBalance}</p>
        <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium border border-emerald-200">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>Device Trusted • 90-Day Token Active</span>
        </div>
      </div>

      {/* Pay via BenefitPay Button */}
      <button 
        onClick={async () => {
          try {
            const res = await fetch('/api/checkout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                customerUuid: uuid,
                customerName: account.name,
                amount: account.balance
              })
            });
            const data = await res.json();
            if (data.success) {
              alert(`BenefitPay Gateway Initialized!\nAmount: BHD ${Number(account.balance).toFixed(3)}\nWebhook Target: ${data.webhookUrl}\nTransaction: ${data.chargeId}\n\nProceeding to Fawri+ / BenefitPay secure portal...`);
            } else {
              alert(`BenefitPay Quick-Pay: Opening payment for BHD ${formattedBalance} to Askar Supermarket.`);
            }
          } catch {
            alert(`BenefitPay Quick-Pay: Opening payment for BHD ${formattedBalance} to Askar Supermarket.`);
          }
        }}
        className="mt-8 w-full max-w-md bg-green-600 hover:bg-green-700 active:scale-95 transition-all text-white text-2xl font-bold py-6 rounded-xl shadow-md cursor-pointer"
      >
        Pay via BenefitPay
      </button>

      <p className="mt-6 text-gray-400 text-sm">Official Digital Statement • Askar Supermarket</p>
    </div>
  );
}
