import { useEffect, useState, useSyncExternalStore } from "react";
import OBR, { type Player, type Theme } from "@owlbear-rodeo/sdk";
import { readRoomState, type RoomState } from "./room";
import { sheetStore } from "./sheets";
import { rollLog } from "./rolls";
import { templateStore } from "./templates";

export interface ObrSession {
  ready: boolean;
  role: "GM" | "PLAYER";
  playerId: string;
  playerName: string;
  roomId: string;
}

/** Waits for OBR, then tracks the local player's role/name. */
export function useObrSession(): ObrSession {
  const [session, setSession] = useState<ObrSession>({
    ready: false,
    role: "PLAYER",
    playerId: "",
    playerName: "",
    roomId: "",
  });
  useEffect(() => {
    let unsub: (() => void) | undefined;
    const init = async () => {
      const [role, playerId, playerName] = await Promise.all([
        OBR.player.getRole(),
        OBR.player.getId(),
        OBR.player.getName(),
      ]);
      const roomId = OBR.room.id;
      sheetStore.start(roomId, { playerId, role });
      rollLog.start(roomId);
      setSession({ ready: true, role, playerId, playerName, roomId });
      unsub = OBR.player.onChange((p: Player) => {
        sheetStore.setIdentity({ playerId: p.id, role: p.role });
        setSession((s) => ({ ...s, role: p.role, playerName: p.name, playerId: p.id }));
      });
    };
    OBR.onReady(() => void init());
    return () => unsub?.();
  }, []);
  return session;
}

export function useRoomState(ready: boolean): RoomState & { loaded: boolean } {
  const [state, setState] = useState<RoomState & { loaded: boolean }>({ combatants: {}, encounter: null, loaded: false });
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    OBR.room.getMetadata().then((m) => alive && setState({ ...readRoomState(m), loaded: true }));
    const unsub = OBR.room.onMetadataChange((m) => setState({ ...readRoomState(m), loaded: true }));
    return () => {
      alive = false;
      unsub();
    };
  }, [ready]);
  // Keep the sheet cache in step with the room — but only once the real room data has
  // arrived, otherwise the initial empty state would look like "everything was deleted".
  useEffect(() => {
    if (ready && state.loaded) sheetStore.syncWithRoom(state.combatants);
  }, [ready, state.loaded, state.combatants]);
  return state;
}

export function useSheets() {
  return useSyncExternalStore(
    (fn) => sheetStore.subscribe(fn),
    () => sheetStore.all(),
  );
}

export function useRollLog() {
  return useSyncExternalStore(
    (fn) => rollLog.subscribe(fn),
    () => rollLog.list(),
  );
}

export function useParty(ready: boolean): Player[] {
  const [players, setPlayers] = useState<Player[]>([]);
  useEffect(() => {
    if (!ready) return;
    OBR.party.getPlayers().then(setPlayers);
    return OBR.party.onChange(setPlayers);
  }, [ready]);
  return players;
}

/** Mirrors the Owlbear theme into CSS variables so the UI matches light/dark mode. */
export function useObrTheme(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const apply = (t: Theme) => {
      const root = document.documentElement;
      root.dataset.mode = t.mode.toLowerCase();
      root.style.setProperty("--obr-primary", t.primary.main);
      root.style.setProperty("--obr-primary-contrast", t.primary.contrastText);
      root.style.setProperty("--obr-secondary", t.secondary.main);
      root.style.setProperty("--obr-bg", t.background.default);
      root.style.setProperty("--obr-paper", t.background.paper);
      root.style.setProperty("--obr-text", t.text.primary);
      root.style.setProperty("--obr-text-2", t.text.secondary);
      root.style.setProperty("--obr-text-disabled", t.text.disabled);
    };
    OBR.theme.getTheme().then(apply);
    return OBR.theme.onChange(apply);
  }, [ready]);
}

export function useSceneReady(ready: boolean): boolean {
  const [sceneReady, setSceneReady] = useState(false);
  useEffect(() => {
    if (!ready) return;
    OBR.scene.isReady().then(setSceneReady);
    return OBR.scene.onReadyChange(setSceneReady);
  }, [ready]);
  return sceneReady;
}

export function useTemplates() {
  return useSyncExternalStore(
    (fn) => templateStore.subscribe(fn),
    () => templateStore.list(),
  );
}
