import { useState, useEffect } from 'react';
import {
  Building2,
  Users,
  ShieldCheck,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ArrowRight,
  Printer,
  ChevronRight,
  TrendingUp,
  Store
} from 'lucide-react';
import { playThankYouVoice } from '../utils/sound';

interface SponsoredRoom {
  roomId: string;
  roomName: string;
  workersCount: number;
  leadShopper: string;
  customerId: string;
  balance: number;
  trustScore: number;
  trustTier: 'GOLD' | 'STANDARD' | 'HIGH_RISK';
  isOverdue?: boolean;
}

interface SponsorSummary {
  sponsor: {
    id: string;
    companyName: string;
    crNumber: string;
    contactPerson: string;
    phone: string;
    totalCreditFacility: number;
    settlementCycle: string;
  };
  totalOutstanding: number;
  totalWorkers: number;
  roomsCount: number;
  rooms: SponsoredRoom[];
  flashCampaign?: {
    isActive: boolean;
    discountPercent: number;
    potentialDiscountSavings: number;
    discountedTotalDue: number;
  };
}

interface CorporateSponsorDashboardProps {
  apiBase?: string;
  sponsorId?: string;
}

const DEFAULT_SPONSOR_DATA: SponsorSummary = {
  sponsor: {
    id: 'sp_alnaseem_01',
    companyName: 'Al-Naseem Contracting & MEP Services W.L.L.',
    crNumber: 'CR 98214-02',
    contactPerson: 'Eng. Tariq Al-Mansoor (Camp Operations Director)',
    phone: '+973 3944 8811',
    totalCreditFacility: 1200.000,
    settlementCycle: 'MONTHLY_CONSOLIDATED',
  },
  totalOutstanding: 433.234,
  totalWorkers: 71,
  roomsCount: 8,
  rooms: [
    { roomId: 'room_101', roomName: 'Room 101 — Central HVAC Crew', workersCount: 8, leadShopper: 'Ahmed Noor', customerId: 'cust_nfc_demo_01', balance: 39.334, trustScore: 94, trustTier: 'GOLD' },
    { roomId: 'room_104', roomName: 'Room 104 — MEP Shift A', workersCount: 12, leadShopper: 'Salman Khan', customerId: 'cust_002', balance: 64.200, trustScore: 91, trustTier: 'GOLD' },
    { roomId: 'room_202', roomName: 'Room 202 — Civil Carpenters', workersCount: 10, leadShopper: 'Mohammed Yaseen', customerId: 'cust_003', balance: 52.150, trustScore: 88, trustTier: 'GOLD' },
    { roomId: 'room_205', roomName: 'Room 205 — Heavy Equipment Drivers', workersCount: 6, leadShopper: 'Bilal Farooq', customerId: 'cust_004', balance: 41.300, trustScore: 78, trustTier: 'STANDARD' },
    { roomId: 'room_301', roomName: 'Room 301 — Night Electrical Team', workersCount: 9, leadShopper: 'Rasheed Uddin', customerId: 'cust_005', balance: 75.800, trustScore: 82, trustTier: 'STANDARD' },
    { roomId: 'room_304', roomName: 'Room 304 — Plumbing & Pipefitting', workersCount: 11, leadShopper: 'Gulzar Ahmed', customerId: 'cust_006', balance: 58.450, trustScore: 85, trustTier: 'GOLD' },
    { roomId: 'room_401', roomName: 'Room 401 — Safety & Rigging Crew', workersCount: 7, leadShopper: 'Kareem Buksh', customerId: 'cust_007', balance: 32.100, trustScore: 96, trustTier: 'GOLD' },
    { roomId: 'room_408', roomName: 'Room 408 — Workshop Mechanics', workersCount: 8, leadShopper: 'Javed Iqbal', customerId: 'cust_008', balance: 69.900, trustScore: 72, trustTier: 'STANDARD' },
  ],
  flashCampaign: {
    isActive: true,
    discountPercent: 2,
    potentialDiscountSavings: 8.665,
    discountedTotalDue: 424.569
  }
};

