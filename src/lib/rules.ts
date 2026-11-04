import type { CombatantState } from "./types";
import { clamp } from "./util";
import { tr } from "./i18n";

export interface DamageOutcome {
  patch: Partial<CombatantState>;
  log: string[];
}

/**
 * Applies damage following LANCER core rules:
 * overshield absorbs first, armor reduces damage (unless AP / burn),
 * reaching 0 HP marks 1 structure and resets HP to full (excess damage is lost).
 * Heat is handled separately by applyHeat.
 */
export function applyDamage(
  s: CombatantState,
  amount: number,
  opts: { ap?: boolean; type?: string; halve?: boolean } = {},
): DamageOutcome {
  const log: string[] = [];
  let dmg = Math.max(0, Math.floor(amount));
  if (opts.halve) {
    dmg = Math.ceil(dmg / 2); // halve, rounding up
    log.push(`Resistência: reduzido a ${dmg}`);
  }
  const isBurn = /burn/i.test(opts.type ?? "");
  if (/heat/i.test(opts.type ?? "")) return applyHeat(s, dmg);
  if (!opts.ap && !isBurn && s.armor > 0) {
    const reduced = Math.max(0, dmg - s.armor);
    if (reduced !== dmg) log.push(`Armadura ${s.armor}: ${dmg} → ${reduced}`);
    dmg = reduced;
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
    log.push(structure > 0 ? `Dano de estrutura! Restam ${structure}/${s.maxStructure}` : "Destruído!");
  }
  log.unshift(`${s.name} recebe ${dmg} de dano${opts.type ? " " + tr(opts.type).toLowerCase() : ""}`);
  return { patch: { hp, os, structure }, log };
}

/** Heat over capacity marks 1 stress and clears heat; the excess carries over. */
export function applyHeat(s: CombatantState, amount: number): DamageOutcome {
  const log = [`${s.name} recebe ${amount} de calor`];
  let heat = s.heat + amount;
  let stress = s.stress;
  if (s.heatcap > 0 && heat > s.heatcap) {
    stress = Math.max(0, stress - 1);
    heat = clamp(heat - s.heatcap, 0, s.heatcap);
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
