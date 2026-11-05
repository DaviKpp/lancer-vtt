import type { CombatantState } from "../lib/types";
import { removeCombatant, setEncounter } from "../obr/room";
import { sheetStore } from "../obr/sheets";
import { useApp } from "./AppContext";
import { StatusChips } from "./Conditions";
import { Portrait } from "./Portrait";
import { imageFor } from "../lib/images";
import { notify } from "../obr/toast";

export function MiniBars({ c }: { c: CombatantState }) {
  const pct = (v: number, m: number) => `${Math.max(0, Math.min(100, (v / Math.max(m, 1)) * 100))}%`;
  return (
    <div className="mini">
      <div className="mini-row" title={`PV ${c.hp}/${c.maxHp}`}>
        <span>PV</span>
        <div className="bar bar-hp">
          <div className="bar-fill" style={{ width: pct(c.hp, c.maxHp) }} />
        </div>
        <span className="mono">
          {c.hp}/{c.maxHp}
          {c.os ? ` +${c.os}` : ""}
        </span>
      </div>
      <div className="mini-row" title={`Calor ${c.heat}/${c.heatcap}`}>
        <span>CL</span>
        <div className="bar bar-heat">
          <div className="bar-fill" style={{ width: pct(c.heat, c.heatcap) }} />
        </div>
        <span className="mono">
          {c.heat}/{c.heatcap}
        </span>
      </div>
      <div className="mini-pips mono">
        Estrutura {c.structure}/{c.maxStructure} · Estresse {c.stress}/{c.maxStress}
        {c.burn ? ` · 🔥${c.burn}` : ""}
      </div>
    </div>
  );
}

export function CombatantCard({ c, compact }: { c: CombatantState; compact?: boolean }) {
  const app = useApp();
  const sheet = app.sheets.get(c.id);
  const inEncounter = app.room.encounter?.combatants.includes(c.id);
  const canEdit = app.isGM || c.owner === app.session.playerId;

  const remove = async () => {
    if (!window.confirm(`Remover ${c.name} da sala?`)) return;
    await removeCombatant(c.id);
    sheetStore.remove(c.id);
  };


  const addToEncounter = async () => {
    const enc = app.room.encounter;
    if (!enc) return;
    await setEncounter({ ...enc, combatants: [...enc.combatants, c.id] });
  };

  return (
    <div className={`combatant-card kind-${c.kind}`}>
      <button className="combatant-main" onClick={() => app.openSheet(c.id)}>
        <div className="combatant-name">
          <Portrait src={imageFor(c, sheet)} size={84} />
          <strong>{c.name}</strong>
          {c.tokenId && <span className="badge" title="Vinculado a um token">⛓</span>}
          {inEncounter && <span className="badge">No encontro</span>}
        </div>
        <div className="muted small">
          {c.sub}
          {app.isGM && c.kind === "mech" && c.ownerName ? ` · ${c.ownerName}` : ""}
          {!sheet && " · carregando ficha…"}
        </div>
        {!compact && <MiniBars c={c} />}
        <StatusChips c={c} />
      </button>
      {canEdit && !compact && (
        <div className="card-actions">
          {app.isGM && app.room.encounter && !inEncounter && (
            <button className="btn-small" onClick={addToEncounter}>
              + Encontro
            </button>
          )}
          <button className="btn-small ghost danger" onClick={remove}>
            Remover
          </button>
        </div>
      )}
    </div>
  );
}

export function CombatantList({ list, empty }: { list: CombatantState[]; empty: string }) {
  if (!list.length) return <p className="muted">{empty}</p>;
  return (
    <div className="stack">
      {list.map((c) => (
        <CombatantCard key={c.id} c={c} />
      ))}
    </div>
  );
}

export async function notifyMissingSheet(name: string) {
  await notify(`A ficha de ${name} ainda não está neste dispositivo — aguardando o dono ficar online.`, "INFO");
}
