import type { CombatantState, PilotInfo } from "../lib/types";
import { ActionLine, CostBadges } from "./ActionLine";
import { Html } from "./Html";

/**
 * The pilot's talents, shown with the mech's abilities: the unlocked ranks with their text and,
 * when a rank grants an action (reaction, quick action...), its "Usar" button.
 */
export function TalentAbilities({
  talents,
  c,
  editable,
  compact,
}: {
  talents: PilotInfo["talents"];
  c: CombatantState;
  editable: boolean;
  /** Collapsed list for the encounter's ability summary. */
  compact?: boolean;
}) {
  if (!talents.length) return compact ? null : <p className="muted">Nenhum talento.</p>;
  return (
    <>
      {talents.map((t, i) => {
        const actions = t.ranks.flatMap((r) => r.actions ?? []);
        return (
          <details key={i} className={compact ? "ability feature-talent" : "card talent-card"} open={!compact && actions.length > 0}>
            <summary>
              {compact && <span className="badge">Talento</span>} <strong>{t.name}</strong> <span className="badge">Grau {t.rank}</span>{" "}
              <CostBadges actions={actions} />
            </summary>
            {t.ranks.map((r, j) => (
              <div key={j} className="action">
                <span className="action-name">
                  {r.name} <span className="muted small">(grau {j + 1})</span>
                </span>
                <Html html={r.description} />
                {(r.actions ?? []).map((a, k) => (
                  <ActionLine key={k} a={a} c={c} editable={editable} />
                ))}
              </div>
            ))}
          </details>
        );
      })}
    </>
  );
}
