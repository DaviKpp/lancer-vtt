import type { AttackSpec } from "../components/AttackPanel";
import type { RollResult } from "../lib/types";
import { rollDie } from "../lib/dice";
import { autoModifiers, defenseFor, type Cover } from "../lib/modifiers";
import { applyOnHit } from "./effects";
import { getRoomState, patchCombatant } from "./room";
import { publishRoll, rollAttack } from "./rolls";
import { throwDiceAndWait } from "./dice";

/** Pause between revealing the hit and throwing the damage dice. */
const HIT_PAUSE = 900;

export interface AttackOptions {
  targetId?: string;
  manual: number; // extra Accuracy (+) / Difficulty (−) chosen by the player
  cover: Cover;
  consumeLockOn: boolean;
  bonusDamage?: string;
  label?: string;
  by: { id: string; name: string };
}

/**
 * Rolls an attack with every automatic modifier from the rules, then applies the
 * consequences: invisibility (50%), on-hit effects, Lock On consumed, Hidden attacker revealed.
 */
export async function performAttack(attackerId: string, spec: AttackSpec, o: AttackOptions): Promise<RollResult | null> {
  const { combatants } = await getRoomState();
  const attacker = combatants[attackerId];
  if (!attacker) return null;
  const target = o.targetId ? combatants[o.targetId] : undefined;
  const mods = autoModifiers(spec, attacker, target, o.cover, o.consumeLockOn);
  const auto = mods.reduce((a, m) => a + m.value, 0);
  const def = defenseFor(spec, target);
  const notes = [
    ...(spec.notes ?? []),
    ...mods.filter((m) => m.value !== 0 && !/^Arma/.test(m.label)).map((m) => `${m.label} (${m.value > 0 ? "+" : ""}${m.value})`),
    ...(def.note ? [def.note] : []),
  ];

  let r = rollAttack({
    kind: spec.kind,
    attacker,
    target,
    label: o.label ?? spec.label,
    bonus: spec.bonus,
    accuracy: auto + o.manual,
    defense: def.value,
    damage: spec.damage,
    bonusDamage: o.bonusDamage,
    reliable: spec.reliable,
    burn: spec.burn,
    effect: spec.effect,
    critEffect: spec.critEffect,
    notes,
    by: o.by,
  });

  // Invisible: every attack has a 50% chance to miss outright
  if (target?.st?.includes("invisible") && r.outcome !== "miss") {
    if (rollDie(2) === 1) {
      r = { ...r, outcome: "miss", damage: undefined, effect: undefined, notes: [...(r.notes ?? []), "Alvo Invisível: errou (50%)"] };
    } else r = { ...r, notes: [...(r.notes ?? []), "Alvo Invisível: passou nos 50%"] };
  }

  // Dice first: the to-hit dice, then — once the hit is revealed — the damage dice. Effects on the
  // target (conditions, heat, Lock On...) only land after that.
  const thrown = await throwDiceAndWait(r, "hit");
  if (thrown && r.outcome !== "miss" && r.damage?.length) {
    await new Promise((res) => setTimeout(res, HIT_PAUSE)); // let everyone read the hit first
    await throwDiceAndWait(r, "damage");
  }

  r = await applyOnHit(r, spec);

  // Lock On is consumed; attacking reveals a Hidden attacker
  if (target && o.consumeLockOn && target.st?.includes("lockon")) {
    const fresh = (await getRoomState()).combatants[target.id];
    if (fresh) await patchCombatant(target.id, { st: (fresh.st ?? []).filter((s) => s !== "lockon") });
  }
  if (attacker.st?.includes("hidden")) {
    const fresh = (await getRoomState()).combatants[attacker.id];
    if (fresh) await patchCombatant(attacker.id, { st: (fresh.st ?? []).filter((s) => s !== "hidden") });
    r = { ...r, notes: [...(r.notes ?? []), "Atacar revelou o atacante (deixou de estar Oculto)"] };
  }

  await publishRoll(r, { thrown });
  return r;
}
