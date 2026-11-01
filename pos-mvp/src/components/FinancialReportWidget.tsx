import { useState, useEffect } from 'react';
import { Calendar, TrendingUp, DollarSign, Receipt, Percent, CreditCard, Download, RefreshCw, CheckCircle2 } from 'lucide-react';

interface FinancialReportData {
  success: boolean;
  dateRange: {
    startDate: string;
    endDate: string;
    startBoundary: string;
    endBoundary: string;
    inclusiveEndDay: boolean;
  };
  transactionCount: number;
  totalRevenue: number;
  totalVat: number;
  totalNet: number;
  cogs?: number;
  grossProfit?: number;
  profitMargin?: string;
  averageTicket?: number;
  nbrVatMetrics?: {
    standardRatedNet: number;
    outputVatCollected: number;
    zeroRatedSales: number;
    totalSupplies: number;
  };
  paymentBreakdown?: {
    CASH: number;
    BENEFIT_PAY: number;
    CARD: number;
    CREDIT: number;
  };
  sales?: Array<{
    id: string;
    invoiceNo: string;
    createdAt: string;
    total_amount: number;
    vat_amount: number;
    net_amount: number;
    paymentType: string;
    status: string;
  }>;
}

interface FinancialReportWidgetProps {
  apiBase?: string;
  onRangeChange?: (startDate: string, endDate: string) => void;
}

