import { useState } from "react";
import type { RollResult } from "../lib/types";
import { mountTargets, systemTargets, type DestroyTarget } from "../lib/destroyed";
import { setDestroyed } from "../obr/destroy";
import { useApp } from "./AppContext";

/**
 * "Trauma de Sistema" on a structure check: the owner (or GM) picks the mount or system
 * that is destroyed. If nothing of that kind is left, the other kind is offered; with
 * nothing at all, the result becomes a Direct Hit (handled at the table).
 */
export function TraumaChooser({ r }: { r: RollResult }) {
  const app = useApp();
  const [done, setDone] = useState<string | null>(null);
  const c = app.room.combatants[r.attackerId];
  const sheet = c ? app.sheetFor(c.id) : undefined;
  if (!r.trauma || !c) return null;
  if (done) return <div className="small roll-applied">✔ Destruído: {done}</div>;
  const allowed = app.isGM || c.owner === app.session.playerId;
  if (!allowed) return null;
  if (!sheet) return <div className="small muted">Ficha não disponível neste dispositivo para escolher o que foi destruído.</div>;

  const mounts = mountTargets(sheet);
  const systems = systemTargets(sheet);
  let options: DestroyTarget[] = r.trauma === "mount" ? mounts : systems;
  let note = "";
  if (!options.length) {
    options = r.trauma === "mount" ? systems : mounts;
    note = r.trauma === "mount" ? "Sem armas restantes: destrua um sistema." : "Sem sistemas restantes: destrua uma montagem.";
  }
  if (!options.length) return <div className="small warn">Nada restante para destruir: vira Acerto Direto.</div>;

  const choose = async (t: DestroyTarget) => {
    await setDestroyed(c.id, t.uids, true, t.label, { id: app.session.playerId, name: app.session.playerName });
    setDone(t.label);
  };

  return (
    <div className="trauma">
      <div className="small">
        <b>Escolha o que foi destruído</b>
        {sheet.kind === "npc" && r.trauma === "mount" ? " (arma)" : ""}:{note ? ` ${note}` : ""}
      </div>
      <div className="quick-attacks">
        {options.map((t) => (
          <button key={t.key} className="btn-small danger" onClick={() => void choose(t)}>
            ✖ {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
