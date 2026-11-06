import { useState } from "react";
import type { CombatantState, MechSheet } from "../lib/types";
import { tr } from "../lib/i18n";
import { AttackPanel, type AttackSpec } from "./AttackPanel";
import { pilotWeaponSpec } from "./attackSpecs";
import { WeaponFxSelect } from "./FxControls";
import { Html } from "./Html";
import { patchCombatant } from "../obr/room";
import { mount } from "../obr/mount";
import { Trackers } from "./Trackers";
import { Conditions } from "./Conditions";
import { LinkControls } from "./LinkControls";
import { SkillChecks } from "./SkillChecks";
import { TurnDot } from "./TurnDot";
import { Portrait } from "./Portrait";
import { TalentAbilities } from "./TalentAbilities";
import { rangeText, Section, signed, Stat, Tags } from "./common";
import { useApp } from "./AppContext";

/** Sheet of a pilot outside their mech (created by "Desmontar"). */
export function PilotSheetView({ c, sheet, editable }: { c: CombatantState; sheet: MechSheet; editable: boolean }) {
  const app = useApp();
  const p = sheet.pilot;
  const mech = c.pm ? app.room.combatants[c.pm] : undefined;
  const by = { id: app.session.playerId, name: app.session.playerName };
  const [attack, setAttack] = useState<{ key: string; spec: AttackSpec } | null>(null);
  const weapons = p.weapons ?? [];

  return (
    <div className="sheet">
      <div className="sheet-title">
        {p.image && (
          <div className="sheet-portraits">
            <Portrait src={p.image} size={160} alt={p.name} />
          </div>
        )}
        <div className="sheet-title-text">
          <h2>
            <TurnDot c={c} /> {c.name}
          </h2>
          <div className="muted">
            {p.name} · Piloto · NL{p.level} · Grit {signed(p.grit)}
          </div>
          <div className="muted small">
            Fora do mech {mech ? mech.name : ""}
            {c.ownerName ? ` · ${c.ownerName}` : ""}
          </div>
        </div>
      </div>

      {editable && mech && (
        <div className="row gap wrap">
          <button className="btn-small" onClick={() => void mount(mech, by)} title="Ação Inteira: volta para o mech">
            🤖 Montar em {mech.name}
          </button>
          <button className="btn-small ghost" onClick={() => app.openSheet(mech.id)}>
            Abrir ficha do mech
          </button>
        </div>
      )}

      <Trackers c={c} editable={editable} onPatch={(patch) => patchCombatant(c.id, patch)} />
      <Conditions c={c} editable={editable} />
      <LinkControls c={c} editable={editable} />
      {/* on foot, a pilot saves with 1d20 + Grit (Hull / Agility / ... are the mech's) */}
      <div className="muted small">Salvaguardas do piloto (1d20 + Grit)</div>
      <SkillChecks
        c={c}
        editable={editable}
        values={{ hull: p.grit, agi: p.grit, sys: p.grit, eng: p.grit }}
        savesOnly
        bonusLabel="Grit"
      />

      <Section title="Atributos do piloto">
        <div className="stat-grid">
          <Stat label="PV" value={`${c.hp}/${c.maxHp}`} />
          <Stat label="Armadura" value={c.armor} />
          <Stat label="Evasão" value={c.evasion} />
          <Stat label="Defesa-E" value={c.edef} />
          <Stat label="Velocidade" value={p.speed} />
          <Stat label="Grit" value={signed(p.grit)} />
          <Stat label="Casco" value={p.hase.hull} />
          <Stat label="Agilidade" value={p.hase.agi} />
          <Stat label="Sistemas" value={p.hase.sys} />
          <Stat label="Engenharia" value={p.hase.eng} />
        </div>
      </Section>

      <Section title={`Armas do piloto (${weapons.length})`}>
        {weapons.length === 0 && (
          <p className="muted small">
            {p.weapons
              ? "Nenhuma arma de piloto no equipamento."
              : "Importe o piloto de novo do COMP/CON para trazer as armas de piloto."}
          </p>
        )}
        {weapons.map((w) => (
          <div key={w.uid} className="card">
            <div className="card-head">
              <div>
                <strong>{w.name}</strong>
                <div className="muted small">
                  {w.isMelee ? "Corpo a corpo" : "À distância"}
                  {w.range.length ? ` · ${rangeText(w.range)}` : ""}
                  {w.damage.length ? ` · ${w.damage.map((d) => `${d.val} ${tr(d.type)}`).join(" + ")}` : ""}
                  {` · ${signed(p.grit)} (Grit)`}
                </div>
              </div>
              {editable && (
                <button
                  className="btn-small"
                  title="Lutar (Ação Inteira): um ataque com esta arma de piloto"
                  onClick={() => setAttack(attack?.key === w.uid ? null : { key: w.uid, spec: pilotWeaponSpec(w, sheet) })}
                >
                  ⌖ Atacar
                </button>
              )}
            </div>
            {editable && <WeaponFxSelect spec={pilotWeaponSpec(w, sheet)} />}
            <Tags tags={w.tags} />
            {w.effect && <Html html={w.effect} />}
            {w.onHit && <Html html={`<b>No acerto:</b> ${w.onHit}`} />}
            {attack?.key === w.uid && <AttackPanel attacker={c} spec={attack.spec} onClose={() => setAttack(null)} />}
          </div>
        ))}
      </Section>

      <Section title="Gatilhos de perícia">
        <ul className="plain">
          {p.skills.map((sk, i) => (
            <li key={i} title={sk.description}>
              {sk.name} <span className="mono">+{sk.rank * 2}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`Talentos (${p.talents.length})`} defaultOpen={false}>
        <TalentAbilities talents={p.talents} c={c} editable={editable} />
      </Section>

      {p.gear.length > 0 && (
        <Section title="Equipamento do piloto">
          <div className="tags">
            {p.gear.map((g, i) => (
              <span key={i} className="tag">
                {g}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
