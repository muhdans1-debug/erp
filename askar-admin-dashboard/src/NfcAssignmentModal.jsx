import React, { useState, useEffect, useMemo } from 'react';
import { adminDb } from './db';
import {
  CreditCard, Users, User, Check, X, Search, Plus,
  Copy, CheckCheck, RefreshCw, AlertCircle, Sparkles, Building2, ShieldCheck
} from 'lucide-react';

export default function NfcAssignmentModal({
  isOpen,
  onClose,
  initialTagId = '',
  onSuccess,
  broadcastNfcAssigned
}) {
  const [tagId, setTagId] = useState(initialTagId);
  const [assignmentMode, setAssignmentMode] = useState('PERSONAL'); // 'PERSONAL' | 'MESS'
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Personal Account State
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCreateQuickCustomer, setShowCreateQuickCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerBatch, setNewCustomerBatch] = useState('');

  // Mess Group State
  const [messMode, setMessMode] = useState('NEW'); // 'NEW' | 'EXISTING'
  const [messGroups, setMessGroups] = useState([]);
  const [selectedMessGroupId, setSelectedMessGroupId] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState(new Set());
  const [memberSearch, setMemberSearch] = useState('');

  // Sync initial tag ID
  useEffect(() => {
    if (initialTagId) {
      setTagId(initialTagId);
    }
  }, [initialTagId]);

  // Load Customers & Mess Groups from Turso Cloud
  const loadData = async () => {
    try {
      // 1. Fetch all customers from unified Customer table
      const custRes = await adminDb.execute(`
        SELECT id, name, phone, batchNo, cpr, cardUid, mess_id, COALESCE(balance, 0) as balance, access_token 
        FROM Customer 
        ORDER BY name ASC
      `);
      setCustomers(custRes.rows);

      // 3. Fetch existing Mess Groups
      const messRes = await adminDb.execute(`
        SELECT id, group_name, createdAt 
        FROM MessGroup 
        ORDER BY group_name ASC
      `);
      setMessGroups(messRes.rows);

      if (messRes.rows.length > 0 && !selectedMessGroupId) {
        setSelectedMessGroupId(messRes.rows[0].id);
      }
    } catch (err) {
      console.error('Error loading NFC modal data from Turso:', err);
      setErrorMsg('Failed to fetch customers/groups from Turso.');
    }
  };

  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      setSuccessMsg('');
      loadData();
    }
  }, [isOpen]);

  // Filtered customer list for Personal tab
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.batchNo || '').toLowerCase().includes(q) ||
      (c.cpr || '').toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  // Filtered members list for Mess tab
  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return customers;
    const q = memberSearch.toLowerCase();
    return customers.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.batchNo || '').toLowerCase().includes(q)
    );
  }, [customers, memberSearch]);

  const handleCopyTag = () => {
    if (tagId) {
      navigator.clipboard?.writeText(tagId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleMemberSelection = (id) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllMembersInBatch = (batchNo) => {
    if (!batchNo) return;
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      customers.filter(c => c.batchNo === batchNo).forEach(c => next.add(c.id));
      return next;
    });
  };

  // --- SUBMISSION HANDLERS ---

  // 1. Assign to Personal Account
  const handleAssignPersonal = async (e) => {
    e?.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanTag = (tagId || '').trim().toUpperCase();
    if (!cleanTag) {
      setErrorMsg('Please specify a valid NFC Tag UID.');
      return;
    }

    let targetCustId = selectedCustomerId;

    setIsSubmitting(true);
    try {
      // If manager created a new customer on-the-fly
      if (showCreateQuickCustomer) {
        if (!newCustomerName.trim()) {
          setErrorMsg('Please enter a name for the new customer.');
          setIsSubmitting(false);
          return;
        }
        targetCustId = 'cust_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

        await adminDb.execute({
          sql: `INSERT INTO Customer (id, tenantId, name, phone, batchNo, cardUid, access_token, balance, createdAt, is_active, isActive)
                VALUES (?, 'tenant_1', ?, ?, ?, ?, ?, 0.0, datetime('now'), 1, 1)`,
          args: [targetCustId, newCustomerName.trim(), newCustomerPhone.trim() || null, newCustomerBatch.trim() || null, cleanTag, cleanTag]
        });
      } else {
        if (!targetCustId) {
          setErrorMsg('Please select a customer to link this NFC card.');
          setIsSubmitting(false);
          return;
        }

        // Update customer's cardUid
        await adminDb.execute({
          sql: `UPDATE Customer SET cardUid = ? WHERE id = ?`,
          args: [cleanTag, targetCustId]
        });
      }

      // Find if customer belongs to a Mess Group
      const customerObj = customers.find(c => c.id === targetCustId) || { name: newCustomerName };
      const targetName = customerObj.name || 'Customer';
      const messIdForCustomer = customerObj.mess_id || null;

      // Upsert into NfcCard table - preserves mess_id so the card is Dual-Wallet ready!
      await adminDb.execute({
        sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, mess_id, createdAt)
              VALUES (?, 'PERSONAL', ?, ?, datetime('now'))
              ON CONFLICT(tag_id) DO UPDATE SET 
                card_type = 'PERSONAL',
                customer_id = excluded.customer_id,
                mess_id = excluded.mess_id`,
        args: [cleanTag, targetCustId, messIdForCustomer]
      });

      setSuccessMsg(`Card [${cleanTag}] linked to ${targetName}${messIdForCustomer ? ' (Dual-Wallet: Personal + Mess ready!)' : ''}!`);

      // Broadcast over RJ45 Bridge to Sunmi terminal
      if (broadcastNfcAssigned) {
        broadcastNfcAssigned(cleanTag, 'PERSONAL', targetName);
      }

      if (onSuccess) {
        onSuccess({ tag_id: cleanTag, card_type: 'PERSONAL', target_name: targetName });
      }

      setTimeout(() => {
        onClose();
      }, 1200);

    } catch (err) {
      console.error('Error assigning personal NFC card:', err);
      setErrorMsg(err.message || 'Failed to save card assignment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Create or Assign to Mess Group
  const handleAssignMess = async (e) => {
    e?.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanTag = (tagId || '').trim().toUpperCase();
    if (!cleanTag) {
      setErrorMsg('Please specify a valid NFC Tag UID.');
      return;
    }

    setIsSubmitting(true);
    try {
      let targetGroupId = selectedMessGroupId;
      let targetGroupName = '';

      if (messMode === 'NEW') {
        if (!newGroupName.trim()) {
          setErrorMsg('Please specify a name for the Mess Group (e.g. Camp 4 Mess).');
          setIsSubmitting(false);
          return;
        }
        if (selectedMemberIds.size === 0) {
          setErrorMsg('Please select at least one member for this mess group.');
          setIsSubmitting(false);
          return;
        }

        targetGroupId = 'mess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        targetGroupName = newGroupName.trim();

        // Create MessGroup in Turso
        await adminDb.execute({
          sql: `INSERT INTO MessGroup (id, tenantId, group_name, createdAt)
                VALUES (?, 'tenant_1', ?, datetime('now'))`,
          args: [targetGroupId, targetGroupName]
        });

        // Link all selected members to this mess group
        const memberIdsArray = Array.from(selectedMemberIds);
        for (const mId of memberIdsArray) {
          await adminDb.execute({
            sql: `UPDATE Customer SET mess_id = ? WHERE id = ?`,
            args: [targetGroupId, mId]
          });
        }
      } else {
        if (!targetGroupId) {
          setErrorMsg('Please select an existing mess group.');
          setIsSubmitting(false);
          return;
        }
        const found = messGroups.find(g => g.id === targetGroupId);
        targetGroupName = found?.group_name || 'Mess Group';

        // Update any newly selected members
        const memberIdsArray = Array.from(selectedMemberIds);
        for (const mId of memberIdsArray) {
          await adminDb.execute({
            sql: `UPDATE Customer SET mess_id = ? WHERE id = ?`,
            args: [targetGroupId, mId]
          });
        }
      }

      // Upsert into NfcCard table as MESS card
      await adminDb.execute({
        sql: `INSERT INTO NfcCard (tag_id, card_type, customer_id, mess_id, createdAt)
              VALUES (?, 'MESS', NULL, ?, datetime('now'))
              ON CONFLICT(tag_id) DO UPDATE SET 
                card_type = 'MESS',
                customer_id = NULL,
                mess_id = excluded.mess_id`,
        args: [cleanTag, targetGroupId]
      });

      const memberCount = messMode === 'NEW' ? selectedMemberIds.size : 'Active';
      setSuccessMsg(`Card [${cleanTag}] linked to Mess Group: "${targetGroupName}" (${memberCount} members)!`);

      // Broadcast over RJ45 Bridge to Sunmi terminal
      if (broadcastNfcAssigned) {
        broadcastNfcAssigned(cleanTag, 'MESS', targetGroupName);
      }

      if (onSuccess) {
        onSuccess({ tag_id: cleanTag, card_type: 'MESS', target_name: targetGroupName });
      }

      setTimeout(() => {
        onClose();
      }, 1200);

    } catch (err) {
      console.error('Error assigning mess NFC card:', err);
      setErrorMsg(err.message || 'Failed to save mess card assignment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150"
      >
        {/* MODAL HEADER */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 px-6 py-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 shadow-inner">
              <CreditCard className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-widest text-indigo-400 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  NFC Card Enrollment Hub
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  RJ45 Hardware Link
                </span>
              </div>
              <h2 className="text-lg font-black text-white tracking-tight">
                {initialTagId ? 'Unregistered Card Scanned on Sunmi' : 'Assign NFC Hardware Card'}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* TAG UID DISPLAY / EDIT BAR */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Scanned UID:
            </span>
            <div className="flex items-center bg-white px-3 py-1 rounded-xl border border-slate-300 font-mono text-sm font-bold text-indigo-950 shadow-sm">
              <input
                type="text"
                value={tagId}
                onChange={(e) => setTagId(e.target.value.toUpperCase())}
                placeholder="04:XX:XX:XX"
                className="outline-none bg-transparent w-48 font-mono uppercase"
              />
              <button
                type="button"
                onClick={handleCopyTag}
                className="text-slate-400 hover:text-slate-700 ml-1.5 transition"
                title="Copy UID"
              >
                {copied ? <CheckCheck className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* TWO PRIMARY ASSIGNMENT BUTTONS / TABS */}
          <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => setAssignmentMode('PERSONAL')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition ${assignmentMode === 'PERSONAL'
                  ? 'bg-white text-indigo-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <User className="w-4 h-4" />
              Personal Account
            </button>
            <button
              type="button"
              onClick={() => setAssignmentMode('MESS')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition ${assignmentMode === 'MESS'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <Users className="w-4 h-4" />
              Mess Group (Split-Bill)
            </button>
          </div>
        </div>

        {/* STATUS MESSAGES */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs font-bold flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2 shrink-0 animate-in fade-in">
            <Check className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* MODAL BODY */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* ======================================================== */}
          {/* TAB 1: ASSIGN TO PERSONAL ACCOUNT */}
          {/* ======================================================== */}
          {assignmentMode === 'PERSONAL' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Select Individual Customer</h3>
                  <p className="text-xs text-slate-500">
                    Tapping this card will directly debit 100% of purchases to this customer's Khata.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateQuickCustomer(!showCreateQuickCustomer)}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {showCreateQuickCustomer ? 'Pick Existing' : 'Create New'}
                </button>
              </div>

              {/* QUICK NEW CUSTOMER FORM */}
              {showCreateQuickCustomer ? (
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 space-y-3">
                  <div className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-indigo-600" />
                    Register New Customer for this Card
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">Full Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Tariq Mansoor"
                        value={newCustomerName}
                        onChange={(e) => setNewCustomerName(e.target.value)}
                        className="w-full px-3 py-2 bg-white rounded-xl border border-slate-300 text-xs font-bold outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">Phone Number</label>
                      <input
                        type="text"
                        placeholder="e.g. 39123456"
                        value={newCustomerPhone}
                        onChange={(e) => setNewCustomerPhone(e.target.value)}
                        className="w-full px-3 py-2 bg-white rounded-xl border border-slate-300 text-xs font-bold outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">Camp / Room Batch</label>
                      <input
                        type="text"
                        placeholder="e.g. BLK-4 / Room 12"
                        value={newCustomerBatch}
                        onChange={(e) => setNewCustomerBatch(e.target.value)}
                        className="w-full px-3 py-2 bg-white rounded-xl border border-slate-300 text-xs font-bold outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* EXISTING CUSTOMER SELECTOR */
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search customer by name, phone, or camp room..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:bg-white focus:border-indigo-500 transition"
                    />
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1.5 border border-slate-200 rounded-2xl p-2 bg-slate-50/50">
                    {filteredCustomers.length === 0 ? (
                      <div className="text-center py-6 text-xs text-slate-400">
                        No matching customers found.
                      </div>
                    ) : (
                      filteredCustomers.map((cust) => {
                        const isSelected = selectedCustomerId === cust.id;
                        const hasCard = Boolean(cust.cardUid);
                        return (
                          <div
                            key={cust.id}
                            onClick={() => setSelectedCustomerId(cust.id)}
                            className={`p-3 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition ${isSelected
                                ? 'bg-indigo-50 border-indigo-400 text-indigo-950 font-bold shadow-sm'
                                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                              }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                                }`}>
                                {cust.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold flex items-center gap-2">
                                  <span>{cust.name}</span>
                                  {cust.batchNo && (
                                    <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded text-[10px] font-mono">
                                      {cust.batchNo}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                  <span>{cust.phone || 'No Phone'}</span>
                                  {hasCard && (
                                    <span className="text-amber-700 font-mono text-[10px]">
                                      • Card: {cust.cardUid}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="font-mono font-bold text-slate-900">
                                BD {Number(cust.balance || 0).toFixed(3)}
                              </div>
                              {isSelected && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600 font-bold mt-0.5">
                                  <Check className="w-3 h-3" /> Selected
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: CREATE / ASSIGN TO MESS GROUP */}
          {/* ======================================================== */}
          {assignmentMode === 'MESS' && (
            <div className="space-y-4">
              {/* MESS SUB-MODE SELECTOR */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Mess Group Split-Billing</h3>
                  <p className="text-xs text-slate-500">
                    Groceries purchased with this card are automatically split equally across all group members.
                  </p>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setMessMode('NEW')}
                    className={`px-3 py-1 rounded-lg transition ${messMode === 'NEW' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    + New Group
                  </button>
                  <button
                    type="button"
                    onClick={() => setMessMode('EXISTING')}
                    className={`px-3 py-1 rounded-lg transition ${messMode === 'EXISTING' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    Existing ({messGroups.length})
                  </button>
                </div>
              </div>

              {/* OPTION A: NEW MESS GROUP */}
              {messMode === 'NEW' ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Mess Group Title *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Camp 4 Mess, Ahmed's Room, Alba Shift B..."
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="w-full px-3 py-2 bg-white rounded-xl border border-slate-300 text-xs font-bold outline-none focus:border-emerald-500 shadow-sm"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-emerald-600" />
                        Select Mess Members (Checklist)
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                          {selectedMemberIds.size} Selected
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setSelectedMemberIds(new Set())}
                        className="text-[11px] font-bold text-slate-400 hover:text-slate-600"
                      >
                        Clear All
                      </button>
                    </div>

                    <div className="relative mb-2">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search workers to add to mess checklist..."
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:bg-white focus:border-emerald-500 transition"
                      />
                    </div>

                    <div className="max-h-56 overflow-y-auto space-y-1 border border-slate-200 rounded-2xl p-2 bg-slate-50/50">
                      {filteredMembers.map((member) => {
                        const isChecked = selectedMemberIds.has(member.id);
                        return (
                          <div
                            key={member.id}
                            onClick={() => toggleMemberSelection(member.id)}
                            className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition ${isChecked
                                ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold shadow-sm'
                                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                              }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => { }} // handled by row click
                                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                              />
                              <div>
                                <span className="font-bold">{member.name}</span>
                                <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                                  <span>{member.phone || 'No Phone'}</span>
                                  {member.batchNo && (
                                    <span
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        selectAllMembersInBatch(member.batchNo);
                                      }}
                                      className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded text-[9px] hover:bg-slate-200"
                                      title="Click to select all in this batch"
                                    >
                                      Batch: {member.batchNo} (+All)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <span className="font-mono text-[11px] text-slate-600">
                              BD {Number(member.balance || 0).toFixed(3)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                /* OPTION B: EXISTING MESS GROUP */
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Select Existing Mess Group
                    </label>
                    <select
                      value={selectedMessGroupId}
                      onChange={(e) => setSelectedMessGroupId(e.target.value)}
                      className="w-full px-3 py-2 bg-white rounded-xl border border-slate-300 text-xs font-bold outline-none focus:border-emerald-500"
                    >
                      {messGroups.map(g => (
                        <option key={g.id} value={g.id}>
                          {g.group_name} (Created {new Date(g.createdAt).toLocaleDateString()})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Show current members inside selected mess group */}
                  <div>
                    <span className="text-xs font-bold text-slate-600 block mb-1">
                      Current Members in this Group:
                    </span>
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 max-h-40 overflow-y-auto">
                      {customers.filter(c => c.mess_id === selectedMessGroupId).length === 0 ? (
                        <div className="text-xs text-slate-400 text-center py-2">
                          No members currently linked to this group.
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {customers.filter(c => c.mess_id === selectedMessGroupId).map(m => (
                            <div key={m.id} className="text-xs font-bold text-slate-800 flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-emerald-600" />
                                <span>{m.name}</span>
                              </div>
                              <span className="font-mono text-slate-500 text-[11px]">
                                BD {Number(m.balance || 0).toFixed(3)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition disabled:opacity-50"
          >
            Cancel
          </button>

          {assignmentMode === 'PERSONAL' ? (
            <button
              type="button"
              onClick={handleAssignPersonal}
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Saving to Turso...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Assign Card to Personal Account
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAssignMess}
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Syncing Mess Group...
                </>
              ) : (
                <>
                  <Users className="w-4 h-4" />
                  {messMode === 'NEW'
                    ? `Create Mess Group & Link Card (${selectedMemberIds.size} Members)`
                    : 'Link Card to Existing Mess Group'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

