import type { CombatantState } from "./types";
import { tr } from "./i18n";

export interface DamageOutcome {
  patch: Partial<CombatantState>;
  log: string[];
  /** How much of `opts.reduce` was used (the rest can go to the next damage type). */
  reduced?: number;
}

/**
 * Applies damage following LANCER core rules:
 * armor reduces damage (unless AP / burn), then resistance halves it (rounding up), then any flat
 * reduction; overshield absorbs next,
 * reaching 0 HP marks 1 structure and resets HP to full, and the damage left over carries into the
 * new HP (enough of it can cost more than one structure).
 * Heat is handled separately by applyHeat.
 */
export function applyDamage(
  s: CombatantState,
  amount: number,
  opts: { ap?: boolean; type?: string; halve?: boolean; reduce?: number } = {},
): DamageOutcome {
  const log: string[] = [];
  let reduced = 0;
  // LANCER golden rule: always round up.
  let dmg = Math.max(0, Math.ceil(amount));
  let type = opts.type ?? "";
  const st = s.st ?? [];
  // Characters without a heat cap (pilots on foot, drones...) take heat as energy damage.
  if (/heat/i.test(type) && !(s.heatcap > 0)) {
    type = "Energy";
    log.push("Sem limite de calor: o calor vira dano de energia");
  }
  const isBurn = /burn/i.test(type);
  // Shredded: no benefit from armor or resistance
  const shredded = st.includes("shredded");
  if (/heat/i.test(type)) {
    if (opts.halve && dmg > 0 && !shredded) {
      dmg = Math.ceil(dmg / 2);
      log.push(`Resistência: reduzido a ${dmg}`);
    }
    const heat = applyHeat(s, dmg);
    return { ...heat, log: [...heat.log, ...log] };
  }
  // Exposed: kinetic, explosive and energy damage is doubled, before any reduction
  if (st.includes("exposed") && dmg > 0 && !/burn|heat/i.test(type)) {
    dmg *= 2;
    log.push(`Exposto: dano dobrado para ${dmg}`);
  }
  if (shredded) log.push("Rasgado: sem armadura nem resistência");
  // armor first (not against AP, burn or a Shredded target)...
  if (!opts.ap && !isBurn && !shredded && s.armor > 0) {
    const afterArmor = Math.max(0, dmg - s.armor);
    if (afterArmor !== dmg) log.push(`Armadura ${s.armor}: ${dmg} → ${afterArmor}`);
    dmg = afterArmor;
  }
  // ...then resistance halves what's left, rounding up
  if (opts.halve && dmg > 0 && !shredded) {
    dmg = Math.ceil(dmg / 2);
    log.push(`Resistência: reduzido a ${dmg}`);
  }
  // flat reduction from an ability / effect ("reduz o dano em X")
  if (opts.reduce && opts.reduce > 0 && dmg > 0) {
    const cut = Math.min(dmg, Math.ceil(opts.reduce));
    dmg -= cut;
    reduced = cut;
    log.push(`Redução ${cut}`);
  }
  let os = s.os;
  if (os > 0 && dmg > 0) {
    const absorbed = Math.min(os, dmg);
    os -= absorbed;
    dmg -= absorbed;
    log.push(`Sobrescudo absorveu ${absorbed}`);
  }
  let hp = s.hp - dmg;
  let structure = s.structure;
  // Reaching 0 HP marks 1 structure and HP goes back to full, minus the damage left over; if that
  // still empties the new HP, another structure is lost, and so on.
  let lost = 0;
  while (hp <= 0 && dmg > 0 && structure > 0) {
    structure -= 1;
    lost += 1;
    if (structure > 0) {
      hp += s.maxHp;
      log.push(`Dano de estrutura! Restam ${structure}/${s.maxStructure}`);
    } else {
      hp = 0;
      // a pilot then rolls Down and Out (obr/checks.ts)
      log.push(s.kind === "pilot" ? "Chegou a 0 PV!" : "Destruído!");
    }
  }
  hp = Math.max(0, hp);
  // say how much damage carried into the new HP (on the last structure line)
  if (lost > 0 && structure > 0 && hp < s.maxHp) log[log.length - 1] += ` (${s.maxHp - hp} de dano passou: PV ${hp}/${s.maxHp})`;
  log.unshift(`${s.name} recebe ${dmg} de dano${type ? " " + tr(type).toLowerCase() : ""}`);
  return { patch: { hp, os, structure }, log, reduced };
}

/**
 * Heat (LANCER core p.81): going over the heat cap marks 1 stress and clears all heat; then the
 * heat left beyond what was needed to exceed the cap is taken again, which can overheat more than
 * once. E.g. cap 6 at 6 heat: +1 → 0 heat; +4 → 3 heat (1 to exceed, 3 left over).
 */
export function applyHeat(s: CombatantState, amount: number): DamageOutcome {
  const log = [`${s.name} recebe ${amount} de calor`];
  let heat = s.heat + Math.max(0, Math.ceil(amount));
  let stress = s.stress;
  // NPCs with a single point of stress (the default) become Exposed instead of overheating (core p.281)
  if (s.kind === "npc" && s.maxStress <= 1 && s.heatcap > 0 && heat > s.heatcap) {
    while (heat > s.heatcap) heat = heat - s.heatcap - 1;
    heat = Math.max(0, heat);
    log.push(`Passou do limite de calor: fica Exposto (calor ${heat}/${s.heatcap})`);
    return { patch: { heat, st: Array.from(new Set([...(s.st ?? []), "exposed"])) }, log };
  }
  while (s.heatcap > 0 && heat > s.heatcap && stress > 0) {
    stress -= 1;
    heat = heat - s.heatcap - 1; // what's left after the point that went over the cap
    log.push(stress > 0 ? `Superaquecimento! Estresse ${stress}/${s.maxStress}` : "Colapso do reator!");
  }
  if (s.heatcap > 0) heat = Math.max(0, Math.min(heat, s.heatcap));
  if (stress < s.stress && heat > 0) log.push(`calor restante ${heat}/${s.heatcap}`);
  return { patch: { heat, stress }, log };
}

/**
 * Rest (an hour of downtime, LANCER core p.81): clears heat and every status/condition on the mech;
 * a pilot gets back half their HP and stops being Down and Out (an ejected mech stays Impaired until
 * the Full Repair). Spending Repairs is done by hand.
 */
export function rest(s: CombatantState): Partial<CombatantState> {
  const patch: Partial<CombatantState> = { heat: 0, st: (s.st ?? []).filter((x) => x === "dead" || (x === "impaired" && !!s.ej)) };
  if (s.kind === "pilot" && !s.st?.includes("dead")) patch.hp = Math.min(s.maxHp, s.hp + Math.ceil(s.maxHp / 2));
  return patch;
}

export function fullRepair(s: CombatantState): Partial<CombatantState> {
  return {
    hp: s.maxHp,
    heat: 0,
    structure: s.maxStructure,
    stress: s.maxStress,
    burn: 0,
    os: 0,
    repairs: s.maxRepairs,
    core: s.kind === "mech" ? true : s.core,
    // LANCER core: a Full Repair also resets the Overcharge counter, restores Limited uses,
    // reloads weapons and clears statuses and conditions
    ocn: 0,
    lu: undefined,
    ul: undefined,
    rc: undefined,
    ej: undefined,
    php: undefined, // the pilot's HP back to full too
    st: (s.st ?? []).filter((x) => x === "dead"),
  };
}
