import type { CombatantState, EncounterState } from "../lib/types";
import { useApp } from "./AppContext";

export type TurnState = "acting" | "ready" | "done";

/**
 * Where a character stands in the current round of an active encounter:
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

/** Small colored dot: green = acting, yellow = still to play, red = already played. */
export function TurnDot({ c, className }: { c: CombatantState; className?: string }) {
  const app = useApp();
  const state = turnStateOf(c, app.room.encounter, app.room.combatants);
  if (!state) return null;
  return <span className={`turn-dot turn-${state} ${className ?? ""}`} title={TURN_LABEL[state]} aria-label={TURN_LABEL[state]} />;
}
