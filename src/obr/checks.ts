import type { CombatantState, RollResult } from "../lib/types";
import { CHECK_LABEL, rollCheck, type CheckKind } from "../lib/checks";
import { statusInfo } from "../lib/statuses";
import { uid } from "../lib/util";
import { getRoomState, patchCombatant } from "./room";
import { publishRoll } from "./rolls";
import { throwDiceAndWait } from "./dice";
import { rollDie } from "../lib/dice";
import { announce } from "./announce";

type By = { id: string; name: string };

/**
 * Patches a combatant and, if that marked structure or stress damage on a character that
 * has more than 1 structure/stress, rolls the structure / overheating check (one per point lost).
 */
export async function patchWithChecks(c: CombatantState, patch: Partial<CombatantState>, by: By) {
  await patchCombatant(c.id, patch);
  // pilots on foot: no structure, but reaching 0 HP means the Down and Out roll
  if (c.kind === "pilot") {
    if (patch.hp !== undefined && patch.hp <= 0) {
      if (c.hp > 0) await downAndOut(c.id, by);
      else if ((c.st ?? []).includes("downandout")) await announce(`${c.name} levou dano estando Abatido e morre.`, "ERROR");
    }
    return;
  }
  const lostStructure = patch.structure !== undefined ? c.structure - patch.structure : 0;
  const lostStress = patch.stress !== undefined ? c.stress - patch.stress : 0;
  for (let i = 0; i < lostStructure; i++) await runCheck(c.id, "structure", c.structure - i - 1, by);
  for (let i = 0; i < lostStress; i++) await runCheck(c.id, "stress", c.stress - i - 1, by);
}

async function runCheck(id: string, kind: CheckKind, remaining: number, by: By) {
  const c = (await getRoomState()).combatants[id];
  if (!c) return;
  const max = kind === "structure" ? c.maxStructure : c.maxStress;
  // characters with a single point (most NPCs) are simply destroyed; at 0 there is no roll
  if (max <= 1 || remaining < 1) return;
  const r = rollCheck(kind, remaining, max);
  const applied = r.statuses.map((s) => statusInfo(s)?.name ?? s);
  if (r.destroyed) applied.push("DESTRUÍDO");
  const entry: RollResult = {
    id: uid(),
    ts: Date.now(),
    by: by.name,
    byId: by.id,
    attackerId: c.id,
    attackerName: c.name,
    targetId: c.id,
    targetName: c.name,
    kind: "check",
    label: `${CHECK_LABEL[kind]}: ${r.title}`,
    d20: 0,
    accDice: r.dice,
    netAccuracy: 0,
    bonus: 0,
    total: r.lowest,
    effect: r.text,
    applied: applied.length ? applied : undefined,
    trauma: r.trauma,
    notes: [`${kind === "structure" ? "Estrutura" : "Estresse"} restante: ${remaining}/${max}`],
  };
  // Dice first; the conditions from the check land once they stop.
  const thrown = await throwDiceAndWait(entry);
  if (r.statuses.length) {
    const fresh = (await getRoomState()).combatants[c.id] ?? c;
    await patchCombatant(c.id, { st: Array.from(new Set([...(fresh.st ?? []), ...r.statuses])) });
  }
  await publishRoll(entry, { thrown });
}

/**
 * A pilot reduced to 0 HP rolls 1d6 (LANCER core p.49): 6 — back to 1 HP; 2–5 — Down and Out
 * (unconscious and Stunned, Evasion 5; any more damage kills them; they may choose to die instead);
 * 1 — dead.
 */
async function downAndOut(id: string, by: By) {
  const c = (await getRoomState()).combatants[id];
  if (!c) return;
  const d = rollDie(6);
  const result =
    d === 6
      ? { title: "Escapou por pouco", text: "Volta a ter 1 PV.", patch: { hp: 1, structure: 1 } as Partial<CombatantState>, st: [] as string[] }
      : d >= 2
        ? {
            title: "Abatido",
            text: "Inconsciente e Atordoado (Evasão 5) com 0 PV. Se levar mais dano, morre. O jogador pode escolher que ele morra.",
            patch: {},
            st: ["downandout", "stunned"],
          }
        : { title: "Morto", text: "A sorte acabou: o piloto morre.", patch: {}, st: [] };
  const entry: RollResult = {
    id: uid(),
    ts: Date.now(),
    by: by.name,
    byId: by.id,
    attackerId: c.id,
    attackerName: c.name,
    targetId: c.id,
    targetName: c.name,
    kind: "check",
    label: `Piloto a 0 PV: ${result.title}`,
    d20: 0,
    accDice: [d],
    netAccuracy: 0,
    bonus: 0,
    total: d,
    effect: result.text,
    applied: result.st.length ? result.st.map((s) => statusInfo(s)?.name ?? s) : undefined,
  };
  const thrown = await throwDiceAndWait(entry);
  const fresh = (await getRoomState()).combatants[id] ?? c;
  const patch: Partial<CombatantState> = { ...result.patch };
  if (result.st.length) patch.st = Array.from(new Set([...(fresh.st ?? []), ...result.st]));
  if (Object.keys(patch).length) await patchCombatant(id, patch);
  await publishRoll(entry, { thrown });
}
