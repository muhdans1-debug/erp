import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  Search,
  RefreshCw,
  Printer,
  MessageCircle,
  CreditCard,
  Banknote,
  CheckCircle2,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  User,
  X,
  Lock,
  Scale,
  ShoppingCart,
  Receipt,
  FileText,
  Layers,
  Plus,
  BookOpen,
  LogOut
} from 'lucide-react';
import { getApiBaseUrl, DEFAULT_EDGE_API_URL } from '../utils/apiConfig';
import { printKhataStatement, printKhataPaymentReceipt } from '../utils/printer';
import { kickCashDrawer } from '../services/cashDrawerService';
import { playThankYouVoice } from '../utils/sound';
import { getManagerPin } from '../utils/authUtils';

export interface MessMemberItem {
  id: string;
  name: string;
  phone?: string | null;
  cpr?: string | null;
  cardUid?: string | null;
  batchNo?: string | null;
  currentBalance?: number;
  balance?: number;
  messShare?: number;
  personalBalance?: number;
  consolidatedBalance?: number;
  equalSplitShare?: number;
  spendPercentage?: number;
}

export interface MessGroupItem {
  id: string;
  group_name: string;
  name?: string;
  memberCount: number;
  totalBalance: number;
  balance?: number;
  equalSplitShare?: number;
  members: MessMemberItem[];
  messLedger?: any[];
  assignedCard?: string | null;
  cardTag?: string | null;
  createdAt?: string;
}

interface MessGroupsHubViewProps {
  apiBase: string;
  initialGroupId?: string | null;
  scannedCardUid?: string | null;
  onSelectCustomerForCart?: (customer: any) => void;
  onOpenCustomerStatement?: (customer: any) => void;
  onClose?: () => void;
  showToast?: (message: string, type?: 'success' | 'info' | 'error') => void;
  onCustomerUpdated?: () => void;
}

