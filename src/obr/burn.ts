// Burn at the end of a turn (LANCER): an Engineering check against 10. On a success all burn is
// cleared; on a failure the character takes burn damage equal to their burn (it ignores armor)
// and keeps burning.
import type { CombatantState, Sheet } from "../lib/types";
import { applyDamage } from "../lib/rules";
import { getRoomState, patchCombatant } from "./room";
import { rollSkill } from "./skill";
import { patchWithChecks } from "./checks";
import { announce, publicLog } from "./announce";
import { endTurn } from "./turns";

type By = { id: string; name: string };

/** Engineering bonus for the check: the mech's pilot skill, the NPC stat, or Grit for a pilot on foot. */
export function engineeringOf(c: CombatantState, sheet?: Sheet): number {
  if (!sheet) return 0;
  if (sheet.kind === "npc") return sheet.stats.eng;
  return c.kind === "pilot" ? sheet.pilot.grit : sheet.pilot.hase.eng;
}

export async function resolveBurn(id: string, eng: number, by: By) {
  const c = (await getRoomState()).combatants[id];
  if (!c || c.burn <= 0) return;
  const burn = c.burn;
  const r = await rollSkill(c, "eng", eng, { kind: "check", target: 10, manual: 0, reason: `Queimadura ${burn}`, by });
  const fresh = (await getRoomState()).combatants[id] ?? c;
  if (r.outcome === "hit") {
    await patchCombatant(id, { burn: 0 });
    await announce(`${fresh.name} apagou a queimadura.`, "SUCCESS");
    return;
  }
  // failed: burn damage (ignores armor), the burn stays
  const out = applyDamage(fresh, burn, { type: "Burn" });
  await patchWithChecks(fresh, out.patch, by);
  await announce(out.log.join(" · "), out.patch.structure !== fresh.structure ? "WARNING" : "INFO", {
    subject: fresh,
    publicMessage: publicLog(out.log),
  });
}

/** Ends the turn, then resolves burn (it happens at the end of the turn). */
export async function endTurnWithBurn(c: CombatantState, sheet: Sheet | undefined, by: By) {
  await endTurn(c.id);
  await resolveBurn(c.id, engineeringOf(c, sheet), by);
  // a pilot on foot acts in their mech's turn, so their burn is checked at its end too (with Grit)
  const pilot = (await getRoomState()).combatants[`${c.id}~p`];
  if (pilot && pilot.burn > 0) await resolveBurn(pilot.id, engineeringOf(pilot, sheet), by);
}
