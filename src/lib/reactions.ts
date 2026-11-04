// LANCER reactions.
//
//  - Each reaction has its own uses (usually 1 per round). Copies of the same reaction
//    (e.g. several turret drones) give extra uses.
//  - Uses refresh at the START OF YOUR TURN (not at the start of the round).
//  - You can take only ONE reaction per turn — whoever's turn it is (the Gorgon can take 2).
//  - Brace: no reactions until the end of your next turn, and on that turn only one quick action.
import type { CombatantState, Sheet } from "./types";

export interface ReactionDef {
  key: string;
  name: string;
  max: number;
  kind: "brace" | "overwatch" | "other";
  detail?: string;
  trigger?: string;
}

function usesFromFrequency(freq?: string): number {
  const m = /(\d+)\s*\/\s*(round|rodada|turn|turno)/i.exec(freq ?? "");
  return m ? Number(m[1]) : 1;
}

export const BRACE: ReactionDef = {
  key: "brace",
  name: "Preparar (Brace)",
  max: 1,
  kind: "brace",
  trigger: "Você é atingido por um ataque e já sabe o dano.",
  detail:
    "Resistência ao dano, queimadura e calor desse ataque (metade, arredondando para cima). Outros ataques contra você recebem +1 Dificuldade até o fim do seu próximo turno. Sem reações até o fim do seu próximo turno, e nele você só pode fazer uma Ação Rápida.",
};

export const OVERWATCH: ReactionDef = {
  key: "overwatch",
  name: "Vigilância (Overwatch)",
  max: 1,
  kind: "overwatch",
  trigger: "Um hostil começa a se mover dentro da Ameaça de uma das suas armas (Ameaça 1 se não indicado).",
  detail: "Imediatamente faça uma Escaramuça contra ele com essa arma, antes que ele se mova.",
};

/** All reactions a combatant has: Brace/Overwatch plus those from systems, features... */
export function reactionsFor(c: CombatantState, sheet?: Sheet): ReactionDef[] {
  const list: ReactionDef[] = c.kind === "mech" ? [BRACE, OVERWATCH] : [OVERWATCH];
  const extra = new Map<string, ReactionDef>();
  const add = (name: string, frequency?: string, detail?: string, trigger?: string) => {
    const key = `x:${name}`;
    const prev = extra.get(key);
    // several copies of the same reaction (e.g. turret drones) = more uses
    if (prev) prev.max += usesFromFrequency(frequency);
    else extra.set(key, { key, name, max: usesFromFrequency(frequency), kind: "other", detail, trigger });
  };
  if (sheet?.kind === "mech") {
    for (const s of sheet.systems.filter((x) => !x.destroyed))
      for (const a of s.actions) if (/reaction/i.test(a.activation ?? "")) add(a.name, a.frequency, a.detail, a.trigger);
    for (const m of sheet.mounts)
      for (const w of m.weapons.filter((x) => !x.destroyed))
        for (const a of w.actions ?? []) if (/reaction/i.test(a.activation ?? "")) add(a.name, a.frequency, a.detail, a.trigger);
  } else if (sheet?.kind === "npc") {
    for (const f of sheet.features.filter((x) => !x.destroyed)) {
      const acts = f.actions.filter((a) => /reaction/i.test(a.activation ?? ""));
      if (acts.length) acts.forEach((a) => add(a.name, a.frequency, a.detail, a.trigger ?? f.trigger));
      else if (f.type === "reaction") add(f.name, undefined, f.effect, f.trigger);
    }
  }
  return [...list, ...extra.values()];
}

/** Turn-scoped reaction counter key: the encounter's turn counter. */
export function reactionsThisTurn(c: CombatantState, tk: number): number {
  return c.rx && c.rx.tk === tk ? c.rx.n : 0;
}

/** Why `def` (or any reaction, if omitted) can't be used now, or null. */
export function reactionBlocked(c: CombatantState | undefined, def: ReactionDef | undefined, tk: number): string | null {
  if (!c) return null;
  if (c.br) return "Preparado: sem reações até o fim do seu próximo turno";
  const perTurn = c.rpt ?? 1;
  if (reactionsThisTurn(c, tk) >= perTurn)
    return perTurn > 1 ? `Já usou ${perTurn} reações neste turno` : "Já usou uma reação neste turno (1 por turno)";
  if (def && (c.ru?.[def.key] ?? 0) >= def.max)
    return `${def.name} esgotada (${def.max}/rodada) — volta no início do seu turno`;
  return null;
}

/** State patch for using `def`. */
export function spendReaction(c: CombatantState, def: ReactionDef, tk: number): Partial<CombatantState> {
  return {
    rx: { tk, n: reactionsThisTurn(c, tk) + 1 },
    ru: { ...(c.ru ?? {}), [def.key]: (c.ru?.[def.key] ?? 0) + 1 },
    ...(def.kind === "brace" ? { br: 1 as const } : {}),
  };
}

export const REACTION_RULES = [
  "Reações podem ser usadas no turno de qualquer personagem, aliado ou inimigo, quando o gatilho acontece.",
  "Cada reação tem seus próprios usos (normalmente 1 por rodada), que voltam no início do SEU turno.",
  "Só uma reação por turno — de quem quer que seja o turno (a Gorgon pode usar 2).",
  "Cópias da mesma reação (ex.: vários drones de torreta) dão mais usos, mas o limite de 1 por turno continua.",
  "Reações resolvem depois da ação que as desencadeou, a menos que digam “imediatamente” (como a Vigilância).",
];
