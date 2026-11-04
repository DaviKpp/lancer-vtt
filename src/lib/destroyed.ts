import type { CombatantState, Sheet } from "./types";
import { tr } from "./i18n";

/** Copy of the sheet with the weapons / systems / features destroyed in play marked as such. */
export function applyDestroyed(sheet: Sheet, c: CombatantState | undefined): Sheet {
  const dx = new Set(c?.dx ?? []);
  if (!dx.size) return sheet;
  if (sheet.kind === "mech") {
    return {
      ...sheet,
      mounts: sheet.mounts.map((m) => ({
        ...m,
        weapons: m.weapons.map((w) => (dx.has(w.uid) ? { ...w, destroyed: true } : w)),
      })),
      systems: sheet.systems.map((s) => (dx.has(s.uid) ? { ...s, destroyed: true } : s)),
    };
  }
  return { ...sheet, features: sheet.features.map((f) => (dx.has(f.uid) ? { ...f, destroyed: true } : f)) };
}

export interface DestroyTarget {
  key: string;
  label: string;
  uids: string[];
}

/** Mounts (all weapons on it) — or single weapons for NPCs — that can still be destroyed. */
export function mountTargets(sheet: Sheet): DestroyTarget[] {
  if (sheet.kind === "mech") {
    return sheet.mounts
      .map((m, i) => ({
        key: `m${i}`,
        label: `Montagem ${tr(m.name)}: ${m.weapons.map((w) => w.name).join(" + ")}`,
        uids: m.weapons.filter((w) => !w.destroyed).map((w) => w.uid),
      }))
      .filter((t) => t.uids.length);
  }
  return sheet.features
    .filter((f) => f.type === "weapon" && !f.destroyed)
    .map((f) => ({ key: f.uid, label: f.name, uids: [f.uid] }));
}

/** Systems (NPC: system / tech features) that can still be destroyed. */
export function systemTargets(sheet: Sheet): DestroyTarget[] {
  if (sheet.kind === "mech") {
    return sheet.systems.filter((s) => !s.destroyed).map((s) => ({ key: s.uid, label: s.name, uids: [s.uid] }));
  }
  return sheet.features
    .filter((f) => (f.type === "system" || f.type === "tech") && !f.destroyed)
    .map((f) => ({ key: f.uid, label: f.name, uids: [f.uid] }));
}
