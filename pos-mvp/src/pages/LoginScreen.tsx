import { useState, useEffect } from 'react';
import { Lock, Delete, Settings, Wifi, CheckCircle2, AlertCircle } from 'lucide-react';
import { getServerIp, setServerIp, getApiBaseUrl, DEFAULT_EDGE_API_URL } from '../utils/apiConfig';
import { setManagerSessionPin, hashPinSha256 } from '../utils/authUtils';

function mergeCachedEmployees(newEmployees: any[]) {
  try {
    const raw = localStorage.getItem('askar_cached_employees');
    const existing: any[] = raw ? JSON.parse(raw) : [];
    const merged = newEmployees.map((ne: any) => {
      const match = existing.find((ex: any) => ex.id === ne.id);
      return {
        id: ne.id,
        name: ne.name,
        role: ne.role,
        pin_hash: match?.pin_hash,
        is_active: ne.is_active ?? 1
      };
    });
    localStorage.setItem('askar_cached_employees', JSON.stringify(merged));
  } catch {}
}

interface LoginScreenProps {
  onLogin: (role: 'CASHIER' | 'MANAGER', employee?: { id: string; name: string; pin?: string }) => void;
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
      if (target.includes('.workers.dev') || target.includes('.app') || target.includes('.com') || target.includes('.dev') || target.includes('.net')) {
        target = `https://${target}`;
      } else {
        target = `http://${target}`;
      }
    }
    const isDomain = target.includes('.workers.dev') || target.includes('.app') || target.includes('.com') || target.includes('.dev') || target.includes('.net');
    const isHttps = target.startsWith('https://');
    if (!isDomain && !isHttps && !target.includes(':', 7)) {
      target = `${target}:3000`;
    }
    target = target.replace(/\/$/, '');

    try {
      const res = await fetch(`${target}/api/sync/status`, { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        setTestResult({ success: true, message: `Connected to Gateway at ${target}!` });
      } else {
        const healthRes = await fetch(`${target}/api/health`, { signal: AbortSignal.timeout(2500) });
        if (healthRes.ok) {
          setTestResult({ success: true, message: `Connected to Gateway at ${target}!` });
        } else {
          setTestResult({ success: false, message: `Server replied with status ${res.status}` });
        }
      }
    } catch {
      setTestResult({ success: false, message: `Cannot reach ${target}. Check Wi-Fi or Internet.` });
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
          mergeCachedEmployees(d.employees);
        }
      })
      .catch(() => {});
  };

  const getCandidateBases = () => {
    return [
      getApiBaseUrl(),
      DEFAULT_EDGE_API_URL
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
              mergeCachedEmployees(data.employees);
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
            // Update cached employees with hashed PIN (never plaintext)
            try {
              const hashedPin = await hashPinSha256(cleanPin);
              const raw = localStorage.getItem('askar_cached_employees');
              const list: any[] = raw ? JSON.parse(raw) : [];
              const safeEmployee = {
                id: data.employee.id,
                name: data.employee.name,
                role: data.employee.role,
                pin_hash: hashedPin,
                is_active: data.employee.is_active ?? 1
              };
              const idx = list.findIndex((e: any) => e.id === data.employee.id);
              if (idx >= 0) {
                list[idx] = safeEmployee;
              } else {
                list.push(safeEmployee);
              }
              localStorage.setItem('askar_cached_employees', JSON.stringify(list));
            } catch {}

            // Save working server URL if valid
            if (base && !base.includes('localhost')) {
              localStorage.setItem('master_server_url', base);
            }

            if (data.employee.role === 'MANAGER') {
              setManagerSessionPin(cleanPin);
            }

            onLogin(data.employee.role === 'MANAGER' ? 'MANAGER' : 'CASHIER', {
              id: data.employee.id,
              name: data.employee.name,
              pin: cleanPin
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

    // 2. Offline fallback: check cached employee PIN hashes in localStorage
    try {
      const hashedInput = await hashPinSha256(cleanPin);
      const raw = localStorage.getItem('askar_cached_employees');
      if (raw) {
        const list: any[] = JSON.parse(raw);
        const match = list.find((e: any) => 
          (e.pin_hash === hashedInput || e.pin_code === hashedInput) && 
          (e.is_active === 1 || e.is_active === true || e.is_active === undefined)
        );
        if (match) {
          if (match.role === 'MANAGER') {
            setManagerSessionPin(cleanPin);
          }
          onLogin(match.role === 'MANAGER' ? 'MANAGER' : 'CASHIER', {
            id: match.id,
            name: match.name,
            pin: cleanPin
          });
          setIsVerifying(false);
          return;
        }
      }
    } catch {}

    setError('Invalid PIN code or device offline without cached credentials.');
    setPin('');
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

  // Physical laptop keyboard listener (Digits 0-9, Backspace, Enter)
  useEffect(() => {
    const handlePhysicalKeyDown = (e: KeyboardEvent) => {
      if (showServerModal) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (pin.length === 4) {
          handleLogin(pin);
        }
      }
    };

    window.addEventListener('keydown', handlePhysicalKeyDown);
    return () => window.removeEventListener('keydown', handlePhysicalKeyDown);
  }, [pin, showServerModal]);

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
          Layali Supermarket
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

          <button
            type="button"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set('view', 'tap');
              window.location.href = url.toString();
            }}
            style={{
              marginTop: '4px',
              padding: '6px 14px',
              borderRadius: '20px',
              border: '1px solid #c7d2fe',
              backgroundColor: '#eef2ff',
              color: '#3730a3',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            📱 iPhone 16 Pro Tap Pad & Scanner
          </button>

          <button
            type="button"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set('view', 'statement');
              window.location.href = url.toString();
            }}
            style={{
              marginTop: '8px',
              padding: '10px 18px',
              borderRadius: '20px',
              border: '1.5px solid #10b981',
              backgroundColor: '#ecfdf5',
              color: '#065f46',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
            }}
          >
            👤 Customer Khata & Instant Alerts Portal 🔔
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

            <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: '#64748b', lineHeight: '1.4' }}>
              Connect directly to <strong>Sovereign Cloud</strong> (runs 24/7 without laptop) or enter your Store Laptop IP.
            </p>

            {/* Quick 1-Tap Presets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              <button
                type="button"
                onClick={() => {
                  setInputIp('https://askar-edge-api.layali-askar-pos.workers.dev');
                  setTestResult(null);
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #0284c7',
                  backgroundColor: '#f0f9ff',
                  color: '#0369a1',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 2px 6px rgba(2, 132, 199, 0.15)'
                }}
              >
                <span>☁️ Sovereign Cloud (No Laptop Required)</span>
                <span style={{ fontSize: '11px', backgroundColor: '#e0f2fe', padding: '2px 8px', borderRadius: '6px' }}>Recommended</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInputIp('http://192.168.8.7:3000');
                  setTestResult(null);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  color: '#475569',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <span>💻 Store Laptop Wi-Fi LAN (:3000)</span>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>192.168.8.7</span>
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Server URL or IP:
              </label>
              <input
                type="text"
                value={inputIp}
                onChange={(e) => setInputIp(e.target.value)}
                placeholder="https://askar-edge-api.layali-askar-pos.workers.dev"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  boxSizing: 'border-box'
                }}
              />
              <span style={{ display: 'block', marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>
                Cloud Gateway works worldwide 24/7 without needing the laptop turned on.
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
