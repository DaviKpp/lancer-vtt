// NPC Recharge (LANCER core p.282): once used, a Recharge X+ system or weapon can't be used again
// until it recharges. At the start of the NPC's turn roll 1d6 once: every used Recharge feature
// whose target is equal to or lower than the roll comes back.
import type { CombatantState, TagEntry } from "../lib/types";
import { rollDie } from "../lib/dice";
import { getRoomState, patchCombatant } from "./room";

export interface RechargeInfo {
  uid: string;
  target: number;
}

/** The target number of a Recharge tag ("Recharge 5+" → 5), if the feature has one. */
export function rechargeTarget(tags: TagEntry[]): number | undefined {
  const t = tags.find((x) => x.id === "tg_recharge");
  if (!t) return undefined;
  const n = parseInt(String(t.val ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(6, n) : 5;
}

/** Warning when using a Recharge feature that hasn't recharged yet. */
export function rechargeIssues(c: CombatantState, r: RechargeInfo | undefined, name: string): string[] {
  if (!r || c.rc?.[r.uid] === undefined) return [];
  return [`${name} ainda está recarregando (Recarga ${c.rc[r.uid]}+): só volta com o 1d6 no início do turno do NPC`];
}

/** Marks a Recharge feature as used (it waits for the recharge roll). */
export async function markRechargeUsed(id: string, r: RechargeInfo | undefined) {
  if (!r) return;
  const c = (await getRoomState()).combatants[id];
  if (!c) return;
  await patchCombatant(id, { rc: { ...(c.rc ?? {}), [r.uid]: r.target } });
}

/** Toggles a feature between used (recharging) and ready, by hand. */
export async function toggleRecharge(id: string, r: RechargeInfo) {
  const c = (await getRoomState()).combatants[id];
  if (!c) return;
  const rc = { ...(c.rc ?? {}) };
  if (rc[r.uid] !== undefined) delete rc[r.uid];
  else rc[r.uid] = r.target;
  await patchCombatant(id, { rc: Object.keys(rc).length ? rc : undefined });
}

/** The recharge roll at the start of an NPC's turn: one 1d6 for all its used Recharge features. */
export function rollRecharge(c: CombatantState): { rc: Record<string, number> | undefined; message: string } | null {
  const waiting = Object.entries(c.rc ?? {});
  if (!waiting.length) return null;
  const d = rollDie(6);
  const left = Object.fromEntries(waiting.filter(([, target]) => target > d));
  const back = waiting.length - Object.keys(left).length;
  return {
    rc: Object.keys(left).length ? left : undefined,
    message: `${c.name}: Recarga 1d6 = ${d} — ${back ? `${back} habilidade(s) recarregada(s)` : "nada recarregou"}${
      Object.keys(left).length ? ` · ${Object.keys(left).length} ainda recarregando` : ""
    }`,
  };
}
