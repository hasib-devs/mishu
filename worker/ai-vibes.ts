/** Mood palette shared by hourly letters and chithi-links quotes. */
export const VIBES = [
  "friendly",
  "sweet",
  "cute",
  "lovely",
  "motivational",
  "মিষ্টি",
  "আদুরে",
  "flirty",
  "রোমান্টিক",
  "নীরব কষ্টের",
  "soft and lovely",
  "morning vibe",
  "midnight vibe",
  "inspirational",
  "career",
] as const;

export type Vibe = (typeof VIBES)[number];

export function pickVibe(): Vibe {
  return VIBES[Math.floor(Math.random() * VIBES.length)] ?? VIBES[0];
}
