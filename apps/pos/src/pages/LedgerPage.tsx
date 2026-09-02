import React, { useState, useEffect } from 'react';
import { useAutoBackup } from '../hooks/useAutoBackup';
import { api } from '../api';

export const LedgerPage: React.FC = () => {
  const [parties, setParties] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadLedgerData() {
      setLoading(true);
      try {
        const [custRes, ovRes] = await Promise.all([
          api.get('/customers').catch(() => ({ data: { customers: [] } })),
          api.get('/analytics/overview').catch(() => ({ data: { recentTxns: [] } })),
        ]);

        // Safely extract arrays with strict fallback checks
        const rawParties = custRes.data;
        setParties(
          Array.isArray(rawParties)
            ? rawParties
            : Array.isArray(rawParties?.customers)
            ? rawParties.customers
            : []
        );

        const rawOverview = ovRes.data;
        setActivities(
          Array.isArray(rawOverview)
            ? rawOverview
            : Array.isArray(rawOverview?.recentTxns)
            ? rawOverview.recentTxns
            : []
        );
      } catch (err) {
        console.error('Failed to load ledger records:', err);
        setParties([]);
        setActivities([]);
      } finally {
        setLoading(false);
      }
    }

    loadLedgerData();
  }, []);

  // Hook handles auto-backup on mount + provides backup controls
  const { isBackingUp, lastBackupDate, triggerManualBackup, openBackupDir, error } =
    useAutoBackup(parties, activities);

  const formatBHD = (val: number | string) => {
    const num = Number(val) || 0;
    return `BD ${num.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
  };

  // Safe length checks
  const safeParties = Array.isArray(parties) ? parties : [];
  const safeActivities = Array.isArray(activities) ? activities : [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header & Backup Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Parties Ledger & Recent Activity</h1>
          <p className="text-xs text-slate-500">Day-by-day automatic backup and balance tracking</p>
        </div>

        <div className="flex items-center gap-2.5">
          {error && <span className="text-xs text-rose-600 font-medium">Backup Error: {error}</span>}
          <span className="text-xs text-slate-500 font-medium">
            {isBackingUp ? (
              <span className="text-blue-600 animate-pulse">Backing up...</span>
            ) : lastBackupDate ? (
              <span className="text-emerald-700 font-mono">Last Backup: {lastBackupDate}</span>
            ) : (
              'No backup recorded today'
            )}
          </span>

          <button
            type="button"
            onClick={() => triggerManualBackup()}
            disabled={isBackingUp || loading}
            className="px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-lg bg-white hover:bg-slate-50 text-slate-700 shadow-2xs cursor-pointer disabled:opacity-50 transition"
          >
            Backup Now
          </button>

          <button
            type="button"
            onClick={openBackupDir}
            className="px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 shadow-2xs cursor-pointer transition"
          >
            Open Folder
          </button>
        </div>
      </div>

      {/* Ledger Grid: Parties on the left, Recent Activities on the right */}
      <div className="grid grid-cols-12 gap-6 items-start">
        {/* Parties Balance Table */}
        <div className="col-span-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-bold text-slate-900">Customer Ledgers ({safeParties.length})</h2>
            <span className="text-xs text-slate-400">Receivables & Balances</span>
          </div>

          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px] sticky top-0">
                <tr>
                  <th className="p-2.5 pl-3">Party Name</th>
                  <th className="p-2.5">Phone</th>
                  <th className="p-2.5 text-right pr-3">Balance (BD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {safeParties.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-slate-400 text-xs">
                      {loading ? 'Loading parties...' : 'No parties found.'}
                    </td>
                  </tr>
                ) : (
                  safeParties.map((p) => {
                    const due = Number(p?.currentDue) || 0;
                    return (
                      <tr key={p?.id || Math.random()} className="hover:bg-slate-50">
                        <td className="p-2.5 pl-3 font-semibold text-slate-800">{p?.name || 'Unknown'}</td>
                        <td className="p-2.5 text-slate-500 font-mono text-[11px]">{p?.phone || 'N/A'}</td>
                        <td
                          className={`p-2.5 pr-3 text-right font-black font-mono ${
                            due > 0 ? 'text-rose-600' : due < 0 ? 'text-emerald-600' : 'text-slate-400'
                          }`}
                        >
                          {formatBHD(Math.abs(due))} {due > 0 ? '(Due)' : due < 0 ? '(Adv)' : ''}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Ledger Activity Table */}
        <div className="col-span-5 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-bold text-slate-900">Recent Transactions</h2>
            <span className="text-xs text-slate-400">Activity Log</span>
          </div>

          <div className="overflow-x-auto max-h-96 overflow-y-auto divide-y divide-slate-100">
            {safeActivities.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                {loading ? 'Loading activities...' : 'No recent transactions.'}
              </div>
            ) : (
              safeActivities.map((act) => (
                <div key={act?.id || Math.random()} className="py-2.5 px-2 flex justify-between items-center text-xs hover:bg-slate-50 rounded-lg">
                  <div>
                    <div className="font-bold text-slate-800">{act?.customer?.name || 'Party'}</div>
                    <div className="text-[11px] text-slate-400">
                      {act?.note || (act?.type === 'YOU_GAVE' ? 'Sale / Debit' : 'Payment-In')} •{' '}
                      {act?.createdAt ? new Date(act.createdAt).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                  <div
                    className={`font-black font-mono text-xs ${
                      act?.type === 'YOU_GAVE' ? 'text-rose-600' : 'text-emerald-600'
                    }`}
                  >
                    {act?.type === 'YOU_GAVE' ? '-' : '+'}
                    {formatBHD(act?.amount || 0)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};