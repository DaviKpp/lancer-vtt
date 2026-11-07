import type { CombatantState, RollResult } from "../lib/types";
import { actionIssues, COST_LABEL, spend, type ActionCost } from "../lib/actions";
import { reactionBlocked, spendReaction, type ReactionDef } from "../lib/reactions";
import { uid } from "../lib/util";
import { getRoomState, patchCombatant } from "./room";
import { publishRoll } from "./rolls";
import { startTurn } from "./turns";
import { announce } from "./announce";

type By = { id: string; name: string };

/**
 * Whose actions an action spends: a pilot on foot draws from the same pool as their mech (one move
 * and two quick actions, or one full action — LANCER core p.75), so the mech's turn is used.
 */
function poolOwner(c: CombatantState, combatants: Record<string, CombatantState>): CombatantState {
  return c.kind === "pilot" && c.pm && combatants[c.pm] ? combatants[c.pm] : c;
}

/**
 * Asks before doing something irregular. Returns true when there is nothing to warn about or the
 * player confirms (talents, systems and the GM can always bend the rules).
 */
export function confirmIssues(what: string, issues: string[]): boolean {
  const list = issues.filter(Boolean);
  if (!list.length) return true;
  const nl = String.fromCharCode(10);
  const lines = [`Aviso — ${what}`, "", ...list.map((x) => `• ${x}`), "", "Fazer mesmo assim?"];
  return window.confirm(lines.join(nl));
}

/** Turn-order problems: acting while it's someone else's turn, or after already playing this round. */
function turnIssues(
  c: CombatantState,
  encounter: Awaited<ReturnType<typeof getRoomState>>["encounter"],
  combatants: Record<string, CombatantState>,
): string[] {
  if (!encounter || encounter.status !== "active" || !encounter.combatants.includes(c.id) || encounter.actor === c.id) return [];
  const out: string[] = [];
  const actor = encounter.actor ? combatants[encounter.actor] : undefined;
  if (actor) out.push(`É o turno de ${actor.name}, não de ${c.name}`);
  if (c.used >= Math.max(1, c.activations)) out.push(`${c.name} já jogou nesta rodada`);
  return out;
}

/** Checks an action before taking it and asks the player if anything is irregular. */
export async function confirmAction(
  c: CombatantState,
  cost: ActionCost,
  name: string,
  extra: string[] = [],
  opts: { mounting?: boolean } = {},
): Promise<boolean> {
  if (cost === "none") return confirmIssues(name, extra);
  const { combatants, encounter } = await getRoomState();
  const fresh = combatants[c.id] ?? c;
  const owner = poolOwner(fresh, combatants);
  // the pilot's own conditions, the shared pool's spent actions and turn
  const pooled = owner === fresh ? fresh : { ...fresh, ac: owner.ac, br: owner.br, used: owner.used, activations: owner.activations };
  const issues =
    cost === "reaction"
      ? reactionIssues(fresh, undefined, encounter?.tk ?? 0)
      : // free actions too: they can only be taken on your own turn
        [...actionIssues(pooled, cost, name, encounter?.tk ?? 0, opts), ...turnIssues(owner, encounter, combatants)];
  return confirmIssues(`${name}${COST_LABEL[cost] ? ` (${COST_LABEL[cost]})` : ""}`, [...issues, ...extra]);
}

/** Starting a turn: warns when the character already played this round or someone else is acting. */
export async function confirmStartTurn(c: CombatantState): Promise<boolean> {
  const { combatants, encounter } = await getRoomState();
  const fresh = combatants[c.id] ?? c;
  const issues: string[] = [];
  if (encounter?.status === "active" && encounter.combatants.includes(fresh.id)) {
    if (fresh.used >= Math.max(1, fresh.activations)) issues.push(`${fresh.name} já jogou nesta rodada`);
    const actor = encounter.actor && encounter.actor !== fresh.id ? combatants[encounter.actor] : undefined;
    if (actor) issues.push(`${actor.name} ainda está no turno dele (não encerrou)`);
  }
  return confirmIssues(`Iniciar turno de ${fresh.name}`, issues);
}

/** Reaction problems: one per turn, the reaction's own uses, Brace, Stunned. */
function reactionIssues(c: CombatantState, def: ReactionDef | undefined, tk: number): string[] {
  const out: string[] = [];
  const st = c.st ?? [];
  if (c.kind !== "pilot" && (st.includes("stunned") || st.includes("shut-down"))) out.push("Atordoado/Desligado: não pode fazer reações");
  if (st.includes("jammed")) out.push("Bloqueado: não pode fazer reações");
  const blocked = reactionBlocked(c, def, tk);
  if (blocked) out.push(blocked);
  return out;
}

export async function confirmReaction(c: CombatantState, def: ReactionDef): Promise<boolean> {
  const { combatants, encounter } = await getRoomState();
  return confirmIssues(`${def.name} (Reação)`, reactionIssues(combatants[c.id] ?? c, def, encounter?.tk ?? 0));
}

/** Attacking, taking reactions and Boosting end HIDDEN (LANCER core p.77). */
function unhide(c: CombatantState): Partial<CombatantState> {
  return c.st?.includes("hidden") ? { st: c.st.filter((s) => s !== "hidden") } : {};
}

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
  // a pilot on foot acts on their mech's turn, with its actions
  const turnOf = poolOwner(combatants[c.id] ?? c, combatants);
  if (
    cost !== "none" &&
    encounter?.status === "active" &&
    encounter.combatants.includes(turnOf.id) &&
    encounter.actor !== turnOf.id
  ) {
    await startTurn(turnOf.id);
    await announce(`Turno de ${turnOf.name}.`, "INFO");
    ({ combatants, encounter } = await getRoomState());
  }
  const fresh = combatants[c.id] ?? c;
  const owner = poolOwner(fresh, combatants);
  // (irregular actions are confirmed before getting here: see confirmAction)
  if (cost !== "none" && cost !== "free") await patchCombatant(owner.id, { ac: spend(owner.ac, cost, label) });
  if (label === "Impulsionar" && fresh.st?.includes("hidden")) await patchCombatant(c.id, unhide(fresh));
  if (opts.log === false) return;
  await log(fresh, `${label}${COST_LABEL[cost] ? ` (${COST_LABEL[cost]})` : ""}`, by, opts.detail);
}

/** Uses a reaction: counts against "1 per turn" and the reaction's own uses. */
export async function useReaction(c: CombatantState, def: ReactionDef, by: By, opts: { log?: boolean; detail?: string } = {}) {
  const { combatants, encounter } = await getRoomState();
  const fresh = combatants[c.id] ?? c;
  const tk = encounter?.tk ?? 0;
  await patchCombatant(c.id, { ...spendReaction(fresh, def, tk), ...unhide(fresh) });
  if (opts.log === false) return;
  await log(fresh, `${def.name} (Reação)`, by, opts.detail);
}
