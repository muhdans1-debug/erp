import React from 'react';
import { Delete, X, CornerDownLeft, Hash, Keyboard } from 'lucide-react';

export interface LiveTypedBufferBarProps {
  typedValue: string;
  onClear: () => void;
  onBackspace: () => void;
  onConfirm: () => void;
  onToggleKeypad?: () => void;
  isKeypadOpen?: boolean;
  mode?: 'PLU' | 'QTY' | 'KHATA' | 'TENDER' | 'SEARCH';
  matchedPreview?: string | null;
  onSetQty?: () => void;
  className?: string;
}

/**
 * LiveTypedBufferBar:
 * Anchors the cashier's active keystrokes in the upper/mid screen zone.
 * Prevents "blind typing" by providing an ultra-high-contrast real-time readout
 * of PLU short codes, item quantities, or customer lookups.
 * Designed specifically for Sunmi POS terminals and older cashiers.
 */
export const LiveTypedBufferBar: React.FC<LiveTypedBufferBarProps> = ({
  typedValue,
  onClear,
  onBackspace,
  onConfirm,
  onToggleKeypad,
  isKeypadOpen = false,
  mode = 'PLU',
  matchedPreview = null,
  onSetQty,
  className = ''
}) => {
  const hasContent = typedValue.trim().length > 0;

  // Determine mode color and badge
  const getBadge = () => {
    switch (mode) {
      case 'QTY':
        return { label: 'QTY MULTIPLIER', bg: 'bg-blue-500 text-white border-blue-400' };
      case 'KHATA':
        return { label: 'KHATA PHONE', bg: 'bg-purple-600 text-white border-purple-400' };
      case 'TENDER':
        return { label: 'CASH TENDER', bg: 'bg-emerald-600 text-white border-emerald-400' };
      case 'SEARCH':
        return { label: 'SEARCH', bg: 'bg-cyan-600 text-white border-cyan-400' };
      case 'PLU':
      default:
        return { label: 'PLU SHORT CODE', bg: 'bg-amber-500 text-slate-950 border-amber-300' };
    }
  };

  const badge = getBadge();

  return (
    <div
      className={`shrink-0 w-full transition-all duration-150 select-none ${
        hasContent
          ? 'bg-slate-950 border-y-2 border-amber-500/80 shadow-md py-1.5 px-3'
          : 'bg-slate-900/90 border-b border-slate-700/80 py-1.5 px-3'
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2 min-h-[38px]">
        {/* Left: Mode Badge & Live Digits */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {hasContent ? (
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider border shadow-xs shrink-0 ${badge.bg}`}
            >
              {badge.label}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-mono text-slate-300">COUNTER READY</span>
            </span>
          )}

          {/* Large Live Display */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {hasContent ? (
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="font-mono text-2xl font-black text-amber-300 tracking-wider drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] truncate">
                  {typedValue}
                </span>
                <span className="w-1.5 h-5 bg-amber-400 animate-pulse inline-block self-center rounded-xs" />
                {matchedPreview && (
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-700/60 px-2 py-0.5 rounded truncate max-w-[200px]">
                    {matchedPreview}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-xs text-slate-500 font-mono italic truncate">
                Type PLU (e.g. 102), Qty + [QTY], or pull scanner trigger
              </span>
            )}
          </div>
        </div>

        {/* Right: Quick Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {hasContent && (
            <>
              {onSetQty && (
                <button
                  type="button"
                  onClick={onSetQty}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-black shadow-xs active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                  title="Apply as Quantity to last cart item"
                >
                  <Hash size={13} strokeWidth={3} />
                  <span>Set QTY</span>
                </button>
              )}

              <button
                type="button"
                onClick={onConfirm}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-black shadow-xs active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                title="Confirm / Add Item to Cart [Enter]"
              >
                <CornerDownLeft size={13} strokeWidth={3} />
                <span>Enter</span>
              </button>

              <button
                type="button"
                onClick={onBackspace}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs font-bold active:scale-95 transition-all cursor-pointer"
                title="Backspace"
              >
                <Delete size={14} />
              </button>

              <button
                type="button"
                onClick={onClear}
                className="px-2 py-1 bg-red-950 hover:bg-red-900 text-red-300 border border-red-800/60 rounded text-xs font-bold active:scale-95 transition-all cursor-pointer"
                title="Clear input"
              >
                <X size={14} />
              </button>
            </>
          )}

          {/* Keypad Toggle Button */}
          {onToggleKeypad && (
            <button
              type="button"
              onClick={onToggleKeypad}
              className={`px-2.5 py-1 rounded text-xs font-bold border transition-all flex items-center gap-1 cursor-pointer active:scale-95 ${
                isKeypadOpen
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-xs'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
              title={isKeypadOpen ? 'Hide on-screen keypad' : 'Open on-screen keypad'}
            >
              <Keyboard size={13} />
              <span>{isKeypadOpen ? 'Keypad ▲' : 'Keypad ▼'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveTypedBufferBar;
