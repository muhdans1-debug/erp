import React, { useState } from 'react';

export interface DeveloperDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
  onOpenServerConfig: () => void;
  hardwareSupported: boolean;
  isScanning: boolean;
  customerScreenReady: boolean;
  lastDetectedUid: string | null;
  simulateScan: (uid: string) => void;
  lastScannedBarcode: string | null;
  handleBarcodeScan: (barcode: string) => void;
  onOpenCashOut: () => void;
}

export const DeveloperDiagnosticsModal: React.FC<DeveloperDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  apiBase,
  onOpenServerConfig,
  hardwareSupported,
  isScanning,
  customerScreenReady,
  lastDetectedUid,
  simulateScan,
  lastScannedBarcode,
  handleBarcodeScan,
  onOpenCashOut,
}) => {
  const [manualUidInput, setManualUidInput] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200">
        <div className="flex justify-between items-center pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛠️</span>
            <h3 className="font-black text-lg text-slate-800">Hardware & Diagnostic Wiring</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="py-4 space-y-4 text-sm max-h-[70vh] overflow-y-auto">
          {/* Master Server IP */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-800">Master Server IP</p>
              <p className="text-xs text-slate-500 font-mono">{apiBase}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenServerConfig();
              }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold cursor-pointer"
            >
              Configure IP
            </button>
          </div>

          {/* NFC Simulator */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <p className="font-bold text-slate-800 mb-1">NFC Status & Simulator</p>
            <p className="text-xs text-slate-500 mb-2">
              Status: <span className="font-bold">{hardwareSupported ? '🟢 Antenna Active' : '🔴 Unavailable'}</span>{' '}
              {isScanning && <span className="text-emerald-600 font-bold">(Scanning)</span>} | Screen 2:{' '}
              <span className="font-bold">{customerScreenReady ? '🟢 Connected' : '⚪ Standalone'}</span> | Last UID:{' '}
              <span className="font-mono">{lastDetectedUid || 'None'}</span>
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => simulateScan('CARD123')}
                className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded font-bold text-xs cursor-pointer"
              >
                ⚡ Tap Ali (CARD123)
              </button>
              <button
                type="button"
                onClick={() => {
                  const b1 = Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
                  const b2 = Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
                  const b3 = Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
                  simulateScan(`08:${b1}:${b2}:${b3}`.toUpperCase());
                }}
                className="px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded font-bold text-xs cursor-pointer"
              >
                📱 Tap iPhone (Random UID)
              </button>
              <div className="flex items-center gap-1.5 ml-auto">
                <input
                  type="text"
                  placeholder="Custom UID..."
                  value={manualUidInput}
                  onChange={(e) => setManualUidInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && manualUidInput.trim()) {
                      simulateScan(manualUidInput.trim());
                      setManualUidInput('');
                    }
                  }}
                  className="px-2 py-1 bg-white border border-slate-300 rounded text-xs w-28 font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (manualUidInput.trim()) {
                      simulateScan(manualUidInput.trim());
                      setManualUidInput('');
                    }
                  }}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-bold cursor-pointer"
                >
                  Simulate
                </button>
              </div>
            </div>
          </div>

          {/* Barcode Testing */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <p className="font-bold text-slate-800 mb-1">Test Barcodes (Scanner Bypass)</p>
            <p className="text-xs text-slate-500 mb-2">
              Last Scanned: <span className="font-mono font-bold text-emerald-700">{lastScannedBarcode || 'None'}</span>
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleBarcodeScan('1')}
                className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded text-xs font-bold cursor-pointer"
              >
                Scan '1' (Perfume)
              </button>
              <button
                type="button"
                onClick={() => handleBarcodeScan('2')}
                className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded text-xs font-bold cursor-pointer"
              >
                Scan '2' (Watch)
              </button>
              <button
                type="button"
                onClick={() => handleBarcodeScan('2200102048003')}
                className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded text-xs font-bold cursor-pointer"
              >
                🥩 Scale Beef 1.5kg (BD 4.800)
              </button>
            </div>
          </div>

          {/* Active Shift Float & Cash Out */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-800">Drawer Cash Float</p>
              <p className="text-xs text-slate-500">
                BD {Number(localStorage.getItem('active_shift_opening_cash') || 0).toFixed(3)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCashOut();
              }}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold cursor-pointer"
            >
              Record Cash Out
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
          <span>Shortcut: Double-click Askar POS or press Ctrl+Shift+D</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold cursor-pointer"
          >
            Close Diagnostic Panel
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeveloperDiagnosticsModal;

