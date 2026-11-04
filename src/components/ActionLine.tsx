import type { ActionEntry, CombatantState } from "../lib/types";
import { blockedReason, costFromActivation, COST_LABEL } from "../lib/actions";
import { tr } from "../lib/i18n";
import { takeAction, useReaction } from "../obr/actions";
import { Html } from "./Html";
import { useApp } from "./AppContext";

/** One action from a system / feature, with its cost mapped (Ação Rápida, Inteira...) and a "Usar" button. */
export function ActionLine({ a, c, editable, disabled }: { a: ActionEntry; c?: CombatantState; editable?: boolean; disabled?: boolean }) {
  const app = useApp();
  const cost = costFromActivation(a.activation);
  const label = COST_LABEL[cost] || tr(a.activation);
  const blocked = c && cost !== "none" ? blockedReason(c, cost, app.room.encounter?.tk ?? 0) : null;
  return (
    <div className="action">
      <span className="action-name">
        {a.name}
        {label ? <span className={`badge cost-${cost}`}>{label}</span> : null}
        {a.activation && COST_LABEL[cost] && /tech|invade/i.test(a.activation) ? (
          <span className="badge">{tr(a.activation)}</span>
        ) : null}
        {a.frequency ? <span className="badge">{a.frequency}</span> : null}
        {c && editable && !disabled && cost !== "none" && (
          <button
            className={blocked ? "btn-small ghost use-btn" : "btn-small use-btn"}
            title={blocked ?? `Marca ${label} e registra no log`}
            onClick={() => {
              const by = { id: app.session.playerId, name: app.session.playerName };
              if (cost === "reaction") {
                const m = /(\d+)\s*\//.exec(a.frequency ?? "");
                void useReaction(c, { key: `x:${a.name}`, name: a.name, max: m ? Number(m[1]) : 1, kind: "other" }, by);
              } else void takeAction(c, cost, a.name, by);
            }}
          >
            Usar
          </button>
        )}
      </span>
      {a.trigger && <Html html={`<b>Gatilho:</b> ${a.trigger}`} />}
      <Html html={a.detail} />
    </div>
  );
}

/** Badges with the action costs of an item's actions (e.g. a system used as a Quick Action). */
export function CostBadges({ actions }: { actions: ActionEntry[] }) {
  const costs = Array.from(new Set(actions.map((a) => costFromActivation(a.activation)).filter((c) => COST_LABEL[c])));
  if (!costs.length) return null;
  return (
    <>
      {costs.map((c) => (
        <span key={c} className={`badge cost-${c}`}>
          {COST_LABEL[c]}
        </span>
      ))}
    </>
  );
}
