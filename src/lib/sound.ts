// Shared Web Audio synth — no audio files, same as the v48 artifact.
// Mute persisted in localStorage (preference only — never a wallet).

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function mutedStored(): boolean {
  try {
    return localStorage.getItem("rg-muted") === "1";
  } catch {
    return false;
  }
}
export function setMutedStored(m: boolean) {
  try {
    localStorage.setItem("rg-muted", m ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  blip(muted: boolean) {
    if (muted) return;
    tone(660, 0.09, "sine", 0.12);
  },
  flip(muted: boolean) {
    if (muted) return;
    tone(520, 0.07, "triangle", 0.14);
    tone(780, 0.09, "triangle", 0.1, 0.06);
  },
  cheer(muted: boolean) {
    if (muted) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "triangle", 0.12, i * 0.07));
  },
  groan(muted: boolean) {
    if (muted) return;
    tone(220, 0.25, "sawtooth", 0.06);
    tone(165, 0.3, "sawtooth", 0.05, 0.1);
  },
  tick(muted: boolean) {
    if (muted) return;
    tone(1200, 0.03, "square", 0.05);
  },
  // Mines gem reveal — short bright pop, a touch higher than blip so
  // each gem feels like a small win on its own.
  pop(muted: boolean) {
    if (muted) return;
    tone(880, 0.06, "sine", 0.14);
    tone(1318, 0.08, "sine", 0.08, 0.03);
  },
  // Mines mine hit / Car Crash impact — low thud, never loud.
  boom(muted: boolean) {
    if (muted) return;
    tone(90, 0.35, "sine", 0.22);
    tone(55, 0.4, "sawtooth", 0.08, 0.02);
  },
  // All-games sound pass: card deal snap.
  deal(muted: boolean) {
    if (muted) return;
    tone(640, 0.05, "triangle", 0.12);
    tone(480, 0.06, "triangle", 0.1, 0.04);
  },
  // Slice / scratch — fast descending swish.
  slice(muted: boolean) {
    if (muted) return;
    tone(1500, 0.05, "sine", 0.1);
    tone(800, 0.07, "sine", 0.08, 0.03);
  },
  // Shoot / fire — short zap.
  shoot(muted: boolean) {
    if (muted) return;
    tone(880, 0.06, "square", 0.08);
    tone(320, 0.09, "square", 0.07, 0.04);
  },
  // Spin start — ascending arpeggio.
  spin(muted: boolean) {
    if (muted) return;
    [440, 554, 659].forEach((f, i) => tone(f, 0.05, "triangle", 0.1, i * 0.04));
  },
  // Break / drop — short sharp crack.
  crack(muted: boolean) {
    if (muted) return;
    tone(220, 0.06, "square", 0.1);
    tone(110, 0.1, "sine", 0.1, 0.02);
  },
};

// Verification hook (Round 31): a rig cannot hear audio, so every
// sfx call is logged here. window.__rgSfx holds the last 50 kinds in
// order ("pop", "boom", "cheer", ...). Harmless in production.
export const sfxCalls: string[] = [];
if (typeof window !== "undefined") {
  (window as unknown as { __rgSfx: string[] }).__rgSfx = sfxCalls;
}
function logCall(kind: string) {
  sfxCalls.push(kind);
  if (sfxCalls.length > 50) sfxCalls.shift();
}
// Wrap each sfx entry so its call is logged (muted calls log too —
// the mute check itself is the proof that nothing played).
for (const k of Object.keys(sfx) as (keyof typeof sfx)[]) {
  const fn = sfx[k];
  (sfx as Record<string, (muted: boolean) => void>)[k] = (muted: boolean) => {
    logCall(k);
    fn(muted);
  };
}
