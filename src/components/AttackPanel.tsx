import { useEffect, useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import type { CombatantState, DamageEntry, RollResult } from "../lib/types";
import { useApp } from "./AppContext";
import { RollCard } from "./RollLogView";
import { tr } from "../lib/i18n";
import { COST_LABEL, type ActionCost } from "../lib/actions";
import { takeAction } from "../obr/actions";
import { performAttack } from "../obr/attack";
import { autoModifiers, COVER_LABEL, defenseFor, isRanged, netLabel, type Cover } from "../lib/modifiers";
import type { StatusEffect } from "../lib/types";
import { statusInfo } from "../lib/statuses";
import { Html } from "./Html";
import { clearArrow, showArrow } from "../obr/targeting";
import { notify } from "../obr/toast";

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
  /** Rules flags for automatic accuracy/difficulty. */
  melee?: boolean;
  seeking?: boolean;
  smart?: boolean;
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
  const [targetId, setTargetId] = useState<string>(targets[0]?.id ?? "");
  // extra accuracy / difficulty chosen by the player, on top of the automatic modifiers
  const [acc, setAcc] = useState(0);
  const [diff, setDiff] = useState(0);
  const [cover, setCover] = useState<Cover>("none");
  const [consumeLockOn, setConsumeLockOn] = useState(true);
  const [bonusDamage, setBonusDamage] = useState("");
  const [result, setResult] = useState<RollResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [charged, setCharged] = useState(false);
  const [option, setOption] = useState(0);
  const invade = spec.invadeOptions?.[option];
  // The chosen invasion option defines the effect of this tech attack.
  const effective: AttackSpec = invade
    ? { ...spec, effect: `<b>${invade.name}:</b> ${invade.detail ?? ""}`, hitStatuses: invade.statuses, hitHeat: 2 }
    : spec;

  const target = app.room.combatants[targetId];
  const current = app.room.combatants[attacker.id] ?? attacker;
  const mods = autoModifiers(effective, current, target, cover, consumeLockOn);
  const autoNet = mods.reduce((a, m) => a + m.value, 0);
  const def = defenseFor(effective, target);

  const pickSelected = async () => {
    const sel = await OBR.player.getSelection();
    const tokenId = sel?.[0];
    const match = Object.values(app.room.combatants).find((c) => c.tokenId && c.tokenId === tokenId);
    if (match && match.id !== attacker.id) setTargetId(match.id);
    else void notify("Selecione primeiro um token vinculado a um combatente LANCER.", "WARNING");
  };

  // Arrow from the attacker to the chosen target, shown to everyone while this panel is open.
  const fromToken = current.tokenId;
  const toToken = target?.tokenId;
  useEffect(() => {
    if (!app.sceneReady) return;
    if (fromToken && toToken) void showArrow(attacker.id, fromToken, toToken);
    else void clearArrow(attacker.id);
  }, [attacker.id, fromToken, toToken, app.sceneReady]);
  useEffect(() => () => void clearArrow(attacker.id), [attacker.id]);

  const roll = async () => {
    setBusy(true);
    try {
      // Spend the action once per panel (re-rolls in the same panel don't cost again).
      if (spec.cost && !charged) {
        await takeAction(attacker, spec.cost, spec.costLabel ?? spec.label, { id: app.session.playerId, name: app.session.playerName }, { log: false });
        setCharged(true);
      }
      const r = await performAttack(attacker.id, effective, {
        targetId: targetId || undefined,
        manual: acc - diff,
        cover,
        consumeLockOn,
        bonusDamage: bonusDamage.trim() || undefined,
        by: { id: app.session.playerId, name: app.session.playerName },
      });
      if (r) setResult(r);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="attack-panel">
      <div className="attack-head">
        <strong>
          {spec.kind === "tech" ? "Ataque Tech" : "Ataque"}: {spec.label}
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
        <label>Alvo</label>
        <div className="row gap">
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">— sem alvo —</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.kind === "npc" ? " (NPC)" : ""}
              </option>
            ))}
          </select>
          {app.sceneReady && (
            <button className="btn-small ghost" onClick={pickSelected} title="Usar o token selecionado no mapa">
              Selecionado
            </button>
          )}
        </div>
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
        {isRanged(spec) && (
          <>
            <label>Cobertura</label>
            <select value={cover} onChange={(e) => setCover(e.target.value as Cover)}>
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
              <input type="checkbox" checked={consumeLockOn} onChange={(e) => setConsumeLockOn(e.target.checked)} /> Consumir (+1
              Precisão)
            </label>
          </>
        )}
        <label>Automático</label>
        <div className="auto-mods">
          {mods.filter((m) => m.value !== 0 || m.label.startsWith("Teleguiado")).length === 0 && (
            <span className="muted small">nenhum</span>
          )}
          {mods
            .filter((m) => m.value !== 0 || m.label.startsWith("Teleguiado"))
            .map((m, i) => (
              <span key={i} className={`mod-chip ${m.value > 0 ? "acc" : m.value < 0 ? "diff" : ""}`}>
                {m.label} {m.value > 0 ? `+${m.value} Prec` : m.value < 0 ? `+${-m.value} Dif` : ""}
              </span>
            ))}
          {def.note && <span className="mod-chip">{def.note}</span>}
        </div>
        <label>+ Precisão</label>
        <Counter value={acc} onChange={setAcc} />
        <label>+ Dificuldade</label>
        <Counter value={diff} onChange={setDiff} />
        <label>Total</label>
        <strong className="small">{netLabel(autoNet + acc - diff)}</strong>
        {spec.kind === "attack" && (
          <>
            <label>Dano bônus</label>
            <input placeholder="ex.: 1d6" value={bonusDamage} onChange={(e) => setBonusDamage(e.target.value)} />
          </>
        )}
      </div>
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
        Rolar {spec.kind === "tech" ? "ataque tech" : "ataque"}
      </button>
      {result && <RollCard r={result} onApplied={onDone ?? onClose} />}
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
