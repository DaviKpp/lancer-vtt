import { useState } from "react";
import { Html } from "./Html";
import { TraumaChooser } from "./TraumaChooser";
import { applyPending } from "../obr/effects";
import { patchWithChecks } from "../obr/checks";
import { announce, publicLog } from "../obr/announce";
import { statusInfo } from "../lib/statuses";
import type { RollResult } from "../lib/types";
import { applyDamage } from "../lib/rules";
import { APPLIED_NOTE, OUTCOME_PT, rollLog } from "../obr/rolls";
import { tr } from "../lib/i18n";
import { useRollLog } from "../obr/hooks";
import { useApp } from "./AppContext";
import { DicePicker } from "./DicePicker";
import { FxPicker } from "./FxControls";

/** `onApplied` runs after the GM applies this roll's damage (used to close the attack panel). */
export function RollCard({ r, onApplied }: { r: RollResult; onApplied?: () => void }) {
  const app = useApp();
  const target = r.targetId ? app.room.combatants[r.targetId] : undefined;
  const totalDamage = (r.damage ?? []).reduce((a, d) => a + d.amount, 0);
  const [appliedHere, setAppliedHere] = useState(false);
  const applied = appliedHere || r.notes?.includes(APPLIED_NOTE);
  const canApply = app.isGM && target && totalDamage > 0 && !applied;
  const [done, setDone] = useState<string[]>([]);
  const pending = (r.pending ?? []).filter((p) => !done.includes(p.id));

  // Damage options chosen by the GM before applying: armor-piercing (preset from the weapon's AP tag),
  // resistance per damage type, and a flat reduction.
  const typeOf = (t: string) => (t === "Bonus" ? r.damage?.[0]?.type ?? "Kinetic" : t);
  const types = Array.from(new Set((r.damage ?? []).map((d) => typeOf(d.type))));
  const [ap, setAp] = useState(!!r.ap);
  const [resist, setResist] = useState<Record<string, boolean>>({});
  const [reduce, setReduce] = useState(0);

  const apply = async () => {
    if (!target) return;
    // Apply each damage type separately so armor / heat / burn / resistance are handled correctly;
    // the flat reduction is used up across them.
    let state = { ...target };
    let budget = reduce;
    const log: string[] = [];
    for (const d of r.damage ?? []) {
      const type = typeOf(d.type);
      const out = applyDamage(state, d.amount, { ap, type, halve: !!resist[type], reduce: budget });
      budget -= out.reduced ?? 0;
      state = { ...state, ...out.patch };
      log.push(...out.log);
    }
    await patchWithChecks(
      target,
      { hp: state.hp, os: state.os, structure: state.structure, heat: state.heat, stress: state.stress },
      { id: app.session.playerId, name: app.session.playerName },
    );
    rollLog.markApplied(r.id);
    setAppliedHere(true); // hide the buttons right away (no double apply)
    onApplied?.();
    await announce(log.join(" · "), state.structure < target.structure ? "WARNING" : "INFO", {
      subject: target,
      publicMessage: publicLog(log),
    });
  };

  if (r.kind === "skill") {
    return (
      <div className={`roll-card ${r.outcome === "hit" ? "roll-hit" : "roll-miss"}`}>
        <div className="roll-top">
          <span className="roll-who">{r.attackerName}</span>
          <span className="roll-label">🎲 {r.label}</span>
          <span className="roll-time">{new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <div className="roll-main">
          <span className="roll-total">{r.total}</span>
          <span className="roll-vs">contra {r.defense}</span>
          <span className={`roll-outcome ${r.outcome}`}>{r.outcome === "hit" ? "SUCESSO" : "FALHA"}</span>
        </div>
        <div className="roll-detail mono">
          d20[{r.d20}] {r.bonus >= 0 ? "+" : "−"} {Math.abs(r.bonus)}
          {r.accDice.length > 0 &&
            ` ${r.netAccuracy > 0 ? "+" : "−"} ${Math.max(...r.accDice)} (${r.netAccuracy > 0 ? "prec" : "dif"} ${r.accDice.join(",")})`}
        </div>
        {r.notes?.length ? <div className="muted small">{r.notes.join(" · ")}</div> : null}
      </div>
    );
  }

  if (r.kind === "check") {
    return (
      <div className={`roll-card roll-check ${r.applied?.includes("DESTRUÍDO") ? "roll-miss" : ""}`}>
        <div className="roll-top">
          <span className="roll-who">{r.attackerName}</span>
          <span className="roll-time">{new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <div className="roll-main">
          <span className="roll-total">{r.total}</span>
          <strong>{r.label}</strong>
        </div>
        <div className="roll-detail mono">
          {r.accDice.length}d6 [{r.accDice.join(", ")}] → menor {r.total}
          {r.notes?.length ? ` · ${r.notes.join(" · ")}` : ""}
        </div>
        {r.effect && <Html className="html roll-effect" html={r.effect} />}
        {r.applied?.length ? <div className="small roll-applied">✔ Aplicado: {r.applied.join(" · ")}</div> : null}
        <TraumaChooser r={r} />
      </div>
    );
  }

  if (r.kind === "action") {
    return (
      <div className="roll-card roll-action">
        <div className="roll-top">
          <span className="roll-who">{r.attackerName}</span>
          <span className="roll-label">▸ {r.label}</span>
          <span className="roll-time">{new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        {r.notes?.length ? <div className="muted small">{r.notes.join(" · ")}</div> : null}
      </div>
    );
  }

  return (
    <div className={`roll-card roll-${r.outcome ?? "none"}`}>
      <div className="roll-top">
        <span className="roll-who">{r.attackerName}</span>
        <span className="roll-label">
          {r.kind === "tech" ? "⚡ " : "⌖ "}
          {r.label}
        </span>
        <span className="roll-time">{new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <div className="roll-main">
        <span className="roll-total">{r.total}</span>
        {r.targetName && (
          <span className="roll-vs">
            contra {r.targetName}
            {r.defense !== undefined && app.isGM ? ` (${r.defenseLabel ?? (r.kind === "tech" ? "Def-E" : "Eva")} ${r.defense})` : ""}
          </span>
        )}
        {r.outcome && <span className={`roll-outcome ${r.outcome}`}>{OUTCOME_PT[r.outcome]}</span>}
      </div>
      <div className="roll-detail mono">
        d20[{r.d20}] {r.bonus >= 0 ? "+" : "−"} {Math.abs(r.bonus)}
        {r.accDice.length > 0 &&
          ` ${r.netAccuracy > 0 ? "+" : "−"} ${Math.max(...r.accDice)} (${r.netAccuracy > 0 ? "prec" : "dif"} ${r.accDice.join(",")})`}
      </div>
      {r.damage?.length ? (
        <div className="roll-damage">
          {r.damage.map((d, i) => (
            <span key={i} className="dmg-chip" title={d.detail}>
              {d.amount} {tr(d.type)}
            </span>
          ))}
          <span className="muted small mono">{r.damage.map((d) => d.detail).join(" · ")}</span>
        </div>
      ) : null}
      {r.notes?.length ? <div className="muted small">{r.notes.join(" · ")}</div> : null}
      {r.effect && <Html className="html roll-effect" html={`<b>No acerto:</b> ${r.effect}`} />}
      {r.applied?.length ? (
        <div className="small roll-applied">✔ Aplicado em {r.targetName}: {r.applied.join(" · ")}</div>
      ) : null}
      {pending.length > 0 && target && (app.isGM || r.byId === app.session.playerId) && (
        <div className="row gap wrap">
          {pending.map((p, i) => (
            <button
              key={i}
              className="btn-small"
              title={p.save ? `Use se ${target.name} falhar na salvaguarda de ${tr(p.save)}` : "Depende de uma escolha — aplique se for o caso"}
              onClick={async () => {
                await applyPending(target.id, p);
                setDone((d) => [...d, p.id]);
              }}
            >
              Aplicar {statusInfo(p.id)?.name ?? p.id}
              {p.save ? ` (falhou: ${tr(p.save)})` : ""}
            </button>
          ))}
        </div>
      )}
      {canApply && (
        <div className="apply-damage">
          {r.ap && <span className="badge badge-ap">Arma Perfurante (AP): ignora armadura</span>}
          <div className="row gap wrap">
            <label className="check" title="Perfurante (AP): ignora a armadura do alvo">
              <input type="checkbox" checked={ap} onChange={(e) => setAp(e.target.checked)} /> AP
            </label>
            {types.map((t) => (
              <label key={t} className="check" title={`Resistência a ${tr(t)}: o dano desse tipo cai pela metade (arredonda para cima)`}>
                <input type="checkbox" checked={!!resist[t]} onChange={(e) => setResist((x) => ({ ...x, [t]: e.target.checked }))} />{" "}
                Resist. {types.length > 1 ? tr(t) : ""}
              </label>
            ))}
            <label className="check" title="Reduz o dano total em um valor fixo (habilidades, efeitos)">
              Redução
              <input
                className="num-input"
                type="number"
                min={0}
                value={reduce}
                onChange={(e) => setReduce(Math.max(0, Number(e.target.value) || 0))}
              />
            </label>
          </div>
          <button className="btn-small" onClick={apply}>
            Aplicar {totalDamage} em {target.name}
            {ap ? " (AP)" : ""}
          </button>
        </div>
      )}
    </div>
  );
}

export function RollLogView() {
  const entries = useRollLog();
  const app = useApp();
  return (
    <div className="stack">
      {!app.isGM && <DicePicker />}
      <FxPicker />
      <div className="row between">
        <h3>Registro de rolagens</h3>
        {entries.length > 0 && (
          <button className="btn-small ghost" onClick={() => rollLog.clear()}>
            Limpar
          </button>
        )}
      </div>
      {entries.length === 0 && <p className="muted">Nenhuma rolagem ainda. Os ataques de todos na sala aparecem aqui.</p>}
      {entries.map((r) => (
        <RollCard key={r.id} r={r} />
      ))}
      {!app.isGM && entries.length > 0 && <p className="muted small">O mestre pode aplicar o dano a partir deste registro.</p>}
    </div>
  );
}
