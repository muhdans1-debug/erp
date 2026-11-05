import { useState, useEffect } from 'react';
import { Activity, RefreshCw, Calendar, TrendingDown, TrendingUp, AlertCircle, ArrowLeft, ShieldCheck, Printer } from 'lucide-react';
import { TableSkeleton, KpiCardSkeleton } from './Skeleton';
import FinancialReportWidget from './FinancialReportWidget';

interface FinancialDashboardProps {
  apiBase?: string;
  onBackToPos?: () => void;
}

export default function FinancialDashboard({ apiBase: propApiBase, onBackToPos }: FinancialDashboardProps) {
  const apiBase = propApiBase || (typeof window !== 'undefined' ? localStorage.getItem('master_server_url') || 'http://localhost:3000' : 'http://localhost:3000');
  
  const [financials, setFinancials] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'month' | 'day' | 'year' | 'all'>('month');

  // Bahrain NBR Quarterly VAT Return State
  const [vatReturn, setVatReturn] = useState<any>(null);
  const [loadingVat, setLoadingVat] = useState(false);

  const fetchVatReturn = (startDate?: string, endDate?: string) => {
    setLoadingVat(true);
    const query = (startDate && endDate) ? `?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}` : '';
    fetch(`${apiBase}/api/reports/vat-return${query}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setVatReturn(data);
        }
      })
      .catch((err) => console.error("VAT return fetch error:", err))
      .finally(() => setLoadingVat(false));
  };

  const fetchFinancials = () => {
    setLoading(true);
    setError(null);
    fetch(`${apiBase}/api/reports/pnl?period=${period}`, {
      headers: { 'x-manager-pin': '9999' }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setFinancials(data.data);
        } else {
          setError(data.error || 'Failed to load financial statement');
        }
      })
      .catch(err => {
        console.error(err);
        setError('Failed to connect to back-office server. Ensure port 3000 is running.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFinancials();
    fetchVatReturn();
  }, [apiBase, period]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto p-4 sm:p-6 text-slate-800">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Financial & P&L Statement</h1>
            <span className="text-xs font-bold px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full">
              Live Cash Audited
            </span>
          </div>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Separates shop operating profit from owner personal draws to protect business solvency.
          </p>
        </div>

        {/* Period Selector & Action */}
        <div className="flex flex-wrap items-center gap-2">
          {onBackToPos && (
            <button
              onClick={onBackToPos}
              className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition-colors text-xs sm:text-sm flex items-center gap-1.5"
            >
              <ArrowLeft size={16} /> Back
            </button>
          )}

          <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200">
            {(['day', 'month', 'year', 'all'] as const).map(p => {
              const active = period === p;
              const label = p === 'day' ? 'Today' : p === 'month' ? 'This Month' : p === 'year' ? 'This Year' : 'All Time';
              return (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    active ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <button
            onClick={fetchFinancials}
            disabled={loading}
            className="p-2 bg-white border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            title="Refresh Financials"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Date-Range Command Center Widget (Full-Day Boundary 23:59:59 & NBR VAT Filing) */}
      <FinancialReportWidget
        apiBase={apiBase}
        onRangeChange={(start, end) => fetchVatReturn(start, end)}
      />

      {loading && !financials ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200">
            <TableSkeleton rows={6} columns={3} />
          </div>
        </div>
      ) : error && !financials ? (
        <div className="p-8 text-center bg-red-50 text-red-700 rounded-2xl border border-red-200">
          <AlertCircle size={36} className="mx-auto mb-2 text-red-500" />
          <p className="font-bold">{error}</p>
        </div>
      ) : financials ? (
        <>
          {/* Primary KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-slate-500 font-bold uppercase text-xs tracking-wider mb-1">Total Revenue (Sales)</p>
                  <h2 className="text-3xl font-black text-slate-900 font-mono">BD {financials.totalRevenue.toFixed(3)}</h2>
                </div>
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                  <TrendingUp size={24} />
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-3">Gross revenue collected from register transactions</p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-slate-500 font-bold uppercase text-xs tracking-wider mb-1">Gross Profit (After Stock Costs)</p>
                  <h2 className="text-3xl font-black text-emerald-600 font-mono">BD {financials.grossProfit.toFixed(3)}</h2>
                </div>
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Activity size={24} />
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-3">
                Margin: {financials.totalRevenue > 0 ? `${((financials.grossProfit / financials.totalRevenue) * 100).toFixed(1)}%` : '0%'}
              </p>
            </div>

            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xs text-white hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-slate-400 font-bold uppercase text-xs tracking-wider mb-1">Net Retained Cash</p>
                  <h2 className={`text-3xl font-black font-mono ${financials.netRetainedCash >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    BD {financials.netRetainedCash.toFixed(3)}
                  </h2>
                </div>
                <div className="p-3 bg-slate-800 text-emerald-400 rounded-xl">
                  {financials.netRetainedCash >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-3">Actual cash added to store balance after all bills and draws</p>
            </div>
          </div>

          {/* Detailed P&L Statement Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* The Main P&L Statement Sheet */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="text-slate-600" size={20} />
                  <h3 className="text-lg font-bold text-slate-900">Profit & Loss General Ledger</h3>
                </div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Period: {period}
                </span>
              </div>
              
              <div className="p-6 space-y-4 font-mono text-base sm:text-lg">
                
                {/* 1. Revenue */}
                <div className="flex justify-between items-center text-slate-800 pb-2">
                  <span className="font-sans font-medium text-sm sm:text-base">Total Sales Revenue</span>
                  <span className="font-bold">BD {financials.totalRevenue.toFixed(3)}</span>
                </div>

                {/* 2. COGS */}
                <div className="flex justify-between items-center text-red-500 border-b border-slate-100 pb-4">
                  <span className="font-sans font-medium text-sm sm:text-base">Less: Cost of Goods Sold (Stock COGS)</span>
                  <span className="font-bold">- BD {financials.totalCogs.toFixed(3)}</span>
                </div>
                
                {/* 3. Gross Profit */}
                <div className="flex justify-between items-center font-bold text-slate-900 pt-1 pb-2">
                  <span className="font-sans text-sm sm:text-base">Gross Profit</span>
                  <span className="text-emerald-700">BD {financials.grossProfit.toFixed(3)}</span>
                </div>

                {/* 4. Operating Expenses */}
                <div className="flex justify-between items-center text-red-600 border-b border-slate-100 pb-4 pt-2">
                  <div>
                    <span className="font-sans font-medium text-sm sm:text-base block">Less: Business Operating Expenses</span>
                    <span className="text-xs font-sans text-slate-400">Rent, EWA Electricity, Salaries, Maintenance</span>
                  </div>
                  <span className="font-bold">- BD {financials.businessExpenses.toFixed(3)}</span>
                </div>

                {/* 5. Business Operating Profit */}
                <div className="flex justify-between items-center font-bold pt-2 pb-2">
                  <div>
                    <span className="font-sans text-sm sm:text-base text-slate-900 block">Business Operating Profit</span>
                    <span className="text-xs font-sans text-slate-400">Pure operational profit before owner withdraws cash</span>
                  </div>
                  <span className={`text-xl ${financials.operatingProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    BD {financials.operatingProfit.toFixed(3)}
                  </span>
                </div>

                {/* 6. Personal Withdrawals */}
                <div className="flex justify-between items-center text-amber-600 border-b border-slate-100 pb-4 pt-2">
                  <div>
                    <span className="font-sans font-medium text-sm sm:text-base block">Less: Owner Personal Withdrawals</span>
                    <span className="text-xs font-sans text-slate-400">Owner Draw, Home Bills, Personal Groceries</span>
                  </div>
                  <span className="font-bold">- BD {financials.personalWithdrawals.toFixed(3)}</span>
                </div>

                {/* 7. Final Net Cash Retained */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center font-black text-xl sm:text-2xl text-slate-900 bg-slate-50 p-5 rounded-xl border border-slate-200 mt-4 gap-2">
                  <div>
                    <span className="font-sans text-base sm:text-lg block">Final Net Cash Added to Business</span>
                    <span className="text-xs font-sans font-medium text-slate-500">Net retained after operational and personal draws</span>
                  </div>
                  <span className={financials.netRetainedCash >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                    BD {financials.netRetainedCash.toFixed(3)}
                  </span>
                </div>

              </div>
            </div>

            {/* Recent Expenses List Sidebar */}
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar size={18} className="text-slate-500" />
                  <h3 className="font-bold text-slate-900 text-sm">Recent Cash Outflows</h3>
                </div>
                <span className="text-xs font-bold text-slate-400">
                  {financials.expensesCount ?? 0} Recorded
                </span>
              </div>

              <div className="p-4 divide-y divide-slate-100 overflow-y-auto max-h-[500px] flex-1">
                {financials.recentExpenses && financials.recentExpenses.length > 0 ? (
                  financials.recentExpenses.map((exp: any) => (
                    <div key={exp.id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                            exp.type === 'BUSINESS' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {exp.type}
                          </span>
                          <span className="font-bold text-xs text-slate-800">{exp.category}</span>
                        </div>
                        {exp.description && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-1">{exp.description}</p>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
                          {new Date(exp.createdAt).toLocaleDateString()} {new Date(exp.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="font-black text-sm font-mono text-red-600">
                          - BD {Number(exp.amount).toFixed(3)}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-xs text-slate-400 font-semibold">
                    No expenses or draws recorded in this period.
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* BAHRAIN NBR QUARTERLY VAT RETURN AUDIT CARD */}
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden mt-6">
            <div className="p-6 border-b border-slate-100 bg-linear-to-r from-emerald-950 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="text-emerald-400" size={24} />
                  <h3 className="text-xl font-black tracking-tight text-white">Bahrain NBR Quarterly VAT Return</h3>
                  <span className="text-[10px] font-black px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full">
                    NBR VAT Act Compliant
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  National Bureau for Revenue (NBR) Audit Schedule • VAT Reg No: <strong className="text-emerald-400 font-mono">200012345678901</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchVatReturn()}
                  disabled={loadingVat}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={14} className={loadingVat ? 'animate-spin' : ''} /> Recalculate VAT
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer size={14} /> Print for Auditor
                </button>
              </div>
            </div>

            {vatReturn ? (
              <div className="p-6">
                {/* 3 Metric Cards: Output VAT vs Input VAT vs Net VAT Due */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  
                  <div className="p-5 bg-blue-50/60 rounded-xl border border-blue-200/80">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-black uppercase text-blue-900 tracking-wider">1. Output VAT Collected</span>
                        <div className="text-2xl font-black text-blue-700 font-mono mt-1">
                          BD {Number(vatReturn.outputVatCollected || 0).toFixed(3)}
                        </div>
                      </div>
                      <span className="text-xs font-bold bg-blue-200/60 text-blue-900 px-2 py-0.5 rounded-full">
                        From Customers
                      </span>
                    </div>
                    <p className="text-xs text-blue-800/80 mt-2">
                      Extracted from 10% standard rated sales. Zero-rated basic foods are taxed at 0%.
                    </p>
                  </div>

                  <div className="p-5 bg-amber-50/60 rounded-xl border border-amber-200/80">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-black uppercase text-amber-900 tracking-wider">2. Input VAT Deductible</span>
                        <div className="text-2xl font-black text-amber-700 font-mono mt-1">
                          - BD {Number(vatReturn.inputVatPaid || 0).toFixed(3)}
                        </div>
                      </div>
                      <span className="text-xs font-bold bg-amber-200/60 text-amber-900 px-2 py-0.5 rounded-full">
                        Paid to Suppliers
                      </span>
                    </div>
                    <p className="text-xs text-amber-800/80 mt-2">
                      Tax paid on business expenses, utility bills, and supplier stock purchases.
                    </p>
                  </div>

                  <div className={`p-5 rounded-xl border ${
                    vatReturn.netVatDueToNBR >= 0 
                      ? 'bg-emerald-50/80 border-emerald-300' 
                      : 'bg-purple-50/80 border-purple-300'
                  }`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-black uppercase text-emerald-950 tracking-wider">
                          3. Net Payable to NBR
                        </span>
                        <div className={`text-2xl font-black font-mono mt-1 ${
                          vatReturn.netVatDueToNBR >= 0 ? 'text-emerald-700' : 'text-purple-700'
                        }`}>
                          BD {Number(vatReturn.netVatDueToNBR || 0).toFixed(3)}
                        </div>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        vatReturn.netVatDueToNBR >= 0 ? 'bg-emerald-200 text-emerald-900' : 'bg-purple-200 text-purple-900'
                      }`}>
                        {vatReturn.netVatDueToNBR >= 0 ? 'Net Tax Due' : 'Refund Claimable'}
                      </span>
                    </div>
                    <p className="text-xs text-emerald-900 mt-2 font-medium">
                      {vatReturn.netVatDueToNBR >= 0 
                        ? 'Amount store owner must wire to Bahrain NBR quarterly.' 
                        : 'Credit forward available from Bahrain NBR.'}
                    </p>
                  </div>

                </div>

                {/* Audit Schedule Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden font-mono text-xs">
                  <div className="bg-slate-50 px-4 py-2.5 font-sans font-bold text-slate-700 border-b border-slate-200 flex justify-between">
                    <span>Tax Category Breakdown</span>
                    <span>Quarter Period Audit</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    <div className="px-4 py-3 flex justify-between items-center">
                      <span className="font-sans text-slate-600">Standard Rated Sales (10% VAT Items - Cosmetics, Electronics, Confectionery)</span>
                      <span className="font-bold text-slate-900">BD {Number(vatReturn.standardRatedSales || 0).toFixed(3)}</span>
                    </div>
                    <div className="px-4 py-3 flex justify-between items-center">
                      <span className="font-sans text-slate-600">Zero-Rated Basic Food Sales (0% VAT - Fresh Milk, Bread, Fresh Meat, Produce)</span>
                      <span className="font-bold text-emerald-600">BD {Number(vatReturn.zeroRatedSales || 0).toFixed(3)} (0% Rate)</span>
                    </div>
                    <div className="px-4 py-3 flex justify-between items-center bg-slate-50/50">
                      <span className="font-sans font-bold text-slate-800">Total Taxable Turnover</span>
                      <span className="font-black text-slate-900 text-sm">BD {Number(vatReturn.totalTaxableSales || 0).toFixed(3)}</span>
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">
                Loading NBR VAT return calculation...
              </div>
            )}
          </div>
        </>
      ) : null}

    </div>
  );
}
