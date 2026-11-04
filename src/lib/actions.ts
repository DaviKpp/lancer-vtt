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
export function spend(ac: TurnActions | undefined, cost: ActionCost): TurnActions {
  const t: TurnActions = { ...(ac ?? {}) };
  if (cost === "quick") t.q = Math.min((t.q ?? 0) + 1, 3);
  if (cost === "full") t.f = true;
  if (cost === "move") t.m = true;
  return t;
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
