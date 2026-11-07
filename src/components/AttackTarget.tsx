// One attack's own target and modifiers. Attacks rolled together (a Barrage, NPC weapons that
// attack several times) can each go at a different target, so each gets its own cover,
// Lock On, accuracy and difficulty.
import { useEffect, useRef } from "react";
import OBR from "@owlbear-rodeo/sdk";
import type { CombatantState } from "../lib/types";
import { attackBlockers, autoModifiers, COVER_LABEL, defenseFor, isAreaAttack, isRanged, netLabel, type Cover } from "../lib/modifiers";
import type { AttackSpec } from "./AttackPanel";
import { useApp } from "./AppContext";
import { notify } from "../obr/toast";
import { clearArrow, showArrow } from "../obr/targeting";

export interface TargetRow {
  targetId: string;
  acc: number; // extra accuracy chosen by the player
  diff: number; // extra difficulty chosen by the player
  cover: Cover;
  consumeLockOn: boolean;
}

export const newTargetRow = (targetId = ""): TargetRow => ({ targetId, acc: 0, diff: 0, cover: "none", consumeLockOn: true });

/** Form-grid rows (label + field pairs) for one attack's target and modifiers. */
export function TargetFields({
  attacker,
  spec,
  row,
  onChange,
}: {
  attacker: CombatantState;
  spec: AttackSpec;
  row: TargetRow;
  onChange: (patch: Partial<TargetRow>) => void;
}) {
  const app = useApp();
  const targets = app.targetsFor(attacker.id);
  const target = app.room.combatants[row.targetId];
  const current = app.room.combatants[attacker.id] ?? attacker;
  const mods = autoModifiers(spec, current, target, row.cover, row.consumeLockOn);
  const shown = mods.filter((m) => m.value !== 0 || m.label.startsWith("Teleguiado"));
  const autoNet = mods.reduce((a, m) => a + m.value, 0);
  const def = defenseFor(spec, target);

  const pickSelected = async () => {
    const tokenId = (await OBR.player.getSelection())?.[0];
    const match = Object.values(app.room.combatants).find((c) => c.tokenId && c.tokenId === tokenId);
    if (match && match.id !== attacker.id) onChange({ targetId: match.id });
    else void notify("Selecione primeiro um token vinculado a um combatente LANCER.", "WARNING");
  };

  return (
    <>
      <label>Alvo</label>
      <div className="row gap">
        <select value={row.targetId} onChange={(e) => onChange({ targetId: e.target.value })}>
          <option value="">— sem alvo —</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.kind === "npc" ? " (NPC)" : t.kind === "pilot" ? " (piloto)" : ""}
              {app.sceneReady && !t.tokenId ? " (sem token)" : ""}
            </option>
          ))}
        </select>
        {app.sceneReady && (
          <button className="btn-small ghost" onClick={pickSelected} title="Usar o token selecionado no mapa">
            Selecionado
          </button>
        )}
      </div>
      {isRanged(spec) && (
        <>
          <label>Cobertura</label>
          <select value={row.cover} onChange={(e) => onChange({ cover: e.target.value as Cover })}>
            {(Object.keys(COVER_LABEL) as Cover[]).map((k) => (
              <option key={k} value={k}>
                {COVER_LABEL[k]}
              </option>
            ))}
          </select>
        </>
      )}
      {target?.st?.includes("lockon") && (
        <>
          <label>Mira Travada</label>
          <label className="check">
            <input type="checkbox" checked={row.consumeLockOn} onChange={(e) => onChange({ consumeLockOn: e.target.checked })} />{" "}
            Consumir (+1 Precisão)
          </label>
        </>
      )}
      <label>Automático</label>
      <div className="auto-mods">
        {shown.length === 0 && <span className="muted small">nenhum</span>}
        {shown.map((m, i) => (
          <span key={i} className={`mod-chip ${m.value > 0 ? "acc" : m.value < 0 ? "diff" : ""}`}>
            {m.label} {m.value > 0 ? `+${m.value} Prec` : m.value < 0 ? `+${-m.value} Dif` : ""}
          </span>
        ))}
        {def.note && <span className="mod-chip">{def.note}</span>}
        {Object.values(attackBlockers(spec, current, target))
          .filter(Boolean)
          .map((msg) => (
            <span key={msg} className="mod-chip diff">
              {msg}
            </span>
          ))}
      </div>
      <label>+ Precisão</label>
      <Counter value={row.acc} onChange={(acc) => onChange({ acc })} />
      <label>+ Dificuldade</label>
      <Counter value={row.diff} onChange={(diff) => onChange({ diff })} />
      <label>Total</label>
      <strong className="small">{netLabel(autoNet + row.acc - row.diff)}</strong>
    </>
  );
}

