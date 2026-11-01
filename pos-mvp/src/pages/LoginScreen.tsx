import { useState, useEffect } from 'react';
import { Lock, Delete } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (role: 'CASHIER' | 'MANAGER', employee?: { id: string; name: string }) => void;
  apiBase?: string;
}

export default function LoginScreen({ onLogin, apiBase = 'http://localhost:3000' }: LoginScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [_isVerifying, setIsVerifying] = useState(false);

  const getCandidateBases = () => {
    const isNative = typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.());
    const host = typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost';
    const custom = typeof window !== 'undefined' ? localStorage.getItem('master_server_url') : null;
    return [
      custom,
      apiBase,
      isNative ? 'http://192.168.8.7:3000' : null,
      'http://192.168.8.7:3000',
      'http://192.168.88.10:3000',
      `http://${host}:3000`,
      'http://localhost:3000'
    ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i) as string[];
  };

  // Pre-sync employee directory in background so any cashier can log in offline
  useEffect(() => {
    const bases = getCandidateBases();
    let isCancelled = false;

    (async () => {
      for (const base of bases) {
        if (isCancelled) break;
        try {
          const res = await fetch(`${base}/api/employees?t=${Date.now()}`, { signal: AbortSignal.timeout(2000) });
          if (res.ok) {
            const data = await res.json();
            if (data && data.success && Array.isArray(data.employees)) {
              localStorage.setItem('askar_cached_employees', JSON.stringify(data.employees));
              break;
            }
          }
        } catch {}
      }
    })();

    return () => { isCancelled = true; };
  }, [apiBase]);

  // Dynamic Employee PIN authentication with multi-endpoint fallback & offline cache
  const handleLogin = async (enteredPin: string) => {
    setIsVerifying(true);
    setError('');
    const cleanPin = String(enteredPin).trim();
    const candidateBases = getCandidateBases();
    let verified = false;

    // 1. Try online verification across candidate endpoints
    for (const base of candidateBases) {
      try {
        const res = await fetch(`${base}/api/employees/verify-pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: cleanPin }),
          signal: AbortSignal.timeout(2000)
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.success && data.employee) {
            // Update cached employees
            try {
              const raw = localStorage.getItem('askar_cached_employees');
              const list: any[] = raw ? JSON.parse(raw) : [];
              const idx = list.findIndex((e: any) => e.id === data.employee.id);
              if (idx >= 0) {
                list[idx] = { ...list[idx], ...data.employee, pin_code: cleanPin };
              } else {
                list.push({ ...data.employee, pin_code: cleanPin });
              }
              localStorage.setItem('askar_cached_employees', JSON.stringify(list));
            } catch {}

            // Save working server URL if valid
            if (base && !base.includes('localhost')) {
              localStorage.setItem('master_server_url', base);
            }

            onLogin(data.employee.role === 'MANAGER' ? 'MANAGER' : 'CASHIER', {
              id: data.employee.id,
              name: data.employee.name
            });
            verified = true;
            break;
          } else if (data && data.error && !data.error.includes('Failed')) {
            setError(data.error);
            setPin('');
            verified = true;
            break;
          }
        }
      } catch {}
    }

    if (verified) {
      setIsVerifying(false);
      return;
    }

    // 2. Offline fallback: check cached employees in localStorage
    try {
      const raw = localStorage.getItem('askar_cached_employees');
      if (raw) {
        const list: any[] = JSON.parse(raw);
        const match = list.find((e: any) => String(e.pin_code).trim() === cleanPin && (e.is_active === 1 || e.is_active === true || e.is_active === undefined));
        if (match) {
          onLogin(match.role === 'MANAGER' ? 'MANAGER' : 'CASHIER', { id: match.id, name: match.name });
          setIsVerifying(false);
          return;
        }
      }
    } catch {}

    // 3. Built-in hardcoded fallback for emergency resilience
    if (cleanPin === '1234') {
      onLogin('CASHIER', { id: 'emp_cashier_1', name: 'Cashier 1' });
    } else if (cleanPin === '2222') {
      onLogin('CASHIER', { id: 'emp_db0efa57', name: 'anas' });
    } else if (cleanPin === '9999') {
      onLogin('MANAGER', { id: 'emp_manager_1', name: 'Store Manager' });
    } else {
      setError('Invalid PIN code. Access denied.');
      setPin('');
    }

    setIsVerifying(false);
  };

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      setError('');
      if (newPin.length === 4) {
        handleLogin(newPin);
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError('');
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#0f172a',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        padding: '16px',
        boxSizing: 'border-box'
      }}
    >
      <div
        style={{
          width: '380px',
          maxWidth: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          padding: '28px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxSizing: 'border-box'
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            backgroundColor: '#f1f5f9',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '12px'
          }}
        >
          <Lock size={32} color="#0f172a" />
        </div>

        <h1
          style={{
            fontSize: '24px',
            fontWeight: '900',
            color: '#0f172a',
            margin: '0 0 4px 0',
            textAlign: 'center',
            letterSpacing: '-0.5px'
          }}
        >
          Askar Supermarket
        </h1>
        <p
          style={{
            fontSize: '13px',
            fontWeight: '600',
            color: '#64748b',
            margin: '0 0 20px 0'
          }}
        >
          Enter your 4-digit PIN to unlock
        </p>

        {/* PIN Indicators */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            marginBottom: '16px'
          }}
        >
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                backgroundColor: index < pin.length ? '#10b981' : '#e2e8f0',
                transition: 'background-color 0.15s ease, transform 0.15s ease',
                transform: index < pin.length ? 'scale(1.15)' : 'scale(1)',
                boxShadow: index < pin.length ? '0 0 8px rgba(16, 185, 129, 0.5)' : 'none'
              }}
            />
          ))}
        </div>

        {error ? (
          <p
            style={{
              color: '#ef4444',
              fontWeight: '700',
              fontSize: '13px',
              margin: '0 0 12px 0'
            }}
          >
            {error}
          </p>
        ) : (
          <div style={{ height: '17px', marginBottom: '12px' }} />
        )}

        {/* Numpad */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleKeyPress(num.toString())}
              style={{
                height: '66px',
                fontSize: '26px',
                fontWeight: '900',
                backgroundColor: '#f8fafc',
                color: '#1e293b',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                touchAction: 'manipulation'
              }}
              className="btn-touch"
            >
              {num}
            </button>
          ))}
          <div /> {/* Alignment Spacer */}
          <button
            onClick={() => handleKeyPress('0')}
            style={{
              height: '66px',
              fontSize: '26px',
              fontWeight: '900',
              backgroundColor: '#f8fafc',
              color: '#1e293b',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              touchAction: 'manipulation'
            }}
            className="btn-touch"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            style={{
              height: '66px',
              backgroundColor: '#fef2f2',
              color: '#ef4444',
              borderRadius: '16px',
              border: '1px solid #fee2e2',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              touchAction: 'manipulation'
            }}
            className="btn-touch"
            title="Delete digit"
          >
            <Delete size={26} color="#ef4444" />
          </button>
        </div>

        <div
          style={{
            marginTop: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            fontSize: '12px',
            fontWeight: '600',
            color: '#94a3b8'
          }}
        >
          <span>Staff PIN: <strong style={{ color: '#10b981' }}>1234, 2222 (anas)</strong></span>
          <span>•</span>
          <span>Manager Hub: <strong style={{ color: '#64748b' }}>Port 5175</strong></span>
        </div>
      </div>
    </div>
  );
}
