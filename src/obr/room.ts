// Live combat state in Owlbear Rodeo room metadata.
//
// Each combatant gets its own top-level key. OBR merges room metadata shallowly,
// so two clients editing different combatants at the same time never overwrite
// each other. Room metadata is capped at 16kB in total, which is why only small
// numbers live here and the full sheets travel over broadcast (see sheets.ts).
import OBR, { type Metadata } from "@owlbear-rodeo/sdk";
import type { CombatantState, EncounterState } from "../lib/types";
import { COMBATANT_PREFIX, ENCOUNTER_KEY, LINK_KEY } from "./constants";

export interface RoomState {
  combatants: Record<string, CombatantState>;
  encounter: EncounterState | null;
}

export function readRoomState(metadata: Metadata): RoomState {
  const combatants: Record<string, CombatantState> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (key.startsWith(COMBATANT_PREFIX) && value && typeof value === "object") {
      const c = value as CombatantState;
      combatants[c.id] = c;
    }
  }
  const enc = metadata[ENCOUNTER_KEY];
  return {
    combatants,
    encounter: enc && typeof enc === "object" ? (enc as EncounterState) : null,
  };
}

export async function getRoomState(): Promise<RoomState> {
  return readRoomState(await OBR.room.getMetadata());
}

export async function putCombatant(state: CombatantState): Promise<void> {
  await OBR.room.setMetadata({ [COMBATANT_PREFIX + state.id]: state });
}

/** Read-modify-write against the latest metadata to keep concurrent edits safe. */
export async function patchCombatant(id: string, patch: Partial<CombatantState>): Promise<void> {
  const { combatants } = await getRoomState();
  const current = combatants[id];
  if (!current) return;
  await OBR.room.setMetadata({ [COMBATANT_PREFIX + id]: { ...current, ...patch, id } });
}

export async function patchCombatants(patches: Record<string, Partial<CombatantState>>): Promise<void> {
  const { combatants } = await getRoomState();
  const update: Metadata = {};
  for (const [id, patch] of Object.entries(patches)) {
    if (combatants[id]) update[COMBATANT_PREFIX + id] = { ...combatants[id], ...patch, id };
  }
  if (Object.keys(update).length) await OBR.room.setMetadata(update);
}

export async function removeCombatant(id: string): Promise<void> {
  const { combatants, encounter } = await getRoomState();
  const tokenId = combatants[id]?.tokenId;
  const update: Metadata = { [COMBATANT_PREFIX + id]: undefined };
  // a mech's dismounted pilot goes with it
  const pilot = combatants[`${id}~p`];
  if (pilot) update[COMBATANT_PREFIX + pilot.id] = undefined;
  if (encounter?.combatants.includes(id)) {
    update[ENCOUNTER_KEY] = { ...encounter, combatants: encounter.combatants.filter((x) => x !== id) };
  }
  await OBR.room.setMetadata(update);
  if (tokenId) await clearTokenLink(tokenId);
  if (pilot?.tokenId) await clearTokenLink(pilot.tokenId);
}

/** Approximate size check against Owlbear's 16kB room metadata limit. */
export const ROOM_LIMIT = 16000;
export function roomBytes(metadata: Metadata): number {
  return new TextEncoder().encode(JSON.stringify(metadata)).length;
}

/** Adds several combatants (and optionally a new encounter value) in one metadata write. */
export async function putCombatants(states: CombatantState[], encounter?: EncounterState | null): Promise<void> {
  const current = await OBR.room.getMetadata();
  const update: Metadata = {};
  for (const s of states) update[COMBATANT_PREFIX + s.id] = s;
  if (encounter !== undefined) update[ENCOUNTER_KEY] = encounter ?? undefined;
  const projected = roomBytes({ ...current, ...update });
  if (projected > ROOM_LIMIT - 300) {
    throw new Error(
      `O armazenamento da sala chegaria a ${(projected / 1000).toFixed(1)} kB do limite de 16 kB do Owlbear. Remova alguns combatentes primeiro.`,
    );
  }
  await OBR.room.setMetadata(update);
}

/** Removes several combatants in one write (also drops them from the encounter). */
export async function removeCombatants(ids: string[], encounter?: EncounterState | null): Promise<void> {
  const { combatants, encounter: enc } = await getRoomState();
  const update: Metadata = {};
  const tokens: string[] = [];
  for (const id of ids) {
    update[COMBATANT_PREFIX + id] = undefined;
    const t = combatants[id]?.tokenId;
    if (t) tokens.push(t);
  }
  const base = encounter !== undefined ? encounter : enc;
  if (base) update[ENCOUNTER_KEY] = { ...base, combatants: base.combatants.filter((x) => !ids.includes(x)) };
  if (encounter === null) update[ENCOUNTER_KEY] = undefined;
  await OBR.room.setMetadata(update);
  for (const t of tokens) await clearTokenLink(t);
}

export async function setEncounter(encounter: EncounterState | null): Promise<void> {
  await OBR.room.setMetadata({ [ENCOUNTER_KEY]: encounter ?? undefined });
}

// ---------- token links ----------

async function clearTokenLink(tokenId: string) {
  try {
    if (!(await OBR.scene.isReady())) return;
    await OBR.scene.items.updateItems([tokenId], (items) => {
      for (const item of items) delete item.metadata[LINK_KEY];
    });
  } catch {
    // token gone or no permission; the room entry is the source of truth anyway
  }
}

/** Links a combatant to a token. A token can only hold one combatant. */
export async function linkToken(combatantId: string, tokenId: string): Promise<void> {
  const { combatants } = await getRoomState();
  const update: Metadata = {};
  for (const c of Object.values(combatants)) {
    if (c.id !== combatantId && c.tokenId === tokenId) update[COMBATANT_PREFIX + c.id] = { ...c, tokenId: undefined };
  }
  const target = combatants[combatantId];
  if (!target) return;
  const previous = target.tokenId;
  update[COMBATANT_PREFIX + combatantId] = { ...target, tokenId };
  await OBR.room.setMetadata(update);
  if (previous && previous !== tokenId) await clearTokenLink(previous);
  try {
    await OBR.scene.items.updateItems([tokenId], (items) => {
      for (const item of items) item.metadata[LINK_KEY] = { id: combatantId };
    });
  } catch {
    // Players may not be allowed to edit tokens they don't own; the link still works via room metadata.
  }
}

export async function unlinkToken(combatantId: string): Promise<void> {
  const { combatants } = await getRoomState();
  const c = combatants[combatantId];
  if (!c?.tokenId) return;
  const tokenId = c.tokenId;
  await OBR.room.setMetadata({ [COMBATANT_PREFIX + combatantId]: { ...c, tokenId: undefined } });
  await clearTokenLink(tokenId);
}
