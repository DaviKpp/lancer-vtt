// Weapon tags that limit when or how often something can be used (LANCER core, Tags).
// Nothing here blocks: the player is warned and decides (talents and systems bend these rules).
import type { CombatantState } from "./types";
import type { AttackSpec } from "../components/AttackPanel";

/** Attack actions themselves: taking one of these doesn't count as "another action" for Ordnance. */
const ATTACK_ACTIONS = new Set(["Escaramuça", "Rajada"]);

/** A character a pilot's Archaic weapon can't hurt (mechs and non-biological NPCs). */
function isMechLike(t: CombatantState): boolean {
  return t.kind === "mech" || (t.kind === "npc" && !t.bio);
}

/** Everything irregular about using this weapon now. */
export function usageIssues(c: CombatantState, spec: AttackSpec, targets: (CombatantState | undefined)[] = []): string[] {
  const out: string[] = [];
  const name = spec.label;
  if (spec.limited && (c.lu?.[spec.limited.uid] ?? 0) >= spec.limited.max) {
    out.push(`${name}: usos esgotados (Limitado ${spec.limited.max}); só voltam com um Reparo Total`);
  }
  if (spec.loading && c.ul?.includes(spec.loading)) {
    out.push(`${name} está descarregada (Recarregável): recarregue com Estabilizar`);
  }
  if (spec.dangerZone && c.heatcap > 0 && c.heat < Math.ceil(c.heatcap / 2)) {
    out.push(`Zona de Perigo: só pode ser usada com calor na metade do limite ou mais (${c.heat}/${c.heatcap})`);
  }
  if (spec.ordnance) {
    const other = (c.ac?.n ?? []).filter((x) => !ATTACK_ACTIONS.has(x) && x !== spec.costLabel);
    if (c.ac?.m || other.length) {
      out.push("Artilharia: só pode atacar antes de se mover ou fazer outras ações (exceto protocolos) neste turno");
    }
    if (c.st?.includes("engaged") && targets.some((t) => t?.st?.includes("engaged"))) {
      out.push("Artilharia: não pode mirar personagens engajados com você");
    }
  }
  if (spec.archaic && targets.some((t) => t && isMechLike(t))) {
    out.push(`${name} é Arcaica: não causa dano a mechs`);
  }
  return out;
}

/** What using the weapon changes on the attacker: Limited uses spent, Loading weapon unloaded. */
export function usagePatch(c: CombatantState, spec: AttackSpec): Partial<CombatantState> {
  const patch: Partial<CombatantState> = {};
  if (spec.limited) patch.lu = { ...(c.lu ?? {}), [spec.limited.uid]: (c.lu?.[spec.limited.uid] ?? 0) + 1 };
  if (spec.loading) patch.ul = Array.from(new Set([...(c.ul ?? []), spec.loading]));
  return patch;
}

/** Limited uses left, when the weapon has the tag. */
export function usesLeft(c: CombatantState, spec: Pick<AttackSpec, "limited">): number | undefined {
  return spec.limited ? Math.max(0, spec.limited.max - (c.lu?.[spec.limited.uid] ?? 0)) : undefined;
}
