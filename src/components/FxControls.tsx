import { useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { FX_COUNT, FX_LABEL, weaponFx, type FxLook, type FxStyle } from "../lib/fxFrames";
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

/** Default colors of each effect, for the swatches when the player hasn't picked one. */
const DEFAULT_COLOR: Record<FxStyle, string> = {
  bullets: "#ffe08a",
  shotgun: "#ffe7a0",
  cannon: "#ffb347",
  beam: "#45b8ff",
  missile: "#ff7b29",
  flame: "#ff4d1a",
  melee: "#ff5a4a",
  tech: "#c58bff",
};

/**
 * "Meus efeitos": color, size and (for multi-projectile effects) number of projectiles, set
 * separately for each kind of effect, with a test shot from the player's token.
 */
export function FxPicker() {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<FxStyle>("bullets");
  const [looks, setLooks] = useState<Record<FxStyle, FxLook>>(
    () => Object.fromEntries(STYLES.map((s) => [s, loadFxLook(s)])) as Record<FxStyle, FxLook>,
  );
  const look = looks[style];
  const count = FX_COUNT[style];

  const update = (patch: Partial<FxLook>) => {
    const next: FxLook = { ...look, ...patch };
    if ("color" in patch && patch.color === undefined) delete next.color;
    setLooks((ls) => ({ ...ls, [style]: next }));
    saveFxLook(style, next);
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
    await previewShot(from, style, look);
  };

  const custom = STYLES.filter((s) => looks[s].color || (looks[s].scale ?? 1) !== 1 || looks[s].count !== undefined).length;

  return (
    <div className="dice-picker">
      <button className="dice-picker-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span
          className="dice-swatch"
          style={{ background: `conic-gradient(${STYLES.map((s) => looks[s].color ?? DEFAULT_COLOR[s]).join(", ")}, ${looks.bullets.color ?? DEFAULT_COLOR.bullets})` }}
        />
        <span>
          <strong>Meus efeitos</strong>
          <span className="muted small"> · {custom ? `${custom} tipo(s) personalizado(s)` : "padrão"}</span>
        </span>
        <span className="spacer" />
        <span className="muted small">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="stack">
          <div className="fx-tabs">
            {STYLES.map((s) => (
              <button key={s} className={`fx-tab ${s === style ? "active" : ""}`} onClick={() => setStyle(s)}>
                <span className="fx-dot" style={{ background: looks[s].color ?? DEFAULT_COLOR[s] }} />
                {FX_LABEL[s]}
              </button>
            ))}
          </div>

          <div className="form-grid dice-custom">
            <label>Cor</label>
            <div className="row gap">
              <label className="check">
                <input type="checkbox" checked={!look.color} onChange={(e) => update({ color: e.target.checked ? undefined : DEFAULT_COLOR[style] })} />{" "}
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
            {count && (
              <>
                <label>{count.label}</label>
                <div className="row gap">
                  <input
                    type="range"
                    min={count.min}
                    max={count.max}
                    value={look.count ?? count.def}
                    onChange={(e) => update({ count: Number(e.target.value) })}
                  />
                  <strong className="mono">{look.count ?? count.def}</strong>
                </div>
              </>
            )}
            <label>Testar</label>
            <button className="btn-small" onClick={() => void test()} disabled={!app.sceneReady}>
              ✨ Testar {FX_LABEL[style]}
            </button>
          </div>
          <p className="muted small">
            Cada tipo de efeito tem a sua cor, tamanho e quantidade, e todos na sala veem seus tiros assim. Para trocar o efeito de
            uma arma, use “✨ Efeito” na ficha. O teste sai do token selecionado (ou do seu) e só você vê.
          </p>
        </div>
      )}
    </div>
  );
}
