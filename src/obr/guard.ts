// Safety net for the room state. If a combatant vanishes from the room without anyone removing it
// (a write refused by Owlbear, a conflict between clients...), the encounter breaks and its sheet goes
// unavailable. The background page remembers the last state of every combatant it saw in this session
// and puts a vanished one back — same numbers, same place in the encounter — unless it was removed on
// purpose (removals are announced on REMOVED_CHANNEL).
import OBR from "@owlbear-rodeo/sdk";
import type { CombatantState } from "../lib/types";
import { COMBATANT_PREFIX } from "./constants";
import { getRoomState, readRoomState, REMOVED_CHANNEL, setEncounter, writeRoom } from "./room";
import { pushToast } from "./toast";

/** Wait before restoring: the removal notice can arrive a little after the room change. */
const GRACE = 3000;

/** Background page: watches the room and restores combatants that vanished by accident. */
export function startGuard() {
  OBR.onReady(async () => {
    const last = new Map<string, CombatantState>(); // last state seen of each combatant
    const inEncounter = new Set<string>(); // who was in the encounter, last time we looked
    const removed = new Map<string, number>(); // removed on purpose -> when
    const pending = new Set<string>();

    OBR.broadcast.onMessage(REMOVED_CHANNEL, (e) => {
      const ids = (e.data as { ids?: string[] })?.ids ?? [];
      for (const id of ids) {
        removed.set(id, Date.now());
        last.delete(id);
        inEncounter.delete(id);
      }
    });

    /** One client restores: the GM if one is in the room, else the combatant's owner. */
    const shouldRestore = async (c: CombatantState) => {
      const [role, me, party] = await Promise.all([OBR.player.getRole(), OBR.player.getId(), OBR.party.getPlayers()]);
      if (role === "GM") return true;
      return c.owner === me && !party.some((p) => p.role === "GM");
    };

    const check = async (id: string) => {
      pending.delete(id);
      const c = last.get(id);
      if (!c || removed.has(id)) return;
      const { combatants, encounter } = await getRoomState();
      if (combatants[id]) return; // it came back by itself
      if (!(await shouldRestore(c))) return;
      try {
        await writeRoom({ [COMBATANT_PREFIX + id]: c });
        if (encounter && inEncounter.has(id) && !encounter.combatants.includes(id)) {
          await setEncounter({ ...encounter, combatants: [...encounter.combatants, id] });
        }
        pushToast(`${c.name} tinha sumido da sala e foi restaurado.`, "WARNING");
      } catch {
        // room full: writeRoom already told the player
      }
    };

    const onChange = (metadata: Record<string, unknown>) => {
      const { combatants, encounter } = readRoomState(metadata);
      // the encounter's member list vanishing with a combatant is part of the same accident
      if (encounter) {
        for (const id of encounter.combatants) inEncounter.add(id);
        for (const id of Array.from(inEncounter)) if (!encounter.combatants.includes(id) && combatants[id]) inEncounter.delete(id);
      } else inEncounter.clear();
      for (const c of Object.values(combatants)) last.set(c.id, c);
      for (const id of Array.from(last.keys())) {
        if (combatants[id] || pending.has(id) || removed.has(id)) continue;
        pending.add(id);
        setTimeout(() => void check(id), GRACE);
      }
      // forget old removal notices
      for (const [id, at] of Array.from(removed)) if (Date.now() - at > 10 * 60_000) removed.delete(id);
    };

    onChange(await OBR.room.getMetadata());
    OBR.room.onMetadataChange(onChange);
  });
}
