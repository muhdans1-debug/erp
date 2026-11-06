// pos-mvp/src/components/CartTable.tsx
import { ShoppingCart, Tag, Minus, Plus, Trash2 } from 'lucide-react';
import { useCartStore, CartItem } from '../store/cartStore';

interface CartTableProps {
  onPriceOverrideClick?: (item: CartItem, index: number) => void;
  onWeightEditClick?: (item: CartItem) => void;
  onAdjustQty?: (index: number, delta: number) => void;
}

export default function CartTable({ onPriceOverrideClick, onWeightEditClick, onAdjustQty }: CartTableProps) {
  // Fine-grained selector: re-render ONLY when active cart items array mutates
  const items = useCartStore((state) => state.items);
  const storeAdjust = useCartStore((state) => state.adjustItemQtyByIndex);

  const handleAdjust = (index: number, delta: number) => {
    if (onAdjustQty) {
      onAdjustQty(index, delta);
    } else {
      storeAdjust(index, delta);
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-hide bg-white p-2.5 divide-y divide-slate-100 min-h-0 scroll-zone pr-[18px]">
        <div className="text-slate-400 text-center py-10 flex flex-col items-center justify-center">
          <ShoppingCart size={36} className="mb-2 opacity-25" />
          <p className="font-bold text-slate-600 text-sm">Receipt is empty</p>
          <p className="text-xs text-slate-400 mt-0.5">Ready to scan • Pull scanner trigger or tap Quick Items</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide bg-white p-2.5 divide-y divide-slate-100 min-h-0 scroll-zone pr-[18px]">
      {items.map((item, index) => {
        const qty = item.quantity ?? item.qty ?? 1;
        const isNegative = qty < 0;
        const unitPrice = item.sellingPrice ?? item.price ?? 0;
        const lineTotal = unitPrice * qty;

        return (
          <div
            key={item.id ? `${item.id}-${index}` : index}
            className="flex justify-between items-center py-2.5 px-1 hover:bg-slate-50/90 rounded-xl transition-colors border-b border-slate-100/70 gap-2 min-h-[72px]"
          >
            {/* Far Left: Product Name, Barcode Pill, Unit Base Price, Discount Tag */}
            <div className="min-w-0 flex-1 pr-1">
              <p className="font-bold text-slate-800 text-sm truncate leading-tight">
                {item.name} {(item.vatRate === 10 || (item.vatRate === undefined && item.taxRate !== 0)) ? '*' : ''}
              </p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {item.barcode && (
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-600 font-mono font-semibold">
                    {item.barcode}
                  </span>
                )}
                <p className="text-gray-400 text-xs font-mono">
                  {item.is_weighed_item
                    ? `${qty.toFixed(3)} kg @ BHD ${unitPrice.toFixed(3)}/kg`
                    : `Qty: ${qty}`}
                </p>
                {item.discountNote && (
                  <span className="inline-flex items-center gap-0.5 bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px] font-bold">
                    <Tag size={10} /> {item.discountNote}
                  </span>
                )}
              </div>
            </div>

            {/* Far Right Control Cluster: Tap-to-Edit Price + 60px Steppers */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Tap-to-Edit Price/Discount Touch Target */}
              <button
                type="button"
                onClick={() => onPriceOverrideClick?.(item, index)}
                className={`px-2.5 py-1.5 rounded-xl active:scale-95 transition-all border text-right cursor-pointer flex flex-col justify-center items-end min-h-[60px] ${
                  item.originalPrice && item.originalPrice > unitPrice
                    ? 'bg-amber-50/70 border-amber-300 hover:border-amber-500'
                    : 'bg-slate-50 hover:bg-amber-50 border-slate-200 hover:border-amber-400'
                }`}
                title="Tap to apply discount or price override"
              >
                {item.originalPrice && item.originalPrice > unitPrice && (
                  <span className="text-[10px] line-through text-slate-400 font-mono font-bold leading-none mb-0.5">
                    BD {(item.originalPrice * qty).toFixed(3)}
                  </span>
                )}
                <span className={`font-black font-mono text-sm tabular-nums leading-tight ${
                  isNegative ? 'text-red-600' : (item.originalPrice && item.originalPrice > unitPrice ? 'text-emerald-700' : 'text-slate-900')
                }`}>
                  BD {lineTotal.toFixed(3)}
                </span>
                <span className="text-[10px] text-amber-700 font-semibold tracking-tight mt-0.5 flex items-center gap-0.5">
                  <Tag size={9} /> {item.discountNote || 'tap to edit'}
                </span>
              </button>

              {/* Stepper Cluster: 60px Buttons & Quantity Readout */}
              <div className="flex items-center gap-1">
                {/* Decrement / Trash Button: 60x60 with Dynamic Color Cue */}
                <button
                  type="button"
                  onClick={() => handleAdjust(index, -1)}
                  className={`min-h-[60px] min-w-[60px] w-[60px] h-[60px] rounded-xl flex items-center justify-center active:scale-95 transition-all cursor-pointer font-black shadow-xs ${
                    (item.is_weighed_item ? qty <= 0.25 : qty === 1)
                      ? 'bg-rose-600 hover:bg-rose-700 text-white border-2 border-rose-700'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-900 border-2 border-slate-300'
                  }`}
                  title={(item.is_weighed_item ? qty <= 0.25 : qty === 1) ? `Remove "${item.name}" from cart` : `Decrease quantity`}
                >
                  {(item.is_weighed_item ? qty <= 0.25 : qty === 1) ? (
                    <Trash2 size={24} className="stroke-[2.5]" />
                  ) : (
                    <Minus size={26} className="stroke-[3]" />
                  )}
                </button>

                {/* Quantity Readout */}
                <div
                  onClick={() => {
                    if (item.is_weighed_item) {
                      onWeightEditClick?.(item);
                    }
                  }}
                  className={`min-w-[42px] h-[60px] flex flex-col items-center justify-center bg-slate-50 border border-slate-200 rounded-xl px-1 ${
                    item.is_weighed_item ? 'cursor-pointer hover:bg-emerald-50 hover:border-emerald-300' : ''
                  }`}
                  title={item.is_weighed_item ? 'Tap to edit weight' : 'Quantity'}
                >
                  <span className={`text-[8px] font-bold uppercase tracking-wider leading-none ${item.is_weighed_item ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {item.is_weighed_item ? 'KG' : 'QTY'}
                  </span>
                  <span className={`font-mono font-black text-slate-900 leading-tight ${item.is_weighed_item ? 'text-xs' : 'text-lg'}`}>
                    {item.is_weighed_item ? qty.toFixed(3) : qty}
                  </span>
                </div>

                {/* Increment Button: 60x60 Touch Target */}
                <button
                  type="button"
                  onClick={() => handleAdjust(index, 1)}
                  className="min-h-[60px] min-w-[60px] w-[60px] h-[60px] rounded-xl flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-900 border-2 border-slate-300 font-black active:scale-95 transition-all cursor-pointer shadow-xs"
                  title={`Increase quantity`}
                >
                  <Plus size={26} className="stroke-[3]" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
