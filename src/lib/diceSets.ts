// Dice sets players can pick for their own dice (the d20 and the damage dice).
// Accuracy / difficulty / structure-check dice keep their fixed colors so they stay readable.

export type DiceMaterial = "marmore" | "pedra" | "nebulosa" | "gema" | "metal";

export interface DiceSet {
  material: DiceMaterial;
  body: string; // main color (#rrggbb)
  accent: string; // swirls / speckles / inner glow
  ink: string; // numbers
}

export const MATERIAL_LABEL: Record<DiceMaterial, string> = {
  marmore: "Mármore",
  pedra: "Pedra com brilhos",
  nebulosa: "Nebulosa",
  gema: "Gema translúcida",
  metal: "Metal escovado",
};

export const PRESETS: { id: string; name: string; set: DiceSet }[] = [
  { id: "lancer", name: "LANCER", set: { material: "marmore", body: "#8e1414", accent: "#ff7828", ink: "#ffffff" } },
  { id: "galaxia", name: "Galáxia", set: { material: "pedra", body: "#2a2d36", accent: "#5a6276", ink: "#ffffff" } },
  { id: "nebulosa", name: "Nebulosa", set: { material: "nebulosa", body: "#1a1030", accent: "#a04ad8", ink: "#ffd3f0" } },
  { id: "esmeralda", name: "Esmeralda", set: { material: "gema", body: "#1d8f63", accent: "#8affd0", ink: "#ffffff" } },
  { id: "safira", name: "Safira", set: { material: "gema", body: "#1d4fa8", accent: "#8ac4ff", ink: "#ffffff" } },
  { id: "ametista", name: "Ametista", set: { material: "gema", body: "#6a2ca0", accent: "#e0a8ff", ink: "#ffffff" } },
  { id: "ferro", name: "Ferro", set: { material: "metal", body: "#8a909c", accent: "#c8ccd4", ink: "#15171c" } },
  { id: "latao", name: "Latão", set: { material: "metal", body: "#8a6418", accent: "#d8b45a", ink: "#2a1d05" } },
  { id: "marfim", name: "Marfim", set: { material: "marmore", body: "#e6dfcc", accent: "#b3a684", ink: "#1a1c24" } },
  { id: "noite", name: "Azul noturno", set: { material: "pedra", body: "#14213d", accent: "#3a5a9c", ink: "#ffd166" } },
];

export const DEFAULT_SET = PRESETS[0].set;

const HEX = /^#[0-9a-f]{6}$/i;

/** Accepts only well-formed sets (they also arrive from other players over the network). */
export function sanitizeSet(v: unknown): DiceSet | undefined {
  const s = v as Partial<DiceSet> | null;
  if (!s || typeof s !== "object") return undefined;
  if (!s.material || !(s.material in MATERIAL_LABEL)) return undefined;
  if (![s.body, s.accent, s.ink].every((c) => typeof c === "string" && HEX.test(c))) return undefined;
  return { material: s.material, body: s.body!, accent: s.accent!, ink: s.ink! };
}

/** A lighter / darker version of a color, for the accent of custom sets. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const c = (n >> shift) & 255;
    const v = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
    return Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

export function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

// ------------------------------------------------------------------ saved choice (per browser)

const KEY = "lancer-vtt:dice-set";

export function loadDiceSet(): DiceSet {
  try {
    return sanitizeSet(JSON.parse(localStorage.getItem(KEY) ?? "null")) ?? DEFAULT_SET;
  } catch {
    return DEFAULT_SET;
  }
}

export function saveDiceSet(set: DiceSet) {
  try {
    localStorage.setItem(KEY, JSON.stringify(set));
  } catch {
    // storage blocked: the choice just won't be remembered
  }
}

/** CSS background that roughly previews a set (for the picker). */
export function swatchCss(s: DiceSet): string {
  switch (s.material) {
    case "metal":
      return `linear-gradient(135deg, ${shade(s.body, 0.35)}, ${s.body} 45%, ${shade(s.body, -0.35)})`;
    case "gema":
      return `radial-gradient(circle at 32% 28%, ${s.accent}, ${s.body} 55%, ${shade(s.body, -0.45)})`;
    case "nebulosa":
      return `radial-gradient(circle at 30% 30%, ${s.accent}, transparent 55%), radial-gradient(circle at 70% 70%, ${shade(s.accent, 0.3)}, ${s.body} 60%)`;
    case "pedra":
      return `radial-gradient(circle at 25% 30%, #fff 1px, transparent 2px), radial-gradient(circle at 65% 60%, #fff 1px, transparent 2px), radial-gradient(circle at 40% 75%, #fff 1px, transparent 2px), radial-gradient(circle at 35% 35%, ${s.accent}, ${s.body} 65%)`;
    default:
      return `radial-gradient(circle at 35% 30%, ${s.accent}, ${s.body} 60%, ${shade(s.body, -0.4)})`;
  }
}
