// Where a character stands in the current round of an active encounter.
import type { CombatantState, EncounterState } from "./types";

export type TurnState = "acting" | "ready" | "done";

/**
 * acting (it's their turn), ready (still has a turn to play) or done (already played).
 * A dismounted pilot follows their mech (they act in the mech's turn). Undefined outside an encounter.
 */
export function turnStateOf(
  c: CombatantState,
  encounter: EncounterState | null | undefined,
  combatants: Record<string, CombatantState>,
): TurnState | undefined {
  const who = c.kind === "pilot" && c.pm ? combatants[c.pm] ?? c : c;
  if (!encounter || encounter.status !== "active" || !encounter.combatants.includes(who.id)) return undefined;
  if (encounter.actor === who.id) return "acting";
  return who.used >= Math.max(1, who.activations) ? "done" : "ready";
}

export const TURN_LABEL: Record<TurnState, string> = {
  acting: "É o turno dele agora",
  ready: "Ainda tem turno para jogar nesta rodada",
  done: "Já jogou nesta rodada",
};

export const TURN_COLOR: Record<TurnState, string> = {
  acting: "#3fd46b",
  ready: "#f5c542",
  done: "#e2382c",
};
