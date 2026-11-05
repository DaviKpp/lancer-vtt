import { useState } from "react";
import {
  loadDiceSet,
  MATERIAL_LABEL,
  PRESETS,
  saveDiceSet,
  shade,
  swatchCss,
  type DiceMaterial,
  type DiceSet,
} from "../lib/diceSets";
import { previewDice } from "../obr/dice";
import { useApp } from "./AppContext";

const same = (a: DiceSet, b: DiceSet) =>
  a.material === b.material && a.body === b.body && a.accent === b.accent && a.ink === b.ink;

/** Lets a player pick the colors of their own dice (d20 and damage), saved in this browser. */
export function DicePicker() {
  const app = useApp();
  const [set, setSet] = useState<DiceSet>(loadDiceSet);
  const [open, setOpen] = useState(false);
  const preset = PRESETS.find((p) => same(p.set, set));

  const choose = (next: DiceSet) => {
    setSet(next);
    saveDiceSet(next);
  };
  const custom = (patch: Partial<DiceSet>) => {
    const next = { ...set, ...patch };
    // custom colors: derive the swirl / speckle color from the body color
    if (patch.body) next.accent = shade(patch.body, next.material === "metal" ? 0.4 : 0.45);
    choose(next);
  };

  const test = () =>
    void previewDice({
      id: `preview-${Date.now()}`,
      byId: app.session.playerId,
      title: app.session.playerName,
      label: "Teste dos dados",
      result: "",
      set,
      dice: [
        { sides: 20, value: 1 + Math.floor(Math.random() * 20), tone: "main", kept: true },
        { sides: 6, value: 1 + Math.floor(Math.random() * 6), tone: "dmg", kept: true },
        { sides: 6, value: 1 + Math.floor(Math.random() * 6), tone: "dmg", kept: true },
      ],
    });

  return (
    <div className="dice-picker">
      <button className="dice-picker-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="dice-swatch" style={{ background: swatchCss(set) }} />
        <span>
          <strong>Meus dados</strong>
          <span className="muted small"> · {preset?.name ?? "Personalizado"}</span>
        </span>
        <span className="spacer" />
        <span className="muted small">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="stack">
          <div className="dice-presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={`dice-preset ${preset?.id === p.id ? "active" : ""}`}
                onClick={() => choose(p.set)}
                title={p.name}
              >
                <span className="dice-swatch" style={{ background: swatchCss(p.set), color: p.set.ink }}>
                  20
                </span>
                <span className="small">{p.name}</span>
              </button>
            ))}
          </div>

          <div className="form-grid dice-custom">
            <label>Material</label>
            <select value={set.material} onChange={(e) => custom({ material: e.target.value as DiceMaterial })}>
              {(Object.keys(MATERIAL_LABEL) as DiceMaterial[]).map((m) => (
                <option key={m} value={m}>
                  {MATERIAL_LABEL[m]}
                </option>
              ))}
            </select>
            <label>Cor</label>
            <input type="color" value={set.body} onChange={(e) => custom({ body: e.target.value })} />
            <label>Números</label>
            <input type="color" value={set.ink} onChange={(e) => custom({ ink: e.target.value })} />
          </div>

          <p className="muted small">
            Vale para o seu d20 e os dados de dano, e todos na sala veem nessas cores. Precisão (verde), dificuldade (roxo)
            e checagens (latão) mantêm as cores de sempre.
          </p>
          <button className="btn-small" onClick={test}>
            🎲 Testar meus dados
          </button>
        </div>
      )}
    </div>
  );
}
