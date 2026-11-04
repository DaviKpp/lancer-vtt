import { getRoomState, patchCombatant } from "./room";
import { takeAction } from "./actions";

/** Marks weapons / systems as destroyed (or repaired) for a combatant and logs it. */
export async function setDestroyed(
  id: string,
  uids: string[],
  destroyed: boolean,
  label: string,
  by: { id: string; name: string },
) {
  const c = (await getRoomState()).combatants[id];
  if (!c) return;
  const dx = new Set(c.dx ?? []);
  uids.forEach((u) => (destroyed ? dx.add(u) : dx.delete(u)));
  await patchCombatant(id, { dx: Array.from(dx) });
  await takeAction(c, "none", destroyed ? `Destruído: ${label}` : `Reparado: ${label}`, by);
}
