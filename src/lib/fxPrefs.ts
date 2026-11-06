// A player's choices for their shot animations, saved in this browser: a color and size for all
// their shots, and which animation each weapon uses (overriding the automatic pick).
import { FX_LABEL, type FxLook, type FxStyle } from "./fxFrames";

const LOOK_KEY = "lancer-vtt:fx-look";
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

export const loadFxLook = (): FxLook => sanitizeLook(read(LOOK_KEY));
export const saveFxLook = (look: FxLook) => write(LOOK_KEY, sanitizeLook(look));

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
