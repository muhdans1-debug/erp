import React, { useState } from 'react';
import { 
  ChevronDown, 
  ShoppingBag, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Receipt, 
  Share2, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  ShieldCheck, 
  Tag, 
  FileText,
  Sparkles,
  ExternalLink,
  Users,
  CreditCard,
  BookOpen
} from 'lucide-react';

export default function TransactionItemCard({
  tx,
  lang = 'en',
  currency = 'BHD',
  highlighted = false,
  onViewReceipt
}) {
  const [expanded, setExpanded] = useState(Boolean(highlighted));
  const [loadingItems, setLoadingItems] = useState(false);
  const [invoiceDetails, setInvoiceDetails] = useState(null);

  const amt = Number(tx.amount || 0);
  const isDepositDeferred = tx.type === 'DEPOSIT_DEFERRED' || tx.subledger_type === 'DEPOSIT_DEFERRED';
  const isDepositHeld = tx.type === 'CARD_DEPOSIT' || tx.type === 'DEPOSIT_COLLECTED' || tx.subledger_type === 'DEPOSIT';
  const isDepositTx = isDepositDeferred || isDepositHeld;
  const isCreditTx = !isDepositTx && ((tx.type || '').toUpperCase().includes('SETTLE') || 
                     (tx.type || '').toUpperCase().includes('PAY') || 
                     amt < 0);
  const isOpeningBalance = !isDepositTx && (tx.type || '').toUpperCase().includes('OPENING');
  const isMessSplit = !isDepositTx && Boolean(
    tx.subledger_type === 'MESS_SHARE' ||
    tx.mess_id || 
    tx.is_mess_split ||
    tx.group_total ||
    tx.category === 'MESS_SPLIT' || 
    (tx.reference && tx.reference.toLowerCase().includes('mess split'))
  );
  const fullBasketBill = Number(tx.bill_total || tx.group_total || invoiceDetails?.total || Math.abs(amt));
  const memberShareBill = Number(tx.split_share !== null && tx.split_share !== undefined ? tx.split_share : Math.abs(amt));

  let messRoomName = tx.messName || null;
  let shopperName = null;
  if (tx.reference) {
    const roomMatch = tx.reference.match(/Mess Split:\s*([^(\-]+)/i);
    if (roomMatch) messRoomName = roomMatch[1].trim();
    const shopperMatch = tx.reference.match(/Shopper:\s*([^)]+)/i);
    if (shopperMatch) shopperName = shopperMatch[1].trim();
  }

  const depositFaceAmount = Number(tx.displayAmount ?? tx.depositAmount ?? tx.deposit_amount ?? (Number(tx.amount) > 0 ? tx.amount : null) ?? tx.card_deposit_amount ?? 3.0).toFixed(3);
  const formattedAmt = isDepositTx ? depositFaceAmount : Math.abs(amt).toFixed(3);

  // Format Date and Time
  let dateText = '';
  let timeText = '';
  try {
    const d = new Date(tx.timestamp || tx.created_at || Date.now());
    dateText = d.toLocaleDateString(lang === 'ar' ? 'ar-BH' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    timeText = d.toLocaleTimeString(lang === 'ar' ? 'ar-BH' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    dateText = tx.timestamp || '';
  }

  const runningBal = tx.running_balance !== undefined && tx.running_balance !== null
    ? Number(tx.running_balance).toFixed(3)
    : null;

  const invoiceNo = tx.invoiceNo || tx.reference || tx.id || '';

  // Handle Accordion Toggle & On-Demand Invoice Item Fetching
  const handleToggle = async () => {
    const nextState = !expanded;
    setExpanded(nextState);

    // If opening a purchase transaction and we don't have items yet
    if (nextState && !isCreditTx && !isOpeningBalance && !isDepositTx && !invoiceDetails) {
      if (Array.isArray(tx.items) && tx.items.length > 0) {
        setInvoiceDetails({
          invoiceNo,
          total: Math.abs(amt),
          subtotal: (Math.abs(amt) / 1.10).toFixed(3),
          totalVat: (Math.abs(amt) - (Math.abs(amt) / 1.10)).toFixed(3),
          items: tx.items,
          createdAt: tx.timestamp || tx.created_at,
          paymentType: 'STORE CREDIT (KHATA)'
        });
      } else if (invoiceNo) {
        try {
          setLoadingItems(true);
          const res = await fetch(`/api/invoice/${encodeURIComponent(invoiceNo)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && (data.invoice || data.sale)) {
              setInvoiceDetails(data.invoice || data.sale);
            }
          }
        } catch (err) {
          console.warn('Failed to fetch invoice items on demand:', err);
        } finally {
          setLoadingItems(false);
        }
      }
    }
  };

  const handleShareWhatsApp = (e) => {
    e.stopPropagation();
    const items = invoiceDetails?.items || tx.items || [];
    let itemsText = items.map((it, idx) => 
      `${idx + 1}. ${it.name} (x${it.quantity || it.qty || 1}) - BHD ${Number(it.total || (Number(it.price || 0) * Number(it.quantity || 1))).toFixed(3)}`
    ).join('\n');

    const msg = 
      `*LAYALI SUPERMARKET RECEIPT*\n` +
      `Invoice #: ${invoiceNo}\n` +
      `Date: ${dateText} ${timeText}\n` +
      `Amount: BHD ${formattedAmt}\n` +
      `--------------------------------\n` +
      (itemsText ? `Items:\n${itemsText}\n--------------------------------\n` : '') +
      `Verified by Layali Khata Portal`;

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const currentItems = invoiceDetails?.items || tx.items || [];
  const itemCount = currentItems.length || (tx.itemCount || (isCreditTx ? 0 : 1));

  // Determine Primary Title
  const getDisplayTitle = () => {
    if (isDepositTx) return lang === 'ar' ? 'تأمين البطاقة الذكية' : 'Card Security Deposit';
    if (isMessSplit) return `Mess Split • ${messRoomName || 'Room Share'}`;
    if (isCreditTx) {
      if (tx.reference?.includes('BenefitPay') || tx.reference?.includes('Fawri')) return 'BenefitPay Fawri+';
      if (tx.reference?.includes('Cash')) return 'Cash Settle';
      return 'Payment Received';
    }
    if (isOpeningBalance) return 'Opening Balance (Khata)';
    return 'Grocery Purchase';
  };

  return (
    <div className={`rounded-2xl border text-xs font-mono transition-all overflow-hidden shadow-xs ${
      highlighted 
        ? 'bg-slate-900 border-emerald-500 ring-2 ring-emerald-500/50 shadow-lg shadow-emerald-500/20' 
        : 'bg-slate-900/90 hover:bg-slate-900 border-slate-800'
    }`}>
      {/* Clickable Header Row */}
      <div 
        onClick={handleToggle}
        className="p-3.5 flex items-start justify-between gap-2.5 cursor-pointer select-none active:bg-slate-850"
      >
        {/* Left: Icon, Title & Date */}
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
            isDepositTx
              ? isDepositDeferred
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : isCreditTx 
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
              : isOpeningBalance
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : isMessSplit
              ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
          }`}>
            {isDepositTx ? (
              <ShieldCheck className={`w-4 h-4 ${isDepositDeferred ? 'text-amber-400' : 'text-emerald-400'}`} />
            ) : isCreditTx ? (
              <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
            ) : isOpeningBalance ? (
              <BookOpen className="w-4 h-4 text-amber-400" />
            ) : isMessSplit ? (
              <Users className="w-4 h-4 text-indigo-400" />
            ) : (
              <ShoppingBag className="w-4 h-4 text-rose-400" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-slate-200 font-sans font-bold text-xs truncate">
                {getDisplayTitle()}
              </p>
              {highlighted && (
                <span className="text-[10px] font-sans font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 flex items-center gap-1 animate-pulse">
                  <ShieldCheck className="w-2.5 h-2.5" /> Receipt Verified
                </span>
              )}
              {isDepositTx ? (
                isDepositDeferred ? (
                  <span className="font-black text-xs uppercase tracking-wider text-amber-400">
                    Credit Deposit
                  </span>
                ) : (
                  <span className="font-black text-xs uppercase tracking-wider text-emerald-400">
                    Deposited
                  </span>
                )
              ) : isMessSplit ? (
                <span className="text-[10px] font-sans font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                  <Users className="w-2.5 h-2.5" /> {messRoomName || 'Room Mess'}
                </span>
              ) : isCreditTx ? (
                <span className="text-[10px] font-sans font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {tx.categoryBadge || 'Payment'}
                </span>
              ) : isOpeningBalance ? (
                <span className="text-[10px] font-sans font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Opening
                </span>
              ) : (
                <span className="text-[10px] font-sans font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60">
                  Personal Tab
                </span>
              )}
              {!isCreditTx && !isOpeningBalance && !isDepositTx && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1 font-mono flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
                <span>{dateText}</span>
              </span>
              {timeText && (
                <span className="flex items-center gap-1">
                  <span className="text-slate-600">•</span>
                  <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                  <span>{timeText}</span>
                </span>
              )}
              {shopperName && (
                <span className="text-indigo-300/80 font-sans">
                  • Shopper: {shopperName}
                </span>
              )}
              {invoiceNo && !isMessSplit && !isCreditTx && (
                <span className="text-slate-500 font-mono">
                  • #{invoiceNo}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Amount, Running Balance & Expand Indicator */}
        <div className="text-right shrink-0 flex items-center gap-2">
          <div>
            {isMessSplit && fullBasketBill > memberShareBill ? (
              <>
                <span className="font-black text-xs block text-amber-400 font-mono">
                  +{currency} {memberShareBill.toFixed(3)}
                </span>
                <span className="text-[9px] text-slate-400 font-mono block">
                  ({(tx.member_count || Math.round(fullBasketBill / Math.max(0.001, memberShareBill))) > 1 ? `1/${tx.member_count || Math.round(fullBasketBill / Math.max(0.001, memberShareBill))} of ` : ''}{currency} {fullBasketBill.toFixed(3)})
                </span>
              </>
            ) : (
              <span className={`font-black text-xs block ${isDepositTx ? (isDepositDeferred ? 'text-amber-400' : 'text-emerald-400') : (isCreditTx ? 'text-emerald-400' : 'text-rose-400')}`}>
                {isDepositTx ? `${currency} ${formattedAmt}` : isCreditTx ? `-${currency} ${formattedAmt}` : `+${currency} ${formattedAmt}`}
              </span>
            )}
            {runningBal !== null && (
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                Bal: {currency} {runningBal}
              </div>
            )}
          </div>
          <div className={`w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180 bg-slate-700 text-white' : ''}`}>
            <ChevronDown className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Expanded Accordion Body: "Transaction of Each and Everything" */}
      {expanded && (
        <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-800/80 bg-slate-950/70 text-left animate-in fade-in duration-200 space-y-3">
          {/* Card Deposit Detailed Breakdown */}
          {isDepositTx && (
            <div className="space-y-2 pt-2">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-sans">Deposit Status:</span>
                  <span className={`font-black text-xs uppercase tracking-wider ${isDepositDeferred ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {isDepositDeferred ? 'Credit Deposit' : 'Deposited'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-sans">Security Deposit Amount:</span>
                  <span className="font-bold text-white font-mono">{currency} {formattedAmt}</span>
                </div>
                <p className="text-[11px] text-slate-400 font-sans leading-relaxed pt-1 border-t border-slate-800/80">
                  {isDepositDeferred 
                    ? 'Card deposit deferred to customer payday. Excluded from grocery running credit balance.'
                    : 'Physical card security deposit collected and held in custodial trust. Excluded from grocery running credit balance.'}
                </p>
              </div>
            </div>
          )}

          {/* Purchase Detailed Breakdown */}
          {!isCreditTx && !isOpeningBalance && !isDepositTx && (
            <div className="space-y-2.5 pt-2">
              {/* Mess Room Split Notice */}
              {isMessSplit && (
                <div className="p-3 rounded-2xl bg-indigo-950/60 border border-indigo-800/60 flex items-center justify-between text-xs font-mono shadow-xs">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div>
                      <p className="text-indigo-200 font-sans font-bold text-xs">Shared Room Mess: {messRoomName || 'Group'}</p>
                      {shopperName && <p className="text-[10px] text-indigo-300 font-sans">Purchased by: <strong className="text-white">{shopperName}</strong></p>}
                      {tx.member_count && <p className="text-[10px] text-indigo-400 font-sans">{tx.member_count} Room Members</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 text-[10px] block">Basket: {currency} {fullBasketBill.toFixed(3)}</span>
                    <span className="text-amber-400 font-bold font-mono text-xs">Your Share: +{currency} {memberShareBill.toFixed(3)}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-800">
                <span className="flex items-center gap-1">
                  <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Itemized Receipt Breakdown</span>
                </span>
                <span className="text-emerald-400 font-mono text-[10px]">
                  NBR 10% VAT Included
                </span>
              </div>

              {loadingItems ? (
                <div className="py-4 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                  <span>Loading purchased items...</span>
                </div>
              ) : (
                <>
                  {/* Items List */}
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {currentItems.length > 0 ? (
                      currentItems.map((item, idx) => {
                        const qty = Number(item.quantity ?? item.qty ?? 1);
                        const unitPrice = Number(item.price ?? item.priceAtSale ?? item.sellingPrice ?? 0);
                        const lineTotal = Number(item.total ?? item.total_price ?? (qty * unitPrice));
                        const isWeighed = Boolean(item.is_weighed_item);

                        return (
                          <div 
                            key={item.id || idx}
                            className="p-2 rounded-xl bg-slate-900 border border-slate-800/80 flex items-start justify-between gap-2"
                          >
                            <div className="min-w-0 pr-2">
                              <p className="font-sans font-bold text-slate-100 text-xs">
                                {item.name || 'Store Item'}
                              </p>
                              {item.nameAr && (
                                <p className="text-[10px] text-slate-400 font-sans">{item.nameAr}</p>
                              )}
                              <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                                {isWeighed ? `${qty.toFixed(3)} kg` : `${qty} pcs`} @ {currency} {unitPrice.toFixed(3)}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-mono font-bold text-xs text-emerald-400">
                                {currency} {lineTotal.toFixed(3)}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs flex items-center justify-between">
                        <span>General Store Purchase</span>
                        <span className="font-bold text-emerald-400">{currency} {fullBasketBill.toFixed(3)}</span>
                      </div>
                    )}
                  </div>

                  {/* Financial Summary */}
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1 text-[11px] font-mono">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Subtotal (Excl. VAT)</span>
                      <span>{currency} {(fullBasketBill / 1.10).toFixed(3)}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>VAT (10%)</span>
                      <span>{currency} {(fullBasketBill - (fullBasketBill / 1.10)).toFixed(3)}</span>
                    </div>
                    <div className="flex items-center justify-between font-bold text-white pt-1 border-t border-slate-800">
                      <span>{isMessSplit ? 'Total Grocery Basket Bill' : 'Total Bill Amount'}</span>
                      <span className="text-emerald-400">{currency} {fullBasketBill.toFixed(3)}</span>
                    </div>
                  </div>

                  {/* Actions for Purchase */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onViewReceipt) {
                          onViewReceipt(invoiceDetails || {
                            invoiceNo,
                            total: Math.abs(amt),
                            subtotal: (Math.abs(amt) / 1.10).toFixed(3),
                            totalVat: (Math.abs(amt) - (Math.abs(amt) / 1.10)).toFixed(3),
                            items: currentItems.length > 0 ? currentItems : [{
                              name: 'Grocery Purchase',
                              quantity: 1,
                              price: Math.abs(amt),
                              total: Math.abs(amt)
                            }],
                            createdAt: tx.timestamp || tx.created_at,
                            paymentType: 'STORE CREDIT (KHATA)'
                          });
                        }
                      }}
                      className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>View Tax Receipt</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleShareWhatsApp}
                      className="py-2 px-3 bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-[11px] rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>WhatsApp Bill</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Payment Detailed Breakdown */}
          {isCreditTx && (
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-800">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Payment Settlement Details</span>
                </span>
                <span className="text-emerald-400 font-mono text-[10px]">
                  Verified Payment
                </span>
              </div>

              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Payment Channel</span>
                  <span className="font-bold text-emerald-400 font-sans">
                    {tx.channel || (tx.reference && tx.reference.startsWith('BP-') ? 'BenefitPay Fawri+' : 'Store Counter Settlement')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Reference Number</span>
                  <span className="font-bold text-white select-all">{tx.reference || tx.id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Settled Amount</span>
                  <span className="font-bold text-emerald-400 font-mono text-sm">
                    {currency} {formattedAmt}
                  </span>
                </div>
                {runningBal !== null && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                    <span className="text-slate-400">Updated Balance</span>
                    <span className="font-bold text-white">{currency} {runningBal}</span>
                  </div>
                )}
              </div>

              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Payment recorded and reconciled against store bank accounts.</span>
              </div>
            </div>
          )}

          {/* Opening Balance / Ledger Adjustment */}
          {isOpeningBalance && (
            <div className="space-y-2 pt-2 text-xs">
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 space-y-1">
                <p className="font-bold font-sans">Migrated Manual Ledger Balance</p>
                <p className="text-[11px] text-amber-200/90 leading-relaxed font-mono">
                  Initial balance imported from physical ledger notebook into Layali digital Khata system.
                </p>
                <p className="font-mono text-[10px] text-amber-400 pt-1">
                  Reference: #{tx.reference || tx.id}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
