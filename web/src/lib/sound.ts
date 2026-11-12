// Generated tones (no audio files). Browsers only allow sound after a click, so the
// scanner calls enableSound() from its "Click to start" overlay.
let ctx: AudioContext | null = null;

export function enableSound() {
  ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  void ctx.resume();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.35) {
  if (!ctx) return;
  const t = ctx.currentTime + start, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.05);
}

export const sounds = {
  ok: () => { tone(1318.5, 0, 0.9); tone(2637, 0, 0.5, 'sine', 0.12); },          // ding
  duplicate: () => { tone(880, 0, 0.18); tone(880, 0.22, 0.18); },                // double beep
  error: () => { tone(160, 0, 0.45, 'square', 0.18); },                           // buzz
  fastpass: () => ([[783.99, 0], [1046.5, 0.09], [1567.98, 0.18]] as const).forEach(([f, at]) => { // rising chime
    tone(f, at, 0.45, 'triangle', 0.3); tone(f * 2, at, 0.45, 'sine', 0.06);
  }),
};
export type SoundName = keyof typeof sounds;
export function play(s: SoundName | null) { if (s) try { sounds[s](); } catch { /* audio not ready */ } }
