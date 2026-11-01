import { useState } from 'react';
import { Cloud, CloudOff, AlertTriangle, RefreshCw, HardDrive, Download, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import { SyncTrafficStatus, BackupResult } from '../hooks/useDisasterRecovery';

interface SyncTrafficLightProps {
  status: SyncTrafficStatus;
  lastSyncTime: Date | null;
  offlineHours: number;
  onSyncNow: () => Promise<any>;
  onBackupNow: () => Promise<BackupResult>;
  isExporting?: boolean;
  className?: string;
}

export default function SyncTrafficLight({
  status,
  lastSyncTime,
  offlineHours,
  onSyncNow,
  onBackupNow,
  isExporting = false,
  className = '',
}: SyncTrafficLightProps) {
  const [showModal, setShowModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [backupNotice, setBackupNotice] = useState<BackupResult | null>(null);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      await onSyncNow();
      console.log("Sync successful!");
    } catch (error) {
      console.error("TURSO SYNC FAILED:", error);
    } finally {
      setSyncing(false);
    }
  };

  const handleManualBackup = async () => {
    const res = await onBackupNow();
    setBackupNotice(res);
  };

  return (
    <>
      {/* ------------------------------------------------------------- */}
      {/* TRAFFIC LIGHT CLOUD ICON (TOP-RIGHT CORNER)                    */}
      {/* ------------------------------------------------------------- */}
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className={`relative flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all shadow-xs cursor-pointer select-none ${status === 'ONLINE'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100'
            : status === 'OFFLINE_WARNING'
              ? 'bg-amber-100 text-amber-900 border border-amber-400 hover:bg-amber-200'
              : status === 'SYNCING'
                ? 'bg-blue-50 text-blue-700 border border-blue-300'
                : 'bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200'
          } ${className}`}
        title={
          status === 'ONLINE'
            ? '🟢 System Online: Local database is synced with Turso Cloud'
            : status === 'OFFLINE_WARNING'
              ? `⚠️ Warning: Offline for ${offlineHours || 24}+ hours! Tap to check router & backup.`
              : status === 'SYNCING'
                ? '🔄 Synchronizing with cloud edge...'
                : '🔴 Offline Mode: Operating on motherboard local.db. Tap to inspect.'
        }
      >
        {status === 'ONLINE' && (
          <>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <Cloud size={15} className="text-emerald-600" />
            <span className="hidden md:inline font-mono text-[11px]">Synced</span>
          </>
        )}

        {status === 'OFFLINE' && (
          <>
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <CloudOff size={15} className="text-rose-600" />
            <span className="hidden md:inline font-mono text-[11px]">Offline</span>
          </>
        )}

        {status === 'OFFLINE_WARNING' && (
          <>
            <AlertTriangle size={15} className="text-amber-700" />
            <span className="font-bold font-mono text-[11px]">Offline &gt;24h</span>
          </>
        )}

        {status === 'SYNCING' && (
          <>
            <RefreshCw size={14} className="text-blue-600 animate-spin" />
            <span className="hidden md:inline font-mono text-[11px]">Syncing...</span>
          </>
        )}
      </button>

      {/* ------------------------------------------------------------- */}
      {/* DISASTER RECOVERY & OFFLINE CONTROL MODAL                      */}
      {/* ------------------------------------------------------------- */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className={`p-4 flex items-center justify-between text-white ${status === 'ONLINE' ? 'bg-slate-900' : status === 'OFFLINE_WARNING' ? 'bg-amber-700' : 'bg-slate-900'
              }`}>
              <div className="flex items-center gap-2.5">
                <ShieldCheck size={20} className="text-emerald-400" />
                <div>
                  <h3 className="font-bold text-sm tracking-tight">Offline Disaster Recovery Protocol</h3>
                  <p className="text-[11px] text-slate-300">Local-First Motherboard Storage & Sync</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5 text-slate-800">
              {/* Traffic Light State Banner */}
              <div className={`p-4 rounded-xl border flex items-start gap-3 ${status === 'ONLINE'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : status === 'OFFLINE_WARNING'
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}>
                {status === 'ONLINE' ? (
                  <Cloud size={24} className="text-emerald-600 shrink-0 mt-0.5" />
                ) : status === 'OFFLINE_WARNING' ? (
                  <AlertTriangle size={24} className="text-amber-600 shrink-0 mt-0.5" />
                ) : (
                  <CloudOff size={24} className="text-rose-600 shrink-0 mt-0.5" />
                )}

                <div>
                  <h4 className="font-extrabold text-sm">
                    {status === 'ONLINE'
                      ? '🟢 Cloud Sync Active (Online)'
                      : status === 'OFFLINE_WARNING'
                        ? `⚠️ Warning: Offline for ${offlineHours || 24}+ Hours`
                        : '🔴 Pure Motherboard Offline Mode (Wi-Fi Down)'}
                  </h4>
                  <p className="text-xs mt-1 leading-relaxed text-slate-600">
                    {status === 'ONLINE'
                      ? 'All sales and Khata entries are saved locally to local.db on this device and synced to Turso Cloud (AWS ap-south-1).'
                      : status === 'OFFLINE_WARNING'
                        ? 'The terminal has been offline for over 24 hours. Sales are safely saved on the motherboard, but check your Wi-Fi router so customer Khata balances can sync!'
                        : 'The Wi-Fi is currently down. Sales continue with 0ms latency directly on local.db. Offline sales will sync automatically when Wi-Fi returns.'}
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono mt-2">
                    Last Cloud Sync: {lastSyncTime ? lastSyncTime.toLocaleTimeString() : 'Never'}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={syncing}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  <RefreshCw size={15} className={syncing ? 'animate-spin text-emerald-400' : ''} />
                  <span>{syncing ? 'Checking Network & Syncing...' : 'Retry Cloud Sync Now'}</span>
                </button>

                {/* PHYSICAL LOCAL BACKUP BUTTON (SD CARD / USB EXPORT) */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                    <HardDrive size={16} className="text-blue-600" />
                    <span>Physical Hardware Disaster Protection</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    If the internet is down for days and you are worried the SUNMI terminal might break, tap below to export a physical copy of <code className="bg-slate-200 px-1 rounded text-slate-800">local.db</code> to an SD Card or USB flash drive.
                  </p>

                  <button
                    type="button"
                    onClick={handleManualBackup}
                    disabled={isExporting}
                    className="mt-2 w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow"
                  >
                    <Download size={15} />
                    <span>{isExporting ? 'Exporting Physical Database...' : 'Backup Database to SD Card / USB'}</span>
                  </button>

                  {backupNotice && (
                    <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>{backupNotice.message}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
