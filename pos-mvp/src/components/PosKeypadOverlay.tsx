import React, { useCallback } from 'react';
import { Delete, X, CornerDownLeft, ChevronDown, Plus, Minus, Hash, UserCheck, Banknote } from 'lucide-react';
import { playBarcodeBeep } from '../utils/sound';

export interface PosKeypadOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onEnter: () => void;
  onQtySet?: () => void;
  onQtyAdjust?: (delta: number) => void;
  onKhataLookup?: () => void;
  onTenderCash?: () => void;
  currentBuffer?: string;
  activeMode?: 'PLU' | 'QTY' | 'KHATA' | 'TENDER' | 'SEARCH';
  className?: string;
}

/**
 * PosKeypadOverlay:
 * Compact, semi-transparent POS overlay keypad for Sunmi D2 Mini.
 * 
 * - Occupies ~34% of screen height (~270px) docked at the bottom.
 * - Flat alpha fill (rgba(15, 23, 42, 0.92)) with zero heavy CSS backdrop blur to ensure 60 FPS on RK30board.
 * - Direct buffer manipulation without popping the Android soft keyboard (LatinIME).
 * - Massive touch targets engineered for older retail cashiers under harsh store lights.
 */
export const PosKeypadOverlay: React.FC<PosKeypadOverlayProps> = ({
  isOpen,
  onClose,
  onDigit,
  onBackspace,
  onClear,
  onEnter,
  onQtySet,
  onQtyAdjust,
  onKhataLookup,
  onTenderCash,
  currentBuffer = '',
  activeMode = 'PLU',
  className = ''
}) => {
  // Ultra-lightweight WebAudio key click synthesizer (< 0.5ms execution)
  const triggerKeyAudio = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.03);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.035);
    } catch (_) {
      // Fallback to existing sound utility if AudioContext is restricted
      playBarcodeBeep();
    }
  }, []);

  const handlePress = useCallback(
    (action: () => void) => {
      triggerKeyAudio();
      action();
    },
    [triggerKeyAudio]
  );

  if (!isOpen) return null;

  return (
    <div
      data-testid="pos-keypad-overlay"
      className={`fixed bottom-0 left-0 right-0 z-40 bg-slate-950/94 border-t-2 border-slate-700/80 shadow-[0_-8px_24px_rgba(0,0,0,0.6)] px-3 py-2 animate-in slide-in-from-bottom-2 duration-150 select-none ${className}`}
      style={{ maxHeight: '280px', height: '275px' }}
    >
      <div className="max-w-7xl mx-auto h-full flex flex-col justify-between">
        {/* Top Header Bar: Status & Close */}
        <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-mono font-bold text-slate-300">
              BUFFER:{' '}
              <strong className="text-amber-300 font-mono text-sm">
                {currentBuffer || '(empty)'}
              </strong>
            </span>
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 uppercase">
              {activeMode}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handlePress(onClose)}
              className="px-2.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 font-bold active:scale-95 transition-all cursor-pointer"
              title="Hide Keypad [Esc]"
            >
              <ChevronDown size={14} />
              <span>Hide</span>
            </button>
          </div>
        </div>

        {/* Keypad Grid (5 columns for maximum retail throughput) */}
        <div className="grid grid-cols-5 gap-1.5 flex-1 pt-1.5 min-h-0">
          {/* Column 1 */}
          <button
            type="button"
            onClick={() => handlePress(() => onDigit('7'))}
            className="rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 active:bg-amber-500/20 active:border-amber-400 text-white font-mono font-black text-xl shadow-xs transition-all flex items-center justify-center cursor-pointer"
          >
            7
          </button>
          <button
            type="button"
            onClick={() => handlePress(() => onDigit('8'))}
            className="rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 active:bg-amber-500/20 active:border-amber-400 text-white font-mono font-black text-xl shadow-xs transition-all flex items-center justify-center cursor-pointer"
          >
            8
          </button>
          <button
            type="button"
            onClick={() => handlePress(() => onDigit('9'))}
            className="rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 active:bg-amber-500/20 active:border-amber-400 text-white font-mono font-black text-xl shadow-xs transition-all flex items-center justify-center cursor-pointer"
          >
            9
          </button>
          {onQtySet && (
            <button
              type="button"
              onClick={() => handlePress(onQtySet)}
              className="rounded-lg bg-blue-700 border border-blue-500 hover:bg-blue-600 active:scale-95 text-white font-bold text-xs shadow-xs transition-all flex flex-col items-center justify-center cursor-pointer"
              title="Set Quantity of last item"
            >
              <Hash size={16} strokeWidth={2.5} />
              <span className="text-[11px] font-black tracking-wider">SET QTY</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => handlePress(onBackspace)}
            className="rounded-lg bg-slate-800 border border-slate-600 hover:bg-slate-700 active:scale-95 text-slate-200 font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
            title="Backspace"
          >
            <Delete size={16} />
            <span className="font-mono text-sm">⌫</span>
          </button>

          {/* Column 2 */}
          <button
            type="button"
            onClick={() => handlePress(() => onDigit('4'))}
            className="rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 active:bg-amber-500/20 active:border-amber-400 text-white font-mono font-black text-xl shadow-xs transition-all flex items-center justify-center cursor-pointer"
          >
            4
          </button>
          <button
            type="button"
            onClick={() => handlePress(() => onDigit('5'))}
            className="rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 active:bg-amber-500/20 active:border-amber-400 text-white font-mono font-black text-xl shadow-xs transition-all flex items-center justify-center cursor-pointer"
          >
            5
          </button>
          <button
            type="button"
            onClick={() => handlePress(() => onDigit('6'))}
            className="rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 active:bg-amber-500/20 active:border-amber-400 text-white font-mono font-black text-xl shadow-xs transition-all flex items-center justify-center cursor-pointer"
          >
            6
          </button>
          {onQtyAdjust ? (
            <button
              type="button"
              onClick={() => handlePress(() => onQtyAdjust(1))}
              className="rounded-lg bg-emerald-800/80 border border-emerald-600 hover:bg-emerald-700 active:scale-95 text-emerald-200 font-black text-xs shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
              title="Add 1 to Quantity"
            >
              <Plus size={16} strokeWidth={3} />
              <span className="text-sm font-mono">+1</span>
            </button>
          ) : (
            <div />
          )}
          <button
            type="button"
            onClick={() => handlePress(onClear)}
            className="rounded-lg bg-red-950/80 border border-red-800 hover:bg-red-900 active:scale-95 text-red-300 font-black text-xs shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
            title="Clear Buffer"
          >
            <X size={16} strokeWidth={2.5} />
            <span className="font-mono text-sm">CLR</span>
          </button>

          {/* Column 3 */}
          <button
            type="button"
            onClick={() => handlePress(() => onDigit('1'))}
            className="rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 active:bg-amber-500/20 active:border-amber-400 text-white font-mono font-black text-xl shadow-xs transition-all flex items-center justify-center cursor-pointer"
          >
            1
          </button>
          <button
            type="button"
            onClick={() => handlePress(() => onDigit('2'))}
            className="rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 active:bg-amber-500/20 active:border-amber-400 text-white font-mono font-black text-xl shadow-xs transition-all flex items-center justify-center cursor-pointer"
          >
            2
          </button>
          <button
            type="button"
            onClick={() => handlePress(() => onDigit('3'))}
            className="rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 active:bg-amber-500/20 active:border-amber-400 text-white font-mono font-black text-xl shadow-xs transition-all flex items-center justify-center cursor-pointer"
          >
            3
          </button>
          {onQtyAdjust ? (
            <button
              type="button"
              onClick={() => handlePress(() => onQtyAdjust(-1))}
              className="rounded-lg bg-amber-900/80 border border-amber-600 hover:bg-amber-800 active:scale-95 text-amber-200 font-black text-xs shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
              title="Subtract 1 from Quantity"
            >
              <Minus size={16} strokeWidth={3} />
              <span className="text-sm font-mono">-1</span>
            </button>
          ) : (
            <div />
          )}
          {onKhataLookup ? (
            <button
              type="button"
              onClick={() => handlePress(onKhataLookup)}
              className="rounded-lg bg-purple-900/80 border border-purple-600 hover:bg-purple-800 active:scale-95 text-purple-200 font-black text-xs shadow-xs transition-all flex flex-col items-center justify-center cursor-pointer"
              title="Search Khata Customer by Phone"
            >
              <UserCheck size={15} />
              <span className="text-[10px] tracking-tight">KHATA</span>
            </button>
          ) : (
            <div />
          )}

          {/* Column 4 / Bottom Row */}
          <button
            type="button"
            onClick={() => handlePress(() => onDigit('0'))}
            className="rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 active:bg-amber-500/20 active:border-amber-400 text-white font-mono font-black text-xl shadow-xs transition-all flex items-center justify-center cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => handlePress(() => onDigit('00'))}
            className="rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 active:bg-amber-500/20 active:border-amber-400 text-white font-mono font-black text-base shadow-xs transition-all flex items-center justify-center cursor-pointer"
          >
            00
          </button>
          <button
            type="button"
            onClick={() => handlePress(() => onDigit('.'))}
            className="rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 active:bg-amber-500/20 active:border-amber-400 text-white font-mono font-black text-xl shadow-xs transition-all flex items-center justify-center cursor-pointer"
          >
            .
          </button>
          {onTenderCash && (
            <button
              type="button"
              onClick={() => handlePress(onTenderCash)}
              className="rounded-lg bg-teal-800/80 border border-teal-600 hover:bg-teal-700 active:scale-95 text-teal-200 font-black text-xs shadow-xs transition-all flex flex-col items-center justify-center cursor-pointer"
              title="Tender Cash"
            >
              <Banknote size={15} />
              <span className="text-[10px] tracking-tight">CASH</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => handlePress(onEnter)}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 active:scale-95 text-white font-mono font-black text-base shadow-md transition-all flex items-center justify-center gap-1 cursor-pointer"
            title="Confirm / Add to Cart [Enter]"
          >
            <CornerDownLeft size={16} strokeWidth={3} />
            <span className="font-sans text-xs font-black">ENTER</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PosKeypadOverlay;
