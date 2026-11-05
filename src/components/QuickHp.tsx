import { useState } from "react";
import type { CombatantState } from "../lib/types";
import { applyDamage, applyHeat } from "../lib/rules";
import { clamp } from "../lib/util";
import { patchCombatant } from "../obr/room";
import { patchWithChecks } from "../obr/checks";
import { announce, publicLog } from "../obr/announce";
import { NumberField } from "./Trackers";
import { useApp } from "./AppContext";

type Key = "hp" | "heat" | "structure" | "stress";
const ROWS: { key: Key; label: string; max: keyof CombatantState }[] = [
  { key: "hp", label: "PV", max: "maxHp" },
  { key: "heat", label: "Calor", max: "heatcap" },
  { key: "structure", label: "Estrutura", max: "maxStructure" },
  { key: "stress", label: "Estresse", max: "maxStress" },
];

/**
 * Quick editor for the encounter list: HP, heat, structure and stress, plus heal / damage.
 * Losing structure or stress (or overheating) rolls the corresponding check.
 */
export function QuickHp({ c }: { c: CombatantState }) {
  const app = useApp();
  const [amount, setAmount] = useState(0);
  const by = { id: app.session.playerId, name: app.session.playerName };

  const step = async (key: Key, delta: number) => {
    const max = c[ROWS.find((r) => r.key === key)!.max] as number;
    if (key === "heat" && delta > 0) {
      const out = applyHeat(c, delta);
      if (out.log.length > 1) void announce(out.log.join(" · "), "WARNING", { subject: c, publicMessage: publicLog(out.log) });
      return patchWithChecks(c, out.patch, by);
    }
    const next = clamp((c[key] as number) + delta, 0, max);
    if ((key === "structure" || key === "stress") && delta < 0) return patchWithChecks(c, { [key]: next }, by);
    return patchCombatant(c.id, { [key]: next });
  };

  const heal = async () => {
    if (amount <= 0) return;
    const hp = Math.min(c.maxHp, c.hp + amount);
    await patchCombatant(c.id, { hp });
    await announce(`${c.name} recupera ${hp - c.hp} PV (${hp}/${c.maxHp}).`, "SUCCESS", {
      subject: c,
      publicMessage: `${c.name} recupera ${hp - c.hp} PV.`,
    });
    setAmount(0);
  };

  const damage = async () => {
    if (amount <= 0) return;
    const out = applyDamage(c, amount, {});
    await patchWithChecks(c, out.patch, by);
    await announce(out.log.join(" · "), out.patch.structure !== c.structure ? "WARNING" : "INFO", { subject: c, publicMessage: publicLog(out.log) });
    setAmount(0);
  };

  return (
    <div className="quick-stats">
      <div className="quick-grid">
        {ROWS.map((r) => (
          <div key={r.key} className={`quick-cell quick-${r.key}`}>
            <span className="tracker-label">{r.label}</span>
            <button className="icon-btn" onClick={() => void step(r.key, -1)} aria-label={`Diminuir ${r.label}`}>
              −
            </button>
            <NumberField
              value={c[r.key] as number}
              onCommit={(v) => patchCombatant(c.id, { [r.key]: Math.min(v, r.key === "heat" ? v : (c[r.max] as number)) })}
            />
            <span className="max">/{c[r.max] as number}</span>
            <button className="icon-btn" onClick={() => void step(r.key, 1)} aria-label={`Aumentar ${r.label}`}>
              +
            </button>
          </div>
        ))}
      </div>
      <div className="quick-amount">
        <input
          className="num-input"
          type="number"
          min={0}
          value={amount || ""}
          placeholder="0"
          onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
          aria-label="Quantidade"
        />
        <button className="btn-small" disabled={amount <= 0} onClick={() => void heal()} title="Regeneração, reparo, cura">
          Curar PV
        </button>
        <button className="btn-small ghost danger" disabled={amount <= 0} onClick={() => void damage()} title="Dano cinético (aplica armadura)">
          Dano
        </button>
      </div>
    </div>
  );
}
