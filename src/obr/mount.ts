// Dismounting (the pilot steps out as its own combatant) and mounting back in. Both are full actions.
import OBR from "@owlbear-rodeo/sdk";
import type { CombatantState, MechSheet } from "../lib/types";
import { pilotCombatant, pilotIdFor } from "../lib/pilot";
import { getRoomState, linkToken, patchCombatant, putCombatant, removeCombatant } from "./room";
import { confirmAction, takeAction } from "./actions";
import { announce } from "./announce";

type By = { id: string; name: string };

/**
 * Dismount (full action), or Eject (quick action): the pilot flies 6 spaces, but ejecting is single use —
 * the mech stays IMPAIRED and can't eject again until the next Full Repair (LANCER core p.71).
 */
export async function dismount(mech: CombatantState, sheet: MechSheet, by: By, opts: { eject?: boolean } = {}) {
  const name = opts.eject ? "Ejetar" : "Desmontar";
  const extra = [
    ...(mech.dm ? ["O piloto já está fora do mech"] : []),
    ...(opts.eject && mech.ej ? ["O mech já ejetou: só pode ejetar de novo depois de um Reparo Total"] : []),
  ];
  if (!(await confirmAction(mech, opts.eject ? "quick" : "full", name, extra))) return;
  await takeAction(mech, opts.eject ? "quick" : "full", name, by, opts.eject ? { detail: "o piloto voa até 6 espaços; o mech fica Prejudicado até o Reparo Total" } : {});
  const fresh = (await getRoomState()).combatants[mech.id] ?? mech;
  const pilot = pilotCombatant(fresh, sheet.pilot);
  await putCombatant(pilot);
  await patchCombatant(
    mech.id,
    opts.eject ? { dm: 1, ej: 1, st: Array.from(new Set([...(fresh.st ?? []), "impaired"])) } : { dm: 1 },
  );
  // the pilot's token from the last time they were out, if it's still on the map
  const relinked = fresh.ptk ? await relinkPilotToken(pilot.id, fresh.ptk) : false;
  await announce(
    relinked
      ? `${pilot.name} ${opts.eject ? "ejetou" : "desmontou"} de ${mech.name}.`
      : `${pilot.name} ${opts.eject ? "ejetou" : "desmontou"} de ${mech.name}. Vincule um token ao piloto para usá-lo no mapa.`,
    "INFO",
  );
}

export async function mount(mech: CombatantState, by: By) {
  const { combatants } = await getRoomState();
  const pilot = combatants[pilotIdFor(mech.id)];
  const extra = [
    ...(!mech.dm ? ["O piloto já está no mech"] : []),
    ...(pilot && pilot.hp <= 0 ? [`${pilot.name} está com 0 PV (Abatido)`] : []),
  ];
  if (!(await confirmAction(mech, "full", "Montar", extra, { mounting: true }))) return;
  await takeAction(mech, "full", "Montar", by);
  // keep the pilot's HP and token for the next time they step out
  await patchCombatant(mech.id, { dm: undefined, php: pilot?.hp, ptk: pilot?.tokenId ?? mech.ptk });
  if (pilot) await removeCombatant(pilot.id);
  await announce(`${pilot?.name ?? "O piloto"} montou em ${mech.name}.`, "INFO");
}

async function relinkPilotToken(pilotId: string, tokenId: string): Promise<boolean> {
  try {
    if (!(await OBR.scene.isReady())) return false;
    const [token] = await OBR.scene.items.getItems([tokenId]);
    if (!token) return false;
    await linkToken(pilotId, tokenId);
    return true;
  } catch {
    return false;
  }
}
