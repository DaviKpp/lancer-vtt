// Dismounting (the pilot steps out as its own combatant) and mounting back in. Both are full actions.
import type { CombatantState, MechSheet } from "../lib/types";
import { pilotCombatant, pilotIdFor } from "../lib/pilot";
import { getRoomState, patchCombatant, putCombatant, removeCombatant } from "./room";
import { takeAction } from "./actions";
import { announce } from "./announce";

type By = { id: string; name: string };

export async function dismount(mech: CombatantState, sheet: MechSheet, by: By) {
  await takeAction(mech, "full", "Desmontar", by);
  const fresh = (await getRoomState()).combatants[mech.id] ?? mech;
  const pilot = pilotCombatant(fresh, sheet.pilot);
  await putCombatant(pilot);
  await patchCombatant(mech.id, { dm: 1 });
  await announce(`${pilot.name} desmontou de ${mech.name}. Vincule um token ao piloto para usá-lo no mapa.`, "INFO");
}

export async function mount(mech: CombatantState, by: By) {
  const { combatants } = await getRoomState();
  const pilot = combatants[pilotIdFor(mech.id)];
  await takeAction(mech, "full", "Montar", by);
  // keep the pilot's HP for the next time they step out
  await patchCombatant(mech.id, { dm: undefined, php: pilot?.hp });
  if (pilot) await removeCombatant(pilot.id);
  await announce(`${pilot?.name ?? "O piloto"} montou em ${mech.name}.`, "INFO");
}