export const MessGroupsHubView: React.FC<MessGroupsHubViewProps> = ({
  apiBase,
  initialGroupId = null,
  scannedCardUid,
  onSelectCustomerForCart,
  onOpenCustomerStatement,
  onClose,
  showToast,
  onCustomerUpdated
}) => {
  const [messGroups, setMessGroupsList] = useState<MessGroupItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<MessGroupItem | null>(null);
  const [activeShopperFilter, setActiveShopperFilter] = useState<string | null>(null);
  const [activeMemberFilter, setActiveMemberFilter] = useState<string | null>(null);
  const [txnSearchQuery, setTxnSearchQuery] = useState<string>('');
  const [txnDisplayMode, setTxnDisplayMode] = useState<'ALL_SPLITS' | 'GROUPED_ORDERS'>('ALL_SPLITS');
  const [expandedGroupTxnId, setExpandedGroupTxnId] = useState<string | null>(null);
  const [punchFeedback, setPunchFeedback] = useState<{ memberName: string; groupName: string; cardUid: string } | null>(null);

  // Individual Member Share Payment Modal
  const [settlingMember, setSettlingMember] = useState<MessMemberItem | null>(null);
  const [settleAmount, setSettleAmount] = useState<string>('');
  const [settleMethod, setSettleMethod] = useState<'CASH' | 'BENEFIT_PAY'>('CASH');
  const [isSubmittingSettle, setIsSubmittingSettle] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  // Mid-Month Member Departure State
  const [departingMember, setDepartingMember] = useState<MessMemberItem | null>(null);
  const [departureStrategy, setDepartureStrategy] = useState<'ABSORB_BY_ROOMMATES' | 'CONVERT_TO_PERSONAL' | 'SETTLE_ON_DEPARTURE'>('ABSORB_BY_ROOMMATES');
  const [departureSettleMethod, setDepartureSettleMethod] = useState<'CASH' | 'BENEFIT_PAY'>('CASH');
  const [isSubmittingDeparture, setIsSubmittingDeparture] = useState<boolean>(false);

  // Create New Mess Group Modal State
  const [showCreateGroupModal, setShowCreateGroupModal] = useState<boolean>(false);
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [newGroupPreviousBalance, setNewGroupPreviousBalance] = useState<string>('');
  const [newGroupDescription, setNewGroupDescription] = useState<string>('');
  const [newGroupTagId, setNewGroupTagId] = useState<string>('');
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>([]);
  const [customerDirectory, setCustomerDirectory] = useState<any[]>([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState<boolean>(false);

  // Add Previous Book Balance to Existing Mess Group Modal State
  const [balanceModalGroup, setBalanceModalGroup] = useState<MessGroupItem | null>(null);
  const [addBalanceAmount, setAddBalanceAmount] = useState<string>('');
  const [addBalanceDescription, setAddBalanceDescription] = useState<string>('');
  const [isSubmittingBalance, setIsSubmittingBalance] = useState<boolean>(false);

  const handleOpenAddBalanceModal = (group: MessGroupItem) => {
    setBalanceModalGroup(group);
    setAddBalanceAmount('');
    setAddBalanceDescription('');
  };

  const handleAddBalanceSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!balanceModalGroup) return;

    const amt = parseFloat(addBalanceAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid previous book balance greater than BD 0.000.');
      return;
    }

    if (!balanceModalGroup.members || balanceModalGroup.members.length === 0) {
      alert('This mess group has 0 enrolled members. Please add members first before allocating previous debt.');
      return;
    }

    setIsSubmittingBalance(true);
    try {
      const payload = {
        previousBalance: amt,
        description: addBalanceDescription.trim() || undefined,
        member_ids: balanceModalGroup.members.map((m: MessMemberItem) => m.id)
      };

      const mgrPin = getManagerPin();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-pos-client': 'store-pos'
      };
      if (mgrPin) headers['x-manager-pin'] = mgrPin;

      const res = await fetchFromCandidates(`/api/nfc/mess-groups/${balanceModalGroup.id}/balance`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res || !res.ok) {
        const errData = await res?.json().catch(() => ({}));
        throw new Error(errData?.error || 'Failed to post mess opening balance');
      }

      const data = await res.json();
      if (data && data.success) {
        showToast?.(
          `Posted BD ${amt.toFixed(3)} previous book balance across ${balanceModalGroup.members.length} members with zero drift!`,
          'success'
        );
        setBalanceModalGroup(null);
        await loadGroups();
        onCustomerUpdated?.();
      } else {
        throw new Error(data?.error || 'Failed to post mess opening balance');
      }
    } catch (err: any) {
      console.error(err);
      alert(`Error posting mess previous balance: ${err?.message || err}`);
    } finally {
      setIsSubmittingBalance(false);
    }
  };

  // Multi-endpoint fetch helper
  const fetchFromCandidates = useCallback(async (path: string, options: RequestInit = {}): Promise<Response | null> => {
    const candidates = [
      apiBase,
      DEFAULT_EDGE_API_URL,
      getApiBaseUrl(),
      'http://192.168.8.7:3000',
      'http://localhost:3000'
    ].filter((val, idx, arr): val is string => Boolean(val && val.trim()) && arr.indexOf(val) === idx);

    for (const base of candidates) {
      const cleanBase = base.trim().replace(/\/$/, '');
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      try {
        const res = await fetch(`${cleanBase}${cleanPath}`, {
          ...options,
          signal: AbortSignal.timeout(3500)
        });
        if (res.ok) return res;
      } catch { }
    }
    return null;
  }, [apiBase]);

  // Load all Mess Groups with enriched member details
  const loadGroups = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchFromCandidates('/api/nfc/mess-groups');
      if (res) {
        const data = await res.json();
        const rawList = data?.messGroups || data?.groups || (Array.isArray(data) ? data : []);
        const sanitized: MessGroupItem[] = rawList.map((g: any) => ({
          id: g.id,
          group_name: g.group_name || g.name || 'Unnamed Mess',
          name: g.name || g.group_name || 'Unnamed Mess',
          memberCount: Number(g.memberCount || g.members?.length || 0),
          totalBalance: Number(g.totalBalance ?? g.balance ?? 0),
          balance: Number(g.totalBalance ?? g.balance ?? 0),
          equalSplitShare: Number(g.equalSplitShare ?? (Number(g.totalBalance || 0) / Math.max(1, g.members?.length || 1))),
          members: Array.isArray(g.members) ? g.members : [],
          messLedger: Array.isArray(g.messLedger) ? g.messLedger : [],
          assignedCard: g.assignedCard || g.cardTag || null,
          cardTag: g.cardTag || g.assignedCard || null,
          createdAt: g.createdAt || null
        }));
        setMessGroupsList(sanitized);

        // If a group was currently selected, refresh its object
        if (selectedGroup) {
          const updated = sanitized.find((item) => item.id === selectedGroup.id);
          if (updated) setSelectedGroup(updated);
        }
      }
    } catch (err: any) {
      console.warn('Error loading mess groups:', err?.message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchFromCandidates, selectedGroup?.id]);

  useEffect(() => {
    loadGroups();
  }, []);

  // Auto-select initial group when navigated from Central Payment Hub
  useEffect(() => {
    if (initialGroupId && messGroups.length > 0) {
      const match = messGroups.find((g) => g.id === initialGroupId || g.group_name.toLowerCase() === initialGroupId.toLowerCase());
      if (match) setSelectedGroup(match);
    }
  }, [initialGroupId, messGroups]);

  // Omni-Card Detection Routine:
  // When ANY card in the account is punched, locate the group and open it
  const handleCardPunched = useCallback((cardUidRaw: string) => {
    if (!cardUidRaw || !cardUidRaw.trim()) return;
    const cleanUid = cardUidRaw.trim().toUpperCase().replace(/[:\-]/g, '');

    for (const group of messGroups) {
      // 1. Check if card matches group's assigned card
      const groupTagClean = String(group.assignedCard || group.cardTag || '').toUpperCase().replace(/[:\-]/g, '');
      if (groupTagClean && groupTagClean === cleanUid) {
        setSelectedGroup(group);
        setPunchFeedback({ memberName: 'Master Group Card', groupName: group.group_name, cardUid: cardUidRaw });
        if (showToast) showToast(`Group Recognized: "${group.group_name}" (Group Card)`, 'success');
        return;
      }

      // 2. Check if card belongs to ANY member of this mess group
      for (const member of group.members || []) {
        const memTagClean = String(member.cardUid || '').toUpperCase().replace(/[:\-]/g, '');
        if (memTagClean && memTagClean === cleanUid) {
          setSelectedGroup(group);
          setPunchFeedback({ memberName: member.name, groupName: group.group_name, cardUid: cardUidRaw });
          if (showToast) showToast(`Card Recognized: ${member.name} (Member of "${group.group_name}")`, 'success');
          return;
        }
      }
    }
  }, [messGroups, showToast]);

  // Listen to external scannedCardUid prop
  useEffect(() => {
    if (scannedCardUid && messGroups.length > 0) {
      handleCardPunched(scannedCardUid);
    }
  }, [scannedCardUid, messGroups, handleCardPunched]);

  // Live Sunmi NFC Scan & Broadcast listeners
  useEffect(() => {
    const handleSunmiScan = (e: any) => {
      const tag = e?.detail?.tag_id || e?.detail?.nfcId || (typeof e?.detail === 'string' ? e.detail : '');
      if (tag) handleCardPunched(tag);
    };
    window.addEventListener('sunmi-nfc-scan', handleSunmiScan);
    window.addEventListener('sunmi-nfc-broadcast', handleSunmiScan);
    return () => {
      window.removeEventListener('sunmi-nfc-scan', handleSunmiScan);
      window.removeEventListener('sunmi-nfc-broadcast', handleSunmiScan);
    };
  }, [handleCardPunched]);

  // Auto-select group if search query matches exact NFC card UID (group card or member card)
  useEffect(() => {
    const qClean = searchQuery.trim().toUpperCase().replace(/[:\-]/g, '');
    if (qClean.length >= 8 && !selectedGroup) {
      handleCardPunched(qClean);
    }
  }, [searchQuery, selectedGroup, handleCardPunched]);

  // Filter groups by search query (Group Name, Member Name, Phone, CPR, Card UID)
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return messGroups;
    const qNoColon = q.replace(/[:\-]/g, '');

    return messGroups.filter((g) => {
      const gNameMatch = g.group_name.toLowerCase().includes(q);
      const gCard = (g.assignedCard || '').toLowerCase();
      const gCardNoColon = gCard.replace(/[:\-]/g, '');
      const gCardMatch = gCard.includes(q) || (qNoColon && gCardNoColon.includes(qNoColon));

      const memberMatch = g.members?.some((m) => {
        const mCard = (m.cardUid || '').toLowerCase();
        const mCardNoColon = mCard.replace(/[:\-]/g, '');
        return (
          m.name.toLowerCase().includes(q) ||
          (m.phone && m.phone.toLowerCase().includes(q)) ||
          (m.cpr && m.cpr.toLowerCase().includes(q)) ||
          (mCard && (mCard.includes(q) || (qNoColon && mCardNoColon.includes(qNoColon))))
        );
      });
      return gNameMatch || gCardMatch || memberMatch;
    });
  }, [messGroups, searchQuery]);

  // Summary Metrics
  const totalCommunalDebt = useMemo(() => {
    return messGroups.reduce((acc, g) => acc + Math.max(0, Number(g.totalBalance || 0)), 0);
  }, [messGroups]);

  const totalMembersEnrolled = useMemo(() => {
    return messGroups.reduce((acc, g) => acc + (g.members?.length || 0), 0);
  }, [messGroups]);

  // Print 58mm Thermal Room Notice
  const handlePrintRoomNotice = async (group: MessGroupItem) => {
    setIsPrinting(true);
    try {
      await printKhataStatement({
        shopName: "LAYALI SUPERMARKET",
        customerName: group.group_name,
        statement: group.messLedger || [],
        currentBalance: group.totalBalance,
        messGroup: {
          id: group.id,
          group_name: group.group_name,
          memberCount: group.members.length,
          totalBalance: group.totalBalance,
          equalSplitShare: group.equalSplitShare,
          members: group.members.map((m) => ({
            id: m.id,
            name: m.name,
            currentBalance: Number(m.currentBalance || m.messShare || 0),
            equalSplitShare: Number(m.equalSplitShare || group.equalSplitShare || 0),
            spendPercentage: m.spendPercentage
          }))
        },
        isMessStatement: true,
        dateRange: "Current Billing Cycle"
      });
      if (showToast) showToast(`Room Statement printed for ${group.group_name}`, 'success');
    } catch (err: any) {
      console.warn('Print statement error:', err);
      if (showToast) showToast('Failed to print room statement', 'error');
    } finally {
      setIsPrinting(false);
    }
  };

  // WhatsApp Room Statement Formatter
  const handleShareWhatsApp = (group: MessGroupItem) => {
    const memberCount = Math.max(1, group.members?.length || 1);
    const eqShare = Number(group.equalSplitShare || (group.totalBalance / memberCount)).toFixed(3);

    let msg = `*LAYALI SUPERMARKET - ROOM MESS STATEMENT*\n`;
    msg += `👥 *Room / Mess Group:* ${group.group_name}\n`;
    msg += `📅 *Date:* ${new Date().toLocaleDateString('en-GB')}\n`;
    msg += `--------------------------------\n`;
    msg += `📊 *TOTAL GROUP EXPENSES:* BD ${Number(group.totalBalance).toFixed(3)}\n`;
    msg += `⚖️ *EQUAL SPLIT SHARE:* BD ${eqShare} / person\n`;
    msg += `👥 *Active Room Members:* ${memberCount}\n`;
    msg += `--------------------------------\n`;
    msg += `*MEMBER BREAKDOWN:*\n`;

    group.members.forEach((m, idx) => {
      const due = Number(m.currentBalance ?? m.messShare ?? eqShare).toFixed(3);
      const isPaid = Number(due) <= 0;
      msg += `${idx + 1}. *${m.name}*: BD ${due} ${isPaid ? '✅ (PAID)' : '⏳ (DUE)'}\n`;
      if (Number(m.personalBalance || 0) > 0) {
        msg += `   └ [Private Tab: BD ${Number(m.personalBalance).toFixed(3)}]\n`;
      }
    });

    msg += `--------------------------------\n`;
    msg += `*Please settle payments at the counter or via BenefitPay (Fawri+).* Thank you!\n`;

    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  // Open Pay Share Modal for Individual Member
  const handleOpenPayShare = (member: MessMemberItem, group: MessGroupItem) => {
    setSettlingMember(member);
    const suggested = member.equalSplitShare || (group.totalBalance / Math.max(1, group.members.length));
    setSettleAmount(suggested.toFixed(3));
    setSettleMethod('CASH');
  };

  // Submit Individual Member Share Payment
  const handleConfirmSharePayment = async () => {
    if (!settlingMember || !selectedGroup) return;
    const amountNum = parseFloat(settleAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Please enter a valid payment amount in BD.');
      return;
    }

    setIsSubmittingSettle(true);
    try {
      const payload = {
        customerId: settlingMember.id,
        amount: amountNum,
        amountPaid: amountNum,
        paymentMethod: settleMethod,
        reference: `Mess Equal Share: ${selectedGroup.group_name} (Paid by ${settlingMember.name})`,
        mess_id: selectedGroup.id
      };

      const res = await fetchFromCandidates('/api/khata/settle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pos-client': 'store-pos',
          'x-manager-pin': getManagerPin()
        },
        body: JSON.stringify(payload)
      });

      if (res && res.ok) {
        // 1. Kick cash drawer if physical cash
        if (settleMethod === 'CASH') {
          kickCashDrawer().catch(() => { });
        }
        // 2. Play voice announcement
        playThankYouVoice('KHATA_PAYMENT');

        // 3. Print thermal receipt slip (fire-and-forget)
        const memberPrevShare = Number(settlingMember.equalSplitShare || (selectedGroup.totalBalance / Math.max(1, selectedGroup.members.length)) || 0);
        const memberNewShare = Math.max(0, Number((memberPrevShare - amountNum).toFixed(3)));
        printKhataPaymentReceipt({
          shopName: "LAYALI SUPERMARKET",
          customerName: `${settlingMember.name} (${selectedGroup.group_name} Mess)`,
          amountPaid: amountNum,
          previousBalance: memberPrevShare,
          newBalance: memberNewShare,
          paymentMethod: settleMethod,
          receiptNo: `MS-${Date.now().toString().slice(-6)}`,
          timestamp: new Date().toISOString()
        }).catch(() => { });

        const successMsg = `✅ Received BD ${amountNum.toFixed(3)} for ${settlingMember.name}'s share in ${selectedGroup.group_name}!`;
        if (showToast) showToast(successMsg, 'success');
        onCustomerUpdated?.();

        setSettlingMember(null);
        setSettleAmount('');
        // Reload groups to reflect new balances
        await loadGroups();
      } else {
        const errData = await res?.json().catch(() => ({}));
        alert(errData?.error || 'Failed to record share payment');
      }
    } catch (err: any) {
      alert(`Network error recording payment: ${err?.message || err}`);
    } finally {
      setIsSubmittingSettle(false);
    }
  };

  // Open Mid-Month Member Departure Modal
  const handleOpenDepartureModal = (member: MessMemberItem, _group?: MessGroupItem) => {
    setDepartingMember(member);
    setDepartureStrategy('ABSORB_BY_ROOMMATES');
    setDepartureSettleMethod('CASH');
  };

  // Submit Mid-Month Member Departure & Reallocation
  const handleConfirmDeparture = async () => {
    if (!departingMember || !selectedGroup) return;
    setIsSubmittingDeparture(true);

    try {
      const res = await fetchFromCandidates(`/api/khata/mess/${encodeURIComponent(selectedGroup.id)}/members/${encodeURIComponent(departingMember.id)}/depart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pos-client': 'store-pos',
          'x-manager-pin': getManagerPin()
        },
        body: JSON.stringify({
          strategy: departureStrategy,
          settleMethod: departureSettleMethod
        })
      });

      if (res && res.ok) {
        const data = await res.json();
        
        if (departureStrategy === 'SETTLE_ON_DEPARTURE' && departureSettleMethod === 'CASH') {
          kickCashDrawer().catch(() => {});
        }
        playThankYouVoice('KHATA_PAYMENT');

        const memberUnpaid = Number(departingMember.equalSplitShare || (selectedGroup.totalBalance / Math.max(1, selectedGroup.members.length)) || 0);

        // Print thermal receipt slip
        printKhataPaymentReceipt({
          shopName: "LAYALI SUPERMARKET",
          customerName: `${departingMember.name} (Departed ${selectedGroup.group_name})`,
          amountPaid: departureStrategy === 'SETTLE_ON_DEPARTURE' ? memberUnpaid : 0,
          previousBalance: memberUnpaid,
          newBalance: 0,
          paymentMethod: departureStrategy === 'SETTLE_ON_DEPARTURE' ? departureSettleMethod : (departureStrategy === 'ABSORB_BY_ROOMMATES' ? 'ABSORBED' : 'PERSONAL_TRANSFER'),
          receiptNo: `DEP-${Date.now().toString().slice(-6)}`,
          timestamp: new Date().toISOString()
        }).catch(() => {});

        const msg = data.message || `✅ ${departingMember.name} departed from ${selectedGroup.group_name}!`;
        if (showToast) showToast(msg, 'success');
        onCustomerUpdated?.();

        setDepartingMember(null);
        await loadGroups();
      } else {
        const errData = await res?.json().catch(() => ({}));
        alert(errData?.error || 'Failed to process member departure');
      }
    } catch (err: any) {
      alert(`Network error processing departure: ${err?.message || err}`);
    } finally {
      setIsSubmittingDeparture(false);
    }
  };

  // Open Create Mess Group Modal
  const handleOpenCreateGroupModal = async () => {
    setNewGroupName('');
    setNewGroupPreviousBalance('');
    setNewGroupDescription('');
    setNewGroupTagId('');
    setNewGroupMembers([]);
    setCustomerSearchQuery('');
    setShowCreateGroupModal(true);

    try {
      const res = await fetchFromCandidates('/khata/ledger?sort=alpha');
      if (res && res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.customers || []);
        setCustomerDirectory(list);
      }
    } catch (err: any) {
      console.warn('Failed to load customers for mess creation:', err);
    }
  };

  // Submit Create Mess Group
  const handleCreateMessGroupSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newGroupName.trim()) {
      if (showToast) showToast('Mess Group name is required', 'error');
      return;
    }

    const prevBal = parseFloat(newGroupPreviousBalance) || 0;
    if (prevBal > 0 && newGroupMembers.length === 0) {
      if (showToast) showToast('Please select at least 1 room member to allocate the opening balance', 'error');
      return;
    }

    setIsSubmittingCreate(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-pos-client': 'store-pos',
        'x-manager-pin': getManagerPin()
      };

      const payload: any = {
        group_name: newGroupName.trim(),
        member_ids: newGroupMembers,
        tag_id: newGroupTagId.trim() || null
      };

      if (prevBal > 0) {
        payload.previousBalance = prevBal;
        if (newGroupDescription.trim()) {
          payload.description = newGroupDescription.trim();
        }
      }

      const res = await fetchFromCandidates('/api/nfc/mess-groups', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res || !res.ok) {
        const errData = await res?.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to create mess group');
      }

      const data = await res.json();
      if (data?.success) {
        if (showToast) {
          showToast(`Mess Group "${newGroupName.trim()}" created successfully with ${newGroupMembers.length} members${prevBal > 0 ? ` and BD ${prevBal.toFixed(3)} opening balance` : ''}!`, 'success');
        }
        setShowCreateGroupModal(false);
        await loadGroups();
        if (onCustomerUpdated) onCustomerUpdated();
      } else {
        throw new Error(data?.error || 'Failed to create mess group');
      }
    } catch (err: any) {
      console.error('Error creating mess group:', err);
      if (showToast) showToast(err.message || 'Error creating mess group', 'error');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const getMemberTxnCount = useCallback((memberId: string) => {
    if (!selectedGroup || !selectedGroup.messLedger) return 0;
    return selectedGroup.messLedger.filter((tx) => tx.customerId === memberId).length;
  }, [selectedGroup]);

  // Group Ledger Filtered Transactions (All Member Splits)
  const ledgerEntries = useMemo(() => {
    if (!selectedGroup || !selectedGroup.messLedger) return [];
    let list = selectedGroup.messLedger;

    if (activeShopperFilter) {
      list = list.filter(
        (entry) =>
          entry.customerId === activeShopperFilter ||
          entry.shopperName?.toLowerCase() === activeShopperFilter.toLowerCase()
      );
    }

    if (activeMemberFilter) {
      list = list.filter(
        (entry) =>
          entry.customerId === activeMemberFilter ||
          entry.memberName?.toLowerCase() === activeMemberFilter.toLowerCase()
      );
    }

    if (txnSearchQuery.trim()) {
      const q = txnSearchQuery.trim().toLowerCase();
      list = list.filter(
        (entry) =>
          (entry.invoiceNo && entry.invoiceNo.toLowerCase().includes(q)) ||
          (entry.reference && entry.reference.toLowerCase().includes(q)) ||
          (entry.shopperName && entry.shopperName.toLowerCase().includes(q)) ||
          (entry.memberName && entry.memberName.toLowerCase().includes(q))
      );
    }

    return list;
  }, [selectedGroup, activeShopperFilter, activeMemberFilter, txnSearchQuery]);

  // Grouped by Invoice / Purchase Order
  const groupedOrders = useMemo(() => {
    if (!selectedGroup || !selectedGroup.messLedger) return [];
    const map = new Map<string, {
      invoiceNo: string;
      reference: string;
      shopperName: string;
      timestamp: string;
      formattedDate: string;
      formattedTime: string;
      type: string;
      totalAmount: number;
      splits: Array<{
        id: string;
        customerId: string;
        memberName: string;
        amount: number;
        raw_amount: number;
        type: string;
      }>;
    }>();

    for (const entry of selectedGroup.messLedger) {
      const invKey = entry.invoiceNo || entry.reference || entry.id;
      if (!map.has(invKey)) {
        map.set(invKey, {
          invoiceNo: entry.invoiceNo || 'INV-MESS',
          reference: entry.reference || 'Mess Grocery Purchase',
          shopperName: entry.shopperName || 'Room Member',
          timestamp: entry.timestamp || entry.created_at || '',
          formattedDate: entry.formattedDate || '',
          formattedTime: entry.formattedTime || '',
          type: entry.type,
          totalAmount: 0,
          splits: []
        });
      }
      const order = map.get(invKey)!;
      order.splits.push({
        id: entry.id,
        customerId: entry.customerId,
        memberName: entry.memberName || 'Member',
        amount: Math.abs(Number(entry.amount || 0)),
        raw_amount: Number(entry.raw_amount || entry.amount || 0),
        type: entry.type
      });
      order.totalAmount += Math.abs(Number(entry.amount || 0));
    }

    let orders = Array.from(map.values());

    if (activeShopperFilter) {
      orders = orders.filter((o) => o.shopperName?.toLowerCase() === activeShopperFilter.toLowerCase());
    }

    if (activeMemberFilter) {
      orders = orders.filter((o) =>
        o.splits.some(
          (s) => s.customerId === activeMemberFilter || s.memberName.toLowerCase() === activeMemberFilter.toLowerCase()
        )
      );
    }

    if (txnSearchQuery.trim()) {
      const q = txnSearchQuery.trim().toLowerCase();
      orders = orders.filter(
        (o) =>
          o.invoiceNo.toLowerCase().includes(q) ||
          o.reference.toLowerCase().includes(q) ||
          o.shopperName.toLowerCase().includes(q) ||
          o.splits.some((s) => s.memberName.toLowerCase().includes(q))
      );
    }

    return orders;
  }, [selectedGroup, activeShopperFilter, activeMemberFilter, txnSearchQuery]);

  const totalDebitPurchases = useMemo(() => {
    if (!selectedGroup || !selectedGroup.messLedger) return 0;
    return selectedGroup.messLedger
      .filter((tx) => tx.type === 'CHARGE' || tx.raw_amount > 0)
      .reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
  }, [selectedGroup]);

  const totalCreditPayments = useMemo(() => {
    if (!selectedGroup || !selectedGroup.messLedger) return 0;
    return selectedGroup.messLedger
      .filter((tx) => tx.type === 'PAYMENT' || tx.type === 'WRITE_OFF' || tx.raw_amount < 0)
      .reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
  }, [selectedGroup]);

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Omni-Card Recognized Notification Banner */}
      {punchFeedback && (
        <div className="bg-emerald-50 border-2 border-emerald-500 rounded-xl p-3 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Card Punched & Recognized</p>
              <p className="text-base font-black text-slate-800">
                {punchFeedback.memberName} <span className="font-semibold text-slate-600">is enrolled in</span>{' '}
                <span className="text-indigo-600 underline decoration-indigo-300 font-black">"{punchFeedback.groupName}"</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => setPunchFeedback(null)}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-emerald-100 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* VIEW 1: GROUPS LIST / DIRECTORY */}
      {!selectedGroup ? (
        <div className="flex flex-col space-y-4">
          {/* Top Search & Omni-Scan Status Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search by group name, member name, phone, CPR, or punch card..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-base py-3 pl-10 pr-4 bg-slate-100 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleOpenCreateGroupModal}
                className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm hover:shadow active:scale-95 transition-all cursor-pointer flex items-center gap-2 font-black text-sm"
              >
                <Plus size={16} />
                <span>New Mess Group</span>
              </button>
              <button
                onClick={loadGroups}
                disabled={isLoading}
                className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 active:scale-95 transition-transform cursor-pointer flex items-center gap-1.5 font-bold text-sm"
                title="Refresh Mess Groups from Local DB & Cloud"
              >
                <RefreshCw size={16} className={isLoading ? 'animate-spin text-indigo-600' : ''} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-indigo-50/60 border border-indigo-100 p-3 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Active Mess Groups</p>
                <p className="text-xl font-black text-indigo-950 mt-0.5">{messGroups.length} Rooms</p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-indigo-500 text-white flex items-center justify-center">
                <Users size={18} />
              </div>
            </div>

            <div className="bg-amber-50/60 border border-amber-100 p-3 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Total Mess Debt (Food)</p>
                <p className="text-xl font-black text-amber-950 mt-0.5">BD {totalCommunalDebt.toFixed(3)}</p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center">
                <Scale size={18} />
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Enrolled Workers</p>
                <p className="text-xl font-black text-slate-900 mt-0.5">{totalMembersEnrolled} Members</p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-slate-700 text-white flex items-center justify-center">
                <User size={18} />
              </div>
            </div>
          </div>

          {/* Omni-Card Punch Helper Banner */}
          <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-semibold text-slate-300">
                Omni-Card Scanner Active: <strong className="text-white">Tap ANY worker's card</strong> or master card to auto-open group
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">Sunmi NFC Antenna Ready</span>
          </div>

          {/* Groups Grid / List */}
          {isLoading ? (
            <div className="py-16 text-center text-slate-500 space-y-2">
              <RefreshCw className="animate-spin mx-auto text-indigo-500" size={32} />
              <p className="font-medium text-sm">Loading communal mess rosters & calculating equal splits...</p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="py-16 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 space-y-3">
              <Users className="mx-auto text-slate-300" size={48} />
              <p className="font-bold text-slate-700 text-base">No mess groups found</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {searchQuery
                  ? `No groups match "${searchQuery}". Try searching by member name, CPR, or clear the search.`
                  : 'No mess groups have been created yet. You can create room accounts in the NFC Cards & Mess tab.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1">
              {filteredGroups.map((group) => {
                const memberCount = Math.max(1, group.members?.length || 1);
                const eqShare = Number(group.equalSplitShare || (group.totalBalance / memberCount));
                return (
                  <div
                    key={group.id}
                    onClick={() => setSelectedGroup(group)}
                    className="bg-white border-2 border-slate-200 hover:border-indigo-500 p-4 rounded-2xl shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group text-left relative"
                  >
                    <div>
                      {/* Group Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors">
                              {group.group_name}
                            </span>
                            {group.assignedCard && (
                              <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold border border-slate-200">
                                💳 {group.assignedCard}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1">
                            <Users size={12} className="text-slate-400" />
                            <span>{group.members.length} Room Members</span>
                          </p>
                        </div>

                        {/* Communal Total Badge */}
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Group Total</span>
                          <span className="text-xl font-black text-slate-900">
                            BD {Number(group.totalBalance).toFixed(3)}
                          </span>
                        </div>
                      </div>

                      {/* Equal Split Badge & Personal Credit Separation Note & Add Balance Button */}
                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                        <div className="bg-indigo-50 border border-indigo-200/60 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                          <Scale size={13} className="text-indigo-600 shrink-0" />
                          <span className="text-xs font-bold text-indigo-900">
                            Equal Split: <strong className="font-black text-indigo-700">BD {eqShare.toFixed(3)}</strong> / person
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenAddBalanceModal(group);
                            }}
                            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer active:scale-95"
                            title="Add / Migrate Previous Paper Book Balance to this Room Group"
                          >
                            <BookOpen size={12} />
                            <span>+ Add Book Balance</span>
                          </button>
                          <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md">
                            <Lock size={10} className="text-slate-400" />
                            <span>Personal tabs separate</span>
                          </span>
                        </div>
                      </div>

                      {/* Member Avatars / Names Preview */}
                      <div className="mt-3 flex flex-wrap gap-1">
                        {group.members.slice(0, 4).map((m) => (
                          <span
                            key={m.id}
                            className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium border border-slate-200/60"
                          >
                            {m.name}
                          </span>
                        ))}
                        {group.members.length > 4 && (
                          <span className="text-[11px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-md font-bold">
                            +{group.members.length - 4} more
                          </span>
                        )}
                      </div>

                      {/* All Group Transactions Preview & Expand Tray */}
                      <div className="mt-3 pt-3 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                            <Receipt size={13} className="text-indigo-600" />
                            <span>Group Transactions</span>
                            <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-black">
                              {group.messLedger?.length || 0}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setExpandedGroupTxnId(expandedGroupTxnId === group.id ? null : group.id)}
                            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md transition-colors"
                          >
                            <span>{expandedGroupTxnId === group.id ? 'Hide' : 'Show All'}</span>
                            {expandedGroupTxnId === group.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        </div>

                        {/* If not expanded, show the 2 most recent transactions */}
                        {expandedGroupTxnId !== group.id && group.messLedger && group.messLedger.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {group.messLedger.slice(0, 2).map((tx: any) => {
                              const isPay = tx.type === 'PAYMENT' || tx.raw_amount < 0;
                              return (
                                <div key={tx.id} className="flex items-center justify-between text-[11px] bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                                  <div className="truncate max-w-[200px]">
                                    <span className="font-bold text-slate-800">{tx.memberName || 'Member'}</span>
                                    <span className="text-slate-400 mx-1">•</span>
                                    <span className="text-slate-500 font-mono text-[10px]">{tx.invoiceNo || 'INV'}</span>
                                  </div>
                                  <span className={`font-black ${isPay ? 'text-emerald-600' : 'text-slate-800'}`}>
                                    {isPay ? '-' : '+'}BD {Number(tx.amount || 0).toFixed(3)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* If expanded, show full scrollable list of all transactions */}
                        {expandedGroupTxnId === group.id && (
                          <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1 bg-slate-50 p-2 rounded-xl border border-slate-200">
                            {(!group.messLedger || group.messLedger.length === 0) ? (
                              <p className="text-[11px] text-slate-400 text-center py-3">No transactions recorded for this group yet.</p>
                            ) : (
                              group.messLedger.map((tx: any) => {
                                const isPay = tx.type === 'PAYMENT' || tx.raw_amount < 0;
                                return (
                                  <div key={tx.id} className="flex items-center justify-between text-[11px] bg-white p-2 rounded-lg border border-slate-200/80 shadow-2xs">
                                    <div className="space-y-0.5">
                                      <div className="flex items-center gap-1.5">
                                        <span className={`px-1 py-0.2 text-[9px] font-black rounded ${isPay ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'}`}>
                                          {isPay ? 'PAID' : 'SPLIT'}
                                        </span>
                                        <span className="font-bold text-slate-900">{tx.memberName}</span>
                                        <span className="text-[10px] text-slate-400 font-mono">({tx.invoiceNo})</span>
                                      </div>
                                      <div className="text-[10px] text-slate-500">
                                        Shopper: {tx.shopperName} • {tx.formattedDate} {tx.formattedTime}
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <span className={`font-black text-xs ${isPay ? 'text-emerald-600' : 'text-slate-900'}`}>
                                        {isPay ? '-' : '+'}BD {Number(tx.amount || 0).toFixed(3)}
                                      </span>
                                      {tx.running_balance !== undefined && (
                                        <span className="text-[9px] text-slate-400 block font-mono">Bal: BD {Number(tx.running_balance).toFixed(3)}</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-xs font-bold text-indigo-600 group-hover:text-indigo-700">
                      <span>View All Members & Ledger Transactions</span>
                      <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* VIEW 2: GROUP DETAIL & AUDIT VIEW */
        <div className="flex flex-col space-y-4 animate-in fade-in">
          {/* Top Navigation & Action Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setSelectedGroup(null);
                  setActiveShopperFilter(null);
                }}
                className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer flex items-center gap-1 font-bold text-sm"
              >
                <ArrowLeft size={18} />
                <span>All Groups</span>
              </button>

              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-2xl font-black text-slate-900">{selectedGroup.group_name}</h4>
                  {selectedGroup.assignedCard && (
                    <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-mono font-bold border border-slate-200">
                      Card: {selectedGroup.assignedCard}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  Communal Room Account • {selectedGroup.members.length} Room Members
                </p>
              </div>
            </div>

            {/* Print & Share Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handlePrintRoomNotice(selectedGroup)}
                disabled={isPrinting}
                className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer shadow-xs"
                title="Print 58mm Thermal Receipt to hang in room"
              >
                <Printer size={15} />
                <span>{isPrinting ? 'Printing...' : 'Print Room Notice'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleShareWhatsApp(selectedGroup)}
                className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer shadow-xs"
                title="Send formatted breakdown to Room WhatsApp"
              >
                <MessageCircle size={15} />
                <span>WhatsApp Summary</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenAddBalanceModal(selectedGroup)}
                className="px-3.5 py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer shadow-xs"
                title="Add Previous Paper Book Balance to this room group"
              >
                <BookOpen size={15} />
                <span>+ Add Book Balance</span>
              </button>
            </div>
          </div>

          {/* KPI Dashboard Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Total Communal Debt */}
            <div className="bg-indigo-50 border-2 border-indigo-200/80 p-3 rounded-2xl">
              <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">Group Full Total</span>
              <p className="text-2xl font-black text-indigo-950 mt-0.5">
                BD {Number(selectedGroup.totalBalance).toFixed(3)}
              </p>
              <span className="text-[10px] font-semibold text-indigo-600">Shared Food & Groceries</span>
            </div>

            {/* Equal Split Calculation */}
            <div className="bg-emerald-50 border-2 border-emerald-200/80 p-3 rounded-2xl">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Equal Split Share</span>
              <p className="text-2xl font-black text-emerald-950 mt-0.5">
                BD {Number(selectedGroup.equalSplitShare || (selectedGroup.totalBalance / Math.max(1, selectedGroup.members.length))).toFixed(3)}
              </p>
              <span className="text-[10px] font-semibold text-emerald-600">Per Person Share</span>
            </div>

            {/* Active Members */}
            <div className="bg-slate-50 border-2 border-slate-200 p-3 rounded-2xl">
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">Room Members</span>
              <p className="text-2xl font-black text-slate-900 mt-0.5">{selectedGroup.members.length} Workers</p>
              <span className="text-[10px] font-semibold text-slate-500">Enrolled in Group</span>
            </div>

            {/* Total Group Orders */}
            <div className="bg-amber-50 border-2 border-amber-200/80 p-3 rounded-2xl">
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">All Transactions</span>
              <p className="text-2xl font-black text-amber-950 mt-0.5">{selectedGroup.messLedger?.length || 0} Txns</p>
              <span className="text-[10px] font-semibold text-amber-600">{groupedOrders.length} Unique Orders</span>
            </div>
          </div>

          {/* SECTION 1: ALL MEMBERS ROSTER WITH PERSONAL CREDIT SEPARATED */}
          <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-indigo-600" />
                <h5 className="font-black text-slate-800 text-sm">Room Members & Split Status</h5>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                Personal credit (private items) is strictly isolated from room food expenses
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 uppercase font-black tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Member Worker</th>
                    <th className="py-2.5 px-3">Card / CPR</th>
                    <th className="py-2.5 px-3 text-right">
                      <span className="text-slate-500">Personal Credit</span>
                    </th>
                    <th className="py-2.5 px-3 text-right font-black text-indigo-700">Mess Share Due</th>
                    <th className="py-2.5 px-3 text-right">Combined Total</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {selectedGroup.members.map((member) => {
                    const memberEqShare = Number(
                      member.equalSplitShare ||
                      selectedGroup.equalSplitShare ||
                      (selectedGroup.totalBalance / Math.max(1, selectedGroup.members.length))
                    );
                    const memberMessDue = Number(member.currentBalance ?? member.messShare ?? memberEqShare);
                    const personalDebt = Number(member.personalBalance ?? 0);
                    const combined = Number(member.consolidatedBalance ?? (personalDebt + memberMessDue));
                    const isSharePaid = memberMessDue <= 0.001;

                    return (
                      <tr key={member.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Member Name */}
                        <td className="py-3 px-3">
                          <p className="font-black text-slate-900 text-sm">{member.name}</p>
                          {member.phone && <p className="text-[11px] text-slate-400">{member.phone}</p>}
                        </td>

                        {/* Card Tag UID / CPR */}
                        <td className="py-3 px-3">
                          {member.cardUid ? (
                            <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono font-bold border border-slate-200">
                              💳 {member.cardUid}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">No Card</span>
                          )}
                        </td>

                        {/* Personal Credit (Private tab, never shared) */}
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Lock size={11} className="text-slate-400" />
                            <span className="font-bold text-slate-600">
                              BD {personalDebt.toFixed(3)}
                            </span>
                          </div>
                          <span className="text-[9px] text-slate-400 block">private tab</span>
                        </td>

                        {/* Mess Equal Share Due */}
                        <td className="py-3 px-3 text-right">
                          <span className="font-black text-sm text-indigo-700">
                            BD {memberMessDue.toFixed(3)}
                          </span>
                          <span className="text-[9px] text-indigo-500 font-bold block">equal share</span>
                        </td>

                        {/* Combined Total */}
                        <td className="py-3 px-3 text-right font-black text-slate-900">
                          BD {combined.toFixed(3)}
                        </td>

                        {/* Share Paid Status Badge */}
                        <td className="py-3 px-3 text-center">
                          {isSharePaid ? (
                            <span className="px-2 py-0.5 text-[10px] font-black bg-emerald-100 text-emerald-800 rounded-full border border-emerald-300 flex items-center justify-center gap-1 w-max mx-auto">
                              <CheckCircle2 size={11} /> PAID
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-black bg-amber-100 text-amber-800 rounded-full border border-amber-300 w-max mx-auto block">
                              DUE
                            </span>
                          )}
                        </td>

                        {/* Member Actions */}
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const newFilter = activeMemberFilter === member.id ? null : member.id;
                                setActiveMemberFilter(newFilter);
                                setActiveShopperFilter(null);
                                document.getElementById('mess-ledger-section')?.scrollIntoView({ behavior: 'smooth' });
                              }}
                              className={`px-2 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer flex items-center gap-1 ${activeMemberFilter === member.id
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                }`}
                              title={`Filter all transactions for ${member.name}`}
                            >
                              <Receipt size={12} />
                              <span>Txns ({getMemberTxnCount(member.id)})</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenPayShare(member, selectedGroup)}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[11px] active:scale-95 transition-transform cursor-pointer shadow-2xs flex items-center gap-1"
                              title="Pay equal share"
                            >
                              <Banknote size={12} />
                              <span>Pay Share</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenDepartureModal(member, selectedGroup)}
                              className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-bold text-[11px] active:scale-95 transition-transform cursor-pointer shadow-2xs flex items-center gap-1"
                              title="Member leaving flat/mess mid-month"
                            >
                              <LogOut size={12} />
                              <span>Exit Mess</span>
                            </button>
                            {onSelectCustomerForCart && (
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectCustomerForCart({
                                    id: member.id,
                                    name: member.name,
                                    phone: member.phone,
                                    cpr: member.cpr,
                                    cardUid: member.cardUid,
                                    currentBalance: member.currentBalance,
                                    mess_id: selectedGroup.id,
                                    messName: selectedGroup.group_name
                                  });
                                  onClose?.();
                                }}
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] active:scale-95 transition-transform cursor-pointer"
                                title="Link member to cart"
                              >
                                <ShoppingCart size={13} />
                              </button>
                            )}
                            {onOpenCustomerStatement && (
                              <button
                                type="button"
                                onClick={() => onOpenCustomerStatement({ id: member.id, name: member.name, mess_id: selectedGroup.id })}
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] active:scale-95 transition-transform cursor-pointer"
                                title="View personal customer statement"
                              >
                                <User size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 2: ITEMIZED GROUP LEDGER (ALL TRANSACTIONS OF EACH) */}
          <div id="mess-ledger-section" className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            {/* Header & Mode Switcher */}
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Receipt size={18} className="text-indigo-600" />
                <div>
                  <h5 className="font-black text-slate-800 text-sm">Group Transactions & Ledger Audit</h5>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Showing all purchases, splits, and settlements for this mess group
                  </p>
                </div>
              </div>

              {/* View Switcher: All Member Splits vs Grouped by Invoice */}
              <div className="flex items-center bg-slate-200/80 p-0.5 rounded-xl text-xs font-bold shrink-0">
                <button
                  type="button"
                  onClick={() => setTxnDisplayMode('ALL_SPLITS')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${txnDisplayMode === 'ALL_SPLITS'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  <Layers size={13} />
                  <span>All Member Splits ({ledgerEntries.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTxnDisplayMode('GROUPED_ORDERS')}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${txnDisplayMode === 'GROUPED_ORDERS'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  <FileText size={13} />
                  <span>Grouped by Invoice ({groupedOrders.length})</span>
                </button>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="p-3 bg-white border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* Search input */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
                <input
                  type="text"
                  placeholder="Search by invoice #, shopper, or member..."
                  value={txnSearchQuery}
                  onChange={(e) => setTxnSearchQuery(e.target.value)}
                  className="w-full text-xs py-2 pl-8 pr-7 bg-slate-50 border border-slate-200 rounded-lg focus:border-indigo-500 focus:bg-white outline-none font-medium placeholder:text-slate-400"
                />
                {txnSearchQuery && (
                  <button
                    onClick={() => setTxnSearchQuery('')}
                    className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Filter by Member Chips */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveMemberFilter(null);
                    setActiveShopperFilter(null);
                  }}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0 ${activeMemberFilter === null && activeShopperFilter === null
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  All Members
                </button>
                {selectedGroup.members.map((m) => {
                  const isSelected = activeMemberFilter === m.id;
                  const count = getMemberTxnCount(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setActiveMemberFilter(isSelected ? null : m.id);
                        setActiveShopperFilter(null);
                      }}
                      className={`px-2 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0 flex items-center gap-1 ${isSelected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                      <span>{m.name}</span>
                      <span className={`text-[10px] px-1 rounded-full ${isSelected ? 'bg-indigo-800 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}

                {(activeMemberFilter || activeShopperFilter || txnSearchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMemberFilter(null);
                      setActiveShopperFilter(null);
                      setTxnSearchQuery('');
                    }}
                    className="px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center gap-1 border border-rose-200"
                    title="Clear all active filters"
                  >
                    <X size={12} />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick Metrics Strip */}
            <div className="grid grid-cols-3 divide-x divide-slate-100 bg-slate-50/60 border-b border-slate-100 py-2 px-3 text-center">
              <div>
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Total Purchases</span>
                <span className="text-xs sm:text-sm font-black text-slate-800">
                  BD {totalDebitPurchases.toFixed(3)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Total Settled</span>
                <span className="text-xs sm:text-sm font-black text-emerald-600">
                  BD {totalCreditPayments.toFixed(3)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Net Group Due</span>
                <span className="text-xs sm:text-sm font-black text-indigo-700">
                  BD {Number(selectedGroup.totalBalance || 0).toFixed(3)}
                </span>
              </div>
            </div>

            {/* Content Area */}
            {ledgerEntries.length === 0 ? (
              <div className="py-10 text-center text-slate-400 space-y-2">
                <Receipt className="mx-auto text-slate-300" size={32} />
                <p className="text-sm font-bold text-slate-700">No transactions found</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {txnSearchQuery || activeMemberFilter || activeShopperFilter
                    ? 'No records match your active search filter.'
                    : 'Purchases charged to this room mess will appear here chronologically with full member split details.'}
                </p>
                {(txnSearchQuery || activeMemberFilter || activeShopperFilter) && (
                  <button
                    onClick={() => {
                      setActiveMemberFilter(null);
                      setActiveShopperFilter(null);
                      setTxnSearchQuery('');
                    }}
                    className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : txnDisplayMode === 'ALL_SPLITS' ? (
              /* VIEW: ALL MEMBER SPLIT ENTRIES */
              <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
                {ledgerEntries.map((tx: any) => {
                  const isPayment = tx.type === 'PAYMENT' || tx.raw_amount < 0;
                  return (
                    <div
                      key={tx.id}
                      className="p-3 hover:bg-slate-50/90 transition-colors flex items-center justify-between text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-slate-900 font-mono text-sm">
                            {tx.invoiceNo || 'INV-MESS'}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-black tracking-wide ${isPayment ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'
                              }`}
                          >
                            {isPayment ? 'PAYMENT' : 'GROCERY SPLIT'}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-500 font-medium text-[11px]">
                            {tx.formattedDate || tx.timestamp?.slice(0, 10)} {tx.formattedTime || ''}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-slate-600 flex-wrap">
                          <span className="bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 rounded text-[11px] font-bold text-indigo-900 flex items-center gap-1">
                            <User size={11} className="text-indigo-600" />
                            <span>Member: {tx.memberName || 'Room Member'}</span>
                          </span>
                          {tx.shopperName && (
                            <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px] font-medium text-slate-700 flex items-center gap-1">
                              <ShoppingCart size={11} className="text-slate-500" />
                              <span>Shopper: {tx.shopperName}</span>
                            </span>
                          )}
                          <span className="text-slate-500 truncate max-w-xs">{tx.reference || 'Mess Expense'}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0 pl-3">
                        <span
                          className={`text-base font-black ${isPayment ? 'text-emerald-600' : 'text-slate-900'
                            }`}
                        >
                          {isPayment ? '-' : '+'}BD {Number(tx.amount || 0).toFixed(3)}
                        </span>
                        {tx.running_balance !== undefined && (
                          <span className="text-[10px] text-slate-400 block font-mono">
                            Bal: BD {Number(tx.running_balance).toFixed(3)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* VIEW: GROUPED BY INVOICE / ORDER */
              <div className="max-h-[380px] overflow-y-auto p-3 space-y-2.5">
                {groupedOrders.map((order) => (
                  <div
                    key={order.invoiceNo}
                    className="bg-white border-2 border-slate-200 rounded-xl p-3 shadow-2xs hover:border-indigo-300 transition-colors"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Receipt size={14} className="text-indigo-600" />
                          <span className="font-black text-slate-900 font-mono text-sm">{order.invoiceNo}</span>
                          <span className="text-slate-400">•</span>
                          <span className="text-xs text-slate-500 font-medium">
                            {order.formattedDate || order.timestamp?.slice(0, 10)} {order.formattedTime || ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-bold text-slate-700">
                            Shopper: {order.shopperName}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-500">{order.splits.length} Members Shared</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs text-slate-400 block uppercase font-bold">Total Order</span>
                        <span className="text-base font-black text-slate-900">
                          BD {order.totalAmount.toFixed(3)}
                        </span>
                      </div>
                    </div>

                    {/* Member Splits Breakdown Grid */}
                    <div className="pt-2">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                        Member Equal Splits Breakdown
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                        {order.splits.map((s) => (
                          <div
                            key={s.id}
                            className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs flex items-center justify-between"
                          >
                            <span className="font-bold text-slate-700 truncate mr-1">{s.memberName}</span>
                            <span className="font-black text-slate-900 shrink-0">BD {s.amount.toFixed(3)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: INDIVIDUAL MEMBER SHARE SETTLEMENT */}
      {settlingMember && selectedGroup && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200">
            <div className="bg-indigo-600 text-white p-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase font-bold text-indigo-200 tracking-wider">Mess Share Settlement</p>
                <h4 className="text-xl font-black">{settlingMember.name}</h4>
                <p className="text-xs text-indigo-100">{selectedGroup.group_name} Room Mess</p>
              </div>
              <button
                onClick={() => setSettlingMember(null)}
                className="p-2 text-indigo-200 hover:text-white rounded-lg cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Debt Breakdown Notice */}
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Mess Equal Share:</span>
                  <span className="font-bold text-indigo-700">
                    BD {Number(settlingMember.equalSplitShare || selectedGroup.equalSplitShare || 0).toFixed(3)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Personal Tab (Private):</span>
                  <span className="font-bold text-slate-700">
                    BD {Number(settlingMember.personalBalance || 0).toFixed(3)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1 font-black text-slate-900">
                  <span>Total Combined Debt:</span>
                  <span>
                    BD {(Number(settlingMember.personalBalance || 0) + Number(settlingMember.equalSplitShare || selectedGroup.equalSplitShare || 0)).toFixed(3)}
                  </span>
                </div>
              </div>

              {/* Amount to Settle */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Payment Amount to Settle (BHD):
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3.5 font-black text-slate-400 text-sm">BD</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    className="w-full text-2xl font-black py-2.5 pl-12 pr-4 bg-slate-100 border-2 border-slate-200 rounded-xl focus:border-indigo-600 focus:bg-white outline-none"
                  />
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Payment Method:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettleMethod('CASH')}
                    className={`p-3 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all ${settleMethod === 'CASH'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <Banknote size={16} />
                    <span>💵 Cash</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettleMethod('BENEFIT_PAY')}
                    className={`p-3 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all ${settleMethod === 'BENEFIT_PAY'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <CreditCard size={16} />
                    <span>📱 BenefitPay</span>
                  </button>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSettlingMember(null)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSharePayment}
                  disabled={isSubmittingSettle}
                  className="flex-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-sm active:scale-95 transition-transform cursor-pointer shadow-sm flex items-center justify-center gap-2"
                >
                  {isSubmittingSettle ? (
                    <RefreshCw className="animate-spin" size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  <span>Confirm Settlement</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MEMBER DEPARTURE RESOLUTION */}
      {departingMember && selectedGroup && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/75 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-slate-200">
            {/* Header */}
            <div className="bg-rose-600 text-white p-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase font-bold text-rose-200 tracking-wider">Mid-Month Mess Departure</p>
                <h4 className="text-xl font-black">{departingMember.name}</h4>
                <p className="text-xs text-rose-100">{selectedGroup.group_name} Room Mess</p>
              </div>
              <button
                onClick={() => setDepartingMember(null)}
                className="p-2 text-rose-200 hover:text-white rounded-lg cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Financial Snapshot */}
              {(() => {
                const memberShare = Number(departingMember.equalSplitShare || (selectedGroup.totalBalance / Math.max(1, selectedGroup.members.length)) || 0);
                const personalDebt = Number(departingMember.personalBalance || 0);
                const remainingCount = Math.max(0, selectedGroup.members.length - 1);
                const sharePerRemaining = remainingCount > 0 ? (memberShare / remainingCount) : 0;

                return (
                  <>
                    <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1.5 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 font-semibold">Unpaid Mess Share to Resolve:</span>
                        <span className="font-black text-rose-700 text-sm">BD {memberShare.toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-500">
                        <span>Personal Private Tab (Not shared):</span>
                        <span className="font-bold text-slate-700">BD {personalDebt.toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-500 pt-1 border-t border-slate-200">
                        <span>Remaining Active Roommates:</span>
                        <span className="font-bold text-slate-800">{remainingCount} members</span>
                      </div>
                    </div>

                    {/* Resolution Strategy Selector */}
                    <div className="space-y-2.5">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                        Select Departure Settlement Action:
                      </label>

                      {/* Option 1: Absorb by Roommates */}
                      <label
                        className={`p-3.5 rounded-xl border-2 flex items-start gap-3 cursor-pointer transition-all ${
                          departureStrategy === 'ABSORB_BY_ROOMMATES'
                            ? 'border-indigo-600 bg-indigo-50/60'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="departureStrategy"
                          checked={departureStrategy === 'ABSORB_BY_ROOMMATES'}
                          onChange={() => setDepartureStrategy('ABSORB_BY_ROOMMATES')}
                          className="mt-1"
                        />
                        <div className="text-xs flex-1">
                          <p className="font-black text-slate-900 flex items-center justify-between">
                            <span>👥 Split & Absorb Equally by Roommates</span>
                            {remainingCount > 0 && (
                              <span className="text-indigo-700 font-black">+BD {sharePerRemaining.toFixed(3)} / member</span>
                            )}
                          </p>
                          <p className="text-slate-600 text-[11px] mt-0.5">
                            {remainingCount > 0
                              ? `Each of the ${remainingCount} remaining roommates absorbs BD ${sharePerRemaining.toFixed(3)}. Transparent audit note placed in their PWA statement.`
                              : 'No other roommates exist in this mess group to absorb the balance.'}
                          </p>
                        </div>
                      </label>

                      {/* Option 2: Settle on Departure */}
                      <label
                        className={`p-3.5 rounded-xl border-2 flex items-start gap-3 cursor-pointer transition-all ${
                          departureStrategy === 'SETTLE_ON_DEPARTURE'
                            ? 'border-emerald-600 bg-emerald-50/60'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="departureStrategy"
                          checked={departureStrategy === 'SETTLE_ON_DEPARTURE'}
                          onChange={() => setDepartureStrategy('SETTLE_ON_DEPARTURE')}
                          className="mt-1"
                        />
                        <div className="text-xs flex-1">
                          <p className="font-black text-slate-900 flex items-center justify-between">
                            <span>💵 Settle Now on Departure (Paid in Full)</span>
                            <span className="text-emerald-700 font-black">BD {memberShare.toFixed(3)}</span>
                          </p>
                          <p className="text-slate-600 text-[11px] mt-0.5">
                            Customer pays BD {memberShare.toFixed(3)} at the counter. Roommates absorb BD 0.000. Clean exit.
                          </p>
                          {departureStrategy === 'SETTLE_ON_DEPARTURE' && (
                            <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-emerald-200">
                              <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); setDepartureSettleMethod('CASH'); }}
                                className={`py-1.5 px-3 rounded-lg border font-bold text-[11px] flex items-center justify-center gap-1 ${
                                  departureSettleMethod === 'CASH'
                                    ? 'border-emerald-600 bg-emerald-600 text-white'
                                    : 'border-slate-300 bg-white text-slate-700'
                                }`}
                              >
                                <Banknote size={13} />
                                <span>Cash</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); setDepartureSettleMethod('BENEFIT_PAY'); }}
                                className={`py-1.5 px-3 rounded-lg border font-bold text-[11px] flex items-center justify-center gap-1 ${
                                  departureSettleMethod === 'BENEFIT_PAY'
                                    ? 'border-indigo-600 bg-indigo-600 text-white'
                                    : 'border-slate-300 bg-white text-slate-700'
                                }`}
                              >
                                <CreditCard size={13} />
                                <span>BenefitPay</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </label>

                      {/* Option 3: Convert to Personal Tab */}
                      <label
                        className={`p-3.5 rounded-xl border-2 flex items-start gap-3 cursor-pointer transition-all ${
                          departureStrategy === 'CONVERT_TO_PERSONAL'
                            ? 'border-amber-600 bg-amber-50/60'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="departureStrategy"
                          checked={departureStrategy === 'CONVERT_TO_PERSONAL'}
                          onChange={() => setDepartureStrategy('CONVERT_TO_PERSONAL')}
                          className="mt-1"
                        />
                        <div className="text-xs flex-1">
                          <p className="font-black text-slate-900 flex items-center justify-between">
                            <span>👤 Transfer to Member's Personal Tab</span>
                            <span className="text-amber-700 font-black">BD {memberShare.toFixed(3)}</span>
                          </p>
                          <p className="text-slate-600 text-[11px] mt-0.5">
                            Customer leaves room but remains an individual customer of the store. Mess share converts to private tab. Roommates absorb BD 0.000.
                          </p>
                        </div>
                      </label>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDepartingMember(null)}
                        className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmDeparture}
                        disabled={isSubmittingDeparture || (departureStrategy === 'ABSORB_BY_ROOMMATES' && remainingCount === 0 && memberShare > 0)}
                        className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-sm cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isSubmittingDeparture ? (
                          <>
                            <RefreshCw size={16} className="animate-spin" />
                            <span>Processing...</span>
                          </>
                        ) : (
                          <>
                            <LogOut size={16} />
                            <span>Confirm Departure</span>
                          </>
                        )}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {/* MODAL: CREATE NEW MESS GROUP (WITH PREVIOUS BOOK BALANCE MIGRATION) */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/30 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="font-black text-lg text-white">Create New Mess Group</h3>
                  <p className="text-xs text-indigo-200">Enroll room/camp communal account & migrate paper book debts</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateGroupModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl cursor-pointer hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-slate-900">
              {/* Group Name */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                  Mess / Room / Camp Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Camp 4 Room 12 Mess, Villa 3, Block 202"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Physical Tag (Optional) */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                  Shared Physical NFC Tag UID (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 04:8A:21:5A:F1:48:80 (Leave blank if none)"
                  value={newGroupTagId}
                  onChange={(e) => setNewGroupTagId(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Previous Book Balance Section */}
              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen size={16} className="text-amber-600" />
                    <label className="block text-xs font-black uppercase tracking-wider text-amber-900">
                      Previous Book Balance (Physical Ledger Debt)
                    </label>
                  </div>
                  <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-100/90 px-2 py-0.5 rounded-full border border-amber-200">
                    Paper Book Migration
                  </span>
                </div>

                <div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-xs font-black text-amber-700 select-none">
                      BD
                    </span>
                    <input
                      type="number"
                      step="0.005"
                      min="0"
                      placeholder="0.000 (e.g. 45.600)"
                      value={newGroupPreviousBalance}
                      onChange={(e) => setNewGroupPreviousBalance(e.target.value)}
                      className="w-full pl-11 pr-4 py-2.5 bg-white border border-amber-300 rounded-xl text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-slate-400 font-mono"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Enter the existing room balance from your paper ledger book. It will be split with zero-fils drift across enrolled members.
                  </p>
                </div>

                {parseFloat(newGroupPreviousBalance) > 0 && (
                  <div className="space-y-2">
                    {newGroupMembers.length > 0 ? (
                      <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs flex items-center justify-between text-emerald-800 font-bold">
                        <span>⚖️ Zero-Drift Split:</span>
                        <span className="font-mono font-black text-emerald-900">
                          BD {parseFloat(newGroupPreviousBalance).toFixed(3)} ÷ {newGroupMembers.length} = BD {(parseFloat(newGroupPreviousBalance) / newGroupMembers.length).toFixed(3)} / member
                        </span>
                      </div>
                    ) : (
                      <div className="p-2.5 bg-amber-100/80 border border-amber-300 rounded-xl text-xs text-amber-900 font-bold flex items-center gap-1.5">
                        <span>⚠️</span>
                        <span>Please select at least 1 room member below to allocate this opening book balance.</span>
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-1">
                        Opening Balance Note / Reference (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Migration from notebook page 14"
                        value={newGroupDescription}
                        onChange={(e) => setNewGroupDescription(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Room Members Selector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Room Members ({newGroupMembers.length} Selected)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const q = customerSearchQuery.trim().toLowerCase();
                        const filtered = customerDirectory.filter((c: any) =>
                          !q ||
                          (c.name || '').toLowerCase().includes(q) ||
                          (c.cpr && c.cpr.includes(q)) ||
                          (c.phone && c.phone.includes(q))
                        );
                        const newIds = Array.from(new Set([...newGroupMembers, ...filtered.map((c: any) => c.id)]));
                        setNewGroupMembers(newIds);
                      }}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                    >
                      Select All Filtered
                    </button>
                    {newGroupMembers.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setNewGroupMembers([])}
                        className="text-[11px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>

                <div className="relative mb-2">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search workers by name, phone, or CPR..."
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                  {customerDirectory.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">Loading customer directory...</div>
                  ) : (
                    customerDirectory
                      .filter((c: any) => {
                        if (!customerSearchQuery.trim()) return true;
                        const q = customerSearchQuery.toLowerCase();
                        return (
                          (c.name || '').toLowerCase().includes(q) ||
                          (c.cpr && c.cpr.includes(q)) ||
                          (c.phone && c.phone.includes(q))
                        );
                      })
                      .map((c: any) => {
                        const isSelected = newGroupMembers.includes(c.id);
                        return (
                          <div
                            key={c.id}
                            onClick={() => {
                              if (isSelected) {
                                setNewGroupMembers(prev => prev.filter(id => id !== c.id));
                              } else {
                                setNewGroupMembers(prev => [...prev, c.id]);
                              }
                            }}
                            className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50/80' : 'hover:bg-slate-50'
                              }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-4 h-4 rounded flex items-center justify-center border transition ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                                }`}>
                                {isSelected && <CheckCircle2 size={12} />}
                              </div>
                              <div className="truncate">
                                <p className="text-xs font-black text-slate-800 truncate">{c.name}</p>
                                <p className="text-[10px] text-slate-400">
                                  {c.phone || c.cpr ? `📞 ${c.phone || 'No phone'} | CPR: ${c.cpr || '-'}` : 'Worker'}
                                </p>
                              </div>
                            </div>
                            <span className="text-[11px] font-mono font-bold text-slate-500">
                              BD {Number(c.balance || c.currentBalance || 0).toFixed(3)}
                            </span>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateGroupModal(false)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateMessGroupSubmit}
                disabled={isSubmittingCreate || !newGroupName.trim()}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm cursor-pointer active:scale-95 transition-all"
              >
                {isSubmittingCreate && <RefreshCw size={14} className="animate-spin" />}
                <span>Create Mess Group & Post Balance</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD PREVIOUS BOOK BALANCE TO EXISTING MESS GROUP */}
      {balanceModalGroup && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92dvh] animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-900 to-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/30 border border-amber-400/30 flex items-center justify-center text-amber-300">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h3 className="font-black text-lg text-white">Add Previous Book Balance</h3>
                  <p className="text-xs text-amber-200">{balanceModalGroup.group_name} • Physical Ledger Migration</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBalanceModalGroup(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl cursor-pointer hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain text-slate-900">
              {/* Group Snapshot Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Current Mess Debt</span>
                  <p className="text-xl font-black text-slate-900 mt-0.5">BD {Number(balanceModalGroup.totalBalance || 0).toFixed(3)}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Enrolled Members</span>
                  <p className="text-xl font-black text-indigo-700 mt-0.5">{balanceModalGroup.members.length} Workers</p>
                </div>
              </div>

              {/* Amount to Add */}
              <div className="p-4 bg-amber-50/70 border-2 border-amber-300 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black uppercase tracking-wider text-amber-900">
                    Previous Book Balance to Add (BD) *
                  </label>
                  <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-100/90 px-2 py-0.5 rounded-full border border-amber-200">
                    Paper Book Migration
                  </span>
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-3 text-sm font-black text-amber-700 select-none">
                    BD
                  </span>
                  <input
                    type="number"
                    step="0.005"
                    min="0"
                    placeholder="0.000 (e.g. 45.600)"
                    value={addBalanceAmount}
                    onChange={(e) => setAddBalanceAmount(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white border-2 border-amber-400 rounded-xl text-lg font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-slate-400 font-mono"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Enter the balance owed from your physical paper book. It will be split with zero-fils drift across all {balanceModalGroup.members.length} members.
                </p>

                {parseFloat(addBalanceAmount) > 0 && balanceModalGroup.members.length > 0 && (
                  <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs flex items-center justify-between text-emerald-900 font-bold">
                    <span>⚖️ Zero-Drift Split:</span>
                    <span className="font-mono font-black text-emerald-900">
                      BD {parseFloat(addBalanceAmount).toFixed(3)} ÷ {balanceModalGroup.members.length} = BD {(parseFloat(addBalanceAmount) / balanceModalGroup.members.length).toFixed(3)} / member
                    </span>
                  </div>
                )}
              </div>

              {/* Note / Reference */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                  Reference Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Migration from paper book page 14"
                  value={addBalanceDescription}
                  onChange={(e) => setAddBalanceDescription(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Members who will receive this balance */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-2">
                  Receiving Members ({balanceModalGroup.members.length})
                </label>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                  {balanceModalGroup.members.map((m: MessMemberItem) => (
                    <div key={m.id} className="p-2.5 flex items-center justify-between text-xs">
                      <div className="truncate pr-2">
                        <span className="font-bold text-slate-800">{m.name}</span>
                        {m.phone && <span className="text-[10px] text-slate-400 ml-1.5 font-mono">({m.phone})</span>}
                      </div>
                      {parseFloat(addBalanceAmount) > 0 && (
                        <span className="text-emerald-700 font-mono font-bold shrink-0">
                          +BD {(parseFloat(addBalanceAmount) / balanceModalGroup.members.length).toFixed(3)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sticky Action Footer */}
            <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setBalanceModalGroup(null)}
                className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-sm font-bold cursor-pointer active:scale-95 transition-all min-h-[48px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddBalanceSubmit}
                disabled={isSubmittingBalance || !parseFloat(addBalanceAmount) || parseFloat(addBalanceAmount) <= 0}
                className="flex-[2] py-3 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 text-white rounded-xl text-sm font-black flex items-center justify-center gap-2 shadow-md cursor-pointer active:scale-95 transition-all min-h-[48px]"
              >
                {isSubmittingBalance ? <RefreshCw size={16} className="animate-spin" /> : <BookOpen size={18} />}
                <span>{isSubmittingBalance ? 'Posting Balance...' : 'Post Book Balance to Room'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
