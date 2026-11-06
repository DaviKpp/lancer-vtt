import { useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { FX_LABEL, weaponFx, type FxLook, type FxStyle } from "../lib/fxFrames";
import { isFxStyle, loadFxLook, saveFxLook, setWeaponFxChoice, SIZE_OPTIONS, weaponFxChoice } from "../lib/fxPrefs";
import { previewShot } from "../obr/fx";
import { notify } from "../obr/toast";
import type { AttackSpec } from "./AttackPanel";
import { useApp } from "./AppContext";

const STYLES = Object.keys(FX_LABEL) as FxStyle[];

/** Per-weapon pick of the shot animation (saved in this browser). */
export function WeaponFxSelect({ spec }: { spec: AttackSpec }) {
  const key = spec.fxKey;
  const auto = spec.fx ?? weaponFx({ kind: spec.kind, damage: spec.damage, melee: spec.melee });
  const [choice, setChoice] = useState<FxStyle | undefined>(() => (key ? weaponFxChoice(key) : undefined));
  if (!key) return null;
  return (
    <label className="fx-select" title="Animação do tiro no mapa (só você muda a sua)">
      ✨ Efeito
      <select
        value={choice ?? ""}
        onChange={(e) => {
          const v = isFxStyle(e.target.value) ? e.target.value : undefined;
          setChoice(v);
          setWeaponFxChoice(key, v);
        }}
      >
        <option value="">Automático ({FX_LABEL[auto]})</option>
        {STYLES.map((s) => (
          <option key={s} value={s}>
            {FX_LABEL[s]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** "Meus efeitos": color and size of this player's shots, with a test shot from their token. */
export function FxPicker() {
  const app = useApp();
  const [look, setLook] = useState<FxLook>(loadFxLook);
  const [open, setOpen] = useState(false);
  const [testStyle, setTestStyle] = useState<FxStyle>("bullets");

  const update = (patch: Partial<FxLook>) => {
    const next = { ...look, ...patch };
    if (patch.color === undefined && "color" in patch) delete next.color;
    setLook(next);
    saveFxLook(next);
  };

  const test = async () => {
    // from the selected token, else from one of this player's linked tokens
    const selected = (await OBR.player.getSelection())?.[0];
    const own = Object.values(app.room.combatants).find((c) => c.tokenId && (app.isGM || c.owner === app.session.playerId));
    const from = selected ?? own?.tokenId;
    if (!from) {
      void notify("Selecione um token no mapa (ou vincule seu mech a um token) para testar.", "WARNING");
      return;
    }
    await previewShot(from, testStyle, look);
  };

  const sizeLabel = SIZE_OPTIONS.find((s) => s.value === (look.scale ?? 1))?.label ?? "Normal";

  return (
    <div className="dice-picker">
      <button className="dice-picker-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span
          className="dice-swatch"
          style={{ background: look.color ?? "conic-gradient(#ffe08a, #45b8ff, #ff7b29, #c58bff, #ffe08a)" }}
        />
        <span>
          <strong>Meus efeitos</strong>
          <span className="muted small">
            {" "}
            · {look.color ? "cor própria" : "cores automáticas"} · {sizeLabel}
          </span>
        </span>
        <span className="spacer" />
        <span className="muted small">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="stack">
          <div className="form-grid dice-custom">
            <label>Cor</label>
            <div className="row gap">
              <label className="check">
                <input type="checkbox" checked={!look.color} onChange={(e) => update({ color: e.target.checked ? undefined : "#45b8ff" })} />{" "}
                Automática
              </label>
              {look.color && <input type="color" value={look.color} onChange={(e) => update({ color: e.target.value })} />}
            </div>
            <label>Tamanho</label>
            <select value={look.scale ?? 1} onChange={(e) => update({ scale: Number(e.target.value) })}>
              {SIZE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <label>Testar</label>
            <div className="row gap">
              <select value={testStyle} onChange={(e) => isFxStyle(e.target.value) && setTestStyle(e.target.value)}>
                {STYLES.map((s) => (
                  <option key={s} value={s}>
                    {FX_LABEL[s]}
                  </option>
                ))}
              </select>
              <button className="btn-small" onClick={() => void test()} disabled={!app.sceneReady}>
                ✨ Testar
              </button>
            </div>
          </div>
          <p className="muted small">
            Vale para todos os seus ataques, e todos na sala veem nessas cores. Cada arma também pode ter outro efeito: escolha em
            “✨ Efeito” na ficha. O teste sai do token selecionado (ou do seu) e só você vê.
          </p>
        </div>
      )}
    </div>
  );
}
