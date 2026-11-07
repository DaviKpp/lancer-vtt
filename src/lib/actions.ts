// LANCER action economy.
//
// On each turn a character has: a standard move, then either 2 quick actions OR 1 full
// action, any number of free actions, and one Overcharge (mechs: +1 quick action for heat).
// Reactions: see reactions.ts (one per turn, each refreshes at the start of your turn).
import type { CombatantState, TurnActions } from "./types";
import { reactionBlocked } from "./reactions";

export type ActionCost = "quick" | "full" | "reaction" | "free" | "protocol" | "move" | "none";

/** Maps an activation string from COMP/CON / lancer-data to its cost. */
export function costFromActivation(activation?: string): ActionCost {
  const a = (activation ?? "").toLowerCase().trim();
  if (!a) return "none";
  if (a.includes("full")) return "full"; // Full, Full Tech
  if (a.includes("quick") || a === "invade") return "quick"; // Quick, Quick Tech, Invade
  if (a.includes("reaction")) return "reaction";
  if (a.includes("protocol")) return "protocol";
  if (a.includes("free")) return "free";
  if (a.includes("move")) return "move";
  return "none";
}

export const COST_LABEL: Record<ActionCost, string> = {
  quick: "Ação Rápida",
  full: "Ação Inteira",
  reaction: "Reação",
  free: "Ação Livre",
  protocol: "Protocolo",
  move: "Movimento",
  none: "",
};

export function quickCap(ac: TurnActions): number {
  return (ac.f ? 0 : 2) + (ac.o ? 1 : 0);
}

/** Why an action can't be taken right now, or null if it can. Reactions: see reactions.ts. */
export function blockedReason(c: CombatantState | undefined, cost: ActionCost, tk = 0): string | null {
  const t = c?.ac ?? {};
  const q = t.q ?? 0;
  if (cost === "reaction") return reactionBlocked(c, undefined, tk);
  if (c?.br === 2) {
    // the turn after bracing: a single quick action and nothing else
    if (cost === "quick") return q < 1 ? null : "Preparado: só 1 Ação Rápida neste turno";
    if (cost !== "none") return "Preparado: neste turno só uma Ação Rápida (sem movimento, ação inteira, livres ou protocolos)";
  }
  switch (cost) {
    case "quick":
      return q < quickCap(t) ? null : "Sem ações rápidas restantes neste turno";
    case "full":
      return !t.f && q === 0 ? null : t.f ? "A ação inteira já foi usada" : "Já usou ação rápida: não sobra ação inteira";
    case "move":
      return t.m ? "O movimento padrão já foi usado" : null;
    case "protocol":
      return q > 0 || t.f || t.m ? "Protocolos só no início do turno" : null;
    default:
      return null;
  }
}

/** Returns the action state after spending `cost` (never fails: the table decides). */
export function spend(ac: TurnActions | undefined, cost: ActionCost, name?: string): TurnActions {
  const t: TurnActions = { ...(ac ?? {}) };
  if (cost === "quick") t.q = Math.min((t.q ?? 0) + 1, 3);
  if (cost === "full") t.f = true;
  if (cost === "move") t.m = true;
  // remember the action, so taking it again this turn can be flagged (free actions may repeat)
  if (name && REPEAT_CHECK.has(cost)) t.n = Array.from(new Set([...(t.n ?? []), name]));
  return t;
}

/** Tech actions (a Jammed character can't take them). */
const TECH_ACTIONS = new Set(["Invadir", "Travar Mira", "Escanear", "Reforçar", "Tech Inteira"]);

/** Costs where "the same action only once per turn" applies (free actions and reactions may repeat). */
const REPEAT_CHECK = new Set<ActionCost>(["quick", "full", "protocol"]);

/**
 * Everything irregular about taking an action now (LANCER rules): no action of that kind left,
 * the same action already taken this turn, a Stunned / Shut Down mech... Empty when it's fine.
 * Nothing here blocks: the player is warned and decides (talents and systems bend these rules).
 */
export function actionIssues(
  c: CombatantState | undefined,
  cost: ActionCost,
  name: string,
  tk = 0,
  opts: { mounting?: boolean } = {},
): string[] {
  if (!c || cost === "none") return [];
  const out: string[] = [];
  const st = c.st ?? [];
  // Stunned / Shut Down: no actions at all, except Boot Up (to end Shut Down) and the pilot
  // mounting, dismounting or ejecting
  const pilotExit = /Montar|Desmontar|Ejetar/i.test(name);
  if (c.kind !== "pilot" && st.includes("shut-down") && name !== "Ligar" && !pilotExit)
    out.push("O mech está Desligado: não pode agir até Ligar");
  else if (c.kind !== "pilot" && st.includes("stunned") && !st.includes("shut-down") && !pilotExit)
    out.push("Atordoado: não pode se mover nem fazer ações (nem livres ou reações)");
  if (name === "Ligar" && !st.includes("shut-down")) out.push("O mech não está Desligado");
  const moving = cost === "move" || name === "Impulsionar";
  if (moving && st.includes("immobilized")) out.push("Imobilizado: não pode se mover voluntariamente");
  else if (name === "Impulsionar" && (st.includes("slow") || st.includes("slowed") || st.includes("prone")))
    out.push("Lento (ou Caído): só pode fazer o movimento padrão, não pode Impulsionar");
  if (TECH_ACTIONS.has(name) && st.includes("jammed")) out.push("Bloqueado: não pode fazer ações tech");
  if (c.kind === "mech" && c.dm && !opts.mounting) out.push("O mech está sem piloto (o piloto desmontou)");
  const blocked = blockedReason(c, cost, tk);
  if (blocked) out.push(blocked);
  if (REPEAT_CHECK.has(cost) && (c.ac?.n ?? []).includes(name))
    out.push(`“${name}” já foi usada neste turno — a mesma ação só se repete como ação livre ou com um talento/sistema que permita`);
  return out;
}

/** Overcharge heat cost by number of previous uses this scene: 1, 1d3, 1d6, 1d6+4. */
export function overchargeCost(uses: number): string {
  return ["1", "1d3", "1d6", "1d6+4"][Math.min(uses, 3)];
}

export function turnSummary(c: CombatantState): string {
  const t = c.ac ?? {};
  if (c.br === 2) return (t.q ?? 0) >= 1 ? "Preparado: Ação Rápida já usada" : "Preparado: só 1 Ação Rápida neste turno";
  const left = Math.max(0, quickCap(t) - (t.q ?? 0));
  if (t.f) return `Ação inteira usada${t.o ? ` · ${left} rápida(s) da sobrecarga` : ""}`;
  return `${left} rápida(s) restante(s)${(t.q ?? 0) === 0 ? " ou 1 inteira" : ""}`;
}
