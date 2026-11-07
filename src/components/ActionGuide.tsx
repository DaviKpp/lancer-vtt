import { useState } from "react";
import type { CombatantState, HitNote, Sheet } from "../lib/types";
import { uid } from "../lib/util";
import { BOLSTER_NOTE } from "../obr/skill";
import { SCAN_ASK_LABEL, type ScanAsk, type ScanReport } from "../lib/scan";
import { requestScan } from "../obr/scan";
import { GUIDE, TURN_RULES, type GuideAction } from "../lib/actionGuide";
import { blockedReason, COST_LABEL, overchargeCost, type ActionCost } from "../lib/actions";
import { rollAccuracy, rollDie, rollExpression } from "../lib/dice";
import { skillModifiers, skillValues, type SkillStat } from "../obr/skill";
import { applyHeat } from "../lib/rules";
import { getRoomState, patchCombatant } from "../obr/room";
import { confirmAction, confirmReaction, takeAction, useReaction } from "../obr/actions";
import { OVERWATCH, REACTION_RULES } from "../lib/reactions";
import { ReactionPanel } from "./ReactionPanel";
import { patchWithChecks } from "../obr/checks";
import { AttackPanel, type AttackSpec } from "./AttackPanel";
import { mechWeaponSpec, npcFeatureSpec, npcInvadeSpec, techSpec } from "./attackSpecs";
import { useApp } from "./AppContext";
import { BarragePanel } from "./BarragePanel";
import { dismount } from "../obr/mount";

