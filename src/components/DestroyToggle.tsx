import type { CombatantState } from "../lib/types";
import { setDestroyed } from "../obr/destroy";
import { useApp } from "./AppContext";

/** "Destruir" / "Reparar" for a mount (all its weapons), a system or an NPC feature. */
export function DestroyToggle({ c, uids, destroyed, label }: { c: CombatantState; uids: string[]; destroyed: boolean; label: string }) {
  const app = useApp();
  return (
    <button
      className={`btn-small ghost ${destroyed ? "" : "danger"}`}
      title={destroyed ? "Marcar como reparado" : "Marcar como destruído (ex.: Trauma de Sistema)"}
      onClick={() => {
        if (!destroyed && !window.confirm(`Marcar ${label} como destruído?`)) return;
        void setDestroyed(c.id, uids, !destroyed, label, { id: app.session.playerId, name: app.session.playerName });
      }}
    >
      {destroyed ? "Reparar" : "Destruir"}
    </button>
  );
}
