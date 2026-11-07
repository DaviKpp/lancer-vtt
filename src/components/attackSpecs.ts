import type { ActionEntry, MechSheet, NpcFeatureSheet, NpcSheet, Sheet, SheetSystem, SheetWeapon, StatusEffect, TagEntry } from "../lib/types";
import { costFromActivation } from "../lib/actions";
import type { AttackSpec, InvadeOption } from "./AttackPanel";
import { reliableValue } from "./common";
import { weaponFx } from "../lib/fxFrames";
import { weaponFxKey } from "../lib/fxPrefs";
import { rechargeTarget } from "../obr/recharge";

function tagValue(tags: TagEntry[], id: string): number | undefined {
  const n = Number(tags.find((t) => t.id === id)?.val);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Weapon tags the attack flow enforces or tracks (LANCER core, Tags): Overkill, Heat X (Self),
 * Limited X, Loading, Ordnance, Danger Zone, Archaic, Knockback X.
 */
export function tagRules(tags: TagEntry[], uid: string): Partial<AttackSpec> {
  const has = (id: string) => tags.some((t) => t.id === id);
  const limited = tagValue(tags, "tg_limited");
  const knockback = tagValue(tags, "tg_knockback");
  return {
    overkill: has("tg_overkill") || undefined,
    heatSelf: tagValue(tags, "tg_heat_self"),
    limited: limited ? { uid, max: limited } : undefined,
    loading: has("tg_loading") ? uid : undefined,
    ordnance: has("tg_ordnance") || undefined,
    dangerZone: has("tg_danger_zone") || undefined,
    archaic: has("tg_archaic") || undefined,
    notes: knockback ? [`Empurrão ${knockback}: no acerto, o alvo pode ser empurrado ${knockback} espaço(s) para longe`] : undefined,
  };
}

/** Invade option available to everyone. */
export const FRAGMENT_SIGNAL: InvadeOption = {
  name: "Fragmentar Sinal",
  detail: "O alvo fica Prejudicado e Lento até o fim do próximo turno dele.",
  statuses: [{ id: "impaired" }, { id: "slow" }],
};

/** Invade options granted by the mech's systems (actions with the Invade activation). */
export function invadeOptionsFor(sheet?: Sheet): InvadeOption[] {
  const extra: InvadeOption[] = [];
  if (sheet?.kind === "mech") {
    for (const s of sheet.systems)
      for (const a of s.actions)
        if (/^invade$/i.test(a.activation ?? "")) extra.push({ name: `${a.name} (${s.name})`, detail: a.detail, statuses: a.statuses });
  }
  return [FRAGMENT_SIGNAL, ...extra];
}

/** Weapon attack: Skirmish (quick), or Barrage (full) for superheavy weapons. */
export function mechWeaponSpec(w: SheetWeapon, sheet: MechSheet): AttackSpec {
  const superheavy = /superheavy/i.test(w.mount);
  return {
    kind: "attack",
    label: w.name,
    bonus: sheet.stats.attackBonus,
    accuracy: w.accuracy,
    damage: w.damage,
    reliable: reliableValue(w.tags),
    burn: tagValue(w.tags, "tg_burn"),
    hitHeat: tagValue(w.tags, "tg_heat_target"),
    effect: w.onHit,
    critEffect: w.onCrit,
    hitStatuses: w.hitStatuses,
    critStatuses: w.critStatuses,
    cost: superheavy ? "full" : "quick",
    costLabel: superheavy ? "Rajada" : "Escaramuça",
    melee: w.isMelee,
    seeking: w.tags.some((t) => t.id === "tg_seeking"),
    smart: w.tags.some((t) => t.id === "tg_smart"),
    ap: w.tags.some((t) => t.id === "tg_ap"),
    fx: weaponFx({ kind: "attack", type: w.type, damage: w.damage, melee: w.isMelee }),
    fxKey: weaponFxKey(sheet.id, w.name),
    auxiliary: /aux/i.test(w.mount),
    range: w.range,
    ...tagRules(w.tags, w.uid),
  };
}

/**
 * Pilot on foot: "Lutar" (Fight) is a full action — one attack with a pilot weapon, Grit as the bonus.
 * Sidearm weapons can Fight as a quick action instead.
 */
export function pilotWeaponSpec(w: SheetWeapon, sheet: MechSheet): AttackSpec {
  const sidearm = w.tags.some((t) => t.id === "tg_sidearm");
  return {
    kind: "attack",
    label: w.name,
    bonus: sheet.pilot.grit,
    accuracy: w.accuracy,
    damage: w.damage,
    reliable: reliableValue(w.tags),
    burn: tagValue(w.tags, "tg_burn"),
    effect: w.onHit,
    critEffect: w.onCrit,
    hitStatuses: w.hitStatuses,
    critStatuses: w.critStatuses,
    cost: sidearm ? "quick" : "full",
    costLabel: sidearm ? "Lutar (Arma Secundária)" : "Lutar",
    melee: w.isMelee,
    seeking: w.tags.some((t) => t.id === "tg_seeking"),
    smart: w.tags.some((t) => t.id === "tg_smart"),
    ap: w.tags.some((t) => t.id === "tg_ap"),
    fx: weaponFx({ kind: "attack", damage: w.damage, melee: w.isMelee }),
    fxKey: weaponFxKey(`${sheet.id}~p`, w.name),
    range: w.range,
    ...tagRules(w.tags, w.uid),
  };
}

/** NPC Invade (core p.280): Systems vs E-Defense; on a hit, 2 heat and Impaired until the end of the target's next turn. */
export const NPC_INVADE: InvadeOption = {
  name: "Invadir (NPC)",
  detail: "O alvo fica Prejudicado até o fim do próximo turno dele.",
  statuses: [{ id: "impaired" }],
};

export function npcInvadeSpec(sheet: NpcSheet): AttackSpec {
  return { kind: "tech", label: "Invadir", bonus: sheet.stats.sys, accuracy: 0, cost: "quick", costLabel: "Invadir", invadeOptions: [NPC_INVADE] };
}

/** Generic tech attack = Invade: pick Fragment Signal or a system's invasion option. */
export function techSpec(label: string, bonus: number, sheet?: Sheet): AttackSpec {
  return { kind: "tech", label, bonus, accuracy: 0, cost: "quick", costLabel: "Invadir", invadeOptions: invadeOptionsFor(sheet) };
}

/** Effect text and imposed statuses of a tech action. */
function techEffect(actions: ActionEntry[], fallback?: string): { effect?: string; statuses?: StatusEffect[] } {
  const effect = actions.map((a) => a.detail).filter(Boolean).join("<br>") || fallback;
  const statuses = actions.flatMap((a) => a.statuses ?? []);
  return { effect, statuses: statuses.length ? statuses : undefined };
}

export function systemTechSpec(sys: SheetSystem, sheet: MechSheet): AttackSpec {
  const invades = sys.actions.filter((a) => /^invade$/i.test(a.activation ?? ""));
  if (invades.length) {
    // the system adds invasion options: offer them (plus Fragment Signal)
    return {
      ...techSpec(sys.name, sheet.stats.techAttack),
      invadeOptions: [...invades.map((a) => ({ name: a.name, detail: a.detail, statuses: a.statuses })), FRAGMENT_SIGNAL],
    };
  }
  const techActions = sys.actions.filter((a) => /tech/i.test(a.activation ?? ""));
  const { effect, statuses } = techEffect(techActions.length ? techActions : sys.actions, sys.effect);
  return {
    kind: "tech",
    label: sys.name,
    bonus: sheet.stats.techAttack,
    accuracy: 0,
    cost: techActions[0] ? costFromActivation(techActions[0].activation) : "quick",
    effect,
    hitStatuses: statuses,
  };
}

export function npcFeatureSpec(f: NpcFeatureSheet, sheet: NpcSheet): AttackSpec {
  const declared = f.actions.find((a) => a.activation)?.activation;
  if (f.type === "tech") {
    const { effect, statuses } = techEffect(f.actions, f.effect);
    return {
      kind: "tech",
      label: f.name,
      bonus: f.attackBonus || sheet.stats.techAttack,
      accuracy: f.accuracy,
      cost: declared ? costFromActivation(declared) : "quick",
      effect: f.effect && f.actions.length ? `${f.effect}<br>${effect ?? ""}` : effect,
      hitStatuses: [...(statuses ?? []), ...(f.hitStatuses ?? [])].length ? [...(statuses ?? []), ...(f.hitStatuses ?? [])] : undefined,
      critStatuses: f.critStatuses,
      recharge: rechargeTarget(f.tags) ? { uid: f.uid, target: rechargeTarget(f.tags)! } : undefined,
    };
  }
  const superheavy = /superheavy/i.test(f.weaponType ?? "");
  return {
    kind: "attack",
    label: f.name,
    bonus: f.attackBonus,
    accuracy: f.accuracy,
    damage: f.damage,
    reliable: reliableValue(f.tags),
    burn: tagValue(f.tags, "tg_burn"),
    hitHeat: tagValue(f.tags, "tg_heat_target"),
    effect: f.onHit,
    critEffect: f.onCrit,
    hitStatuses: f.hitStatuses,
    critStatuses: f.critStatuses,
    cost: declared ? costFromActivation(declared) : superheavy ? "full" : "quick",
    attacks: f.attacks && f.attacks > 1 ? f.attacks : undefined,
    melee: f.isMelee,
    seeking: f.tags.some((t) => t.id === "tg_seeking"),
    smart: f.tags.some((t) => t.id === "tg_smart"),
    ap: f.tags.some((t) => t.id === "tg_ap"),
    fx: weaponFx({ kind: "attack", type: f.weaponType, damage: f.damage, melee: f.isMelee }),
    recharge: rechargeTarget(f.tags) ? { uid: f.uid, target: rechargeTarget(f.tags)! } : undefined,
    // shared by every NPC of the same class (all "Pyro" use the same choice)
    fxKey: weaponFxKey(`npc:${sheet.className || sheet.name}`, f.name),
    range: f.range,
    ...tagRules(f.tags, f.uid),
  };
}

/** Every attack a combatant can roll, for quick rolling from the encounter list. */
export function attacksFor(sheet: Sheet): { key: string; spec: AttackSpec }[] {
  if (sheet.kind === "mech") {
    return [
      ...sheet.mounts.flatMap((m) =>
        m.weapons
          .filter((w) => !w.destroyed && w.damage.length + w.range.length > 0)
          .map((w) => ({ key: w.uid, spec: mechWeaponSpec(w, sheet) })),
      ),
      ...sheet.systems.filter((s) => s.isTech && !s.destroyed).map((s) => ({ key: s.uid, spec: systemTechSpec(s, sheet) })),
      { key: "tech", spec: techSpec("Invadir", sheet.stats.techAttack, sheet) },
    ];
  }
  return [
    ...sheet.features
      .filter((f) => (f.type === "weapon" || f.type === "tech") && !f.destroyed)
      .map((f) => ({ key: f.uid, spec: npcFeatureSpec(f, sheet) })),
    { key: "tech", spec: techSpec("Invadir", sheet.stats.techAttack, sheet) },
  ];
}
