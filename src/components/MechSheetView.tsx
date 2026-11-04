import { useState } from "react";
import type { CombatantState, MechSheet } from "../lib/types";
import { patchCombatant } from "../obr/room";
import { AttackPanel, type AttackSpec } from "./AttackPanel";
import { mechWeaponSpec, systemTechSpec } from "./attackSpecs";
import { Html } from "./Html";
import { LinkControls } from "./LinkControls";
import { Trackers } from "./Trackers";
import { ActionLine, CostBadges } from "./ActionLine";
import { DestroyToggle } from "./DestroyToggle";
import { SkillChecks } from "./SkillChecks";
import { Portrait } from "./Portrait";
import { BarragePanel } from "./BarragePanel";
import { ActionGuide } from "./ActionGuide";
import { TurnTracker } from "./TurnTracker";
import { takeAction } from "../obr/actions";
import { costFromActivation, COST_LABEL } from "../lib/actions";
import { useApp } from "./AppContext";
import { tr } from "../lib/i18n";
import { Conditions } from "./Conditions";
import { rangeText, Section, signed, Stat, Tags } from "./common";

export function MechSheetView({ sheet, c, editable }: { sheet: MechSheet; c: CombatantState; editable: boolean }) {
  const app = useApp();
  const [attack, setAttack] = useState<{ key: string; spec: AttackSpec } | null>(null);
  const [brokenMechImage, setBrokenMechImage] = useState<string>();
  const s = sheet.stats;
  const p = sheet.pilot;


  const panel = (key: string) =>
    attack?.key === key ? <AttackPanel attacker={c} spec={attack.spec} onClose={() => setAttack(null)} /> : null;

  const mechImage = sheet.mech.image !== brokenMechImage ? sheet.mech.image : undefined;
  const pilotLabel = sheet.pilot.callsign || sheet.pilot.name;

  return (
    <div className="sheet">
      <div className="sheet-title">
        {(mechImage || sheet.pilot.image) && (
          <div className="sheet-portraits">
            {mechImage ? (
              <>
                <Portrait src={mechImage} size={84} alt={sheet.mech.name} onBroken={setBrokenMechImage} />
                {sheet.pilot.image && (
                  <span className="pilot-portrait" title={`Piloto: ${pilotLabel}`}>
                    <Portrait src={sheet.pilot.image} size={36} round alt={sheet.pilot.name} />
                  </span>
                )}
              </>
            ) : (
              // No usable mech art: show the pilot as the main portrait instead of a floating badge.
              <span title={`Piloto: ${pilotLabel}`}>
                <Portrait src={sheet.pilot.image} size={84} alt={sheet.pilot.name} />
              </span>
            )}
          </div>
        )}
        <div className="sheet-title-text">
          <h2>{sheet.mech.name}</h2>
          <div className="muted">
            {sheet.mech.manufacturer} {sheet.mech.frameName}
            {sheet.mech.mechtype.length ? ` · ${sheet.mech.mechtype.join("/")}` : ""}
          </div>
          <div className="muted small">
            Piloto: {p.callsign || p.name} · NL{p.level}
            {c.ownerName ? ` · ${c.ownerName}` : ""}
          </div>
        </div>
      </div>

      <Trackers c={c} editable={editable} onPatch={(patch) => patchCombatant(c.id, patch)} />
      <Conditions c={c} editable={editable} />
      <LinkControls c={c} editable={editable} />

      <TurnTracker c={c} editable={editable} />
      <SkillChecks c={c} sheet={sheet} editable={editable} />
      <Section title="Guia de ações" defaultOpen={false}>
        <ActionGuide c={c} sheet={sheet} editable={editable} />
      </Section>

      <Section title="Atributos">
        <div className="stat-grid">
          <Stat label="Tamanho" value={s.size} />
          <Stat label="Armadura" value={s.armor} />
          <Stat label="Evasão" value={s.evasion} />
          <Stat label="Defesa-E" value={s.edef} />
          <Stat label="Velocidade" value={s.speed} />
          <Stat label="Sensores" value={s.sensor} />
          <Stat label="Salvaguarda" value={s.save} />
          <Stat label="Ataque Tech" value={signed(s.techAttack)} />
          <Stat label="Grit / Ataque" value={signed(s.attackBonus)} />
          <Stat label="Cap. Reparo" value={s.repcap} />
          <Stat label="SP" value={s.sp} />
          <Stat label="Bônus Limitado" value={s.limitedBonus} />
        </div>
      </Section>

      <Section title="Montagens e Armas">
        {sheet.mounts.length === 0 && <p className="muted">Nenhuma arma equipada.</p>}
        {editable && sheet.mounts.length > 0 && (
          <button className="btn-small" onClick={() => setAttack({ key: "barrage", spec: { kind: "attack", label: "Rajada", bonus: 0, accuracy: 0 } })}>
            ⌖⌖ Rajada (duas montagens)
          </button>
        )}
        {attack?.key === "barrage" && <BarragePanel c={c} sheet={sheet} onClose={() => setAttack(null)} />}
        {sheet.mounts.map((m, mi) => (
          <div key={mi} className="mount">
            <div className="mount-head row between">
              <span>
                Montagem {tr(m.name)}
                {m.bonuses.length ? <span className="muted small"> · {m.bonuses.join(", ")}</span> : null}
                {m.weapons.every((w) => w.destroyed) && <span className="badge badge-off">Destruída</span>}
              </span>
              {editable && (
                <DestroyToggle
                  c={c}
                  uids={m.weapons.map((w) => w.uid)}
                  destroyed={m.weapons.every((w) => w.destroyed)}
                  label={`Montagem ${tr(m.name)}`}
                />
              )}
            </div>
            {m.weapons.map((w) => (
              <div key={w.uid} className={`card ${w.destroyed ? "destroyed" : ""}`}>
                <div className="card-head">
                  <div>
                    <strong>{w.name}</strong>
                    <div className="muted small">
                      {[tr(w.type), tr(w.mount)].filter(Boolean).join(" · ")}
                      {w.range.length ? ` · ${rangeText(w.range)}` : ""}
                    </div>
                  </div>
                  {editable && !w.destroyed && w.damage.length + w.range.length > 0 && (
                    <button className="btn-small" onClick={() => setAttack({ key: w.uid, spec: mechWeaponSpec(w, sheet) })}>
                      ⌖ Atacar
                    </button>
                  )}
                </div>
                {w.damage.length > 0 && (
                  <div className="dmg-line">
                    {w.damage.map((d, i) => (
                      <span key={i} className={`dmg-chip dmg-${d.type.toLowerCase()}`}>
                        {d.val} {tr(d.type)}
                      </span>
                    ))}
                    {w.accuracy !== 0 && (
                      <span className="muted small">
                        {w.accuracy > 0 ? `+${w.accuracy} Precisão` : `+${-w.accuracy} Dificuldade`}
                      </span>
                    )}
                  </div>
                )}
                <Tags tags={w.tags} />
                <Html html={w.effect} />
                {w.onAttack && <Html html={`<b>Ao atacar:</b> ${w.onAttack}`} />}
                {w.onHit && <Html html={`<b>No acerto:</b> ${w.onHit}`} />}
                {w.onCrit && <Html html={`<b>No crítico:</b> ${w.onCrit}`} />}
                {w.mod && <Html html={`<b>Mod — ${w.mod.name}:</b> ${w.mod.effect ?? ""}`} />}
                {panel(w.uid)}
              </div>
            ))}
          </div>
        ))}
      </Section>

      <Section title="Sistemas">
        {sheet.systems.length === 0 && <p className="muted">Nenhum sistema.</p>}
        {sheet.systems.map((sys) => (
          <div key={sys.uid} className={`card ${sys.destroyed ? "destroyed" : ""}`}>
            <div className="card-head">
              <div>
                <strong>{sys.name}</strong> <CostBadges actions={sys.actions} />
                {sys.destroyed && <span className="badge badge-off">Destruído</span>}
                <div className="muted small">
                  {[tr(sys.type), sys.sp !== undefined ? `${sys.sp} SP` : null, sys.integrated ? "Integrado" : null]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <div className="row gap">
              {editable && <DestroyToggle c={c} uids={[sys.uid]} destroyed={!!sys.destroyed} label={sys.name} />}
              {editable && sys.isTech && !sys.destroyed && (
                <button
                  className="btn-small"
                  onClick={() =>
                    setAttack({ key: sys.uid, spec: systemTechSpec(sys, sheet) })
                  }
                >
                  ⚡ Tech
                </button>
              )}
              </div>
            </div>
            <Tags tags={sys.tags} />
            <Html html={sys.effect} />
            {sys.actions.map((a, i) => (
              <ActionLine key={i} a={a} c={c} editable={editable} disabled={sys.destroyed} />
            ))}
            {panel(sys.uid)}
          </div>
        ))}
      </Section>

      <Section title="Sistema Núcleo">
        {sheet.core ? (
          <div className="card core">
            <strong>{sheet.core.name}</strong>
            {sheet.core.passiveName && (
              <div className="action">
                <span className="action-name">
                  {sheet.core.passiveName} <span className="badge">Passiva</span>
                </span>
                <Html html={sheet.core.passiveEffect} />
              </div>
            )}
            <div className="action">
              <span className="action-name">
                {sheet.core.activeName}{" "}
                <span className={`badge cost-${costFromActivation(sheet.core.activation)}`}>
                  {COST_LABEL[costFromActivation(sheet.core.activation)] || tr(sheet.core.activation ?? "Active")}
                </span>
                {sheet.core.use ? <span className="badge">{tr(sheet.core.use)}</span> : null}
              </span>
              <Html html={sheet.core.activeEffect} />
            </div>
            {editable && (
              <button
                className="btn-primary"
                disabled={!c.core}
                onClick={async () => {
                  await patchCombatant(c.id, { core: false });
                  await takeAction(c, costFromActivation(sheet.core?.activation), `Poder do Núcleo: ${sheet.core?.activeName}`, {
                    id: app.session.playerId,
                    name: app.session.playerName,
                  });
                }}
              >
                {c.core ? `Ativar ${sheet.core.activeName}` : "Poder do Núcleo gasto"}
              </button>
            )}
          </div>
        ) : (
          <p className="muted">Sem dados de sistema núcleo.</p>
        )}
        {sheet.traits.length > 0 && (
          <div className="traits">
            <div className="mount-head">Características do frame</div>
            {sheet.traits.map((t, i) => (
              <div key={i} className="action">
                <span className="action-name">{t.name}</span>
                <Html html={t.description} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Piloto" defaultOpen={false}>
        <div className="pilot-head">
          <strong>{p.name}</strong> “{p.callsign}” · Nível de Licença {p.level} · Grit {signed(p.grit)}
          {p.background && <div className="muted small">Histórico: {p.background}</div>}
          {p.playerName && <div className="muted small">Jogador: {p.playerName}</div>}
        </div>
        <div className="stat-grid">
          <Stat label="Casco" value={p.hase.hull} />
          <Stat label="Agilidade" value={p.hase.agi} />
          <Stat label="Sistemas" value={p.hase.sys} />
          <Stat label="Engenharia" value={p.hase.eng} />
          <Stat label="PV do Piloto" value={p.hp} />
          <Stat label="Armadura" value={p.armor} />
          <Stat label="Evasão" value={p.evasion} />
          <Stat label="Defesa-E" value={p.edef} />
        </div>
        <h4>Gatilhos de perícia</h4>
        <ul className="plain">
          {p.skills.map((sk, i) => (
            <li key={i} title={sk.description}>
              {sk.name} <span className="mono">+{sk.rank * 2}</span>
            </li>
          ))}
        </ul>
        <h4>Talentos</h4>
        {p.talents.map((t, i) => (
          <details key={i} className="talent">
            <summary>
              {t.name} <span className="badge">Grau {t.rank}</span>
            </summary>
            {t.ranks.map((r, j) => (
              <div key={j} className="action">
                <span className="action-name">{r.name}</span>
                <Html html={r.description} />
              </div>
            ))}
          </details>
        ))}
        {p.coreBonuses.length > 0 && (
          <>
            <h4>Bônus de núcleo</h4>
            {p.coreBonuses.map((cb, i) => (
              <details key={i} className="talent">
                <summary>{cb.name}</summary>
                <Html html={cb.effect} />
              </details>
            ))}
          </>
        )}
        {p.licenses.length > 0 && (
          <>
            <h4>Licenças</h4>
            <div className="tags">
              {p.licenses.map((l, i) => (
                <span key={i} className="tag">
                  {l.name} {l.rank}
                </span>
              ))}
            </div>
          </>
        )}
        {p.gear.length > 0 && (
          <>
            <h4>Equipamento do piloto</h4>
            <div className="tags">
              {p.gear.map((g, i) => (
                <span key={i} className="tag">
                  {g}
                </span>
              ))}
            </div>
          </>
        )}
      </Section>

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

