import { useEffect, useState } from "react";
import type { CombatantState } from "../lib/types";
import { applyDamage, applyHeat, fullRepair } from "../lib/rules";
import { clamp } from "../lib/util";
import { patchWithChecks } from "../obr/checks";
import { announce, publicLog } from "../obr/announce";
import { useApp } from "./AppContext";

type Key = "hp" | "os" | "heat" | "structure" | "stress" | "burn" | "repairs";
type MaxKey = "maxHp" | "heatcap" | "maxStructure" | "maxStress" | "maxRepairs";

interface Row {
  key: Key;
  label: string;
  max?: MaxKey;
  bar?: "hp" | "heat";
  pips?: boolean;
}

const ROWS: Row[] = [
  { key: "hp", label: "PV", max: "maxHp", bar: "hp" },
  { key: "os", label: "Sobrescudo" },
  { key: "heat", label: "Calor", max: "heatcap", bar: "heat" },
  { key: "structure", label: "Estrutura", max: "maxStructure", pips: true },
  { key: "stress", label: "Estresse", max: "maxStress", pips: true },
  { key: "burn", label: "Queimadura" },
  { key: "repairs", label: "Reparos", max: "maxRepairs" },
];

export function Trackers({
  c,
  editable,
  onPatch,
}: {
  c: CombatantState;
  editable: boolean;
  onPatch: (patch: Partial<CombatantState>) => void;
}) {
  const [editMax, setEditMax] = useState(false);
  const app = useApp();
  // damage that marks structure/stress triggers the structure / overheating check
  const checked = (patch: Partial<CombatantState>) =>
    void patchWithChecks(c, patch, { id: app.session.playerId, name: app.session.playerName });
  const rows = ROWS.filter((r) => c.kind === "mech" || r.key !== "repairs");

  const step = (r: Row, delta: number) => {
    const max = r.max ? (c[r.max] as number) : 999;
    const next = clamp((c[r.key] as number) + delta, 0, r.key === "heat" ? max + 99 : max);
    if (r.key === "heat" && next > c.heatcap && c.heatcap > 0) {
      const out = applyHeat(c, delta);
      checked(out.patch);
      void announce(out.log.join(" · "), "WARNING", { subject: c, publicMessage: publicLog(out.log) });
      return;
    }
    if ((r.key === "structure" || r.key === "stress") && delta < 0) checked({ [r.key]: next });
    else onPatch({ [r.key]: next });
  };

  return (
    <div className="trackers">
      {rows.map((r) => {
        const value = c[r.key] as number;
        const max = r.max ? (c[r.max] as number) : undefined;
        return (
          <div key={r.key} className={`tracker tracker-${r.key}`}>
            <span className="tracker-label">{r.label}</span>
            <div className="tracker-body">
              {r.bar && max ? (
                <div className={`bar bar-${r.bar}`}>
                  <div className="bar-fill" style={{ width: `${clamp((value / Math.max(max, 1)) * 100, 0, 100)}%` }} />
                </div>
              ) : null}
              {r.pips && max ? (
                <div className="pips">
                  {Array.from({ length: max }, (_, i) => (
                    <span key={i} className={`pip ${i < value ? "on" : ""}`} />
                  ))}
                </div>
              ) : null}
            </div>
            <div className="stepper">
              {editable && (
                <button className="icon-btn" onClick={() => step(r, -1)} aria-label={`Diminuir ${r.label}`}>
                  −
                </button>
              )}
              {editable ? (
                <NumberField value={value} onCommit={(v) => onPatch({ [r.key]: v })} />
              ) : (
                <span className="num">{value}</span>
              )}
              {max !== undefined &&
                (editMax && editable && r.max ? (
                  <>
                    <span className="slash">/</span>
                    <NumberField value={max} onCommit={(v) => onPatch({ [r.max as MaxKey]: v })} />
                  </>
                ) : (
                  <span className="max">/ {max}</span>
                ))}
              {editable && (
                <button className="icon-btn" onClick={() => step(r, 1)} aria-label={`Aumentar ${r.label}`}>
                  +
                </button>
              )}
            </div>
          </div>
        );
      })}
      {c.kind === "mech" && (
        <div className="tracker">
          <span className="tracker-label">Poder do Núcleo</span>
          <div className="tracker-body">
            <span className={`badge ${c.core ? "badge-ok" : "badge-off"}`}>{c.core ? "DISPONÍVEL" : "GASTO"}</span>
          </div>
          {editable && (
            <button className="btn-small" onClick={() => onPatch({ core: !c.core })}>
              {c.core ? "Usar" : "Restaurar"}
            </button>
          )}
        </div>
      )}
      {editable && (
        <div className="tracker-tools">
          <DamageInput c={c} onPatch={checked} />
          <div className="row gap">
            <button className="btn-small ghost" onClick={() => setEditMax((v) => !v)}>
              {editMax ? "Concluir edição" : "Editar máximos"}
            </button>
            <button
              className="btn-small ghost"
              onClick={() => {
                if (confirm(`Reparo total em ${c.name}? (PV, calor, estrutura, estresse, queimadura, reparos)`)) onPatch(fullRepair(c));
              }}
            >
              Reparo total
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const DAMAGE_TYPES = ["Kinetic", "Energy", "Explosive", "Burn", "Heat", "Variable"];
const DAMAGE_LABEL: Record<string, string> = {
  Kinetic: "Cinético",
  Energy: "Energia",
  Explosive: "Explosivo",
  Burn: "Queimadura",
  Heat: "Calor",
  Variable: "Variável",
};

export function DamageInput({ c, onPatch }: { c: CombatantState; onPatch: (p: Partial<CombatantState>) => void }) {
  const [amount, setAmount] = useState(0);
  const [type, setType] = useState("Kinetic");
  const [ap, setAp] = useState(false);
  const [resist, setResist] = useState(false);
  return (
    <div className="damage-input">
      <span className="tracker-label">Receber dano</span>
      <input className="num-input" type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
      <select value={type} onChange={(e) => setType(e.target.value)}>
        {DAMAGE_TYPES.map((t) => (
          <option key={t} value={t}>
            {DAMAGE_LABEL[t]}
          </option>
        ))}
      </select>
      <label className="check">
        <input type="checkbox" checked={ap} onChange={(e) => setAp(e.target.checked)} /> AP
      </label>
      <label className="check" title="Resistência reduz o dano pela metade">
        <input type="checkbox" checked={resist} onChange={(e) => setResist(e.target.checked)} /> Resist.
      </label>
      <button
        className="btn-small"
        disabled={amount <= 0}
        onClick={() => {
          const out = applyDamage(c, amount, { ap, type, halve: resist });
          // Burn also gets marked on the sheet (it hurts again at the end of each turn).
          onPatch(type === "Burn" ? { ...out.patch, burn: c.burn + amount } : out.patch);
          void announce(
            out.log.join(" · "),
            out.patch.structure !== c.structure || out.patch.stress !== undefined ? "WARNING" : "INFO",
            { subject: c, publicMessage: publicLog(out.log) },
          );
          setAmount(0);
        }}
      >
        Aplicar
      </button>
    </div>
  );
}

/** Number input that only writes to the room when the user finishes editing (blur / Enter). */
export function NumberField({ value, onCommit, min = 0 }: { value: number; onCommit: (v: number) => void; min?: number }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Math.max(min, Math.floor(Number(draft) || 0));
    if (n !== value) onCommit(n);
    else setDraft(String(value));
  };
  return (
    <input
      className="num-input"
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
