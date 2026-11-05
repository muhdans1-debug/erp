import React, { useState, useEffect } from 'react';
import { 
  Users, UserCheck, UserX, Plus, Edit2, Clock, AlertTriangle, 
  RefreshCw, Printer, FileText
} from 'lucide-react';
const printShiftCloseout = () => window.print();

interface Employee {
  id: string;
  name: string;
  pin_code: string;
  role: 'CASHIER' | 'MANAGER';
  is_active: number | boolean;
  createdAt?: string;
}

interface ShiftSession {
  id: string;
  shift_id?: string;
  cashier_name?: string;
  cashier_role?: string;
  employee_id?: string;
  employee_name?: string;
  employee_role?: string;
  opened_at: string;
  closed_at?: string;
  starting_cash: number;
  expected_cash?: number;
  actual_cash?: number;
  variance?: number;
  cash_sales?: number;
  digital_sales?: number;
  khata_sales?: number;
  denominations?: string;
  notes?: string;
  status: 'OPEN' | 'CLOSED';
}

interface EmployeeShiftReconciliationProps {
  apiBase?: string;
}

export default function EmployeeShiftReconciliation({ apiBase }: EmployeeShiftReconciliationProps) {
  // Resilient API base that binds dynamically to current hostname (e.g. 192.168.8.7:3000)
  const resolvedApiBase = apiBase || (typeof window !== 'undefined' 
    ? (localStorage.getItem('master_server_url') || `http://${window.location.hostname || 'localhost'}:3000`) 
    : 'http://localhost:3000');

  const [activeSubTab, setActiveSubTab] = useState<'reconciliation' | 'employees'>('reconciliation');
  const [sessions, setSessions] = useState<ShiftSession[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New/Edit Employee Modal State
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Partial<Employee> | null>(null);
  const [formName, setFormName] = useState('');
  const [formPin, setFormPin] = useState('');
  const [formRole, setFormRole] = useState<'CASHIER' | 'MANAGER'>('CASHIER');
  const [formActive, setFormActive] = useState(true);
  const [savingEmp, setSavingEmp] = useState(false);

  const formatShiftDateTime = (dtStr?: string | null) => {
    if (!dtStr) return '-';
    try {
      const cleanStr = dtStr.includes('T') ? dtStr : dtStr.replace(' ', 'T') + (dtStr.endsWith('Z') ? '' : 'Z');
      const d = new Date(cleanStr);
      if (!isNaN(d.getTime())) {
        return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      const rawD = new Date(dtStr);
      if (!isNaN(rawD.getTime())) {
        return `${rawD.toLocaleDateString('en-GB')} ${rawD.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      return dtStr;
    } catch {
      return dtStr;
    }
  };

  const [isBridgeLive, setIsBridgeLive] = useState(false);

  // Fetch Data with cache-busting to prevent stale browser disk cache
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [recRes, empRes] = await Promise.all([
        fetch(`${resolvedApiBase}/api/shifts/reconciliation?t=${Date.now()}`),
        fetch(`${resolvedApiBase}/api/employees?t=${Date.now()}`)
      ]);
      const recData = await recRes.json();
      const empData = await empRes.json();

      if (recData.success && Array.isArray(recData.sessions)) {
        const parseShiftTime = (dtStr?: string | null) => {
          if (!dtStr) return 0;
          const clean = dtStr.includes('T') ? dtStr : dtStr.replace(' ', 'T') + (dtStr.endsWith('Z') ? '' : 'Z');
          const d = new Date(clean);
          return isNaN(d.getTime()) ? (new Date(dtStr).getTime() || 0) : d.getTime();
        };

        const sorted = [...recData.sessions].sort((a, b) => {
          if (a.status === 'OPEN' && b.status !== 'OPEN') return -1;
          if (b.status === 'OPEN' && a.status !== 'OPEN') return 1;
          const closedDiff = parseShiftTime(b.closed_at) - parseShiftTime(a.closed_at);
          if (closedDiff !== 0) return closedDiff;
          return parseShiftTime(b.opened_at) - parseShiftTime(a.opened_at);
        });

        setSessions(sorted);
      }
      if (empData.success && Array.isArray(empData.employees)) {
        setEmployees(empData.employees);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load shift reconciliation data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Initial Load when manager opens dashboard
    loadData();

    // 2. Real-time RJ45 WebSocket Bridge Listener
    const bridgeHost = typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'localhost';
    const bridgeUrl = `ws://${bridgeHost}:3000/ws`;
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;
    let isUnmounted = false;

    const connectBridge = () => {
      if (isUnmounted) return;
      try {
        ws = new WebSocket(bridgeUrl);
        ws.onopen = () => {
          console.log(`🔌 [ShiftReconciliation] Connected to RJ45 Bridge at ${bridgeUrl}`);
          setIsBridgeLive(true);
        };
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'SHIFT_CLOSED') {
              console.log('⚡ [ShiftReconciliation] Real-time SHIFT_CLOSED event received from Sunmi! Refreshing table instantly...', data);
              loadData();
            }
          } catch (err) {
            console.warn('⚠️ [ShiftReconciliation] Bridge frame parse error:', err);
          }
        };
        ws.onclose = () => {
          setIsBridgeLive(false);
          if (!isUnmounted) {
            reconnectTimer = setTimeout(connectBridge, 3000);
          }
        };
        ws.onerror = () => {
          setIsBridgeLive(false);
          ws?.close();
        };
      } catch (err) {
        setIsBridgeLive(false);
        if (!isUnmounted) {
          reconnectTimer = setTimeout(connectBridge, 3000);
        }
      }
    };

    connectBridge();

    // 3. Custom event listener if bridge hook is active in same runtime
    const handleShiftClosedEvent = () => {
      console.log('⚡ [ShiftReconciliation] Local CustomEvent sunmi-shift-closed received! Refreshing...');
      loadData();
    };
    window.addEventListener('sunmi-shift-closed', handleShiftClosedEvent);

    // 4. Background safety polling fallback (15 seconds)
    const interval = setInterval(loadData, 15000);

    return () => {
      isUnmounted = true;
      clearTimeout(reconnectTimer);
      clearInterval(interval);
      window.removeEventListener('sunmi-shift-closed', handleShiftClosedEvent);
      ws?.close();
    };
  }, [resolvedApiBase]);

  const handlePrintSlip = async (s: ShiftSession) => {
    let parsedDenoms = null;
    if (s.denominations) {
      try {
        parsedDenoms = typeof s.denominations === 'string' ? JSON.parse(s.denominations) : s.denominations;
      } catch {}
    }

    const variance = Number(s.variance || 0);
    const verdict = Math.abs(variance) < 0.005 ? 'PERFECT' : (variance < 0 ? 'SHORT' : 'OVER');

    await printShiftCloseout({
      shiftId: s.id,
      cashierName: s.employee_name || 'Cashier 1',
      startingFloat: Number(s.starting_cash || 0),
      cashSales: Math.max(0, Number(s.expected_cash || 0) - Number(s.starting_cash || 0)),
      expectedCash: Number(s.expected_cash ?? s.starting_cash ?? 0),
      actualCash: Number(s.actual_cash ?? s.expected_cash ?? 0),
      variance: variance,
      verdict: verdict,
      denominations: parsedDenoms,
      notes: s.notes
    });
  };

  const handleOpenAddEmployee = () => {
    setEditingEmp(null);
    setFormName('');
    setFormPin('');
    setFormRole('CASHIER');
    setFormActive(true);
    setShowEmpModal(true);
  };

  const handleOpenEditEmployee = (emp: Employee) => {
    setEditingEmp(emp);
    setFormName(emp.name);
    setFormPin(emp.pin_code);
    setFormRole(emp.role);
    setFormActive(Boolean(emp.is_active));
    setShowEmpModal(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || formPin.trim().length !== 4) {
      alert('Please provide a valid name and exactly 4-digit numeric PIN.');
      return;
    }

    setSavingEmp(true);
    try {
      const res = await fetch(`${apiBase}/api/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingEmp?.id,
          name: formName.trim(),
          pin_code: formPin.trim(),
          role: formRole,
          is_active: formActive
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowEmpModal(false);
        loadData();
      } else {
        alert(data.error || 'Failed to save employee.');
      }
    } catch (e: any) {
      alert(e?.message || 'Error saving employee');
    } finally {
      setSavingEmp(false);
    }
  };

  // Helper for discrepancy status & forensic math
  const validateCash = (expectedCash: number, actualCash: number | null, status: string, serverVariance?: number | null) => {
    if (status === 'OPEN' || actualCash === null) {
      return { status: "OPEN", color: "bg-blue-100 text-blue-700 border border-blue-200", label: "Active Shift", variance: 0 };
    }
    const variance = (serverVariance !== null && serverVariance !== undefined)
      ? Number(serverVariance)
      : Number((actualCash - expectedCash).toFixed(3));

    if (Math.abs(variance) < 0.005) {
      return { status: "PERFECT", color: "text-green-700 bg-green-100 border border-green-300", label: "Exact Match", variance: 0 };
    } else if (variance < 0) {
      return { status: "SHORT", color: "text-red-700 bg-red-100 border border-red-300", label: `Short by ${Math.abs(variance).toFixed(3)} BHD`, variance };
    } else {
      return { status: "OVER", color: "text-yellow-800 bg-yellow-100 border border-yellow-300", label: `Over by ${variance.toFixed(3)} BHD`, variance };
    }
  };

  const handlePrintZReport = (shift: ShiftSession) => {
    const cashierName = shift.cashier_name || shift.employee_name || 'Cashier 1';
    const cashierRole = shift.cashier_role || shift.employee_role || 'CASHIER';
    const cashierId = (shift.employee_id || shift.id || 'N/A').substring(0, 8);
    const startingCash = Number(shift.starting_cash || 0);
    const cashSales = Number(shift.cash_sales ?? 0);
    const digitalSales = Number(shift.digital_sales || 0);
    const khataSales = Number(shift.khata_sales || 0);
    const expectedDrawer = shift.expected_cash !== null && shift.expected_cash !== undefined 
      ? Number(shift.expected_cash) 
      : Number((startingCash + cashSales).toFixed(3));
    const actualCash = shift.status === 'OPEN' || shift.actual_cash === null || shift.actual_cash === undefined 
      ? expectedDrawer 
      : Number(shift.actual_cash);
    const validation = validateCash(expectedDrawer, actualCash, shift.status, shift.variance);

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to generate the printable Z-Report.');
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>NBR Tax Z-Report - Shift ${shift.id}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; color: #1e293b; line-height: 1.5; }
          .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
          .title { font-size: 24px; font-weight: 900; margin: 0; }
          .sub { font-size: 13px; color: #64748b; margin-top: 4px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
          .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
          .card-title { font-size: 12px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 12px; letter-spacing: 0.5px; }
          .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
          .label { color: #475569; }
          .value { font-weight: 700; font-family: monospace; }
          .highlight { border-top: 1px dashed #cbd5e1; padding-top: 8px; font-size: 15px; }
          .verdict { margin-top: 16px; padding: 12px; text-align: center; font-size: 16px; font-weight: 900; border-radius: 6px; text-transform: uppercase; }
          .verdict-PERFECT { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
          .verdict-SHORT { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
          .verdict-OVER { background: #fef9c3; color: #a16207; border: 1px solid #fde047; }
          .signatures { margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 48px; }
          .sign-line { border-top: 1px solid #94a3b8; padding-top: 8px; font-size: 13px; text-align: center; }
          @media print { body { margin: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">ASKAR MARKET W.L.L.</h1>
          <p class="sub">Kingdom of Bahrain | NBR TRN: 200000000000003</p>
          <p style="font-size: 16px; font-weight: 800; margin: 8px 0 0 0;">OFFICIAL SHIFT RECONCILIATION & Z-REPORT</p>
          <p class="sub">Audit Timestamp: ${new Date().toLocaleString()}</p>
        </div>

        <div class="grid">
          <div class="card">
            <div class="card-title">Cashier Identification & Timeline</div>
            <div class="row"><span class="label">Cashier Name:</span><span class="value">${cashierName}</span></div>
            <div class="row"><span class="label">Staff ID:</span><span class="value">${cashierId}</span></div>
            <div class="row"><span class="label">Assigned Role:</span><span class="value">${cashierRole}</span></div>
            <div class="row"><span class="label">Shift Session ID:</span><span class="value">${shift.id}</span></div>
            <div class="row"><span class="label">Shift Opened:</span><span class="value">${new Date(shift.opened_at).toLocaleString()}</span></div>
            <div class="row"><span class="label">Shift Closed:</span><span class="value">${shift.closed_at ? new Date(shift.closed_at).toLocaleString() : 'ACTIVE STILL OPEN'}</span></div>
          </div>

          <div class="card">
            <div class="card-title">Sales Revenue Breakdown</div>
            <div class="row"><span class="label">Physical Cash Sales:</span><span class="value">${cashSales.toFixed(3)} BHD</span></div>
            <div class="row"><span class="label">Digital / BenefitPay:</span><span class="value">${digitalSales.toFixed(3)} BHD</span></div>
            <div class="row"><span class="label">Khata Customer Credit:</span><span class="value">${khataSales.toFixed(3)} BHD</span></div>
            <div class="row highlight"><span class="label"><strong>Total Shift Turnover:</strong></span><span class="value"><strong>${(cashSales + digitalSales + khataSales).toFixed(3)} BHD</strong></span></div>
            <div class="row"><span class="label">Standard 10% VAT In Turnover:</span><span class="value">${((cashSales + digitalSales + khataSales) / 11).toFixed(3)} BHD</span></div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Physical Cash Drawer Audit Engine</div>
          <div class="row"><span class="label">Starting Float:</span><span class="value">${startingCash.toFixed(3)} BHD</span></div>
          <div class="row"><span class="label">+ Cash Sales:</span><span class="value">${cashSales.toFixed(3)} BHD</span></div>
          <div class="row highlight"><span class="label"><strong>Expected Drawer Total:</strong></span><span class="value" style="color: #2563eb;"><strong>${expectedDrawer.toFixed(3)} BHD</strong></span></div>
          <div class="row"><span class="label"><strong>Actual Counted Cash:</strong></span><span class="value"><strong>${actualCash.toFixed(3)} BHD</strong></span></div>
          <div class="row"><span class="label">Discrepancy (Variance):</span><span class="value">${validation.variance.toFixed(3)} BHD</span></div>

          <div class="verdict verdict-${validation.status}">
            AUDIT VERDICT: ${validation.label}
          </div>
        </div>

        <div class="signatures">
          <div class="sign-line">Cashier Signature (Count Handover)</div>
          <div class="sign-line">Store Auditor / Manager Signature</div>
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold border border-emerald-500/30">
              AUDIT COMPLIANCE
            </span>
            <span className="text-xs text-slate-400">Enterprise Cash Control</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight mt-1">
            Cashier Shift & Blind Reconciliation Engine
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl mt-1">
            Every cashier checkout session is tracked from drawer opening float to end-of-day blind reconciliation. The system calculates expected till totals behind the scenes to instantly flag cash variances.
          </p>
        </div>

        {/* Tab Switcher & Actions */}
        <div className="flex items-center gap-3">
          <div className="flex p-1 bg-slate-800 rounded-2xl border border-slate-700">
            <button
              onClick={() => setActiveSubTab('reconciliation')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'reconciliation' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clock size={14} />
              <span>Shift Reconciliation</span>
            </button>
            <button
              onClick={() => setActiveSubTab('employees')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'employees' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users size={14} />
              <span>Cashiers & Staff ({employees.length})</span>
            </button>
          </div>

          <button
            onClick={loadData}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700 cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 text-xs font-bold rounded-2xl border border-red-200 flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* SUBTAB 1: RECONCILIATION STATEMENT */}
      {activeSubTab === 'reconciliation' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-3">
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Master Shift Reconciliation Log (Z-Report)</h3>
              <p className="text-xs text-slate-500 mt-0.5">High-density forensic accounting grid validating physical drawer cash against system cash sales.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition ${
                isBridgeLive 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isBridgeLive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                <span>{isBridgeLive ? '0ms RJ45 Bridge Active' : 'Bridge Standby'}</span>
              </span>
              <span className="text-xs font-mono text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 font-bold">
                {sessions.length} Sessions
              </span>
            </div>
          </div>

          <div className="overflow-x-auto bg-white rounded-2xl shadow-sm border border-slate-200 border-t-4 border-t-slate-800">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase text-xs tracking-wider border-b border-slate-200 font-black">
                  <th className="p-4 border-b">Cashier Profile</th>
                  <th className="p-4 border-b">Shift Timeline</th>
                  <th className="p-4 border-b">Sales Breakdown</th>
                  <th className="p-4 border-b">Drawer Validation</th>
                  <th className="p-4 border-b text-center">Audit Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 font-medium text-xs">
                      No shift sessions recorded yet. Shifts started on the Sunmi POS will populate here automatically.
                    </td>
                  </tr>
                ) : (
                  sessions.map((shift) => {
                    const startingCash = Number(shift.starting_cash || 0);
                    const cashSales = Number(shift.cash_sales ?? 0);
                    const digitalSales = Number(shift.digital_sales || 0);
                    const khataSales = Number(shift.khata_sales || 0);
                    const expectedDrawer = shift.expected_cash !== null && shift.expected_cash !== undefined 
                      ? Number(shift.expected_cash) 
                      : Number((startingCash + cashSales).toFixed(3));
                    const actualCash = shift.status === 'OPEN' || shift.actual_cash === null || shift.actual_cash === undefined
                      ? null 
                      : Number(shift.actual_cash);
                    const validation = validateCash(expectedDrawer, actualCash, shift.status, shift.variance);

                    const cashierName = shift.cashier_name || shift.employee_name || 'Cashier 1';
                    const cashierRole = shift.cashier_role || shift.employee_role || 'CASHIER';
                    const cashierId = (shift.employee_id || shift.id || 'N/A');

                    return (
                      <tr key={shift.id} className="hover:bg-slate-50/80 border-b border-slate-100 transition">
                        
                        {/* 1. Cashier Profile */}
                        <td className="p-4 align-top">
                          <p className="font-black text-slate-900 text-base">{cashierName}</p>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">ID: {cashierId.substring(0, 8)}</p>
                          <span className="inline-block mt-1.5 px-2.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] rounded-full font-black uppercase tracking-wider">
                            {cashierRole}
                          </span>
                        </td>

                        {/* 2. Shift Timeline */}
                        <td className="p-4 text-xs text-slate-700 align-top space-y-1">
                          <p><b className="text-slate-900">Opened:</b> {formatShiftDateTime(shift.opened_at)}</p>
                          <p>
                            <b className="text-slate-900">Closed:</b> {shift.closed_at ? (
                              formatShiftDateTime(shift.closed_at)
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-black text-[10px] ml-1">
                                ACTIVE OPEN
                              </span>
                            )}
                          </p>
                        </td>

                        {/* 3. Non-Cash & Cash Sales Breakdown */}
                        <td className="p-4 text-xs align-top space-y-1">
                          <p className="text-slate-600 flex justify-between gap-4">
                            <span>BenefitPay / Card:</span>
                            <span className="font-bold text-slate-900 font-mono">{digitalSales.toFixed(3)} BHD</span>
                          </p>
                          <p className="text-slate-600 flex justify-between gap-4">
                            <span>Khata Credit:</span>
                            <span className="font-bold text-slate-900 font-mono">{khataSales.toFixed(3)} BHD</span>
                          </p>
                          <p className="mt-1.5 text-emerald-700 font-black border-t border-slate-200 pt-1.5 flex justify-between gap-4">
                            <span>Cash Sales:</span>
                            <span className="font-mono">{cashSales.toFixed(3)} BHD</span>
                          </p>
                        </td>

                        {/* 4. Cash Validation Engine */}
                        <td className="p-4 align-top">
                          <div className="flex flex-col gap-1 text-xs">
                            <p className="flex justify-between gap-4">
                              <span className="text-slate-500">Starting Float:</span> 
                              <span className="font-bold font-mono text-slate-700">{startingCash.toFixed(3)}</span>
                            </p>
                            <p className="flex justify-between gap-4">
                              <span className="text-slate-500">+ Cash Sales:</span> 
                              <span className="font-bold font-mono text-slate-700">{cashSales.toFixed(3)}</span>
                            </p>
                            <p className="flex justify-between gap-4 border-t border-slate-200 pt-1">
                              <span className="text-slate-900 font-bold">Expected Drawer:</span> 
                              <span className="font-bold font-mono text-blue-600">
                                {expectedDrawer.toFixed(3)}
                              </span>
                            </p>
                            <p className="flex justify-between gap-4">
                              <span className="text-slate-900 font-bold">Actual Counted:</span> 
                              <span className="font-black font-mono text-slate-900">
                                {shift.status === 'OPEN' || actualCash === null ? (
                                  <span className="text-slate-400 font-normal italic">In Progress</span>
                                ) : (
                                  actualCash.toFixed(3)
                                )}
                              </span>
                            </p>
                            
                            {/* The Final Verdict Badge */}
                            {shift.status === 'OPEN' ? (
                              <div className="mt-2 px-3 py-1 rounded-lg text-center font-black uppercase text-xs bg-blue-100 text-blue-700 border border-blue-200 flex items-center justify-center gap-1">
                                <Clock size={12} className="animate-spin" />
                                <span>Active Shift</span>
                              </div>
                            ) : (
                              <div className={`mt-2 px-3 py-1.5 rounded-lg text-center font-black uppercase text-xs ${validation.color}`}>
                                {validation.label}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 5. Audit Actions */}
                        <td className="p-4 align-middle text-center">
                          <div className="flex flex-col gap-1.5 max-w-[130px] mx-auto">
                            <button
                              type="button"
                              onClick={() => handlePrintSlip(shift)}
                              className="w-full px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
                              title="Print Physical 58mm Thermal Closeout Slip on Sunmi"
                            >
                              <Printer size={12} />
                              <span>Thermal Slip</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePrintZReport(shift)}
                              className="w-full px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
                              title="Printable NBR Tax Z-Report (PDF / Print)"
                            >
                              <FileText size={12} />
                              <span>NBR Report</span>
                            </button>
                          </div>
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 2: EMPLOYEE MANAGEMENT TABLE */}
      {activeSubTab === 'employees' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900">Staff & Cashier Directory</h3>
              <p className="text-xs text-slate-500">Manage 4-digit numeric PINs for fast Sunmi POS logins. Disabling an account immediately locks the employee from the register.</p>
            </div>
            <button
              onClick={handleOpenAddEmployee}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={16} />
              <span>Add Cashier / Staff</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {employees.map((emp) => (
              <div
                key={emp.id}
                className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 transition shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black tracking-wider uppercase ${
                      emp.role === 'MANAGER' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {emp.role}
                    </span>
                    <span className={`flex items-center gap-1 text-[11px] font-bold ${
                      emp.is_active ? 'text-emerald-600' : 'text-red-500'
                    }`}>
                      {emp.is_active ? <UserCheck size={14} /> : <UserX size={14} />}
                      <span>{emp.is_active ? 'Active' : 'Disabled'}</span>
                    </span>
                  </div>

                  <h4 className="text-base font-black text-slate-900">{emp.name}</h4>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>4-Digit POS PIN:</span>
                      <span className="font-mono font-black text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {emp.pin_code}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400 font-mono text-[11px]">
                      <span>Staff ID:</span>
                      <span>{emp.id}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                  <button
                    onClick={() => handleOpenEditEmployee(emp)}
                    className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition flex items-center gap-1 cursor-pointer"
                  >
                    <Edit2 size={13} />
                    <span>Edit Staff & PIN</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EMPLOYEE CREATE / EDIT MODAL */}
      {showEmpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100">
            <form onSubmit={handleSaveEmployee}>
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <h3 className="font-black text-lg">
                  {editingEmp ? 'Edit Staff Member' : 'Add New Cashier'}
                </h3>
                <span className="text-xs text-slate-400">Sunmi PIN Provisioning</span>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Staff Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Ali Ahmed"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    4-Digit Sunmi Login PIN
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    placeholder="e.g., 1234"
                    value={formPin}
                    onChange={(e) => setFormPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xl font-mono font-black text-center tracking-widest outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Must be exactly 4 digits. Cashier types this on the Sunmi terminal numpad.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Role
                    </label>
                    <select
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value as any)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none cursor-pointer"
                    >
                      <option value="CASHIER">Cashier (POS Register)</option>
                      <option value="MANAGER">Manager (Back-Office Hub)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Status
                    </label>
                    <select
                      value={formActive ? '1' : '0'}
                      onChange={(e) => setFormActive(e.target.value === '1')}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none cursor-pointer"
                    >
                      <option value="1">Active (Can Login)</option>
                      <option value="0">Disabled (Locked Out)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowEmpModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEmp}
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition cursor-pointer"
                >
                  {savingEmp ? 'Saving...' : 'Save Employee PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
