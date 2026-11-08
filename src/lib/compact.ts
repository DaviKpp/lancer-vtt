// Compact form of a combatant in room metadata. Owlbear keeps at most 16 kB for everything in a room
// (shared with other extensions), so the stored form uses short keys and leaves out empty values:
// about half the size of the plain object. Old (plain) entries are still read.
import type { CombatantState } from "./types";

/** Marks the compact form. */
const VERSION = 2;

/** Plain key -> stored key. Keys not listed are stored as they are (most are already short). */
const SHORT: Partial<Record<keyof CombatantState, string>> = {
  kind: "k",
  owner: "o",
  ownerName: "on",
  name: "n",
  sub: "sb",
  tokenId: "t",
  hp: "hp",
  maxHp: "mh",
  os: "os",
  heat: "h",
  heatcap: "hc",
  structure: "s",
  maxStructure: "ms",
  stress: "x",
  maxStress: "mx",
  burn: "b",
  armor: "a",
  evasion: "e",
  edef: "ed",
  core: "cr",
  repairs: "r",
  maxRepairs: "mr",
  activations: "av",
  used: "u",
  tpl: "tp",
};
const LONG: Record<string, keyof CombatantState> = Object.fromEntries(Object.entries(SHORT).map(([k, v]) => [v, k as keyof CombatantState]));

const KIND = { mech: "m", npc: "n", pilot: "p" } as const;
const KIND_BACK: Record<string, CombatantState["kind"]> = { m: "mech", n: "npc", p: "pilot" };

/** Numbers every combatant has (missing in the compact form = 0). */
const NUMBERS: (keyof CombatantState)[] = [
  "hp",
  "maxHp",
  "os",
  "heat",
  "heatcap",
  "structure",
  "maxStructure",
  "stress",
  "maxStress",
  "burn",
  "armor",
  "evasion",
  "edef",
  "repairs",
  "maxRepairs",
  "activations",
  "used",
];

/** Values where "missing" and "zero" mean different things (kept even when 0). */
const KEEP_ZERO = new Set<string>(["php"]);

function isEmpty(key: string, v: unknown): boolean {
  if (v === undefined || v === null || v === "" || v === false) return true;
  if (v === 0) return !KEEP_ZERO.has(key);
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

/** Stored form of a combatant (its id is the metadata key, so it isn't repeated). */
export function encodeCombatant(c: CombatantState): Record<string, unknown> {
  const out: Record<string, unknown> = { v: VERSION };
  for (const [key, value] of Object.entries(c)) {
    if (key === "id" || isEmpty(key, value)) continue;
    const short = SHORT[key as keyof CombatantState] ?? key;
    if (key === "kind") out[short] = KIND[value as CombatantState["kind"]];
    else if (key === "core") out[short] = 1;
    else out[short] = value;
  }
  return out;
}

/** A combatant read from room metadata (compact or plain). */
export function decodeCombatant(id: string, raw: unknown): CombatantState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== VERSION) {
    // plain (older) entry
    const c = r as unknown as CombatantState;
    return c.id ? c : { ...c, id };
  }
  const c: Record<string, unknown> = { id };
  for (const [key, value] of Object.entries(r)) {
    if (key === "v") continue;
    const long = LONG[key] ?? key;
    if (long === "kind") c.kind = KIND_BACK[value as string] ?? "mech";
    else if (long === "core") c.core = !!value;
    else c[long] = value;
  }
  for (const k of NUMBERS) if (typeof c[k] !== "number") c[k] = 0;
  if (c.core === undefined) c.core = false;
  if (typeof c.owner !== "string") c.owner = "";
  if (typeof c.ownerName !== "string") c.ownerName = "";
  if (typeof c.name !== "string") c.name = "?";
  if (typeof c.sub !== "string") c.sub = "";
  if (!c.kind) c.kind = "mech";
  return c as unknown as CombatantState;
}
