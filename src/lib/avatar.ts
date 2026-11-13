// Account avatar — exactly 100 emoji icons, one per user.
// Chuks: "list 100 emoji icons and randomly show it" — the pick is
// RANDOM across users but STABLE for the same user: we hash the user's
// id to an index 0–99, so the avatar never changes (and never flickers
// to a different emoji) on reload. A profile avatar that changes every
// visit would look broken. Shared helper so the header chip can reuse
// it later if Chuks asks — the account page is the only caller for now.
// All entries are single code points (no variation selectors, no ZWJ
// sequences) so each renders as one glyph on every phone.

export const AVATAR_EMOJIS = [
  // Animals (20)
  "🦁", "🐯", "🦊", "🐺", "🐻", "🦄", "🐼", "🐸", "🐵", "🦍",
  "🐶", "🐱", "🦅", "🦉", "🦈", "🐬", "🐳", "🦋", "🐝", "🐞",
  // Faces (15)
  "😎", "🤩", "😂", "😍", "🥳", "😴", "🤖", "👽", "👻", "💀",
  "🤠", "🥸", "😜", "🤪", "🫡",
  // Food (10)
  "🍕", "🍔", "🍩", "🍦", "🍓", "🥑", "🍇", "🍉", "🍍", "🧁",
  // Objects & symbols (15)
  "👑", "💎", "🔥", "⚡", "🌈", "⭐", "🌙", "🌞", "💰", "🎁",
  "🎈", "🎨", "🎵", "🎸", "🚀",
  // Sport & games (15)
  "⚽", "🏀", "🎲", "🎰", "🃏", "🎯", "🏆", "🥇", "🥊", "🏁",
  "🎳", "🎮", "🧩", "🎪", "🎭",
  // Nature & space (10)
  "🌋", "🌊", "⛄", "🌵", "🌴", "🍀", "🌹", "🌻", "🪐", "🌟",
  // Fun & fantasy (15)
  "🦸", "🧙", "🧛", "🧜", "🧚", "🧞", "🎅", "🤴", "👸", "🦹",
  "🛸", "🔮", "🧲", "💡", "🎉",
] as const;

// FNV-1a 32-bit hash — small, deterministic, well spread over short ids.
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The avatar emoji for a user: hash(user id) → index 0–99. Same user, same emoji, every visit. */
export function avatarFor(seed: string): string {
  if (!seed) return AVATAR_EMOJIS[0];
  return AVATAR_EMOJIS[hashSeed(seed) % AVATAR_EMOJIS.length];
}
