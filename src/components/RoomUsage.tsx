import { useEffect, useState } from "react";
import OBR, { type Metadata } from "@owlbear-rodeo/sdk";
import { ID } from "../obr/constants";
import { patchCombatants, ROOM_LIMIT, roomBytes } from "../obr/room";
import { useApp } from "./AppContext";

/**
 * How full the room's storage is. Owlbear keeps at most 16 kB for everything in a room, shared with
 * every other extension; past that, changes are refused. Shown to the GM, and to everyone near the limit.
 */
export function RoomUsage() {
  const app = useApp();
  const [meta, setMeta] = useState<Metadata | null>(null);
  useEffect(() => {
    void OBR.room.getMetadata().then(setMeta);
    return OBR.room.onMetadataChange(setMeta);
  }, []);
  if (!meta) return null;
  const total = roomBytes(meta);
  const ours = roomBytes(Object.fromEntries(Object.entries(meta).filter(([k]) => k.startsWith(ID))));
  const others = Math.max(0, total - ours);
  const pct = Math.min(100, (total / ROOM_LIMIT) * 100);
  if (!app.isGM && pct < 85) return null;
  const notes = Object.values(app.room.combatants).filter((c) => c.nts?.length);
  const clearNotes = () =>
    void patchCombatants(Object.fromEntries(notes.map((c) => [c.id, { nts: undefined }])));
  return (
    <div className={`card room-usage ${pct >= 85 ? "danger" : pct >= 70 ? "warn" : ""}`}>
      <div className="row between">
        <strong>Espaço da sala</strong>
        <span className="mono small">
          {(total / 1000).toFixed(1)} / {ROOM_LIMIT / 1000} kB
        </span>
      </div>
      <div className="bar room-bar">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="muted small">
        LANCER {(ours / 1000).toFixed(1)} kB · outras extensões {(others / 1000).toFixed(1)} kB.
        {pct >= 70 && " Perto do limite, o Owlbear recusa mudanças: remova NPCs e lancers fora de uso."}
      </div>
      {app.isGM && notes.length > 0 && (
        <button className="btn-small ghost" onClick={clearNotes}>
          Limpar “Efeitos sofridos” ({notes.length})
        </button>
      )}
    </div>
  );
}
