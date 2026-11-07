import { useState } from "react";
import type { CombatantState, HitNote, MechSheet } from "../lib/types";
import { rollAccuracy, rollDie } from "../lib/dice";
import { applyDamage, applyHeat } from "../lib/rules";
import { uid } from "../lib/util";
import { skillModifiers, skillValues } from "../obr/skill";
import { confirmAction, takeAction } from "../obr/actions";
import { getRoomState, patchCombatant } from "../obr/room";
import { patchWithChecks } from "../obr/checks";
import { announce } from "../obr/announce";
import { useApp } from "./AppContext";
import { signed } from "./common";

type Option = "distract" | "shred" | "damage";

const OPTIONS: { id: Option; name: string; text: string }[] = [
  { id: "distract", name: "Distrair", text: "O mech fica Prejudicado e Lento até o fim do próximo turno dele." },
  { id: "shred", name: "Rasgar", text: "2 de calor no mech (fiação, painéis...)." },
  { id: "damage", name: "Danificar", text: "4 de dano cinético no mech (juntas, escotilhas...)." },
];

/**
 * JOCKEY (full action, LANCER core p.74): a pilot on foot climbs an adjacent mech — contested check,
 * Grit vs the mech's Hull. On a success pick Distract / Shred / Damage; on later turns, while still
 * on it, pick again as a full action (no new check). Jumping off is part of the pilot's movement.
 */
export function JockeyPanel({ c, sheet }: { c: CombatantState; sheet: MechSheet }) {
  const app = useApp();
  const by = { id: app.session.playerId, name: app.session.playerName };
  const on = c.jk ? app.room.combatants[c.jk] : undefined;
  const mechs = Object.values(app.room.combatants).filter(
    (x) => (x.kind === "mech" || (x.kind === "npc" && !x.bio)) && x.id !== c.pm && x.hp + x.structure > 0,
  );
  const [targetId, setTargetId] = useState("");
  const [option, setOption] = useState<Option>("distract");
  const [busy, setBusy] = useState(false);

  const apply = async (target: CombatantState, opt: Option): Promise<string> => {
    const t = (await getRoomState()).combatants[target.id] ?? target;
    if (opt === "shred") {
      const h = applyHeat(t, 2);
      await patchWithChecks(t, h.patch, by);
      return `Rasgar: +2 de calor em ${t.name}${h.log.length > 1 ? ` (${h.log.slice(1).join("; ")})` : ""}`;
    }
    if (opt === "damage") {
      const d = applyDamage(t, 4, { type: "Kinetic" });
      await patchWithChecks(t, d.patch, by);
      return `Danificar: ${d.log.join(" · ")}`;
    }
    const note: HitNote = {
      id: uid(),
      what: "Montar no Inimigo: Distrair",
      src: c.name,
      srcId: c.id,
      html: OPTIONS[0].text,
      until: "end",
      who: t.id,
    };
    await patchCombatant(t.id, {
      st: Array.from(new Set([...(t.st ?? []), "impaired", "slow"])),
      nts: [...(t.nts ?? []), note],
    });
    return `Distrair: ${t.name} fica Prejudicado e Lento até o fim do próximo turno dele`;
  };

  /** First climb: contested check, then the chosen option. */
  const climb = async () => {
    const target = app.room.combatants[targetId];
    if (!target) return;
    if (!(await confirmAction(c, "full", "Montar no Inimigo"))) return;
    setBusy(true);
    try {
      const pilotMods = skillModifiers(c, "hull").mods.reduce((a, m) => a + m.value, 0);
      const pd = rollDie(20);
      const pa = rollAccuracy(pilotMods);
      const pilotTotal = pd + sheet.pilot.grit + pa.mod;
      const hull = skillValues(app.sheetFor(target.id))?.hull ?? 0;
      const mechMods = skillModifiers(target, "hull");
      const md = rollDie(20);
      const ma = rollAccuracy(mechMods.mods.reduce((a, m) => a + m.value, 0));
      // a Stunned / Shut Down mech automatically fails Hull checks
      const mechTotal = mechMods.autoFail ? -Infinity : md + hull + ma.mod;
      const won = pilotTotal > mechTotal;
      const roll = `${c.name} ${pilotTotal} (d20 ${pd} + Grit ${signed(sheet.pilot.grit)}${pa.mod ? ` ${signed(pa.mod)}` : ""}) contra ${target.name} ${
        mechMods.autoFail ? "falha automática (Atordoado)" : `${mechTotal} (d20 ${md} + Casco ${signed(hull)}${ma.mod ? ` ${signed(ma.mod)}` : ""})`
      }`;
      let detail = `${roll}: ${won ? "subiu no mech" : "não conseguiu subir (empate fica com o mech)"}`;
      if (won) {
        await patchCombatant(c.id, { jk: target.id });
        detail += ` · ${await apply(target, option)}`;
      }
      await takeAction(c, "full", "Montar no Inimigo", by, { detail });
      await announce(`${c.name} ${won ? "montou em" : "falhou ao montar em"} ${target.name}.`, won ? "SUCCESS" : "WARNING");
    } finally {
      setBusy(false);
    }
  };

  /** Already on the mech: another option as a full action, no new check. */
  const again = async () => {
    if (!on) return;
    if (!(await confirmAction(c, "full", "Montar no Inimigo"))) return;
    setBusy(true);
    try {
      const detail = await apply(on, option);
      await takeAction(c, "full", "Montar no Inimigo", by, { detail });
    } finally {
      setBusy(false);
    }
  };

  const optionPicker = (
    <div className="stack">
      {OPTIONS.map((o) => (
        <label key={o.id} className="check-row">
          <input type="radio" checked={option === o.id} onChange={() => setOption(o.id)} /> <b>{o.name}:</b> {o.text}
        </label>
      ))}
    </div>
  );

  return (
    <div className="stack">
      {on ? (
        <>
          <div className="muted small">
            Em cima de <b>{on.name}</b>. Escolha outra opção como Ação Inteira. O mech pode tentar te derrubar com um teste disputado
            (Casco contra o seu Grit) como Ação Inteira.
          </div>
          {optionPicker}
          <div className="row gap wrap">
            <button className="btn-small" disabled={busy} onClick={() => void again()}>
              Usar opção (Ação Inteira)
            </button>
            <button className="btn-small ghost" onClick={() => void patchCombatant(c.id, { jk: undefined })} title="Pular faz parte do seu movimento">
              Descer / foi derrubado
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="muted small">
            Ação Inteira, adjacente a um mech: teste disputado de Grit contra o Casco do mech. Se vencer, sobe nele (divide o espaço e se move junto)
            e escolhe uma opção.
          </div>
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Escolha o mech…</option>
            {mechs.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {optionPicker}
          <button className="btn-small" disabled={busy || !targetId} onClick={() => void climb()}>
            Montar no Inimigo (Ação Inteira)
          </button>
        </>
      )}
    </div>
  );
}
