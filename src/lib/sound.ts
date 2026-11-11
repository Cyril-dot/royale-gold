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
};
