import type { CombatantState } from "../lib/types";
import { turnStateOf, TURN_LABEL } from "../lib/turn";

export { turnStateOf, TURN_LABEL };
export type { TurnState } from "../lib/turn";
import { useApp } from "./AppContext";

/** Small colored dot: green = acting, yellow = still to play, red = already played. */
export function TurnDot({ c, className }: { c: CombatantState; className?: string }) {
  const app = useApp();
  const state = turnStateOf(c, app.room.encounter, app.room.combatants);
  if (!state) return null;
  return <span className={`turn-dot turn-${state} ${className ?? ""}`} title={TURN_LABEL[state]} aria-label={TURN_LABEL[state]} />;
}
