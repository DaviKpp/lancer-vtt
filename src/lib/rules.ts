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
 * reaching 0 HP marks 1 structure and resets HP to full (excess damage is lost).
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
  const isBurn = /burn/i.test(opts.type ?? "");
  if (/heat/i.test(opts.type ?? "")) {
    if (opts.halve && dmg > 0) {
      dmg = Math.ceil(dmg / 2);
      log.push(`Resistência: reduzido a ${dmg}`);
    }
    const heat = applyHeat(s, dmg);
    return { ...heat, log: [...heat.log, ...log] };
  }
  // armor first (not against AP or burn)...
  if (!opts.ap && !isBurn && s.armor > 0) {
    const afterArmor = Math.max(0, dmg - s.armor);
    if (afterArmor !== dmg) log.push(`Armadura ${s.armor}: ${dmg} → ${afterArmor}`);
    dmg = afterArmor;
  }
  // ...then resistance halves what's left, rounding up
  if (opts.halve && dmg > 0) {
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
  if (hp <= 0 && dmg > 0) {
    structure = Math.max(0, structure - 1);
    hp = structure > 0 ? s.maxHp : 0;
    log.push(structure > 0 ? `Dano de estrutura! Restam ${structure}/${s.maxStructure}` : s.kind === "pilot" ? "Abatido!" : "Destruído!");
  }
  log.unshift(`${s.name} recebe ${dmg} de dano${opts.type ? " " + tr(opts.type).toLowerCase() : ""}`);
  return { patch: { hp, os, structure }, log, reduced };
}

/** Heat over capacity marks 1 stress and clears all heat. */
export function applyHeat(s: CombatantState, amount: number): DamageOutcome {
  const log = [`${s.name} recebe ${amount} de calor`];
  let heat = s.heat + amount;
  let stress = s.stress;
  if (s.heatcap > 0 && heat > s.heatcap) {
    // Overheating: mark 1 stress and clear all heat (the excess doesn't carry over).
    stress = Math.max(0, stress - 1);
    heat = 0;
    log.push(stress > 0 ? `Superaquecimento! Estresse ${stress}/${s.maxStress}` : "Colapso do reator!");
  }
  return { patch: { heat, stress }, log };
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
  };
}
