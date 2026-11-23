import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  KeyRound,
  Fingerprint,
  Search,
  Eye,
  FileText,
  Copy,
  Check,
  RefreshCw,
  LogOut,
  Users,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Snowflake
} from 'lucide-react';
import {
  isPhoneLockAvailable,
  registerPhoneLock,
  verifyPhoneLock
} from '../utils/phoneLockAuth';

export default function DevPortal() {
  const navigate = useNavigate();

  // Authentication State
  const [token, setToken] = useState(() => {
    try {
      return sessionStorage.getItem('khata_dev_jwt') || '';
    } catch {
      return '';
    }
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Biometric State
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [isBioEnrolled, setIsBioEnrolled] = useState(() => {
    try {
      return localStorage.getItem('khata_dev_bio_enrolled') === 'true';
    } catch {
      return false;
    }
  });
  const [enrollingBio, setEnrollingBio] = useState(false);
  const [bioSuccessMsg, setBioSuccessMsg] = useState('');

  // Data & KPI State
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState('ALL'); // 'ALL' | 'DEBT' | 'CREDIT' | 'FROZEN' | 'MESS'
  const [sortBy, setSortBy] = useState('DEBT_DESC'); // 'DEBT_DESC' | 'NAME_ASC' | 'RECENT'
  const [copiedId, setCopiedId] = useState('');
  const [togglingFreezeId, setTogglingFreezeId] = useState('');

  // Check biometric availability on mount
  useEffect(() => {
    isPhoneLockAvailable().then((avail) => setHasBiometrics(avail)).catch(() => {});
  }, []);

  // Fetch all customers when authenticated
  const loadCustomers = useCallback(async (authToken = token) => {
    if (!authToken) return;
    setDataLoading(true);
    setDataError('');
    try {
      const res = await fetch('/api/dev/customers', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.status === 401 || res.status === 403) {
        // Token expired
        sessionStorage.removeItem('khata_dev_jwt');
        setToken('');
        setDataError('Developer session expired. Please re-authenticate.');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setCustomers(data.customers || []);
        setStats(data.stats || null);
      } else {
        setDataError(data.error || 'Failed to load customer directory');
      }
    } catch (err) {
      setDataError(err.message || 'Network error fetching developer roster');
    } finally {
      setDataLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      loadCustomers(token);
    }
  }, [token, loadCustomers]);

  // Handle Password Login
  const handlePasswordLogin = async (e) => {
    e?.preventDefault();
    if (!passwordInput.trim()) return;
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/dev/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success && data.token) {
        sessionStorage.setItem('khata_dev_jwt', data.token);
        setToken(data.token);
        setPasswordInput('');
      } else {
        setAuthError(data.error || 'Invalid developer credentials');
      }
    } catch (err) {
      setAuthError(err.message || 'Authentication request failed');
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Biometric Login
  const handleBiometricLogin = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const bioVerify = await verifyPhoneLock('dev_master_admin');
      if (bioVerify.success) {
        const bioToken = localStorage.getItem('khata_dev_bio_token') || '';
        const res = await fetch('/api/dev/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ biometricToken: bioToken, password: 'Anasanas1!' })
        });
        const data = await res.json();
        if (res.ok && data.success && data.token) {
          sessionStorage.setItem('khata_dev_jwt', data.token);
          setToken(data.token);
        } else {
          setAuthError(data.error || 'Biometric verification failed on server');
        }
      } else {
        if (bioVerify.needsReenroll) {
          setIsBioEnrolled(false);
          try {
            localStorage.removeItem('khata_dev_bio_enrolled');
            localStorage.removeItem('khata_phone_lock_dev_master_admin');
            localStorage.removeItem('khata_phone_lock_raw_dev_master_admin');
          } catch {}
          setAuthError('Biometrics need to be refreshed. Please enter password "Anasanas1!" and tap "Enroll Phone Biometrics".');
        } else {
          setAuthError(bioVerify.error || 'Biometric recognition cancelled');
        }
      }
    } catch (err) {
      setAuthError(err.message || 'Biometric login error');
    } finally {
      setAuthLoading(false);
    }
  };

  // Enroll Phone Biometrics for 1-Touch Login
  const handleEnrollBiometrics = async () => {
    setEnrollingBio(true);
    setBioSuccessMsg('');
    try {
      const reg = await registerPhoneLock('dev_master_admin', 'Lead Developer');
      if (reg.success) {
        localStorage.setItem('khata_dev_bio_enrolled', 'true');
        if (token) {
          localStorage.setItem('khata_dev_bio_token', token);
        }
        setIsBioEnrolled(true);
        setBioSuccessMsg('Phone biometrics enrolled! You can now unlock with 1 touch.');
        setTimeout(() => setBioSuccessMsg(''), 5000);
      } else {
        alert(reg.error || 'Biometric enrollment failed');
      }
    } catch (err) {
      alert(err.message || 'Enrollment failed');
    } finally {
      setEnrollingBio(false);
    }
  };

  // Lock & Exit Dev Session
  const handleLockAndExit = () => {
    try {
      sessionStorage.removeItem('khata_dev_jwt');
    } catch {}
    setToken('');
    setCustomers([]);
    setStats(null);
    navigate('/');
  };

  // Toggle Account Freeze
  const handleToggleFreeze = async (cust) => {
    const nextFreeze = cust.is_active !== 0;
    const confirmMsg = nextFreeze
      ? `Freeze Khata account for ${cust.name}? Credit purchases will be blocked immediately.`
      : `Unfreeze Khata account for ${cust.name}?`;
    if (!window.confirm(confirmMsg)) return;

    setTogglingFreezeId(cust.id);
    try {
      const res = await fetch(`/api/dev/customer/${encodeURIComponent(cust.id)}/freeze`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ freeze: nextFreeze })
      });
      const data = await res.json();
      if (data.success) {
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === cust.id
              ? { ...c, is_active: data.is_active, isActive: Boolean(data.is_active) }
              : c
          )
        );
      } else {
        alert(data.error || 'Failed to update account freeze status');
      }
    } catch (err) {
      alert('Error updating account freeze state: ' + err.message);
    } finally {
      setTogglingFreezeId('');
    }
  };

  // Copy Deep Link
  const handleCopyLink = (cust) => {
    const url = `${window.location.origin}/tab/${encodeURIComponent(cust.id)}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(cust.id);
      setTimeout(() => setCopiedId(''), 2500);
    }).catch(() => {});
  };

  // Filter & Sort Logic
  const filteredCustomers = useMemo(() => {
    let result = [...customers];
    const q = searchQuery.toLowerCase().trim();

    if (q) {
      result = result.filter(
        (c) =>
          (c.name && c.name.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q)) ||
          (c.cpr && c.cpr.includes(q)) ||
          (c.cardUid && c.cardUid.toLowerCase().includes(q)) ||
          (c.id && c.id.toLowerCase().includes(q))
      );
    }

    if (filterTab === 'DEBT') {
      result = result.filter((c) => Number(c.balance || 0) > 0.0005);
    } else if (filterTab === 'CREDIT') {
      result = result.filter((c) => Number(c.balance || 0) < -0.0005);
    } else if (filterTab === 'FROZEN') {
      result = result.filter((c) => c.is_active === 0);
    } else if (filterTab === 'MESS') {
      result = result.filter((c) => Array.isArray(c.messes) && c.messes.length > 0);
    }

    if (sortBy === 'DEBT_DESC') {
      result.sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0));
    } else if (sortBy === 'NAME_ASC') {
      result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortBy === 'RECENT') {
      result.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    return result;
  }, [customers, searchQuery, filterTab, sortBy]);

  // ==================== VIEW 1: GATEWAY (LOCKED) ====================
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 selection:bg-violet-600 selection:text-white">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden text-center">
          <div className="absolute top-0 right-0 w-40 h-40 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

          {/* Gateway Icon */}
          <div className="w-16 h-16 bg-violet-500/15 border border-violet-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-violet-400">
            <Lock className="w-8 h-8" />
          </div>

          <span className="text-[10px] font-mono tracking-widest uppercase px-3 py-1 rounded-full bg-violet-500/20 text-violet-300 font-bold border border-violet-500/30">
            Developer Gateway
          </span>

          <h1 className="text-xl font-black text-white mt-3 mb-1 tracking-tight">
            Restricted System Access
          </h1>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Authorized developer console for Layali Khata PWA ledger operations.
          </p>

          {/* Biometric 1-Touch Button (if enrolled) */}
          {hasBiometrics && isBioEnrolled && (
            <div className="mb-4">
              <button
                type="button"
                onClick={handleBiometricLogin}
                disabled={authLoading}
                className="w-full min-h-[50px] py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white font-bold rounded-2xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/50"
              >
                <Fingerprint className="w-5 h-5 text-white" />
                <span>Unlock with Phone Biometrics</span>
              </button>
              <div className="relative my-4 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800" />
                </div>
                <span className="relative px-3 bg-slate-900 text-[10px] font-mono text-slate-500 uppercase">
                  Or Master Passkey
                </span>
              </div>
            </div>
          )}

          {/* Password Form */}
          <form onSubmit={handlePasswordLogin} className="space-y-3 text-left">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  if (authError) setAuthError('');
                }}
                placeholder="Developer Master Password"
                className="w-full py-3.5 pl-11 pr-11 bg-slate-950 border border-slate-800 rounded-2xl text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono"
                autoFocus
              />
              <KeyRound className="w-4 h-4 text-slate-500 absolute top-1/2 -translate-y-1/2 left-4 pointer-events-none" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute top-1/2 -translate-y-1/2 right-3.5 text-slate-400 hover:text-white p-1 text-xs"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            {authError && (
              <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-semibold text-center">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading || !passwordInput.trim()}
              className="w-full min-h-[46px] py-3 bg-violet-600 hover:bg-violet-500 active:scale-95 disabled:opacity-40 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-violet-950/60"
            >
              {authLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>Authenticate Console</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800/60 text-center">
            <p className="text-[10px] text-slate-500 font-mono">
              Protected by progressive IP lockout (5 strikes = 30m freeze).
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ==================== VIEW 2: DEVELOPER CONSOLE (AUTHENTICATED) ====================
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center p-3 sm:p-5 pt-safe pb-safe selection:bg-violet-600 selection:text-white font-sans">
      {/* Top Console Bar */}
      <header className="w-full max-w-4xl flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400 font-mono font-bold text-xs">
            DEV
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-sm text-white tracking-tight">LAYALI KHATA</span>
              <span className="text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30 font-mono font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                CONSOLE
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">Super-Developer Session Active</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasBiometrics && (
            <button
              type="button"
              onClick={handleEnrollBiometrics}
              disabled={enrollingBio}
              className={`h-9 px-3 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                isBioEnrolled
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                  : 'bg-violet-600/20 border-violet-500/40 text-violet-300 hover:bg-violet-600/30'
              }`}
              title="Bind Phone Fingerprint for 1-Touch Dev Login"
            >
              <Fingerprint className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {enrollingBio ? 'Enrolling...' : isBioEnrolled ? 'Biometrics Active' : 'Enroll Fingerprint'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => loadCustomers()}
            disabled={dataLoading}
            className="w-9 h-9 bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800 rounded-xl flex items-center justify-center text-slate-300 transition cursor-pointer"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-4 h-4 ${dataLoading ? 'animate-spin text-violet-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleLockAndExit}
            className="h-9 px-3 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            title="Wipe Token and Lock Portal"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lock & Exit</span>
          </button>
        </div>
      </header>

      {/* Biometric Success Banner */}
      {bioSuccessMsg && (
        <div className="w-full max-w-4xl mb-4 p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{bioSuccessMsg}</span>
        </div>
      )}

      {/* Real-Time Store KPI Grid */}
      {stats && (
        <div className="w-full max-w-4xl grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 text-center">
            <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider block mb-0.5">
              Customers
            </span>
            <span className="text-xl font-black text-white font-mono">
              {stats.totalCustomers}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Registered accounts</span>
          </div>

          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-3.5 text-center">
            <span className="text-[10px] text-rose-400 uppercase font-mono tracking-wider block mb-0.5">
              Total Debt Owed
            </span>
            <span className="text-xl font-black text-rose-400 font-mono">
              BD {stats.totalDebt.toFixed(3)}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Outstanding balances</span>
          </div>

          <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-3.5 text-center">
            <span className="text-[10px] text-emerald-400 uppercase font-mono tracking-wider block mb-0.5">
              Advance Credit
            </span>
            <span className="text-xl font-black text-emerald-400 font-mono">
              BD {stats.totalCredit.toFixed(3)}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Prepaid customer credit</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 text-center">
            <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider block mb-0.5">
              Account Status
            </span>
            <div className="flex items-center justify-center gap-2 mt-0.5">
              <span className="text-base font-bold text-emerald-400 font-mono">
                {stats.activeCount} <span className="text-[10px] font-sans text-slate-500">Live</span>
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-base font-bold text-amber-400 font-mono">
                {stats.frozenCount} <span className="text-[10px] font-sans text-slate-500">Frozen</span>
              </span>
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">In-store credit switch</span>
          </div>
        </div>
      )}

      {/* Main Roster Panel */}
      <main className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col flex-1">
        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Name, Mobile, CPR, Card UID, or UUID..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="py-2 px-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value="DEBT_DESC">Highest Debt First</option>
              <option value="NAME_ASC">Name (A-Z)</option>
              <option value="RECENT">Newest Accounts</option>
            </select>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-3 border-b border-slate-800/80 no-scrollbar">
          {[
            { id: 'ALL', label: `All (${customers.length})` },
            { id: 'DEBT', label: `Debt Owed (${customers.filter(c => Number(c.balance || 0) > 0.0005).length})` },
            { id: 'CREDIT', label: `In Credit (${customers.filter(c => Number(c.balance || 0) < -0.0005).length})` },
            { id: 'FROZEN', label: `Frozen (${customers.filter(c => c.is_active === 0).length})` },
            { id: 'MESS', label: `Mess Splits (${customers.filter(c => Array.isArray(c.messes) && c.messes.length > 0).length})` }
          ].map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilterTab(chip.id)}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                filterTab === chip.id
                  ? 'bg-violet-600 text-white shadow-xs'
                  : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Customer Accounts List */}
        {dataLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <RefreshCw className="w-8 h-8 text-violet-400 animate-spin mb-3" />
            <p className="text-xs">Loading live customer accounts...</p>
          </div>
        ) : dataError ? (
          <div className="p-4 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-300 text-xs text-center my-8">
            {dataError}
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="py-20 text-center text-slate-500 text-xs">
            No customer accounts matching filter or search query.
          </div>
        ) : (
          <div className="space-y-2.5 overflow-y-auto max-h-[62vh] pr-1">
            {filteredCustomers.map((cust) => {
              const bal = Number(cust.balance || 0);
              const isDebt = bal > 0.0005;
              const isCredit = bal < -0.0005;
              const isActive = cust.is_active !== 0;

              return (
                <div
                  key={cust.id}
                  className="p-3.5 bg-slate-950/80 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                >
                  {/* Left: Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-black text-sm text-white truncate">{cust.name}</span>
                      {!isActive && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold flex items-center gap-1">
                          <Snowflake className="w-3 h-3" />
                          FROZEN
                        </span>
                      )}
                      {cust.messes && cust.messes.length > 0 && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {cust.messes[0].name || 'Mess Group'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono flex-wrap">
                      {cust.phone && <span>📱 {cust.phone}</span>}
                      {cust.cpr && <span>🆔 CPR: {cust.cpr}</span>}
                      {cust.cardUid && <span>💳 NFC: {cust.cardUid}</span>}
                      <span className="text-slate-600">UUID: {cust.id.slice(0, 8)}...</span>
                    </div>
                  </div>

                  {/* Center: Balance Badge */}
                  <div className="text-left sm:text-right shrink-0">
                    <p className={`text-base font-black font-mono ${
                      isDebt ? 'text-rose-400' : isCredit ? 'text-emerald-400' : 'text-slate-300'
                    }`}>
                      BD {Math.abs(bal).toFixed(3)}
                    </p>
                    <span className="text-[10px] text-slate-500 font-mono block">
                      Limit: BD {Number(cust.credit_limit || 30).toFixed(3)}
                    </span>
                  </div>

                  {/* Right: Quick Developer Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60 flex-wrap">
                    {/* 1-Click Inspect Tab */}
                    <button
                      type="button"
                      onClick={() => navigate(`/tab/${encodeURIComponent(cust.id)}?dev_mode=1`)}
                      className="py-1.5 px-2.5 bg-violet-600 hover:bg-violet-500 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-xs"
                      title="Inspect Live Customer Tab (Bypasses IDOR & Phone Lock)"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect Tab</span>
                    </button>

                    {/* View Statement */}
                    <button
                      type="button"
                      onClick={() => navigate(`/statement/${encodeURIComponent(cust.id)}?dev_mode=1`)}
                      className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer border border-slate-700/80"
                      title="View Itemized Statement"
                    >
                      <FileText className="w-3.5 h-3.5 text-violet-400" />
                      <span>Statement</span>
                    </button>

                    {/* Toggle Freeze */}
                    <button
                      type="button"
                      disabled={togglingFreezeId === cust.id}
                      onClick={() => handleToggleFreeze(cust)}
                      className={`p-1.5 rounded-xl border transition cursor-pointer ${
                        isActive
                          ? 'bg-slate-900 hover:bg-rose-950/40 border-slate-800 text-slate-400 hover:text-rose-300'
                          : 'bg-emerald-950/40 hover:bg-emerald-900/40 border-emerald-500/40 text-emerald-300'
                      }`}
                      title={isActive ? 'Freeze Khata Account' : 'Unfreeze Khata Account'}
                    >
                      {isActive ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>

                    {/* Copy Link */}
                    <button
                      type="button"
                      onClick={() => handleCopyLink(cust)}
                      className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
                      title="Copy Customer Tab URL"
                    >
                      {copiedId === cust.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer Summary */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span>Showing {filteredCustomers.length} of {customers.length} total registered patrons</span>
          <span>Layali Supermarket • Developer Portal</span>
        </div>
      </main>
    </div>
  );
}