export default function FinancialReportWidget({ apiBase: propApiBase, onRangeChange }: FinancialReportWidgetProps) {
  const apiBase = propApiBase || (typeof window !== 'undefined' ? localStorage.getItem('master_server_url') || 'http://localhost:3000' : 'http://localhost:3000');

  // Format YYYY-MM-DD
  const formatYmd = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = formatYmd(new Date());

  // Default to today for both start and end
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [reportData, setReportData] = useState<FinancialReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string>('today');

  const fetchReport = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBase}/reports/financial?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      const data: FinancialReportData = await response.json();
      if (data.success) {
        setReportData(data);
        if (onRangeChange) {
          onRangeChange(startDate, endDate);
        }
      } else {
        throw new Error('Failed to retrieve financial report');
      }
    } catch (err: any) {
      console.error('Failed to fetch financial report:', err);
      setError(err.message || 'Failed to connect to backend server');
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch automatically whenever startDate or endDate changes
  useEffect(() => {
    fetchReport();
  }, [startDate, endDate, apiBase]);

  // Quick Preset Handlers
  const applyPreset = (preset: string) => {
    const now = new Date();
    setActivePreset(preset);

    if (preset === 'today') {
      const t = formatYmd(now);
      setStartDate(t);
      setEndDate(t);
    } else if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = formatYmd(y);
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (preset === 'week') {
      const startOfWeek = new Date(now);
      const day = startOfWeek.getDay(); // 0 is Sunday
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Monday start
      startOfWeek.setDate(diff);
      setStartDate(formatYmd(startOfWeek));
      setEndDate(formatYmd(now));
    } else if (preset === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(formatYmd(startOfMonth));
      setEndDate(formatYmd(now));
    } else if (preset === 'nbr_quarter') {
      // Bahrain NBR standard quarters: Q1 (Jan-Mar), Q2 (Apr-Jun), Q3 (Jul-Sep), Q4 (Oct-Dec)
      const currentMonth = now.getMonth();
      const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
      const quarterEndMonth = quarterStartMonth + 2;
      const qStart = new Date(now.getFullYear(), quarterStartMonth, 1);
      // Last day of quarter
      const qEnd = new Date(now.getFullYear(), quarterEndMonth + 1, 0);
      setStartDate(formatYmd(qStart));
      setEndDate(formatYmd(qEnd));
    } else if (preset === 'last30') {
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
      setStartDate(formatYmd(thirtyDaysAgo));
      setEndDate(formatYmd(now));
    }
  };

  const handleExportCsv = () => {
    if (!reportData || !reportData.sales || reportData.sales.length === 0) {
      alert('No sales transactions recorded in this date range.');
      return;
    }

    const headers = ['Invoice #', 'Date & Time', 'Payment Type', 'Status', 'Gross Total (BHD)', 'VAT Amount (BHD)', 'Net Amount (BHD)'];
    const rows = reportData.sales.map((s) => [
      `"${s.invoiceNo}"`,
      `"${new Date(s.createdAt).toLocaleString('en-GB')}"`,
      `"${s.paymentType}"`,
      `"${s.status}"`,
      Number(s.total_amount).toFixed(3),
      Number(s.vat_amount).toFixed(3),
      Number(s.net_amount).toFixed(3),
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Financial_Report_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl text-white shadow-xl space-y-6">
      
      {/* Top Header & Range Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <Receipt size={20} />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">Financial Command Center</h2>
            <span className="text-xs font-bold px-2.5 py-0.5 bg-emerald-400/10 text-emerald-300 border border-emerald-400/20 rounded-full">
              Full-Day Boundary (23:59:59)
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Custom date range reporting engine with zero midnight-truncation for accurate NBR VAT filing.
          </p>
        </div>

        {/* Quick Range Presets */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-800/80 p-1.5 rounded-xl border border-slate-700">
          {[
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'week', label: 'This Week' },
            { id: 'month', label: 'Month to Date' },
            { id: 'nbr_quarter', label: 'NBR Quarter' },
            { id: 'last30', label: 'Last 30 Days' },
          ].map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activePreset === preset.id
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Two Distinct HTML Date Inputs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-4">
          
          {/* Start Date */}
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
              <Calendar size={14} className="text-emerald-400" /> Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setActivePreset('custom');
              }}
              max={endDate}
              className="w-full bg-slate-900 border border-slate-700 text-white font-mono text-sm sm:text-base font-bold px-3 py-2.5 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              style={{ colorScheme: 'dark' }}
            />
          </div>

          <div className="hidden sm:flex items-center pt-5 text-slate-500 font-bold">
            →
          </div>

          {/* End Date */}
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
              <Calendar size={14} className="text-emerald-400" /> End Date (Incl. 23:59:59)
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setActivePreset('custom');
              }}
              min={startDate}
              className="w-full bg-slate-900 border border-slate-700 text-white font-mono text-sm sm:text-base font-bold px-3 py-2.5 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              style={{ colorScheme: 'dark' }}
            />
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:self-end">
          <button
            onClick={fetchReport}
            disabled={loading}
            className="flex-1 sm:flex-initial px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            title="Refresh date range calculation"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'Refreshing...' : 'Calculate'}</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={!reportData || reportData.transactionCount === 0}
            className="flex-1 sm:flex-initial px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-slate-950 rounded-lg font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95"
            title="Download CSV for NBR Tax Auditor"
          >
            <Download size={15} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-4 bg-red-900/30 border border-red-700/60 rounded-xl text-red-200 text-xs sm:text-sm">
          <strong>Failed to load data:</strong> {error}
        </div>
      )}

      {/* Main KPI Metric Grid */}
      {reportData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Total Revenue */}
            <div className="bg-slate-800/90 p-5 rounded-xl border border-slate-700/80 relative overflow-hidden">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Revenue</p>
                  <p className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono mt-1">
                    BHD {reportData.totalRevenue.toFixed(3)}
                  </p>
                </div>
                <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
                  <TrendingUp size={20} />
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Net Sales: <span className="font-mono text-slate-300 font-bold">BHD {reportData.totalNet.toFixed(3)}</span>
              </p>
            </div>

            {/* Total VAT Collected */}
            <div className="bg-slate-800/90 p-5 rounded-xl border border-slate-700/80 relative overflow-hidden">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total VAT Collected</p>
                  <p className="text-2xl sm:text-3xl font-black text-blue-400 font-mono mt-1">
                    BHD {reportData.totalVat.toFixed(3)}
                  </p>
                </div>
                <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-lg">
                  <DollarSign size={20} />
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Output VAT for Bahrain NBR
              </p>
            </div>

            {/* Transactions Count */}
            <div className="bg-slate-800/90 p-5 rounded-xl border border-slate-700/80 relative overflow-hidden">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Transactions</p>
                  <p className="text-2xl sm:text-3xl font-black text-white font-mono mt-1">
                    {reportData.transactionCount}
                  </p>
                </div>
                <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-lg">
                  <Receipt size={20} />
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Avg Ticket: <span className="font-mono text-slate-300 font-bold">BHD {(reportData.averageTicket || 0).toFixed(3)}</span>
              </p>
            </div>

            {/* Estimated Gross Profit / Margin */}
            <div className="bg-slate-800/90 p-5 rounded-xl border border-slate-700/80 relative overflow-hidden">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Gross Margin</p>
                  <p className="text-2xl sm:text-3xl font-black text-amber-400 font-mono mt-1">
                    {reportData.profitMargin || '0%'}
                  </p>
                </div>
                <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-lg">
                  <Percent size={20} />
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Gross Profit: <span className="font-mono text-slate-300 font-bold">BHD {(reportData.grossProfit || 0).toFixed(3)}</span>
              </p>
            </div>

          </div>

          {/* Payment Breakdown & NBR Tax Supply Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Tender Method Distribution */}
            {reportData.paymentBreakdown && (
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <CreditCard size={15} className="text-emerald-400" /> Tender Method Breakdown
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-400 block font-medium">Cash</span>
                    <span className="text-sm font-black font-mono text-emerald-400">BHD {reportData.paymentBreakdown.CASH.toFixed(3)}</span>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-400 block font-medium">BenefitPay</span>
                    <span className="text-sm font-black font-mono text-red-400">BHD {reportData.paymentBreakdown.BENEFIT_PAY.toFixed(3)}</span>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-400 block font-medium">Card</span>
                    <span className="text-sm font-black font-mono text-blue-400">BHD {reportData.paymentBreakdown.CARD.toFixed(3)}</span>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                    <span className="text-[11px] text-slate-400 block font-medium">Khata Credit</span>
                    <span className="text-sm font-black font-mono text-amber-400">BHD {reportData.paymentBreakdown.CREDIT.toFixed(3)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* NBR Quarterly Return Readiness */}
            {reportData.nbrVatMetrics && (
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-blue-400" /> NBR Return Schedule Audit
                </h4>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                  <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-400 font-sans">10% Standard Supplies:</span>
                    <span className="font-bold text-white">BHD {reportData.nbrVatMetrics.standardRatedNet.toFixed(3)}</span>
                  </div>
                  <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-400 font-sans">0% Basic Food Supplies:</span>
                    <span className="font-bold text-emerald-400">BHD {reportData.nbrVatMetrics.zeroRatedSales.toFixed(3)}</span>
                  </div>
                  <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-400 font-sans">Output Tax Due:</span>
                    <span className="font-bold text-blue-400">BHD {reportData.nbrVatMetrics.outputVatCollected.toFixed(3)}</span>
                  </div>
                  <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-400 font-sans">Total Taxable Turnover:</span>
                    <span className="font-black text-amber-300">BHD {reportData.nbrVatMetrics.totalSupplies.toFixed(3)}</span>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
