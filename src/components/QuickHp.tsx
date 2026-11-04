import { useState } from "react";
import OBR from "@owlbear-rodeo/sdk";
import type { CombatantState } from "../lib/types";
import { applyDamage } from "../lib/rules";
import { patchCombatant } from "../obr/room";
import { patchWithChecks } from "../obr/checks";
import { NumberField } from "./Trackers";
import { useApp } from "./AppContext";

/**
 * Compact HP editor for the encounter list: set HP directly, heal (regeneration, repairs...)
 * or deal damage (armor applies; structure damage rolls the check).
 */
export function QuickHp({ c }: { c: CombatantState }) {
  const app = useApp();
  const [amount, setAmount] = useState(0);
  const by = { id: app.session.playerId, name: app.session.playerName };

  const heal = async () => {
    if (amount <= 0) return;
    const hp = Math.min(c.maxHp, c.hp + amount);
    await patchCombatant(c.id, { hp });
    await OBR.notification.show(`${c.name} recupera ${hp - c.hp} PV (${hp}/${c.maxHp}).`, "SUCCESS");
    setAmount(0);
  };

  const damage = async () => {
    if (amount <= 0) return;
    const out = applyDamage(c, amount, {});
    await patchWithChecks(c, out.patch, by);
    await OBR.notification.show(out.log.join(" · "), out.patch.structure !== c.structure ? "WARNING" : "INFO");
    setAmount(0);
  };

  return (
    <div className="quick-hp">
      <span className="tracker-label">PV</span>
      <button className="icon-btn" onClick={() => patchCombatant(c.id, { hp: Math.max(0, c.hp - 1) })} aria-label="Diminuir PV">
        −
      </button>
      <NumberField value={c.hp} onCommit={(v) => patchCombatant(c.id, { hp: Math.min(v, c.maxHp) })} />
      <span className="max">/ {c.maxHp}</span>
      <button className="icon-btn" onClick={() => patchCombatant(c.id, { hp: Math.min(c.maxHp, c.hp + 1) })} aria-label="Aumentar PV">
        +
      </button>
      <span className="spacer" />
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
        Curar
      </button>
      <button className="btn-small ghost danger" disabled={amount <= 0} onClick={() => void damage()} title="Dano cinético (aplica armadura)">
        Dano
      </button>
    </div>
  );
}
