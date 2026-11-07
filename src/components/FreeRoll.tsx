import { useState } from "react";
import type { RollResult } from "../lib/types";
import { rollAccuracy, rollDie, rollExpression } from "../lib/dice";
import { uid } from "../lib/util";
import { publishRoll } from "../obr/rolls";
import { Counter } from "./AttackTarget";
import { useApp } from "./AppContext";

/**
 * Free roll: any dice ("1d20", "2d6+1"...) + a bonus, with Accuracy / Difficulty (net d6, highest one
 * added or subtracted, as in LANCER). Thrown in 3D and posted to the log like any other roll.
 */
export function FreeRoll() {
  const app = useApp();
  const [expr, setExpr] = useState("1d20");
  const [bonus, setBonus] = useState(0);
  const [acc, setAcc] = useState(0);
  const [diff, setDiff] = useState(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = /^\s*(\d*d\d+|\d+)(\s*[+-]\s*(\d*d\d+|\d+))*\s*$/i.test(expr);

  const roll = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const clean = expr.replace(/\s+/g, "");
      const single20 = /^1?d20$/i.test(clean);
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
          <span className="muted small">Dados</span>
          <input value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="1d20" className={valid ? "" : "invalid"} />
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
