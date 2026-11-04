import OBR from "@owlbear-rodeo/sdk";
import type { Metadata } from "@owlbear-rodeo/sdk";
import type { CombatantState } from "../lib/types";
import { COMBATANT_PREFIX, ENCOUNTER_KEY } from "./constants";
import { getRoomState } from "./room";

/**
 * Starts `id`'s turn: it becomes the active character, its actions and its reactions
 * refresh (reactions come back at the start of YOUR turn), and a Brace taken earlier
 * turns this into the restricted turn (only one quick action).
 */
export async function startTurn(id: string) {
  const { combatants, encounter } = await getRoomState();
  const c = combatants[id];
  if (!c) return;
  const update: Metadata = {
    [COMBATANT_PREFIX + id]: { ...c, ac: {}, ru: {}, br: c.br === 1 ? 2 : c.br } satisfies CombatantState,
  };
  if (encounter) update[ENCOUNTER_KEY] = { ...encounter, actor: id, tk: (encounter.tk ?? 0) + 1 };
  await OBR.room.setMetadata(update);
}

/** Ends `id`'s turn: one activation used, the turn is over (and so is a Brace restriction). */
export async function endTurn(id: string) {
  const { combatants, encounter } = await getRoomState();
  const c = combatants[id];
  if (!c) return;
  const update: Metadata = {
    [COMBATANT_PREFIX + id]: {
      ...c,
      used: Math.min(c.activations, c.used + 1),
      ac: {},
      br: c.br === 2 ? undefined : c.br,
    } satisfies CombatantState,
  };
  if (encounter) update[ENCOUNTER_KEY] = { ...encounter, actor: undefined, tk: (encounter.tk ?? 0) + 1 };
  await OBR.room.setMetadata(update);
}

export async function currentTurnKey(): Promise<number> {
  return (await getRoomState()).encounter?.tk ?? 0;
}
