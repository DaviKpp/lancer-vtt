import { useState } from "react";
import type { CombatantState } from "../lib/types";
import { activeStatuses, derivedStatuses, STATUSES, statusInfo } from "../lib/statuses";
import { patchCombatant } from "../obr/room";

function tip(id: string) {
  const s = statusInfo(id);
  return s ? `${s.name} — ${s.terse}` : id;
}

/** Read-only chips for lists and the encounter tracker. */
export function StatusChips({ c }: { c: CombatantState }) {
  const ids = activeStatuses(c);
  if (!ids.length) return null;
  return (
    <div className="tags">
      {ids.map((id) => (
        <span key={id} className={`tag status status-${statusInfo(id)?.type.toLowerCase() ?? "status"}`} title={tip(id)}>
          {statusInfo(id)?.name ?? id}
        </span>
      ))}
    </div>
  );
}

/** Editor on the sheet: active chips plus a picker with every status and condition. */
export function Conditions({ c, editable }: { c: CombatantState; editable: boolean }) {
  const [open, setOpen] = useState(false);
  const manual = new Set(c.st ?? []);
  const derived = new Set(derivedStatuses(c));
  const toggle = (id: string) => {
    const next = new Set(manual);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    void patchCombatant(c.id, { st: Array.from(next) });
  };
  const active = activeStatuses(c);
  return (
    <div className="conditions">
      <div className="row between">
        <span className="tracker-label">Condições</span>
        {editable && (
          <button className="btn-small ghost" onClick={() => setOpen((o) => !o)}>
            {open ? "Pronto" : "Editar"}
          </button>
        )}
      </div>
      {!open &&
        (active.length ? (
          <div className="tags">
            {active.map((id) => (
              <button
                key={id}
                className={`tag status status-${statusInfo(id)?.type.toLowerCase() ?? "status"}`}
                title={tip(id) + (editable && !derived.has(id) ? "\n\nClique para remover" : "")}
                onClick={() => editable && !derived.has(id) && toggle(id)}
              >
                {statusInfo(id)?.name ?? id}
                {editable && !derived.has(id) ? " ×" : ""}
              </button>
            ))}
          </div>
        ) : (
          <span className="muted small">Nenhuma</span>
        ))}
      {open && (
        <div className="status-picker">
          {(["Condition", "Status"] as const).map((type) => (
            <div key={type}>
              <div className="mount-head">{type === "Condition" ? "Condições" : "Estados"}</div>
              <div className="tags">
                {STATUSES.filter((s) => s.type === type && s.id !== "braced").map((s) => {
                  const on = manual.has(s.id) || derived.has(s.id);
                  return (
                    <button
                      key={s.id}
                      className={`tag status status-${type.toLowerCase()} ${on ? "on" : "off"}`}
                      title={tip(s.id) + (derived.has(s.id) ? "\n\n(Automático: calor na metade da capacidade ou mais)" : "")}
                      disabled={derived.has(s.id)}
                      onClick={() => toggle(s.id)}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="muted small">Passe o mouse sobre uma condição para ver a regra.</p>
        </div>
      )}
    </div>
  );
}