export default function CorporateSponsorDashboard({
  apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://192.168.8.7:3000',
  sponsorId = 'sp_alnaseem_01'
}: CorporateSponsorDashboardProps) {
  const [data, setData] = useState<SponsorSummary>(DEFAULT_SPONSOR_DATA);
  const [isSettling, setIsSettling] = useState(false);
  const [settleSuccess, setSettleSuccess] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const resolveApi = () => {
    if (typeof window === 'undefined') return apiBase;
    const custom = localStorage.getItem('khata_api_base') || localStorage.getItem('khata_tunnel_api');
    if (custom) return custom.replace(/\/+$/, '');
    if (window.location.protocol === 'https:') {
      return '';
    }
    if (window.location.hostname !== 'localhost') {
      return `http://${window.location.hostname}:3000`;
    }
    return apiBase;
  };

  const fetchSummary = async () => {
    try {
      const url = `${resolveApi()}/api/sponsor/${sponsorId}/summary`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load corporate sponsor portfolio');
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (e) {
      console.error('Error fetching sponsor data:', e);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [sponsorId]);

  const handleSettleAll = async () => {
    if (!data || data.totalOutstanding <= 0) return;
    const confirmMsg = `Confirm corporate bulk settlement of BD ${
      data.flashCampaign?.isActive ? data.flashCampaign.discountedTotalDue.toFixed(3) : data.totalOutstanding.toFixed(3)
    } across all ${data.roomsCount} camp rooms via Tap Corporate Bridge?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsSettling(true);
      const url = `${resolveApi()}/api/sponsor/${sponsorId}/settle-all`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: 'TAP_BENEFITPAY_B2B',
          reference: `B2B Settle: ${data.sponsor.companyName}`
        })
      });
      const json = await res.json();
      if (json.success) {
        setSettleSuccess(json);
        fetchSummary();
        playThankYouVoice('KHATA_PAYMENT');
      } else {
        alert(json.error || 'Bulk settlement failed');
      }
    } catch (err: any) {
      alert(`Settlement Error: ${err.message}`);
    } finally {
      setIsSettling(false);
    }
  };

  const filteredRooms = (data.rooms || []).filter(r =>
    r.roomName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.leadShopper.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.roomId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* ──────────────────────────────────────────────────────────────────────────
          TOP B2B CORPORATE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-950/60">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-white tracking-tight">
                  {data?.sponsor.companyName || 'Corporate Sponsor Portal'}
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  {data?.sponsor.crNumber || 'B2B Verified'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                <span>{data?.sponsor.contactPerson}</span>
                <span>•</span>
                <span className="text-emerald-400 font-semibold">Consolidated Food Tab Facility</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white font-bold text-xs flex items-center gap-2 border border-slate-700/80 transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>Consolidated Tax Slip</span>
            </button>
            <button
              onClick={() => {
                if (window.location.search.includes('view=')) {
                  window.location.search = '';
                } else {
                  window.location.href = '/';
                }
              }}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white font-bold text-xs flex items-center gap-2 border border-slate-700/80 transition-all"
            >
              <Store className="w-4 h-4" />
              <span>POS Store</span>
            </button>
          </div>
        </div>
      </header>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN DASHBOARD BODY
          ────────────────────────────────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {/* FLASH RECOVERY BANNER */}
        {data?.flashCampaign?.isActive && (
          <div className="bg-gradient-to-r from-amber-950/80 via-amber-900/60 to-orange-950/80 border border-amber-500/40 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center shrink-0 shadow-lg shadow-amber-950/50">
                  <Zap className="w-6 h-6 text-slate-950 stroke-[3]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-black text-amber-200 uppercase tracking-wide">
                      ⚡ Active Flash Liquidity Incentive ({data.flashCampaign.discountPercent}% Cash Discount)
                    </h2>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 animate-pulse">
                      Live Special
                    </span>
                  </div>
                  <p className="text-xs text-amber-100/80 mt-1 max-w-2xl leading-relaxed">
                    Settle your enterprise tab today to save <strong className="text-white">BD {data.flashCampaign.potentialDiscountSavings.toFixed(3)}</strong>. The 2% discount is automatically deducted and credited upon settlement.
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] text-amber-300/80 uppercase font-bold tracking-wider">Discounted Total Due</p>
                <p className="text-2xl font-black text-amber-300">BD {data.flashCampaign.discountedTotalDue.toFixed(3)}</p>
              </div>
            </div>
          </div>
        )}

        {/* SETTLE SUCCESS CELEBRATION */}
        {settleSuccess && (
          <div className="bg-emerald-950/80 border border-emerald-400/50 rounded-3xl p-5 shadow-2xl animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-slate-950 stroke-[3]" />
                </div>
                <div>
                  <h3 className="text-base font-black text-emerald-300">Enterprise Tab Cleared Successfully!</h3>
                  <p className="text-xs text-emerald-100/80 mt-0.5">
                    Settled BD {settleSuccess.settledAmount.toFixed(3)} across {settleSuccess.clearedRoomsCount} camp groups. Ref: {settleSuccess.transactionRef}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSettleSuccess(null)}
                className="px-3 py-1.5 rounded-xl bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 text-xs font-bold"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* KEY PERFORMANCE & FINANCIAL METRIC TILES */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
              <span>Total Debt Due</span>
              <CreditCard className="w-4 h-4 text-rose-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-rose-400">
                BD {data?.totalOutstanding.toFixed(3) || '0.000'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Combined balance across 15 Mess rooms</p>
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
              <span>Sponsored Workers</span>
              <Users className="w-4 h-4 text-blue-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">
                {data?.totalWorkers || 142}
              </span>
              <span className="text-xs text-slate-400">camp laborers</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Across 8 verified company barracks</p>
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
              <span>Credit Facility</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-400">
                BD {data?.sponsor.totalCreditFacility.toFixed(3) || '1200.000'}
              </span>
            </div>
            <p className="text-[11px] text-emerald-400/80 mt-2">
              BD {Math.max(0, (data?.sponsor.totalCreditFacility || 1200) - (data?.totalOutstanding || 0)).toFixed(3)} available limit
            </p>
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
                <span>Fleet Trust Score</span>
                <TrendingUp className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-black text-amber-400">89 / 100</span>
                <span className="text-xs font-bold text-emerald-400">Tier 1 Gold</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Repayment velocity &lt; 5 days</p>
          </div>
        </div>

        {/* ONE-CLICK SETTLE ALL ACTION BAR */}
        <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-3xl p-6 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              <span>One-Click Corporate Tab Settlement</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                BenefitPay / Tap Bridge
              </span>
            </h2>
            <p className="text-sm text-slate-300">
              Clear all {data?.roomsCount || 0} labor camp Mess accounts simultaneously in one corporate transaction.
            </p>
          </div>

          <button
            onClick={handleSettleAll}
            disabled={isSettling || !data || data.totalOutstanding <= 0}
            className={`px-8 py-4 rounded-2xl font-black text-base shadow-2xl flex items-center gap-3 active:scale-95 transition-all ${
              data && data.totalOutstanding > 0
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/25'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <CreditCard className="w-6 h-6 stroke-[2.5]" />
            <span>
              {isSettling
                ? 'Processing Settlement...'
                : `Settle All (${data?.flashCampaign?.isActive ? `BD ${data.flashCampaign.discountedTotalDue.toFixed(3)}` : `BD ${data?.totalOutstanding.toFixed(3) || '0.000'}`})`}
            </span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        {/* SPONSORED ROOMS & MESS GROUPS ROSTER */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-5 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-black text-white">Sponsored Labor Camp Mess Accounts</h3>
              <p className="text-xs text-slate-400 mt-0.5">Real-time balances and algorithmic credit limits per barracks</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Search Room, Lead Shopper..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-4 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 w-64"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider bg-slate-900/80">
                  <th className="py-3.5 px-5">Barracks / Room Name</th>
                  <th className="py-3.5 px-4">Workers</th>
                  <th className="py-3.5 px-4">Lead Shopper</th>
                  <th className="py-3.5 px-4">Khata Trust Score</th>
                  <th className="py-3.5 px-4">Current Debt</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredRooms.map((room) => (
                  <tr key={room.roomId} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-4 px-5">
                      <div className="font-bold text-white text-sm">{room.roomName}</div>
                      <div className="text-[10px] text-slate-400">{room.roomId.toUpperCase()}</div>
                    </td>
                    <td className="py-4 px-4 text-slate-300">
                      <span className="font-bold text-white">{room.workersCount}</span> men
                    </td>
                    <td className="py-4 px-4 text-slate-300 font-medium">
                      {room.leadShopper}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md font-black text-[10px] ${
                          room.trustTier === 'GOLD'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : room.trustTier === 'STANDARD'
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}>
                          {room.trustScore} / 100
                        </span>
                        <span className="text-[11px] text-slate-400">{room.trustTier}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-black text-sm text-rose-400">
                      BD {room.balance.toFixed(3)}
                    </td>
                    <td className="py-4 px-4">
                      {room.isOverdue ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Overdue (&gt;14d)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Active / Healthy</span>
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-5 text-right">
                      <a
                        href={`/tab/${room.customerId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition-all"
                      >
                        <span>View Statement</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
