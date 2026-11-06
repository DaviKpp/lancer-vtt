import { useState } from "react";
import type { CombatantState, Sheet } from "../lib/types";
import { GUIDE, TURN_RULES, type GuideAction } from "../lib/actionGuide";
import { blockedReason, COST_LABEL, overchargeCost } from "../lib/actions";
import { rollExpression } from "../lib/dice";
import { applyHeat } from "../lib/rules";
import { getRoomState, patchCombatant } from "../obr/room";
import { takeAction, useReaction } from "../obr/actions";
import { OVERWATCH, REACTION_RULES } from "../lib/reactions";
import { ReactionPanel } from "./ReactionPanel";
import { patchWithChecks } from "../obr/checks";
import { AttackPanel, type AttackSpec } from "./AttackPanel";
import { mechWeaponSpec, npcFeatureSpec, techSpec } from "./attackSpecs";
import { useApp } from "./AppContext";
import { BarragePanel } from "./BarragePanel";
import { notify } from "../obr/toast";

type Mode =
  | { kind: "weapons"; title: string; free: boolean; filter: "noSuperheavy" | "all" }
  | { kind: "attack"; spec: AttackSpec }
  | { kind: "lockon" }
  | { kind: "barrage" }
  | { kind: "stabilize" };

/** Weapons (or NPC weapon features) the combatant can attack with. */
function weaponSpecs(sheet: Sheet | undefined, filter: "noSuperheavy" | "all"): AttackSpec[] {
  if (!sheet) return [];
  if (sheet.kind === "mech") {
    return sheet.mounts
      .flatMap((m) => m.weapons)
      .filter((w) => !w.destroyed && w.damage.length + w.range.length > 0)
      .filter((w) => filter === "all" || !/superheavy/i.test(w.mount))
      .map((w) => mechWeaponSpec(w, sheet));
  }
  return sheet.features
    .filter((f) => f.type === "weapon" && !f.destroyed)
    .filter((f) => filter === "all" || !/superheavy/i.test(f.weaponType ?? ""))
    .map((f) => npcFeatureSpec(f, sheet));
}

/**
 * Quick guide of LANCER actions. With a combatant it becomes interactive: every action
 * shows whether it is still available this turn and can be used/rolled from here.
 */