export function Counter({ value, onChange }: { value: number; onChange: (v: number) => void }) {
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

/**
 * Arrows (shown to everyone) from the attacker to each chosen target while the panel is open, with
 * the weapon(s) firing at that target written above. Hidden once the attack is rolled, so the shot
 * animation is easy to see. The first arrow uses the attacker's id, the others `${id}#n`.
 */
export function useTargetArrows(attacker: CombatantState, aims: { targetId: string; weapon: string }[], hidden = false) {
  const app = useApp();
  const from = (app.room.combatants[attacker.id] ?? attacker).tokenId;
  // one arrow per distinct target token, listing every weapon aimed at it
  const byToken = new Map<string, string[]>();
  for (const a of aims) {
    const token = app.room.combatants[a.targetId]?.tokenId;
    if (!token) continue;
    const list = byToken.get(token) ?? [];
    if (!list.includes(a.weapon)) list.push(a.weapon);
    byToken.set(token, list);
  }
  const tokens = [...byToken.keys()];
  const key = `${hidden}|` + tokens.map((t) => `${t}:${byToken.get(t)!.join(",")}`).join("|");
  const drawn = useRef(0);
  useEffect(() => {
    if (!app.sceneReady) return;
    const arrowId = (i: number) => (i === 0 ? attacker.id : `${attacker.id}#${i}`);
    const list = from && !hidden ? tokens : [];
    list.forEach((to, i) => void showArrow(arrowId(i), from!, to, byToken.get(to) ?? []));
    for (let i = list.length; i < Math.max(1, drawn.current); i++) void clearArrow(arrowId(i));
    drawn.current = list.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attacker.id, from, key, app.sceneReady]);
  useEffect(
    () => () => {
      for (let i = 0; i < Math.max(1, drawn.current); i++) void clearArrow(i === 0 ? attacker.id : `${attacker.id}#${i}`);
    },
    [attacker.id],
  );
}

/** The rows of one attack as roll inputs. */
export const toTargetInputs = (rows: TargetRow[]) =>
  rows.map((r) => ({ targetId: r.targetId || undefined, manual: r.acc - r.diff, cover: r.cover, consumeLockOn: r.consumeLockOn }));

/** Weapons whose range is an area (Blast, Burst, Line, Cone) usually hit several targets. */
export { isAreaAttack } from "../lib/modifiers";

/**
 * All the targets of one attack. "+ Alvo" adds another target (area weapons, or any attack that
 * hits more than one): each target rolls to hit on its own, and the damage is rolled once for all.
 */
export function AttackTargets({
  attacker,
  spec,
  rows,
  onChange,
}: {
  attacker: CombatantState;
  spec: AttackSpec;
  rows: TargetRow[];
  onChange: (rows: TargetRow[]) => void;
}) {
  const app = useApp();
  const targets = app.targetsFor(attacker.id);
  const patch = (j: number, p: Partial<TargetRow>) => onChange(rows.map((r, k) => (k === j ? { ...r, ...p } : r)));
  const add = () => {
    // next target not chosen yet, if any
    const used = new Set(rows.map((r) => r.targetId));
    onChange([...rows, newTargetRow(targets.find((t) => !used.has(t.id))?.id ?? "")]);
  };
  const remove = (j: number) => onChange(rows.filter((_, k) => k !== j));
  const multi = rows.length > 1;

  return (
    <div className="attack-targets">
      {rows.map((row, j) => (
        <div key={j} className={multi ? "target-block" : undefined}>
          {multi && (
            <div className="target-head">
              Alvo {j + 1}
              <button className="icon-btn" onClick={() => remove(j)} aria-label={`Remover alvo ${j + 1}`} title="Remover este alvo">
                ×
              </button>
            </div>
          )}
          <div className="form-grid">
            <TargetFields attacker={attacker} spec={spec} row={row} onChange={(p) => patch(j, p)} />
          </div>
        </div>
      ))}
      <div className="row gap wrap">
        <button className="btn-small ghost" onClick={add} title="Ataca mais um alvo com este mesmo ataque">
          + Alvo
        </button>
        {multi ? (
          <span className="muted small">Acerto rolado para cada alvo; dano rolado uma vez para todos.</span>
        ) : (
          isAreaAttack(spec) && <span className="muted small">Arma de área: adicione os outros alvos atingidos.</span>
        )}
      </div>
    </div>
  );
}
