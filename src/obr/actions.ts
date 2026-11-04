import OBR from "@owlbear-rodeo/sdk";
import type { CombatantState, RollResult } from "../lib/types";
import { blockedReason, COST_LABEL, spend, type ActionCost } from "../lib/actions";
import { reactionBlocked, spendReaction, type ReactionDef } from "../lib/reactions";
import { uid } from "../lib/util";
import { getRoomState, patchCombatant } from "./room";
import { publishRoll } from "./rolls";
import { startTurn } from "./turns";

type By = { id: string; name: string };

async function log(c: CombatantState, label: string, by: By, detail?: string) {
  const entry: RollResult = {
    id: uid(),
    ts: Date.now(),
    by: by.name,
    byId: by.id,
    attackerId: c.id,
    attackerName: c.name,
    kind: "action",
    label,
    d20: 0,
    accDice: [],
    netAccuracy: 0,
    bonus: 0,
    total: 0,
    notes: detail ? [detail] : undefined,
  };
  await publishRoll(entry);
}

/**
 * Marks an action as taken: spends it from the turn, warns if it wasn't available
 * (the table always has the final word, so it is never blocked) and posts it to the log.
 * Taking a normal action during an encounter makes it this character's turn if it wasn't.
 */
export async function takeAction(
  c: CombatantState,
  cost: ActionCost,
  label: string,
  by: By,
  opts: { log?: boolean; detail?: string } = {},
) {
  if (cost === "reaction") {
    return useReaction(c, { key: `x:${label}`, name: label, max: 1, kind: "other" }, by, opts);
  }
  let { combatants, encounter } = await getRoomState();
  if (
    cost !== "none" &&
    encounter?.status === "active" &&
    encounter.combatants.includes(c.id) &&
    encounter.actor !== c.id
  ) {
    await startTurn(c.id);
    await OBR.notification.show(`Turno de ${c.name}.`, "INFO");
    ({ combatants, encounter } = await getRoomState());
  }
  const fresh = combatants[c.id] ?? c;
  const blocked = blockedReason(fresh, cost, encounter?.tk ?? 0);
  if (blocked) await OBR.notification.show(`${fresh.name}: ${blocked}.`, "WARNING");
  if (cost !== "none" && cost !== "free" && cost !== "protocol") await patchCombatant(c.id, { ac: spend(fresh.ac, cost) });
  if (opts.log === false) return;
  await log(fresh, `${label}${COST_LABEL[cost] ? ` (${COST_LABEL[cost]})` : ""}`, by, opts.detail);
}

/** Uses a reaction: counts against "1 per turn" and the reaction's own uses. */
export async function useReaction(c: CombatantState, def: ReactionDef, by: By, opts: { log?: boolean; detail?: string } = {}) {
  const { combatants, encounter } = await getRoomState();
  const fresh = combatants[c.id] ?? c;
  const tk = encounter?.tk ?? 0;
  const blocked = reactionBlocked(fresh, def, tk);
  if (blocked) await OBR.notification.show(`${fresh.name}: ${blocked}.`, "WARNING");
  await patchCombatant(c.id, spendReaction(fresh, def, tk));
  if (opts.log === false) return;
  await log(fresh, `${def.name} (Reação)`, by, opts.detail);
}
