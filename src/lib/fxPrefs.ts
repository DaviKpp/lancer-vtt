// A player's choices for their shot animations, saved in this browser: color, size and number of
// projectiles for each kind of effect, and which animation each weapon uses (overriding the
// automatic pick).
import { FX_LABEL, type FxLook, type FxStyle } from "./fxFrames";

const LEGACY_LOOK_KEY = "lancer-vtt:fx-look"; // older single color / size for every effect
const STYLES_KEY = "lancer-vtt:fx-styles";
const WEAPONS_KEY = "lancer-vtt:fx-weapons";
const HEX = /^#[0-9a-f]{6}$/i;

export const SIZE_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Normal" },
  { value: 1.4, label: "Grande" },
  { value: 1.9, label: "Enorme" },
];

export function isFxStyle(v: unknown): v is FxStyle {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(FX_LABEL, v);
}

/** Accepts only a well-formed look (it also arrives from other players over the network). */
export function sanitizeLook(v: unknown): FxLook {
  const l = v as FxLook | null;
  if (!l || typeof l !== "object") return {};
  const out: FxLook = {};
  if (typeof l.color === "string" && HEX.test(l.color)) out.color = l.color;
  if (typeof l.scale === "number" && Number.isFinite(l.scale)) out.scale = Math.max(0.5, Math.min(2.5, l.scale));
  if (typeof l.count === "number" && Number.isFinite(l.count)) out.count = Math.max(1, Math.min(14, Math.round(l.count)));
  return out;
}

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked: the choice just won't be remembered
  }
}

function loadStyleMap(): Partial<Record<FxStyle, FxLook>> {
  const raw = read(STYLES_KEY);
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<FxStyle, FxLook>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (isFxStyle(k)) out[k] = sanitizeLook(v);
  return out;
}

/** This player's look for one kind of effect (falls back to the older single look, if any). */
export function loadFxLook(style: FxStyle): FxLook {
  return loadStyleMap()[style] ?? sanitizeLook(read(LEGACY_LOOK_KEY));
}

export function saveFxLook(style: FxStyle, look: FxLook) {
  const map = loadStyleMap();
  map[style] = sanitizeLook(look);
  write(STYLES_KEY, map);
}

/** Whether this kind of effect has its own settings (vs. the defaults). */
export const hasOwnFxLook = (style: FxStyle) => !!loadStyleMap()[style];

/** Key of one weapon of one character, e.g. "<combatant id>:<weapon name>". */
export const weaponFxKey = (ownerId: string, weaponName: string) => `${ownerId}:${weaponName}`;

function loadWeaponMap(): Record<string, FxStyle> {
  const raw = read(WEAPONS_KEY);
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, FxStyle> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (isFxStyle(v)) out[k] = v;
  return out;
}

export const weaponFxChoice = (key: string): FxStyle | undefined => loadWeaponMap()[key];

export function setWeaponFxChoice(key: string, style: FxStyle | undefined) {
  const map = loadWeaponMap();
  if (style) map[key] = style;
  else delete map[key];
  write(WEAPONS_KEY, map);
}
