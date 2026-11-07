import { useState } from "react";
import type { RollResult } from "../lib/types";
import { rollAccuracy, rollDie, rollExpression } from "../lib/dice";
import { uid } from "../lib/util";
import { publishRoll } from "../obr/rolls";
import { Counter } from "./AttackTarget";
import { useApp } from "./AppContext";

/** Dice the free roll offers: coin (d2), d3, d4, d6, d10, d12, d20. */
export const FREE_DICE = [2, 3, 4, 6, 10, 12, 20] as const;
const DIE_LABEL: Record<number, string> = { 2: "Moeda (d2)" };

/**
 * Free roll: N of one die + a bonus, with Accuracy / Difficulty (net d6, highest one
 * added or subtracted, as in LANCER). Thrown in 3D and posted to the log like any other roll.
 */
export function FreeRoll() {
  const app = useApp();
  const [sides, setSides] = useState<number>(20);
  const [count, setCount] = useState(1);
  const [bonus, setBonus] = useState(0);
  const [acc, setAcc] = useState(0);
  const [diff, setDiff] = useState(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = FREE_DICE.includes(sides as (typeof FREE_DICE)[number]) && count >= 1 && count <= 10;

  const roll = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const clean = `${count}d${sides}`;
      const single20 = count === 1 && sides === 20;
      const d20 = single20 ? rollDie(20) : 0;
      const dice = single20 ? undefined : rollExpression(clean);
      const net = acc - diff;
      const a = rollAccuracy(net);
      const total = (single20 ? d20 : dice!.total) + bonus + a.mod;
      const r: RollResult = {
        id: uid(),
        ts: Date.now(),
        by: app.session.playerName,
        byId: app.session.playerId,
        attackerId: app.session.playerId,
        attackerName: app.session.playerName,
        kind: "skill",
        label: `${reason.trim() || "Rolagem livre"} (${clean}${bonus ? `${bonus > 0 ? "+" : ""}${bonus}` : ""})`,
        d20,
        freeDetail: dice?.detail,
        accDice: a.dice,
        netAccuracy: net,
        bonus,
        total,
      };
      await publishRoll(r);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card free-roll">
      <strong>Rolar dados</strong>
      <div className="free-roll-grid">
        <label>
          <span className="muted small">Dado</span>
          <select value={sides} onChange={(e) => setSides(Number(e.target.value))}>
            {FREE_DICE.map((d) => (
              <option key={d} value={d}>
                {DIE_LABEL[d] ?? `d${d}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted small">Quantidade</span>
          <input type="number" min={1} max={10} value={count} onChange={(e) => setCount(Math.max(1, Math.min(10, Math.trunc(Number(e.target.value) || 1))))} />
        </label>
        <label>
          <span className="muted small">Bônus</span>
          <input type="number" value={bonus} onChange={(e) => setBonus(Math.trunc(Number(e.target.value) || 0))} />
        </label>
        <label>
          <span className="muted small">Precisão</span>
          <Counter value={acc} onChange={setAcc} />
        </label>
        <label>
          <span className="muted small">Dificuldade</span>
          <Counter value={diff} onChange={setDiff} />
        </label>
      </div>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (opcional)" />
      <button className="btn-small" disabled={busy || !valid} onClick={() => void roll()}>
        {busy ? "Rolando…" : "Rolar"}
      </button>
    </div>
  );
}
