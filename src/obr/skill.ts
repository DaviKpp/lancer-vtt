import type { CombatantState, RollResult, Sheet } from "../lib/types";
import { rollAccuracy, rollDie } from "../lib/dice";
import { uid } from "../lib/util";
import { publishRoll } from "./rolls";

export type SkillStat = "hull" | "agi" | "sys" | "eng";

export const SKILL_LABEL: Record<SkillStat, string> = {
  hull: "Casco",
  agi: "Agilidade",
  sys: "Sistemas",
  eng: "Engenharia",
};

/** HULL / AGILITY / SYSTEMS / ENGINEERING value of a mech (pilot's mech skills) or NPC. */
export function skillValues(sheet?: Sheet): Record<SkillStat, number> | undefined {
  if (!sheet) return undefined;
  if (sheet.kind === "mech") return { ...sheet.pilot.hase };
  const s = sheet.stats;
  return { hull: s.hull, agi: s.agi, sys: s.sys, eng: s.eng };
}

/** Automatic modifiers for checks and saves (positive = accuracy). */
export function skillModifiers(c: CombatantState, stat: SkillStat): { mods: { label: string; value: number }[]; autoFail?: string } {
  const st = c.st ?? [];
  const mods: { label: string; value: number }[] = [];
  if (st.includes("impaired")) mods.push({ label: "Prejudicado", value: -1 });
  const stunned = st.includes("stunned") || st.includes("shut-down");
  if (stunned && (stat === "hull" || stat === "agi")) return { mods, autoFail: "Atordoado: falha automática em Casco e Agilidade" };
  return { mods };
}

/**
 * Mech skill check or save: 1d20 + stat ± accuracy/difficulty, success on total ≥ target
 * (10 for checks; the attacker's Save Target for saves).
 */
export async function rollSkill(
  c: CombatantState,
  stat: SkillStat,
  value: number,
  o: { kind: "check" | "save"; target: number; manual: number; by: { id: string; name: string }; reason?: string },
): Promise<RollResult> {
  const { mods, autoFail } = skillModifiers(c, stat);
  const net = mods.reduce((a, m) => a + m.value, 0) + o.manual;
  const d20 = rollDie(20);
  const acc = rollAccuracy(net);
  const total = d20 + value + acc.mod;
  const success = !autoFail && total >= o.target;
  const r: RollResult = {
    id: uid(),
    ts: Date.now(),
    by: o.by.name,
    byId: o.by.id,
    attackerId: c.id,
    attackerName: c.name,
    kind: "skill",
    label: `${o.kind === "save" ? "Salvaguarda" : "Teste"} de ${SKILL_LABEL[stat]}${o.reason ? ` — ${o.reason}` : ""}`,
    d20,
    accDice: acc.dice,
    netAccuracy: net,
    bonus: value,
    total,
    defense: o.target,
    outcome: success ? "hit" : "miss",
    notes: [...mods.map((m) => `${m.label} (${m.value > 0 ? "+" : ""}${m.value})`), ...(autoFail ? [autoFail] : [])],
  };
  await publishRoll(r);
  return r;
}
