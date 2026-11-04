import { createContext, useContext } from "react";
import type { Player } from "@owlbear-rodeo/sdk";
import type { CombatantState, Sheet } from "../lib/types";
import type { ObrSession } from "../obr/hooks";
import type { RoomState } from "../obr/room";

export interface AppValue {
  session: ObrSession;
  room: RoomState;
  sheets: ReadonlyMap<string, Sheet>;
  /** Local sheet, or an NPC instance rebuilt from its template. */
  sheetFor: (id: string) => Sheet | undefined;
  sceneReady: boolean;
  party: Player[];
  isGM: boolean;
  /** Possible attack targets. Players only get combatants that are in the encounter or on the map. */
  targetsFor: (attackerId: string) => CombatantState[];
  openSheet: (id: string | null) => void;
}

export const AppContext = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const v = useContext(AppContext);
  if (!v) throw new Error("AppContext missing");
  return v;
}

export function computeTargets(room: RoomState, isGM: boolean, attackerId: string): CombatantState[] {
  const all = Object.values(room.combatants).filter((c) => c.id !== attackerId);
  let list: CombatantState[];
  if (room.encounter && room.encounter.combatants.length) {
    list = room.encounter.combatants.map((id) => room.combatants[id]).filter((c): c is CombatantState => !!c && c.id !== attackerId);
  } else if (isGM) {
    list = all;
  } else {
    list = all.filter((c) => !!c.tokenId);
  }
  // the opposing side first: lancers target NPCs, NPCs target lancers
  const enemy = room.combatants[attackerId]?.kind === "npc" ? "mech" : "npc";
  return list.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === enemy ? -1 : 1));
}
