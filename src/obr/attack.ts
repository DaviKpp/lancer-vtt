import type { AttackSpec } from "../components/AttackPanel";
import type { RollResult } from "../lib/types";
import { rollDie } from "../lib/dice";
import { attackBlockers, autoModifiers, defenseFor, type Cover } from "../lib/modifiers";
import { applyOnHit } from "./effects";
import { getRoomState, patchCombatant } from "./room";
import { publishRoll, rollAttack, rollSharedDamage, type SharedDamage } from "./rolls";
import { throwDiceAndWait } from "./dice";
import { playShot } from "./fx";
import { weaponFx } from "../lib/fxFrames";
import { weaponFxChoice } from "../lib/fxPrefs";
import { applyHeat } from "../lib/rules";
import { usagePatch } from "../lib/usage";
import { patchWithChecks } from "./checks";
import { takeAction } from "./actions";

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
  /** Several targets: damage rolled once for all of them. */
  sharedDamage?: SharedDamage;
  /** Throw the damage dice (false when they were already shown for another target of the same attack). */
  showDamageDice?: boolean;
  /** The player was warned (Jammed, Hidden target, tech vs a pilot on foot) and chose to go ahead. */
  ignoreBlockers?: boolean;
}

/** One target of an attack, with its own modifiers. */
export interface AttackTargetInput {
  targetId?: string;
  manual: number;
  cover: Cover;
  consumeLockOn: boolean;
}

/**
 * An attack against one or more targets. With several (area weapons, or more than one target
 * chosen), each target gets its own attack roll but the damage is rolled once and shared.
 */
export async function performAttackOnTargets(
  attackerId: string,
  spec: AttackSpec,
  targets: AttackTargetInput[],
  o: { bonusDamage?: string; label?: string; by: { id: string; name: string }; ignoreBlockers?: boolean },
): Promise<RollResult[]> {
  const list = targets.length ? targets : [{ manual: 0, cover: "none" as Cover, consumeLockOn: true }];
  if (list.length === 1) {
    const r = await performAttack(attackerId, spec, { ...list[0], bonusDamage: o.bonusDamage, label: o.label, by: o.by, ignoreBlockers: o.ignoreBlockers });
    return r ? [r] : [];
  }
  const shared = spec.damage?.length ? rollSharedDamage(spec.damage, o.bonusDamage, spec.overkill) : undefined;
  const out: RollResult[] = [];
  let damageShown = false;
  for (const [i, t] of list.entries()) {
    const r = await performAttack(attackerId, spec, {
      ...t,
      label: `${o.label ?? spec.label} · alvo ${i + 1}/${list.length}`,
      by: o.by,
      sharedDamage: shared,
      showDamageDice: !damageShown,
      ignoreBlockers: o.ignoreBlockers,
    });
    if (!r) continue;
    // the damage (and its Overkill heat) is rolled once for every target
    out.push(damageShown ? { ...r, overkillHeat: undefined } : r);
    if (r.outcome !== "miss" && r.damage?.length) damageShown = true;
  }
  return out;
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
    defenseLabel: def.label,
    ap: spec.ap,
    damage: spec.damage,
    bonusDamage: o.bonusDamage,
    reliable: spec.reliable,
    burn: spec.burn,
    effect: spec.effect,
    critEffect: spec.critEffect,
    notes,
    by: o.by,
    sharedDamage: o.sharedDamage,
    noCrit: attacker.kind === "npc" && !spec.critEffect,
    overkill: spec.overkill,
  });

  // Invisible: every attack has a 50% chance to miss outright
  if (target?.st?.includes("invisible") && r.outcome !== "miss") {
    if (rollDie(2) === 1) {
      r = { ...r, outcome: "miss", damage: undefined, effect: undefined, notes: [...(r.notes ?? []), "Alvo Invisível: errou (50%)"] };
    } else r = { ...r, notes: [...(r.notes ?? []), "Alvo Invisível: passou nos 50%"] };
  }

  // Attacks the rules don't allow miss outright: Jammed attacker (only basic attacks), Hidden target
  // (only area attacks), pilot on foot vs tech (BIOLOGICAL: immune except Lock On / Scan, which don't roll).
  const blocked = o.ignoreBlockers ? [] : Object.values(attackBlockers(spec, attacker, target)).filter((x): x is string => !!x);
  if (blocked.length) {
    r = { ...r, outcome: "miss", damage: undefined, effect: undefined, notes: [...(r.notes ?? []), ...blocked] };
  }

  // Dice first: the to-hit dice, then — once the hit is revealed — the damage dice. Effects on the
  // target (conditions, heat, Lock On...) only land after that.
  const thrown = await throwDiceAndWait(r, "hit");
  // the shot on the map: hits the target, or flies past it on a miss
  const shot = target
    ? await playShot(
        attacker,
        target,
        // the player's pick for this weapon, else the automatic one
        (spec.fxKey && weaponFxChoice(spec.fxKey)) || spec.fx || weaponFx({ kind: spec.kind, damage: spec.damage, melee: spec.melee }),
        r.outcome !== "miss",
      )
    : false;
  if (thrown && r.outcome !== "miss" && r.damage?.length && o.showDamageDice !== false) {
    // let everyone read the hit first (the shot animation already gave them that moment)
    if (!shot) await new Promise((res) => setTimeout(res, HIT_PAUSE));
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

/**
 * After a weapon is used: Limited uses and Loading are marked, and the attacker takes the heat
 * of Heat X (Self) (once per use, `selfHeat`) and of Overkill (1 per rerolled damage die).
 */
export async function afterWeaponUse(
  attackerId: string,
  spec: AttackSpec,
  results: RollResult[],
  by: { id: string; name: string },
  opts: { selfHeat?: boolean } = {},
) {
  const c = (await getRoomState()).combatants[attackerId];
  if (!c) return;
  const self = opts.selfHeat !== false ? spec.heatSelf ?? 0 : 0;
  const overkill = results.reduce((a, r) => a + (r.overkillHeat ?? 0), 0);
  const usage = usagePatch(c, spec);
  if (!self && !overkill) {
    if (Object.keys(usage).length) await patchCombatant(attackerId, usage);
    return;
  }
  const heat = applyHeat(c, self + overkill);
  const why = [self ? `Calor ${self} (Próprio)` : "", overkill ? `Exagero ${overkill}` : ""].filter(Boolean).join(" + ");
  await takeAction(c, "none", `${spec.label}: calor no atacante`, by, {
    detail: `+${self + overkill} de calor (${why})${heat.log.length > 1 ? " · " + heat.log.slice(1).join(" · ") : ""}`,
  });
  const now = (await getRoomState()).combatants[attackerId] ?? c;
  await patchWithChecks(now, { ...applyHeat(now, self + overkill).patch, ...usagePatch(now, spec) }, by);
}
