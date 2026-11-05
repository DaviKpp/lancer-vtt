// Turns a roll into the list of physical dice to animate on everyone's screen.
import type { RollResult } from "./types";

const OUTCOME_PT = { hit: "ACERTO", miss: "ERRO", crit: "CRÍTICO" } as const;

export type DieTone = "main" | "acc" | "diff" | "dmg" | "check";

export interface ShownDie {
  sides: number;
  value: number;
  tone: DieTone;
  /** false = rolled but not used (lower accuracy die, the other crit damage roll...). */
  kept: boolean;
}

export interface DiceShow {
  id: string;
  title: string; // "Kai (Ana)"
  label: string; // weapon / check name
  result: string; // "18 — ACERTO · 7 de dano"
  dice: ShownDie[];
}

/** Dice inside a detail string like "2d6[3,5] + 2" or, on a crit, "1d6[2|5]". */
function diceInDetail(detail: string, tone: DieTone): ShownDie[] {
  const out: ShownDie[] = [];
  for (const m of detail.matchAll(/(\d+)d(\d+)\[([^\]]+)\]/g)) {
    const sides = Number(m[2]);
    const groups = m[3].split("|").map((g) => g.split(",").map(Number).filter((n) => Number.isFinite(n)));
    const sum = (g: number[]) => g.reduce((a, b) => a + b, 0);
    const keep = groups.length > 1 && sum(groups[1]) > sum(groups[0]) ? 1 : 0;
    groups.forEach((g, gi) => g.forEach((value) => out.push({ sides, value, tone, kept: gi === keep })));
  }
  return out;
}

export function diceForRoll(r: RollResult): DiceShow | null {
  const dice: ShownDie[] = [];
  if (r.d20 > 0) dice.push({ sides: 20, value: r.d20, tone: "main", kept: true });

  if (r.accDice?.length) {
    const check = r.kind === "check";
    const pick = check ? Math.min(...r.accDice) : Math.max(...r.accDice);
    const at = r.accDice.indexOf(pick);
    const tone: DieTone = check ? "check" : r.netAccuracy >= 0 ? "acc" : "diff";
    r.accDice.forEach((value, i) => dice.push({ sides: 6, value, tone, kept: i === at }));
  }

  for (const d of r.damage ?? []) dice.push(...diceInDetail(d.detail ?? "", "dmg"));
  if (r.kind === "action") for (const n of r.notes ?? []) dice.push(...diceInDetail(n, "dmg"));

  if (!dice.length) return null;

  const parts: string[] = [];
  if (r.kind === "check") parts.push(`menor ${r.total}`);
  else if (r.kind !== "action" && r.kind !== "damage") parts.push(String(r.total));
  if (r.kind === "skill" && r.outcome) parts.push(r.outcome === "hit" ? "SUCESSO" : "FALHA");
  else if (r.outcome) parts.push(OUTCOME_PT[r.outcome]);
  const dmg = (r.damage ?? []).reduce((a, d) => a + d.amount, 0);
  if (dmg > 0) parts.push(`${dmg} de dano`);

  return {
    id: r.id,
    title: r.by && r.by !== r.attackerName ? `${r.attackerName} (${r.by})` : r.attackerName,
    label: r.targetName && r.targetId !== r.attackerId ? `${r.label} → ${r.targetName}` : r.label,
    result: parts.join(" — "),
    dice: dice.slice(0, 12),
  };
}
