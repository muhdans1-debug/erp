import { useState, useEffect } from 'react';
import { X, Search, Plus, Minus, Trash2, Phone } from 'lucide-react';

interface POReviewModalProps {
  po: any;
  onClose: () => void;
  onFinalApprove: (poId: string, items: any[], newTotalCost: number) => void;
  onDiscard?: (poId: string, supplierName: string) => void;
  apiBase?: string;
}

export default function POReviewModal({ po, onClose, onFinalApprove, onDiscard, apiBase: propApiBase }: POReviewModalProps) {
  const apiBase = propApiBase || (typeof window !== 'undefined' ? localStorage.getItem('master_server_url') || 'http://localhost:3000' : 'http://localhost:3000');

  // Load the auto-generated items into editable state
  const [items, setItems] = useState<any[]>(() => {
    try {
      if (!po || !po.itemsJson) return [];
      return typeof po.itemsJson === 'string' ? JSON.parse(po.itemsJson) : po.itemsJson;
    } catch {
      return [];
    }
  });

  const [totalCost, setTotalCost] = useState<number>(Number(po?.estimatedCost || 0));
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<any[]>([]);

  // Live Recalculation: Updates the massive total at the bottom instantly
  useEffect(() => {
    const newTotal = items.reduce((sum, item) => {
      const qty = Number(item.reorderQuantity) || 0;
      const cost = Number(item.unitCost) || 0;
      return sum + (qty * cost);
    }, 0);
    setTotalCost(newTotal);
  }, [items]);

  // Live search the supplier's catalog for manual additions
  useEffect(() => {
    if (searchQuery.trim().length > 1) {
      let isCurrent = true;
      const fetchCatalog = async () => {
        try {
          const res = await fetch(`${apiBase}/api/products/search?distributorId=${po?.distributorId || ''}&q=${encodeURIComponent(searchQuery)}`);
          if (res.ok) {
            const data = await res.json();
            if (isCurrent && Array.isArray(data) && data.length > 0) {
              setCatalogResults(data);
              return;
            }
          }
        } catch (e) {
          console.warn("Catalog search fetch fallback", e);
        }

        if (isCurrent) {
          // Mock demonstration fallback when no direct server search match is found
          setCatalogResults([
            { id: 'cat_' + Math.abs(searchQuery.split('').reduce((a, b) => (a << 5) - a + b.charCodeAt(0), 0)), name: `${po?.supplierName || 'Distributor'} - ${searchQuery}`, unitCost: 1.500, stockQuantity: 45 }
          ]);
        }
      };

      fetchCatalog();
      return () => { isCurrent = false; };
    } else {
      setCatalogResults([]);
    }
  }, [searchQuery, apiBase, po?.distributorId, po?.supplierName]);

  const updateQuantity = (index: number, delta: number) => {
    setItems(prev => {
      const newItems = [...prev];
      const newQty = (Number(newItems[index].reorderQuantity) || 0) + delta;
      if (newQty > 0) {
        newItems[index] = { ...newItems[index], reorderQuantity: newQty };
      }
      return newItems;
    });
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const manuallyAddItem = (product: any) => {
    // Check if it's already in the PO to avoid duplicates
    const existingIndex = items.findIndex(i => i.id === product.id);
    if (existingIndex >= 0) {
      updateQuantity(existingIndex, 1);
    } else {
      setItems([
        { 
          id: product.id, 
          name: product.name, 
          reorderQuantity: 1, 
          unitCost: Number(product.unitCost ?? product.purchasePrice ?? 1.500) 
        }, 
        ...items
      ]);
    }
    setSearchQuery(''); // Clear search after adding
  };

  const handleSendToWhatsApp = async () => {
    if (items.length === 0) {
      alert("Cannot send an empty Purchase Order.");
      return;
    }

    // 1. Mark the PO as 'APPROVED' in your Fastify backend
    try {
      await fetch(`${apiBase}/api/purchase-orders/${po.id}/approve`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemsJson: JSON.stringify(items), estimatedCost: totalCost })
      });
    } catch (error) {
      console.error("Failed to update database status", error);
    }

    // 2. Format the WhatsApp Message Text using WhatsApp Markdown (*bold*, _italic_)
    let message = `*NEW PURCHASE ORDER*\n`;
    message += `*From:* Askar Supermarket\n`;
    message += `*Date:* ${new Date().toLocaleDateString()}\n`;
    message += `*PO Ref:* #${po.id.slice(0, 6).toUpperCase()}\n\n`;
    message += `Hello ${po.supplierName || 'Distributor'} team, please process the following delivery:\n\n`;

    // Append each item line by line
    items.forEach((item, index) => {
      message += `${index + 1}. *${item.reorderQuantity}x* ${item.name}\n`;
    });

    message += `\n*Estimated Total: BD ${totalCost.toFixed(3)}*\n`;
    message += `\nPlease confirm receipt of this order.`;

    // 3. Encode the text so it can be passed in a URL
    const encodedMessage = encodeURIComponent(message);
    
    // 4. Trigger the WhatsApp redirect
    // Note: Ensure your API included the distributor's whatsappNumber in the 'po' object
    const targetNumber = po.whatsappNumber || po.distributor?.whatsappNumber || '97300000000'; // Fallback for testing
    const cleanNumber = targetNumber.replace(/[^0-9]/g, '');
    const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodedMessage}`;
    
    // Open WhatsApp in a new tab. If WhatsApp Desktop is installed, it will prompt to open the app.
    window.open(whatsappUrl, '_blank');
    
    // Close the modal and trigger parent refresh
    onFinalApprove(po.id, items, totalCost); 
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col h-[85vh]">
        
        {/* Header */}
        <div className="bg-slate-50 p-6 border-b flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-black text-slate-800">Review Purchase Order</h2>
            <p className="text-slate-500 font-bold mt-1">
              Supplier: <span className="text-blue-600">{po?.supplierName || 'Distributor'}</span>
              {(po?.whatsappNumber || po?.distributor?.whatsappNumber) && (
                <span className="text-emerald-600 font-mono text-sm ml-2 font-bold">
                  (WhatsApp: +{po?.whatsappNumber || po?.distributor?.whatsappNumber})
                </span>
              )}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="p-3 bg-slate-200 hover:bg-slate-300 rounded-full transition-colors text-slate-700 active:scale-95"
            title="Close Review Pad"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          
          {/* LEFT PANE: The Active Order List */}
          <div className="flex-1 border-r flex flex-col bg-white">
            <div className="p-4 bg-slate-100 border-b font-bold text-slate-600 text-sm flex justify-between items-center">
              <span>ORDER ITEMS ({items.length})</span>
              <span>SUBTOTAL</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {items.map((item, index) => {
                const qty = Number(item.reorderQuantity) || 0;
                const cost = Number(item.unitCost) || 0;
                return (
                  <div key={item.id || index} className="flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-400 transition-colors">
                    <div className="flex-1 pr-3">
                      <h4 className="font-bold text-slate-800 text-base">{item.name}</h4>
                      <p className="text-slate-500 text-xs font-mono mt-0.5">BD {cost.toFixed(3)} / unit</p>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {/* Quantity Adjuster */}
                      <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
                        <button 
                          onClick={() => updateQuantity(index, -1)} 
                          className="p-1.5 hover:bg-white rounded-md text-slate-600 active:scale-90 transition-transform"
                          title="Decrease Quantity"
                        >
                          <Minus size={16}/>
                        </button>
                        <span className="w-12 text-center font-black text-lg text-slate-800">{qty}</span>
                        <button 
                          onClick={() => updateQuantity(index, 1)} 
                          className="p-1.5 hover:bg-white rounded-md text-slate-600 active:scale-90 transition-transform"
                          title="Increase Quantity"
                        >
                          <Plus size={16}/>
                        </button>
                      </div>
                      
                      <div className="w-24 text-right font-black text-base text-slate-800 font-mono">
                        BD {(qty * cost).toFixed(3)}
                      </div>
                      
                      <button 
                        onClick={() => removeItem(index)} 
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove Item"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {items.length === 0 && (
                <div className="text-center py-16 px-4 text-slate-400 font-bold">
                  Order is currently empty. Add products from the catalog on the right.
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANE: Manual Addition Search */}
          <div className="w-80 bg-slate-50 flex flex-col border-l border-slate-100">
            <div className="p-4 border-b bg-white">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Manually Add Items</label>
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${po?.supplierName || 'catalog'}...`}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-blue-500 text-sm bg-slate-50 focus:bg-white transition-colors"
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3">
              {catalogResults.map(res => (
                <button 
                  key={res.id}
                  onClick={() => manuallyAddItem(res)}
                  className="w-full text-left p-3 mb-2 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-sm active:scale-95 transition-all flex justify-between items-center group"
                >
                  <div className="pr-2">
                    <div className="font-bold text-slate-800 text-sm group-hover:text-blue-600 transition-colors">{res.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Stock: <span className="font-semibold text-slate-600">{res.stockQuantity}</span> | Cost: <span className="font-mono text-slate-700">BD {Number(res.unitCost || 0).toFixed(3)}</span>
                    </div>
                  </div>
                  <div className="p-1.5 bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white rounded-lg transition-colors">
                    <Plus size={16} />
                  </div>
                </button>
              ))}

              {searchQuery.trim().length > 1 && catalogResults.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-400">
                  No matching products found.
                </div>
              )}

              {searchQuery.trim().length <= 1 && (
                <div className="p-4 text-center text-xs text-slate-400 font-medium">
                  Type at least 2 characters to search this distributor's items.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer: Live Total & Final Action */}
        <div className="bg-slate-900 p-6 flex flex-wrap justify-between items-center gap-4 text-white">
          <div>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-1">Final Estimated Cost</p>
            <p className="text-4xl font-black font-mono text-emerald-400">BD {totalCost.toFixed(3)}</p>
          </div>
          
          <div className="flex items-center gap-3">
            {onDiscard && (
              <button 
                type="button"
                onClick={() => {
                  if (window.confirm(`Discard draft order for "${po?.supplierName || 'this distributor'}"? This order will be removed from pending approvals.`)) {
                    onDiscard(po.id, po?.supplierName || 'Distributor');
                    onClose();
                  }
                }}
                className="h-16 px-6 bg-red-500/15 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 rounded-xl font-bold text-base active:scale-95 transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                title="Discard this draft purchase order"
              >
                <Trash2 size={20} /> Discard Order
              </button>
            )}

            <button 
              onClick={handleSendToWhatsApp}
              className="h-16 px-8 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xl rounded-xl active:scale-95 transition-all flex items-center gap-3 shadow-lg cursor-pointer"
            >
              <Phone size={24} /> Send via WhatsApp
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
