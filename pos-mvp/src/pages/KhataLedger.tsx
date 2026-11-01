import { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  RefreshCw, 
  FileText, 
  AlertCircle, 
  Users, 
  CheckCircle, 
  Receipt, 
  Printer,
  X 
} from 'lucide-react';
import { printKhataStatement } from '../utils/printer';

interface KhataLedgerProps {
  apiBase?: string;
}

export default function KhataLedger({ apiBase = 'http://localhost:3000' }: KhataLedgerProps) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statementCustomer, setStatementCustomer] = useState<any | null>(null);
  const [statementSales, setStatementSales] = useState<any[]>([]);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Client-side date range filtering for dispute resolution & targeted monthly thermal printing
  const filteredStatement = useMemo(() => {
    if (!statementSales) return [];

    return statementSales.filter((tx) => {
      if (!startDate && !endDate) return true;

      const dateStr = tx.created_at || tx.timestamp || tx.createdAt;
      const txDate = new Date(dateStr);
      const start = startDate ? new Date(startDate) : new Date('2000-01-01');
      const end = endDate ? new Date(endDate) : new Date('2100-01-01');

      if (endDate) end.setHours(23, 59, 59, 999);

      return txDate >= start && txDate <= end;
    });
  }, [statementSales, startDate, endDate]);

  const loadCustomers = () => {
    fetch(`${apiBase}/khata/ledger?sort=highest`)
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.customers)) {
          setCustomers(data.customers);
        } else if (Array.isArray(data)) {
          setCustomers(data);
        }
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadCustomers();
  }, [apiBase]);

  // Calculate store-wide Khata metrics
  const totalOutstanding = customers.reduce(
    (sum, c) => sum + (Number(c.currentBalance || 0) > 0 ? Number(c.currentBalance || 0) : 0),
    0
  );
  const totalDebtors = customers.filter((c) => Number(c.currentBalance || 0) > 0).length;

  const filtered = customers.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.cpr && c.cpr.toLowerCase().includes(q)) ||
      (c.batchNo && c.batchNo.toLowerCase().includes(q)) ||
      (c.cardUid && c.cardUid.toLowerCase().includes(q))
    );
  });

  const exportToExcel = () => {
    if (customers.length === 0) {
      alert('No customer data to export.');
      return;
    }
    const headers = ['Customer Name', 'Phone / Contact', 'CPR Number', 'Batch / Group No', 'NFC Card UID', 'Outstanding Balance (BD)', 'Notes'];
    const rows = customers.map((c) => [
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      `"${(c.cpr || '').replace(/"/g, '""')}"`,
      `"${(c.batchNo || '').replace(/"/g, '""')}"`,
      `"${(c.cardUid || 'Unlinked').replace(/"/g, '""')}"`,
      Number(c.currentBalance || 0).toFixed(3),
      `"${(c.description || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Khata_Credit_Parties_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const viewStatement = async (customer: any) => {
    setStatementCustomer(customer);
    setLoadingStatement(true);
    try {
      const res = await fetch(`${apiBase}/khata/${customer.id}/statement`);
      const data = await res.json();
      setStatementSales(data.statement || data.sales || []);
    } catch (e) {
      console.error(e);
      setStatementSales([]);
    } finally {
      setLoadingStatement(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Credit Parties (Khata)</h1>
          <p className="text-sm text-slate-500 mt-1">
            Store-wide credit analytics, customer statements, and live debt exposure
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadCustomers}
            className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2 cursor-pointer shadow-sm transition-all"
          >
            <RefreshCw size={16} /> Refresh
          </button>
          <button
            onClick={exportToExcel}
            className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 transition-all"
          >
            <FileText size={18} /> Export to Excel
          </button>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border shadow-sm flex items-center gap-4 border-l-4 border-l-red-500">
          <div className="p-3 bg-red-50 text-red-500 rounded-lg">
            <AlertCircle size={28} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wide">Total Market Credit</p>
            <p className="text-3xl font-black text-slate-900">BD {totalOutstanding.toFixed(3)}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border shadow-sm flex items-center gap-4 border-l-4 border-l-blue-500">
          <div className="p-3 bg-blue-50 text-blue-500 rounded-lg">
            <Users size={28} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wide">Active Debtors</p>
            <p className="text-3xl font-black text-slate-900">{totalDebtors} Customers</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border shadow-sm flex items-center gap-4 border-l-4 border-l-emerald-500">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <CheckCircle size={28} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wide">Total Registered Parties</p>
            <p className="text-3xl font-black text-slate-900">{customers.length} Accounts</p>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Filter by name, phone, CPR, batch, or card..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:border-emerald-500 outline-none bg-white"
            />
          </div>
          <span className="text-xs text-slate-500 font-bold">
            Showing {filtered.length} of {customers.length} Parties
          </span>
        </div>

        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2.5 font-bold text-slate-600">Customer Name</th>
              <th className="px-4 py-2.5 font-bold text-slate-600">Contact & CPR</th>
              <th className="px-4 py-2.5 font-bold text-slate-600">NFC Card ID</th>
              <th className="px-4 py-2.5 font-bold text-slate-600 text-right">Outstanding Balance</th>
              <th className="px-4 py-2.5 font-bold text-slate-600 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filtered.map((customer) => (
              <tr key={customer.id} className="even:bg-slate-50/70 hover:bg-blue-50/70 transition-colors">
                <td
                  className="px-4 py-2 cursor-pointer group"
                  onClick={() => viewStatement(customer)}
                  title="Click to view full Khata statement ledger"
                >
                  <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors flex items-center gap-2">
                    <span className="underline decoration-slate-300 group-hover:decoration-blue-500 underline-offset-4">{customer.name}</span>
                    {customer.batchNo && (
                      <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold no-underline">
                        {customer.batchNo}
                      </span>
                    )}
                  </div>
                  {customer.description && (
                    <div className="text-xs text-slate-400 truncate max-w-xs" title={customer.description}>
                      {customer.description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-600">
                  <div className="text-sm font-medium">{customer.phone || '-'}</div>
                  {customer.cpr && (
                    <div className="text-xs text-slate-500 font-mono">CPR: {customer.cpr}</div>
                  )}
                </td>
                <td className="px-4 py-2 font-mono text-xs">
                  {customer.cardUid ? (
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold border border-blue-200">
                      💳 {customer.cardUid}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">Unlinked</span>
                  )}
                </td>
                <td
                  className={`px-4 py-2 font-black text-right font-mono text-base tabular-nums ${
                    Number(customer.currentBalance || 0) > 0 ? 'text-red-500' : 'text-emerald-600'
                  }`}
                >
                  BD {Number(customer.currentBalance || 0).toFixed(3)}
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => viewStatement(customer)}
                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer active:scale-95 shadow-2xs"
                  >
                    Statement
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-12 text-slate-400 font-bold">
                  No credit customers found{search ? ` matching "${search}"` : ''}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Customer Statement Modal */}
      {statementCustomer && (
        <div
          onClick={() => setStatementCustomer(null)}
          className="fixed inset-0 bg-slate-900/65 z-50 flex items-center justify-center p-6 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95"
          >
            {/* Modal Header */}
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Receipt size={20} className="text-emerald-600" />
                  <span>Khata Statement: {statementCustomer.name}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1 flex gap-3">
                  <span>Card UID: <strong>{statementCustomer.cardUid || 'None'}</strong></span>
                  <span>•</span>
                  <span>
                    Current Debt:{' '}
                    <strong className="text-red-600 font-mono">
                      BD {Number(statementCustomer.currentBalance || 0).toFixed(3)}
                    </strong>
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!statementCustomer) return;
                    const formattedStatement = filteredStatement.map((s) => ({
                      id: s.id,
                      amount: Number(s.amount ?? s.total ?? 0),
                      type: s.type || s.paymentType || 'CHARGE',
                      reference: s.reference || s.invoiceNo || 'Store Purchase',
                      formattedDate: s.formattedDate || new Date(s.created_at || s.timestamp || s.createdAt).toLocaleDateString(),
                      formattedTime: s.formattedTime || new Date(s.created_at || s.timestamp || s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      runningBalance: Number(s.running_balance ?? s.runningBalance ?? s.total ?? 0)
                    }));
                    await printKhataStatement({
                      customerName: statementCustomer.name,
                      customerPhone: statementCustomer.phone,
                      customerCpr: statementCustomer.cpr,
                      statement: formattedStatement,
                      currentBalance: statementCustomer.currentBalance
                    });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
                  title="Print official thermal statement slip on Sunmi printer"
                >
                  <Printer size={14} /> Print Statement Slip
                </button>
                <button
                  onClick={() => {
                    setStatementCustomer(null);
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body with Date Filter Control Bar & Data Table */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {/* Admin Control Bar */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-wrap justify-between items-center gap-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-800">Ledger History</h4>
                  <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                    {filteredStatement.length} Entries
                  </span>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">FROM</label>
                    <input 
                      type="date" 
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white font-medium"
                    />
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">TO</label>
                    <input 
                      type="date" 
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white font-medium"
                    />
                  </div>

                  {(startDate || endDate) && (
                    <button 
                      type="button"
                      onClick={() => { setStartDate(''); setEndDate(''); }}
                      className="text-red-600 hover:text-red-800 text-xs font-bold px-1.5 py-1 cursor-pointer transition-colors"
                    >
                      Clear Filters
                    </button>
                  )}

                  {/* Pass the FILTERED statement to thermal printer function */}
                  <button 
                    type="button"
                    onClick={async () => {
                      if (!statementCustomer) return;
                      const formattedStatement = filteredStatement.map((s) => ({
                        id: s.id,
                        amount: Number(s.amount ?? s.total ?? 0),
                        type: s.type || s.paymentType || 'CHARGE',
                        reference: s.reference || s.invoiceNo || 'Store Purchase',
                        formattedDate: s.formattedDate || new Date(s.created_at || s.timestamp || s.createdAt).toLocaleDateString(),
                        formattedTime: s.formattedTime || new Date(s.created_at || s.timestamp || s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        runningBalance: Number(s.running_balance ?? s.runningBalance ?? s.total ?? 0)
                      }));
                      await printKhataStatement({
                        customerName: statementCustomer.name,
                        customerPhone: statementCustomer.phone,
                        customerCpr: statementCustomer.cpr,
                        statement: formattedStatement,
                        currentBalance: statementCustomer.currentBalance
                      });
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                  >
                    <Printer size={13} />
                    <span>Print Filtered Statement</span>
                  </button>
                </div>
              </div>

              {loadingStatement ? (
                <div className="py-12 text-center text-slate-400">Loading customer transactions...</div>
              ) : (
                /* Admin Data Table */
                <div className="bg-white rounded-xl shadow-xs overflow-hidden border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Ref / Invoice</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Charge/Credit</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Running Balance</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {filteredStatement.map((tx: any) => {
                        const isPayment = tx.type === 'PAYMENT';
                        const isWriteOff = tx.type === 'WRITE_OFF';
                        const dateStr = tx.created_at || tx.timestamp || tx.createdAt;
                        const refText = tx.reference || (tx.type === 'CHARGE' ? (tx.invoiceNo || `INV-${String(tx.id).slice(0, 6)}`) : (isWriteOff ? 'Bad Debt Write-Off' : 'Cash Payment'));
                        const amtVal = Number(tx.amount ?? tx.total ?? 0);
                        const balVal = Number(tx.running_balance ?? tx.runningBalance ?? 0);

                        return (
                          <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 font-mono">
                              {dateStr ? new Date(dateStr).toLocaleString('en-GB') : '-'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-slate-900">
                              <span>{refText}</span>
                              {isWriteOff && (
                                <span className="ml-2 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold">
                                  WRITE-OFF
                                </span>
                              )}
                            </td>
                            <td className={`px-4 py-3 whitespace-nowrap text-xs font-bold text-right font-mono ${isPayment || isWriteOff ? 'text-green-600' : 'text-red-600'}`}>
                              {isPayment || isWriteOff ? '-' : '+'}{amtVal.toFixed(3)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-900 font-bold text-right font-mono">
                              {balVal.toFixed(3)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  
                  {filteredStatement.length === 0 && (
                    <div className="p-8 text-center text-slate-500 font-medium text-sm">
                      No records found for the selected date range.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
