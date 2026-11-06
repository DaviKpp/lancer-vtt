import { useState } from "react";
import type { CombatantState, DamageEntry, RollResult } from "../lib/types";
import { useApp } from "./AppContext";
import { RollCard } from "./RollLogView";
import { tr } from "../lib/i18n";
import { COST_LABEL, type ActionCost } from "../lib/actions";
import { takeAction } from "../obr/actions";
import { performAttack } from "../obr/attack";
import type { StatusEffect } from "../lib/types";
import { statusInfo } from "../lib/statuses";
import { Html } from "./Html";
import { newTargetRow, TargetFields, useTargetArrows, type TargetRow } from "./AttackTarget";
import type { FxStyle } from "../lib/fxFrames";

export interface AttackSpec {
  kind: "attack" | "tech";
  label: string;
  bonus: number;
  accuracy: number;
  damage?: DamageEntry[];
  reliable?: number;
  notes?: string[];
  /** Action spent when rolling (Skirmish = quick, Barrage = full...). */
  cost?: ActionCost;
  costLabel?: string;
  /** What happens on a hit (text shown on the roll card). */
  effect?: string;
  critEffect?: string;
  hitStatuses?: StatusEffect[];
  critStatuses?: StatusEffect[];
  /** Heat dealt to the target on a hit (Invade = 2, Heat X (Target) tag). */
  hitHeat?: number;
  /** Burn X tag. */
  burn?: number;
  /** Invade: the player picks which invasion option to use. */
  invadeOptions?: InvadeOption[];
  /** NPC weapons that attack several times per use: each attack rolls separately. */
  attacks?: number;
  /** Rules flags for automatic accuracy/difficulty. */
  melee?: boolean;
  seeking?: boolean;
  smart?: boolean;
  /** Animation on the map (bullets, beam, missile...); picked from the weapon when not set. */
  fx?: FxStyle;
  /** Key under which the player may have picked another animation for this weapon (lib/fxPrefs). */
  fxKey?: string;
  /** Armor-piercing (AP tag): its damage ignores armor. */
  ap?: boolean;
}

export interface InvadeOption {
  name: string;
  detail?: string;
  statuses?: StatusEffect[];
}

