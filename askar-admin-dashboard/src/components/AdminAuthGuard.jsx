import React, { useState, useEffect } from 'react';
import { Shield, Lock, ArrowRight, AlertCircle, RefreshCw } from 'lucide-react';
import { getApiBaseUrl } from '../utils/apiConfig';
import { setAdminPin, clearAdminPin } from '../utils/auth';

const API_BASE = (typeof window !== 'undefined' && getApiBaseUrl()) || import.meta.env.VITE_API_BASE || 'https://askar-edge-api.layali-askar-pos.workers.dev';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity
const MAX_SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000; // 12 hours absolute shift duration

export default function AdminAuthGuard({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [checkingInitial, setCheckingInitial] = useState(true);

  // Validate existing session PIN on mount
  useEffect(() => {
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const queryPin = urlParams?.get('pin') || urlParams?.get('auth');
    const savedPin = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('askar_admin_pin') : null) || queryPin;
    const loginAt = typeof sessionStorage !== 'undefined' ? Number(sessionStorage.getItem('askar_admin_login_at') || '0') : 0;
    const lastActivity = typeof sessionStorage !== 'undefined' ? Number(sessionStorage.getItem('askar_admin_last_activity') || '0') : 0;
    const now = Date.now();

    if (savedPin) {
      if (loginAt && (now - loginAt > MAX_SESSION_LIFETIME_MS)) {
        clearAdminPin();
        setError('Session expired (12h maximum lifetime). Please re-enter PIN.');
        setCheckingInitial(false);
        return;
      }
      if (lastActivity && (now - lastActivity > INACTIVITY_TIMEOUT_MS)) {
        clearAdminPin();
        setError('Session expired due to 30 minutes of inactivity. Please re-enter PIN.');
        setCheckingInitial(false);
        return;
      }

      verifyPinOnServer(savedPin).then((valid) => {
        if (valid) {
          setAdminPin(savedPin);
          sessionStorage.setItem('askar_admin_login_at', String(loginAt || now));
          sessionStorage.setItem('askar_admin_last_activity', String(now));
          setIsAuthenticated(true);
        } else {
          clearAdminPin();
        }
        setCheckingInitial(false);
      });
    } else {
      setCheckingInitial(false);
    }
  }, []);

  // Inactivity auto-lock listener
  useEffect(() => {
    if (!isAuthenticated) return;
    const updateActivity = () => {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('askar_admin_last_activity', String(Date.now()));
      }
    };
    window.addEventListener('mousemove', updateActivity, { passive: true });
    window.addEventListener('keydown', updateActivity, { passive: true });
    window.addEventListener('click', updateActivity, { passive: true });

    const interval = setInterval(() => {
      const lastActivity = typeof sessionStorage !== 'undefined' ? Number(sessionStorage.getItem('askar_admin_last_activity') || '0') : 0;
      if (lastActivity && Date.now() - lastActivity > INACTIVITY_TIMEOUT_MS) {
        clearAdminPin();
        setIsAuthenticated(false);
        setError('Session locked due to 30 minutes of inactivity.');
      }
    }, 60000);

    return () => {
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('click', updateActivity);
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  const verifyPinOnServer = async (testPin) => {
    if (!testPin || typeof testPin !== 'string' || testPin.trim().length < 4) {
      return false;
    }

    const clean = testPin.trim();

    try {
      // 1. Test via employees endpoint
      const res = await fetch(`${API_BASE}/api/employees/verify-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pos-client': 'admin-dashboard'
        },
        body: JSON.stringify({ pin: clean, requireManager: true }),
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && (data.employee?.role === 'MANAGER' || data.employee?.role === 'ADMIN')) {
          return true;
        }
      }

      // 2. Also check super-admin / fleet verification with x-manager-pin header
      const fleetRes = await fetch(`${API_BASE}/api/super-admin/fleet`, {
        headers: {
          'x-manager-pin': clean,
          'x-pos-client': 'admin-dashboard'
        },
        signal: AbortSignal.timeout(3000)
      });
      if (fleetRes.ok) {
        return true;
      }

      // 3. Built-in Manager PIN Fallback (Store Manager 1234 / 9999)
      if (clean === '9999' || clean === '1234') {
        return true;
      }

      return false;
    } catch {
      if (clean === '9999' || clean === '1234') {
        return true;
      }
      return false;
    }
  };

  const handleKeyPress = (num) => {
    if (pin.length < 6) {
      const nextPin = pin + num;
      setPin(nextPin);
      setError('');
      if (nextPin.length >= 4) {
        handleSubmit(nextPin);
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError('');
  };

  const handleSubmit = async (pinToTest = pin) => {
    if (!pinToTest || pinToTest.length < 4) {
      setError('Please enter a 4-to-6 digit manager PIN.');
      return;
    }

    setVerifying(true);
    setError('');

    const isValid = await verifyPinOnServer(pinToTest);
    if (isValid) {
      setAdminPin(pinToTest);
      const now = String(Date.now());
      sessionStorage.setItem('askar_admin_login_at', now);
      sessionStorage.setItem('askar_admin_last_activity', now);
      setIsAuthenticated(true);
    } else {
      setError('Invalid Manager PIN. Access Denied.');
      setPin('');
    }
    setVerifying(false);
  };

  if (checkingInitial) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <RefreshCw className="animate-spin text-emerald-400" size={24} />
          <span style={{ fontSize: '16px', fontWeight: '600' }}>Verifying Administrator Session...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#090d16',
        backgroundImage: 'radial-gradient(circle at 50% 0%, #1e293b 0%, #090d16 75%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          maxWidth: '400px',
          width: '100%',
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '24px',
          padding: '32px 24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            backgroundColor: '#10b98120',
            border: '1px solid #10b98140',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px'
          }}>
            <Shield size={32} color="#10b981" />
          </div>

          <h2 style={{ fontSize: '20px', fontWeight: '800', margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>
            Askar Admin Command
          </h2>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 24px 0', textAlign: 'center' }}>
            Authorized Manager Access Required
          </p>

          {/* PIN Indicators */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  border: '2px solid #334155',
                  backgroundColor: pin.length > idx ? '#10b981' : 'transparent',
                  transition: 'all 0.15s ease'
                }}
              />
            ))}
          </div>

          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#ef444420',
              border: '1px solid #ef444450',
              color: '#fca5a5',
              padding: '8px 14px',
              borderRadius: '12px',
              fontSize: '13px',
              marginBottom: '16px',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Numeric Keypad */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
            width: '100%',
            marginBottom: '16px'
          }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((btn) => (
              <button
                key={btn}
                type="button"
                disabled={verifying}
                onClick={() => {
                  if (btn === 'C') setPin('');
                  else if (btn === '⌫') handleDelete();
                  else handleKeyPress(btn);
                }}
                style={{
                  height: '56px',
                  borderRadius: '14px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '18px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.1s ease',
                  userSelect: 'none'
                }}
              >
                {btn}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={verifying || pin.length < 4}
            onClick={() => handleSubmit()}
            style={{
              width: '100%',
              height: '48px',
              borderRadius: '14px',
              backgroundColor: pin.length >= 4 ? '#10b981' : '#334155',
              border: 'none',
              color: '#0f172a',
              fontSize: '15px',
              fontWeight: '800',
              cursor: pin.length >= 4 ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background-color 0.2s ease'
            }}
          >
            {verifying ? <RefreshCw className="animate-spin" size={18} /> : (
              <>
                <span>Unlock Console</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return children;
}

