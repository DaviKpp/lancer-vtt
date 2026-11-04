import type { CombatantState, TurnActions } from "../lib/types";
import { quickCap, turnSummary } from "../lib/actions";
import { reactionBlocked } from "../lib/reactions";
import { startTurn } from "../obr/turns";
import { useApp } from "./AppContext";
import { patchCombatant } from "../obr/room";

/** Chips showing what is left this turn; owners / GM can click to correct them. */
export function TurnTracker({ c, editable, compact }: { c: CombatantState; editable: boolean; compact?: boolean }) {
  const t: TurnActions = c.ac ?? {};
  const q = t.q ?? 0;
  const restricted = c.br === 2; // turn after Brace: a single quick action
  const cap = restricted ? 1 : quickCap(t);
  const app = useApp();
  const tk = app.room.encounter?.tk ?? 0;
  const reaction = reactionBlocked(c, undefined, tk);
  const set = (patch: Partial<TurnActions>) => editable && patchCombatant(c.id, { ac: { ...t, ...patch } });

  return (
    <div className={`turn-tracker ${compact ? "compact" : ""}`}>
      <button className={`turn-chip ${t.m || restricted ? "spent" : ""}`} disabled={!editable} onClick={() => set({ m: !t.m })} title="Movimento padrão">
        Movimento
      </button>
      <button
        className={`turn-chip ${q >= cap ? "spent" : ""}`}
        disabled={!editable}
        onClick={() => set({ q: q >= cap ? 0 : q + 1 })}
        title="Ações rápidas usadas (clique para ajustar)"
      >
        Rápida{" "}
        {/* one dot per quick action available this turn: 2 normally, +1 with Overcharge,
            only the Overcharge one after a full action, 1 after Bracing */}
        {Array.from({ length: cap }, (_, i) => (
          <span key={i} className={`dot ${i < q ? "used" : ""}`} />
        ))}
      </button>
      <button
        className={`turn-chip ${t.f || q > 0 || restricted ? "spent" : ""}`}
        disabled={!editable}
        onClick={() => set({ f: !t.f })}
        title="Ação inteira (gasta as duas rápidas)"
      >
        Inteira
      </button>
      <button
        className={`turn-chip ${reaction ? "spent" : ""} ${c.br ? "braced" : ""}`}
        disabled={!editable}
        onClick={() => patchCombatant(c.id, { rx: undefined, br: undefined })}
        title={reaction ? `${reaction} (clique para liberar)` : "Reação disponível neste turno"}
      >
        {c.br ? "Preparado" : "Reação"}
      </button>
      {c.kind === "mech" && (
        <button className={`turn-chip ${t.o || restricted ? "spent" : ""}`} disabled={!editable} onClick={() => set({ o: !t.o })} title="Sobrecarga (1 por turno)">
          Sobrecarga
        </button>
      )}
      {!compact && (
        <div className="row between turn-foot">
          <span className="muted small">{turnSummary(c)}</span>
          {editable && (
            <button
              className="btn-small ghost"
              onClick={() => startTurn(c.id)}
              title="Começa o turno deste personagem: libera movimento e ações e repõe as reações"
            >
              Iniciar turno
            </button>
          )}
        </div>
      )}
    </div>
  );
}
