import type { AttackSpec } from "../components/AttackPanel";
import type { RollResult, StatusEffect } from "../lib/types";
import { applyHeat } from "../lib/rules";
import { statusInfo } from "../lib/statuses";
import { getRoomState, patchCombatant } from "./room";
import { patchWithChecks } from "./checks";
import { noteFromHit } from "../lib/hitNotes";

/** Effects whose text gives the target a choice can't be applied automatically. */
const CHOICE = /\bchoose|chooses|choice|escolh/i;

/**
 * Applies the automatic consequences of a hit to the target: conditions without a save,
 * heat (Invade / Heat X target) and burn. Returns the roll annotated with what was
 * applied and what still needs a decision (saves, choices).
 */
export async function applyOnHit(r: RollResult, spec: AttackSpec): Promise<RollResult> {
  if (!r.targetId || r.outcome === "miss" || r.outcome === undefined) return r;
  const { combatants } = await getRoomState();
  const target = combatants[r.targetId];
  if (!target) return r;

  const statuses: StatusEffect[] = [...(spec.hitStatuses ?? []), ...(r.outcome === "crit" ? spec.critStatuses ?? [] : [])];
  const choice = CHOICE.test(spec.effect ?? "");
  const auto = statuses.filter((s) => !s.save && !choice);
  const pending = statuses.filter((s) => s.save || choice);
  const applied: string[] = [];
  let next = { ...target };

  if (auto.length) {
    next.st = Array.from(new Set([...(next.st ?? []), ...auto.map((s) => s.id)]));
    applied.push(...auto.map((s) => statusInfo(s.id)?.name ?? s.id));
  }
  if (spec.hitHeat) {
    const h = applyHeat(next, spec.hitHeat);
    next = { ...next, ...h.patch };
    applied.push(`+${spec.hitHeat} de calor${h.log.length > 1 ? ` (${h.log.slice(1).join("; ")})` : ""}`);
  }
  const burn = (r.damage ?? []).filter((d) => /burn/i.test(d.type)).reduce((a, d) => a + d.amount, 0);
  if (burn > 0) {
    next.burn = (next.burn ?? 0) + burn;
    applied.push(`+${burn} de queimadura marcada (total ${next.burn})`);
  }
  // a lasting effect ("until the start of its next turn...") becomes a note on the target's sheet
  const attacker = combatants[r.attackerId ?? ""];
  const note = attacker && r.effect ? noteFromHit(attacker, target, spec.label, r.effect, r.id) : null;
  if (note) {
    const others = (target.nts ?? []).filter((n) => !(n.srcId === note.srcId && n.what === note.what));
    await patchCombatant(target.id, { nts: [...others, note] });
    applied.push("efeito duradouro anotado na ficha do alvo");
  }
  if (applied.length && (auto.length || spec.hitHeat || burn > 0)) {
    await patchWithChecks(
      target,
      { st: next.st, heat: next.heat, stress: next.stress, burn: next.burn },
      { id: r.byId, name: r.by },
    );
  }
  return { ...r, applied: applied.length ? applied : undefined, pending: pending.length ? pending : undefined };
}

/** Applies one pending status (after a failed save, or the target's choice). */
export async function applyPending(targetId: string, s: StatusEffect) {
  const t = (await getRoomState()).combatants[targetId];
  if (!t) return;
  await patchCombatant(t.id, { st: Array.from(new Set([...(t.st ?? []), s.id])) });
}
