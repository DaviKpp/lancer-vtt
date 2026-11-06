import { useState } from "react";
import type { CombatantState, RollResult, Sheet } from "../lib/types";
import { rollSkill, skillModifiers, skillValues, SKILL_LABEL, type SkillStat } from "../obr/skill";
import { signed } from "./common";
import { useApp } from "./AppContext";
import { RollCard } from "./RollLogView";

const STATS: SkillStat[] = ["hull", "agi", "sys", "eng"];

/**
 * The four mech skills, highlighted, each one rolls a check or save on click.
 * `values` overrides the bonuses (a pilot on foot saves with Grit); `savesOnly` hides checks.
 */
export function SkillChecks({
  c,
  sheet,
  editable,
  values: given,
  savesOnly,
  bonusLabel,
}: {
  c: CombatantState;
  sheet?: Sheet;
  editable: boolean;
  values?: Record<SkillStat, number>;
  savesOnly?: boolean;
  /** Shown next to the bonus in the roll panel, e.g. "Grit". */
  bonusLabel?: string;
}) {
  const app = useApp();
  const values = given ?? skillValues(sheet);
  const [stat, setStat] = useState<SkillStat | null>(null);
  const [kind, setKind] = useState<"check" | "save">(savesOnly ? "save" : "check");
  const [target, setTarget] = useState(10);
  const [acc, setAcc] = useState(0);
  const [diff, setDiff] = useState(0);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<RollResult | null>(null);
  if (!values) return null;

  const open = (s: SkillStat) => {
    setStat(stat === s ? null : s);
    setResult(null);
  };
  const auto = stat ? skillModifiers(c, stat) : { mods: [] };

  return (
    <div className="skill-checks">
      <div className="skill-row">
        {STATS.map((s) => (
          <button
            key={s}
            className={`skill-btn ${stat === s ? "on" : ""}`}
            disabled={!editable}
            onClick={() => open(s)}
            title={savesOnly ? `Salvaguarda de ${SKILL_LABEL[s]}` : `Teste / salvaguarda de ${SKILL_LABEL[s]}`}
          >
            <span className="skill-name">{SKILL_LABEL[s]}</span>
            <span className="skill-val">{signed(values[s])}</span>
          </button>
        ))}
      </div>
      {stat && editable && (
        <div className="attack-panel">
          <div className="attack-head">
            <strong>
              {kind === "save" ? "Salvaguarda" : "Teste"} de {SKILL_LABEL[stat]} ({signed(values[stat])}
              {bonusLabel ? ` ${bonusLabel}` : ""})
            </strong>
            <button className="icon-btn" onClick={() => setStat(null)} aria-label="Fechar">
              ×
            </button>
          </div>
          <div className="form-grid">
            {!savesOnly && (
              <>
                <label>Tipo</label>
                <div className="row gap">
                  <label className="check">
                    <input type="radio" checked={kind === "check"} onChange={() => (setKind("check"), setTarget(10))} /> Teste
                  </label>
                  <label className="check">
                    <input type="radio" checked={kind === "save"} onChange={() => setKind("save")} /> Salvaguarda
                  </label>
                </div>
              </>
            )}
            <label>{kind === "save" ? "Alvo (Salv.)" : "Dificuldade"}</label>
            <input className="num-input" type="number" value={target} onChange={(e) => setTarget(Number(e.target.value) || 0)} />
            <label>Motivo</label>
            <input placeholder="ex.: Concussion Missiles" value={reason} onChange={(e) => setReason(e.target.value)} />
            <label>Automático</label>
            <div className="auto-mods">
              {auto.mods.map((m, i) => (
                <span key={i} className="mod-chip diff">
                  {m.label} +1 Dif
                </span>
              ))}
              {auto.autoFail && <span className="mod-chip diff">{auto.autoFail}</span>}
              {!auto.mods.length && !auto.autoFail && <span className="muted small">nenhum</span>}
            </div>
            <label>+ Precisão</label>
            <Counter value={acc} onChange={setAcc} />
            <label>+ Dificuldade</label>
            <Counter value={diff} onChange={setDiff} />
          </div>
          <button
            className="btn-primary wide"
            onClick={async () =>
              setResult(
                await rollSkill(c, stat, values[stat], {
                  kind,
                  target,
                  manual: acc - diff,
                  reason: reason.trim() || undefined,
                  by: { id: app.session.playerId, name: app.session.playerName },
                }),
              )
            }
          >
            Rolar {kind === "save" ? "salvaguarda" : "teste"}
          </button>
          {result && <RollCard r={result} />}
        </div>
      )}
    </div>
  );
}

function Counter({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <button className="icon-btn" onClick={() => onChange(Math.max(0, value - 1))}>
        −
      </button>
      <span className="num">{value}</span>
      <button className="icon-btn" onClick={() => onChange(Math.min(9, value + 1))}>
        +
      </button>
    </div>
  );
}