export function ActionGuide({ c, sheet, editable }: { c?: CombatantState; sheet?: Sheet; editable?: boolean }) {
  const app = useApp();
  const [mode, setMode] = useState<Mode | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const by = { id: app.session.playerId, name: app.session.playerName };
  const interactive = !!c && !!editable;

  const attackBonus = sheet?.kind === "mech" ? sheet.stats.attackBonus : sheet?.kind === "npc" ? sheet.tier : 0;
  // NPCs use their own (simpler) versions of some actions
  const isNpc = c?.kind === "npc" || (!c && sheet?.kind === "npc");
  const tier = sheet?.kind === "npc" ? Math.max(1, Math.min(3, sheet.tier)) : 1;
  const techBonus = sheet?.kind === "mech" ? sheet.stats.techAttack : sheet?.kind === "npc" ? sheet.stats.techAttack : 0;

  const run = async (a: GuideAction) => {
    if (!c) return;
    setMode(null);
    switch (a.run) {
      case "move":
      case "log":
        return takeAction(c, a.cost, a.name, by);
      case "skirmish":
        await takeAction(c, "quick", "Escaramuça", by);
        return setMode({ kind: "weapons", title: "Escaramuça — escolha a arma", free: true, filter: "noSuperheavy" });
      case "barrage":
        // the panel spends the full action when the attacks are rolled
        return setMode({ kind: "barrage" });
      case "overwatch":
        await useReaction(c, OVERWATCH, by);
        return setMode({ kind: "weapons", title: "Vigilância — ataque com uma arma", free: true, filter: "noSuperheavy" });
      case "invade":
        return setMode({ kind: "attack", spec: techSpec("Invadir", techBonus, sheet) });
      case "ram":
        return setMode({
          kind: "attack",
          spec: {
            kind: "attack",
            label: "Investida",
            bonus: attackBonus,
            accuracy: 0,
            cost: "quick",
            notes: [isNpc ? "No acerto: alvo fica Caído" : "No acerto: alvo fica Caído e pode ser empurrado 1 espaço"],
          },
        });
      case "grapple":
        return setMode({
          kind: "attack",
          spec: { kind: "attack", label: "Agarrar", bonus: attackBonus, accuracy: 0, cost: "quick", notes: ["No acerto: ambos Engajados; o menor fica Imobilizado"] },
        });
      case "improvised":
        return setMode({
          kind: "attack",
          spec: {
            kind: "attack",
            label: "Ataque Improvisado",
            bonus: attackBonus,
            accuracy: 0,
            cost: "full",
            // NPC: fixed damage by tier (3 / 4 / 6)
            damage: [{ type: "Kinetic", val: isNpc ? String([3, 4, 6][tier - 1]) : "1d6" }],
          },
        });
      case "lockon":
        return setMode({ kind: "lockon" });
      case "stabilize": {
        if (!isNpc) return setMode({ kind: "stabilize" });
        // NPC Stabilize has no choices: cool down and reload
        const fresh = (await getRoomState()).combatants[c.id] ?? c;
        await patchCombatant(c.id, { heat: 0, st: (fresh.st ?? []).filter((s) => s !== "exposed") });
        return takeAction(fresh, "full", "Estabilizar", by, { detail: "zerou o calor, sem Exposto, recarregou as armas Recarregáveis" });
      }
      case "hide": {
        await takeAction(c, "quick", "Esconder-se", by);
        const fresh = (await getRoomState()).combatants[c.id];
        return patchCombatant(c.id, { st: Array.from(new Set([...(fresh?.st ?? []), "hidden"])) });
      }
      case "overcharge": {
        const fresh = (await getRoomState()).combatants[c.id] ?? c;
        if (fresh.ac?.o) await notify(`${fresh.name} já usou Sobrecarga neste turno.`, "WARNING");
        const uses = fresh.ocn ?? 0;
        const roll = rollExpression(overchargeCost(uses));
        const preview = applyHeat(fresh, roll.total);
        // log first (it throws the heat dice and waits for them), then mark the heat
        await takeAction(fresh, "free", "Sobrecarga", by, {
          detail: `+1 Ação Rápida · ${roll.total} de calor (${roll.detail})${preview.log.length > 1 ? " · " + preview.log.slice(1).join(" · ") : ""}`,
        });
        const now = (await getRoomState()).combatants[c.id] ?? fresh;
        const heat = applyHeat(now, roll.total);
        return patchWithChecks(now, { ...heat.patch, ocn: uses + 1, ac: { ...(now.ac ?? {}), o: true } }, by);
      }
    }
  };

  const who = (a: GuideAction) => !c || a.who === "both" || a.who === c.kind;

  return (
    <div className="action-guide">
      <details className="turn-rules" open={!c}>
        <summary>Como funciona o turno</summary>
        <ul className="plain small">
          {TURN_RULES.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </details>

      {mode && c && (
        <div className="guide-mode">
          {mode.kind === "weapons" && (
            <>
              <div className="row between">
                <strong>{mode.title}</strong>
                <button className="icon-btn" onClick={() => setMode(null)} aria-label="Fechar">
                  ×
                </button>
              </div>
              <div className="quick-attacks">
                {weaponSpecs(sheet, mode.filter).map((spec, i) => (
                  <button key={i} className="btn-small" onClick={() => setMode({ kind: "attack", spec: { ...spec, cost: undefined } })}>
                    ⌖ {spec.label}
                  </button>
                ))}
                {!weaponSpecs(sheet, mode.filter).length && <span className="muted small">Nenhuma arma disponível.</span>}
              </div>
            </>
          )}
          {mode.kind === "attack" && <AttackPanel attacker={c} spec={mode.spec} onClose={() => setMode(null)} />}
          {mode.kind === "lockon" && <LockOn c={c} onDone={() => setMode(null)} />}
          {mode.kind === "barrage" &&
            (sheet ? (
              <BarragePanel c={c} sheet={sheet} onClose={() => setMode(null)} />
            ) : (
              <span className="muted small">Ficha não disponível neste dispositivo.</span>
            ))}
          {mode.kind === "stabilize" && <Stabilize c={c} onDone={() => setMode(null)} />}
        </div>
      )}

      {GUIDE.map((g) => {
        const actions = g.actions.filter(who);
        if (!actions.length) return null;
        const isOpen = open[g.group] ?? !c; // collapsed on sheets / encounter, open in the Ações tab
        const isReactions = actions.every((a) => a.cost === "reaction");
        return (
          <div key={g.group} className="guide-group">
            <button className="guide-group-head" onClick={() => setOpen((o) => ({ ...o, [g.group]: !isOpen }))}>
              <span className="chev">{isOpen ? "▾" : "▸"}</span> {g.group}
            </button>
            {isOpen && isReactions && (
              <ul className="plain small muted">
                {REACTION_RULES.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
            {isOpen && isReactions && c && (
              <ReactionPanel
                c={c}
                sheet={sheet}
                editable={interactive}
                onOverwatch={() =>
                  setMode({ kind: "weapons", title: "Vigilância — Escaramuça com uma arma", free: true, filter: "noSuperheavy" })
                }
              />
            )}
            {isOpen &&
              !(isReactions && c) &&
              actions.map((a) => {
                const blocked = c ? blockedReason(c, a.cost, app.room.encounter?.tk ?? 0) : null;
                return (
                  <div key={a.id} className={`guide-item ${blocked ? "blocked" : ""}`} title={blocked ?? undefined}>
                    <div className="guide-text">
                      <span className="action-name">
                        {a.name} <span className="muted small">({a.en})</span>
                        {COST_LABEL[a.cost] && <span className={`badge cost-${a.cost}`}>{COST_LABEL[a.cost]}</span>}
                      </span>
                      <span className="small muted">{isNpc ? a.npcDesc ?? a.desc : a.desc}</span>
                      {!c && !sheet && a.npcDesc && <span className="small muted npc-rule">NPC: {a.npcDesc}</span>}
                      {blocked && <span className="small warn">{blocked}</span>}
                    </div>
                    {interactive && (
                      <button className={blocked ? "btn-small ghost" : "btn-small"} onClick={() => void run(a)}>
                        {["skirmish", "barrage", "invade", "ram", "grapple", "improvised", "overwatch"].includes(a.run) ? "Rolar" : "Usar"}
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}

function LockOn({ c, onDone }: { c: CombatantState; onDone: () => void }) {
  const app = useApp();
  const targets = app.targetsFor(c.id);
  const [target, setTarget] = useState(targets[0]?.id ?? "");
  const confirm = async () => {
    const t = (await getRoomState()).combatants[target];
    if (!t) return;
    await patchCombatant(t.id, { st: Array.from(new Set([...(t.st ?? []), "lockon"])) });
    await takeAction(c, "quick", "Travar Mira", { id: app.session.playerId, name: app.session.playerName }, { detail: `alvo: ${t.name}` });
    onDone();
  };
  return (
    <div className="stack">
      <strong>Travar Mira — escolha o alvo</strong>
      <div className="row gap">
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="btn-small" disabled={!target} onClick={confirm}>
          Aplicar
        </button>
        <button className="btn-small ghost" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Stabilize({ c, onDone }: { c: CombatantState; onDone: () => void }) {
  const app = useApp();
  const [first, setFirst] = useState<"cool" | "repair">("cool");
  const [second, setSecond] = useState<"reload" | "burn" | "condition" | "ally">("reload");
  const confirm = async () => {
    const fresh = (await getRoomState()).combatants[c.id] ?? c;
    const patch: Partial<CombatantState> = {};
    const notes: string[] = [];
    if (first === "cool") {
      patch.heat = 0;
      patch.st = (fresh.st ?? []).filter((s) => s !== "exposed");
      notes.push("resfriou (calor zerado, sem Exposto)");
    } else {
      if (fresh.kind === "mech" && fresh.repairs <= 0)
        await notify(`${fresh.name} não tem Reparos sobrando.`, "WARNING");
      patch.hp = fresh.maxHp;
      if (fresh.kind === "mech") patch.repairs = Math.max(0, fresh.repairs - 1);
      notes.push("gastou 1 Reparo (PV cheio)");
    }
    if (second === "burn") {
      patch.burn = 0;
      notes.push("removeu a queimadura");
    } else if (second === "reload") notes.push("recarregou as armas");
    else if (second === "condition") notes.push("removeu uma condição (ajuste na ficha)");
    else notes.push("removeu uma condição de um aliado adjacente");
    await patchCombatant(c.id, patch);
    await takeAction(fresh, "full", "Estabilizar", { id: app.session.playerId, name: app.session.playerName }, { detail: notes.join(" · ") });
    onDone();
  };
  return (
    <div className="stack">
      <strong>Estabilizar</strong>
      <label className="check-row">
        <input type="radio" checked={first === "cool"} onChange={() => setFirst("cool")} /> Resfriar: zera o calor e remove Exposto
      </label>
      <label className="check-row">
        <input type="radio" checked={first === "repair"} onChange={() => setFirst("repair")} /> Gastar 1 Reparo: recupera todo o PV
      </label>
      <div className="mount-head">E mais um</div>
      {(
        [
          ["reload", "Recarregar armas Recarregáveis"],
          ["burn", "Remover a queimadura"],
          ["condition", "Remover uma condição sua"],
          ["ally", "Remover uma condição de um aliado adjacente"],
        ] as const
      ).map(([k, label]) => (
        <label key={k} className="check-row">
          <input type="radio" checked={second === k} onChange={() => setSecond(k)} /> {label}
        </label>
      ))}
      <div className="row gap">
        <button className="btn-small" onClick={confirm}>
          Confirmar
        </button>
        <button className="btn-small ghost" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