export function AttackPanel({
  attacker,
  spec,
  onClose,
  onDone,
}: {
  attacker: CombatantState;
  spec: AttackSpec;
  onClose: () => void;
  /** Called after the damage of the roll is applied (defaults to onClose). */
  onDone?: () => void;
}) {
  const app = useApp();
  const targets = app.targetsFor(attacker.id);
  // NPC weapons can attack several times; each attack has its own target and modifiers.
  const count = Math.max(1, Math.min(6, spec.attacks ?? 1));
  const [rows, setRows] = useState<TargetRow[]>(() => Array.from({ length: count }, () => newTargetRow(targets[0]?.id ?? "")));
  const [bonusDamage, setBonusDamage] = useState("");
  const [results, setResults] = useState<RollResult[]>([]);
  const [appliedIds, setAppliedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [charged, setCharged] = useState(false);
  const [option, setOption] = useState(0);
  const invade = spec.invadeOptions?.[option];
  // The chosen invasion option defines the effect of this tech attack.
  const effective: AttackSpec = invade
    ? { ...spec, effect: `<b>${invade.name}:</b> ${invade.detail ?? ""}`, hitStatuses: invade.statuses, hitHeat: 2 }
    : spec;

  const patchRow = (i: number, patch: Partial<TargetRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  useTargetArrows(
    attacker,
    rows.map((r) => r.targetId),
  );

  const roll = async () => {
    setBusy(true);
    try {
      // Spend the action once per panel (re-rolls in the same panel don't cost again).
      if (spec.cost && !charged) {
        await takeAction(attacker, spec.cost, spec.costLabel ?? spec.label, { id: app.session.playerId, name: app.session.playerName }, { log: false });
        setCharged(true);
      }
      const out: RollResult[] = [];
      for (const [i, row] of rows.entries()) {
        const r = await performAttack(attacker.id, effective, {
          targetId: row.targetId || undefined,
          manual: row.acc - row.diff,
          cover: row.cover,
          consumeLockOn: row.consumeLockOn,
          // bonus damage only on the first attack
          bonusDamage: i === 0 ? bonusDamage.trim() || undefined : undefined,
          label: count > 1 ? `${spec.label} (${i + 1}/${count})` : undefined,
          by: { id: app.session.playerId, name: app.session.playerName },
        });
        if (r) out.push(r);
      }
      setResults(out);
      setAppliedIds([]);
    } finally {
      setBusy(false);
    }
  };

  // close once every attack that dealt damage has been applied
  const onApplied = (id: string) => {
    const pending = results.filter((x) => (x.damage ?? []).some((d) => d.amount > 0) && x.id !== id && !appliedIds.includes(x.id));
    setAppliedIds((a) => [...a, id]);
    if (!pending.length) (onDone ?? onClose)();
  };

  return (
    <div className="attack-panel">
      <div className="attack-head">
        <strong>
          {spec.kind === "tech" ? "Ataque Tech" : "Ataque"}: {spec.label}
          {count > 1 && <span className="badge">{count} ataques</span>}
          {spec.cost && spec.cost !== "none" ? (
            <span className="badge">
              {spec.costLabel ? `${spec.costLabel} · ` : ""}
              {COST_LABEL[spec.cost]}
            </span>
          ) : null}
        </strong>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar">
          ×
        </button>
      </div>
      <div className="form-grid">
        {spec.invadeOptions?.length ? (
          <>
            <label>Invasão</label>
            <select value={option} onChange={(e) => setOption(Number(e.target.value))}>
              {spec.invadeOptions.map((o, i) => (
                <option key={i} value={i}>
                  {o.name}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <label>Bônus</label>
        <span className="mono">
          {spec.bonus >= 0 ? "+" : ""}
          {spec.bonus} {spec.kind === "tech" ? "(Ataque Tech)" : "(bônus de ataque)"}
        </span>
        {count === 1 && <TargetFields attacker={attacker} spec={effective} row={rows[0]} onChange={(p) => patchRow(0, p)} />}
        {spec.kind === "attack" && (
          <>
            <label>Dano bônus</label>
            <input
              placeholder={count > 1 ? "ex.: 1d6 (só no 1º ataque)" : "ex.: 1d6"}
              value={bonusDamage}
              onChange={(e) => setBonusDamage(e.target.value)}
            />
          </>
        )}
      </div>
      {count > 1 &&
        rows.map((row, i) => (
          <div key={i} className="attack-row">
            <div className="attack-row-head">
              Ataque {i + 1}
              {i > 0 && rows[0].targetId && row.targetId !== rows[0].targetId && (
                <button className="btn-small ghost" onClick={() => patchRow(i, { targetId: rows[0].targetId })}>
                  Mesmo alvo do 1º
                </button>
              )}
            </div>
            <div className="form-grid">
              <TargetFields attacker={attacker} spec={effective} row={row} onChange={(p) => patchRow(i, p)} />
            </div>
          </div>
        ))}
      {spec.damage?.length ? (
        <div className="muted small">Dano: {spec.damage.map((d) => `${d.val} ${tr(d.type)}`).join(" + ")}</div>
      ) : null}
      {effective.effect && (
        <div className="hit-preview">
          <Html html={`<b>No acerto${effective.hitHeat ? ` (+${effective.hitHeat} de calor)` : ""}:</b> ${effective.effect.replace(/^<b>[^<]*<\/b>\s*/, "")}`} />
          {effective.hitStatuses?.length ? (
            <div className="muted small">
              Impõe: {effective.hitStatuses.map((s) => `${statusInfo(s.id)?.name ?? s.id}${s.save ? ` (salvaguarda de ${tr(s.save)})` : ""}`).join(", ")}
            </div>
          ) : null}
        </div>
      )}
      <button className="btn-primary wide" onClick={roll} disabled={busy}>
        Rolar {count > 1 ? `${count} ataques` : spec.kind === "tech" ? "ataque tech" : "ataque"}
      </button>
      {results.map((r) => (
        <RollCard key={r.id} r={r} onApplied={() => onApplied(r.id)} />
      ))}
    </div>
  );
}
