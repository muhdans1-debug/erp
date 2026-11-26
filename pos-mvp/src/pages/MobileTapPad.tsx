import { useState, useEffect, useRef } from 'react';
import { 
  Smartphone, 
  ScanLine, 
  Camera, 
  Search, 
  CheckCircle2, 
  ArrowRight, 
  Copy, 
  Check, 
  RefreshCw, 
  Users, 
  ChevronRight,
  Sparkles,
  Radio
} from 'lucide-react';
import { getApiBaseUrl } from '../utils/apiConfig';
import { playNfcChime } from '../utils/sound';

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  cpr?: string | null;
  balance?: number;
  currentBalance?: number;
  creditLimit?: number;
  credit_limit?: number;
  cardUid?: string | null;
  nfcCardId?: string | null;
  isMess?: boolean;
  group_name?: string;
}

export default function MobileTapPad() {
  const [activeTab, setActiveTab] = useState<'tap' | 'camera' | 'shortcuts'>('tap');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [manualTagInput, setManualTagInput] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [lastBeamed, setLastBeamed] = useState<{ name: string; tagId: string; time: number } | null>(null);
  const [isBeaming, setIsBeaming] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<any>(null);

  const apiBase = getApiBaseUrl();
  const webhookUrl = `${apiBase}/api/nfc/relay?tag_id=TAG_ID&terminalId=iPhone%2016%20Pro&client=ios-relay`;

  // Load Customers for Quick-Tap
  useEffect(() => {
    loadCustomers();
  }, [apiBase]);

  const loadCustomers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/customers`, {
        headers: { 'x-pos-client': 'store-pos' }
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.customers || []);
        setCustomers(list);
      }
    } catch (err) {
      console.warn('Could not fetch customers on mobile:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Beam tag to Cloud Relay
  const beamTagToRelay = async (tagId: string, customerData: any = null) => {
    const clean = tagId.trim().toUpperCase();
    if (!clean) return;

    setIsBeaming(true);
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([40, 30, 40]);
      }
      playNfcChime();

      const res = await fetch(`${apiBase}/api/nfc/relay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pos-client': 'store-pos'
        },
        body: JSON.stringify({
          tag_id: clean,
          terminalId: 'iPhone 16 Pro',
          customer: customerData
        })
      });

      if (res.ok) {
        const data = await res.json();
        const name = data.customer?.name || customerData?.name || clean;
        setLastBeamed({ name, tagId: clean, time: Date.now() });
      }
    } catch (err) {
      console.error('Relay failed:', err);
    } finally {
      setIsBeaming(false);
    }
  };

  // Camera Barcode / QR Scanner using Native BarcodeDetector if available, or HTML5 canvas
  const startCamera = async () => {
    setCameraError(null);
    setCameraActive(true);

    try {
      const constraints = {
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // If BarcodeDetector is available (iOS 17+ Safari has native BarcodeDetector)
      if ('BarcodeDetector' in window) {
        const barcodeDetector = new (window as any).BarcodeDetector({
          formats: ['qr_code', 'ean_13', 'code_128', 'upc_a', 'data_matrix']
        });

        scanIntervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const barcodes = await barcodeDetector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const rawValue = barcodes[0].rawValue;
              if (rawValue) {
                stopCamera();
                beamTagToRelay(rawValue);
              }
            }
          } catch {}
        }, 250);
      }
    } catch (err: any) {
      setCameraError(err?.message || 'Camera access denied');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const filteredCustomers = customers.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.cpr?.includes(q) ||
      c.cardUid?.toLowerCase().includes(q) ||
      c.nfcCardId?.toLowerCase().includes(q)
    );
  });

  const handleCopyUrl = () => {
    navigator.clipboard?.writeText(webhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none pb-12">
      {/* Top Dynamic Island Style Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 border-b border-slate-800/80 px-4 pt-3 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold tracking-tight text-white">iPhone 16 Pro Tap Pad</h1>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-300 font-semibold px-1.5 py-0.5 rounded">Relay</span>
              </div>
              <p className="text-[11px] text-slate-400">Beams taps to Laptop POS in real time</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
            <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
            <span>Online</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 gap-1 mt-3 bg-slate-950 p-1 rounded-xl border border-slate-800/80">
          <button
            onClick={() => { stopCamera(); setActiveTab('tap'); }}
            className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'tap'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Quick Beam</span>
          </button>
          <button
            onClick={() => { setActiveTab('camera'); startCamera(); }}
            className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'camera'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Scan QR</span>
          </button>
          <button
            onClick={() => { stopCamera(); setActiveTab('shortcuts'); }}
            className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'shortcuts'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>NFC Setup</span>
          </button>
        </div>
      </header>

      {/* Real-time Notification Banner */}
      {lastBeamed && (
        <div className="mx-4 mt-3 p-3 bg-gradient-to-r from-emerald-600/20 via-cyan-600/20 to-blue-600/20 border border-emerald-500/40 rounded-2xl flex items-center justify-between shadow-xl animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/30 flex items-center justify-center border border-emerald-400">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-emerald-300">Beamed to Laptop Cart ⚡</p>
              <p className="text-sm font-bold text-white leading-tight">{lastBeamed.name}</p>
            </div>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {new Date(lastBeamed.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      )}

      {/* TAB 1: QUICK BEAM CUSTOMER */}
      {activeTab === 'tap' && (
        <main className="flex-1 p-4 flex flex-col gap-3">
          {/* Direct Card Tag Input */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col gap-2">
            <label className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
              <span>Direct Card UID / NFC ID</span>
              <span className="text-[10px] text-slate-500">Tap or Paste</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. 04A1B2C3D4 or CPR"
                value={manualTagInput}
                onChange={(e) => setManualTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && manualTagInput.trim()) {
                    beamTagToRelay(manualTagInput);
                    setManualTagInput('');
                  }
                }}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
              <button
                disabled={!manualTagInput.trim() || isBeaming}
                onClick={() => {
                  beamTagToRelay(manualTagInput);
                  setManualTagInput('');
                }}
                className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-600/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>Beam</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Customer Search & Fast Tap List */}
          <div className="flex-1 flex flex-col gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search customer by name, phone, or CPR..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold text-slate-400">
                Tap Customer to Link on Laptop ({filteredCustomers.length})
              </span>
              <button
                onClick={loadCustomers}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 max-h-[55vh] pr-0.5">
              {filteredCustomers.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  {isLoading ? 'Loading customers...' : 'No customers match your search.'}
                </div>
              ) : (
                filteredCustomers.map((cust) => {
                  const bal = Number(cust.currentBalance ?? cust.balance ?? 0);
                  const tag = cust.cardUid || cust.nfcCardId || cust.cpr || cust.id;
                  return (
                    <button
                      key={cust.id}
                      onClick={() => beamTagToRelay(tag, cust)}
                      disabled={isBeaming}
                      className="w-full bg-slate-900 hover:bg-slate-800 active:bg-blue-950/40 border border-slate-800/80 hover:border-blue-500/50 rounded-2xl p-3 flex items-center justify-between text-left transition-all active:scale-[0.98] cursor-pointer"
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold text-white truncate">{cust.name}</p>
                          {cust.isMess && (
                            <span className="text-[9px] bg-amber-500/20 text-amber-300 font-semibold px-1.5 py-0.2 rounded">
                              Mess
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">
                          {cust.phone ? `📞 ${cust.phone}` : ''} {cust.cpr ? `• CPR: ${cust.cpr}` : ''}
                        </p>
                      </div>

                      <div className="text-right flex items-center gap-2">
                        <div>
                          <p className={`text-xs font-black ${bal > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            BD {bal.toFixed(3)}
                          </p>
                          <p className="text-[9px] text-slate-500">Khata Owed</p>
                        </div>
                        <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </main>
      )}

      {/* TAB 2: CAMERA QR & BARCODE SCANNER */}
      {activeTab === 'camera' && (
        <main className="flex-1 p-4 flex flex-col gap-3">
          <div className="relative w-full aspect-square bg-black rounded-3xl overflow-hidden border-2 border-cyan-500/40 shadow-2xl flex items-center justify-center">
            {cameraActive ? (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 border-[3px] border-cyan-400/60 rounded-3xl pointer-events-none animate-pulse m-6" />
                <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 text-[11px] text-cyan-300 font-semibold flex items-center gap-1.5">
                  <ScanLine className="w-3.5 h-3.5 animate-spin" />
                  <span>Aim at Customer QR / Barcode</span>
                </div>
              </>
            ) : (
              <div className="p-6 text-center">
                <Camera className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-400 mb-4">
                  {cameraError || 'Camera is currently paused.'}
                </p>
                <button
                  onClick={startCamera}
                  className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-lg"
                >
                  Start Camera
                </button>
              </div>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs text-slate-400 space-y-1.5">
            <p className="font-bold text-white text-sm">📷 iPhone 16 Pro Camera Scanner</p>
            <p>Point your iPhone camera at any customer's physical card barcode, CPR barcode, or digital phone QR pass.</p>
            <p className="text-cyan-400 font-medium">As soon as the code is detected, it beams directly to your laptop register!</p>
          </div>
        </main>
      )}

      {/* TAB 3: APPLE SHORTCUTS NFC AUTOMATION GUIDE */}
      {activeTab === 'shortcuts' && (
        <main className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto">
          <div className="bg-gradient-to-br from-indigo-950/60 to-slate-900 border border-indigo-500/30 rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center shadow-lg">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Physical NFC Tap with iPhone 16 Pro</h2>
                <p className="text-[11px] text-indigo-300">Using Built-in iOS Apple Shortcuts</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Apple allows the iPhone 16 Pro to read plastic NFC cards in the background using the native <strong>Shortcuts</strong> app. Follow these 3 simple steps:
            </p>

            <div className="space-y-3">
              {/* Step 1 */}
              <div className="flex gap-3 items-start bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">1</span>
                <div className="text-xs">
                  <p className="font-bold text-white">Open the Shortcuts App</p>
                  <p className="text-slate-400 mt-0.5">On your iPhone, open <strong>Shortcuts</strong> $\rightarrow$ tap the <strong>Automation</strong> tab at the bottom $\rightarrow$ tap <strong>+ (New Automation)</strong>.</p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-3 items-start bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">2</span>
                <div className="text-xs">
                  <p className="font-bold text-white">Choose "NFC" as Trigger</p>
                  <p className="text-slate-400 mt-0.5">Select <strong>NFC</strong> $\rightarrow$ tap <strong>Scan</strong> $\rightarrow$ hold your customer card to the top-back of your iPhone until it chimes.</p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-3 items-start bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">3</span>
                <div className="text-xs">
                  <p className="font-bold text-white">Add "Get Contents of URL"</p>
                  <p className="text-slate-400 mt-0.5">Add action: <strong>Get Contents of URL</strong> and paste your store relay webhook below:</p>
                </div>
              </div>
            </div>

            {/* Webhook URL Copy Box */}
            <div className="mt-4 p-3 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono text-cyan-400 truncate select-all">
                {webhookUrl}
              </span>
              <button
                onClick={handleCopyUrl}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1 shrink-0 transition-all cursor-pointer"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUrl ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            {/* Test Trigger Button */}
            <button
              onClick={() => beamTagToRelay('IPHONE16_TEST_CARD')}
              disabled={isBeaming}
              className="mt-4 w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Smartphone className="w-4 h-4" />
              <span>Simulate iPhone NFC Tap to Laptop</span>
            </button>
          </div>
        </main>
      )}
    </div>
  );
}
