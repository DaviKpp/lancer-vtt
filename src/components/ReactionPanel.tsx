import type { CombatantState, Sheet } from "../lib/types";
import { reactionBlocked, reactionsFor, reactionsThisTurn, type ReactionDef } from "../lib/reactions";
import { useReaction, confirmReaction } from "../obr/actions";
import { useApp } from "./AppContext";
import { Html } from "./Html";

/** The character's reactions ("hand of cards"): uses left, turn limit and a button to use each. */
export function ReactionPanel({
  c,
  sheet,
  editable,
  onOverwatch,
}: {
  c: CombatantState;
  sheet?: Sheet;
  editable: boolean;
  onOverwatch?: () => void;
}) {
  const app = useApp();
  const tk = app.room.encounter?.tk ?? 0;
  const list = reactionsFor(c, sheet);
  const used = reactionsThisTurn(c, tk);
  const perTurn = c.rpt ?? 1;
  const by = { id: app.session.playerId, name: app.session.playerName };

  const use = async (def: ReactionDef) => {
    if (!(await confirmReaction(c, def))) return;
    await useReaction(c, def, by);
    if (def.kind === "overwatch") onOverwatch?.();
  };

  return (
    <div className="reaction-panel">
      <div className="small muted">
        {c.br
          ? "Preparado: sem reações até o fim do seu próximo turno."
          : `Reações neste turno: ${used}/${perTurn}${perTurn > 1 ? " (Gorgon)" : ""} · os usos voltam no início do seu turno.`}
      </div>
      {list.map((def) => {
        const left = Math.max(0, def.max - (c.ru?.[def.key] ?? 0));
        const blocked = reactionBlocked(c, def, tk);
        return (
          <div key={def.key} className={`guide-item ${blocked ? "blocked" : ""}`} title={blocked ?? undefined}>
            <div className="guide-text">
              <span className="action-name">
                {def.name} <span className="badge cost-reaction">Reação</span>
                <span className="badge">
                  {left}/{def.max} uso{def.max > 1 ? "s" : ""}
                </span>
              </span>
              {def.trigger && <Html className="html small" html={`<b>Gatilho:</b> ${def.trigger}`} />}
              {def.detail && <Html className="html small" html={def.detail} />}
              {blocked && <span className="small warn">{blocked}</span>}
            </div>
            {editable && (
              <button className={blocked ? "btn-small ghost" : "btn-small"} onClick={() => void use(def)}>
                {def.kind === "overwatch" ? "Rolar" : "Usar"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
