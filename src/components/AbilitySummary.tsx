import type { CombatantState, Sheet } from "../lib/types";
import { tr } from "../lib/i18n";
import { ActionLine, CostBadges } from "./ActionLine";
import { Html } from "./Html";
import { rangeText, signed, Tags } from "./common";
import { TalentAbilities } from "./TalentAbilities";
import { rechargeTarget } from "../obr/recharge";

const ORDER: Record<string, number> = { weapon: 0, tech: 1, system: 2, reaction: 3, trait: 4 };

/** Compact list of weapons / systems / features, for quick reference from the encounter list. */
export function AbilitySummary({ sheet, c, editable }: { sheet: Sheet; c: CombatantState; editable: boolean }) {
  if (sheet.kind === "npc") {
    const features = [...sheet.features].sort((a, b) => (ORDER[a.type] ?? 9) - (ORDER[b.type] ?? 9));
    return (
      <div className="ability-summary">
        {features.map((f) => (
          <details key={f.uid} className={`ability feature-${f.type}`}>
            <summary>
              <span className="badge">{tr(f.type)}</span> <strong>{f.name}</strong> <CostBadges actions={f.actions} />
              {f.destroyed && <span className="badge badge-off">Destruído</span>}
              {rechargeTarget(f.tags) && (
                <span className={`badge ${c.rc?.[f.uid] !== undefined ? "badge-off" : ""}`}>
                  {c.rc?.[f.uid] !== undefined ? `⏳ Recarregando (${rechargeTarget(f.tags)}+)` : `Recarga ${rechargeTarget(f.tags)}+`}
                </span>
              )}
              <span className="muted small">
                {f.weaponType ? ` · ${tr(f.weaponType)}` : ""}
                {f.range.length ? ` · ${rangeText(f.range)}` : ""}
                {f.type === "weapon" || f.type === "tech" ? ` · ${signed(f.attackBonus)}` : ""}
                {f.damage.length ? ` · ${f.damage.map((d) => `${d.val} ${tr(d.type)}`).join(" + ")}` : ""}
                {f.attacks && f.attacks > 1 ? ` · ${f.attacks}×` : ""}
              </span>
            </summary>
            <Tags tags={f.tags} />
            {f.trigger && <Html html={`<b>Gatilho:</b> ${f.trigger}`} />}
            <Html html={f.effect} />
            {f.actions.map((a, i) => (
              <ActionLine
                key={i}
                a={a}
                c={c}
                editable={editable}
                disabled={f.destroyed}
                recharge={rechargeTarget(f.tags) ? { uid: f.uid, target: rechargeTarget(f.tags)! } : undefined}
              />
            ))}
            {f.onHit && <Html html={`<b>No acerto:</b> ${f.onHit}`} />}
            {f.onCrit && <Html html={`<b>No crítico:</b> ${f.onCrit}`} />}
          </details>
        ))}
      </div>
    );
  }
  return (
    <div className="ability-summary">
      {sheet.mounts.flatMap((m) =>
        m.weapons.map((w) => (
          <details key={w.uid} className="ability feature-weapon">
            <summary>
              <span className="badge">{tr(m.name)}</span> <strong>{w.name}</strong>
              <span className="muted small">
                {` · ${tr(w.type)}`}
                {w.range.length ? ` · ${rangeText(w.range)}` : ""}
                {w.damage.length ? ` · ${w.damage.map((d) => `${d.val} ${tr(d.type)}`).join(" + ")}` : ""}
              </span>
            </summary>
            <Tags tags={w.tags} />
            <Html html={w.effect} />
            {w.onHit && <Html html={`<b>No acerto:</b> ${w.onHit}`} />}
          </details>
        )),
      )}
      {sheet.systems.map((s) => (
        <details key={s.uid} className={`ability ${s.isTech ? "feature-tech" : "feature-system"}`}>
          <summary>
            <span className="badge">Sistema</span> <strong>{s.name}</strong> <CostBadges actions={s.actions} />
            {s.destroyed && <span className="badge badge-off">Destruído</span>}
          </summary>
          <Tags tags={s.tags} />
          <Html html={s.effect} />
          {s.actions.map((a, i) => (
            <ActionLine key={i} a={a} c={c} editable={editable} disabled={s.destroyed} />
          ))}
        </details>
      ))}
      <TalentAbilities talents={sheet.pilot.talents} c={c} editable={editable} compact />
      {sheet.core && (
        <details className="ability feature-system">
          <summary>
            <span className="badge">Núcleo</span> <strong>{sheet.core.activeName}</strong>
            <span className="muted small"> · {c.core ? "disponível" : "gasto"}</span>
          </summary>
          <Html html={sheet.core.activeEffect} />
        </details>
      )}
    </div>
  );
}
