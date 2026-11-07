import { useState } from "react";
import { HitNotes } from "./HitNotes";
import { UsageBadge } from "./UsageBadge";
import type { CombatantState, NpcSheet } from "../lib/types";
import { patchCombatant } from "../obr/room";
import { AttackPanel, type AttackSpec } from "./AttackPanel";
import { npcFeatureSpec } from "./attackSpecs";
import { Html } from "./Html";
import { LinkControls } from "./LinkControls";
import { Trackers } from "./Trackers";
import { ActionLine, CostBadges } from "./ActionLine";
import { DestroyToggle } from "./DestroyToggle";
import { SkillChecks } from "./SkillChecks";
import { Portrait } from "./Portrait";
import { WeaponFxSelect } from "./FxControls";
import { rechargeTarget, toggleRecharge } from "../obr/recharge";
import { ActionGuide } from "./ActionGuide";
import { TurnTracker } from "./TurnTracker";
import { tr } from "../lib/i18n";
import { Conditions } from "./Conditions";
import { SpawnControls } from "./TemplateList";
import { rangeText, Section, signed, Stat, Tags } from "./common";

const ORDER: Record<string, number> = { weapon: 0, tech: 1, system: 2, reaction: 3, trait: 4 };

/** NPC sheet. Without `c` it renders a template (read-only, no trackers or rolls). */
export function NpcSheetView({ sheet, c, editable }: { sheet: NpcSheet; c?: CombatantState; editable: boolean }) {
  const canRoll = editable && !!c;
  const [attack, setAttack] = useState<{ key: string; spec: AttackSpec } | null>(null);
  const s = sheet.stats;
  const features = [...sheet.features].sort((a, b) => (ORDER[a.type] ?? 9) - (ORDER[b.type] ?? 9));


  return (
    <div className="sheet">
      <div className="sheet-title">
        {sheet.image && (
          <div className="sheet-portraits">
            <Portrait src={sheet.image} size={252} alt={sheet.name} />
          </div>
        )}
        <div className="sheet-title-text">
          <h2>{sheet.name}</h2>
          <div className="muted">
            {sheet.className} · Tier {sheet.tier}
            {sheet.role ? ` · ${tr(sheet.role)}` : ""} · {tr(sheet.tag)}
          </div>
          {sheet.templates.length > 0 && <div className="muted small">Templates: {sheet.templates.join(", ")}</div>}
        </div>
      </div>

      {c ? (
        <>
          <Trackers c={c} editable={editable} onPatch={(patch) => patchCombatant(c.id, patch)} />
          <Conditions c={c} editable={editable} />
          <LinkControls c={c} editable={editable} />
          <TurnTracker c={c} editable={editable} />
          <SkillChecks c={c} sheet={sheet} editable={editable} />
          <Section title="Guia de ações" defaultOpen={false}>
            <ActionGuide c={c} sheet={sheet} editable={editable} />
          </Section>
        </>
      ) : (
        <div className="row between card">
          <span className="muted small">Template — adicione cópias a um encontro para acompanhar e rolar por elas.</span>
          <SpawnControls t={sheet} compact />
        </div>
      )}

      <Section title="Atributos">
        <div className="stat-grid">
          <Stat label="Tamanho" value={s.size} />
          <Stat label="Armadura" value={s.armor} />
          <Stat label="Evasão" value={s.evasion} />
          <Stat label="Defesa-E" value={s.edef} />
          <Stat label="Velocidade" value={s.speed} />
          <Stat label="Sensores" value={s.sensor} />
          <Stat label="Salvaguarda" value={s.save} />
          <Stat label="Ativações" value={s.activations} />
          <Stat label="Casco" value={signed(s.hull)} />
          <Stat label="Agilidade" value={signed(s.agi)} />
          <Stat label="Sistemas" value={signed(s.sys)} />
          <Stat label="Engenharia" value={signed(s.eng)} />
        </div>
      </Section>

      <HitNotes c={c} editable={editable} />

      <Section title="Habilidades">
        {features.map((f) => (
          <div key={f.uid} className={`card feature-${f.type} ${f.destroyed ? "destroyed" : ""}`}>
            <div className="card-head">
              <div>
                <strong>{f.name}</strong> <CostBadges actions={f.actions} />
                <RechargeBadge c={c} uid={f.uid} target={rechargeTarget(f.tags)} editable={editable} />
                {f.destroyed && <span className="badge badge-off">Destruído</span>}
                <div className="muted small">
                  <span className="badge">{tr(f.type)}</span>
                  {f.weaponType ? ` ${tr(f.weaponType)}` : ""}
                  {f.range.length ? ` · ${rangeText(f.range)}` : ""}
                  {f.type === "weapon" || f.type === "tech" ? ` · ${signed(f.attackBonus)} para acertar` : ""}
                  {f.accuracy ? ` · ${f.accuracy > 0 ? "+" + f.accuracy + " Prec" : -f.accuracy + " Dif"}` : ""}
                  {f.attacks && f.attacks > 1 ? ` · ${f.attacks} ataques` : ""}
                </div>
              </div>
              <div className="row gap">
                {c && editable && ["weapon", "system", "tech"].includes(f.type) && (
                  <DestroyToggle c={c} uids={[f.uid]} destroyed={!!f.destroyed} label={f.name} />
                )}
                {canRoll && !f.destroyed && (f.type === "weapon" || f.type === "tech") && (
                  <button className="btn-small" onClick={() => setAttack({ key: f.uid, spec: npcFeatureSpec(f, sheet) })}>
                    {f.type === "tech" ? "⚡ Tech" : "⌖ Atacar"}
                  </button>
                )}
              </div>
            </div>
            {canRoll && !f.destroyed && f.type === "weapon" && <WeaponFxSelect spec={npcFeatureSpec(f, sheet)} />}
            {f.damage.length > 0 && (
              <div className="dmg-line">
                {f.damage.map((d, i) => (
                  <span key={i} className={`dmg-chip dmg-${d.type.toLowerCase()}`}>
                    {d.val} {tr(d.type)}
                  </span>
                ))}
              </div>
            )}
            <Tags tags={f.tags} />
            <UsageBadge c={c} tags={f.tags} uid={f.uid} editable={editable} />
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
            {c && attack?.key === f.uid && <AttackPanel attacker={c} spec={attack.spec} onClose={() => setAttack(null)} />}
          </div>
        ))}
      </Section>

      {sheet.description && (
        <Section title="Descrição" defaultOpen={false}>
          <Html html={sheet.description} />
        </Section>
      )}
      {sheet.warnings.length > 0 && (
        <Section title={`Notas da importação (${sheet.warnings.length})`} defaultOpen={false}>
          <ul className="plain small muted">
            {sheet.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/** "Recarga 5+" on a feature; "⏳ Recarregando" after it's used. The GM can click to fix it by hand. */
function RechargeBadge({ c, uid, target, editable }: { c?: CombatantState; uid: string; target?: number; editable: boolean }) {
  if (!target) return null;
  const waiting = c?.rc?.[uid] !== undefined;
  const label = waiting ? `⏳ Recarregando (${target}+)` : `Recarga ${target}+`;
  if (!c || !editable) return <span className={`badge ${waiting ? "badge-off" : ""}`}>{label}</span>;
  return (
    <button
      className={`badge badge-btn ${waiting ? "badge-off" : ""}`}
      title={
        waiting
          ? "Usada: volta quando o 1d6 do início do turno do NPC tirar " + target + "+ (clique para marcar como recarregada)"
          : "Disponível (clique para marcar como usada)"
      }
      onClick={() => void toggleRecharge(c.id, { uid, target })}
    >
      {label}
    </button>
  );
}
