/**
 * All audio is synthesized with WebAudio — no assets, nothing to load.
 * The context is created lazily on the first play call, which always follows a
 * user gesture, so autoplay policy never blocks us.
 */

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;

try {
  muted = localStorage.getItem('pd-muted') === '1';
} catch {
  // Storage unavailable; default to sound on.
}

function ac(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

interface BurstOpts {
  /** Filter type and frequency shaping the character of the noise. */
  type: BiquadFilterType;
  freq: number;
  q?: number;
  /** Attack and decay in seconds. */
  attack: number;
  decay: number;
  gain: number;
  /** Optional frequency sweep target. */
  freqTo?: number;
}

function burst(o: BurstOpts): void {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  src.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = o.type;
  filter.frequency.setValueAtTime(o.freq, c.currentTime);
  if (o.freqTo) filter.frequency.exponentialRampToValueAtTime(o.freqTo, c.currentTime + o.attack + o.decay);
  filter.Q.value = o.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(o.gain, c.currentTime + o.attack);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + o.attack + o.decay);
  src.connect(filter).connect(g).connect(c.destination);
  src.start();
  src.stop(c.currentTime + o.attack + o.decay + 0.05);
}

function thump(freq: number, decay: number, gain: number): void {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.4), c.currentTime + decay);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + decay);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + decay + 0.05);
}

export const sound = {
  get muted(): boolean {
    return muted;
  },

  /**
   * Build the audio context and noise buffer ahead of time. Doing this lazily
   * on the first sound costs ~150ms on the calling frame, which is enough to
   * stutter the pitching meter — so callers warm it on an earlier gesture.
   */
  warm(): void {
    const c = ac();
    if (c) noise(c);
  },

  setMuted(v: boolean): void {
    muted = v;
    try {
      localStorage.setItem('pd-muted', v ? '1' : '0');
    } catch {
      // Preference just won't persist.
    }
  },

  /** Mitt pop. A 98 should hurt your ears a little more than an 82. */
  pop(velo: number): void {
    const heat = Math.max(0, Math.min(1, (velo - 72) / 28));
    burst({ type: 'bandpass', freq: 260 + heat * 220, q: 0.8, attack: 0.004, decay: 0.07 + heat * 0.03, gain: 0.25 + heat * 0.3 });
    thump(110 + heat * 40, 0.07, 0.18 + heat * 0.18);
  },

  /** Bat contact. Quality 0..1 — a barreled ball cracks, a jam shot clunks. */
  crack(quality: number): void {
    const q = Math.max(0, Math.min(1, quality));
    burst({ type: 'highpass', freq: 900 + q * 1600, attack: 0.002, decay: 0.05 + q * 0.06, gain: 0.3 + q * 0.35 });
    thump(180 + q * 160, 0.05, 0.22);
  },

  /** Bat cutting through air on a miss. */
  whiff(): void {
    burst({ type: 'bandpass', freq: 1400, q: 2.5, attack: 0.02, decay: 0.12, gain: 0.12, freqTo: 500 });
  },

  /** Crowd rises — strikeouts, escapes, big moments. Intensity 0..1. */
  cheer(intensity: number): void {
    const n = Math.max(0.2, Math.min(1, intensity));
    burst({ type: 'lowpass', freq: 900 + n * 900, attack: 0.12, decay: 0.9 + n * 0.9, gain: 0.1 + n * 0.16 });
    burst({ type: 'bandpass', freq: 2400, q: 0.5, attack: 0.18, decay: 0.8 + n * 0.7, gain: 0.05 + n * 0.08 });
  },

  /** Crowd deflates — the sound of a ball leaving your yard. */
  groan(): void {
    burst({ type: 'lowpass', freq: 500, attack: 0.15, decay: 1.2, gain: 0.16, freqTo: 220 });
  },

  /** Meter tick. */
  click(): void {
    burst({ type: 'highpass', freq: 2200, attack: 0.001, decay: 0.03, gain: 0.08 });
  },
};
