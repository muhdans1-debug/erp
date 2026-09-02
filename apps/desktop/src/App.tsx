import { useState } from 'react'
import './App.css'

interface Invoice {
  id: string;
  invoiceNumber: string;
  total: number;
  dueDate: string;
  createdAt: string;
}

interface LedgerData {
  clientId: string;
  name: string;
  accountNumber: string;
  creditLimit: number;
  totalOutstanding: number;
  unpaidInvoices: Invoice[];
}

export default function App() {
  const [ledger, setLedger] = useState<LedgerData | null>(null)
  const [loading, setLoading] = useState(false)
  const [settling, setSettling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const fetchLedger = async () => {
    setLoading(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const res = await fetch('http://localhost:4000/api/ledger/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: '4ad603b6-087a-4388-8883-cfa55d5e64ff',
          accountNumber: 'CUST-884',
        }),
      })
      const json = await res.json()
      if (json.success) {
        setLedger(json.data)
      } else {
        setError(json.error || 'Failed to fetch ledger')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const settleInvoice = async (invoiceId: string) => {
    setSettling(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const res = await fetch('http://localhost:4000/api/clients/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceIds: [invoiceId],
        }),
      })
      const json = await res.json()
      if (json.success) {
        setSuccessMsg('Invoice settled successfully!')
        await fetchLedger()
      } else {
        setError(json.error || 'Failed to settle invoice')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSettling(false)
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto text-left w-full my-auto">
      <h1 className="text-4xl font-bold mb-2">ERP Ledger Dashboard</h1>
      <p className="text-base text-[var(--text)] mb-6">
        Connected to Fastify backend API. Real-time client ledger & debt settlement.
      </p>

      <div className="flex gap-3 items-center">
        <button
          type="button"
          onClick={fetchLedger}
          disabled={loading}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition shadow-md cursor-pointer disabled:opacity-50"
        >
          {loading ? 'Fetching Ledger...' : 'Fetch Rahul K. Ledger (CUST-884)'}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          Error: {error}
        </div>
      )}

      {successMsg && (
        <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">
          {successMsg}
        </div>
      )}

      {ledger && (
        <div className="mt-8 space-y-6">
          {/* Summary Card */}
          <div className="p-6 border border-slate-700 rounded-2xl bg-slate-800/60 shadow-lg">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold text-white">{ledger.name}</h2>
                <p className="text-sm font-mono text-indigo-400">{ledger.accountNumber}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-slate-400">TOTAL OUTSTANDING</p>
                <p className="text-2xl font-bold text-amber-400">
                  ${ledger.totalOutstanding.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-700/60 text-sm">
              <div>
                <span className="text-slate-400">Credit Limit:</span>{' '}
                <span className="font-medium text-white">${ledger.creditLimit.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-400">Unpaid Invoices:</span>{' '}
                <span className="font-medium text-white">{ledger.unpaidInvoices.length}</span>
              </div>
            </div>
          </div>

          {/* Invoices List */}
          <div className="border border-slate-700 rounded-2xl bg-slate-800/40 overflow-hidden shadow-lg">
            <div className="p-4 bg-slate-800/80 border-b border-slate-700 font-semibold text-sm text-slate-200">
              Unpaid Credit Invoices
            </div>

            {ledger.unpaidInvoices.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">
                No unpaid invoices. Client account is settled.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-700/60 text-xs text-slate-400 bg-slate-800/30">
                    <th className="p-3.5 pl-4">INVOICE #</th>
                    <th className="p-3.5">AMOUNT</th>
                    <th className="p-3.5">DUE DATE</th>
                    <th className="p-3.5 text-right pr-4">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {ledger.unpaidInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-800/50 transition">
                      <td className="p-3.5 pl-4 font-mono text-indigo-400 font-medium">
                        {inv.invoiceNumber}
                      </td>
                      <td className="p-3.5 font-bold text-white">
                        ${inv.total.toFixed(2)}
                      </td>
                      <td className="p-3.5 text-slate-300">
                        {new Date(inv.dueDate).toLocaleDateString()}
                      </td>
                      <td className="p-3.5 text-right pr-4">
                        <button
                          type="button"
                          onClick={() => settleInvoice(inv.id)}
                          disabled={settling}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 cursor-pointer"
                        >
                          {settling ? 'Settling...' : 'Mark Paid'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}