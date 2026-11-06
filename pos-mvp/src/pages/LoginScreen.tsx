import { useState, useEffect } from 'react';
import { Lock, Delete, Settings, Wifi, CheckCircle2, AlertCircle } from 'lucide-react';
import { getServerIp, setServerIp } from '../utils/apiConfig';

// 1. Native Web Crypto Hashing Function
async function generateSha256(pin: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 2. Secure Fallback Hashes (Replacing plaintext PINs)
const EMERGENCY_HASHES = {
  CASHIER: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', // SHA-256 for 1234
  MANAGER: '888df25ae35772424a560c7152a1de794440e0ea5cfee62828333a456a506e05',  // SHA-256 for 9999
  MANAGER_ALT: 'b96e95af961ddca691bf0571fc069a5aee6dc08bb435520e5c94200676dc4ff0', // Emergency Admin Hash
  ANAS: 'edee29f882543b956620b26d0ee0e7e950399b1c4222f5de05e06425b4c995e9'       // SHA-256 for 2222
};

interface LoginScreenProps {
  onLogin: (role: 'CASHIER' | 'MANAGER', employee?: { id: string; name: string }) => void;
  apiBase?: string;
}

export default function LoginScreen({ onLogin, apiBase = 'http://localhost:3000' }: LoginScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [_isVerifying, setIsVerifying] = useState(false);
  const [showServerModal, setShowServerModal] = useState(false);
  const [inputIp, setInputIp] = useState(() => getServerIp());
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    let target = (inputIp || '').trim();
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = `http://${target}`;
    }
    if (!target.includes(':', 7)) {
      target = `${target}:3000`;
    }
    try {
      const res = await fetch(`${target}/api/sync/status`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        setTestResult({ success: true, message: `Connected to Laptop Hub at ${target}!` });
      } else {
        setTestResult({ success: false, message: `Server replied with status ${res.status}` });
      }
    } catch {
      setTestResult({ success: false, message: `Cannot reach ${target}. Check Wi-Fi & Firewall.` });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveServerIp = () => {
    const saved = setServerIp(inputIp);
    setShowServerModal(false);
    setTestResult(null);
    // Reload employees from new server URL
    fetch(`${saved}/api/employees?t=${Date.now()}`)
      .then(r => r.json())
      .then(d => {
        if (d && d.success && Array.isArray(d.employees)) {
          localStorage.setItem('askar_cached_employees', JSON.stringify(d.employees));
        }
      })
      .catch(() => {});
  };

  const getCandidateBases = () => {
    const host = typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost';
    const custom = typeof window !== 'undefined' ? localStorage.getItem('master_server_url') : null;
    return [
      custom,
      apiBase,
      'http://192.168.8.7:3000',
      'http://askar-master.local:3000',
      `http://${host}:3000`,
      'http://localhost:3000',
      'http://192.168.88.10:3000'
    ].filter((v, i, a) => Boolean(v) && !v?.includes('192.168.8.20') && a.indexOf(v) === i) as string[];
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

    // 3. Built-in hardcoded fallback for emergency resilience (Secured with native Web Crypto SHA-256)
    console.warn("API unreachable & cache miss. Attempting offline fallback auth.");
    const hashedInput = await generateSha256(cleanPin);

    if (hashedInput === EMERGENCY_HASHES.MANAGER || hashedInput === EMERGENCY_HASHES.MANAGER_ALT) {
      onLogin('MANAGER', { id: 'emp_manager_1', name: 'Emergency Admin' });
    } else if (hashedInput === EMERGENCY_HASHES.CASHIER) {
      onLogin('CASHIER', { id: 'emp_cashier_1', name: 'Emergency Cashier' });
    } else if (hashedInput === EMERGENCY_HASHES.ANAS) {
      onLogin('CASHIER', { id: 'emp_db0efa57', name: 'anas' });
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
          boxSizing: 'border-box',
          position: 'relative'
        }}
      >
        {/* Server IP Setup Button */}
        <button
          type="button"
          onClick={() => {
            setInputIp(getServerIp());
            setTestResult(null);
            setShowServerModal(true);
          }}
          title="Configure Server IP"
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            backgroundColor: '#f1f5f9',
            border: 'none',
            borderRadius: '12px',
            padding: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#64748b'
          }}
        >
          <Settings size={20} />
        </button>
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
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            fontWeight: '600',
            color: '#94a3b8'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Staff PIN: <strong style={{ color: '#10b981' }}>1234, 2222 (anas)</strong></span>
          </div>

          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem('f100_default_mode', 'true');
              } catch {}
              const url = new URL(window.location.href);
              url.searchParams.set('view', 'f100');
              window.location.href = url.toString();
            }}
            style={{
              marginTop: '4px',
              padding: '6px 14px',
              borderRadius: '20px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#f1f5f9',
              color: '#1e3a8a',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            📦 Open Feitian F100 PIM Intake Mode
          </button>
        </div>
      </div>

      {/* Dynamic Server IP Configuration Modal */}
      {showServerModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              padding: '24px',
              width: '400px',
              maxWidth: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wifi size={22} color="#2563eb" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  Server IP Configuration
                </h3>
              </div>
              <button
                onClick={() => setShowServerModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748b', lineHeight: '1.4' }}>
              Enter the static IP address of the Supermarket Laptop (Store Hub) on your Wi-Fi router.
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Laptop Static IP or Hostname:
              </label>
              <input
                type="text"
                value={inputIp}
                onChange={(e) => setInputIp(e.target.value)}
                placeholder="e.g. 192.168.1.100 or 192.168.8.7"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '15px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  boxSizing: 'border-box'
                }}
              />
              <span style={{ display: 'block', marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>
                Default port 3000 will be used automatically.
              </span>
            </div>

            {testResult && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: testResult.success ? '#ecfdf5' : '#fef2f2',
                  color: testResult.success ? '#065f46' : '#991b1b',
                  border: `1px solid ${testResult.success ? '#a7f3d0' : '#fecaca'}`
                }}
              >
                {testResult.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <span>{testResult.message}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                style={{
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  color: '#334155',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                type="button"
                onClick={handleSaveServerIp}
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Save & Connect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
