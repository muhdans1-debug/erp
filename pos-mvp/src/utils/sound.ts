/**
 * Askar POS & Sunmi Audio Synthesizer
 * Provides instant, zero-latency audio and haptic feedback for hardware events:
 * - NFC card tap & payment verification
 * - Barcode scanner feedback
 * - Studio-quality, professional "Thank you" voice announcements for POS sales and Khata debt payments.
 */

import {
  THANK_YOU_SALE_B64,
  THANK_YOU_KHATA_B64,
  THANK_YOU_ASKAR_B64,
} from './audioAssets';

let sharedAudioCtx: AudioContext | null = null;
let lastChimeTime = 0;
let lastVoiceTime = 0;

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

  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
      try {
        window.speechSynthesis.getVoices();
      } catch (_) {}
    };
  }
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

/**
 * Play a high-end luxury retail transaction chime (e.g. Apple Pay / Clover POS style).
 * C5 (523 Hz) -> G5 (784 Hz) -> C6 (1046.5 Hz) harmonic chime with warm bell decay.
 */
export function playPaymentSuccessChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([40, 30, 80]);
      } catch (_) {}
    }

    const t0 = ctx.currentTime;

    const playTone = (freq: number, start: number, dur: number, gainPeak: number, type: OscillatorType = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur);
    };

    // Upbeat major chord arpeggio with shimmering decay
    playTone(523.25, t0, 0.24, 0.28);                       // C5
    playTone(783.99, t0 + 0.06, 0.28, 0.32);                // G5
    playTone(1046.50, t0 + 0.12, 0.40, 0.35);               // C6
    playTone(1318.51, t0 + 0.14, 0.32, 0.12, 'triangle');   // E6 overtone
  } catch (err) {
    console.warn('Error playing payment success chime:', err);
  }
}

// Pre-cached audio elements for zero-latency studio playback
let cachedSaleAudio: HTMLAudioElement | null = null;
let cachedKhataAudio: HTMLAudioElement | null = null;
let cachedAskarAudio: HTMLAudioElement | null = null;

function getCachedAudio(type: 'SALE' | 'KHATA_PAYMENT' | 'ASKAR'): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  try {
    if (type === 'SALE') {
      if (!cachedSaleAudio) cachedSaleAudio = new Audio(THANK_YOU_SALE_B64);
      return cachedSaleAudio;
    }
    if (type === 'KHATA_PAYMENT') {
      if (!cachedKhataAudio) cachedKhataAudio = new Audio(THANK_YOU_KHATA_B64);
      return cachedKhataAudio;
    }
    if (type === 'ASKAR') {
      if (!cachedAskarAudio) cachedAskarAudio = new Audio(THANK_YOU_ASKAR_B64);
      return cachedAskarAudio;
    }
  } catch (_) {}
  return null;
}

/**
 * Select the highest quality natural/human voice from available SpeechSynthesis voices.
 */
function getBestTtsVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  // 1. Natural / Neural cloud voices (Edge, Chrome Natural)
  const natural = voices.find(v =>
    v.name.toLowerCase().includes('natural') ||
    v.name.toLowerCase().includes('neural') ||
    v.name.toLowerCase().includes('online')
  );
  if (natural) return natural;

  // 2. High-quality human voices (Google, Samantha, Karen, Jenny, Aria, Zira)
  const premium = voices.find(v =>
    (v.name.toLowerCase().includes('google') ||
     v.name.toLowerCase().includes('samantha') ||
     v.name.toLowerCase().includes('karen') ||
     v.name.toLowerCase().includes('zira') ||
     v.name.toLowerCase().includes('jenny') ||
     v.name.toLowerCase().includes('aria')) &&
    (v.lang.startsWith('en'))
  );
  if (premium) return premium;

  // 3. Any standard en-US voice
  const enUs = voices.find(v => v.lang === 'en-US' || v.lang === 'en_US');
  if (enUs) return enUs;

  // 4. Any English voice
  const enAny = voices.find(v => v.lang.startsWith('en'));
  if (enAny) return enAny;

  return voices[0] || null;
}

/**
 * Speaks a phrase using Web Speech Synthesis with calm, polite retail cadence.
 */
function speakWithTts(phrase: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(phrase);
    const bestVoice = getBestTtsVoice();
    if (bestVoice) {
      utterance.voice = bestVoice;
      utterance.lang = bestVoice.lang;
    } else {
      utterance.lang = 'en-US';
    }
    utterance.rate = 0.94; // Calm, respectful retail tempo
    utterance.pitch = 1.04; // Friendly, warm inflection
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('SpeechSynthesis error:', err);
  }
}

/**
 * Professional "Thank you" voice announcement.
 * Plays whenever:
 * 1. A POS sale is completed (Cash, Card, BenefitPay, or Credit).
 * 2. A Khata customer debt payment / settlement is recorded.
 *
 * Architecture:
 * - Layer 1: Zero-latency luxury retail chime (Web Audio API)
 * - Layer 2: Broadcast-quality neural studio voice (embedded base64, 100% offline)
 * - Layer 3: Intelligent Web Speech Synthesis fallback (with optimized voice selection)
 */
export function playThankYouVoice(
  type: 'SALE' | 'KHATA_PAYMENT' | 'ASKAR' = 'SALE',
  customPhrase?: string
) {
  const now = Date.now();
  if (now - lastVoiceTime < 1000) {
    return; // Prevent duplicate voice triggers within 1 second
  }
  lastVoiceTime = now;

  // 1. Instant luxury transaction chime
  playPaymentSuccessChime();

  // 2. If a custom phrase is provided, speak it directly with tuned TTS
  if (customPhrase) {
    setTimeout(() => speakWithTts(customPhrase), 140);
    return;
  }

  // 3. Play studio neural voice
  try {
    const audio = getCachedAudio(type);
    if (audio) {
      audio.currentTime = 0;
      audio.volume = 1.0;
      // Stagger slightly (140ms) after chime start for a seamless acoustic finish
      setTimeout(() => {
        audio.play().catch((playErr) => {
          console.warn('Studio audio playback blocked, using TTS fallback:', playErr);
          const fallback = type === 'KHATA_PAYMENT'
            ? 'Thank you! Payment received.'
            : (type === 'ASKAR' ? 'Thank you for shopping at Askar. Have a great day!' : 'Thank you! Have a great day.');
          speakWithTts(fallback);
        });
      }, 140);
      return;
    }
  } catch (err) {
    console.warn('Error initiating studio audio:', err);
  }

  // 4. Fallback to Web Speech Synthesis if audio tag unavailable
  const fallback = type === 'KHATA_PAYMENT'
    ? 'Thank you! Payment received.'
    : (type === 'ASKAR' ? 'Thank you for shopping at Askar. Have a great day!' : 'Thank you! Have a great day.');
  setTimeout(() => speakWithTts(fallback), 140);
}

export const playNfcSound = playNfcChime;

// Expose globally for console testing, Sunmi bridge, and legacy callers
if (typeof window !== 'undefined') {
  (window as any).playNfcChime = playNfcChime;
  (window as any).playNfcSound = playNfcSound;
  (window as any).playNfcErrorSound = playNfcErrorSound;
  (window as any).playBarcodeBeep = playBarcodeBeep;
  (window as any).playPaymentSuccessChime = playPaymentSuccessChime;
  (window as any).playThankYouVoice = playThankYouVoice;
}