type Mode =
  | { kind: "weapons"; title: string; free: boolean; filter: "noSuperheavy" | "all" }
  | { kind: "attack"; spec: AttackSpec }
  | { kind: "lockon"; free?: boolean }
  | { kind: "bolster"; free?: boolean }
  | { kind: "search"; free?: boolean }
  | { kind: "scan"; free?: boolean }
  | { kind: "barrage"; free?: boolean }
  | { kind: "stabilize"; free?: boolean };

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

  /**
   * Runs a guide action. Anything irregular is confirmed first (actions taken right here; attacks
   * are checked by their panel when rolled). `free`: done as a free action (a talent or system
   * allows it), so it spends nothing.
   */
  const run = async (a: GuideAction, free = false) => {
    if (!c) return;
    setMode(null);
    const pay = (cost: ActionCost): ActionCost => (free ? "free" : cost);
    const st = (app.room.combatants[c.id] ?? c).st ?? [];
    switch (a.run) {
      case "move":
      case "log":
        if (!(await confirmAction(c, pay(a.cost), a.name))) return;
        return takeAction(c, pay(a.cost), a.name, by);
      case "skirmish":
        if (!(await confirmAction(c, pay("quick"), "Escaramuça"))) return;
        await takeAction(c, pay("quick"), "Escaramuça", by);
        return setMode({ kind: "weapons", title: "Escaramuça — escolha a arma", free: true, filter: "noSuperheavy" });
      case "barrage":
        // the panel checks and spends the full action when the attacks are rolled
        return setMode({ kind: "barrage", free });
      case "overwatch":
        if (!free) {
          if (!(await confirmReaction(c, OVERWATCH))) return;
          await useReaction(c, OVERWATCH, by);
        }
        return setMode({ kind: "weapons", title: "Vigilância — ataque com uma arma", free: true, filter: "noSuperheavy" });
      case "invade":
        // NPCs Invade with Systems and their own (simpler) effect
        return setMode({
          kind: "attack",
          spec: { ...(sheet?.kind === "npc" ? npcInvadeSpec(sheet) : techSpec("Invadir", techBonus, sheet)), cost: pay("quick") },
        });
      case "ram":
        return setMode({
          kind: "attack",
          spec: {
            kind: "attack",
            label: "Investida",
            basic: true,
            maxTargetSize: sheet?.kind === "mech" || sheet?.kind === "npc" ? sheet.stats.size : undefined,
            bonus: attackBonus,
            accuracy: 0,
            cost: pay("quick"),
            notes: ["No acerto: alvo fica Caído e pode ser empurrado 1 espaço"],
          },
        });
      case "grapple":
        return setMode({
          kind: "attack",
          spec: {
            kind: "attack",
            label: "Agarrar",
            basic: true,
            bonus: attackBonus,
            accuracy: 0,
            cost: pay("quick"),
            notes: ["No acerto: ambos Engajados; nenhum dos dois pode Impulsionar nem reagir enquanto durar; o menor fica Imobilizado (mesmo tamanho: teste de Casco disputado no início do turno)"],
          },
        });
      case "improvised":
        return setMode({
          kind: "attack",
          spec: {
            kind: "attack",
            label: "Ataque Improvisado",
            basic: true,
            bonus: attackBonus,
            accuracy: 0,
            cost: pay("full"),
            // NPC: fixed damage by tier (3 / 4 / 6)
            damage: [{ type: "Kinetic", val: isNpc ? String([3, 4, 6][tier - 1]) : "1d6" }],
          },
        });
      case "lockon":
        return setMode({ kind: "lockon", free });
      case "bolster":
        return setMode({ kind: "bolster", free });
      case "search":
        return setMode({ kind: "search", free });
      case "scan":
        return setMode({ kind: "scan", free });
      case "stabilize": {
        if (!isNpc) return setMode({ kind: "stabilize", free });
        // NPC Stabilize has no choices: cool down and reload
        if (!(await confirmAction(c, pay("full"), "Estabilizar"))) return;
        const fresh = (await getRoomState()).combatants[c.id] ?? c;
        await patchCombatant(c.id, { heat: 0, ul: undefined, st: (fresh.st ?? []).filter((s) => s !== "exposed") });
        return takeAction(fresh, pay("full"), "Estabilizar", by, { detail: "zerou o calor, sem Exposto, recarregou as armas Recarregáveis" });
      }
      case "hide": {
        const extra = st.includes("engaged") ? ["Engajado: não dá para se esconder enquanto estiver adjacente a um inimigo"] : [];
        if (!(await confirmAction(c, pay("quick"), "Esconder-se", extra))) return;
        await takeAction(c, pay("quick"), "Esconder-se", by);
        const fresh = (await getRoomState()).combatants[c.id];
        return patchCombatant(c.id, { st: Array.from(new Set([...(fresh?.st ?? []), "hidden"])) });
      }
      case "eject":
        if (sheet?.kind !== "mech") return;
        return dismount(c, sheet, by, { eject: true });
      case "shutdown": {
        if (!(await confirmAction(c, pay("quick"), a.name))) return;
        await takeAction(c, pay("quick"), a.name, by, { detail: "calor zerado, sem Exposto nem Mira Travada; Atordoado e imune a tech até Ligar" });
        const fresh = (await getRoomState()).combatants[c.id] ?? c;
        // statuses from tech actions end (Lock On is the common one)
        const st = (fresh.st ?? []).filter((s) => s !== "exposed" && s !== "lockon");
        return patchCombatant(c.id, { heat: 0, st: Array.from(new Set([...st, "shut-down"])) });
      }
      case "bootup": {
        if (!(await confirmAction(c, pay("full"), a.name))) return;
        await takeAction(c, pay("full"), a.name, by, { detail: "o mech deixa de estar Desligado" });
        const fresh = (await getRoomState()).combatants[c.id] ?? c;
        return patchCombatant(c.id, { st: (fresh.st ?? []).filter((s) => s !== "shut-down") });
      }
      case "overcharge": {
        const fresh = (await getRoomState()).combatants[c.id] ?? c;
        const extra = [
          ...(fresh.ac?.o ? ["A Sobrecarga já foi usada neste turno (1 por turno)"] : []),
          ...(fresh.br === 2 ? ["Preparado: não pode usar Sobrecarga neste turno"] : []),
        ];
        if (!(await confirmAction(fresh, "free", "Sobrecarga", extra))) return;
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
          {mode.kind === "lockon" && <LockOn c={c} free={!!mode.free} onDone={() => setMode(null)} />}
          {mode.kind === "scan" && <Scan c={c} free={!!mode.free} onDone={() => setMode(null)} />}
          {mode.kind === "search" && <Search c={c} sheet={sheet} free={!!mode.free} onDone={() => setMode(null)} />}
          {mode.kind === "bolster" && <Bolster c={c} free={!!mode.free} onDone={() => setMode(null)} />}
          {mode.kind === "barrage" &&
            (sheet ? (
              <BarragePanel c={c} sheet={sheet} charge={!mode.free} onClose={() => setMode(null)} />
            ) : (
              <span className="muted small">Ficha não disponível neste dispositivo.</span>
            ))}
          {mode.kind === "stabilize" && <Stabilize c={c} free={!!mode.free} onDone={() => setMode(null)} />}
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
                      <div className="guide-buttons">
                        <button className={blocked ? "btn-small ghost" : "btn-small"} onClick={() => void run(a)}>
                          {["skirmish", "barrage", "invade", "ram", "grapple", "improvised", "overwatch"].includes(a.run) ? "Rolar" : "Usar"}
                        </button>
                        {a.cost !== "free" && a.cost !== "none" && (
                          <button
                            className="btn-small ghost"
                            title="Usar como ação livre (quando um talento, sistema ou efeito permite): não gasta a ação"
                            onClick={() => void run(a, true)}
                          >
                            Livre
                          </button>
                        )}
                      </div>
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

/**
 * SCAN (quick tech): a character within Sensors and line of sight; ask for its weapons, systems and full
 * statistics, one piece of hidden information, or generic information. The GM's copy of the sheet answers.
 */
function Scan({ c, free, onDone }: { c: CombatantState; free: boolean; onDone: () => void }) {
  const app = useApp();
  const others = Object.values(app.room.combatants).filter((x) => x.id !== c.id);
  const [target, setTarget] = useState(others[0]?.id ?? "");
  const [ask, setAsk] = useState<ScanAsk>("stats");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [noGm, setNoGm] = useState(false);
  const by = { id: app.session.playerId, name: app.session.playerName };

  const scan = async () => {
    const t = (await getRoomState()).combatants[target];
    if (!t) return;
    const cost = free ? "free" : "quick";
    const extra = t.st?.includes("hidden") ? [`${t.name} está Oculto: não pode ser alvo direto`] : [];
    if (!(await confirmAction(c, cost, "Escanear", extra))) return;
    setBusy(true);
    try {
      await takeAction(c, cost, "Escanear", by, { detail: `alvo: ${t.name} — ${SCAN_ASK_LABEL[ask]}${question.trim() ? ` (“${question.trim()}”)` : ""}` });
      const r = await requestScan(c.name, t, ask, question.trim() || undefined);
      setNoGm(!r?.gm);
      setReport(
        r?.report ?? {
          title: `Escaneamento de ${t.name}`,
          sections: [{ title: "Sem resposta", items: ["O Mestre não está na sala: pergunte a ele diretamente."] }],
        },
      );
    } finally {
      setBusy(false);
    }
  };

  if (report) {
    return (
      <div className="stack scan-report">
        <div className="row gap" style={{ justifyContent: "space-between" }}>
          <strong>{report.title}</strong>
          <button className="icon-btn" onClick={onDone} aria-label="Fechar">
            ×
          </button>
        </div>
        {report.sections.map((s) => (
          <div key={s.title}>
            <div className="muted small">{s.title}</div>
            <ul className="plain">
              {s.items.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        ))}
        {noGm && ask === "stats" && (
          <span className="muted small">Só os dados da sala: o Mestre não respondeu (precisa estar na sala para mandar a ficha completa).</span>
        )}
        <span className="muted small">As informações valem para o momento do escaneamento (não atualizam depois).</span>
      </div>
    );
  }

  return (
    <div className="stack">
      <strong>Escanear — um personagem nos Sensores e na linha de visão</strong>
      <select value={target} onChange={(e) => setTarget(e.target.value)}>
        {others.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      {(Object.keys(SCAN_ASK_LABEL) as ScanAsk[]).map((k) => (
        <label key={k} className="check-row">
          <input type="radio" checked={ask === k} onChange={() => setAsk(k)} /> {SCAN_ASK_LABEL[k]}
        </label>
      ))}
      {ask !== "stats" && (
        <input placeholder="O que você quer saber? (opcional)" value={question} onChange={(e) => setQuestion(e.target.value)} />
      )}
      <div className="row gap">
        <button className="btn-small" disabled={!target || busy} onClick={() => void scan()}>
          {busy ? "Escaneando…" : "Escanear"}
        </button>
        <button className="btn-small ghost" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** A character's Systems / Agility for contested checks: mech skills, NPC stats, Grit on foot. */
function contestValue(c: CombatantState, sheet: Sheet | undefined, stat: "sys" | "agi"): number {
  if (c.kind === "pilot" && sheet?.kind === "mech") return sheet.pilot.grit;
  return skillValues(sheet)?.[stat] ?? 0;
}

/**
 * SEARCH (quick): contested Systems check against a Hidden character's Agility (a pilot on foot uses
 * Grit, within Range 5). If the searcher wins, the character loses HIDDEN.
 */
function Search({ c, sheet, free, onDone }: { c: CombatantState; sheet?: Sheet; free: boolean; onDone: () => void }) {
  const app = useApp();
  const hidden = Object.values(app.room.combatants).filter((x) => x.id !== c.id && x.st?.includes("hidden"));
  const [target, setTarget] = useState(hidden[0]?.id ?? "");
  const confirm = async () => {
    const t = (await getRoomState()).combatants[target];
    if (!t) return;
    const cost = free ? "free" : "quick";
    if (!(await confirmAction(c, cost, "Procurar"))) return;
    const net = (x: CombatantState, stat: SkillStat) => skillModifiers(x, stat).mods.reduce((a, m) => a + m.value, 0);
    const mine = contestValue(c, sheet, "sys");
    const theirs = contestValue(t, app.sheetFor(t.id), "agi");
    const d1 = rollDie(20);
    const a1 = rollAccuracy(net(c, "sys"));
    const d2 = rollDie(20);
    const a2 = rollAccuracy(net(t, "agi"));
    const tFail = skillModifiers(t, "agi").autoFail;
    const me = d1 + mine + a1.mod;
    const them = tFail ? -Infinity : d2 + theirs + a2.mod;
    const found = me > them;
    if (found) await patchCombatant(t.id, { st: (t.st ?? []).filter((s) => s !== "hidden") });
    await takeAction(c, cost, "Procurar", { id: app.session.playerId, name: app.session.playerName }, {
      detail: `${me} (d20 ${d1} + ${c.kind === "pilot" ? "Grit" : "Sistemas"} ${mine}${a1.mod ? ` ${a1.mod > 0 ? "+" : ""}${a1.mod}` : ""}) contra ${t.name} ${
        tFail ? "falha automática (Atordoado)" : `${them} (d20 ${d2} + Agilidade ${theirs}${a2.mod ? ` ${a2.mod > 0 ? "+" : ""}${a2.mod}` : ""})`
      }: ${found ? `${t.name} foi encontrado e deixou de estar Oculto` : "não encontrou (empate fica com quem se esconde)"}`,
    });
    onDone();
  };
  return (
    <div className="stack">
      <strong>Procurar — teste disputado de Sistemas contra a Agilidade do alvo{c.kind === "pilot" ? " (a pé: Grit, Alcance 5)" : " (dentro dos Sensores)"}</strong>
      {hidden.length === 0 && <span className="muted small">Ninguém está marcado como Oculto.</span>}
      <div className="row gap">
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          {hidden.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="btn-small" disabled={!target} onClick={confirm}>
          Rolar
        </button>
        <button className="btn-small ghost" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** BOLSTER (quick tech): a character within Sensors gets +2 on its next skill check or save until the end of its next turn. */
function Bolster({ c, free, onDone }: { c: CombatantState; free: boolean; onDone: () => void }) {
  const app = useApp();
  const others = Object.values(app.room.combatants).filter((x) => x.id !== c.id);
  const [target, setTarget] = useState(others[0]?.id ?? "");
  const confirm = async () => {
    const t = (await getRoomState()).combatants[target];
    if (!t) return;
    const cost = free ? "free" : "quick";
    const extra = t.bl ? [`${t.name} já está Reforçado (só um Reforçar por vez)`] : [];
    if (!(await confirmAction(c, cost, "Reforçar", extra))) return;
    const note: HitNote = {
      id: uid(),
      what: BOLSTER_NOTE,
      src: c.name,
      srcId: c.id,
      html: "+2 no próximo teste de perícia ou salvaguarda (some ao rolar).",
      until: "end",
      who: t.id,
    };
    const nts = [...(t.nts ?? []).filter((n) => n.what !== BOLSTER_NOTE), note];
    await patchCombatant(t.id, { bl: 1, nts });
    await takeAction(c, cost, "Reforçar", { id: app.session.playerId, name: app.session.playerName }, { detail: `alvo: ${t.name} (+2 no próximo teste ou salvaguarda)` });
    onDone();
  };
  return (
    <div className="stack">
      <strong>Reforçar — escolha um personagem ao alcance dos Sensores</strong>
      <div className="row gap">
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          {others.map((t) => (
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

function LockOn({ c, free, onDone }: { c: CombatantState; free: boolean; onDone: () => void }) {
  const app = useApp();
  const targets = app.targetsFor(c.id);
  const [target, setTarget] = useState(targets[0]?.id ?? "");
  const confirm = async () => {
    const t = (await getRoomState()).combatants[target];
    if (!t) return;
    const cost = free ? "free" : "quick";
    if (!(await confirmAction(c, cost, "Travar Mira"))) return;
    await patchCombatant(t.id, { st: Array.from(new Set([...(t.st ?? []), "lockon"])) });
    await takeAction(c, cost, "Travar Mira", { id: app.session.playerId, name: app.session.playerName }, { detail: `alvo: ${t.name}` });
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

function Stabilize({ c, free, onDone }: { c: CombatantState; free: boolean; onDone: () => void }) {
  const app = useApp();
  const [first, setFirst] = useState<"cool" | "repair">("cool");
  const [second, setSecond] = useState<"reload" | "burn" | "condition" | "ally">("reload");
  const confirm = async () => {
    const fresh = (await getRoomState()).combatants[c.id] ?? c;
    const cost = free ? "free" : "full";
    const extra = first === "repair" && fresh.kind === "mech" && fresh.repairs <= 0 ? [`${fresh.name} não tem Reparos sobrando`] : [];
    if (!(await confirmAction(fresh, cost, "Estabilizar", extra))) return;
    const patch: Partial<CombatantState> = {};
    const notes: string[] = [];
    if (first === "cool") {
      patch.heat = 0;
      patch.st = (fresh.st ?? []).filter((s) => s !== "exposed");
      notes.push("resfriou (calor zerado, sem Exposto)");
    } else {
      patch.hp = fresh.maxHp;
      if (fresh.kind === "mech") patch.repairs = Math.max(0, fresh.repairs - 1);
      notes.push("gastou 1 Reparo (PV cheio)");
    }
    if (second === "burn") {
      patch.burn = 0;
      notes.push("removeu a queimadura");
    } else if (second === "reload") {
      patch.ul = undefined;
      notes.push("recarregou as armas");
    }
    else if (second === "condition") notes.push("removeu uma condição (ajuste na ficha)");
    else notes.push("removeu uma condição de um aliado adjacente");
    await patchCombatant(c.id, patch);
    await takeAction(fresh, cost, "Estabilizar", { id: app.session.playerId, name: app.session.playerName }, { detail: notes.join(" · ") });
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
