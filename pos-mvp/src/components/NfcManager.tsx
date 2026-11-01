import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  CreditCard, Users, User, Search, RefreshCw, CheckCircle, AlertCircle, 
  Trash2, Copy, Check, ArrowUpDown, Plus, X, Radio, 
  ExternalLink, Banknote
} from 'lucide-react';

interface NfcCardItem {
  tag_id: string;
  card_type: 'PERSONAL' | 'MESS' | 'DUAL';
  customer_id?: string;
  mess_id?: string;
  group_name?: string | null;
  name: string;
  balance: number;
  personalBalance?: number;
  messBalance?: number;
  cpr?: string | null;
  phone?: string | null;
  batchNo?: string | null;
  memberCount?: number;
  members?: any[];
  createdAt?: string | null;
}

interface NfcManagerProps {
  apiBase?: string;
  onOpenCustomerStatement?: (customer: any) => void;
  onNavigateToKhata?: () => void;
}

export default function NfcManager({
  apiBase = 'http://localhost:3000',
  onOpenCustomerStatement,
  onNavigateToKhata
}: NfcManagerProps) {
  // Navigation Tab
  const [activeTab, setActiveTab] = useState<'CARDS' | 'MESS_GROUPS'>('CARDS');

  // State
  const [cards, setCards] = useState<NfcCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalCards: 0,
    personalCards: 0,
    messCards: 0,
    dualCards: 0,
    totalOutstanding: 0
  });

  // Search & Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'PERSONAL' | 'MESS' | 'DUAL' | 'DEBTORS'>('ALL');
  const [sortOption, setSortOption] = useState<'highest' | 'lowest' | 'alpha_asc' | 'alpha_desc' | 'uid' | 'recent'>('highest');

  // Live Scanned Card Spotlight (from Sunmi Hardware Bridge)
  const [activeScannedCard, setActiveScannedCard] = useState<any | null>(null);
  const [isUnregisteredTap, setIsUnregisteredTap] = useState(false);
  const [isBridgeConnected, setIsBridgeConnected] = useState(false);
  const [recentScansLog, setRecentScansLog] = useState<{ id: string; tag_id: string; timestamp: string; partyName?: string; isNew: boolean }[]>([]);
  const lastProcessedTimeRef = useRef<number>(0);

  // On-Demand Remote Scan Controls
  const [scanStatus, setScanStatus] = useState<'IDLE' | 'WAITING' | 'PROCESSING'>('IDLE');
  const wsRef = useRef<WebSocket | null>(null);

  const triggerRemoteScan = () => {
    setScanStatus('WAITING');
    setActiveScannedCard(null);
    setIsUnregisteredTap(false);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'REQUEST_MANAGER_SCAN' }));
    }
  };

  const cancelRemoteScan = () => {
    setScanStatus('IDLE');
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'MANAGER_SCAN_COMPLETE' }));
    }
  };

  // Manual Simulator / Tester
  const [simulatedTagInput, setSimulatedTagInput] = useState('');

  // Quick Assignment Modal / Inline Form State
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTagId, setAssignTagId] = useState('');
  const [assignType, setAssignType] = useState<'PERSONAL' | 'MESS'>('PERSONAL');
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [personalMessGroupId, setPersonalMessGroupId] = useState('');
  const [messGroupsList, setMessGroupsList] = useState<any[]>([]);
  const [selectedMessGroupId, setSelectedMessGroupId] = useState('');
  const [newMessGroupName, setNewMessGroupName] = useState('');
  const [messMemberIds, setMessMemberIds] = useState<string[]>([]);
  const [assignMemberSearch, setAssignMemberSearch] = useState('');

  // Mess Group Roster Management State
  const [showMessRosterModal, setShowMessRosterModal] = useState(false);
  const [selectedMessGroupForEdit, setSelectedMessGroupForEdit] = useState<any | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupTagId, setEditGroupTagId] = useState('');
  const [editGroupMembers, setEditGroupMembers] = useState<string[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  
  // Quick Create Customer on-the-fly
  const [showQuickCreateCustomer, setShowQuickCreateCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustCpr, setNewCustCpr] = useState('');
  const [newCustBatch, setNewCustBatch] = useState('');

  // Action status
  const [actionLoading, setActionLoading] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedTagId, setCopiedTagId] = useState<string | null>(null);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setNotificationMsg({ type, text });
    setTimeout(() => setNotificationMsg(null), 3500);
  };

  // 1. Fetch Enrolled Cards & Metadata
  const loadCardsData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${apiBase}/api/nfc/cards?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.cards)) {
          setCards(data.cards);
          if (data.stats) {
            setStats(data.stats);
          }
        }
      }
    } catch (err: any) {
      console.warn('Failed to fetch cards:', err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Fetch Customer Directory for Assignment
  const loadCustomers = async () => {
    try {
      const res = await fetch(`${apiBase}/khata/ledger?sort=alpha`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setCustomersList(data);
        else if (data?.customers) setCustomersList(data.customers);
      }
    } catch {}
  };

  // 3. Fetch Mess Groups
  const loadMessGroups = async () => {
    try {
      const res = await fetch(`${apiBase}/api/nfc/mess-groups`);
      if (res.ok) {
        const data = await res.json();
        if (data?.messGroups) setMessGroupsList(data.messGroups);
      }
    } catch {}
  };

  useEffect(() => {
    loadCardsData();
    loadCustomers();
    loadMessGroups();
  }, [apiBase]);

  // 4. WebSocket & HTTP Bridge Listener for Sunmi Hardware NFC Taps
  useEffect(() => {
    let unmounted = false;
    let ws: WebSocket | null = null;
    let pollInterval: any = null;

    const handleHardwareTap = async (tagId: string, preloadedCustomer?: any) => {
      const cleanId = (tagId || '').trim().toUpperCase();
      if (!cleanId) return;

      console.log(`📡 [NFC Manager Hub] Sunmi Hardware NFC Tap Received: ${cleanId}`);

      if (preloadedCustomer) {
        const resolvedType = preloadedCustomer.card_type || (preloadedCustomer.isMess ? 'MESS' : (preloadedCustomer.mess_id ? 'DUAL' : 'PERSONAL'));
        setActiveScannedCard({
          tag_id: cleanId,
          card_type: resolvedType,
          ...preloadedCustomer
        });
        setIsUnregisteredTap(false);
        setRecentScansLog(prev => [
          { id: String(Date.now()), tag_id: cleanId, timestamp: new Date().toLocaleTimeString(), partyName: preloadedCustomer.name, isNew: false },
          ...prev.slice(0, 9)
        ]);
        return;
      }

      // Lookup details
      try {
        const res = await fetch(`${apiBase}/api/customers/nfc/${encodeURIComponent(cleanId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.customer) {
            const resolvedType = data.customer.card_type || (data.customer.isMess ? 'MESS' : (data.customer.mess_id ? 'DUAL' : 'PERSONAL'));
            setActiveScannedCard({
              tag_id: cleanId,
              card_type: resolvedType,
              ...data.customer
            });
            setIsUnregisteredTap(false);

            setRecentScansLog(prev => [
              { id: String(Date.now()), tag_id: cleanId, timestamp: new Date().toLocaleTimeString(), partyName: data.customer.name, isNew: false },
              ...prev.slice(0, 9)
            ]);
            return;
          }
        }
      } catch {}

      // Check if it's already in loaded cards list
      const matched = cards.find(c => c.tag_id.toUpperCase() === cleanId || c.tag_id.replace(/:/g, '').toUpperCase() === cleanId.replace(/:/g, ''));
      if (matched) {
        setActiveScannedCard(matched);
        setIsUnregisteredTap(false);
        setRecentScansLog(prev => [
          { id: String(Date.now()), tag_id: cleanId, timestamp: new Date().toLocaleTimeString(), partyName: matched.name, isNew: false },
          ...prev.slice(0, 9)
        ]);
        return;
      }

      // If unresolved, trigger Unregistered Spotlight
      setActiveScannedCard({ tag_id: cleanId });
      setIsUnregisteredTap(true);
      setAssignTagId(cleanId);
      setRecentScansLog(prev => [
        { id: String(Date.now()), tag_id: cleanId, timestamp: new Date().toLocaleTimeString(), partyName: 'Unregistered Card', isNew: true },
        ...prev.slice(0, 9)
      ]);
    };

    const connectWebSocket = () => {
      if (unmounted) return;
      try {
        ws = new WebSocket('ws://localhost:8080');
        ws.onopen = () => {
          setIsBridgeConnected(true);
          wsRef.current = ws;
        };
        ws.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'MANAGER_SCAN_RESULT' || data.type === 'NFC_SCANNED' || data.type === 'UNKNOWN_NFC_SCANNED') {
              const tag = data.payload?.tag_id || data.payload?.id;
              if (tag) {
                lastProcessedTimeRef.current = Date.now();
                await handleHardwareTap(tag, data.payload?.customer);
                // CRUCIAL: ONLY send MANAGER_SCAN_COMPLETE if this was an explicitly commanded manager scan!
                // Routine cashier counter taps (NFC_SCANNED) must NEVER trigger hardware shutdown!
                if (data.type === 'MANAGER_SCAN_RESULT') {
                  setScanStatus('IDLE');
                  if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'MANAGER_SCAN_COMPLETE' }));
                  }
                }
              }
            }
          } catch (err) {
            console.warn('WS message parse error:', err);
          }
        };
        ws.onerror = () => {
          setIsBridgeConnected(false);
          ws?.close();
        };
        ws.onclose = () => {
          setIsBridgeConnected(false);
          wsRef.current = null;
          if (!unmounted) setTimeout(connectWebSocket, 3000);
        };
      } catch {
        setIsBridgeConnected(false);
      }
    };

    connectWebSocket();

    // Fallback Poller to Fastify /api/nfc/latest
    pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${apiBase}/api/nfc/latest`);
        if (res.ok) {
          const data = await res.json();
          if (data?.latest?.tag_id && data.latest.timestamp > lastProcessedTimeRef.current) {
            lastProcessedTimeRef.current = data.latest.timestamp;
            await handleHardwareTap(data.latest.tag_id, data.latest.customer);
          }
        }
      } catch {}
    }, 2000);

    return () => {
      unmounted = true;
      clearInterval(pollInterval);
      ws?.close();
      wsRef.current = null;
    };
  }, [apiBase, cards]);

  // Handle Manual Simulator
  const handleSimulateTap = () => {
    if (!simulatedTagInput.trim()) return;
    const clean = simulatedTagInput.trim().toUpperCase();
    fetch(`${apiBase}/api/nfc/relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: clean })
    }).catch(() => {});
    setSimulatedTagInput('');
  };

  // Copy Tag to Clipboard
  const handleCopyTag = (uid: string) => {
    navigator.clipboard?.writeText(uid);
    setCopiedTagId(uid);
    setTimeout(() => setCopiedTagId(null), 1800);
  };

  // Submit Card Assignment
  const handleSaveAssignment = async () => {
    const cleanTag = assignTagId.trim().toUpperCase();
    if (!cleanTag) {
      showNotification('error', 'Please enter a valid NFC Tag ID.');
      return;
    }

    setActionLoading(true);
    try {
      if (assignType === 'PERSONAL') {
        let finalCustomerId = selectedCustomerId;

        // If creating customer on-the-fly
        if (showQuickCreateCustomer) {
          if (!newCustName.trim()) {
            showNotification('error', 'Customer name is required.');
            setActionLoading(false);
            return;
          }

          const createRes = await fetch(`${apiBase}/api/customers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: newCustName.trim(),
              phone: newCustPhone.trim() || null,
              cpr: newCustCpr.trim() || null,
              batchNo: newCustBatch.trim() || null
            })
          });

          const createData = await createRes.json();
          if (!createData?.success || !createData?.customer?.id) {
            showNotification('error', createData?.error || 'Failed to create new customer');
            setActionLoading(false);
            return;
          }
          finalCustomerId = createData.customer.id;
        }

        if (!finalCustomerId) {
          showNotification('error', 'Please select or create a customer to link.');
          setActionLoading(false);
          return;
        }

        const assignRes = await fetch(`${apiBase}/api/nfc/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tag_id: cleanTag,
            card_type: 'PERSONAL',
            customer_id: finalCustomerId,
            mess_id: personalMessGroupId || null
          })
        });

        const assignData = await assignRes.json();
        if (assignData?.success) {
          showNotification('success', `Card ${cleanTag} linked successfully to customer!`);
          setShowAssignModal(false);
          setActiveScannedCard(null);
          setIsUnregisteredTap(false);
          resetAssignmentForm();
          loadCardsData();
          loadCustomers();
          loadMessGroups();
        } else {
          showNotification('error', assignData?.error || 'Failed to assign card');
        }
      } else {
        // MESS Group Assignment
        if (!selectedMessGroupId && !newMessGroupName.trim()) {
          showNotification('error', 'Select an existing Mess Group or enter a new group name.');
          setActionLoading(false);
          return;
        }

        const assignRes = await fetch(`${apiBase}/api/nfc/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tag_id: cleanTag,
            card_type: 'MESS',
            mess_id: selectedMessGroupId || null,
            mess_name: newMessGroupName.trim() || null,
            member_ids: messMemberIds
          })
        });

        const assignData = await assignRes.json();
        if (assignData?.success) {
          showNotification('success', `Mess Card ${cleanTag} activated successfully!`);
          setShowAssignModal(false);
          setActiveScannedCard(null);
          setIsUnregisteredTap(false);
          resetAssignmentForm();
          loadCardsData();
          loadMessGroups();
        } else {
          showNotification('error', assignData?.error || 'Failed to assign mess card');
        }
      }
    } catch (err: any) {
      showNotification('error', err.message || 'Error assigning card');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Mess Roster Modal
  const handleOpenMessRosterModal = (group?: any) => {
    if (!group || group.id === 'new') {
      setSelectedMessGroupForEdit({ id: 'new', group_name: '', assignedCard: '', members: [] });
      setEditGroupName('');
      setEditGroupTagId('');
      setEditGroupMembers([]);
    } else {
      setSelectedMessGroupForEdit(group);
      setEditGroupName(group.group_name || '');
      setEditGroupTagId(group.assignedCard || '');
      setEditGroupMembers(Array.isArray(group.members) ? group.members.map((m: any) => m.id) : []);
    }
    setMemberSearchQuery('');
    setShowMessRosterModal(true);
  };

  // Save updated Mess Roster (or create new group)
  const handleSaveMessRoster = async () => {
    if (!selectedMessGroupForEdit) return;
    if (!editGroupName.trim()) {
      showNotification('error', 'Group name is required.');
      return;
    }
    setActionLoading(true);
    try {
      const isNew = selectedMessGroupForEdit.id === 'new';
      const url = isNew 
        ? `${apiBase}/api/nfc/mess-groups`
        : `${apiBase}/api/nfc/mess-groups/${selectedMessGroupForEdit.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_name: editGroupName.trim(),
          member_ids: editGroupMembers,
          tag_id: editGroupTagId.trim() || null
        })
      });
      const data = await res.json();
      if (data?.success) {
        showNotification('success', isNew 
          ? `Mess Group "${editGroupName}" created with ${editGroupMembers.length} workers!`
          : `Mess Group "${data.messGroup?.group_name || editGroupName}" roster updated with ${editGroupMembers.length} members!`);
        setShowMessRosterModal(false);
        setSelectedMessGroupForEdit(null);
        loadMessGroups();
        loadCardsData();
      } else {
        showNotification('error', data?.error || 'Failed to save mess group');
      }
    } catch (err: any) {
      showNotification('error', err.message || 'Error saving mess group');
    } finally {
      setActionLoading(false);
    }
  };

  // Disband Mess Group
  const handleDeleteMessGroup = async (groupId: string, groupName: string) => {
    if (!confirm(`Are you sure you want to disband Mess Group "${groupName}"? Workers will remain in directory, but will be unlinked from this group.`)) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/nfc/mess-groups/${groupId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data?.success) {
        showNotification('success', `Mess Group "${groupName}" disbanded successfully.`);
        loadMessGroups();
        loadCardsData();
      } else {
        showNotification('error', data?.error || 'Failed to disband group');
      }
    } catch (err: any) {
      showNotification('error', err.message || 'Error deleting group');
    } finally {
      setActionLoading(false);
    }
  };

  // Unlink / Erase Card
  const handleUnlinkCard = async (tagId: string) => {
    if (!confirm(`Are you sure you want to unlink card [${tagId}]? The customer will no longer be able to tap with this card.`)) {
      return;
    }

    try {
      const res = await fetch(`${apiBase}/api/nfc/unlink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_id: tagId })
      });
      const data = await res.json();
      if (data?.success) {
        showNotification('success', `Card ${tagId} unlinked successfully.`);
        if (activeScannedCard?.tag_id === tagId) {
          setActiveScannedCard(null);
        }
        loadCardsData();
      } else {
        showNotification('error', data?.error || 'Failed to unlink card');
      }
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to unlink card');
    }
  };

  const resetAssignmentForm = () => {
    setAssignTagId('');
    setSelectedCustomerId('');
    setSelectedMessGroupId('');
    setNewMessGroupName('');
    setPersonalMessGroupId('');
    setMessMemberIds([]);
    setAssignMemberSearch('');
    setShowQuickCreateCustomer(false);
    setNewCustName('');
    setNewCustPhone('');
    setNewCustCpr('');
    setNewCustBatch('');
  };

  // Filter & Sort Logic ("move all sort nfc")
  const filteredAndSortedCards = useMemo(() => {
    let result = [...cards];

    // 1. Search Query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => 
        (c.tag_id || '').toLowerCase().includes(q) ||
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.cpr || '').toLowerCase().includes(q) ||
        (c.batchNo || '').toLowerCase().includes(q)
      );
    }

    // 2. Type Filter
    if (typeFilter === 'PERSONAL') {
      result = result.filter(c => c.card_type === 'PERSONAL');
    } else if (typeFilter === 'MESS') {
      result = result.filter(c => c.card_type === 'MESS');
    } else if (typeFilter === 'DUAL') {
      result = result.filter(c => c.card_type === 'DUAL');
    } else if (typeFilter === 'DEBTORS') {
      result = result.filter(c => (Number(c.balance || 0)) > 0);
    }

    // 3. Sorting
    result.sort((a, b) => {
      const balA = Number(a.balance || 0);
      const balB = Number(b.balance || 0);

      switch (sortOption) {
        case 'highest':
          return balB - balA;
        case 'lowest':
          return balA - balB;
        case 'alpha_asc':
          return (a.name || '').localeCompare(b.name || '');
        case 'alpha_desc':
          return (b.name || '').localeCompare(a.name || '');
        case 'uid':
          return (a.tag_id || '').localeCompare(b.tag_id || '');
        case 'recent':
          return (new Date(b.createdAt || 0).getTime()) - (new Date(a.createdAt || 0).getTime());
        default:
          return balB - balA;
      }
    });

    return result;
  }, [cards, searchQuery, typeFilter, sortOption]);

  // Mess Groups filter & sort
  const filteredAndSortedMessGroups = useMemo(() => {
    let result = [...messGroupsList];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(g => 
        (g.group_name || '').toLowerCase().includes(q) ||
        (g.assignedCard || '').toLowerCase().includes(q) ||
        (Array.isArray(g.members) && g.members.some((m: any) => (m.name || '').toLowerCase().includes(q) || (m.cpr && m.cpr.includes(q))))
      );
    }

    result.sort((a, b) => {
      const balA = Number(a.totalBalance || 0);
      const balB = Number(b.totalBalance || 0);
      switch (sortOption) {
        case 'highest':
          return balB - balA;
        case 'lowest':
          return balA - balB;
        case 'alpha_asc':
          return (a.group_name || '').localeCompare(b.group_name || '');
        case 'alpha_desc':
          return (b.group_name || '').localeCompare(a.group_name || '');
        case 'uid':
          return (a.assignedCard || '').localeCompare(b.assignedCard || '');
        default:
          return balB - balA;
      }
    });

    return result;
  }, [messGroupsList, searchQuery, sortOption]);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-150">
      {/* Toast Notification */}
      {notificationMsg && (
        <div className={`fixed top-4 right-8 z-50 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-bold border transition ${
          notificationMsg.type === 'success' 
            ? 'bg-emerald-600 text-white border-emerald-400' 
            : 'bg-rose-600 text-white border-rose-400'
        }`}>
          {notificationMsg.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{notificationMsg.text}</span>
        </div>
      )}

      {/* Header Banner & Live Hardware Antenna Link */}
      <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black shadow-lg">
                <CreditCard size={26} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                    NFC Card Manager
                  </h1>
                  <span className="px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full">
                    Hardware Relay
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Remote contactless card reader powered by physical Sunmi terminal across local network.
                </p>
              </div>
            </div>
          </div>

          {/* Connection Status & Live Antenna Badge */}
          <div className="flex flex-wrap items-center gap-3">
            <div className={`px-4 py-2.5 rounded-2xl border text-xs font-bold flex items-center gap-2.5 shadow-sm ${
              isBridgeConnected 
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300' 
                : 'bg-amber-950/80 border-amber-500/50 text-amber-300'
            }`}>
              <span className={`w-2.5 h-2.5 rounded-full ${isBridgeConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>
                {isBridgeConnected ? 'Sunmi POS Terminal Linked (0ms Relay)' : 'Connecting Bridge Hub (:8080)...'}
              </span>
            </div>

            <button
              onClick={() => {
                resetAssignmentForm();
                setShowAssignModal(true);
              }}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-2xl shadow-lg transition flex items-center gap-2 cursor-pointer"
            >
              <Plus size={16} />
              <span>Enroll New Card</span>
            </button>
          </div>
        </div>

        {/* On-Demand Remote Hardware Scan Bar */}
        <div className="mt-6 pt-6 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {scanStatus === 'IDLE' ? (
              <button
                onClick={triggerRemoteScan}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm rounded-2xl shadow-xl transition flex items-center gap-2.5 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <Radio className="animate-pulse" size={18} />
                <span>Scan Customer Card (On-Demand)</span>
              </button>
            ) : scanStatus === 'WAITING' ? (
              <button
                onClick={cancelRemoteScan}
                className="px-6 py-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 font-black text-xs sm:text-sm rounded-2xl shadow-xl transition flex items-center gap-2.5 cursor-pointer"
              >
                <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping shrink-0" />
                <span>Tap Card on Sunmi Terminal Now... (Click to Cancel)</span>
              </button>
            ) : (
              <div className="px-6 py-3 bg-blue-950/80 border border-blue-500/50 text-blue-300 font-black text-xs sm:text-sm rounded-2xl flex items-center gap-2.5">
                <RefreshCw className="animate-spin text-blue-400" size={18} />
                <span>Reading Card & Fetching Profile...</span>
              </div>
            )}

            <p className="text-xs text-slate-400 font-medium">
              {scanStatus === 'WAITING' 
                ? 'Sunmi hardware transceiver is active. Screen locked until tap.' 
                : 'Zero battery drain: NFC antenna activates only on demand.'}
            </p>
          </div>

          {/* Manual Simulator */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <input
              type="text"
              placeholder="Test UID (e.g. 04:8A:21:5A)..."
              value={simulatedTagInput}
              onChange={(e) => setSimulatedTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSimulateTap()}
              className="px-3.5 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-44 font-mono"
            />
            <button
              onClick={handleSimulateTap}
              disabled={!simulatedTagInput.trim()}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Simulate Tap
            </button>
          </div>
        </div>
      </div>

      {/* Active Card Spotlight (Appears whenever a card is tapped on Sunmi) */}
      {activeScannedCard && (
        <div className={`p-6 rounded-3xl shadow-xl border-2 transition animate-in slide-in-from-top-4 duration-200 ${
          isUnregisteredTap 
            ? 'bg-amber-50/90 border-amber-500 text-amber-950' 
            : activeScannedCard.card_type === 'MESS' || activeScannedCard.isMess
            ? 'bg-indigo-50/90 border-indigo-500 text-indigo-950'
            : activeScannedCard.card_type === 'DUAL' || activeScannedCard.isDual
            ? 'bg-purple-50/90 border-purple-500 text-purple-950'
            : 'bg-emerald-50/90 border-emerald-500 text-slate-900'
        }`}>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-white shrink-0 shadow-md ${
                isUnregisteredTap 
                  ? 'bg-amber-600' 
                  : activeScannedCard.card_type === 'MESS' || activeScannedCard.isMess
                  ? 'bg-indigo-600'
                  : activeScannedCard.card_type === 'DUAL' || activeScannedCard.isDual
                  ? 'bg-purple-600'
                  : 'bg-emerald-600'
              }`}>
                {isUnregisteredTap ? <AlertCircle size={30} /> : (activeScannedCard.card_type === 'MESS' || activeScannedCard.isMess) ? <Users size={30} /> : <CreditCard size={30} />}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-full ${
                    isUnregisteredTap 
                      ? 'bg-amber-200 text-amber-900 border border-amber-300' 
                      : (activeScannedCard.card_type === 'MESS' || activeScannedCard.isMess)
                      ? 'bg-indigo-200 text-indigo-900 border border-indigo-300'
                      : (activeScannedCard.card_type === 'DUAL' || activeScannedCard.isDual)
                      ? 'bg-purple-200 text-purple-900 border border-purple-300'
                      : 'bg-emerald-200 text-emerald-900 border border-emerald-300'
                  }`}>
                    {isUnregisteredTap 
                      ? '⚠️ Unregistered Card Tapped on Sunmi' 
                      : (activeScannedCard.card_type === 'MESS' || activeScannedCard.isMess)
                      ? '👥 Mess Group Card'
                      : (activeScannedCard.card_type === 'DUAL' || activeScannedCard.isDual)
                      ? '💳 Dual-Wallet Card'
                      : '👤 Personal Customer Card'}
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-600 flex items-center gap-1.5">
                    UID: {activeScannedCard.tag_id}
                    <button 
                      onClick={() => handleCopyTag(activeScannedCard.tag_id)} 
                      className="hover:text-slate-900 transition"
                      title="Copy UID"
                    >
                      {copiedTagId === activeScannedCard.tag_id ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                    </button>
                  </span>
                </div>

                <h2 className="text-2xl font-black tracking-tight mt-1">
                  {isUnregisteredTap 
                    ? 'New Unassigned NFC Card' 
                    : (activeScannedCard.card_type === 'MESS' || activeScannedCard.isMess)
                    ? (activeScannedCard.group_name || activeScannedCard.name)
                    : activeScannedCard.name}
                </h2>

                {!isUnregisteredTap && (
                  <div className="text-xs text-slate-600 mt-1">
                    {(activeScannedCard.card_type === 'MESS' || activeScannedCard.isMess) ? (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>Shared Account: <strong>{activeScannedCard.memberCount || activeScannedCard.members?.length || 0} Workers</strong></span>
                        <span>&bull;</span>
                        <span>Total Group Debt: <strong className="text-rose-600 text-sm font-black">{(Number(activeScannedCard.balance ?? activeScannedCard.currentBalance ?? 0)).toFixed(3)} BHD</strong></span>
                      </div>
                    ) : (activeScannedCard.card_type === 'DUAL' || activeScannedCard.isDual) ? (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>Personal Debt: <strong className="text-rose-600 font-black">{(Number(activeScannedCard.personalBalance ?? activeScannedCard.balance ?? 0)).toFixed(3)} BHD</strong></span>
                        <span>&bull;</span>
                        <span>Mess Group: <strong>{activeScannedCard.group_name || 'Camp Mess'} ({activeScannedCard.memberCount || activeScannedCard.members?.length || 0} members)</strong></span>
                        <span>&bull;</span>
                        <span>Group Debt: <strong className="text-indigo-700 font-bold">{(Number(activeScannedCard.messBalance || 0)).toFixed(3)} BHD</strong></span>
                      </div>
                    ) : (
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>CPR: <strong className="text-slate-800">{activeScannedCard.cpr || 'N/A'}</strong></span>
                        <span>&bull;</span>
                        <span>Phone: <strong className="text-slate-800">{activeScannedCard.phone || 'N/A'}</strong></span>
                        <span>&bull;</span>
                        <span>Personal Debt: <strong className="text-rose-600 text-sm font-black">{(Number(activeScannedCard.balance || 0)).toFixed(3)} BHD</strong></span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions for the Active Card */}
            <div className="flex items-center gap-3 w-full md:w-auto justify-end">
              {isUnregisteredTap ? (
                <button
                  onClick={() => {
                    setAssignTagId(activeScannedCard.tag_id);
                    setShowAssignModal(true);
                  }}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer"
                >
                  <Plus size={16} />
                  <span>Assign to Customer or Mess</span>
                </button>
              ) : (
                <>
                  {(activeScannedCard.card_type === 'MESS' || activeScannedCard.isMess) ? (
                    <button
                      onClick={() => {
                        const targetId = activeScannedCard.mess_id || activeScannedCard.id?.replace(/^mess_/, '');
                        const found = messGroupsList.find(g => g.id === targetId);
                        handleOpenMessRosterModal(found || {
                          id: targetId,
                          group_name: activeScannedCard.group_name || activeScannedCard.name,
                          members: activeScannedCard.members || [],
                          assignedCard: activeScannedCard.tag_id
                        });
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-2 cursor-pointer"
                    >
                      <Users size={15} />
                      <span>Manage Group Roster</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (onOpenCustomerStatement) {
                          onOpenCustomerStatement(activeScannedCard);
                        } else if (onNavigateToKhata) {
                          onNavigateToKhata();
                        }
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-2 cursor-pointer"
                    >
                      <ExternalLink size={15} />
                      <span>View Khata Profile</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setAssignTagId(activeScannedCard.tag_id);
                      setAssignType(activeScannedCard.card_type === 'MESS' || activeScannedCard.isMess ? 'MESS' : 'PERSONAL');
                      if (activeScannedCard.customer_id || activeScannedCard.id) {
                        setSelectedCustomerId(activeScannedCard.customer_id || activeScannedCard.id);
                      }
                      if (activeScannedCard.mess_id) {
                        setSelectedMessGroupId(activeScannedCard.mess_id);
                        setPersonalMessGroupId(activeScannedCard.mess_id);
                      }
                      setShowAssignModal(true);
                    }}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    Reassign
                  </button>

                  <button
                    onClick={() => handleUnlinkCard(activeScannedCard.tag_id)}
                    className="p-2 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-xl transition cursor-pointer"
                    title="Unlink Card"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}

              <button
                onClick={() => {
                  setActiveScannedCard(null);
                  setIsUnregisteredTap(false);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                title="Dismiss Spotlight"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold">
            <CreditCard size={22} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Enrolled</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{stats.totalCards}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
            <User size={22} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Personal Cards</p>
            <p className="text-2xl font-black text-emerald-700 mt-0.5">{stats.personalCards}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-bold">
            <CreditCard size={22} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Dual Wallet</p>
            <p className="text-2xl font-black text-purple-700 mt-0.5">{stats.dualCards || 0}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold">
            <Users size={22} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Mess Groups</p>
            <p className="text-2xl font-black text-indigo-700 mt-0.5">{stats.messCards}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4 col-span-2 sm:col-span-1">
          <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center font-bold">
            <Banknote size={22} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Cardholder Debt</p>
            <p className="text-2xl font-black text-rose-600 mt-0.5">{(stats.totalOutstanding || 0).toFixed(3)} <span className="text-xs font-bold text-slate-400">BHD</span></p>
          </div>
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-4 mt-2">
        <button
          onClick={() => setActiveTab('CARDS')}
          className={`pb-3 px-3 font-bold text-sm flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'CARDS'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CreditCard size={18} />
          <span>NFC Cards Directory ({cards.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('MESS_GROUPS')}
          className={`pb-3 px-3 font-bold text-sm flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'MESS_GROUPS'
              ? 'border-indigo-600 text-indigo-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users size={18} />
          <span>Mess & Camp Groups Roster ({messGroupsList.length})</span>
        </button>
      </div>

      {/* Directory Controls: Search, Filter Tabs & Sort Dropdown */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input
            type="text"
            placeholder={activeTab === 'CARDS' ? "Search by UID, Customer Name, CPR, Phone..." : "Search mess groups by name, card UID, or worker member..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Filter Pills (only relevant for CARDS view) */}
        {activeTab === 'CARDS' && (
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl overflow-x-auto text-xs font-bold">
            <button
              onClick={() => setTypeFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap ${
                typeFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              All Cards ({cards.length})
            </button>
            <button
              onClick={() => setTypeFilter('PERSONAL')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap ${
                typeFilter === 'PERSONAL' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Personal ({stats.personalCards})
            </button>
            <button
              onClick={() => setTypeFilter('DUAL')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap ${
                typeFilter === 'DUAL' ? 'bg-white text-purple-800 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Dual Wallet ({stats.dualCards || 0})
            </button>
            <button
              onClick={() => setTypeFilter('MESS')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap ${
                typeFilter === 'MESS' ? 'bg-white text-indigo-800 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Mess Groups ({stats.messCards})
            </button>
            <button
              onClick={() => setTypeFilter('DEBTORS')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap ${
                typeFilter === 'DEBTORS' ? 'bg-white text-rose-800 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Debtors Only
            </button>
          </div>
        )}

        {/* Sort Dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          <ArrowUpDown size={16} className="text-slate-400 shrink-0" />
          <select
            value={sortOption}
            onChange={(e: any) => setSortOption(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="highest">Highest Debt First</option>
            <option value="lowest">Lowest Debt First</option>
            <option value="alpha_asc">Customer Name (A-Z)</option>
            <option value="alpha_desc">Customer Name (Z-A)</option>
            <option value="uid">Card UID</option>
            <option value="recent">Recently Enrolled</option>
          </select>

          <button
            onClick={loadCardsData}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition cursor-pointer"
            title="Refresh Card Directory"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {activeTab === 'MESS_GROUPS' ? (
        <div className="space-y-4">
          {/* Mess Groups Header Bar */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Users className="text-indigo-600" size={20} />
                <span>Mess & Camp Worker Groups</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Organize workers into shared mess accounts with split billing and group NFC cards.
              </p>
            </div>
            <button
              onClick={() => handleOpenMessRosterModal({ id: 'new', group_name: '', assignedCard: '', members: [] })}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow transition flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Plus size={15} />
              <span>Create New Mess Group</span>
            </button>
          </div>

          {/* Mess Groups Grid */}
          {messGroupsList.length === 0 ? (
            <div className="bg-white rounded-2xl p-16 text-center border border-slate-200 shadow-sm text-slate-400">
              <Users size={40} className="mx-auto mb-3 opacity-30 text-indigo-500" />
              <p className="font-bold text-slate-700">No Mess Groups Registered Yet</p>
              <p className="text-xs mt-1">Create your first camp or room mess group to bundle worker dining tabs.</p>
              <button
                onClick={() => handleOpenMessRosterModal({ id: 'new', group_name: '', assignedCard: '', members: [] })}
                className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow hover:bg-indigo-700 cursor-pointer"
              >
                Create Mess Group Now
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAndSortedMessGroups.map((group) => {
                const totalDebt = Number(group.totalBalance || 0);
                const memberList = Array.isArray(group.members) ? group.members : [];

                return (
                  <div key={group.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-indigo-300 transition flex flex-col justify-between">
                    <div>
                      {/* Top Row: Title & Actions */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold shrink-0">
                            <Users size={18} />
                          </div>
                          <div>
                            <h4 className="font-black text-sm text-slate-900 line-clamp-1">{group.group_name}</h4>
                            <p className="text-[11px] text-slate-400 font-medium">{group.memberCount || memberList.length} registered workers</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenMessRosterModal(group)}
                            className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded-lg transition cursor-pointer"
                            title="Edit Roster & Card"
                          >
                            <ExternalLink size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteMessGroup(group.id, group.group_name)}
                            className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition cursor-pointer"
                            title="Disband Group"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Hardware NFC Tag Badge */}
                      <div className="mt-4 p-2.5 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CreditCard size={15} className="text-slate-400 shrink-0" />
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider text-[10px]">Assigned NFC:</span>
                        </div>
                        {group.assignedCard ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                              {group.assignedCard}
                            </span>
                            <button
                              onClick={() => handleCopyTag(group.assignedCard)}
                              className="text-slate-400 hover:text-slate-600"
                              title="Copy UID"
                            >
                              {copiedTagId === group.assignedCard ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleOpenMessRosterModal(group)}
                            className="text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200 cursor-pointer"
                          >
                            + Bind Physical Card
                          </button>
                        )}
                      </div>

                      {/* Worker Member Roster Preview */}
                      <div className="mt-4">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                          Worker Members ({memberList.length})
                        </p>
                        {memberList.length === 0 ? (
                          <p className="text-xs text-amber-600 italic">No workers assigned to this group yet.</p>
                        ) : (
                          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                            {memberList.slice(0, 5).map((m: any) => (
                              <div key={m.id} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-50">
                                <span className="font-medium text-slate-800 line-clamp-1">{m.name}</span>
                                <span className={`text-[11px] font-bold ${Number(m.balance || 0) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                  {Number(m.balance || 0).toFixed(3)} BHD
                                </span>
                              </div>
                            ))}
                            {memberList.length > 5 && (
                              <p className="text-[10px] text-center text-slate-400 font-bold">
                                + {memberList.length - 5} more workers
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom: Total Debt & Manage Button */}
                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Group Debt</p>
                        <p className={`text-base font-black ${totalDebt > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                          {totalDebt.toFixed(3)} <span className="text-xs font-bold text-slate-400">BHD</span>
                        </p>
                      </div>

                      <button
                        onClick={() => handleOpenMessRosterModal(group)}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Users size={14} />
                        <span>Manage Roster</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Cards Directory Table */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3.5">Physical Tag UID</th>
                  <th className="px-5 py-3.5">Card Type</th>
                  <th className="px-5 py-3.5">Cardholder / Group Name</th>
                  <th className="px-5 py-3.5">CPR & Contact</th>
                  <th className="px-5 py-3.5 text-right">Outstanding Khata Debt</th>
                  <th className="px-5 py-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-slate-400 font-bold">
                      <RefreshCw className="animate-spin inline mr-2" size={16} />
                      Loading NFC Card Directory...
                    </td>
                  </tr>
                ) : filteredAndSortedCards.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center text-slate-400 font-medium">
                      <CreditCard size={36} className="mx-auto mb-2 opacity-30" />
                      No NFC cards found matching the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedCards.map((card) => {
                    const balanceNum = Number(card.balance || 0);
                    const isPersonal = card.card_type === 'PERSONAL';

                    return (
                      <tr key={card.tag_id} className="hover:bg-slate-50/80 transition">
                        {/* Tag UID */}
                        <td className="px-5 py-4 font-mono font-bold text-slate-800">
                          <div className="flex items-center gap-2">
                            <span className="bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-900">
                              {card.tag_id}
                            </span>
                            <button
                              onClick={() => handleCopyTag(card.tag_id)}
                              className="text-slate-400 hover:text-slate-700 transition"
                              title="Copy UID"
                            >
                              {copiedTagId === card.tag_id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                            </button>
                          </div>
                        </td>

                        {/* Card Type Badge */}
                        <td className="px-5 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                            card.card_type === 'DUAL'
                              ? 'bg-purple-50 text-purple-800 border-purple-200'
                              : isPersonal 
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                                : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                          }`}>
                            {card.card_type === 'DUAL' ? 'Dual Wallet' : isPersonal ? 'Personal' : 'Mess Group'}
                          </span>
                        </td>

                        {/* Cardholder / Group Name */}
                        <td className="px-5 py-4 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            {card.card_type === 'DUAL' ? (
                              <User size={15} className="text-purple-600 shrink-0" />
                            ) : isPersonal ? (
                              <User size={15} className="text-emerald-600 shrink-0" />
                            ) : (
                              <Users size={15} className="text-indigo-600 shrink-0" />
                            )}
                            <span>{card.name}</span>
                            {card.card_type === 'DUAL' && card.group_name && (
                              <button
                                onClick={() => {
                                  const mg = messGroupsList.find(g => g.id === card.mess_id) || { id: card.mess_id, group_name: card.group_name };
                                  handleOpenMessRosterModal(mg);
                                }}
                                className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-full border border-indigo-200 cursor-pointer transition flex items-center gap-1"
                                title="View Mess Group Roster"
                              >
                                <Users size={11} />
                                <span>{card.group_name}</span>
                              </button>
                            )}
                            {card.card_type === 'MESS' && card.memberCount ? (
                              <button
                                onClick={() => {
                                  const mg = messGroupsList.find(g => g.id === card.mess_id || g.assignedCard === card.tag_id) || {
                                    id: card.mess_id || card.tag_id,
                                    group_name: card.name,
                                    assignedCard: card.tag_id,
                                    members: card.members || []
                                  };
                                  handleOpenMessRosterModal(mg);
                                }}
                                className="text-[10px] font-bold px-2 py-0.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 rounded-full cursor-pointer transition flex items-center gap-1"
                                title="Manage Group Roster"
                              >
                                <Users size={11} />
                                <span>{card.memberCount} members</span>
                              </button>
                            ) : null}
                          </div>
                        </td>

                        {/* CPR & Contact */}
                        <td className="px-5 py-4 text-slate-600">
                          {card.card_type !== 'MESS' ? (
                            <div className="space-y-0.5">
                              <p className="font-semibold text-slate-800">{card.phone || 'No Phone'}</p>
                              <p className="text-[11px] text-slate-400">CPR: {card.cpr || 'N/A'}</p>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs italic">Shared Camp / Mess Account</span>
                          )}
                        </td>

                        {/* Outstanding Debt */}
                        <td className="px-5 py-4 text-right">
                          {card.card_type === 'DUAL' ? (
                            <div className="space-y-0.5">
                              <p className="font-black text-sm text-rose-600">
                                {(card.personalBalance || card.balance || 0).toFixed(3)} BHD
                              </p>
                              {card.messBalance !== undefined && (
                                <p className="text-[11px] font-bold text-indigo-600">
                                  Mess: {Number(card.messBalance).toFixed(3)} BHD
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className={`font-black text-sm ${balanceNum > 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                              {balanceNum.toFixed(3)} BHD
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {(card.card_type === 'MESS' || card.mess_id) && (
                              <button
                                onClick={() => {
                                  const mg = messGroupsList.find(g => g.id === card.mess_id || g.assignedCard === card.tag_id) || {
                                    id: card.mess_id || card.tag_id,
                                    group_name: card.group_name || card.name,
                                    assignedCard: card.tag_id,
                                    members: card.members || []
                                  };
                                  handleOpenMessRosterModal(mg);
                                }}
                                className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded-lg transition"
                                title="Manage Mess Roster"
                              >
                                <Users size={16} />
                              </button>
                            )}

                            {card.card_type !== 'MESS' && (
                              <button
                                onClick={() => {
                                  if (onOpenCustomerStatement) {
                                    onOpenCustomerStatement({ id: card.customer_id, name: card.name, balance: card.balance, phone: card.phone, cpr: card.cpr });
                                  } else if (onNavigateToKhata) {
                                    onNavigateToKhata();
                                  }
                                }}
                                className="p-1.5 hover:bg-emerald-50 text-emerald-700 rounded-lg transition"
                                title="Open Statement"
                              >
                                <ExternalLink size={16} />
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setAssignTagId(card.tag_id);
                                setAssignType(card.card_type === 'MESS' ? 'MESS' : 'PERSONAL');
                                if (card.customer_id) setSelectedCustomerId(card.customer_id);
                                if (card.mess_id) {
                                  setSelectedMessGroupId(card.mess_id);
                                  setPersonalMessGroupId(card.mess_id);
                                }
                                setShowAssignModal(true);
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                            >
                              Reassign
                            </button>

                            <button
                              onClick={() => handleUnlinkCard(card.tag_id)}
                              className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition"
                              title="Unlink Card"
                            >
                              <Trash2 size={16} />
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

      {/* Live Scan History Feed (Bottom Audit Feed) */}
      {recentScansLog.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Radio size={16} className="text-emerald-500 animate-pulse" />
              Live Sunmi Scanner Activity Feed
            </h3>
            <span className="text-xs text-slate-400 font-medium">Real-time hardware tap log</span>
          </div>

          <div className="divide-y divide-slate-100">
            {recentScansLog.map((log) => (
              <div key={log.id} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${log.isNew ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  <span className="font-mono font-bold text-slate-800">{log.tag_id}</span>
                  <span className="text-slate-400">&bull;</span>
                  <span className="font-semibold text-slate-700">{log.partyName}</span>
                </div>
                <span className="text-slate-400 font-mono text-[11px]">{log.timestamp}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Card Enrollment / Assignment Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <CreditCard size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Enroll & Link NFC Card</h3>
                  <p className="text-xs text-slate-500">Bind physical card to Personal Customer or Mess Group</p>
                </div>
              </div>
              <button
                onClick={() => setShowAssignModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 mt-5">
              {/* Tag ID Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-600">
                    Card UID / Serial Number
                  </label>
                  <button
                    type="button"
                    onClick={scanStatus === 'WAITING' ? cancelRemoteScan : triggerRemoteScan}
                    className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition flex items-center gap-1.5 cursor-pointer ${
                      scanStatus === 'WAITING'
                        ? 'bg-amber-100 border-amber-300 text-amber-800 animate-pulse'
                        : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    <Radio size={13} className={scanStatus === 'WAITING' ? 'animate-ping' : ''} />
                    <span>{scanStatus === 'WAITING' ? 'Waiting for Tap...' : 'Scan via Sunmi'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="e.g. 04:8A:21:5A:F1:48:80"
                  value={assignTagId}
                  onChange={(e) => setAssignTagId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Type Switcher */}
              <div className="flex p-1 bg-slate-100 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setAssignType('PERSONAL')}
                  className={`flex-1 py-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-2 ${
                    assignType === 'PERSONAL' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <User size={15} />
                  <span>Personal Customer</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAssignType('MESS')}
                  className={`flex-1 py-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-2 ${
                    assignType === 'MESS' ? 'bg-white text-indigo-800 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Users size={15} />
                  <span>Mess / Camp Group</span>
                </button>
              </div>

              {/* Personal Mode */}
              {assignType === 'PERSONAL' && (
                <div className="space-y-3 pt-2">
                  {!showQuickCreateCustomer ? (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-black uppercase tracking-wider text-slate-600">
                          Select Existing Customer
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowQuickCreateCustomer(true)}
                          className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                        >
                          <Plus size={13} />
                          <span>Quick Create New</span>
                        </button>
                      </div>

                      <select
                        value={selectedCustomerId}
                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">-- Choose Customer from Directory --</option>
                        {customersList.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.phone ? `(${c.phone})` : ''} - Debt: {(Number(c.balance || c.outstanding_balance || 0)).toFixed(3)} BHD
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase text-emerald-900 tracking-wider">
                          New Customer Profile
                        </h4>
                        <button
                          type="button"
                          onClick={() => setShowQuickCreateCustomer(false)}
                          className="text-[11px] font-bold text-slate-500 hover:text-slate-700"
                        >
                          Cancel & Pick Existing
                        </button>
                      </div>

                      <input
                        type="text"
                        placeholder="Full Name *"
                        value={newCustName}
                        onChange={(e) => setNewCustName(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Phone Number"
                          value={newCustPhone}
                          onChange={(e) => setNewCustPhone(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs text-slate-900 focus:outline-none"
                        />
                        <input
                          type="text"
                          placeholder="CPR (National ID)"
                          value={newCustCpr}
                          onChange={(e) => setNewCustCpr(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs text-slate-900 focus:outline-none"
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Batch / Group Code (e.g. BLK-4)"
                        value={newCustBatch}
                        onChange={(e) => setNewCustBatch(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs text-slate-900 focus:outline-none"
                      />
                    </div>
                  )}

                  {/* Dual-Wallet Link Dropdown */}
                  <div className="pt-2 border-t border-slate-100">
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1">
                      Link to Mess / Camp Group (Optional Dual-Wallet)
                    </label>
                    <select
                      value={personalMessGroupId}
                      onChange={(e) => setPersonalMessGroupId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">-- No Mess Group (Personal Khata Only) --</option>
                      {messGroupsList.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.group_name} ({g.memberCount || 0} members)
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Linking to a mess group enables Dual-Wallet checkout at the Sunmi POS.
                    </p>
                  </div>
                </div>
              )}

              {/* Mess Mode */}
              {assignType === 'MESS' && (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1">
                      Link to Existing Mess Group
                    </label>
                    <select
                      value={selectedMessGroupId}
                      onChange={(e) => {
                        setSelectedMessGroupId(e.target.value);
                        if (e.target.value) {
                          setNewMessGroupName('');
                          const matchedGroup = messGroupsList.find(g => g.id === e.target.value);
                          if (matchedGroup && Array.isArray(matchedGroup.members)) {
                            setMessMemberIds(matchedGroup.members.map((m: any) => m.id));
                          }
                        }
                      }}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Or Create New Group Below --</option>
                      {messGroupsList.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.group_name} ({g.memberCount || 0} members)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-slate-200"></div>
                    <span className="flex-shrink mx-3 text-[10px] font-black uppercase tracking-wider text-slate-400">OR</span>
                    <div className="flex-grow border-t border-slate-200"></div>
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1">
                      Create New Mess Group Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Camp 4 Block B Mess"
                      value={newMessGroupName}
                      onChange={(e) => {
                        setNewMessGroupName(e.target.value);
                        if (e.target.value) setSelectedMessGroupId('');
                      }}
                      className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Worker Member Selection */}
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-black uppercase tracking-wider text-slate-600">
                        Assign Worker Members ({messMemberIds.length} selected)
                      </label>
                      <span className="text-[11px] font-bold text-indigo-600">
                        Total Debt: {messMemberIds.reduce((sum, id) => sum + (Number(customersList.find(c => c.id === id)?.balance || 0)), 0).toFixed(3)} BHD
                      </span>
                    </div>
                    <input
                      type="text"
                      placeholder="Filter workers by name, phone or CPR..."
                      value={assignMemberSearch}
                      onChange={(e) => setAssignMemberSearch(e.target.value)}
                      className="w-full px-3 py-1.5 mb-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    />
                    <div className="max-h-40 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                      {customersList
                        .filter(c => !assignMemberSearch.trim() || (c.name || '').toLowerCase().includes(assignMemberSearch.toLowerCase()) || (c.cpr && c.cpr.includes(assignMemberSearch)) || (c.phone && c.phone.includes(assignMemberSearch)))
                        .map(c => {
                          const isChecked = messMemberIds.includes(c.id);
                          return (
                            <label key={c.id} className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition text-xs ${isChecked ? 'bg-indigo-50 border border-indigo-200 font-bold' : 'hover:bg-slate-100 font-medium'}`}>
                              <div className="flex items-center gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) setMessMemberIds([...messMemberIds, c.id]);
                                    else setMessMemberIds(messMemberIds.filter(id => id !== c.id));
                                  }}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                />
                                <span>{c.name}</span>
                                {c.phone && <span className="text-[10px] text-slate-400">({c.phone})</span>}
                              </div>
                              <span className={`text-[11px] ${Number(c.balance || 0) > 0 ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                                {Number(c.balance || 0).toFixed(3)} BHD
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading || !assignTagId.trim()}
                onClick={handleSaveAssignment}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer"
              >
                {actionLoading ? <RefreshCw className="animate-spin" size={14} /> : <Check size={14} />}
                <span>Activate & Link Card</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mess Group Roster & Members Management Modal */}
      {showMessRosterModal && selectedMessGroupForEdit && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    {selectedMessGroupForEdit.id === 'new' ? 'Create New Mess Group' : `Manage Mess Roster: ${selectedMessGroupForEdit.group_name}`}
                  </h3>
                  <p className="text-xs text-slate-500">Add or remove worker members and bind shared NFC card</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowMessRosterModal(false);
                  setSelectedMessGroupForEdit(null);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 mt-5 overflow-y-auto flex-1 pr-1">
              {/* Group Name */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1">
                  Mess / Camp Group Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Camp 4 Room 12 Mess"
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Linked NFC Card */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-600">
                    Shared Physical NFC Tag UID (Optional)
                  </label>
                  <button
                    type="button"
                    onClick={scanStatus === 'WAITING' ? cancelRemoteScan : triggerRemoteScan}
                    className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition flex items-center gap-1.5 cursor-pointer ${
                      scanStatus === 'WAITING'
                        ? 'bg-amber-100 border-amber-300 text-amber-800 animate-pulse'
                        : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                    }`}
                  >
                    <Radio size={13} className={scanStatus === 'WAITING' ? 'animate-ping' : ''} />
                    <span>{scanStatus === 'WAITING' ? 'Waiting for Tap...' : 'Scan via Sunmi'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="e.g. 04:8A:21:5A:F1:48:80 (Leave blank to remove card)"
                  value={editGroupTagId}
                  onChange={(e) => setEditGroupTagId(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Worker Members Selector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-600">
                    Group Workers / Members ({editGroupMembers.length} Selected)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const filtered = customersList.filter(c => !memberSearchQuery.trim() || (c.name || '').toLowerCase().includes(memberSearchQuery.toLowerCase()) || (c.cpr && c.cpr.includes(memberSearchQuery)));
                        const newIds = Array.from(new Set([...editGroupMembers, ...filtered.map(c => c.id)]));
                        setEditGroupMembers(newIds);
                      }}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                    >
                      Select All Filtered
                    </button>
                    <span className="text-slate-300">&bull;</span>
                    <button
                      type="button"
                      onClick={() => setEditGroupMembers([])}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder="Search customers by name, phone, or CPR..."
                    value={memberSearchQuery}
                    onChange={(e) => setMemberSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                  {customersList
                    .filter(c => !memberSearchQuery.trim() || (c.name || '').toLowerCase().includes(memberSearchQuery.toLowerCase()) || (c.cpr && c.cpr.includes(memberSearchQuery)) || (c.phone && c.phone.includes(memberSearchQuery)))
                    .map(c => {
                      const isChecked = editGroupMembers.includes(c.id);
                      return (
                        <label key={c.id} className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition text-xs border ${isChecked ? 'bg-indigo-50/90 border-indigo-200 font-bold' : 'bg-white border-transparent hover:bg-slate-100 font-medium'}`}>
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) setEditGroupMembers([...editGroupMembers, c.id]);
                                else setEditGroupMembers(editGroupMembers.filter(id => id !== c.id));
                              }}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <div>
                              <p className="text-slate-900">{c.name}</p>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-normal">
                                {c.phone && <span>Tel: {c.phone}</span>}
                                {c.cpr && <span>CPR: {c.cpr}</span>}
                                {c.batchNo && <span>Batch: {c.batchNo}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`text-xs ${Number(c.balance || 0) > 0 ? 'text-rose-600 font-black' : 'text-slate-500 font-semibold'}`}>
                              {Number(c.balance || 0).toFixed(3)} BHD
                            </span>
                            <p className="text-[10px] text-slate-400">Personal Khata</p>
                          </div>
                        </label>
                      );
                    })}
                </div>
              </div>

              {/* Combined Balance Metric Box */}
              <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-indigo-900">Total Combined Group Debt</p>
                  <p className="text-xs text-indigo-700">Calculated live from {editGroupMembers.length} selected worker khatas</p>
                </div>
                <p className="text-xl font-black text-indigo-900">
                  {editGroupMembers.reduce((sum, id) => {
                    const cust = customersList.find(c => c.id === id);
                    return sum + (Number(cust?.balance || 0));
                  }, 0).toFixed(3)} <span className="text-xs font-bold text-indigo-600">BHD</span>
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowMessRosterModal(false);
                  setSelectedMessGroupForEdit(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading || !editGroupName.trim()}
                onClick={handleSaveMessRoster}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer"
              >
                {actionLoading ? <RefreshCw className="animate-spin" size={14} /> : <Check size={14} />}
                <span>{selectedMessGroupForEdit.id === 'new' ? 'Create Mess Group' : 'Save Mess Roster'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
