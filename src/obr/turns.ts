import OBR from "@owlbear-rodeo/sdk";
import type { Metadata } from "@owlbear-rodeo/sdk";
import type { CombatantState } from "../lib/types";
import { COMBATANT_PREFIX, ENCOUNTER_KEY } from "./constants";
import { getRoomState } from "./room";
import { rollRecharge } from "./recharge";
import { announce } from "./announce";
import { notesOnTurn } from "../lib/hitNotes";

/** Lasting-effect notes that end with this turn start/end (on any character), added to the update. */
function withNotes(update: Metadata, combatants: Record<string, CombatantState>, id: string, phase: "start" | "end") {
  for (const [cid, nts] of Object.entries(notesOnTurn(combatants, id, phase))) {
    const key = COMBATANT_PREFIX + cid;
    update[key] = { ...((update[key] as CombatantState | undefined) ?? combatants[cid]), nts };
  }
}

/**
 * Starts `id`'s turn: it becomes the active character, its actions and its reactions
 * refresh (reactions come back at the start of YOUR turn), and a Brace taken earlier
 * turns this into the restricted turn (only one quick action).
 */
export async function startTurn(id: string) {
  const { combatants, encounter } = await getRoomState();
  const c = combatants[id];
  if (!c) return;
  // NPC Recharge: one 1d6 at the start of its turn for all its used Recharge features
  const recharge = c.kind === "npc" ? rollRecharge(c) : null;
  const update: Metadata = {
    [COMBATANT_PREFIX + id]: {
      ...c,
      ac: {},
      ru: {},
      br: c.br === 1 ? 2 : c.br,
      // Bolster lasts until the end of the character's next turn
      bl: c.bl ? 2 : undefined,
      ...(recharge ? { rc: recharge.rc } : {}),
    } satisfies CombatantState,
  };
  if (encounter) update[ENCOUNTER_KEY] = { ...encounter, actor: id, tk: (encounter.tk ?? 0) + 1 };
  withNotes(update, combatants, id, "start");
  await OBR.room.setMetadata(update);
  if (recharge) await announce(recharge.message, "INFO", { subject: c, publicMessage: "" });
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
      bl: c.bl === 2 ? undefined : c.bl,
    } satisfies CombatantState,
  };
  if (encounter) update[ENCOUNTER_KEY] = { ...encounter, actor: undefined, tk: (encounter.tk ?? 0) + 1 };
  withNotes(update, combatants, id, "end");
  await OBR.room.setMetadata(update);
}

export async function currentTurnKey(): Promise<number> {
  return (await getRoomState()).encounter?.tk ?? 0;
}
