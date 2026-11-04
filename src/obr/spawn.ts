import type { NpcSheet } from "../lib/types";
import { combatantFromNpc } from "../lib/combatant";
import { uid } from "../lib/util";
import { getRoomState, putCombatants, removeCombatants } from "./room";
import { sheetStore } from "./sheets";

/**
 * Creates `count` numbered NPCs from a template and adds them to the current encounter
 * ("Assault 1", "Assault 2"...). Numbering continues from instances already in the room.
 */
export async function spawnFromTemplate(tpl: NpcSheet, count: number, gm: { id: string; name: string }) {
  const { combatants, encounter } = await getRoomState();
  if (!encounter) throw new Error("Crie um encontro primeiro.");
  const used = Object.values(combatants)
    .filter((c) => c.tpl === tpl.id)
    .map((c) => Number(/(\d+)$/.exec(c.name)?.[1] ?? 0));
  let n = used.length ? Math.max(...used) : 0;

  const sheets: NpcSheet[] = [];
  const states = [];
  for (let i = 0; i < Math.max(1, Math.min(count, 20)); i++) {
    n += 1;
    const sheet: NpcSheet = { ...tpl, raw: undefined, id: uid(), name: `${tpl.name} ${n}`, importedAt: Date.now() };
    sheets.push(sheet);
    states.push({ ...combatantFromNpc(sheet, gm.id, gm.name), tpl: tpl.id });
  }
  await putCombatants(states, { ...encounter, combatants: [...encounter.combatants, ...states.map((s) => s.id)] });
  // NPC sheets stay on the GM's device; players never need them.
  sheetStore.addLocal(sheets);
  return states;
}

/** Deletes NPC instances (combatant + local sheet). */
export async function deleteInstances(ids: string[], endEncounter = false) {
  if (!ids.length && !endEncounter) return;
  await removeCombatants(ids, endEncounter ? null : undefined);
  ids.forEach((id) => sheetStore.remove(id));
}
