/**
 * Askar POS & Sunmi Audio Synthesizer
 * Provides instant, zero-latency audio and haptic feedback for hardware events (NFC card tap, barcode scan, errors).
 */

let sharedAudioCtx: AudioContext | null = null;
let lastChimeTime = 0;

/**
 * Returns a warm, active AudioContext.
 */
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;

  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch (err) {
    console.warn('AudioContext initialization error:', err);
    return null;
  }
}

// Ensure AudioContext is primed on user interaction (resolves autoplay restrictions)
if (typeof window !== 'undefined') {
  const primeAudioContext = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch (_) {}
  };
  window.addEventListener('click', primeAudioContext, { passive: true });
  window.addEventListener('touchstart', primeAudioContext, { passive: true });
  window.addEventListener('keydown', primeAudioContext, { passive: true });
}

/**
 * Play authentic, crisp dual-tone NFC card detection chime.
 * Tone 1: 1568 Hz (G6) - 70ms
 * Tone 2: 2093 Hz (C7) - 150ms
 * Accompanied by tactile haptic vibration (if hardware supports vibration).
 */
export function playNfcChime(force = false) {
  const now = Date.now();
  if (!force && now - lastChimeTime < 350) {
    // Prevent accidental double-chime within 350ms on a single card contact
    return;
  }
  lastChimeTime = now;

  // 1. Tactile haptic feedback (Sunmi mobile terminals & phones)
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([60, 40, 60]);
    } catch (_) {}
  }

  // 2. Synthesize audio chime via Web Audio API
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const t0 = ctx.currentTime;

    // Tone 1: 1568 Hz (G6)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1567.98, t0);
    gain1.gain.setValueAtTime(0.001, t0);
    gain1.gain.exponentialRampToValueAtTime(0.35, t0 + 0.015);
    gain1.gain.exponentialRampToValueAtTime(0.05, t0 + 0.08);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(t0);
    osc1.stop(t0 + 0.08);

    // Tone 2: 2093 Hz (C7) - Crystal clear payment card tap chime
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    const t1 = t0 + 0.07;
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2093.00, t1);
    gain2.gain.setValueAtTime(0.001, t1);
    gain2.gain.exponentialRampToValueAtTime(0.40, t1 + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.18);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t1);
    osc2.stop(t1 + 0.18);

    // Harmonic shimmer overtone: 3136 Hz (adds rich acoustic presence)
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'triangle';
    osc3.frequency.setValueAtTime(3135.96, t1);
    gain3.gain.setValueAtTime(0.001, t1);
    gain3.gain.exponentialRampToValueAtTime(0.08, t1 + 0.02);
    gain3.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.14);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(t1);
    osc3.stop(t1 + 0.14);
  } catch (err) {
    console.warn('Could not play NFC audio chime:', err);
  }
}

/**
 * Play negative / unrecognized card error sound (descending warning tones).
 */
export function playNfcErrorSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([120, 60, 120]);
      } catch (_) {}
    }

    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(340, t0);
    osc.frequency.linearRampToValueAtTime(220, t0 + 0.25);
    gain.gain.setValueAtTime(0.2, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.25);
  } catch (err) {
    console.warn('Could not play NFC error sound:', err);
  }
}

/**
 * Play standard 2200 Hz barcode scanner beep.
 */
export function playBarcodeBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2200, t0);
    gain.gain.setValueAtTime(0.25, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.07);
  } catch (_) {}
}

export const playNfcSound = playNfcChime;

// Expose globally for console testing & legacy bridges
if (typeof window !== 'undefined') {
  (window as any).playNfcChime = playNfcChime;
  (window as any).playNfcSound = playNfcSound;
  (window as any).playNfcErrorSound = playNfcErrorSound;
  (window as any).playBarcodeBeep = playBarcodeBeep;
}
